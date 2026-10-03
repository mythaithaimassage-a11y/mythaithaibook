import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import { createBookingHistoryStore, CLEAR_HISTORY_CONFIRMATION } from '../lib/booking-history.js';
import { createDashboardChallengeStore, handleDashboardChallengeQuery, readDashboardOtp } from './helpers/dashboard-auth.js';

const options = {
  projectId: 'test-project', datasetId: 'booking_system', tableId: 'bookings',
  timeZone: 'America/Toronto', secret: 'synthetic-history-secret-at-least-thirty-two-characters',
};

function mockDatabase() {
  let snapshot = 'initial-row-fingerprint';
  let count = 4;
  const calls = [];
  return {
    calls,
    change() { snapshot = 'changed-row-fingerprint'; },
    async query({ query, params }) {
      calls.push({ query, params });
      assert.match(query, /FROM `test-project\.booking_system\.bookings`/);
      assert.match(query, /duration_minutes > 0/);
      assert.match(query, /SAFE\.PARSE_DATE\('%F', date\)/);
      assert.match(query, /SAFE\.PARSE_TIME\('%I:%M %p'/);
      assert.match(query, /SAFE\.PARSE_TIME\('%H:%M'/);
      assert.match(query, /SAFE\.TIMESTAMP_ADD/);
      assert.match(query, /INTERVAL duration_minutes MINUTE/);
      assert.match(query, /<= TIMESTAMP\(@cutoff\)/);
      assert.equal(params.timeZone, options.timeZone);
      if (query.startsWith('SELECT')) {
        assert.match(query, /TO_JSON_STRING\(b\)/);
        return [[{ count, receipts: 2, paidBookings: 3, kept: 5, fingerprint: snapshot }]];
      }
      assert.match(query, /BEGIN TRANSACTION/);
      assert.match(query, /CREATE TEMP TABLE past_bookings/);
      assert.match(query, /ASSERT .*SELECT/s);
      assert.match(query, /DELETE FROM `test-project\.booking_system\.bookings` WHERE duration_minutes > 0/);
      assert.match(query, /SET deleted_count = @@row_count/);
      assert.match(query, /COMMIT TRANSACTION/);
      assert.doesNotMatch(query, /loyalty|session_packages|square_payments|patient_history|ALTER TABLE|TRUNCATE/);
      if (params.fingerprint !== snapshot) throw new Error('Booking history changed; preview again');
      const deleted = count;
      count = 0;
      snapshot = 'empty-row-fingerprint';
      return [[{ deleted }]];
    },
  };
}

test('clear history requires a signed reviewed preview and deletes only the frozen candidate snapshot', async () => {
  const db = mockDatabase();
  const store = createBookingHistoryStore(db, options);
  const preview = await store.preview();
  assert.equal(preview.count, 4);
  assert.equal(preview.receipts, 2);
  assert.equal(preview.paidBookings, 3);
  assert.equal(preview.kept, 5);
  assert.equal(preview.timeZone, 'America/Toronto');
  const cleared = await store.clear({ token: preview.token, confirmation: CLEAR_HISTORY_CONFIRMATION });
  assert.equal(cleared.deleted, 4);
  assert.equal(cleared.cutoff, preview.cutoff);
  assert.equal(db.calls[1].params.cutoff, db.calls[0].params.cutoff);
  await assert.rejects(store.clear({ token: preview.token, confirmation: CLEAR_HISTORY_CONFIRMATION }), { statusCode: 409 });
  assert.equal((await store.preview()).count, 0);
});

test('invalid confirmation, tampered, missing, expired and wrong-table tokens never issue a delete', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-02T21:14:00Z') });
  const db = mockDatabase();
  const store = createBookingHistoryStore(db, options);
  const { token } = await store.preview();
  await assert.rejects(store.clear({ token, confirmation: 'yes' }), { statusCode: 400 });
  await assert.rejects(store.clear({ confirmation: CLEAR_HISTORY_CONFIRMATION }), { statusCode: 400 });
  await assert.rejects(store.clear({ token: `${token}extra`, confirmation: CLEAR_HISTORY_CONFIRMATION }), { statusCode: 400 });
  await assert.rejects(store.clear({ token: `${token}.extra`, confirmation: CLEAR_HISTORY_CONFIRMATION }), { statusCode: 400 });
  const otherStore = createBookingHistoryStore(db, { ...options, tableId: 'other_bookings' });
  await assert.rejects(otherStore.clear({ token, confirmation: CLEAR_HISTORY_CONFIRMATION }), { statusCode: 409 });
  t.mock.timers.tick(10 * 60 * 1000 + 1);
  await assert.rejects(store.clear({ token, confirmation: CLEAR_HISTORY_CONFIRMATION }), { statusCode: 409 });
  assert.equal(db.calls.length, 1);
});

test('changed bookings block the entire deletion and unrelated database failures are surfaced', async () => {
  const db = mockDatabase();
  const store = createBookingHistoryStore(db, options);
  const preview = await store.preview();
  db.change();
  await assert.rejects(store.clear({ token: preview.token, confirmation: CLEAR_HISTORY_CONFIRMATION }), {
    statusCode: 409, message: 'Booking history changed since your preview. Preview again before clearing.',
  });
  const brokenStore = createBookingHistoryStore({ query: async () => { throw new Error('BigQuery permission denied'); } }, options);
  await assert.rejects(brokenStore.clear({ token: preview.token, confirmation: CLEAR_HISTORY_CONFIRMATION }), /BigQuery permission denied/);
  await assert.rejects(brokenStore.preview(), /BigQuery permission denied/);
  assert.throws(() => createBookingHistoryStore(db, { ...options, tableId: 'bookings`; DROP TABLE x' }), /valid existing/);
});

test('preview cutoff is frozen so future and ongoing appointments cannot become new deletion candidates', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-02T21:14:00Z') });
  const db = mockDatabase();
  const store = createBookingHistoryStore(db, options);
  const preview = await store.preview();
  assert.equal(preview.cutoff, '2026-10-02T21:14:00.000Z');
  t.mock.timers.tick(5 * 60 * 1000);
  await store.clear({ token: preview.token, confirmation: CLEAR_HISTORY_CONFIRMATION });
  assert.equal(db.calls[1].params.cutoff, '2026-10-02T21:14:00.000Z');
  // Both the preview and DELETE must evaluate the same scheduled-end predicate.
  const previewPredicate = db.calls[0].query.split(' AS b WHERE ')[1];
  const deletePredicate = db.calls[1].query.split('DELETE FROM `test-project.booking_system.bookings` WHERE ')[1].split(';')[0];
  assert.equal(previewPredicate, deletePredicate);
});

