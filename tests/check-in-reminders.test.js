import assert from 'node:assert/strict';
import test from 'node:test';
import { createTsLoader } from './helpers/load-ts-module.js';

const load = createTsLoader({});
const { overdueCheckIns } = load(new URL('../src/CheckInReminders.tsx', import.meta.url).pathname);
const booking = {
  id: 'reminder', date: '2026-10-11', time: '04:30 PM',
  customerName: 'Client', branchName: 'Central', status: 'Confirmed',
};

test('check-in reminder starts exactly ten minutes after the appointment in clinic time', () => {
  assert.equal(overdueCheckIns([booking], new Date('2026-10-11T20:39:59Z')).length, 0);
  assert.equal(overdueCheckIns([booking], new Date('2026-10-11T20:40:00Z')).length, 1);
  assert.equal(overdueCheckIns([{ ...booking, time: '16:30 - 17:30' }], new Date('2026-10-11T20:40:00Z')).length, 1);
  assert.equal(overdueCheckIns([booking], new Date('2026-10-12T04:00:00Z')).length, 0);
});

test('checked-in, completed, cancelled, no-show, future and invalid appointments do not trigger reminders', () => {
  const now = new Date('2026-10-11T20:40:00Z');
  for (const change of [
    { checkedInAt: '2026-10-11T20:35:00Z' }, { status: 'Completed' },
    { status: 'Cancelled' }, { status: 'No Show' }, { date: '2026-10-12' },
    { time: '05:00 PM' }, { time: 'invalid' }, { time: '25:00' },
  ]) assert.equal(overdueCheckIns([{ ...booking, ...change }], now).length, 0);
});

test('winter clinic time and appointment ordering are respected', () => {
  const winter = { ...booking, date: '2026-12-01' };
  assert.equal(overdueCheckIns([winter], new Date('2026-12-01T21:39:00Z')).length, 0);
  assert.equal(overdueCheckIns([winter], new Date('2026-12-01T21:40:00Z')).length, 1);
  assert.deepEqual(overdueCheckIns([booking, { ...booking, id: 'earlier', time: '04:00 PM' }],
    new Date('2026-10-11T20:40:00Z')).map(({ booking }) => booking.id), ['earlier', 'reminder']);
});
