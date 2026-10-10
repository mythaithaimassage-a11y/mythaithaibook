import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingEditVersion, staffBooking, validateBookingEdit, zonedBookingInstant } from '../lib/booking-edit.js';
import { BOOKING_TABLE_FIELDS } from '../lib/booking-schema.js';

const valid = { customerName: ' Client ', email: 'CLIENT@EXAMPLE.COM', phone: '+1 (437) 555-0101',
  date: '2026-12-01', time: '10:00 AM', total: '113.00', paidAmount: '50', paymentOption: 'Cash', bookingNote: 'Team note' };
test('booking edit validates explicit contacts, dates, appointment times and precise money', () => {
  assert.equal(validateBookingEdit(valid).email, 'client@example.com');
  assert.equal(validateBookingEdit(valid).customerName, 'Client');
  assert.equal(validateBookingEdit({ ...valid, email: '' }).email, '');
  assert.equal(validateBookingEdit({ ...valid, phone: '' }).phone, '');
  assert.equal(validateBookingEdit({ ...valid, total: '0', paidAmount: '0' }).total, 0);
  for (const change of [null, [], { customerName: '' }, { customerName: 'x'.repeat(151) },
    { customerName: 'Client\nEmail: injected@example.com' }, { email: 'invalid' }, { phone: 'abc' },
    { email: '', phone: '' }, { date: '2026-02-30' }, { date: '2026-2-1' }, { time: '09:45 AM' },
    { total: '-1' }, { total: '1.001' }, { total: Infinity }, { paidAmount: '114' }, { total: '' },
    { paidAmount: null }, { bookingNote: undefined }, { bookingNote: 'x'.repeat(2001) }]) {
    assert.throws(() => validateBookingEdit(change === null || Array.isArray(change) ? change : { ...valid, ...change }),
      (error) => error.statusCode === 400);
  }
});
test('edit versions protect every field and staff responses exclude medical and reconciliation content', () => {
  const row = BOOKING_TABLE_FIELDS.map((field) => field.type === 'STRING' ? '' : 0);
  row[0] = 'MTT-1'; row[14] = 'Private medical information'; row[27] = '{"private":"audit"}';
  const version = bookingEditVersion(row);
  assert.equal(bookingEditVersion([...row]), version);
  for (let index = 0; index < row.length; index++) {
    const changed = [...row]; changed[index] = BOOKING_TABLE_FIELDS[index].type === 'STRING' ? 'Changed' : 1;
    assert.notEqual(bookingEditVersion(changed), version);
  }
  const booking = staffBooking(row);
  assert.equal(booking.editVersion, version);
  assert.equal(booking.intakeNotes, undefined);
  assert.equal(booking.receiptReconciliation, undefined);
  assert.equal(booking.paymentLocked, false);
  row[18] = 'Issued'; assert.equal(staffBooking(row).paymentLocked, true);
  row[18] = ''; row[21] = 'silver'; assert.equal(staffBooking(row).paymentLocked, true);
});
test('staff edits use Toronto winter and summer offsets and reject nonexistent DST times', () => {
  assert.equal(zonedBookingInstant('2026-12-01T10:00:00', 'America/Toronto'), '2026-12-01T15:00:00.000Z');
  assert.equal(zonedBookingInstant('2026-07-01T10:00:00', 'America/Toronto'), '2026-07-01T14:00:00.000Z');
  assert.equal(zonedBookingInstant('2026-11-01T10:00:00', 'America/Toronto'), '2026-11-01T15:00:00.000Z');
  assert.throws(() => zonedBookingInstant('2026-03-08T02:30:00', 'America/Toronto'), (error) => error.statusCode === 400);
});

test('locked bookings permit note corrections without rewriting or revalidating historical contact data', () => {
  const row = ['MTT-OLD', 'Old customer', '555', 'CLIENT@EXAMPLE.COM', 'Branch', 'Massage', 'Tanya',
    valid.date, valid.time, 'Cash', 113, 113];
  const body = { ...valid, customerName: row[1], phone: row[2], email: row[3], paidAmount: '113', bookingNote: 'New reference' };
  const edited = validateBookingEdit(body, row);
  assert.equal(edited.phone, '555');
  assert.equal(edited.email, 'CLIENT@EXAMPLE.COM');
  assert.equal(edited.bookingNote, 'New reference');
  assert.throws(() => validateBookingEdit({ ...body, total: '100' }, row), (error) => error.statusCode === 409);
});