test('booking history API enforces owner authentication, same origin, method and explicit confirmation', async (t) => {
  Object.assign(process.env, {
    OWNER_ADMIN_PASSWORD: 'synthetic-owner-password-for-tests',
    OWNER_ADMIN_EMAIL: 'owner@example.com',
    OWNER_ADMIN_SESSION_SECRET: options.secret,
    GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client',
    GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'synthetic-refresh',
    GOOGLE_GMAIL_SENDER_EMAIL: 'sender@example.com',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com',
    GOOGLE_PRIVATE_KEY: 'synthetic-key-not-used',
    BIGQUERY_PROJECT_ID: options.projectId,
    BIGQUERY_DATASET: options.datasetId,
    BIGQUERY_BOOKINGS_TABLE: options.tableId,
    GOOGLE_CALENDAR_TIME_ZONE: options.timeZone,
  });
  const db = mockDatabase();
  const dashboardChallenges = createDashboardChallengeStore();
  t.mock.method(BigQuery.prototype, 'query', async (args) =>
    handleDashboardChallengeQuery(args.query, args.params, dashboardChallenges) || db.query(args),
  );
  t.mock.method(BigQuery.prototype, 'dataset', () => ({
    exists: async () => [true],
    table: () => ({ exists: async () => [true] }),
    createTable: async () => { throw new Error('No table/schema creation permitted'); },
  }));
  t.mock.method(google, 'sheets', () => { throw new Error('Do not change contacts or patient records'); });
  t.mock.method(google, 'calendar', () => { throw new Error('Do not delete calendar events'); });
  const emails = [];
  t.mock.method(google, 'gmail', () => ({
    users: { messages: { send: async (options) => { emails.push(options); return { data: { id: 'otp-email' } }; } } },
  }));
  const { default: handler } = await import('../api/booking.js');
  let cookie = '';
  async function request(view, body = {}, { method = 'POST', origin = 'https://test.example', signedIn = true } = {}) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method, query: { view }, headers: {
      host: 'test.example', origin, cookie: signedIn ? cookie : '', 'content-type': 'application/json',
    } });
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value; if (name === 'Set-Cookie') cookie = value.split(';')[0]; },
      status(code) { this.code = code; return this; },
      json(data) { this.data = data; return this; },
    };
    await handler(req, res);
    return res;
  }
  for (const view of ['booking-history-preview', 'clear-booking-history']) {
    assert.equal((await request(view)).code, 401);
  }
  const login = await request('owner-login', { email: process.env.OWNER_ADMIN_EMAIL, password: process.env.OWNER_ADMIN_PASSWORD });
  assert.equal(login.code, 200);
  const verified = await request('owner-verify', {
    challengeId: login.data.challengeId,
    code: readDashboardOtp(emails.at(-1)),
  });
  assert.equal(verified.code, 200);
  for (const view of ['booking-history-preview', 'clear-booking-history']) {
    assert.equal((await request(view, {}, { origin: 'https://evil.example' })).code, 403);
    assert.equal((await request(view, {}, { method: 'GET' })).code, 405);
  }
  assert.equal(db.calls.length, 0);
  const preview = await request('booking-history-preview');
  assert.equal(preview.code, 200);
  assert.equal(preview.headers['Cache-Control'], 'no-store');
  assert.equal(preview.data.count, 4);
  assert.equal((await request('clear-booking-history', { token: preview.data.token })).code, 400);
  assert.equal(db.calls.length, 1);
  const cleared = await request('clear-booking-history', { token: preview.data.token, confirmation: CLEAR_HISTORY_CONFIRMATION });
  assert.equal(cleared.code, 200);
  assert.equal(cleared.data.deleted, 4);
  assert.equal(cleared.headers['Cache-Control'], 'no-store');
  assert.equal(db.calls.length, 2);
});
