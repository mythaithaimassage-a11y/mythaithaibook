import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import { createWixContactStore, prepareWixContacts, WIX_CONTACT_FIELDS, MAX_WIX_CSV_BYTES, MAX_WIX_QUERY_BYTES } from '../lib/wix-contacts.js';
import { createDashboardChallengeStore, handleDashboardChallengeQuery, readDashboardOtp } from './helpers/dashboard-auth.js';

const headers = [
  'First Name', 'Last Name', 'Email 1', 'Email 2', 'Phone 1', 'Phone 2',
  'Address 1 - Street', 'Address 1 - State/Region', 'Address 1 - Zip', 'Address 1 - Country',
  'Labels', 'Created At (UTC+0)', 'Email subscriber status', 'SMS subscriber status',
  'Last Activity', 'Last Activity Date (UTC+0)', 'Source', 'Language', 'Linked Locations',
];
const makeCsv = (records) => [headers, ...records.map((record) => headers.map((header) => record[header] || ''))]
  .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n');

test('maps Wix fields, multiple values and UTC dates without inventing consent or clinical data', () => {
  const csv = makeCsv([{
    'First Name': 'Jane', 'Last Name': 'Doe', 'Email 1': ' JANE@EXAMPLE.COM ',
    'Email 2': 'second@example.com', 'Phone 1': "'+1 416-555-0100", 'Phone 2': '9055550101',
    'Address 1 - Street': '1 Test St, Unit 2', 'Address 1 - Country': 'Canada',
    'Address 1 - State/Region': 'Ontario', 'Address 1 - Zip': 'A1A 1A1',
    Labels: 'A "quoted" label\nsecond line', 'Created At (UTC+0)': '2019-10-19 04:55',
    'Email subscriber status': 'Never subscribed', 'SMS subscriber status': 'Unsubscribed',
    'Last Activity': 'Booked a session', 'Last Activity Date (UTC+0)': '2020-01-01 12:30',
    Source: 'Site Members', Language: 'en', 'Linked Locations': 'Test clinic, Ontario',
  }]);
  const { contacts, summary } = prepareWixContacts(`\uFEFF${csv}`, '2026-10-02T00:00:00.000Z');
  assert.equal(summary.validContacts, 1);
  const contact = contacts[0];
  assert.equal(contact.name, 'Jane Doe');
  assert.equal(contact.email, 'jane@example.com');
  assert.equal(contact.phone, '+1 416-555-0100');
  assert.equal(contact.wix_created_at, '2019-10-19T04:55:00.000Z');
  assert.deepEqual(JSON.parse(contact.emails_json), ['jane@example.com', 'second@example.com']);
  assert.equal(JSON.parse(contact.phones_json).length, 2);
  assert.equal(JSON.parse(contact.addresses_json)[0].Street, '1 Test St, Unit 2');
  assert.equal(contact.labels, 'A "quoted" label\nsecond line');
  assert.equal(contact.email_subscriber_status, 'Never subscribed');
  assert.equal(contact.sms_subscriber_status, 'Unsubscribed');
  assert.equal(JSON.parse(contact.source_fields_json)['Phone 1'], "'+1 416-555-0100");
  assert.deepEqual(Object.keys(contact).sort(), [...WIX_CONTACT_FIELDS].sort());
  assert.ok(!('booking_id' in contact));
  assert.ok(!('consent' in contact));
});

test('normalizes identity, skips CSV duplicates and supports phone-only contacts', () => {
  const { contacts, summary } = prepareWixContacts(makeCsv([
    { 'First Name': 'One', 'Email 1': 'A@example.com' },
    { 'First Name': 'Two', 'Email 1': ' a@EXAMPLE.com ' },
    { 'Email 1': 'invalid', 'Email 2': 'fallback@example.com' },
    { 'Phone 1': "'+1 (416) 555-0100" },
    { 'Phone 1': '14165550100' },
    { 'Email 1': 'invalid', 'Phone 1': '123' },
    { 'First Name': 'Name only' },
  ]));
  assert.equal(summary.totalRows, 7);
  assert.equal(summary.validContacts, 3);
  assert.equal(summary.duplicates, 2);
  assert.equal(summary.invalidRows, 2);
  assert.equal(contacts[0].name, 'One');
  assert.equal(contacts[1].email, 'fallback@example.com');
  assert.equal(contacts[2].email, '');
  assert.equal(contacts[0].contact_id, prepareWixContacts(makeCsv([{ 'Email 1': 'a@example.com' }])).contacts[0].contact_id);
});

