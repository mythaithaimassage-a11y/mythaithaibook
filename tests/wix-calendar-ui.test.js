import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runWixCalendarSync } from '../src/runWixCalendarSync.js';

test('calendar sync offers inclusive date controls and sends a fixed range on every batch', () => {
  const source = readFileSync(new URL('../src/WixCalendarSync.tsx', import.meta.url), 'utf8');
  assert.match(source, /<option value="all">\{tr\('All dates'\)\}<\/option>/);
  assert.match(source, /<option value="range">\{tr\('Selected date range'\)\}<\/option>/);
  assert.match(source, /Start date/);
  assert.match(source, /End date \(inclusive\)/);
  assert.equal((source.match(/type="date" required disabled=\{busy\}/g) || []).length, 2);
  assert.match(source, /startDate > endDate/);
  assert.match(source, /const dateRange = scope === 'range' \? \{ startDate, endDate \} : \{\}/);
  assert.match(source, /JSON\.stringify\(\{ excludedIds, \.\.\.dateRange \}\)/);
  assert.match(source, /Existing synced appointments are unchanged/);
});

test('date-filtered batch requests retain the range while excluding failures and finishing at scoped zero pending', async () => {
  const dateRange = { startDate: '2026-10-01', endDate: '2026-10-31' };
  const requests = [];
  const batches = [{ synced: 500, pending: 2, errors: [] }, { synced: 2, pending: 0, errors: [] }];
  const result = await runWixCalendarSync(async (excludedIds = []) => {
    requests.push({ excludedIds, ...dateRange });
    return batches.shift();
  }, () => {});
  assert.equal(result.synced, 502);
  assert.deepEqual(requests, [{ excludedIds: [], ...dateRange }, { excludedIds: [], ...dateRange }]);
});

test('shared dashboard/import sync continues batches, reports cumulative progress, and finishes only at zero pending', async () => {
  const batches = [
    { synced: 10, pending: 2, errors: [] },
    { synced: 2, pending: 0, errors: [] },
  ];
  const progress = [];
  const result = await runWixCalendarSync(async () => batches.shift(), (value) => progress.push(value));
  assert.deepEqual(result, { synced: 12, pending: 0 });
  assert.deepEqual(progress, [{ synced: 10, pending: 2 }, { synced: 12, pending: 0 }]);
});

test('automatic import sync includes initial batch and avoids another request when complete', async () => {
  const result = await runWixCalendarSync(
    async () => { throw new Error('Unexpected request'); },
    () => {},
    { synced: 3, pending: 0, errors: [] },
  );
  assert.equal(result.synced, 3);
});

test('errors and stalled batches stop sync with explicit resumable failure instead of reporting completion', async () => {
  await assert.rejects(runWixCalendarSync(
    async () => ({ synced: 1, pending: 2, stopped: true, errors: [{ bookingId: 'WIX-test', message: 'Calendar permission denied' }] }),
    () => {},
  ), /WIX-test: Calendar permission denied.*Retry/);
  await assert.rejects(runWixCalendarSync(
    async () => ({ synced: 0, pending: 1, errors: [] }), () => {},
  ), /made no progress/);
  await assert.rejects(runWixCalendarSync(
    async () => { throw new Error('Network unavailable'); }, () => {},
  ), /Network unavailable/);
});

test('individual failures are skipped across subsequent batches and reported after valid bookings finish', async () => {
  const exclusions = [];
  const batches = [
    { synced: 24, pending: 3, errors: [{ bookingId: 'WIX-bad', message: 'Invalid time' }] },
    { synced: 3, pending: 0, errors: [] },
  ];
  const progress = [];
  await assert.rejects(runWixCalendarSync(async (ids = []) => {
    exclusions.push(ids);
    return batches.shift();
  }, async (value) => {
    await Promise.resolve();
    progress.push(value);
  }), /27 bookings synced.*WIX-bad: Invalid time.*Retry/);
  assert.deepEqual(exclusions, [[], ['WIX-bad']]);
  assert.deepEqual(progress, [{ synced: 24, pending: 3 }, { synced: 27, pending: 0 }]);
});

test('a batch of only invalid rows still advances to valid bookings instead of blocking the queue', async () => {
  const batches = [
    { synced: 0, pending: 1, errors: [{ bookingId: 'WIX-bad', message: 'Invalid date' }] },
    { synced: 1, pending: 0, errors: [] },
  ];
  await assert.rejects(runWixCalendarSync(async () => batches.shift(), () => {}), /1 bookings synced.*Invalid date/);
  assert.equal(batches.length, 0);
});

test('a server that ignores exclusions cannot cause an endless sync loop', async () => {
  let requests = 0;
  await assert.rejects(runWixCalendarSync(async () => {
    requests += 1;
    return { synced: 1, pending: 1, errors: [{ bookingId: 'WIX-bad', message: 'Invalid date' }] };
  }, () => {}), /2 bookings synced.*Invalid date/);
  assert.equal(requests, 2);
});

test('persistent timeouts explain safe retry without requiring booking edits', async () => {
  await assert.rejects(runWixCalendarSync(async () => ({
    synced: 105, pending: 1518, stopped: true,
    errors: [{ bookingId: 'WIX-test', message: 'network timeout at: https://www.googleapis.com/calendar/v3/calendars/test/events' }],
  }), () => {}), /105 bookings synced.*Retry Wix Calendar sync to resume safely.*do not require booking edits/);
});
