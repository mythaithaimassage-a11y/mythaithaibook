import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import { applyWixCataloguePrices, applyWixTherapistMappings, prepareWixBookings, importWixBookings } from '../lib/wix-bookings.js';
import { BOOKING_TABLE_FIELDS } from '../lib/booking-schema.js';
import { MAX_WIX_QUERY_BYTES } from '../lib/wix-import.js';
import { createDashboardChallengeStore, handleDashboardChallengeQuery, readDashboardOtp } from './helpers/dashboard-auth.js';

const headers = [
  'Session date', 'Start time', 'Registration date', 'Booking contact name',
  'Booking contact email', 'Booking contact phone', 'Client address', 'Spots filled',
  'Duration', 'Service name', 'Service type', 'Staff name', 'Booking status',
  'Attendance status', 'Payment status', 'Form question 1', 'Form answer 1',
];
const baseline = {
  'Session date': '2025-04-10', 'Start time': '13:05', 'Registration date': '2025-04-01',
  'Booking contact name': 'Test Client', 'Booking contact email': 'CLIENT@EXAMPLE.COM',
  'Booking contact phone': "'+1 416-555-0100", 'Client address': 'Ontario L5B\nCanada',
  'Spots filled': '2', Duration: '1h, 30m', 'Service name': '90-min, Pay full at the spa',
  'Service type': 'Appointment', 'Staff name': 'Staff 7 TaTa', 'Booking status': 'Confirmed',
  'Attendance status': 'Not specified', 'Payment status': 'Exempt',
  'Form question 1': 'Preferences?', 'Form answer 1': 'A "quoted" preference',
};
const csv = (records) => [headers, ...records.map((record) => headers.map((header) => ({ ...baseline, ...record })[header] || ''))]
  .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n');
const prepare = (records) => prepareWixBookings(csv(records), { today: '2026-10-02' });
const config = { projectId: 'test-project', datasetId: 'booking_system', tableId: 'existing_bookings', fields: BOOKING_TABLE_FIELDS };

test('therapist mappings preserve Wix source and IDs, combine aliases without losing distinct appointments, and keep unmapped names', () => {
  const prepared = prepare([{}, { 'Staff name': 'TaTa' }, { 'Staff name': 'Former Staff' }, { 'Staff name': 'Unknown' }]);
  const therapists = [{ id: 1, name: 'Tata', active: true }, { id: 2, name: 'Inactive', active: false }];
  const mappings = ['Staff 7 TaTa', 'TaTa', ''].map((sourceName) => ({ sourceName, therapistId: 1, therapistName: 'Tata' }));
  const mapped = applyWixTherapistMappings(prepared, therapists, mappings);
  assert.equal(mapped.summary.therapistGroups.length, 4);
  assert.equal(mapped.summary.mappedTherapistBookings, 3);
  assert.equal(mapped.bookings.length, 4);
  assert.equal(new Set(mapped.bookings.map((record) => record.booking_id)).size, 4);
  assert.deepEqual(mapped.bookings.map((record) => record.booking_id), prepared.bookings.map((record) => record.booking_id));
  assert.equal(mapped.bookings.filter((record) => record.therapist_name === 'Tata').length, 3);
  assert.equal(mapped.bookings.filter((record) => record.therapist_name === 'Former Staff').length, 1);
  const changed = mapped.bookings.find((record) => JSON.parse(record.intake_notes).sourceFields['Staff name'] === 'Staff 7 TaTa');
  assert.equal(JSON.parse(changed.intake_notes).therapistMapping.sourceName, 'Staff 7 TaTa');
  assert.equal(JSON.parse(changed.intake_notes).therapistMapping.therapistId, 1);
  assert.deepEqual(applyWixTherapistMappings(prepared, []).bookings, prepared.bookings);
  for (const invalid of [
    {}, [mappings[0], mappings[0]], [{ sourceName: 'Not in CSV', therapistId: 1, therapistName: 'Tata' }],
    [{ ...mappings[0], therapistId: 2, therapistName: 'Inactive' }], [{ ...mappings[0], therapistName: 'Stale name' }],
    [{ ...mappings[0], therapistId: 999 }],
  ]) assert.throws(() => applyWixTherapistMappings(prepared, therapists, invalid), { statusCode: 400 });
});

