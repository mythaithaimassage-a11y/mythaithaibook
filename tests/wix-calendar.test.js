import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import { BOOKING_TABLE_FIELDS } from '../lib/booking-schema.js';
import { isTransientCalendarError, retryCalendarOperation, syncWixCalendarBatch, validateWixSyncDateRange, wixCalendarEvent } from '../lib/wix-calendar.js';
import { createDashboardChallengeStore, handleDashboardChallengeQuery, readDashboardOtp } from './helpers/dashboard-auth.js';

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
        !['Cancelled', 'No Show'].includes(row.status) && !params.excludedIds?.includes(row.booking_id) &&
        (!params.startDate || row.date >= params.startDate && row.date <= params.endDate));
      if (params.startDate) assert.match(query, /date >= @startDate AND date <= @endDate/);
      if (query.startsWith('SELECT COUNT')) return [[{ pending: pending.length }]];
      if (query.startsWith('SELECT')) {
        assert.match(query, /ORDER BY booking_id LIMIT 500$/);
        return [pending.slice(0, 500).map((row) => ({ ...row }))];
      }
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

test('date ranges require both real dates in order and allow inclusive single-day sync', () => {
  validateWixSyncDateRange();
  validateWixSyncDateRange('2026-10-01', '2026-10-01');
  validateWixSyncDateRange('2024-02-29', '2026-10-01');
  for (const [start, end] of [
    ['2026-10-01', ''], ['', '2026-10-01'], ['2026-10-02', '2026-10-01'],
    ['2026-02-30', '2026-10-01'], ['2026-02-29', '2026-10-01'],
    ['10/01/2026', '2026-10-01'], [null, null], [20261001, '2026-10-01'],
  ]) {
    assert.throws(() => validateWixSyncDateRange(start, end), (error) => error.statusCode === 400);
  }
});

test('inclusive date range appends only missing bookings and keeps pending counts scoped across batches', async () => {
  const rows = [
    { ...booking, booking_id: 'WIX-before', date: '2026-09-30' },
    ...Array.from({ length: 501 }, (_, index) => ({
      ...booking, booking_id: `WIX-range-${String(index).padStart(3, '0')}`,
      date: index % 2 ? '2026-10-01' : '2026-10-02',
    })),
    { ...booking, booking_id: 'WIX-after', date: '2026-10-03' },
    { ...booking, booking_id: 'WIX-linked', calendar_event_id: 'existing-id', calendar_id: options.calendarId },
    { ...booking, booking_id: 'WIX-cancelled', status: 'Cancelled' },
    { ...booking, booking_id: 'WIX-no-show', status: 'No Show' },
  ];
  const f = fixture(rows);
  f.events.set('existing-id', { summary: 'Existing calendar appointment' });
  const range = { ...options, startDate: '2026-10-01', endDate: '2026-10-02' };
  const first = await syncWixCalendarBatch(f.bigquery, f.calendar, range);
  assert.equal(first.synced, 500);
  assert.equal(first.pending, 1);
  const second = await syncWixCalendarBatch(f.bigquery, f.calendar, range);
  assert.equal(second.synced, 1);
  assert.equal(second.pending, 0, 'Out-of-range bookings do not keep the selected run active');
  assert.equal((await syncWixCalendarBatch(f.bigquery, f.calendar, range)).synced, 0);
  assert.deepEqual(f.events.get('existing-id'), { summary: 'Existing calendar appointment' });
  assert.equal(f.rows.find((row) => row.booking_id === 'WIX-before').calendar_event_id, '');
  assert.equal(f.rows.find((row) => row.booking_id === 'WIX-after').calendar_event_id, '');
  for (const { query, params } of f.queries.filter(({ query }) => query.startsWith('SELECT'))) {
    assert.match(query, /date >= @startDate AND date <= @endDate/);
    assert.equal(params.startDate, range.startDate);
    assert.equal(params.endDate, range.endDate);
    assert.ok(!query.includes("'2026-10-01'"), 'Dates use query parameters');
  }
  assert.equal((await syncWixCalendarBatch(f.bigquery, f.calendar, { ...options, startDate: '2026-10-03', endDate: '2026-10-03' })).synced, 1);
  assert.equal((await syncWixCalendarBatch(f.bigquery, f.calendar, options)).synced, 1, 'Unfiltered sync still appends other missing dates');
});

