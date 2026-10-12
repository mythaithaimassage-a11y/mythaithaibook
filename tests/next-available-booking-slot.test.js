import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadAvailabilityHook(fetch) {
  let state;
  let initialized = false;
  let effectDependencies;
  let cleanup;
  const react = {
    useState(initial) {
      if (!initialized) {
        state = typeof initial === 'function' ? initial() : initial;
        initialized = true;
      }
      return [state, (next) => { state = typeof next === 'function' ? next(state) : next; }];
    },
    useEffect(callback, dependencies) {
      if (!effectDependencies || dependencies.some((value, index) => value !== effectDependencies[index])) {
        cleanup?.();
        effectDependencies = dependencies;
        cleanup = callback();
      }
    },
  };
  const source = readFileSync(new URL('../src/useTherapistAvailability.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: 'useTherapistAvailability.ts',
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    require(specifier) {
      if (specifier === 'react') return react;
      if (specifier === '../lib/booking-options.js') {
        return { branchAppointmentTimes: (_branch, date) => date === '2026-10-12' ? [] : ['10:00 AM', '10:15 AM'] };
      }
      if (specifier === '../lib/work-schedule.js') return { isTherapistScheduledAtBranch: () => true };
      throw new Error(`Unexpected import: ${specifier}`);
    },
    fetch,
    URLSearchParams,
    AbortController,
  });
  return { useNextAvailableBookingSlot: module.exports.useNextAvailableBookingSlot };
}

test('next available search skips closed dates and returns the earliest eligible slot', async () => {
  const requests = [];
  const { useNextAvailableBookingSlot } = loadAvailabilityHook(async (url) => {
    const query = new URL(url, 'https://booking.example').searchParams;
    requests.push({ date: query.get('date'), times: JSON.parse(query.get('times')) });
    return {
      ok: true,
      json: async () => ({
        therapistIdsByTime: {
          '10:00 AM': [],
          '10:15 AM': ['therapist-1'],
        },
        unassignedTherapistCountByTime: {
          '10:00 AM': 0,
          '10:15 AM': 0,
        },
      }),
    };
  });

  test('next available search accepts anonymous therapist capacity without disclosing a therapist ID', async () => {
    const { useNextAvailableBookingSlot } = loadAvailabilityHook(async () => ({
      ok: true,
      json: async () => ({
        therapistIdsByTime: { '10:00 AM': [] },
        unassignedTherapistCountByTime: { '10:00 AM': 1 },
      }),
    }));
    const request = {
      branch: { id: 1 },
      date: '2026-10-11',
      durationMinutes: 60,
      isRmt: false,
      therapistCount: 1,
      enabled: true,
      therapists: [{ id: 'therapist-1', branches: [1] }],
    };
    useNextAvailableBookingSlot(request);
    await new Promise((resolve) => setImmediate(resolve));
    const result = useNextAvailableBookingSlot(request);
    assert.equal(result.slot.date, '2026-10-13');
    assert.equal(result.slot.time, '10:00 AM');
  });
  const request = {
    branch: { id: 1 },
    date: '2026-10-11',
    durationMinutes: 60,
    isRmt: false,
    therapistCount: 1,
    enabled: true,
    therapists: [{ id: 'therapist-1', branches: [1] }],
  };
  useNextAvailableBookingSlot(request);
  await new Promise((resolve) => setImmediate(resolve));
  const result = useNextAvailableBookingSlot(request);
  assert.deepEqual(requests, [{ date: '2026-10-13', times: ['10:00 AM', '10:15 AM'] }]);
  assert.equal(result.slot.date, '2026-10-13');
  assert.equal(result.slot.time, '10:15 AM');
  assert.equal(result.loading, false);
  assert.equal(result.error, '');
});
