import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import { syncWixCalendarBatch, wixCalendarEvent } from '../lib/wix-calendar.js';

const options = {
  projectId: 'test-project', datasetId: 'booking_system', tableId: 'bookings',
  calendarId: 'primary@example.com', timeZone: 'America/Toronto',
};
const booking = {
  booking_id: 'WIX-20261001-test', customer_name: 'Test customer', service_name: 'Massage',
  therapist_name: 'Mapped therapist', date: '2026-10-01', time: '11:30 PM',
  duration_minutes: 90, branch_name: 'Mississauga Central', status: 'Completed',
  total: 209.05, paid_amount: 209.05, calendar_event_id: '',
};

function fixture(rows = [{ ...booking }]) {
  const queries = [];
  const events = new Map();
  const writes = [];
  const bigquery = {
    async query({ query, params = {} }) {
      queries.push({ query, params });
      assert.match(query, /STARTS_WITH\(booking_id, 'WIX-'\)/);
      assert.match(query, /COALESCE\(calendar_event_id, ''\) = ''/);
      assert.match(query, /NOT IN \('Cancelled', 'No Show'\)/);
      assert.doesNotMatch(query, /CREATE|ALTER|DELETE|INSERT|paid_amount =|total =/);
      const pending = rows.filter((row) => row.booking_id.startsWith('WIX-') && !row.calendar_event_id &&
        !['Cancelled', 'No Show'].includes(row.status) && !params.excludedIds?.includes(row.booking_id));
      if (query.startsWith('SELECT COUNT')) return [[{ pending: pending.length }]];
      if (query.startsWith('SELECT')) return [pending.slice(0, 25).map((row) => ({ ...row }))];
      assert.match(query, /BEGIN TRANSACTION/);
      assert.match(query, /ASSERT/);
      assert.match(query, /ARRAY_LENGTH\(@links\)/);
      for (const link of params.links) {
        const matching = pending.filter((row) => row.booking_id === link.bookingId &&
          row.date === link.expectedDate && row.time === link.expectedTime && row.duration_minutes === link.duration &&
          row.therapist_name === link.therapist && row.status === link.expectedStatus);
        if (matching.length !== 1) throw new Error('Booking changed during Calendar sync; refresh and retry');
      }
      for (const link of params.links) {
        const row = rows.find((row) => row.booking_id === link.bookingId);
        Object.assign(row, { calendar_id: params.calendarId, calendar_event_id: link.eventId });
      }
      return [[]];
    },
  };
  const calendar = { events: {
    async insert(args, requestOptions) {
      assert.deepEqual(requestOptions, { timeout: 10000, retry: false });
      writes.push(args);
      if (events.has(args.requestBody.id)) throw Object.assign(new Error('Already exists'), { code: 409 });
      events.set(args.requestBody.id, args.requestBody);
      return { data: args.requestBody };
    },
    async get({ eventId }) { return { data: events.get(eventId) }; },
    async patch({ eventId, requestBody }) { events.set(eventId, { ...events.get(eventId), ...requestBody }); },
  } };
  return { bigquery, calendar, queries, rows, writes, events };
}

test('Wix event uses clinic timezone, mapped therapist and correct midnight duration without notifications', () => {
  const event = wixCalendarEvent(booking, options.timeZone);
  assert.deepEqual(event.start, { dateTime: '2026-10-01T23:30:00', timeZone: 'America/Toronto' });
  assert.deepEqual(event.end, { dateTime: '2026-10-02T01:00:00', timeZone: 'America/Toronto' });
  assert.match(event.description, /Therapist: Mapped therapist/);
  assert.match(event.description, /Booking: WIX-20261001-test/);
  assert.equal(event.extendedProperties.private.wixBookingId, booking.booking_id);
  assert.deepEqual(event.reminders, { useDefault: false });
  assert.equal(event.attendees, undefined);
  for (const changes of [{ date: '2026-02-30' }, { time: '13:00 PM' }, { duration_minutes: 0 }]) {
    assert.throws(() => wixCalendarEvent({ ...booking, ...changes }, options.timeZone), /invalid date, time or duration/);
  }
});

