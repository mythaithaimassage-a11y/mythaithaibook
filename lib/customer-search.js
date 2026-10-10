export async function searchBookingCustomers(bigquery, {
  projectId, datasetId, tableId, wixContactsTableId = '', branchNames = null, search,
}) {
  if (typeof search !== 'string' || !search.trim() || search.length > 150) {
    throw Object.assign(new Error('Enter a name, email or phone number (up to 150 characters).'), { statusCode: 400 });
  }
  if (!/^[\w-]+$/.test(projectId) || !/^\w+$/.test(datasetId) || !/^\w+$/.test(tableId) ||
      (wixContactsTableId && (!/^\w+$/.test(wixContactsTableId) || wixContactsTableId === tableId))) {
    throw new Error('Invalid customer search table configuration.');
  }
  const ref = (table) => `\`${projectId}.${datasetId}.${table}\``;
  const sources = [
    `SELECT customer_name AS name, email, phone, created_at AS updated_at, 0 AS priority
     FROM ${ref(tableId)}${branchNames === null ? '' : ' WHERE LOWER(TRIM(branch_name)) IN UNNEST(@branchNames)'}`,
  ];
  if (branchNames === null && wixContactsTableId) {
    const [exists] = await bigquery.dataset(datasetId).table(wixContactsTableId).exists();
    if (exists) sources.push(`SELECT name, email, phone, imported_at AS updated_at, 1 AS priority FROM ${ref(wixContactsTableId)}`);
  }
  const [customers] = await bigquery.query({
    query: `WITH customers AS (${sources.join(' UNION ALL ')}),
      normalized AS (
        SELECT TRIM(COALESCE(name, '')) AS name, LOWER(TRIM(COALESCE(email, ''))) AS email,
          TRIM(COALESCE(phone, '')) AS phone, updated_at, priority
        FROM customers
      ),
      matches AS (
        SELECT *, CASE WHEN email != '' THEN CONCAT('email:', email)
          ELSE CONCAT('phone:', REGEXP_REPLACE(phone, r'[^0-9]', '')) END AS identity
        FROM normalized
        WHERE (email != '' OR phone != '') AND (
          STRPOS(LOWER(name), @search) > 0 OR STRPOS(email, @search) > 0
          OR STRPOS(LOWER(phone), @search) > 0
          OR (@phoneSearch != '' AND STRPOS(REGEXP_REPLACE(phone, r'[^0-9]', ''), @phoneSearch) > 0)
        )
      )
      SELECT name, email, phone FROM matches
      QUALIFY ROW_NUMBER() OVER (PARTITION BY identity ORDER BY priority, updated_at DESC, name, phone) = 1
      ORDER BY CASE WHEN LOWER(name) = @search OR email = @search THEN 0 ELSE 1 END, name, email, phone
      LIMIT 8`,
    params: {
      search: search.trim().toLowerCase(),
      phoneSearch: /^[+\d\s().-]+$/.test(search.trim()) ? search.replace(/\D/g, '') : '',
      ...(branchNames === null ? {} : { branchNames: [...branchNames] }),
    },
    ...(branchNames === null ? {} : { types: { branchNames: ['STRING'] } }),
  });
  return { customers };
}
