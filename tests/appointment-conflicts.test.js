import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../api/booking.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('booking.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let eventGuard, deletion;
const helpers = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ['calendarBookingReference', 'parseBookingFieldsFromDescription'].includes(node.name?.text)) helpers.push(node.getText(ast));
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'isBlockingCalendarEvent') eventGuard = node.getText(ast);
  if (ts.isIfStatement(node) && node.expression.getText(ast) === "req.method === 'POST' && req.query?.view === 'delete-booking'") {
    deletion = node.thenStatement.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const blocks = vm.runInNewContext(`${helpers.join('\n')}\n(${eventGuard})`);
const row = (status = 'Confirmed') => Object.assign([], { 0: 'booking-1', 16: 'event-1', 24: status });

test('cancelled events and cancelled/no-show linked bookings never block therapists', () => {
  assert.equal(blocks({ id: 'event-1', status: 'cancelled' }, []), false);
  for (const status of ['Cancelled', 'No Show']) {
    assert.equal(blocks({ id: 'event-1' }, [row(status)]), false);
  }
  assert.equal(blocks({ id: 'event-1' }, [row()]), true);
  assert.equal(blocks({ id: 'event-1' }, [row('Completed')]), true, 'Completed appointments still occupy their actual time');
  assert.equal(blocks({ id: 'standalone-event' }, []), true, 'Unlinked live calendar events are real appointments');
});

test('retained Wix history events without saved bookings match the calendar display exclusion', () => {
  const event = { id: 'event-1', extendedProperties: { private: { wixBookingId: 'booking-1' } } };
  assert.equal(blocks(event, []), false);
  assert.equal(blocks(event, [row()]), true);
  assert.equal(blocks(event, [row('Cancelled')]), false);
});

test('retained app events resolve the original reference from metadata or description without blocking deleted bookings', () => {
  for (const event of [
    { id: 'replacement-event', description: 'Booking: booking-1\nCustomer: Renamed client' },
    { id: 'replacement-event', extendedProperties: { private: { bookingId: 'booking-1' } } },
  ]) {
    assert.equal(blocks(event, []), false);
    assert.equal(blocks(event, [row()]), true);
    assert.equal(blocks(event, [row('Cancelled')]), false);
  }
});

async function deleteBooking(calendarError) {
  const calls = [];
  const res = {
    status(code) { this.code = code; return this; },
    json(data) { this.data = data; return this; },
  };
  await vm.runInNewContext(`(async () => ${deletion})()`, {
    req: { body: { bookingId: 'booking-1' } }, res, PRIMARY_CALENDAR_ID: 'primary', sheets: {},
    dashboardSession: { email: 'owner@example.com' },
    getBigQueryClient: () => ({}),
    bqFetchBookingRows: async () => ({ data: { values: [row()] } }),
    readPackageUsage: () => null,
    calendarApi: { events: { delete: async () => {
      calls.push('calendar');
      if (calendarError) throw calendarError;
    } } },
    bqDeleteBookingRow: async () => { calls.push('database'); },
    logBookingActivity: async () => { calls.push('activity'); },
    syncMarketingContactsWithDatabase: async () => { calls.push('contacts'); return 0; },
    console: { error() {} },
  });
  return { res, calls };
}

test('app deletion removes the event before its saved booking and activity records do not reserve slots', async () => {
  const { res, calls } = await deleteBooking();
  assert.equal(res.code, 200);
  assert.equal(res.data.deleted, true);
  assert.deepEqual(calls, ['calendar', 'database', 'activity', 'contacts']);
});

test('calendar cleanup failure keeps the booking and reports a retryable error rather than leaving an orphan event', async () => {
  const { res, calls } = await deleteBooking(Object.assign(new Error('Calendar unavailable'), { code: 503 }));
  assert.equal(res.code, 502);
  assert.match(res.data.message, /booking was kept/);
  assert.equal(res.data.deleted, undefined);
  assert.deepEqual(calls, ['calendar']);
});

test('already deleted calendar events allow booking deletion to finish', async () => {
  for (const code of [404, 410]) {
    const { res, calls } = await deleteBooking(Object.assign(new Error('Event is gone'), { code }));
    assert.equal(res.code, 200);
    assert.equal(res.data.deleted, true);
    assert.equal(res.data.calendarDeleted, true);
    assert.ok(calls.includes('database'));
  }
});