function mockBigQuery({ exists = true, fields = BOOKING_TABLE_FIELDS.map(({ name, type, mode }) => ({ name, type, mode })) } = {}) {
  const stored = new Map();
  const calls = [];
  const bigquery = {
    dataset(id) {
      calls.push(['dataset', id]);
      return {
        table(tableId) {
          calls.push(['table', tableId]);
          return {
            exists: async () => [exists],
            getMetadata: async () => [{ schema: { fields } }],
          };
        },
        createTable() { throw new Error('Table creation forbidden'); },
      };
    },
    createDataset() { throw new Error('Dataset creation forbidden'); },
    async createQueryJob(options) {
      calls.push(['merge', options]);
      let inserted = 0;
      let updated = 0;
      for (const record of options.params.records) {
        if (!stored.has(record.booking_id)) { stored.set(record.booking_id, record); inserted += 1; }
        else if (options.query.includes('THEN UPDATE SET')) {
          const target = stored.get(record.booking_id);
          if (!target.total && !target.paid_amount && !target.receipt_number && !target.receipt_issued_at && !target.receipt_email_status) {
            const next = { ...target };
            for (const name of ['service_name', 'payment_option', 'paid_amount', 'total', 'intake_notes', 'status_notes']) next[name] = record[name];
            stored.set(record.booking_id, next);
            updated += 1;
          }
        }
      }
      return [{
        getQueryResults: async () => [],
        getMetadata: async () => [{ statistics: { query: { numDmlAffectedRows: String(inserted + updated), dmlStats: { insertedRowCount: String(inserted), updatedRowCount: String(updated) } } } }],
      }];
    },
  };
  return { bigquery, calls, stored };
}

test('maps exactly the existing booking schema and preserves exported details without financial guesses', () => {
  const { bookings, summary } = prepare([{}]);
  assert.equal(summary.validBookings, 1);
  const booking = bookings[0];
  assert.deepEqual(Object.keys(booking).sort(), BOOKING_TABLE_FIELDS.filter(({ name }) => !['receipt_manual_discount', 'receipt_reconciliation', 'booking_note'].includes(name)).map(({ name }) => name).sort());
  assert.equal(booking.branch_name, 'Mississauga Central');
  assert.equal(booking.branch_address, '');
  assert.equal(booking.email, 'client@example.com');
  assert.equal(booking.phone, '+1 416-555-0100');
  assert.equal(booking.time, '01:05 PM');
  assert.equal(booking.duration_minutes, 90);
  assert.equal(booking.status, 'Confirmed');
  assert.equal(booking.created_at, '2025-04-01');
  assert.equal(booking.paid_amount, 0);
  assert.equal(booking.total, 0);
  assert.match(booking.payment_option, /Exempt \(amounts unknown\)/);
  assert.match(booking.status_notes, /not zero-value\/free/);
  for (const field of ['calendar_id', 'calendar_event_id', 'receipt_number', 'membership_type']) assert.equal(booking[field], '');
  const notes = JSON.parse(booking.intake_notes);
  assert.equal(notes.timeZone, 'America/Toronto');
  assert.equal(notes.sourceFields['Client address'], baseline['Client address']);
  assert.equal(notes.sourceFields['Spots filled'], '2');
  assert.equal(notes.sourceFields['Form answer 1'], 'A "quoted" preference');
  assert.ok(booking.booking_id.length < 100);
});

