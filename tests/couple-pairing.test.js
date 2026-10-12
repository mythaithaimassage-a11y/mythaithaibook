import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUPLE_PAIR_WINDOW_MINUTES,
  coupleTimeMinutes,
  isCoupleCandidate,
  couplePairCandidates,
} from '../lib/couple-pairing.js';

const base = {
  id: 'booking-1',
  branchName: 'Bang Rak',
  date: '2025-03-04',
  time: '11:00 AM',
  status: 'Confirmed',
  customerName: 'Anna',
  couplePartnerBookingId: '',
};

const candidate = (overrides) => ({ ...base, id: 'booking-2', customerName: 'Ben', ...overrides });

test('coupleTimeMinutes parses 12-hour and 24-hour times and rejects junk', () => {
  assert.equal(coupleTimeMinutes('11:00 AM'), 660);
  assert.equal(coupleTimeMinutes('12:15 AM'), 15);
  assert.equal(coupleTimeMinutes('12:30 PM'), 750);
  assert.equal(coupleTimeMinutes('23:45'), 1425);
  assert.equal(coupleTimeMinutes('13:05 PM'), null);
  assert.equal(coupleTimeMinutes('24:00'), null);
  assert.equal(coupleTimeMinutes(''), null);
  assert.equal(coupleTimeMinutes(undefined), null);
});

test('candidates must share the branch and date within the pairing window', () => {
  assert.equal(COUPLE_PAIR_WINDOW_MINUTES, 60);
  assert.ok(isCoupleCandidate(base, candidate({ time: '12:00 PM' })));
  assert.ok(isCoupleCandidate(base, candidate({ time: '10:00 AM' })));
  assert.equal(isCoupleCandidate(base, candidate({ time: '12:01 PM' })), false);
  assert.equal(isCoupleCandidate(base, candidate({ branchName: 'Sukhumvit' })), false);
  assert.equal(isCoupleCandidate(base, candidate({ date: '2025-03-05' })), false);
  assert.ok(isCoupleCandidate(base, candidate({ branchName: '  bang rak ' })));
});

test('cancelled, self and already paired bookings are excluded', () => {
  assert.equal(isCoupleCandidate(base, candidate({ id: base.id })), false);
  assert.equal(isCoupleCandidate(base, candidate({ status: 'Cancelled' })), false);
  assert.equal(isCoupleCandidate(base, candidate({ status: 'No Show' })), false);
  assert.equal(isCoupleCandidate({ ...base, status: 'Cancelled' }, candidate({})), false);
  assert.equal(isCoupleCandidate(base, candidate({ couplePartnerBookingId: 'booking-9' })), false);
  assert.ok(isCoupleCandidate(base, candidate({ couplePartnerBookingId: base.id })));
  assert.equal(isCoupleCandidate(base, candidate({ time: 'soon' })), false);
});

test('couplePairCandidates filters and sorts by start time then name', () => {
  const bookings = [
    candidate({ id: 'b-late', time: '11:45 AM', customerName: 'Zoe' }),
    candidate({ id: 'b-far', time: '03:00 PM', customerName: 'Far' }),
    candidate({ id: 'b-early-b', time: '10:30 AM', customerName: 'Bob' }),
    candidate({ id: 'b-early-a', time: '10:30 AM', customerName: 'Amy' }),
    candidate({ id: base.id }),
  ];
  assert.deepEqual(
    couplePairCandidates(base, bookings).map((item) => item.id),
    ['b-early-a', 'b-early-b', 'b-late'],
  );
  assert.deepEqual(couplePairCandidates(base, []), []);
  assert.deepEqual(couplePairCandidates(base, undefined), []);
  assert.deepEqual(
    couplePairCandidates(base, bookings, 30).map((item) => item.id),
    ['b-early-a', 'b-early-b'],
  );
});
