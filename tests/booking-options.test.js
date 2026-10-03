import assert from 'node:assert/strict';
import test from 'node:test';
import { AVAILABLE_TIMES, BOOKING_DEPOSIT_AMOUNT, branchPaymentOptions, validateBranchPaymentOptions, bookingCategories, validateAppointmentTime } from '../lib/booking-options.js';
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