const catalogue = [
  { id: 1, name: 'Traditional Thai (90 min)', duration: 90, price: 100, taxRate: 0.13, active: true },
  { id: 2, name: 'Registered Massage Therapy (90 min)', duration: 90, price: 120, taxRate: 0, active: true },
];
function mapping(prepared, service = catalogue[0]) {
  return [{ key: JSON.stringify([prepared.bookings[0].service_name, prepared.bookings[0].duration_minutes]), serviceId: service.id, serviceName: service.name, price: service.price, taxRate: service.taxRate }];
}

test('owner-reviewed catalogue pricing makes bookings paid in full with compatible receipt totals and preserves IDs/source details', () => {
  const prepared = prepare([{}]);
  const initial = applyWixCataloguePrices(prepared, [], []);
  assert.equal(initial.summary.priceGroups.length, 1);
  assert.equal(initial.summary.pricedBookings, 0);
  const priced = applyWixCataloguePrices(prepared, catalogue, mapping(prepared), true);
  const booking = priced.bookings[0];
  assert.equal(booking.booking_id, prepared.bookings[0].booking_id);
  assert.equal(booking.service_name, catalogue[0].name);
  assert.equal(booking.total, 113);
  assert.equal(booking.paid_amount, 113);
  assert.equal(priced.summary.approvedTotal, 113);
  assert.ok(booking.total > 0 && booking.paid_amount >= booking.total);
  assert.equal(Math.round(booking.total / 1.13 * 100) / 100, 100);
  const notes = JSON.parse(booking.intake_notes);
  assert.equal(notes.sourceFields['Service name'], baseline['Service name']);
  assert.equal(notes.pricing.basis, 'Owner-approved current catalogue, not Wix transaction amounts');
  const exempt = applyWixCataloguePrices(prepared, catalogue, mapping(prepared, catalogue[1]), true).bookings[0];
  assert.equal(exempt.total, 120);
  assert.match(exempt.service_name, /Registered Massage Therapy/);
  assert.equal(exempt.receipt_number, '');
});

test('rejects missing/duplicate/stale catalogue mappings, mismatched durations and unsupported receipt taxes', () => {
  const prepared = prepare([{}]);
  const mappings = mapping(prepared);
  assert.throws(() => applyWixCataloguePrices(prepared, catalogue, [], true), /Map every/);
  assert.throws(() => applyWixCataloguePrices(prepared, catalogue, [...mappings, ...mappings], true), /duplicate/);
  assert.throws(() => applyWixCataloguePrices(prepared, catalogue, [{ ...mappings[0], price: 90 }], true), /changed/);
  for (const change of [{ active: false }, { duration: 60 }, { price: 0 }, { price: Infinity }, { taxRate: 0.05 }]) {
    assert.throws(() => applyWixCataloguePrices(prepared, [{ ...catalogue[0], ...change }], mappings, true), /Choose an active/);
  }
  assert.throws(() => applyWixCataloguePrices(prepared, [{ ...catalogue[0], taxRate: 0 }], [{ ...mappings[0], taxRate: 0 }], true), /classification/);
});

