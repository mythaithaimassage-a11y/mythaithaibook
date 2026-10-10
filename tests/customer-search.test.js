import assert from 'node:assert/strict';
import test from 'node:test';
import { BigQuery } from '@google-cloud/bigquery';
import { searchBookingCustomers } from '../lib/customer-search.js';

const config = { projectId: 'test-project', datasetId: 'booking_system', tableId: 'bookings', wixContactsTableId: 'wix_contacts' };
function fixture(exists = true) {
  const queries = [];
  let checks = 0;
  const customers = [{ name: 'Alice', email: 'alice@example.com', phone: '+1 (437) 898-7424' }];
  return {
    queries, customers, get checks() { return checks; },
    bigquery: {
      dataset: () => ({ table: () => ({ exists: async () => { checks += 1; return [exists]; } }) }),
      query: async (options) => { queries.push(options); return [customers]; },
    },
  };
}

test('customer search uses bounded parameterized name/email search and deduplicates identities', async () => {
  const f = fixture();
  const result = await searchBookingCustomers(f.bigquery, { ...config, search: '  ALICE@Example.com  ' });
  assert.deepEqual(result.customers, f.customers);
  assert.equal(f.queries[0].params.search, 'alice@example.com');
  assert.equal(f.queries[0].params.phoneSearch, '');
  const query = f.queries[0].query;
  assert.match(query, /STRPOS\(LOWER\(name\), @search\)/);
  assert.match(query, /STRPOS\(email, @search\)/);
  assert.match(query, /PARTITION BY identity ORDER BY priority, updated_at DESC/);
  assert.match(query, /UNION ALL/);
  assert.match(query, /SELECT name, email, phone FROM matches/);
  assert.match(query, /LIMIT 8$/);
  assert.doesNotMatch(query, /CREATE|ALTER|INSERT|DELETE|patient_history/);
});

test('formatted phone searches normalize digits without treating digits inside names/emails as phone queries', async () => {
  for (const [search, digits] of [['+1 (437) 898-7424', '14378987424'], ['8987424', '8987424'], ['Alice 12', ''], ['alice12@example.com', '']]) {
    const f = fixture();
    await searchBookingCustomers(f.bigquery, { ...config, search });
    assert.equal(f.queries[0].params.phoneSearch, digits);
    assert.match(f.queries[0].query, /REGEXP_REPLACE\(phone, r'\[\^0-9\]', ''\), @phoneSearch/);
  }
});

test('branch staff search only assigned booking branches and never read global Wix contacts', async () => {
  for (const branchNames of [new Set(['central']), new Set()]) {
    const f = fixture();
    await searchBookingCustomers(f.bigquery, { ...config, search: 'Alice', branchNames });
    assert.equal(f.checks, 0);
    assert.match(f.queries[0].query, /LOWER\(TRIM\(branch_name\)\) IN UNNEST\(@branchNames\)/);
    assert.doesNotMatch(f.queries[0].query, /wix_contacts|UNION ALL/);
    assert.deepEqual(f.queries[0].params.branchNames, [...branchNames]);
    assert.deepEqual(f.queries[0].types.branchNames, ['STRING']);
    BigQuery.valueToQueryParameter_(f.queries[0].params.branchNames, f.queries[0].types.branchNames);
  }
});

test('missing optional Wix contacts table is not created; storage failures are not hidden', async () => {
  const f = fixture(false);
  await searchBookingCustomers(f.bigquery, { ...config, search: 'Alice' });
  assert.doesNotMatch(f.queries[0].query, /wix_contacts/);
  f.bigquery.query = async () => { throw new Error('Storage unavailable'); };
  await assert.rejects(searchBookingCustomers(f.bigquery, { ...config, search: 'Alice' }), /Storage unavailable/);
});

test('invalid search/configuration fails before database reads', async () => {
  const f = fixture();
  for (const search of [undefined, '', '   ', [], 'x'.repeat(151)]) {
    await assert.rejects(searchBookingCustomers(f.bigquery, { ...config, search }), { statusCode: 400 });
  }
  await assert.rejects(searchBookingCustomers(f.bigquery, { ...config, tableId: 'bad`table', search: 'Alice' }), /configuration/);
  assert.equal(f.checks, 0);
  assert.equal(f.queries.length, 0);
});
