import assert from 'node:assert/strict';
import test from 'node:test';
import { runWixCalendarSync } from '../src/runWixCalendarSync.js';

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
    async () => ({ synced: 1, pending: 2, errors: [{ bookingId: 'WIX-test', message: 'Calendar permission denied' }] }),
    () => {},
  ), /WIX-test: Calendar permission denied.*Retry/);
  await assert.rejects(runWixCalendarSync(
    async () => ({ synced: 0, pending: 1, errors: [] }), () => {},
  ), /made no progress/);
  await assert.rejects(runWixCalendarSync(
    async () => { throw new Error('Network unavailable'); }, () => {},
  ), /Network unavailable/);
});
