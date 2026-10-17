import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingAlertRecipients, deliverBookingAlerts, readBookingNotifications } from '../lib/booking-notifications.js';

test('active dashboard owners and branch staff receive deduplicated alerts, not therapists or other branches', () => {
  const users = [
    { email: 'OWNER@example.com', role: 'owner', status: 'active' },
    { email: 'front@example.com', role: 'branch_receptionist', status: 'active', branch_ids: '[1]' },
    { email: 'manager@example.com', role: 'branch_manager', status: 'active', branch_ids: '["1"]' },
    { email: 'other@example.com', role: 'branch_receptionist', status: 'active', branch_ids: '[2]' },
    { email: 'disabled@example.com', role: 'owner', status: 'inactive' },
    { email: 'therapist@example.com', role: 'therapist', status: 'active' },
  ];
  assert.deepEqual(bookingAlertRecipients(users, 1, 'owner@example.com'), ['owner@example.com', 'front@example.com', 'manager@example.com']);
  assert.throws(() => bookingAlertRecipients([{ ...users[1], branch_ids: '{}' }], 1), /Invalid dashboard/);
});

test('staff email failure does not suppress delivery to other recipients and is reported', async (t) => {
  t.mock.method(console, 'error', () => {});
  const attempted = [];
  const result = await deliverBookingAlerts(['owner@example.com', 'front@example.com'], async (email) => {
    attempted.push(email);
    if (email === 'owner@example.com') throw new Error('Mailbox unavailable');
  });
  assert.equal(attempted.length, 2);
  assert.equal(result.sent, 1);
  assert.deepEqual(result.failures, [{ email: 'owner@example.com', message: 'Mailbox unavailable' }]);
  await assert.rejects(deliverBookingAlerts([], async () => {}), /No active dashboard staff/);
});

test('notification feed baselines without backfill, overlaps polling reads and enforces branch access', async () => {
  const now = '2026-10-17T15:01:00.000Z';
  const calls = [];
  const bigquery = { query: async (request) => {
    calls.push(request);
    return [[
      { booking_id: 'a', branch_name: 'Test Branch', created_at: now, duration_minutes: 90 },
      { booking_id: 'b', branch_name: 'Other Branch', created_at: now, duration_minutes: 60 },
    ]];
  } };
  assert.deepEqual(await readBookingNotifications(bigquery, '`bookings`', '', null, now), { cursor: now, notifications: [] });
  assert.equal(calls.length, 0);
  const result = await readBookingNotifications(bigquery, '`bookings`', '2026-10-17T15:00:00.000Z', new Set(['test branch']), now);
  assert.equal(calls[0].params.from, '2026-10-17T14:58:00.000Z');
  assert.deepEqual(result.notifications.map(({ id }) => id), ['a']);
  assert.equal(result.notifications[0].durationMinutes, 90);
  assert.equal((await readBookingNotifications(bigquery, '`bookings`', now, null, now)).notifications.length, 2);
  assert.equal((await readBookingNotifications(bigquery, '`bookings`', now, new Set(), now)).notifications.length, 0);
  await assert.rejects(readBookingNotifications(bigquery, '`bookings`', 'invalid', null, now), { statusCode: 400 });
});
