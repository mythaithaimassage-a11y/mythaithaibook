import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingActivityRecord, ensureBookingActivityTable, readBookingActivity } from '../lib/booking-activity.js';
import { readBookingNotifications } from '../lib/booking-notifications.js';

const row = ['MTT-1', 'Jane', '555', 'jane@example.com', 'Test Branch', 'Thai Massage', 'Nok', '2026-10-20', '11:30 AM'];
row[12] = 90;

test('activity records capture the booking snapshot, previous slot and actor', () => {
  const record = bookingActivityRecord('rescheduled', row, {
    previousDate: '2026-10-19', previousTime: '10:00 AM', actor: 'customer', now: '2026-10-17T15:00:00.000Z',
  });
  assert.equal(record.id, 'rescheduled-MTT-1-2026-10-17T15:00:00.000Z');
  assert.equal(record.booking_id, 'MTT-1');
  assert.equal(record.duration_minutes, 90);
  assert.equal(record.previous_date, '2026-10-19');
  assert.equal(record.previous_time, '10:00 AM');
  assert.equal(record.actor, 'customer');
  assert.throws(() => bookingActivityRecord('unknown', row), /Unknown booking activity type/);
});

test('activity table is created only when missing', async () => {
  const created = [];
  let exists = false;
  const bigquery = { dataset: () => ({
    table: () => ({ exists: async () => [exists] }),
    createTable: async (name, options) => { created.push({ name, options }); },
  }) };
  await ensureBookingActivityTable(bigquery, 'ds', 'booking_activity');
  assert.equal(created.length, 1);
  assert.ok(created[0].options.schema.some((field) => field.name === 'previous_time'));
  exists = true;
  await ensureBookingActivityTable(bigquery, 'ds', 'booking_activity');
  assert.equal(created.length, 1);
});

function activityBigQuery() {
  return { query: async ({ query }) => {
    if (query.includes('`bookings`')) {
      return [[
        { booking_id: 'new-1', customer_name: 'Ann', branch_name: 'Test Branch', created_at: '2026-10-17T15:00:30.000Z', duration_minutes: 60 },
        { booking_id: 'new-2', customer_name: 'Bob', branch_name: 'Other Branch', created_at: '2026-10-17T15:00:40.000Z', duration_minutes: 60 },
      ]];
    }
    return [[
      { id: 'cancelled-x', booking_id: 'x', type: 'cancelled', branch_name: 'Test Branch', created_at: '2026-10-17T15:00:50.000Z', duration_minutes: 60, actor: 'customer' },
      { id: 'rescheduled-y', booking_id: 'y', type: 'rescheduled', branch_name: 'test branch', previous_date: '2026-10-18', previous_time: '10:00 AM', created_at: '2026-10-17T15:00:20.000Z' },
    ]];
  } };
}

test('activity feed merges new bookings with logged changes, newest first, within branch access', async () => {
  const events = await readBookingActivity(activityBigQuery(), {
    bookingsTable: '`bookings`', activityTable: '`booking_activity`', from: '2026-10-17T00:00:00.000Z', to: '2026-10-17T16:00:00.000Z',
    allowedBranches: new Set(['test branch']),
  });
  assert.deepEqual(events.map(({ type, bookingId }) => `${type}:${bookingId}`), ['cancelled:x', 'created:new-1', 'rescheduled:y']);
  assert.equal(events[2].previousTime, '10:00 AM');
  assert.equal(events[0].actor, 'customer');
});

test('notification polling includes reschedules and cancellations when the activity table is supplied', async () => {
  const now = '2026-10-17T15:01:00.000Z';
  const result = await readBookingNotifications(activityBigQuery(), '`bookings`', '2026-10-17T15:00:00.000Z', null, now, '`booking_activity`');
  assert.equal(result.cursor, now);
  assert.deepEqual(result.notifications.map(({ type }) => type), ['rescheduled', 'created', 'created', 'cancelled']);
  assert.equal(result.notifications[1].id, 'new-1', 'New-booking alerts keep the booking ID as their stable ID');
});
