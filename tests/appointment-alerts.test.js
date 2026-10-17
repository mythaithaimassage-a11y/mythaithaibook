import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONFIRMED_ON_TIME_TAG,
  isConfirmedOnTime,
  isReminderSent,
  buildConfirmedOnTimeNotes,
  buildReminderSentNotes,
  isValidEmail,
  collectAppointmentAlertCandidates,
  formatAppointmentReminderEmail,
} from '../lib/appointment-alerts.js';

test('isConfirmedOnTime and buildConfirmedOnTimeNotes handle status notes correctly', () => {
  assert.equal(isConfirmedOnTime(''), false);
  assert.equal(isConfirmedOnTime('Customer requested quiet session'), false);
  assert.equal(isConfirmedOnTime('Confirmed on time by customer at 2026-10-12T14:00:00Z'), true);

  const freshNotes = buildConfirmedOnTimeNotes('', '2026-10-12T14:00:00Z');
  assert.equal(freshNotes, 'Confirmed on time by customer at 2026-10-12T14:00:00Z');
  assert.equal(isConfirmedOnTime(freshNotes), true);

  const appendedNotes = buildConfirmedOnTimeNotes('Initial notes', '2026-10-12T14:00:00Z');
  assert.equal(appendedNotes, 'Initial notes | Confirmed on time by customer at 2026-10-12T14:00:00Z');

  // Does not duplicate if already confirmed
  const alreadyNotes = buildConfirmedOnTimeNotes(appendedNotes, '2026-10-12T15:00:00Z');
  assert.equal(alreadyNotes, appendedNotes);
});

test('isReminderSent and buildReminderSentNotes track reminder status', () => {
  assert.equal(isReminderSent(''), false);
  assert.equal(isReminderSent('Reminder sent at 2026-10-12T10:00:00Z'), true);

  const notes = buildReminderSentNotes('Existing note', '2026-10-12T10:00:00Z');
  assert.equal(notes, 'Existing note | Reminder sent at 2026-10-12T10:00:00Z');
  assert.equal(isReminderSent(notes), true);
});

