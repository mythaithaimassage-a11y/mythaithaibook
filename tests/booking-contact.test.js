import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBookingContact } from '../lib/booking-contact.js';

test('one contact method is required; email-only, phone-only and both are normalized', () => {
  for (const values of [{}, { email: '', phone: '' }, { email: '  ', phone: '  ' }]) {
    assert.throws(() => validateBookingContact(values), { message: 'Enter at least one email address or phone number.', statusCode: 400 });
  }
  assert.deepEqual(validateBookingContact({ email: ' Client@Example.com ' }), { email: 'client@example.com', phone: '' });
  assert.deepEqual(validateBookingContact({ phone: ' +1 (437) 898-7424 ' }), { email: '', phone: '+1 (437) 898-7424' });
  assert.deepEqual(validateBookingContact({ email: 'Client@Example.com', phone: '437-898-7424' }), { email: 'client@example.com', phone: '437-898-7424' });
});

test('every provided field is validated, even when the other field is valid', () => {
  for (const email of ['invalid', 'invalid@email', 'a b@example.com', `${'a'.repeat(250)}@example.com`]) {
    assert.throws(() => validateBookingContact({ email, phone: '437-898-7424' }), { message: 'Enter a valid email address.', statusCode: 400 });
  }
  for (const phone of ['123456', '1234567890123456', 'call me', '437-555-1234 ext 2', '1'.repeat(41)]) {
    assert.throws(() => validateBookingContact({ email: 'client@example.com', phone }), { message: 'Enter a valid phone number (7 to 15 digits).', statusCode: 400 });
  }
  for (const phone of ['1234567', '123456789012345']) assert.equal(validateBookingContact({ phone }).phone, phone);
});

test('legacy combined contact payloads remain supported and mismatches are rejected', () => {
  assert.deepEqual(validateBookingContact({ contact: 'Client@Example.com' }), { email: 'client@example.com', phone: '' });
  assert.deepEqual(validateBookingContact({ contact: '437-898-7424' }), { email: '', phone: '437-898-7424' });
  assert.throws(() => validateBookingContact({ contact: '437-898-7424', phone: '416-555-1234' }), { statusCode: 400 });
});
