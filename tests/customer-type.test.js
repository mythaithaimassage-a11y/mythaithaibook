import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { customerTypeForBooking } from '../lib/customer-type.js';

test('marks a customer as new when no matching email or phone exists', () => {
  const booking = { id: 'new', email: 'person@example.com', phone: '416-555-0192' };
  assert.equal(customerTypeForBooking(booking, []), 'new');
});

test('marks matching email addresses as returning, case-insensitively', () => {
  const booking = { id: 'current', email: 'PERSON@example.com', phone: '' };
  const existing = [{ id: 'past', email: 'person@example.com', phone: '' }];
  assert.equal(customerTypeForBooking(booking, existing), 'returning');
});

test('marks matching phone numbers as returning despite formatting differences', () => {
  const booking = { id: 'current', email: '', phone: '+1 (416) 555-0192' };
  const existing = [{ id: 'past', email: '', phone: '416.555.0192' }];
  assert.equal(customerTypeForBooking(booking, existing), 'returning');
});

test('does not classify a booking without contact details or match it to itself', () => {
  assert.equal(customerTypeForBooking({ id: 'current', email: '', phone: '' }, []), null);
  assert.equal(customerTypeForBooking(
    { id: 'current', email: 'person@example.com', phone: '' },
    [{ id: 'current', email: 'person@example.com', phone: '' }],
  ), 'new');
});

test('appointment details display the customer type returned by the calendar API', () => {
  const api = readFileSync(new URL('../api/booking.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(api, /customerType: customerTypeForBooking\(booking, customerIdentityBookings\)/);
  assert.match(app, /selectedCalendarEvent\.booking\?\.customerType/);
  assert.match(app, /"Returning customer" : "New customer"/);
});