test('bounded backfill only creates pending Wix events and saves existing schema links; retry skips them', async () => {
  const rows = Array.from({ length: 27 }, (_, i) => ({ ...booking, booking_id: `WIX-${i}` }));
  rows.push({ ...booking, booking_id: 'LIVE-test' }, { ...booking, status: 'Cancelled' }, { ...booking, status: 'No Show' });
  const f = fixture(rows);
  assert.deepEqual(await syncWixCalendarBatch(f.bigquery, f.calendar, options), { synced: 25, pending: 2, errors: [] });
  assert.equal(f.queries.length, 3);
  assert.equal(f.queries.filter(({ query }) => query.startsWith('BEGIN')).length, 1);
  assert.deepEqual(await syncWixCalendarBatch(f.bigquery, f.calendar, options), { synced: 2, pending: 0, errors: [] });
  assert.deepEqual(await syncWixCalendarBatch(f.bigquery, f.calendar, options), { synced: 0, pending: 0, errors: [] });
  assert.equal(f.events.size, 27);
  for (const write of f.writes) {
    assert.match(write.requestBody.id, /^a11[a-f0-9]{64}$/);
    assert.match(write.requestBody.id, /^[0-9a-v]{5,1024}$/);
    assert.equal(write.calendarId, options.calendarId);
    assert.equal(write.sendUpdates, 'none');
  }
});

test('failed database linking recovers the existing deterministic event without duplication', async () => {
  const f = fixture();
  const originalQuery = f.bigquery.query;
  let failOnce = true;
  f.bigquery.query = async (args) => {
    if (args.query.startsWith('BEGIN') && failOnce) { failOnce = false; throw new Error('Concurrent booking change'); }
    return originalQuery(args);
  };
  const first = await syncWixCalendarBatch(f.bigquery, f.calendar, options);
  assert.equal(first.pending, 0);
  assert.equal(first.stopped, true);
  assert.equal(first.errors[0].message, 'Concurrent booking change');
  assert.equal(f.events.size, 1);
  f.rows[0].therapist_name = 'Corrected therapist';
  const second = await syncWixCalendarBatch(f.bigquery, f.calendar, options);
  assert.equal(second.synced, 1);
  assert.equal(f.events.size, 1);
  assert.match([...f.events.values()][0].description, /Corrected therapist/);
});

test('Calendar permission failures remain pending and never save success-shaped database links', async () => {
  const f = fixture();
  f.calendar.events.insert = async () => { throw Object.assign(new Error('Calendar access denied'), { code: 403 }); };
  const result = await syncWixCalendarBatch(f.bigquery, f.calendar, options);
  assert.equal(result.synced, 0);
  assert.equal(result.pending, 0);
  assert.equal(result.stopped, true);
  assert.equal(result.errors[0].message, 'Calendar access denied');
  assert.equal(f.rows[0].calendar_event_id, '');
  assert.equal(f.queries.filter(({ query }) => query.startsWith('BEGIN')).length, 0);
});

test('conflicting or deleted deterministic events are not overwritten or linked', async () => {
  for (const event of [{ extendedProperties: { private: { wixBookingId: 'someone-else' } } }, { status: 'cancelled' }]) {
    const f = fixture();
    f.calendar.events.insert = async () => { throw Object.assign(new Error('Conflict'), { code: 409 }); };
    f.calendar.events.get = async () => ({ data: event });
    const result = await syncWixCalendarBatch(f.bigquery, f.calendar, options);
    assert.equal(result.synced, 0);
    assert.match(result.errors[0].message, /Reconcile/);
    assert.equal(f.rows[0].calendar_event_id, '');
  }
});

