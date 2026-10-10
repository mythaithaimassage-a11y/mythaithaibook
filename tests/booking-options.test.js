import assert from 'node:assert/strict';
import test from 'node:test';
import { AVAILABLE_TIMES, BOOKING_DEPOSIT_AMOUNT, branchPaymentOptions, validateBranchPaymentOptions, bookingCategories, validateAppointmentTime, defaultBusinessHours, validateBusinessHours, branchAppointmentTimes, businessHoursForDate } from '../lib/booking-options.js';
import { emptyPatientHistory, validatePatientHistory, patientHistoryValues, HISTORY_CONDITION_FIELDS } from '../lib/patient-history.js';
import { anatomicalBodyParts } from '../lib/body-map.js';

test('appointments start at 10 AM with every quarter-hour through 7 PM', () => {
  assert.equal(AVAILABLE_TIMES.length, 37);
  assert.equal(AVAILABLE_TIMES[0], '10:00 AM');
  assert.equal(AVAILABLE_TIMES.at(-1), '07:00 PM');
  assert.equal(new Set(AVAILABLE_TIMES).size, 37);
  for (const time of AVAILABLE_TIMES) assert.doesNotThrow(() => validateAppointmentTime(time));
  for (const time of ['09:30 AM', '09:45 AM', '07:15 PM', '10:05 AM', '13:00 PM', '']) {
    assert.throws(() => validateAppointmentTime(time), /10:00 AM/);
  }
  assert.equal(BOOKING_DEPOSIT_AMOUNT, 10);
});

test('all seven weekdays default to 10 AM to 8 PM with a one-hour last-start cutoff', () => {
  const defaults = defaultBusinessHours();
  assert.equal(Object.keys(defaults).length, 7);
  for (let day = 12; day <= 18; day++) {
    const date = `2026-10-${day}`;
    assert.deepEqual(businessHoursForDate({}, date), { open: '10:00', close: '20:00', closed: false });
    assert.deepEqual(branchAppointmentTimes({}, date, 60), AVAILABLE_TIMES);
    assert.equal(branchAppointmentTimes({}, date, 30).at(-1), '07:00 PM');
    assert.equal(branchAppointmentTimes({}, date, 90).at(-1), '06:30 PM');
    assert.equal(branchAppointmentTimes({}, date, 120).at(-1), '06:00 PM');
    validateAppointmentTime('07:00 PM', {}, date, 60);
    assert.throws(() => validateAppointmentTime('07:15 PM', {}, date, 30), /one hour before closing/);
    assert.throws(() => validateAppointmentTime('07:00 PM', {}, date, 90), /finish by closing/);
    assert.throws(() => validateAppointmentTime('09:45 AM', {}, date, 60), /business hours/);
  }
  defaults.mon.open = '08:00';
  assert.equal(defaultBusinessHours().mon.open, '10:00');
});

test('per-branch weekly hours allow earlier/later slots, closed days and non-hour openings', () => {
  const businessHours = defaultBusinessHours();
  businessHours.mon = { open: '08:15', close: '22:30', closed: false };
  businessHours.tue.closed = true;
  const branch = { businessHours };
  const monday = branchAppointmentTimes(branch, '2026-10-12', 60);
  assert.equal(monday[0], '08:15 AM');
  assert.equal(monday.at(-1), '09:30 PM');
  assert.equal(monday.length, 54);
  validateAppointmentTime('08:15 AM', branch, '2026-10-12', 60);
  validateAppointmentTime('09:30 PM', branch, '2026-10-12', 60);
  assert.deepEqual(branchAppointmentTimes(branch, '2026-10-13', 60), []);
  assert.throws(() => validateAppointmentTime('10:00 AM', branch, '2026-10-13', 60), /business hours/);
  assert.equal(branchAppointmentTimes({}, '2026-10-12', 60)[0], '10:00 AM', 'Other branches retain defaults');
  businessHours.mon.close = '08:45';
  assert.deepEqual(branchAppointmentTimes(branch, '2026-10-12', 30), [], 'A day shorter than one hour has no bookable starts');
});

test('weekly schedule validation rejects missing days, invalid dates/times and invalid durations', () => {
  for (const hours of [null, [], {}, { ...defaultBusinessHours(), extra: {} },
    { ...defaultBusinessHours(), mon: { closed: false, open: '10:01', close: '20:00' } },
    { ...defaultBusinessHours(), mon: { closed: false, open: '20:00', close: '10:00' } },
    { ...defaultBusinessHours(), mon: { closed: 'false', open: '10:00', close: '20:00' } },
    { ...defaultBusinessHours(), mon: { closed: true, open: '10:00', close: '24:00' } }]) {
    assert.throws(() => validateBusinessHours(hours), { statusCode: 400 });
  }
  for (const date of ['', '2026-02-30', '2026-2-1']) assert.throws(() => branchAppointmentTimes({}, date), /valid appointment date/);
  for (const duration of [0, -1, 1.5, NaN, 1441]) assert.throws(() => branchAppointmentTimes({}, '2026-10-12', duration), /duration/);
});

