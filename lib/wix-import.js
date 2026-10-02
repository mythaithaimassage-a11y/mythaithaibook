export const MAX_WIX_CSV_BYTES = 3 * 1024 * 1024;
export const MAX_WIX_QUERY_BYTES = 8 * 1024 * 1024;

export function invalidWixImport(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function parseWixCsv(csv) {
  if (typeof csv !== 'string' || !csv.trim()) throw invalidWixImport('Choose a non-empty Wix CSV.');
  if (Buffer.byteLength(csv, 'utf8') > MAX_WIX_CSV_BYTES) throw invalidWixImport('The CSV must be 3 MiB or smaller. Split larger exports before importing.');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  const finishField = () => {
    row.push(field);
    field = '';
    closedQuote = false;
  };
  const finishRow = () => {
    finishField();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
    if (rows.length > 10001) throw invalidWixImport('Import at most 10000 records per CSV.');
  };
  const text = csv.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else field += char;
    } else if (char === ',') finishField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      finishRow();
    } else if (char === '"' && !field && !closedQuote) quoted = true;
    else {
      if (closedQuote || char === '"') throw invalidWixImport('Malformed CSV quoting. Export the records again from Wix.');
      field += char;
    }
  }
  if (quoted) throw invalidWixImport('The CSV has an unterminated quoted field.');
  if (field || row.length || closedQuote) finishRow();
  return rows;
}

export function wixQueryBatches(records, fields, recordLabel) {
  const batches = [];
  let batch = [];
  let bytes = 16384;
  for (const record of records) {
    // Include BigQuery's wire-format overhead and conservatively stringify numbers.
    const recordBytes = Buffer.byteLength(JSON.stringify({
      structValues: Object.fromEntries(fields.map((name) => [name, { value: String(record[name]) }])),
    })) + 1;
    if (recordBytes + 16384 > MAX_WIX_QUERY_BYTES) {
      throw invalidWixImport(`One ${recordLabel} is too large to import. Remove excessively large field values and retry.`);
    }
    if (bytes + recordBytes > MAX_WIX_QUERY_BYTES) {
      batches.push(batch);
      batch = [];
      bytes = 16384;
    }
    batch.push(record);
    bytes += recordBytes;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function insertWixBatches(bigquery, { batches, fields, tableRef, key, label, updateFields = [], updateCondition = '', detailed = false }) {
  let inserted = 0;
  let updated = 0;
  let completedBatches = 0;
  const names = fields.map(({ name }) => name);
  try {
    for (const records of batches) {
      const [job] = await bigquery.createQueryJob({
        query: `MERGE ${tableRef} AS target USING UNNEST(@records) AS source
          ON target.${key} = source.${key}
          ${updateFields.length ? `WHEN MATCHED AND ${updateCondition} THEN UPDATE SET ${updateFields.map((name) => `${name} = source.${name}`).join(', ')}` : ''}
          WHEN NOT MATCHED THEN INSERT (${names.join(', ')})
          VALUES (${names.map((name) => `source.${name}`).join(', ')})`,
        params: { records },
        types: { records: [Object.fromEntries(fields.map(({ name, type }) => [name, type]))] },
      });
      await job.getQueryResults();
      const [metadata] = await job.getMetadata();
      const affected = Number(metadata.statistics?.query?.numDmlAffectedRows);
      if (!Number.isSafeInteger(affected) || affected < 0 || affected > records.length) throw new Error('The last batch row count could not be verified.');
      if (detailed) {
        const stats = metadata.statistics?.query?.dmlStats;
        const added = Number(stats?.insertedRowCount);
        const changed = Number(stats?.updatedRowCount);
        if (!Number.isSafeInteger(added) || !Number.isSafeInteger(changed) || added < 0 || changed < 0 || added + changed !== affected) throw new Error('The inserted/updated row counts could not be verified.');
        inserted += added;
        updated += changed;
      } else inserted += affected;
      completedBatches += 1;
    }
  } catch (error) {
    throw new Error(`Import incomplete: ${inserted} new ${label} confirmed in ${completedBatches} of ${batches.length} batches.${detailed ? ` ${updated} existing records updated.` : ''} ${error.message || 'BigQuery write failed.'} Refresh the list and retry the CSV; already imported records will be skipped.`, { cause: error });
  }
  return detailed ? { imported: inserted, updated } : inserted;
}