test('25 Calendar writes run in five bounded parallel waves with one database transaction', { timeout: 2000 }, async () => {
  const f = fixture(Array.from({ length: 25 }, (_, i) => ({ ...booking, booking_id: `WIX-${i}` })));
  const insert = f.calendar.events.insert;
  let active = 0;
  let peak = 0;
  let waves = 0;
  const waiting = [];
  f.calendar.events.insert = async (...args) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => {
      waiting.push(resolve);
      if (waiting.length === 5) {
        waves += 1;
        for (const release of waiting.splice(0)) release();
      }
    });

    const result = await insert(...args);
    active -= 1;
    return result;
  };
  const result = await syncWixCalendarBatch(f.bigquery, f.calendar, options);
  assert.equal(result.synced, 25);
  assert.equal(peak, 5);
  assert.equal(waves, 5);
  assert.equal(f.queries.length, 3);
});

test('quota and timeout failures stop new scheduling instead of attempting all 25 bookings', async () => {
  for (const code of [429, 'ETIMEDOUT']) {
    const f = fixture(Array.from({ length: 25 }, (_, i) => ({ ...booking, booking_id: `WIX-${i}` })));
    let attempted = 0;
    f.calendar.events.insert = async () => {
      attempted += 1;
      throw Object.assign(new Error('Calendar temporarily unavailable'), { code });
    };
    const result = await syncWixCalendarBatch(f.bigquery, f.calendar, options);
    assert.equal(result.stopped, true);
    assert.equal(result.synced, 0);
    assert.equal(attempted, 5);
    assert.equal(result.pending, 20);
    assert.equal(result.errors.length, 5);
    assert.ok(f.rows.every((row) => !row.calendar_event_id));
  }
});

test('invalid bookings do not block valid bookings and exclusions are limited to the current run', async () => {
  const f = fixture([
    { ...booking, booking_id: 'WIX-bad', time: 'invalid' },
    { ...booking, booking_id: 'WIX-good' },
  ]);
  const result = await syncWixCalendarBatch(f.bigquery, f.calendar, options);
  assert.equal(result.synced, 1);
  assert.equal(result.pending, 0);
  assert.equal(result.stopped, undefined);
  assert.equal(result.errors[0].bookingId, 'WIX-bad');
  const skipped = await syncWixCalendarBatch(f.bigquery, f.calendar, { ...options, excludedIds: ['WIX-bad'] });
  assert.deepEqual(skipped, { synced: 0, pending: 0, errors: [] });
  f.rows[0].time = booking.time;
  assert.equal((await syncWixCalendarBatch(f.bigquery, f.calendar, options)).synced, 1);
});

test('a concurrent booking change prevents linking the entire batch, and retry recovers without duplicates', async () => {
  const f = fixture([{ ...booking, booking_id: 'WIX-1' }, { ...booking, booking_id: 'WIX-2' }]);
  const insert = f.calendar.events.insert;
  f.calendar.events.insert = async (...args) => {
    const result = await insert(...args);
    f.rows[0].time = '10:00 AM';
    return result;
  };
  const result = await syncWixCalendarBatch(f.bigquery, f.calendar, options);
  assert.equal(result.synced, 0);
  assert.equal(result.stopped, true);
  assert.equal(result.errors.length, 2);
  assert.ok(f.rows.every((row) => !row.calendar_event_id));
  assert.equal((await syncWixCalendarBatch(f.bigquery, f.calendar, options)).synced, 2);
  assert.equal(f.events.size, 2);
});

test('slow batches stop scheduling new work after 15 seconds and leave it resumable', async (t) => {
  const f = fixture(Array.from({ length: 25 }, (_, i) => ({ ...booking, booking_id: `WIX-${i}` })));
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const insert = f.calendar.events.insert;
  f.calendar.events.insert = async (...args) => {
    const result = await insert(...args);
    now = 15001;
    return result;
  };
  const result = await syncWixCalendarBatch(f.bigquery, f.calendar, options);
  assert.equal(result.synced, 5);
  assert.equal(result.pending, 20);
  assert.deepEqual(result.errors, []);
});

