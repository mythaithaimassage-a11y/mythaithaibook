import crypto from 'node:crypto';
import { parseWixCsv, invalidWixImport, wixQueryBatches, insertWixBatches } from './wix-import.js';

export const WIX_BOOKING_BRANCH = 'Mississauga Central';
export const wixPriceKey = (booking) => JSON.stringify([booking.service_name, booking.duration_minutes]);

export function applyWixCataloguePrices(prepared, services, mappings, confirmed = false) {
  if (!Array.isArray(mappings)) throw invalidWixImport('Review and map the historical service prices before importing paid bookings.');
  const groups = new Map();
  for (const booking of prepared.bookings) {
    const key = wixPriceKey(booking);
    const group = groups.get(key) || { key, serviceName: booking.service_name, durationMinutes: booking.duration_minutes, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  const chosen = new Map();
  for (const mapping of mappings) {
    if (!mapping || typeof mapping.key !== 'string' || chosen.has(mapping.key) || !groups.has(mapping.key)) throw invalidWixImport('Invalid or duplicate service price mapping.');
    const service = services.find((item) => String(item.id) === String(mapping.serviceId) && item.active !== false);
    const group = groups.get(mapping.key);
    if (!service || service.duration !== group.durationMinutes || !Number.isFinite(service.price) || service.price <= 0 || service.price > 100000 ||
        !Number.isFinite(service.taxRate) || ![0, 0.13].includes(service.taxRate)) {
      throw invalidWixImport('Choose an active catalogue service with the same duration, a positive price, and a receipt-supported tax rate (0% or 13%).');
    }
    const taxExempt = /registered massage therapy|\brmt\b|acupuncture/i.test(service.name);
    if ((taxExempt ? 0 : 0.13) !== service.taxRate) throw invalidWixImport(`The receipt tax classification for "${service.name}" does not match its catalogue tax rate.`);
    if (mapping.price !== service.price || mapping.taxRate !== service.taxRate || mapping.serviceName !== service.name) {
      throw invalidWixImport('Catalogue prices or service details changed. Review the latest prices before importing.');
    }
    const total = Math.round((service.price + Math.round(service.price * service.taxRate * 100) / 100) * 100) / 100;
    chosen.set(mapping.key, { service, total });
  }
  if (confirmed && chosen.size !== groups.size) throw invalidWixImport('Map every Wix service/duration and confirm the reviewed prices before importing.');
  const bookings = prepared.bookings.map((booking) => {
    const selected = chosen.get(wixPriceKey(booking));
    if (!selected) return booking;
    const { service, total } = selected;
    const source = JSON.parse(booking.intake_notes);
    return {
      ...booking,
      service_name: service.name,
      payment_option: 'Historical payment (owner confirmed)',
      total, paid_amount: total,
      intake_notes: JSON.stringify({
        ...source,
        pricing: { basis: 'Owner-approved current catalogue, not Wix transaction amounts', serviceId: service.id, serviceName: service.name, subtotal: service.price, taxRate: service.taxRate, total },
      }),
      status_notes: `${booking.status_notes.replace('Payment amounts unknown, not zero-value/free services.', 'Original Wix export did not include payment amounts.')} Owner confirms historical payment in full; receipt amount based on reviewed current catalogue: ${service.name}, subtotal $${service.price.toFixed(2)}, tax ${service.taxRate * 100}%, total $${total.toFixed(2)}. Original Wix service retained in intake notes.`,
    };
  });
  return {
    ...prepared, bookings,
    summary: { ...prepared.summary, priceGroups: [...groups.values()], pricedBookings: bookings.filter((booking) => booking.total > 0).length, approvedTotal: Math.round(bookings.reduce((sum, booking) => sum + booking.total, 0) * 100) / 100 },
  };
}
const REQUIRED_HEADERS = [
  'Session date', 'Start time', 'Registration date', 'Booking contact name',
  'Booking contact email', 'Booking contact phone', 'Client address', 'Spots filled',
  'Duration', 'Service name', 'Service type', 'Staff name', 'Booking status',
  'Attendance status', 'Payment status',
];
const clean = (value) => /^(unknown|undefined|not specified)$/i.test(value.trim()) ? '' : value.trim();

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function clinicToday(timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function prepareWixBookings(csv, { timeZone = 'America/Toronto', today = clinicToday(timeZone) } = {}) {
  const [rawHeaders, ...rows] = parseWixCsv(csv);
  if (!rawHeaders) throw invalidWixImport('The CSV is empty.');
  const headers = rawHeaders.map((header) => header.trim());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) throw invalidWixImport('CSV column headers must be non-empty and unique.');
  for (const header of REQUIRED_HEADERS) {
    if (!headers.includes(header)) throw invalidWixImport(`Missing Wix booking column: ${header}. Use the Wix bookings CSV export.`);
  }
  if (!rows.length) throw invalidWixImport('The CSV contains no booking rows.');
  if (!validDate(today)) throw invalidWixImport('Invalid historical import date cutoff.');
  const bookings = new Map();
  const issues = [];
  let invalidRows = 0;
  let duplicates = 0;
  let futureRows = 0;
  let warnings = 0;
  const report = (row, message) => { if (issues.length < 20) issues.push({ row, message }); };
  rows.forEach((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== headers.length) {
      invalidRows += 1;
      report(rowNumber, `Expected ${headers.length} columns, found ${values.length}.`);
      return;
    }
    const original = Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    const value = (header) => clean(original[header] || '');
    const date = value('Session date');
    const start = value('Start time');
    const timeMatch = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(start);
    const durationMatch = /^(?:(\d+)h,\s*)?(\d+)m$/.exec(value('Duration'));
    const duration = durationMatch ? Number(durationMatch[1] || 0) * 60 + Number(durationMatch[2]) : 0;
    const name = value('Booking contact name');
    const rawEmail = value('Booking contact email').toLowerCase();
    const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(rawEmail) ? rawEmail : '';
    const rawPhone = value('Booking contact phone').replace(/^'/, '');
    const phone = rawPhone.replace(/\D/g, '').length >= 7 && rawPhone.replace(/\D/g, '').length <= 15 ? rawPhone : '';
    const service = value('Service name');
    const bookingStatus = value('Booking status').toLowerCase();
    const attendance = value('Attendance status').toLowerCase();
    const statusMap = { confirmed: 'Confirmed', canceled: 'Cancelled', cancelled: 'Cancelled', pending: 'Pending', declined: 'Cancelled' };
    if (!validDate(date) || !timeMatch || !Number.isSafeInteger(duration) || duration <= 0 || duration > 1440 ||
        (!name && !email && !phone) || !service || !statusMap[bookingStatus] ||
        (durationMatch && Number(durationMatch[2]) > 59 && durationMatch[1])) {
      invalidRows += 1;
      report(rowNumber, 'Invalid/missing date, 24-hour time, duration, client, service or booking status; row skipped.');
      return;
    }
    if (date > today) {
      futureRows += 1;
      report(rowNumber, 'Future session skipped; this option imports historical bookings through today only.');
      return;
    }
    const registration = value('Registration date');
    if (!name || (rawEmail && !email) || (rawPhone && !phone) || (registration && !validDate(registration))) {
      warnings += 1;
      report(rowNumber, 'Missing name or invalid contact/registration-date values left blank in mapped fields; originals retained in notes.');
    }
    const hour = Number(timeMatch[1]);
    const minute = timeMatch[2];
    const normalizedStart = `${String(hour).padStart(2, '0')}:${minute}`;
    const therapist = value('Staff name');
    // Row numbers change across exports; use appointment identity for stable IDs.
    const identity = JSON.stringify([WIX_BOOKING_BRANCH, date, normalizedStart, email || phone.replace(/\D/g, '') || name.toLowerCase(), service.toLowerCase(), therapist.toLowerCase(), duration]);
    const digest = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32);
    const id = `WIX-${date.replace(/-/g, '')}-${normalizedStart.replace(':', '')}-${digest}`;
    if (bookings.has(id)) {
      duplicates += 1;
      report(rowNumber, 'Duplicate appointment identity; first CSV occurrence retained.');
      return;
    }
    let status = statusMap[bookingStatus];
    if (status === 'Confirmed' && ['attended', 'checked in', 'checked-in'].includes(attendance)) status = 'Completed';
    else if (status === 'Confirmed' && ['no show', 'no-show', 'did not attend'].includes(attendance)) status = 'No Show';
    const paymentStatus = value('Payment status') || 'Unknown';
    bookings.set(id, {
      booking_id: id, customer_name: name, email, phone,
      branch_name: WIX_BOOKING_BRANCH, branch_address: '',
      service_name: service, therapist_name: therapist,
      date, time: `${String(hour % 12 || 12).padStart(2, '0')}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`,
      duration_minutes: duration,
      payment_option: `Wix historical: ${paymentStatus} (amounts unknown)`,
      paid_amount: 0, total: 0,
      intake_notes: JSON.stringify({ source: 'Wix historical bookings CSV', timeZone, registrationDate: registration, sourceFields: original }),
      calendar_id: '', calendar_event_id: '',
      // Registration is a date only, not an invented UTC timestamp.
      created_at: validDate(registration) ? registration : '',
      receipt_number: '', receipt_issued_at: '', receipt_email_status: '',
      membership_type: '', discount_percent: 0, membership_discount_amount: 0,
      status,
      status_notes: `Wix historical import. Payment amounts unknown, not zero-value/free services. Wix payment: ${paymentStatus}; booking: ${value('Booking status')}; attendance: ${value('Attendance status') || 'Not specified'}.`,
    });
  });
  const sorted = [...bookings.values()].sort((a, b) => a.booking_id.localeCompare(b.booking_id));
  return {
    bookings: sorted,
    summary: {
      totalRows: rows.length, validBookings: sorted.length, invalidRows, duplicates,
      futureRows, warnings, branchName: WIX_BOOKING_BRANCH, timeZone, throughDate: today,
      earliestDate: sorted[0]?.date || '', latestDate: sorted.at(-1)?.date || '', issues,
    },
  };
}

export async function importWixBookings(bigquery, bookings, { projectId, datasetId, tableId, fields, reviewedPaid = false }) {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId) || !/^\w+$/.test(datasetId) || !/^\w+$/.test(tableId)) throw new Error('Invalid BigQuery bookings table configuration.');
  if (!bookings.length) throw invalidWixImport('No valid historical bookings to import.');
  if (reviewedPaid && bookings.some((booking) => !Number.isFinite(booking.total) || booking.total <= 0 || booking.total !== booking.paid_amount || !booking.booking_id.startsWith('WIX-'))) {
    throw invalidWixImport('Every reviewed historical booking must have a positive total and be paid in full.');
  }
  const names = fields.map(({ name }) => name);
  const batches = wixQueryBatches(bookings, names, 'booking');
  const table = bigquery.dataset(datasetId).table(tableId);
  const [exists] = await table.exists();
  if (!exists) throw new Error('The configured bookings table does not exist. No table was created. Configure the existing bookings table before importing.');
  const [metadata] = await table.getMetadata();
  const schema = metadata.schema?.fields || [];
  const canonicalType = (type) => ({ FLOAT: 'FLOAT64', INTEGER: 'INT64' }[type] || type);
  if (fields.some(({ name, type }) => !schema.some((field) => field.name === name && canonicalType(field.type) === type && field.mode !== 'REPEATED')) ||
      schema.some((field) => field.mode === 'REQUIRED' && !names.includes(field.name))) {
    throw new Error('The existing bookings schema is incompatible with this import. No schema or records were changed.');
  }
  return insertWixBatches(bigquery, {
    batches, fields, tableRef: `\`${projectId}.${datasetId}.${tableId}\``, key: 'booking_id', label: 'bookings',
    ...(reviewedPaid ? {
      updateFields: ['service_name', 'payment_option', 'paid_amount', 'total', 'intake_notes', 'status_notes'],
      updateCondition: "STARTS_WITH(target.booking_id, 'WIX-') AND COALESCE(target.total, 0) = 0 AND COALESCE(target.paid_amount, 0) = 0 AND COALESCE(target.receipt_number, '') = '' AND COALESCE(target.receipt_issued_at, '') = '' AND COALESCE(target.receipt_email_status, '') = ''",
      detailed: true,
    } : {}),
  });
}
