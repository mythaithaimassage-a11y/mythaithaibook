import crypto from 'node:crypto';
import { validateAppointmentTime } from './booking-options.js';
import { validateBookingNote } from './booking-note.js';
import { BOOKING_TABLE_FIELDS } from './booking-schema.js';
import { historicalPackageVisit } from './packages.js';

const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
const round = (value) => Math.round(value * 100) / 100;

export function bookingDiscount(row) {
  if (!row[27]) return null;
  let saved;
  try {
    saved = JSON.parse(row[27]);
  } catch {
    throw Object.assign(new Error('Stored receipt reconciliation is invalid. Reconcile the booking record before issuing a receipt.'), { statusCode: 409 });
  }
  if (saved.source !== 'booking-edit') return null;
  if (![saved.originalTotal, saved.originalPaid, saved.manualDiscount, saved.adjustedTotal, saved.adjustedPaid, saved.tax].every((value) => Number.isFinite(value) && value >= 0) ||
      Math.abs(saved.adjustedTotal - Number(row[11])) > 0.005 || Math.abs(saved.adjustedPaid - Number(row[10])) > 0.005) {
    throw Object.assign(new Error('The saved booking discount does not match the payment record. Reconcile the booking before editing or issuing a receipt.'), { statusCode: 409 });
  }
  return saved;
}

export function applyBookingDiscount(row, edited, body, staffEmail) {
  const saved = bookingDiscount(row);
  const input = body.manualDiscount === undefined ? saved?.manualDiscount ?? 0 : body.manualDiscount;
  const text = input === '' ? '0' : String(input);
  if (!['number', 'string'].includes(typeof input) || !/^\d+(\.\d{1,2})?$/.test(text) || !Number.isFinite(Number(text))) {
    throw fail('Enter a non-negative manual discount in dollars, with at most two decimal places.');
  }
  const discount = Number(text);
  if (row[18] || staffBooking(row).paymentLocked) {
    if (discount !== (saved?.manualDiscount || Number(row[26]) || 0)) throw Object.assign(new Error('This booking has protected payment details. Its manual discount cannot be changed.'), { statusCode: 409 });
    return edited;
  }
  const previousDiscount = saved?.manualDiscount || 0;
  const changed = discount !== previousDiscount || Boolean(saved && (edited.total !== saved.originalTotal || edited.paidAmount !== Number(row[10]) || edited.serviceName !== row[5]));
  if (!discount && !saved) return edited;
  if (changed && body.confirmReconciliation !== true) throw fail('Confirm reconciliation before saving the booking discount.');
  const exempt = /registered massage therapy|\brmt\b|acupuncture/i.test(edited.serviceName);
  const subtotal = round(exempt ? edited.total : edited.total / 1.13);
  if (discount > subtotal) throw fail('The manual discount cannot exceed the appointment subtotal.');
  const remaining = round(subtotal - discount);
  const tax = exempt ? 0 : discount ? round(remaining * 0.13) : round(edited.total - subtotal);
  const adjustedTotal = discount ? round(remaining + tax) : edited.total;
  const originalPaid = saved && edited.paidAmount === Number(row[10]) ? saved.originalPaid : edited.paidAmount;
  const adjustedPaid = originalPaid + 0.005 >= edited.total ? adjustedTotal : Math.min(originalPaid, adjustedTotal);
  const adjustment = {
    source: 'booking-edit', originalTotal: edited.total, originalPaid,
    manualDiscount: discount, adjustedTotal, adjustedPaid, tax,
    confirmedBy: changed ? staffEmail : saved.confirmedBy,
    confirmedAt: changed ? new Date().toISOString() : saved.confirmedAt,
    history: changed && saved ? [...(saved.history || []), {
      manualDiscount: saved.manualDiscount, originalTotal: saved.originalTotal,
      adjustedTotal: saved.adjustedTotal, originalPaid: saved.originalPaid, adjustedPaid: saved.adjustedPaid,
      confirmedBy: saved.confirmedBy, confirmedAt: saved.confirmedAt,
    }] : saved?.history || [],
  };
  return { ...edited, total: adjustedTotal, paidAmount: adjustedPaid, receiptManualDiscount: discount, receiptReconciliation: JSON.stringify(adjustment) };
}