test('reviewed paid re-import fills untouched zero amounts, preserving other fields, payments and issued receipts', async () => {
  const mock = mockBigQuery();
  const prepared = prepare([
    {}, { 'Booking contact email': 'second@example.com' }, { 'Booking contact email': 'third@example.com' },
    { 'Booking contact email': 'fourth@example.com' }, { 'Booking contact email': 'fifth@example.com' },
  ]);
  const priced = applyWixCataloguePrices(prepared, catalogue, mapping(prepared), true);
  mock.stored.set(prepared.bookings[0].booking_id, { ...prepared.bookings[0], status: 'Completed', phone: '9055550100' });
  mock.stored.set(prepared.bookings[1].booking_id, { ...prepared.bookings[1], total: 80, paid_amount: 80 });
  mock.stored.set(prepared.bookings[2].booking_id, { ...prepared.bookings[2], receipt_number: 'KEEP-RECEIPT' });
  mock.stored.set(prepared.bookings[3].booking_id, { ...prepared.bookings[3], receipt_email_status: 'pending' });
  assert.deepEqual(await importWixBookings(mock.bigquery, priced.bookings, { ...config, reviewedPaid: true }), { imported: 1, updated: 1 });
  const updated = mock.stored.get(prepared.bookings[0].booking_id);
  assert.equal(updated.total, 113);
  assert.equal(updated.paid_amount, 113);
  assert.equal(updated.status, 'Completed');
  assert.equal(updated.phone, '9055550100');
  assert.equal(mock.stored.get(prepared.bookings[1].booking_id).total, 80);
  assert.equal(mock.stored.get(prepared.bookings[2].booking_id).receipt_number, 'KEEP-RECEIPT');
  assert.equal(mock.stored.get(prepared.bookings[3].booking_id).total, 0);
  assert.deepEqual(await importWixBookings(mock.bigquery, priced.bookings, { ...config, reviewedPaid: true }), { imported: 0, updated: 0 });
  const query = mock.calls.find(([kind]) => kind === 'merge')[1].query;
  assert.match(query, /WHEN MATCHED AND STARTS_WITH\(target.booking_id, 'WIX-'\)/);
  assert.match(query, /COALESCE\(target.receipt_number, ''\) = ''/);
  assert.doesNotMatch(query, /CREATE|ALTER|DELETE|TRUNCATE/);
  await assert.rejects(() => importWixBookings(mock.bigquery, prepared.bookings, { ...config, reviewedPaid: true }), /positive total/);
});

test('sorts chronologically, creates stable IDs across row orders/split files and distinguishes staff', () => {
  const a = { 'Session date': '2024-01-01', 'Start time': '00:00' };
  const b = { 'Session date': '2024-01-01', 'Start time': '12:00' };
  const c = { 'Session date': '2024-01-01', 'Start time': '23:59', 'Staff name': 'Different staff' };
  const prepared = prepare([c, b, a, a, { ...b, 'Staff name': 'Different staff' }]);
  assert.equal(prepared.summary.duplicates, 1);
  assert.equal(prepared.summary.validBookings, 4);
  assert.equal(prepared.bookings[0].time, '12:00 AM');
  assert.equal(prepared.bookings.at(-1).time, '11:59 PM');
  assert.deepEqual(prepare([b, c, a, { ...b, 'Staff name': 'Different staff' }]).bookings.map((item) => item.booking_id), prepared.bookings.map((item) => item.booking_id));
  assert.equal(prepare([a]).bookings[0].booking_id, prepared.bookings[0].booking_id);
  const corrected = prepare([{ ...a, 'Payment status': 'Paid', 'Attendance status': 'Attended', 'Registration date': '2023-12-01' }]).bookings[0];
  assert.equal(corrected.booking_id, prepared.bookings[0].booking_id);
  assert.equal(corrected.status, 'Completed');
  assert.equal(corrected.paid_amount, 0);
});

test('validates dates/times/durations/status, skips future rows and retains invalid source values with warnings', () => {
  const { bookings, summary } = prepare([
    { 'Session date': '2025-02-30' }, { 'Start time': '24:00' }, { Duration: '0h, 0m' },
    { Duration: '1h, 60m' }, { 'Booking status': 'Unexpected' },
    { 'Session date': '2026-10-03' }, { 'Booking contact email': 'bad', 'Booking contact phone': '123', 'Registration date': 'Unknown' },
    { 'Registration date': '2025-02-30', 'Booking contact name': 'Another client', 'Booking contact email': 'another@example.com' },
  ]);
  assert.equal(summary.invalidRows, 5);
  assert.equal(summary.futureRows, 1);
  assert.equal(summary.warnings, 2);
  assert.equal(bookings.length, 2);
  const blankContact = bookings.find((booking) => booking.email === '');
  assert.equal(blankContact.phone, '');
  assert.equal(blankContact.created_at, '');
  assert.equal(JSON.parse(blankContact.intake_notes).sourceFields['Booking contact email'], 'bad');
  assert.throws(() => prepareWixBookings('First Name,Email 1\nJane,a@example.com'), /Missing Wix booking column/);
  assert.throws(() => prepareWixBookings(headers.join(',')), /no booking rows/);
});