test('retains invalid dates and unsupported columns in original source fields', () => {
  const { contacts, summary } = prepareWixContacts(makeCsv([{
    'Email 1': 'a@example.com', 'Created At (UTC+0)': '2026-02-30 12:00',
    'Last Activity Date (UTC+0)': 'unexpected date',
  }]));
  assert.equal(summary.invalidDates, 1);
  assert.equal(contacts[0].wix_created_at, '');
  assert.equal(contacts[0].last_activity_at, '');
  assert.equal(JSON.parse(contacts[0].source_fields_json)['Created At (UTC+0)'], '2026-02-30 12:00');
  const extra = `${makeCsv([{ 'Email 1': 'a@example.com' }]).split('\r\n')[0]},Custom Field\n${makeCsv([{ 'Email 1': 'a@example.com' }]).split('\r\n')[1]},Preserved`;
  assert.equal(JSON.parse(prepareWixContacts(extra).contacts[0].source_fields_json)['Custom Field'], 'Preserved');
});

test('rejects malformed, wrong-format, empty and oversized files; reports ragged records', () => {
  for (const csv of ['', 'name,email\nJane,a@example.com', `${headers.join(',')}\n"unclosed`, `${headers.join(',')}\n"closed"bad`]) {
    assert.throws(() => prepareWixContacts(csv), { statusCode: 400 });
  }
  assert.throws(() => prepareWixContacts('x'.repeat(MAX_WIX_CSV_BYTES + 1)), /3 MiB/);
  assert.throws(() => prepareWixContacts(`${headers.join(',')},Email 1\n`), /unique/);
  assert.throws(() => prepareWixContacts(makeCsv([])), /no contact rows/);
  assert.throws(() => prepareWixContacts(makeCsv(Array.from({ length: 10001 }, () => ({ 'Email 1': 'a@example.com' })))), /10000/);
  const { summary } = prepareWixContacts(`${makeCsv([{ 'Email 1': 'a@example.com' }])}\r\nbad,row`);
  assert.equal(summary.invalidRows, 1);
  assert.equal(summary.validContacts, 1);
});

function mockBigQuery({ schema = WIX_CONTACT_FIELDS.map((name) => ({ name, type: 'STRING' })), exists = true } = {}) {
  const stored = new Map();
  const calls = [];
  const table = { exists: async () => [exists], getMetadata: async () => [{ schema: { fields: schema } }] };
  const dataset = {
    exists: async () => [true],
    table: (id) => { calls.push(['table', id]); return table; },
    createTable: async (id, options) => { calls.push(['createTable', id, options]); },
  };
  const bigquery = {
    dataset: (id) => { calls.push(['dataset', id]); return dataset; },
    createQueryJob: async (options) => {
      calls.push(['merge', options]);
      let inserted = 0;
      for (const contact of options.params.records) {
        if (!stored.has(contact.contact_id)) { stored.set(contact.contact_id, contact); inserted += 1; }
      }
      return [{
        getQueryResults: async () => [],
        getMetadata: async () => [{ statistics: { query: { numDmlAffectedRows: String(inserted) } } }],
      }];
    },
    query: async (options) => {
      calls.push(['query', options]);
      return options.query.includes('COUNT(*)') ? [[{ total: stored.size }]] : [[...stored.values()]];
    },
  };
  return { bigquery, stored, calls };
}
const config = { projectId: 'test-project', datasetId: 'booking_system', forbiddenTables: ['bookings', 'patient_history', 'loyalty_members'] };

