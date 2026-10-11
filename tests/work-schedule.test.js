import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultTherapistShift,
  intervalsOverlap,
  isTherapistScheduledAtBranch,
  shiftCoversAppointment,
  validDate,
  validMonth,
} from '../lib/work-schedule.js';

test('weekly branch schedules fall back to a default ten-to-eight shift', () => {
  const therapist = { id: 7, branches: [2], schedule: {} };
  const shift = defaultTherapistShift(therapist, 2, '2026-11-02');
  assert.deepEqual(shift, {
    therapistId: 7, branchId: 2, date: '2026-11-02', isWorking: true,
    startTime: '10:00', endTime: '20:00', isOverride: false,
  });
  assert.equal(isTherapistScheduledAtBranch(therapist, 2, '2026-11-02'), true);
  assert.equal(isTherapistScheduledAtBranch(therapist, 3, '2026-11-02'), false);
  assert.equal(defaultTherapistShift(therapist, 2, 'invalid').isWorking, false);
});

test('an explicit weekly rotation takes precedence over static branch assignments', () => {
  const therapist = { id: 8, branches: [2], schedule: { mon: 3, tue: null } };
  assert.equal(isTherapistScheduledAtBranch(therapist, 2, '2026-11-02'), false);
  assert.equal(isTherapistScheduledAtBranch(therapist, 3, '2026-11-02'), true);
  assert.equal(isTherapistScheduledAtBranch(therapist, 2, '2026-11-03'), false);
});

test('date-specific shifts enforce working state, exact coverage and valid month/date inputs', () => {
  const shift = { date: '2026-11-02', isWorking: true, startTime: '12:00', endTime: '18:00' };
  assert.equal(shiftCoversAppointment(shift, '2026-11-02', '12:00', 60), true);
  assert.equal(shiftCoversAppointment(shift, '2026-11-02', '17:00', 60), true);
  assert.equal(shiftCoversAppointment(shift, '2026-11-02', '17:15', 60), false);
  assert.equal(shiftCoversAppointment({ ...shift, isWorking: false }, '2026-11-02', '13:00', 60), false);
  assert.equal(validMonth('2026-11'), true);
  assert.equal(validMonth('2026-13'), false);
  assert.equal(validDate('2026-11-30'), true);
  assert.equal(validDate('2026-02-30'), false);
});

test('appointment intervals use half-open overlap boundaries', () => {
  assert.equal(intervalsOverlap(600, 660, 660, 720), false);
  assert.equal(intervalsOverlap(600, 660, 645, 720), true);
});