test('normalizes cancelled/attended/no-show status without assuming past sessions were attended', () => {
  const states = [
    ['Cancelled', 'Attended', 'Cancelled'], ['Canceled', 'Not specified', 'Cancelled'],
    ['Confirmed', 'No-show', 'No Show'], ['Confirmed', 'Attended', 'Completed'],
    ['Confirmed', 'Not specified', 'Confirmed'], ['Pending', 'Not specified', 'Pending'],
  ];
  for (const [booking, attendance, expected] of states) {
    assert.equal(prepare([{ 'Booking status': booking, 'Attendance status': attendance }]).bookings[0].status, expected);
  }
});

test('imports unnamed bookings when email/phone identifies the client, but rejects rows with no client identity', () => {
  const unnamed = prepare([{ 'Booking contact name': '' }]);
  assert.equal(unnamed.summary.validBookings, 1);
  assert.equal(unnamed.summary.warnings, 1);
  assert.equal(unnamed.bookings[0].customer_name, '');
  assert.equal(unnamed.bookings[0].email, 'client@example.com');
  const anonymous = prepare([{ 'Booking contact name': '', 'Booking contact email': 'Unknown', 'Booking contact phone': 'Unknown' }]);
  assert.equal(anonymous.summary.invalidRows, 1);
  assert.equal(anonymous.summary.validBookings, 0);
});

test('uses only the configured existing table with native types and leaves existing records unchanged', async () => {
  const mock = mockBigQuery();
  const records = prepare([{}]).bookings;
  mock.stored.set('MTT-EXISTING', { booking_id: 'MTT-EXISTING', total: 100 });
  assert.equal(await importWixBookings(mock.bigquery, records, config), 1);
  const id = records[0].booking_id;
  mock.stored.set(id, { ...records[0], paid_amount: 90, receipt_number: 'REAL-RECEIPT' });
  assert.equal(await importWixBookings(mock.bigquery, records, config), 0);
  assert.equal(mock.stored.get(id).paid_amount, 90);
  assert.equal(mock.stored.get(id).receipt_number, 'REAL-RECEIPT');
  assert.equal(mock.stored.get('MTT-EXISTING').total, 100);
  const options = mock.calls.find(([kind]) => kind === 'merge')[1];
  assert.match(options.query, /MERGE `test-project.booking_system.existing_bookings`/);
  assert.match(options.query, /WHEN NOT MATCHED THEN INSERT/);
  assert.doesNotMatch(options.query, /UPDATE|DELETE|CREATE|ALTER|TRUNCATE/);
  assert.equal(options.types.records[0].total, 'FLOAT64');
  assert.equal(options.types.records[0].duration_minutes, 'INT64');
  const parameter = BigQuery.valueToQueryParameter_(options.params.records, options.types.records);
  assert.equal(parameter.parameterType.arrayType.structTypes.length, BOOKING_TABLE_FIELDS.length);
  assert.ok(Buffer.byteLength(JSON.stringify(parameter)) < MAX_WIX_QUERY_BYTES);
});