test('legacy branches preserve payment behavior and explicit choices are independent', () => {
  assert.deepEqual(branchPaymentOptions({}), { clinic: false, deposit: true, full: true });
  assert.deepEqual(branchPaymentOptions({ collectsDeposit: false }), { clinic: true, deposit: false, full: false });
  for (let flags = 1; flags < 8; flags += 1) {
    const branch = { allowClinicPayment: Boolean(flags & 1), allowDepositPayment: Boolean(flags & 2), allowFullPayment: Boolean(flags & 4) };
    assert.deepEqual(validateBranchPaymentOptions(branch), {
      clinic: branch.allowClinicPayment, deposit: branch.allowDepositPayment, full: branch.allowFullPayment,
    });
  }
  assert.throws(() => validateBranchPaymentOptions({ name: 'Test Branch', allowClinicPayment: false, allowDepositPayment: false, allowFullPayment: false }), /at least one.*Test Branch/);
  assert.throws(() => validateBranchPaymentOptions({ allowDepositPayment: 'false' }), /enabled or disabled/);
});

test('booking categories reflect active catalogue services without stale RMT or add-on categories', () => {
  const services = [
    { name: 'Massage', category: 'Custom category' },
    { name: 'Other massage', category: 'Custom category', active: true },
    { name: 'Archived RMT', category: 'RMT Healthcare', active: false },
    { name: 'Hot Stone Add-On', category: 'Add-ons', active: true },
  ];
  assert.deepEqual(bookingCategories(services), ['All', 'Custom category']);
  services.push({ name: 'Active RMT', category: 'RMT Healthcare', active: true });
  assert.deepEqual(bookingCategories(services), ['All', 'Custom category', 'RMT Healthcare']);
});

test('medical histories require consent and valid pressure; independent drafts do not share health data', () => {
  const first = emptyPatientHistory();
  const second = emptyPatientHistory();
  first.conditions.heart = 'Yes';
  first.bodyAreas.push('Neck');
  assert.equal(second.conditions.heart, '');
  assert.deepEqual(second.bodyAreas, []);
  assert.throws(() => validatePatientHistory(first), /consent/);
  const history = { ...first, consent: true, preCollectionConsent: true, signature: 'Test Patient', consentTimestamp: '2026-10-03T16:00:00Z' };
  assert.equal(validatePatientHistory(history), history);
  assert.throws(() => validatePatientHistory({ ...history, pressure: 'Extra Firm' }), /Light, Medium, or Firm/);
  assert.throws(() => validatePatientHistory({ ...history, signature: ' ' }), /signature/);
  assert.throws(() => validatePatientHistory({ ...history, consentTimestamp: '' }), /timestamp/);
});

test('medical-history serialization preserves all 34 storage columns', () => {
  const history = {
    ...emptyPatientHistory(), consent: true, preCollectionConsent: true, signature: 'Test Patient',
    signatureDate: '2026-10-03', consentTimestamp: '2026-10-03T16:00:00Z',
    bodyAreas: ['Neck', 'Feet'], conditions: Object.fromEntries(HISTORY_CONDITION_FIELDS.map((field) => [field, 'No'])),
  };
  const values = patientHistoryValues({ id: 'MTT-test', customerName: 'Test Patient', email: 'test@example.com', phone: '555' }, history, 'now');
  assert.equal(values.length, 34);
  assert.deepEqual(values.slice(0, 7), ['MTT-test', 'now', 'Test Patient', '', '', '555', 'test@example.com']);
  assert.deepEqual(values.slice(11, 25), Array(14).fill('No'));
  assert.deepEqual(values.slice(27), ['Neck, Feet', 'Medium', 'Yes', 'Test Patient', '2026-10-03', 'Yes', '2026-10-03T16:00:00Z']);
});

test('human body contours remain smooth, finite and depth-sorted through a full rotation for every body type', () => {
  for (const type of ['female', 'male', 'neutral']) {
    for (let angle = 0; angle < 360; angle += 15) {
      const parts = anatomicalBodyParts(type, angle);
      assert.equal(parts.length, 6);
      assert.equal(new Set(parts.map((part) => part.id)).size, 6);
      for (const [index, part] of parts.entries()) {
        assert.match(part.path, /^M .* Q .* Z$/);
        assert.doesNotMatch(part.path, /NaN|Infinity/);
        assert.ok(Number.isFinite(part.depth));
        assert.ok(part.areas.length);
        if (index) assert.ok(parts[index - 1].depth <= part.depth);
      }
    }
  }
  assert.notDeepEqual(anatomicalBodyParts('female', 0), anatomicalBodyParts('male', 0));
  assert.notDeepEqual(anatomicalBodyParts('neutral', 0), anatomicalBodyParts('neutral', 90));
});