test('only creates the new table; uses insert-only parameterized MERGE and skips repeated imports', async () => {
  const mock = mockBigQuery({ exists: false });
  const store = createWixContactStore(mock.bigquery, config);
  const original = prepareWixContacts(makeCsv([{ 'First Name': 'Original', 'Email 1': 'a@example.com' }])).contacts;
  assert.equal(await store.importContacts(original), 1);
  const changed = prepareWixContacts(makeCsv([{ 'First Name': 'Changed', 'Email 1': 'a@example.com' }])).contacts;
  assert.equal(await store.importContacts(changed), 0);
  assert.equal(mock.stored.get(original[0].contact_id).name, 'Original');
  for (const [, id] of mock.calls.filter(([kind]) => kind === 'table' || kind === 'createTable')) assert.equal(id, 'wix_contacts');
  const [, options] = mock.calls.find(([kind]) => kind === 'merge');
  assert.match(options.query, /WHEN NOT MATCHED THEN INSERT/);
  assert.doesNotMatch(options.query, /UPDATE|DELETE|ALTER|TRUNCATE/);
  const parameter = BigQuery.valueToQueryParameter_(options.params.records, options.types.records);
  assert.equal(parameter.parameterType.type, 'ARRAY');
  assert.equal(parameter.parameterType.arrayType.type, 'STRUCT');
  assert.equal(parameter.parameterType.arrayType.structTypes.length, WIX_CONTACT_FIELDS.length);
});

test('refuses existing application table targets and incompatible schemas without data/schema writes', async () => {
  assert.throws(() => createWixContactStore(mockBigQuery().bigquery, { ...config, tableId: 'bookings' }), /separate table/);
  assert.throws(() => createWixContactStore(mockBigQuery().bigquery, { ...config, tableId: 'bad`table' }), /Invalid BigQuery/);
  const mock = mockBigQuery({ schema: [{ name: 'contact_id', type: 'INT64' }] });
  await assert.rejects(() => createWixContactStore(mock.bigquery, config).importContacts(
    prepareWixContacts(makeCsv([{ 'Email 1': 'a@example.com' }])).contacts,
  ), /incompatible schema/);
  assert.ok(!mock.calls.some(([kind]) => ['createTable', 'merge'].includes(kind)));
});

test('bounds expanded BigQuery request sizes and exposes partial failures for safe retries', async () => {
  const mock = mockBigQuery();
  const contacts = prepareWixContacts(makeCsv([
    { 'Email 1': 'a@example.com' }, { 'Email 1': 'b@example.com' }, { 'Email 1': 'c@example.com' },
  ])).contacts.map((contact) => ({ ...contact, source_fields_json: 'x'.repeat(3 * 1024 * 1024) }));
  const store = createWixContactStore(mock.bigquery, config);
  const execute = mock.bigquery.createQueryJob;
  let queries = 0;
  mock.bigquery.createQueryJob = async (options) => {
    queries += 1;
    if (queries === 2) throw new Error('Simulated BigQuery failure');
    return execute(options);
  };
  await assert.rejects(() => store.importContacts(contacts), /Import incomplete: 2 new contacts confirmed in 1 of 2 batches.*Simulated BigQuery failure/);
  mock.bigquery.createQueryJob = execute;
  assert.equal(await store.importContacts(contacts), 1);
  for (const [, options] of mock.calls.filter(([kind]) => kind === 'merge')) {
    const parameter = BigQuery.valueToQueryParameter_(options.params.records, options.types.records);
    assert.ok(Buffer.byteLength(JSON.stringify(parameter)) < MAX_WIX_QUERY_BYTES);
  }
  const count = mock.calls.filter(([kind]) => kind === 'merge').length;
  await assert.rejects(() => store.importContacts([
    ...contacts, { ...contacts[0], source_fields_json: 'x'.repeat(MAX_WIX_QUERY_BYTES) },
  ]), /One contact is too large/);
  assert.equal(mock.calls.filter(([kind]) => kind === 'merge').length, count);
});

