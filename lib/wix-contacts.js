import crypto from 'node:crypto';
import { parseWixCsv, wixQueryBatches, insertWixBatches } from './wix-import.js';
export { MAX_WIX_CSV_BYTES, MAX_WIX_QUERY_BYTES } from './wix-import.js';
import { MAX_WIX_CSV_BYTES } from './wix-import.js';

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export const WIX_CONTACT_FIELDS = [
  'contact_id', 'name', 'first_name', 'last_name', 'email', 'phone',
  'emails_json', 'phones_json', 'addresses_json', 'labels', 'wix_created_at',
  'email_subscriber_status', 'sms_subscriber_status', 'last_activity',
  'last_activity_at', 'source', 'language', 'linked_locations',
  'source_fields_json', 'imported_at',
];

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function wixTimestamp(value) {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return '';
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] || '00'}.000Z`;
  const date = new Date(iso);
  return !Number.isNaN(date.getTime()) && date.toISOString() === iso ? iso : '';
}

export function prepareWixContacts(csv, importedAt = new Date().toISOString()) {
  if (typeof csv !== 'string' || !csv.trim()) throw invalid('Choose a non-empty Wix contacts CSV.');
  if (Buffer.byteLength(csv, 'utf8') > MAX_WIX_CSV_BYTES) throw invalid('The CSV must be 3 MiB or smaller. Split larger exports before importing.');
  const [rawHeaders, ...rows] = parseWixCsv(csv);
  if (!rawHeaders) throw invalid('The CSV is empty.');
  const headers = rawHeaders.map((header) => header.trim());
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) {
    throw invalid('CSV column headers must be non-empty and unique.');
  }
  for (const header of ['First Name', 'Last Name', 'Email 1', 'Phone 1', 'Email subscriber status']) {
    if (!headers.includes(header)) throw invalid(`Missing Wix column: ${header}. Use the Wix contacts CSV export.`);
  }
  if (!rows.length) throw invalid('The CSV contains no contact rows.');
  const contacts = new Map();
  const issues = [];
  let invalidRows = 0;
  let duplicates = 0;
  let invalidDates = 0;
  const report = (row, message) => {
    if (issues.length < 20) issues.push({ row, message });
  };
  rows.forEach((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== headers.length) {
      invalidRows += 1;
      report(rowNumber, `Expected ${headers.length} columns, found ${values.length}.`);
      return;
    }
    const original = Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    const value = (header) => (original[header] || '').trim();
    const emails = headers.filter((header) => /^Email \d+$/.test(header))
      .map((header) => value(header).toLowerCase()).filter(Boolean);
    const phones = headers.filter((header) => /^Phone \d+$/.test(header))
      .map((header) => value(header).replace(/^'/, '')).filter(Boolean);
    const email = emails.find((item) => EMAIL_PATTERN.test(item)) || '';
    const phone = phones.find((item) => {
      const digits = item.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15;
    }) || '';
    if (!email && !phone) {
      invalidRows += 1;
      report(rowNumber, 'No valid email address or phone number; row skipped.');
      return;
    }
    const identity = email ? `email:${email}` : `phone:${phone.replace(/\D/g, '')}`;
    const contactId = `wix-${crypto.createHash('sha256').update(identity).digest('hex')}`;
    if (contacts.has(contactId)) {
      duplicates += 1;
      report(rowNumber, 'Duplicate primary email/phone in this CSV; first occurrence retained.');
      return;
    }
    const addresses = [];
    for (let number = 1; number <= 20; number += 1) {
      const prefix = `Address ${number} - `;
      const fields = Object.fromEntries(headers.filter((header) => header.startsWith(prefix))
        .map((header) => [header.slice(prefix.length), value(header)]).filter(([, item]) => item));
      if (Object.keys(fields).length) addresses.push(fields);
    }
    const createdAt = wixTimestamp(value('Created At (UTC+0)'));
    const activityAt = wixTimestamp(value('Last Activity Date (UTC+0)'));
    if ((value('Created At (UTC+0)') && !createdAt) || (value('Last Activity Date (UTC+0)') && !activityAt)) {
      invalidDates += 1;
      report(rowNumber, 'Unrecognized UTC date retained in source fields; normalized date left blank.');
    }
    const firstName = value('First Name');
    const lastName = value('Last Name');
    contacts.set(contactId, {
      contact_id: contactId,
      name: [firstName, lastName].filter(Boolean).join(' '),
      first_name: firstName,
      last_name: lastName,
      email, phone,
      emails_json: JSON.stringify([...new Set(emails)]),
      phones_json: JSON.stringify([...new Set(phones)]),
      addresses_json: JSON.stringify(addresses),
      labels: value('Labels'),
      wix_created_at: createdAt,
      email_subscriber_status: value('Email subscriber status'),
      sms_subscriber_status: value('SMS subscriber status'),
      last_activity: value('Last Activity'),
      last_activity_at: activityAt,
      source: value('Source'),
      language: value('Language'),
      linked_locations: value('Linked Locations'),
      source_fields_json: JSON.stringify(original),
      imported_at: importedAt,
    });
  });
  return {
    contacts: [...contacts.values()],
    summary: { totalRows: rows.length, validContacts: contacts.size, invalidRows, duplicates, invalidDates, issues },
  };
}

export function createWixContactStore(bigquery, { projectId, datasetId, tableId = 'wix_contacts', forbiddenTables = [] }) {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId) || !/^\w+$/.test(datasetId) || !/^\w+$/.test(tableId)) {
    throw new Error('Invalid BigQuery Wix contacts table configuration.');
  }
  if (forbiddenTables.includes(tableId)) throw new Error('Wix contacts must use a separate table, not an existing application table.');
  const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;
  const table = bigquery.dataset(datasetId).table(tableId);
  const ensure = async () => {
    const dataset = bigquery.dataset(datasetId);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) {
      try {
        await bigquery.createDataset(datasetId, { location: process.env.BIGQUERY_LOCATION || 'US' });
      } catch (error) {
        if (error.code !== 409) throw error;
      }
    }
    const [exists] = await table.exists();
    if (!exists) {
      try {
        await dataset.createTable(tableId, {
          schema: WIX_CONTACT_FIELDS.map((name) => ({ name, type: 'STRING', mode: name === 'contact_id' ? 'REQUIRED' : 'NULLABLE' })),
        });
      } catch (error) {
        if (error.code !== 409) throw error;
      }
    }
    const [metadata] = await table.getMetadata();
    const fields = metadata.schema?.fields || [];
    if (WIX_CONTACT_FIELDS.some((name) => !fields.some((field) => field.name === name && field.type === 'STRING' && field.mode !== 'REPEATED')) ||
        fields.some((field) => field.mode === 'REQUIRED' && !WIX_CONTACT_FIELDS.includes(field.name))) {
      throw new Error('The Wix contacts table has an incompatible schema. No schema or data was changed.');
    }
  };
  return {
    async importContacts(contacts) {
      if (!contacts.length) return 0;
      const batches = wixQueryBatches(contacts, WIX_CONTACT_FIELDS, 'contact');
      await ensure();
      return insertWixBatches(bigquery, {
        batches, fields: WIX_CONTACT_FIELDS.map((name) => ({ name, type: 'STRING' })),
        tableRef, key: 'contact_id', label: 'contacts',
      });
    },
    async list({ search = '', offset = 0 } = {}) {
      await ensure();
      if (typeof search !== 'string' || search.length > 200 || !Number.isSafeInteger(offset) || offset < 0) {
        throw invalid('Search must be at most 200 characters and offset must be a non-negative integer.');
      }
      const where = "WHERE STRPOS(LOWER(CONCAT(COALESCE(name, ''), ' ', COALESCE(emails_json, ''), ' ', COALESCE(phones_json, ''), ' ', COALESCE(labels, ''))), LOWER(@search)) > 0";
      const [[contacts], [counts]] = await Promise.all([
        bigquery.query({
          query: `SELECT * FROM ${tableRef} ${where} ORDER BY name, contact_id LIMIT 50 OFFSET @offset`,
          params: { search: search.trim(), offset },
        }),
        bigquery.query({ query: `SELECT COUNT(*) AS total FROM ${tableRef} ${where}`, params: { search: search.trim() } }),
      ]);
      return { contacts, total: Number(counts[0].total), offset, limit: 50 };
    },
  };
}