test('fails without creating a missing table or modifying incompatible schemas; accepts BigQuery type aliases', async () => {
  const records = prepare([{}]).bookings;
  const missing = mockBigQuery({ exists: false });
  await assert.rejects(() => importWixBookings(missing.bigquery, records, config), /No table was created/);
  assert.ok(!missing.calls.some(([kind]) => kind === 'merge'));
  const badSchema = mockBigQuery({ fields: [{ name: 'booking_id', type: 'STRING' }] });
  await assert.rejects(() => importWixBookings(badSchema.bigquery, records, config), /incompatible/);
  assert.ok(!badSchema.calls.some(([kind]) => kind === 'merge'));
  const aliasSchema = BOOKING_TABLE_FIELDS.map(({ name, type }) => ({ name, type: ({ INT64: 'INTEGER', FLOAT64: 'FLOAT' }[type] || type) }));
  assert.equal(await importWixBookings(mockBigQuery({ fields: aliasSchema }).bigquery, records, config), 1);
  await assert.rejects(() => importWixBookings(mockBigQuery().bigquery, records, { ...config, tableId: 'bad`table' }), /Invalid BigQuery/);
});

test('reports partial batches and supports safe retry with insert-only writes', async () => {
  const mock = mockBigQuery();
  const records = prepare([{}, { 'Booking contact email': 'second@example.com' }, { 'Booking contact email': 'third@example.com' }]).bookings
    .map((record) => ({ ...record, intake_notes: 'x'.repeat(3 * 1024 * 1024) }));
  const execute = mock.bigquery.createQueryJob;
  let queries = 0;
  mock.bigquery.createQueryJob = async (options) => {
    queries += 1;
    if (queries === 2) throw new Error('Simulated write failure');
    return execute(options);
  };
  await assert.rejects(() => importWixBookings(mock.bigquery, records, config), /2 new bookings confirmed in 1 of 2 batches/);
  mock.bigquery.createQueryJob = execute;
  assert.equal(await importWixBookings(mock.bigquery, records, config), 1);
});

test('booking import API enforces owner/origin, previews without backend writes and rejects historical loyalty awards', async (t) => {
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
  const request = async (view, { method = 'POST', body, cookie, origin = 'https://test.example' } = {}) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method, query: { view }, headers: { host: 'test.example', origin, 'content-type': 'application/json', cookie } });
    const res = {
      headers: {}, setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; },
    };
    await handler(req, res);
    return res;
  };
  assert.equal((await request('wix-bookings-import', { body: { csv: csv([{}]), preview: true } })).code, 401);
  const login = await request('owner-login', { body: { email: process.env.OWNER_ADMIN_EMAIL, password: process.env.OWNER_ADMIN_PASSWORD } });
  assert.equal(login.code, 200);
  const verified = await request('owner-verify', {
    body: { challengeId: login.data.challengeId, code: readDashboardOtp(emails.at(-1)) },
  });
  assert.equal(verified.code, 200);
  const cookie = verified.headers['Set-Cookie'].split(';')[0];
  assert.equal((await request('wix-bookings-import', { cookie, origin: 'https://foreign.example' })).code, 403);
  assert.equal((await request('wix-bookings-import', { cookie, method: 'GET' })).code, 405);
  assert.equal((await request('packages', { cookie, method: 'POST' })).code, 405);
  assert.equal((await request('package-register', { cookie, origin: 'https://foreign.example' })).code, 403);
  assert.equal((await request('package-redeem', { body: { packageId: 'x', bookingId: 'y' } })).code, 401);
  const preview = await request('wix-bookings-import', { cookie, body: { csv: csv([{}]), preview: true } });
  assert.equal(preview.code, 200);
  assert.equal(preview.headers['Cache-Control'], 'no-store');
  assert.equal(preview.data.validBookings, 1);
  assert.equal(preview.data.sample[0].branch_name, 'Mississauga Central');
  assert.equal(preview.data.imported, undefined);
  assert.equal(preview.data.priceGroups.length, 1);
  assert.equal((await request('wix-bookings-import', { cookie, body: { csv: csv([{}]) } })).code, 400);
  assert.equal((await request('loyalty-award', { cookie, body: { bookingId: preview.data.sample[0].booking_id } })).code, 409);
  assert.equal((await request('wix-bookings-import', { cookie, body: { csv: 'x'.repeat(4 * 1024 * 1024) } })).code, 413);
});