test('search and pagination remain parameterized and validated', async () => {
  const mock = mockBigQuery();
  const store = createWixContactStore(mock.bigquery, config);
  await store.list({ search: "'; DELETE FROM bookings", offset: 50 });
  const [, options] = mock.calls.find(([kind]) => kind === 'query');
  assert.ok(!options.query.includes("'; DELETE"));
  assert.equal(options.params.search, "'; DELETE FROM bookings");
  assert.equal(options.params.offset, 50);
  assert.match(options.query, /LIMIT 50 OFFSET @offset/);
  await assert.rejects(() => store.list({ offset: -1 }), { statusCode: 400 });
  await assert.rejects(() => store.list({ search: 'x'.repeat(201) }), { statusCode: 400 });
});

test('owner-only API protects listing/import and previews without backend credentials or writes', async (t) => {
  process.env.OWNER_ADMIN_PASSWORD = 'test-password-for-wix-import';
  process.env.OWNER_ADMIN_EMAIL = 'owner@example.com';
  process.env.OWNER_ADMIN_SESSION_SECRET = 'test-session-secret-at-least-thirty-two-characters';
  Object.assign(process.env, {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com', GOOGLE_PRIVATE_KEY: 'synthetic-key',
    GOOGLE_SPREADSHEET_ID: 'test-sheet', BIGQUERY_PROJECT_ID: 'test-project', BIGQUERY_DATASET: 'booking_system',
    GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client', GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'synthetic-refresh', GOOGLE_GMAIL_SENDER_EMAIL: 'sender@example.com',
  });
  const dashboardChallenges = createDashboardChallengeStore();
  const emails = [];
  t.mock.method(BigQuery.prototype, 'dataset', () => ({
    exists: async () => [true], table: () => ({ exists: async () => [true] }),
  }));
  t.mock.method(BigQuery.prototype, 'query', async ({ query, params }) =>
    handleDashboardChallengeQuery(query, params, dashboardChallenges) || [[]],
  );
  t.mock.method(google, 'gmail', () => ({
    users: { messages: { send: async (options) => { emails.push(options); return { data: { id: 'otp-email' } }; } } },
  }));
  const { default: handler } = await import('../api/booking.js');
  const request = async (view, { method = 'GET', body, cookie, origin = 'https://test.example' } = {}) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.method = method;
    req.query = { view };
    req.headers = { host: 'test.example', origin, 'content-type': 'application/json', cookie };
    const res = {
      headers: {},
      setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.code = code; return this; },
      json(data) { this.data = data; return this; },
    };
    await handler(req, res);
    return res;
  };
  assert.equal((await request('wix-contacts')).code, 401);
  assert.equal((await request('wix-contacts-import', { method: 'POST', body: { csv: 'invalid' } })).code, 401);
  const login = await request('owner-login', { method: 'POST', body: { email: process.env.OWNER_ADMIN_EMAIL, password: process.env.OWNER_ADMIN_PASSWORD } });
  assert.equal(login.code, 200);
  const verified = await request('owner-verify', { method: 'POST', body: { challengeId: login.data.challengeId, code: readDashboardOtp(emails.at(-1)) } });
  assert.equal(verified.code, 200);
  const cookie = verified.headers['Set-Cookie'].split(';')[0];
  assert.equal((await request('wix-contacts-import', { method: 'POST', cookie, origin: 'https://foreign.example' })).code, 403);
  assert.equal((await request('wix-contacts-import', { cookie })).code, 405);
  assert.equal((await request('wix-contacts', { method: 'POST', cookie })).code, 405);
  const preview = await request('wix-contacts-import', {
    method: 'POST', cookie, body: { csv: makeCsv([{ 'Email 1': 'a@example.com' }]), preview: true },
  });
  assert.equal(preview.code, 200);
  assert.equal(preview.headers['Cache-Control'], 'no-store');
  assert.equal(preview.data.validContacts, 1);
  assert.equal(preview.data.sample.length, 1);
  assert.equal(preview.data.imported, undefined);
  const oversized = await request('wix-contacts-import', {
    method: 'POST', cookie, body: { csv: 'x'.repeat(4 * 1024 * 1024) },
  });
  assert.equal(oversized.code, 413);
});