test('Calendar backfill endpoint enforces owner authentication, method, origin and no-store', async (t) => {
  Object.assign(process.env, {
    OWNER_ADMIN_PASSWORD: 'synthetic-owner-password-for-tests',
    OWNER_ADMIN_SESSION_SECRET: 'synthetic-session-secret-longer-than-thirty-two-characters',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com', GOOGLE_PRIVATE_KEY: 'synthetic-key-unused',
    GOOGLE_SPREADSHEET_ID: 'synthetic-spreadsheet',
    BIGQUERY_PROJECT_ID: options.projectId, BIGQUERY_DATASET: options.datasetId,
    BIGQUERY_BOOKINGS_TABLE: options.tableId, GOOGLE_PRIMARY_CALENDAR_ID: options.calendarId,
  });
  const f = fixture();
  t.mock.method(BigQuery.prototype, 'query', async (args) => {
    if (args.query.includes('ORDER BY created_at ASC')) return [f.rows];
    return f.bigquery.query(args);
  });
  t.mock.method(BigQuery.prototype, 'dataset', () => ({
    exists: async () => [true], table: () => ({ exists: async () => [true] }),
  }));
  t.mock.method(google, 'sheets', () => ({
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: 'Unavailability' } }] } }),
      values: { get: async ({ range }) => ({ data: { values: range === 'Unavailability!A1:J1' ? [['Block ID']] : [] } }) },
    },
  }));
  f.calendar.calendarList = { list: async () => ({ data: { items: [{ id: options.calendarId }] } }) };
  const pages = [];
  f.calendar.events.list = async ({ pageToken }) => {
    pages.push(pageToken);
    if (!pageToken) return { data: { items: [], nextPageToken: 'next-page' } };
    assert.equal(pageToken, 'next-page');
    return { data: { items: [...f.events.values()].map((event) => ({
    ...event, start: { dateTime: `${event.start.dateTime}-04:00` }, end: { dateTime: `${event.end.dateTime}-04:00` },
    })) } };
  };
  t.mock.method(google, 'calendar', () => f.calendar);
  const { default: handler } = await import('../api/booking.js');
  let cookie;
  async function request(view, { method = 'POST', origin = 'https://test.example', body = {} } = {}) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method, query: { view, date: booking.date }, headers: { host: 'test.example', origin, cookie, 'content-type': 'application/json' } });
    const res = {
      headers: {},
      setHeader(key, value) { this.headers[key] = value; if (key === 'Set-Cookie') cookie = value.split(';')[0]; },
      status(code) { this.code = code; return this; },
      json(data) { this.data = data; return this; },
    };
    await handler(req, res);
    return res;
  }
  assert.equal((await request('wix-calendar-sync')).code, 401);
  assert.equal((await request('owner-login', { body: { password: process.env.OWNER_ADMIN_PASSWORD } })).code, 200);
  assert.equal((await request('wix-calendar-sync', { method: 'GET' })).code, 405);
  assert.equal((await request('wix-calendar-sync', { origin: 'https://evil.example' })).code, 403);
  assert.equal((await request('wix-calendar-sync', { body: { excludedIds: ['LIVE-test'] } })).code, 400);
  assert.equal((await request('wix-calendar-sync', { body: { excludedIds: Array(101).fill('WIX-test') } })).code, 400);
  assert.equal(f.queries.length, 0);
  const synced = await request('wix-calendar-sync');
  assert.equal(synced.code, 200);
  assert.equal(synced.data.synced, 1);
  assert.equal(synced.headers['Cache-Control'], 'no-store');
  // Simulate a created event whose database link was interrupted.
  f.rows[0].calendar_event_id = '';
  const displayed = await request('calendar', { method: 'GET' });
  assert.equal(displayed.code, 200);
  assert.deepEqual(displayed.data.errors, []);
  assert.equal(displayed.data.events.length, 1);
  assert.equal(displayed.data.events[0].booking.id, booking.booking_id);
  assert.deepEqual(pages, [undefined, 'next-page']);
  // Clearing database history must not re-create a booking from its retained Wix event.
  f.rows.length = 0;
  const cleared = await request('calendar', { method: 'GET' });
  assert.equal(cleared.code, 200);
  assert.deepEqual(cleared.data.errors, []);
  assert.equal(cleared.data.events.length, 0);
  assert.equal(f.events.size, 1);
});
