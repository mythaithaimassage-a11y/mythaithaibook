import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function availabilityHarness(data, staff = false, ok = true) {
  let now = 1000;
  let stateIndex = 0;
  let effectIndex = 0;
  let nextTimer = 0;
  const states = [], effects = [], timers = new Map(), requests = [];
  const hooks = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useEffect(callback, deps) {
      const index = effectIndex++;
      if (!effects[index] || deps.some((value, key) => value !== effects[index].deps[key])) {
        effects[index]?.cleanup?.();
        effects[index] = { deps, cleanup: callback() };
      }
    },
  };
  const source = readFileSync(new URL('../src/useTherapistAvailability.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    require: (name) => name === 'react' ? hooks : {},
    Date: { now: () => now },
    URLSearchParams,
    AbortController,
    fetch: async (url) => { requests.push(url); return { ok, json: async () => data }; },
    setTimeout: (callback, delay) => { timers.set(++nextTimer, { callback, at: now + delay }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
  });
  const render = () => {
    stateIndex = effectIndex = 0;
    return (staff ? module.exports.default : module.exports.useBookingSlotAvailability)({
      branchId: 1, date: '2026-11-10', times: ['11:30 AM', '11:45 AM'], durationMinutes: 60, isRmt: false,
      ...(staff ? { time: '01:00 PM' } : {}),
    });
  };
  return {
    render, requests,
    advance(value) {
      now = value;
      for (const [id, timer] of timers) {
        if (timer.at <= now) { timers.delete(id); timer.callback(); }
      }
    },
  };
}

test('staff availability explicitly identifies staff requests and preserves exclusion reasons', async () => {
  const unavailableTherapists = [{ id: 5, name: 'TANYA', reason: 'Time off overlaps this appointment.' }];
  const ui = availabilityHarness({ therapistIds: [1, 2, 3, 4, 6], unavailableTherapists }, true);
  ui.render();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(ui.requests[0], /staffBooking=true/);
  assert.doesNotMatch(ui.requests[0], /publicBooking=true/);
  assert.equal(ui.render().therapistIds.size, 5, 'There is no four-therapist cap');
  assert.equal(ui.render().unavailableTherapists[0].name, 'TANYA');
  assert.equal(ui.render().unavailableTherapists[0].reason, unavailableTherapists[0].reason);
});

test('expired staff sessions report an explicit error instead of an empty successful roster', async () => {
  const message = 'Your dashboard session has expired. Sign in again to check staff appointment availability.';
  const ui = availabilityHarness({ message }, true, false);
  ui.render();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ui.render().error, message);
  assert.equal(ui.render().loading, false);
  assert.equal(ui.render().therapistIds.size, 0);
});

test('invalid staff exclusion details are reported rather than rendered as verified reasons', async () => {
  const ui = availabilityHarness({ therapistIds: [1], unavailableTherapists: [{ id: 2, reason: 'missing name' }] }, true);
  ui.render();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(ui.render().error, /could not be verified/);
  assert.equal(ui.render().therapistIds.size, 0);
});

test('public slots expire in an open portal at the server-provided notice deadline', async () => {
  const ui = availabilityHarness({
    therapistIdsByTime: { '11:30 AM': [1], '11:45 AM': [] },
    unassignedTherapistCountByTime: { '11:30 AM': 0, '11:45 AM': 1 },
    bookingCutoffsByTime: { '11:30 AM': 2000, '11:45 AM': 3000 },
  });
  ui.render();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(ui.requests[0], /publicBooking=true/);
  assert.deepEqual(Array.from(ui.render().therapistIdsByTime['11:30 AM']), ['1']);
  ui.advance(2000);
  assert.equal(ui.render().therapistIdsByTime['11:30 AM'].length, 1, 'Exact deadline is still bookable');
  ui.advance(2001);
  let result = ui.render();
  assert.equal(result.therapistIdsByTime['11:30 AM'].length, 0);
  assert.equal(result.unassignedTherapistCountByTime['11:45 AM'], 1);
  ui.advance(3001);
  result = ui.render();
  assert.equal(result.unassignedTherapistCountByTime['11:45 AM'], 0, 'Anonymous capacity expires too');
});

test('missing booking notice metadata is surfaced rather than allowing unverified slots', async () => {
  const ui = availabilityHarness({
    therapistIdsByTime: { '11:30 AM': [1], '11:45 AM': [1] },
    unassignedTherapistCountByTime: { '11:30 AM': 0, '11:45 AM': 0 },
  });
  ui.render();
  await new Promise((resolve) => setImmediate(resolve));
  const result = ui.render();
  assert.match(result.error, /Booking notice could not be verified/);
  assert.equal(Object.keys(result.therapistIdsByTime).length, 2);
  assert.equal(result.therapistIdsByTime['11:30 AM'].length, 0);
});