test('invalid date ranges fail before database reads or calendar writes', async () => {
  const f = fixture();
  await assert.rejects(syncWixCalendarBatch(f.bigquery, f.calendar, { ...options, startDate: '2026-10-02', endDate: '2026-10-01' }), (error) => error.statusCode === 400);
  assert.equal(f.queries.length, 0);
  assert.equal(f.writes.length, 0);
});

test('bounded backfill only creates pending Wix events and saves existing schema links; retry skips them', async () => {
  const rows = Array.from({ length: 502 }, (_, i) => ({ ...booking, booking_id: `WIX-${i}` }));
  rows.push({ ...booking, booking_id: 'LIVE-test' }, { ...booking, status: 'Cancelled' }, { ...booking, status: 'No Show' });
  const f = fixture(rows);
  assert.deepEqual(await syncWixCalendarBatch(f.bigquery, f.calendar, options), { synced: 500, pending: 2, errors: [] });
  assert.equal(f.queries.length, 3);
  assert.equal(f.queries.filter(({ query }) => query.startsWith('BEGIN')).length, 1);
  assert.deepEqual(await syncWixCalendarBatch(f.bigquery, f.calendar, options), { synced: 2, pending: 0, errors: [] });
  assert.deepEqual(await syncWixCalendarBatch(f.bigquery, f.calendar, options), { synced: 0, pending: 0, errors: [] });
  assert.equal(f.events.size, 502);
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

test('500 Calendar writes run in 100 bounded parallel waves with one database transaction', { timeout: 5000 }, async () => {
  const f = fixture(Array.from({ length: 500 }, (_, i) => ({ ...booking, booking_id: `WIX-${i}` })));
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
  assert.equal(result.synced, 500);
  assert.equal(peak, 5);
  assert.equal(waves, 100);
  assert.equal(f.queries.length, 3);
});

test('500 bookings can complete after the former 15-second deadline within the extended budget', async (t) => {
  const f = fixture(Array.from({ length: 500 }, (_, i) => ({ ...booking, booking_id: `WIX-${i}` })));
  let now = 0;
  let written = 0;
  t.mock.method(Date, 'now', () => now);
  const insert = f.calendar.events.insert;
  f.calendar.events.insert = async (...args) => {
    const result = await insert(...args);
    written += 1;
    if (written % 5 === 0) now += 1000;
    return result;
  };
  assert.deepEqual(await syncWixCalendarBatch(f.bigquery, f.calendar, options), {
    synced: 500, pending: 0, errors: [],
  });
  assert.equal(now, 100000);
  assert.equal(f.queries.length, 3);
});

test('persistent quota and timeout failures stop new scheduling after bounded retries', async () => {
  for (const code of [429, 'ETIMEDOUT']) {
    const f = fixture(Array.from({ length: 500 }, (_, i) => ({ ...booking, booking_id: `WIX-${i}` })));
    let attempted = 0;
    f.calendar.events.insert = async () => {
      attempted += 1;
      throw Object.assign(new Error('Calendar temporarily unavailable'), { code });
    };
    const result = await syncWixCalendarBatch(f.bigquery, f.calendar, options);
    assert.equal(result.stopped, true);
    assert.equal(result.synced, 0);
    assert.equal(attempted, 15);
    assert.equal(result.pending, 495);
    assert.equal(result.errors.length, 5);
    assert.ok(f.rows.every((row) => !row.calendar_event_id));
  }
});

test('temporary Calendar errors are classified without retrying permission or validation failures', () => {
  for (const error of [
    { type: 'request-timeout', message: 'network timeout at: https://www.googleapis.com/calendar/v3/calendars/test/events' },
    { message: 'network timeout at: https://www.googleapis.com/calendar/v3/calendars/test/events' },
    { code: 'ECONNRESET' }, { cause: { code: 'ETIMEDOUT' } }, { response: { status: 503 } },
    { response: { status: 403, data: { error: { errors: [{ reason: 'userRateLimitExceeded' }] } } } },
  ]) assert.equal(isTransientCalendarError(error), true);
  for (const error of [{ code: 403 }, { code: 400 }, { code: 409 }, { code: 404 }, new Error('Unknown failure')]) {
    assert.equal(isTransientCalendarError(error), false);
  }
});

test('retry backoff is bounded, honors Retry-After and refuses retries beyond the batch deadline', async () => {
  const waits = [];
  let attempts = 0;
  const operation = async () => {
    attempts += 1;
    throw Object.assign(new Error('Temporary Google failure'), {
      response: { status: 429, headers: { 'retry-after': '2' } },
    });
  };
  await assert.rejects(retryCalendarOperation(operation, {
    deadline: Date.now() + 180000, random: () => 0, pause: async (wait) => { waits.push(wait); },
  }), /Temporary Google failure/);
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [2000, 2000]);
  attempts = 0;
  waits.length = 0;
  await assert.rejects(retryCalendarOperation(operation, {
    deadline: Date.now() + 1000, pause: async (wait) => { waits.push(wait); },
  }), /Temporary Google failure/);
  assert.equal(attempts, 1);
  assert.deepEqual(waits, []);
  const delays = [];
  let calls = 0;
  const result = await retryCalendarOperation(async () => {
    if (++calls < 3) throw Object.assign(new Error('Reset'), { code: 'ECONNRESET' });
    return 'recovered';
  }, { deadline: Date.now() + 180000, random: () => 0, pause: async (wait) => { delays.push(wait); } });
  assert.equal(result, 'recovered');
  assert.deepEqual(delays, [500, 1000]);
});

test('network timeout at the reported booking retries and continues the remaining queue', async () => {
  const failedId = 'WIX-20260326-1130-17766cc64e45bc0b0d1a691f82a01ed5';
  const f = fixture(Array.from({ length: 110 }, (_, i) => ({
    ...booking, booking_id: i === 104 ? failedId : `WIX-${i}`,
  })));
  const insert = f.calendar.events.insert;
  let attempts = 0;
  f.calendar.events.insert = async (...args) => {
    if (args[0].requestBody.extendedProperties.private.wixBookingId === failedId && ++attempts === 1) {
      throw Object.assign(new Error('network timeout at: https://www.googleapis.com/calendar/v3/calendars/test/events?sendUpdates=none'), {
        type: 'request-timeout',
      });
    }
    return insert(...args);
  };
  assert.deepEqual(await syncWixCalendarBatch(f.bigquery, f.calendar, options), {
    synced: 110, pending: 0, errors: [],
  });
  assert.equal(attempts, 2);
  assert.equal(f.events.size, 110);
});

test('an insert accepted by Google before a timeout is recovered without duplicate events', async () => {
  const f = fixture();
  const insert = f.calendar.events.insert;
  let attempts = 0;
  f.calendar.events.insert = async (...args) => {
    attempts += 1;
    const result = await insert(...args);
    if (attempts === 1) throw Object.assign(new Error('network timeout at: https://www.googleapis.com/calendar/v3/calendars/test/events'), {
      type: 'request-timeout',
    });
    return result;
  };
  assert.deepEqual(await syncWixCalendarBatch(f.bigquery, f.calendar, options), {
    synced: 1, pending: 0, errors: [],
  });
  assert.equal(attempts, 2);
  assert.equal(f.events.size, 1);
  assert.ok(f.rows[0].calendar_event_id);
});

test('temporary failures during conflict recovery retry both lookup and patch safely', async () => {
  const f = fixture();
  assert.equal((await syncWixCalendarBatch(f.bigquery, f.calendar, options)).synced, 1);
  f.rows[0].calendar_event_id = '';
  const get = f.calendar.events.get;
  const patch = f.calendar.events.patch;
  let gets = 0;
  let patches = 0;
  f.calendar.events.get = async (...args) => {
    if (++gets === 1) throw Object.assign(new Error('Google unavailable'), { code: 503 });
    return get(...args);
  };
  f.calendar.events.patch = async (...args) => {
    if (++patches === 1) throw Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
    return patch(...args);
  };
  assert.deepEqual(await syncWixCalendarBatch(f.bigquery, f.calendar, options), {
    synced: 1, pending: 0, errors: [],
  });
  assert.equal(gets, 3);
  assert.equal(patches, 2);
  assert.equal(f.events.size, 1);
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

test('slow batches stop scheduling new work after 180 seconds and leave it resumable', async (t) => {
  const f = fixture(Array.from({ length: 500 }, (_, i) => ({ ...booking, booking_id: `WIX-${i}` })));
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const insert = f.calendar.events.insert;
  f.calendar.events.insert = async (...args) => {
    const result = await insert(...args);
    now = 180001;
    return result;
  };
  const result = await syncWixCalendarBatch(f.bigquery, f.calendar, options);
  assert.equal(result.synced, 5);
  assert.equal(result.pending, 495);
  assert.deepEqual(result.errors, []);
});

test('Calendar backfill endpoint enforces owner authentication, method, origin and no-store', async (t) => {
  Object.assign(process.env, {
    OWNER_ADMIN_PASSWORD: 'synthetic-owner-password-for-tests',
    OWNER_ADMIN_EMAIL: 'owner@example.com',
    OWNER_ADMIN_SESSION_SECRET: 'synthetic-session-secret-longer-than-thirty-two-characters',
    GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client',
    GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'synthetic-refresh',
    GOOGLE_GMAIL_SENDER_EMAIL: 'sender@example.com',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com', GOOGLE_PRIVATE_KEY: 'synthetic-key-unused',
    GOOGLE_SPREADSHEET_ID: 'synthetic-spreadsheet',
    BIGQUERY_PROJECT_ID: options.projectId, BIGQUERY_DATASET: options.datasetId,
    BIGQUERY_BOOKINGS_TABLE: options.tableId, GOOGLE_PRIMARY_CALENDAR_ID: options.calendarId,
  });
  const f = fixture();
  const dashboardChallenges = createDashboardChallengeStore();
  const emails = [];
  t.mock.method(BigQuery.prototype, 'query', async (args) => {
    const dashboardAuthResult = handleDashboardChallengeQuery(args.query, args.params, dashboardChallenges);
    if (dashboardAuthResult) return dashboardAuthResult;
    if (args.query.includes('ORDER BY created_at ASC')) return [f.rows];
    return f.bigquery.query(args);
  });
  t.mock.method(BigQuery.prototype, 'dataset', () => ({
    exists: async () => [true], table: () => ({ exists: async () => [true], getMetadata: async () => [{ schema: { fields: BOOKING_TABLE_FIELDS } }] }),
  }));
  const blocks = [
    ['central-block', 'business', 'Mississauga Central', '', booking.date, '09:00', '10:00', 'Closed'],
    ['other-block', 'business', 'Other Clinic', '', booking.date, '09:00', '10:00', 'Closed'],
    ['all-block', 'business', '', '', booking.date, '12:00', '13:00', 'Closed'],
  ];
  t.mock.method(google, 'sheets', () => ({
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: 'Unavailability' } }] } }),
      values: { get: async ({ range }) => ({ data: {
        values: range === 'Unavailability!A1:J1' ? [['Block ID']] : range === 'Unavailability!A:J' ? blocks : [],
      } }) },
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
  t.mock.method(google, 'gmail', () => ({
    users: { messages: { send: async (options) => { emails.push(options); return { data: { id: 'otp-email' } }; } } },
  }));
  const { default: handler } = await import('../api/booking.js');
  let cookie;
  async function request(view, { method = 'POST', origin = 'https://test.example', body = {}, query = {} } = {}) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method, query: { view, date: booking.date, ...query }, headers: { host: 'test.example', origin, cookie, 'content-type': 'application/json' } });
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
  const login = await request('owner-login', { body: { email: process.env.OWNER_ADMIN_EMAIL, password: process.env.OWNER_ADMIN_PASSWORD } });
  assert.equal(login.code, 200);
  const verified = await request('owner-verify', {
    body: { challengeId: login.data.challengeId, code: readDashboardOtp(emails.at(-1)) },
  });
  assert.equal(verified.code, 200);
  assert.equal((await request('wix-calendar-sync', { method: 'GET' })).code, 405);
  assert.equal((await request('wix-calendar-sync', { origin: 'https://evil.example' })).code, 403);
  assert.equal((await request('wix-calendar-sync', { body: { excludedIds: ['LIVE-test'] } })).code, 400);
  assert.equal((await request('wix-calendar-sync', { body: { excludedIds: Array(101).fill('WIX-test') } })).code, 400);
  for (const body of [
    { startDate: '2026-10-02', endDate: '2026-10-01' },
    { startDate: '2026-02-30', endDate: '2026-10-01' },
    { startDate: '2026-10-01' },
    { startDate: null, endDate: null },
  ]) {
    assert.equal((await request('wix-calendar-sync', { body })).code, 400);
  }
  assert.equal(f.queries.length, 0);
  const outsideRange = await request('wix-calendar-sync', { body: { startDate: '2026-10-02', endDate: '2026-10-03' } });
  assert.equal(outsideRange.data.synced, 0);
  assert.equal(outsideRange.data.pending, 0);
  const synced = await request('wix-calendar-sync', { body: { startDate: booking.date, endDate: booking.date } });
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
  assert.equal(displayed.data.events[0].timeRange, '11:30 PM - 1:00 AM');
  assert.equal(displayed.data.events[0].localTime, '23:30', 'Hour grouping retains its 24-hour start time');
  assert.deepEqual(pages, [undefined, 'next-page']);
  const branchFiltered = await request('calendar', {
    method: 'GET', query: { branch: '123 Synthetic Street', branchName: 'Mississauga Central' },
  });
  assert.equal(branchFiltered.code, 200);
  assert.equal(branchFiltered.data.events.length, 1);
  assert.equal(branchFiltered.data.events[0].booking.id, booking.booking_id);
  assert.deepEqual(branchFiltered.data.unavailability.map((block) => block.id), ['central-block', 'all-block']);
  const nameOnly = await request('calendar', { method: 'GET', query: { branchName: ' mississauga central ' } });
  assert.equal(nameOnly.data.events.length, 1);
  const otherBranch = await request('calendar', {
    method: 'GET', query: { branch: '456 Other Street', branchName: 'Other Clinic' },
  });
  assert.equal(otherBranch.data.events.length, 0);
  assert.deepEqual(otherBranch.data.unavailability.map((block) => block.id), ['other-block', 'all-block']);
  const wrongDate = await request('calendar', { method: 'GET', query: { date: '2026-09-30' } });
  assert.equal(wrongDate.data.events.length, 0);
  const wrongTherapist = await request('calendar', {
    method: 'GET', query: { branchName: 'Mississauga Central', therapist: 'Another therapist' },
  });
  assert.equal(wrongTherapist.data.events.length, 0);
  const event = [...f.events.values()][0];
  event.location = '123 Synthetic Street';
  const legacyAddress = await request('calendar', { method: 'GET', query: { branch: '123 Synthetic Street' } });
  assert.equal(legacyAddress.data.events.length, 1);
  for (const [start, end, expected] of [
    ['11:00:00', '12:00:00', '11:00 AM - 12:00 PM'],
    ['10:00:00', '11:00:00', '10:00 AM - 11:00 AM'],
    ['13:15:00', '14:45:00', '1:15 PM - 2:45 PM'],
    ['12:00:00', '12:30:00', '12:00 PM - 12:30 PM'],
  ]) {
    event.start.dateTime = `${booking.date}T${start}`;
    event.end.dateTime = `${booking.date}T${end}`;
    const range = await request('calendar', { method: 'GET' });
    assert.equal(range.data.events[0].timeRange, expected);
  }
  // Clearing database history must not re-create a booking from its retained Wix event.
  f.rows.length = 0;
  const cleared = await request('calendar', { method: 'GET' });
  assert.equal(cleared.code, 200);
  assert.deepEqual(cleared.data.errors, []);
  assert.equal(cleared.data.events.length, 0);
  assert.equal(f.events.size, 1);
});