export function bookingEditVersion(row) {
  return crypto.createHash('sha256').update(JSON.stringify(BOOKING_TABLE_FIELDS.map((field, index) =>
    field.type === 'STRING' ? String(row[index] || '') : Number(row[index]) || 0))).digest('hex');
}

export function staffBooking(row) {
  const discount = bookingDiscount(row);
  const booking = Object.fromEntries(BOOKING_TABLE_FIELDS
    .map((field, index) => [field.prop, field.type === 'STRING' ? String(row[index] || '') : Number(row[index]) || 0])
    .filter(([prop]) => !['intakeNotes', 'receiptReconciliation'].includes(prop)));
  return {
    ...booking,
    manualBookingDiscount: discount?.manualDiscount ?? (Number(row[26]) || 0),
    originalBookingTotal: discount?.originalTotal ?? (Number(row[11]) || 0),
    paymentLocked: Boolean(row[18] || /"packageUsage"\s*:/.test(String(row[14] || '')) || historicalPackageVisit(row[0], row[5], row[14]) || row[21] || Number(row[22]) > 0),
    editVersion: bookingEditVersion(row), syncedToSheets: true, isCouple: /couple/i.test(booking.serviceName),
  };
}

export function validateBookingEdit(body, lockedRow = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Booking details are required.');
  if (lockedRow) {
    const original = {
      customerName: String(lockedRow[1] || ''), phone: String(lockedRow[2] || ''), email: String(lockedRow[3] || ''),
      date: String(lockedRow[7] || ''), time: String(lockedRow[8] || ''), paymentOption: String(lockedRow[9] || ''),
      total: Number(lockedRow[11]) || 0, paidAmount: Number(lockedRow[10]) || 0,
    };
    const changed = Object.entries(original).some(([key, value]) => typeof value === 'number'
      ? !['string', 'number'].includes(typeof body[key]) || !/^\d+(\.\d{1,2})?$/.test(String(body[key])) || Number(body[key]) !== value
      : body[key] !== value);
    if (changed) throw Object.assign(new Error('Issued receipts, prepaid packages and membership records lock customer, service, schedule and payment details. You can still edit the shared note and therapist.'), { statusCode: 409 });
    if (typeof body.bookingNote !== 'string') throw fail('Enter an internal booking note, or leave it empty to clear it.');
    return { ...original, bookingNote: validateBookingNote(body.bookingNote) };
  }
  const text = (key, limit) => {
    if (typeof body[key] !== 'string' || body[key].length > limit) throw fail('Enter valid booking details.');
    if (/[\r\n]/.test(body[key])) throw fail('Enter valid booking details.');
    return body[key].trim();
  };
  const customerName = text('customerName', 150);
  const email = text('email', 254).toLowerCase();
  const phone = text('phone', 40);
  if (!customerName) throw fail('Enter a client name (up to 150 characters).');
  if (email && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) throw fail('Enter a valid patient email address');
  if (phone && (!/^\+?[\d\s().-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15)) throw fail('Enter a valid phone number.');
  if (!email && !phone) throw fail('Enter a valid email address or phone number.');
  const date = text('date', 10);
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw fail('Choose a valid appointment date.');
  const time = text('time', 20);
  try {
    validateAppointmentTime(time.replace(/^(\d):/, '0$1:'));
  } catch (error) {
    throw fail(error.message);
  }
  const money = (key) => {
    if (!['string', 'number'].includes(typeof body[key]) || !/^\d+(\.\d{1,2})?$/.test(String(body[key])) || !Number.isFinite(Number(body[key]))) throw fail('Enter non-negative payment amounts with at most two decimal places.');
    return Number(body[key]);
  };
  const total = money('total'), paidAmount = money('paidAmount');
  if (paidAmount > total) throw fail('The amount paid cannot exceed the appointment total');
  const paymentOption = text('paymentOption', 200);
  if (!paymentOption) throw fail('Choose a payment method.');
  if (typeof body.bookingNote !== 'string') throw fail('Enter an internal booking note, or leave it empty to clear it.');
  return { customerName, email, phone, date, time, total, paidAmount, paymentOption, bookingNote: validateBookingNote(body.bookingNote) };
}

export function zonedBookingInstant(localDateTime, timeZone) {
  const target = Date.parse(`${localDateTime}Z`);
  let instant = target;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
    const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    const adjustment = target - shown;
    if (!adjustment) return new Date(instant).toISOString();
    instant += adjustment;
  }
  throw fail('Choose a valid appointment date and time.');
}