test('isValidEmail validates emails properly', () => {
  assert.equal(isValidEmail('test@example.com'), true);
  assert.equal(isValidEmail('customer.name+tag@sub.domain.co'), true);
  assert.equal(isValidEmail('invalid'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(null), false);
});

test('collectAppointmentAlertCandidates filters today’s appointments, computes stats, and checks upcoming status', () => {
  const today = '2026-10-12';
  const sampleRows = [
    ['Booking ID', 'Customer', 'Phone', 'Email', 'Branch', 'Service', 'Therapist', 'Date', 'Time', '', '', '', '60', '', '', '', '', '', '', '', '', '', '', '', 'Status', 'Status Notes'],
    // 1. Confirmed upcoming appointment today
    ['MTT-101', 'Alice Smith', '416-555-0101', 'alice@example.com', 'Downtown', 'Thai Traditional (60 min)', 'Ploy', today, '14:00', '', '', '', 60, '', '', '', '', '', '', '', '', '', '', '', 'Confirmed', ''],
    // 2. Already confirmed on-time appointment today
    ['MTT-102', 'Bob Jones', '416-555-0102', 'bob@example.com', 'Downtown', 'Deep Tissue (60 min)', 'Som', today, '15:30', '', '', '', 60, '', '', '', '', '', '', '', '', '', '', '', 'Confirmed', 'Confirmed on time by customer at 2026-10-12T09:00:00Z'],
    // 3. Appointment with reminder sent today
    ['MTT-103', 'Carol White', '416-555-0103', 'carol@example.com', 'Midtown', 'Aromatherapy (60 min)', 'Nok', today, '11:00', '', '', '', 60, '', '', '', '', '', '', '', '', '', '', '', 'Confirmed', 'Reminder sent at 2026-10-12T08:00:00Z'],
    // 4. Cancelled appointment today (should not be in candidates)
    ['MTT-104', 'David Green', '416-555-0104', 'david@example.com', 'Downtown', 'Swedish (60 min)', 'Ploy', today, '16:00', '', '', '', 60, '', '', '', '', '', '', '', '', '', '', '', 'Cancelled', ''],
    // 5. Missing email appointment today
    ['MTT-105', 'Eve Black', '416-555-0105', '', 'Downtown', 'Foot Massage (60 min)', 'Som', today, '17:00', '', '', '', 60, '', '', '', '', '', '', '', '', '', '', '', 'Confirmed', ''],
    // 6. Appointment tomorrow (should be ignored)
    ['MTT-106', 'Frank Gray', '416-555-0106', 'frank@example.com', 'Downtown', 'Thai Traditional (60 min)', 'Ploy', '2026-10-13', '10:00', '', '', '', 60, '', '', '', '', '', '', '', '', '', '', '', 'Confirmed', ''],
  ];

  // Current time: 13:00 (780 minutes of day)
  const result = collectAppointmentAlertCandidates(sampleRows, {
    todayDate: today,
    nowTimeMinutes: 13 * 60,
  });

  assert.equal(result.todayDate, today);
  assert.equal(result.stats.total, 5); // 5 for today (101, 102, 103, 104, 105)
  assert.equal(result.stats.cancelled, 1); // 104 is cancelled
  assert.equal(result.stats.missingEmail, 1); // 105 has no email
  assert.equal(result.stats.confirmed, 1); // 102 is confirmed on time
  assert.equal(result.stats.remindersSent, 1); // 103 has reminder sent

  // Active candidates (non-cancelled)
  assert.equal(result.candidates.length, 4);

  // Sorted by time: 103 (11:00), 101 (14:00), 102 (15:30), 105 (17:00)
  assert.equal(result.candidates[0].id, 'MTT-103');
  assert.equal(result.candidates[1].id, 'MTT-101');
  assert.equal(result.candidates[2].id, 'MTT-102');
  assert.equal(result.candidates[3].id, 'MTT-105');

  // Candidate flags
  const candidate101 = result.candidates.find((c) => c.id === 'MTT-101');
  assert.equal(candidate101.eligible, true);
  assert.equal(candidate101.hasEmail, true);
  assert.equal(candidate101.isUpcoming, true);
  assert.equal(candidate101.confirmedOnTime, false);

  const candidate102 = result.candidates.find((c) => c.id === 'MTT-102');
  assert.equal(candidate102.confirmedOnTime, true);

  const candidate103 = result.candidates.find((c) => c.id === 'MTT-103');
  // 11:00 + 60m = 12:00, which is < 13:00 nowTimeMinutes, so isUpcoming is false
  assert.equal(candidate103.isUpcoming, false);

  const candidate105 = result.candidates.find((c) => c.id === 'MTT-105');
  assert.equal(candidate105.eligible, false); // no email
  assert.equal(candidate105.hasEmail, false);
});

test('email presence and reminder eligibility are distinct for no-show appointments', () => {
  const row = ['MTT-no-show', 'Test Client', '', ' Client@Example.com ', 'Downtown', 'Massage', 'Ploy', '2026-10-17', '10:00 AM'];
  row[24] = 'No Show';
  const candidate = collectAppointmentAlertCandidates([row]).candidates[0];
  assert.equal(candidate.email, 'client@example.com');
  assert.equal(candidate.hasEmail, true);
  assert.equal(candidate.eligible, false);
  row[3] = 'invalid@email';
  assert.equal(collectAppointmentAlertCandidates([row]).candidates[0].hasEmail, false);
});

test('collectAppointmentAlertCandidates scopes to allowedBranches', () => {
  const today = '2026-10-12';
  const sampleRows = [
    ['MTT-201', 'User 1', '416-555-0101', 'u1@example.com', 'Downtown', 'Massage', 'Ploy', today, '10:00 AM', '', '', '', 60, '', '', '', '', '', '', '', '', '', '', '', 'Confirmed', ''],
    ['MTT-202', 'User 2', '416-555-0102', 'u2@example.com', 'Midtown', 'Massage', 'Som', today, '11:00 AM', '', '', '', 60, '', '', '', '', '', '', '', '', '', '', '', 'Confirmed', ''],
  ];

  const downtownOnly = collectAppointmentAlertCandidates(sampleRows, {
    todayDate: today,
    allowedBranches: new Set(['downtown']),
  });

  assert.equal(downtownOnly.candidates.length, 1);
  assert.equal(downtownOnly.candidates[0].id, 'MTT-201');
});

test('formatAppointmentReminderEmail constructs valid email with required links', () => {
  const emailData = formatAppointmentReminderEmail({
    booking: {
      id: 'MTT-123456',
      customerName: 'Jane Smith',
      email: 'jane@example.com',
      serviceName: 'Thai Traditional Massage (60 min)',
      therapistName: 'Ploy',
      date: '2026-10-12',
      time: '2:00 PM',
      branchName: 'Downtown Clinic',
    },
    confirmUrl: 'https://example.com/api/booking?view=confirm-attendance&ref=MTT-123456',
    manageUrl: 'https://example.com/?manage=1&ref=MTT-123456',
    businessProfile: {
      businessName: 'MY THAI THAI',
      address: '123 Main St',
      phone: '416-555-0100',
      email: 'clinic@example.com',
    },
    senderEmail: 'clinic@example.com',
  });

  assert.match(emailData.subject, /Reminder: Your appointment today at MY THAI THAI - 2:00 PM/);
  assert.match(emailData.text, /Hello Jane Smith/);
  assert.match(emailData.text, /Thai Traditional Massage \(60 min\)/);
  assert.match(emailData.text, /CAN YOU MAKE IT ON TIME\?/);
  assert.match(emailData.text, /https:\/\/example\.com\/api\/booking\?view=confirm-attendance&ref=MTT-123456/);
  assert.match(emailData.text, /https:\/\/example\.com\/\?manage=1&ref=MTT-123456/);

  assert.match(emailData.html, /Confirm you can make it on time/);
  assert.match(emailData.html, /Cancel or reschedule appointment/);
  assert.match(emailData.html, /https:\/\/example\.com\/api\/booking\?view=confirm-attendance&amp;ref=MTT-123456/);

  assert.match(emailData.raw, /To: jane@example\.com/);
  assert.match(emailData.raw, /From: "MY THAI THAI" <clinic@example\.com>/);
});

test('formatAppointmentReminderEmail rejects missing or invalid email', () => {
  assert.throws(() => {
    formatAppointmentReminderEmail({
      booking: { id: 'MTT-1', date: '2026-10-12', time: '2:00 PM' },
      confirmUrl: 'https://example.com/confirm',
      manageUrl: 'https://example.com/manage',
    });
  }, /A valid customer email is required/);
});
