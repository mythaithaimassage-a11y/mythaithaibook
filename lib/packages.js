import crypto from 'node:crypto';

const FIELDS = [
  ['package_id', 'STRING'], ['email', 'STRING'], ['customer_name', 'STRING'], ['customer_phone', 'STRING', 'NULLABLE'],
  ['package_name', 'STRING'], ['purchase_reference', 'STRING'], ['purchase_date', 'STRING'],
  ['duration_minutes', 'INT64'], ['initial_remaining', 'INT64'], ['remaining_sessions', 'INT64'],
  ['remaining_minutes', 'FLOAT64', 'NULLABLE'],
  ['subtotal', 'FLOAT64'], ['tax_rate', 'FLOAT64'], ['usages_json', 'STRING'],
  ['revision', 'INT64'], ['created_at', 'STRING'],
].map(([name, type, mode]) => ({ name, type, mode: mode || 'REQUIRED' }));
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const round = (value) => Math.round(value * 100) / 100;

function packageWithBalance(pkg) {
  const duration = Number(pkg.duration_minutes);
  const remainingMinutes = pkg.remaining_minutes !== null && pkg.remaining_minutes !== undefined && Number.isFinite(Number(pkg.remaining_minutes))
    ? Number(pkg.remaining_minutes)
    : Number(pkg.remaining_sessions) * duration;
  return {
    ...pkg,
    remaining_minutes: remainingMinutes,
    remaining_sessions: Math.round((remainingMinutes / duration) * 10000) / 10000,
  };
}

export function readPackageUsage(notes) {
  if (!notes || !String(notes).trim().startsWith('{')) return null;
  let parsed;
  try {
    parsed = JSON.parse(notes);
  } catch (error) {
    if (String(notes).includes('"packageUsage"')) throw fail('Booking package metadata is malformed; correct the record before continuing.', 409);
    return null;
  }
  const usage = parsed.packageUsage;
  if (usage === undefined) return null;
  if (!usage || typeof usage.packageId !== 'string' || typeof usage.packageName !== 'string' || typeof usage.purchaseReference !== 'string' ||
      (usage.sessionNumber !== undefined && (!Number.isInteger(usage.sessionNumber) || usage.sessionNumber < 1 || usage.sessionNumber > 4)) ||
      (usage.minutesDeducted === undefined
        ? (!Number.isInteger(usage.remainingSessions) || usage.remainingSessions < 0 || usage.remainingSessions > 3 || usage.sessionsDeducted !== 1)
        : (!Number.isFinite(usage.minutesDeducted) || usage.minutesDeducted <= 0 ||
          !Number.isFinite(usage.remainingMinutes) || usage.remainingMinutes < 0 ||
          !Number.isFinite(usage.totalMinutes) || usage.totalMinutes <= 0 ||
          !Number.isFinite(usage.packageDurationMinutes) || usage.packageDurationMinutes <= 0 ||
          !Number.isFinite(usage.sessionsDeducted) || usage.sessionsDeducted <= 0 ||
          !Number.isFinite(usage.remainingSessions) || usage.remainingSessions < 0 || usage.remainingSessions > 4)) ||
      !Number.isFinite(usage.allocatedTotal) || usage.allocatedTotal <= 0 ||
      !Number.isFinite(usage.allocatedSubtotal) || usage.allocatedSubtotal < 0 ||
      !Number.isFinite(usage.allocatedTax) || usage.allocatedTax < 0 ||
      round(usage.allocatedSubtotal + usage.allocatedTax) !== usage.allocatedTotal) {
    throw fail('Booking package metadata is invalid; correct the record before continuing.', 409);
  }
  return usage;
}

export function packageReceiptDetails(notes) {
  const usage = readPackageUsage(notes);
  if (!usage) return null;
  const legacySessionNumber = usage.sessionNumber ?? 4 - usage.remainingSessions;
  return {
    ...usage,
    newPayment: 0,
    description: usage.minutesDeducted !== undefined
      ? `${usage.packageName} (${usage.packageId}, purchase ${usage.purchaseReference}): ${usage.minutesDeducted} of ${usage.totalMinutes} prepaid minutes used (${usage.sessionsDeducted} session-equivalents); ${usage.remainingMinutes} minutes (${usage.remainingSessions} session-equivalents) remain after this visit. Covered by prepayment; no new payment collected.`
      : `${usage.packageName} (${usage.packageId}, purchase ${usage.purchaseReference}): session ${legacySessionNumber} of 4 deducted; ${usage.remainingSessions} sessions remain after this visit. Covered by prepayment; no new payment collected.`,
  };
}

export function historicalPackageVisit(bookingId, serviceName, notes) {
  if (!String(bookingId).startsWith('WIX-')) return false;
  if (/\bpackage\b/i.test(String(serviceName))) return true;
  if (!notes || !String(notes).trim().startsWith('{')) return false;
  try {
    return /\bpackage\b/i.test(String(JSON.parse(notes).sourceFields?.['Service name'] || ''));
  } catch {
    throw fail('Historical booking source notes are malformed. Reconcile the record before receipt issuance.', 409);
  }
}

export function validatePackageRegistration(body) {
  if (body?.confirmed !== true) throw fail('Confirm the package payment and verified remaining balance.');
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.customerName || '').trim();
  const phone = String(body.customerPhone || '').trim();
  const packageName = String(body.packageName || '').trim();
  const reference = String(body.purchaseReference || '').trim();
  const date = String(body.purchaseDate || '').trim();
  const duration = Number(body.durationMinutes);
  const remaining = Number(body.remainingSessions);
  const subtotal = Number(body.subtotal);
  const taxRate = Number(body.taxRate);
  if (body.remainingSessions === '' || body.remainingSessions === null || body.subtotal === '' || body.taxRate === '' ||
      !emailPattern.test(email) || !name || name.length > 200 || phone.length > 40 ||
      (phone && (!/^\+?[\d\s().-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15)) ||
      !packageName || packageName.length > 200 ||
      !reference || reference.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date ||
      !Number.isInteger(duration) || duration < 1 || duration > 240 ||
      !Number.isInteger(remaining) || remaining < 0 || remaining > 4 ||
      !Number.isFinite(subtotal) || subtotal <= 0 || subtotal > 100000 || round(subtotal) !== subtotal ||
      ![0, 0.13].includes(taxRate)) throw fail('Enter a valid email, name, package/reference, purchase date, duration, verified 0-4 remaining sessions, package subtotal and tax rate.');
  const exempt = /registered massage therapy|\brmt\b|acupuncture/i.test(packageName);
  if ((exempt ? 0 : 0.13) !== taxRate) throw fail('Package name must match the receipt tax classification (RMT/acupuncture 0%, regular massage 13%).');
  // The owner's purchase reference distinguishes genuine repeat purchases.
  const id = `PKG-${crypto.createHash('sha256').update(JSON.stringify([email, reference])).digest('hex').slice(0, 32)}`;
  return {
    package_id: id, email, customer_name: name, customer_phone: phone, package_name: packageName,
    purchase_reference: reference, purchase_date: date, duration_minutes: duration,
    initial_remaining: remaining, remaining_sessions: remaining,
    remaining_minutes: remaining * duration,
    subtotal, tax_rate: taxRate, usages_json: '[]', revision: 0, created_at: new Date().toISOString(),
  };
}

export function preparePackageRedemption(pkg, booking, { completed = false } = {}) {
  const existing = readPackageUsage(booking.intake_notes);
  if (existing) {
    if (existing.packageId !== pkg.package_id) throw fail('This booking is already linked to a different package.', 409);
    const tracked = JSON.parse(pkg.usages_json);
    if (!Array.isArray(tracked) || !tracked.some((usage) => usage.bookingId === booking.booking_id && usage.packageId === pkg.package_id)) {
      throw fail('Booking package linkage is not present in the package ledger. Reconcile it before retrying.', 409);
    }
    return { alreadyLinked: true, usage: existing };
  }
  if (String(booking.email || '').trim().toLowerCase() !== pkg.email) throw fail('Booking email must match this package.', 409);
  if (!completed || !['Confirmed', 'Completed'].includes(booking.status)) throw fail('Only completed treatment times for confirmed/completed bookings can deduct a package session.', 409);
  if (booking.date < pkg.purchase_date) throw fail('The booking predates this package purchase.', 409);
  if (booking.receipt_number || booking.receipt_issued_at || booking.receipt_email_status) throw fail('Link the package before issuing a receipt. Existing receipts cannot be rewritten.', 409);
  if (Number(booking.paid_amount) > 0 && !booking.booking_id.startsWith('WIX-')) throw fail('This booking already has a payment. Reconcile that payment before using a prepaid package.', 409);
  const packageDuration = Number(pkg.duration_minutes);
  const visitDuration = Number(booking.duration_minutes);
  if (!Number.isInteger(packageDuration) || packageDuration < 1 ||
      !Number.isInteger(visitDuration) || visitDuration < 1 || visitDuration > 240) {
    throw fail('Package and booking durations must be valid before package deduction.', 409);
  }
  const initialRemainingMinutes = Number(pkg.initial_remaining) * packageDuration;
  const remainingMinutes = pkg.remaining_minutes !== null && pkg.remaining_minutes !== undefined && Number.isFinite(Number(pkg.remaining_minutes))
    ? Number(pkg.remaining_minutes)
    : Number(pkg.remaining_sessions) * packageDuration;
  if (!Number.isFinite(initialRemainingMinutes) || initialRemainingMinutes < 0 ||
      !Number.isFinite(remainingMinutes) || remainingMinutes <= 0) throw fail('This package has no sessions remaining.', 409);
  if (visitDuration > remainingMinutes) throw fail('This visit is longer than the remaining prepaid package time.', 409);
  if (['discount_percent', 'membership_discount_amount'].some((field) => Number(booking[field]) > 0)) throw fail('Reconcile existing membership discounts before using this package.', 409);
  const exempt = /registered massage therapy|\brmt\b|acupuncture/i.test(booking.service_name);
  if ((exempt ? 0 : 0.13) !== Number(pkg.tax_rate)) throw fail('Booking and package receipt tax classifications differ.', 409);
  let usages;
  try { usages = JSON.parse(pkg.usages_json); } catch { throw fail('Stored package usage history is malformed.', 409); }
  if (!Array.isArray(usages)) throw fail('Stored package usage history is invalid.', 409);
  const usedMinutes = usages.reduce((sum, usage) => sum +
    (Number.isFinite(Number(usage.minutesDeducted))
      ? Number(usage.minutesDeducted)
      : Number(usage.sessionsDeducted || 1) * packageDuration), 0);
  const expectedRemainingMinutes = initialRemainingMinutes - usedMinutes;
  const balanceMismatch = Math.abs(remainingMinutes - expectedRemainingMinutes) > 0.001;
  if (balanceMismatch) {
    throw fail('Package balance and tracked sessions do not match. Reconcile the package before continuing.', 409);
  }
  const totalMinutes = 4 * packageDuration;
  const cumulativeMinutesBefore = (4 - Number(pkg.initial_remaining)) * packageDuration + usedMinutes;
  const cumulativeMinutesAfter = cumulativeMinutesBefore + visitDuration;
  const allocateCumulative = (cents, minutes) => Math.round(cents * minutes / totalMinutes);
  const subtotalCents = Math.round(Number(pkg.subtotal) * 100);
  const taxCents = Math.round(Number(pkg.subtotal) * Number(pkg.tax_rate) * 100);
  const subtotal = (allocateCumulative(subtotalCents, cumulativeMinutesAfter) - allocateCumulative(subtotalCents, cumulativeMinutesBefore)) / 100;
  const tax = (allocateCumulative(taxCents, cumulativeMinutesAfter) - allocateCumulative(taxCents, cumulativeMinutesBefore)) / 100;
  const total = round(subtotal + tax);
  if (!Number.isFinite(total) || total <= 0) throw fail('Package allocated value must be positive.', 409);
  const remainingMinutesAfter = remainingMinutes - visitDuration;
  const remaining = Math.round((remainingMinutesAfter / packageDuration) * 10000) / 10000;
  const usage = {
    packageId: pkg.package_id, packageName: pkg.package_name, purchaseReference: pkg.purchase_reference,
    minutesDeducted: visitDuration, remainingMinutes: remainingMinutesAfter, totalMinutes: totalMinutes,
    packageDurationMinutes: packageDuration, sessionsDeducted: visitDuration / packageDuration,
    remainingSessions: remaining, totalSessions: 4, allocatedTotal: total,
    allocatedSubtotal: subtotal, allocatedTax: tax,
    redeemedAt: new Date().toISOString(), bookingId: booking.booking_id, sessionDate: booking.date, sessionTime: booking.time,
  };
  const previousNotes = String(booking.intake_notes || '');
  let source;
  try {
    source = previousNotes.trim().startsWith('{') ? JSON.parse(previousNotes) : { originalNotes: previousNotes };
  } catch {
    source = { originalNotes: previousNotes };
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) source = { originalNotes: previousNotes };
  return {
    alreadyLinked: false, usage, remaining, remainingMinutes: remainingMinutesAfter, total,
    notes: JSON.stringify({ ...source, packageUsage: usage }),
    usages: JSON.stringify([...usages, usage]),
    statusNotes: `${booking.status_notes || ''}\n${packageReceiptDetails(JSON.stringify({ packageUsage: usage })).description}`.trim(),
  };
}

export function createPackageStore(bigquery, { projectId, datasetId, tableId = 'session_packages', bookingsTableId, loyaltyTableId = 'loyalty_ledger', forbiddenTables = [] }) {
  if (!/^[\w-]+$/.test(projectId) || !/^\w+$/.test(datasetId) || !/^\w+$/.test(tableId) || !/^\w+$/.test(bookingsTableId) ||
      !/^\w+$/.test(loyaltyTableId) || tableId === bookingsTableId || forbiddenTables.includes(tableId)) throw new Error('Configure a separate valid BigQuery package table; existing application tables cannot be used.');
  const ref = `\`${projectId}.${datasetId}.${tableId}\``;
  const bookingRef = `\`${projectId}.${datasetId}.${bookingsTableId}\``;
  const table = bigquery.dataset(datasetId).table(tableId);
  const ensure = async () => {
    const [exists] = await table.exists();
    if (!exists) {
      try {
        await bigquery.dataset(datasetId).createTable(tableId, { schema: FIELDS });
      } catch (error) { if (error.code !== 409) throw error; }
    }
    const [metadata] = await table.getMetadata();
    const canonical = (type) => ({ INTEGER: 'INT64', FLOAT: 'FLOAT64' }[type] || type);
    const fields = metadata.schema?.fields || [];
    const missing = FIELDS.filter((field) => !fields.some((existing) => existing.name === field.name));
    if (missing.some((field) => field.mode !== 'NULLABLE')) {
      throw new Error('Package table schema is incompatible. No schema was changed.');
    }
    if (missing.length) await table.setMetadata({ schema: { fields: [...fields, ...missing] } });
    const completeFields = [...fields, ...missing];
    if (FIELDS.some(({ name, type, mode }) => {
      const existing = completeFields.find((field) => field.name === name);
      return !existing || canonical(existing.type) !== type || existing.mode === 'REPEATED' ||
        (mode !== 'NULLABLE' && existing.mode === 'NULLABLE');
    }) || completeFields.some((field) => field.mode === 'REQUIRED' && !FIELDS.some(({ name }) => name === field.name))) {
      throw new Error('Package table schema is incompatible. No schema was changed.');
    }
  };
  return {
    async searchCustomers(search) {
      if (typeof search !== 'string' || !search.trim() || search.length > 150) throw fail('Enter a name, email or phone number (up to 150 characters).');
      await ensure();
      const [customers] = await bigquery.query({
        query: `SELECT customer_name AS name, LOWER(email) AS email, COALESCE(customer_phone, '') AS phone
          FROM ${ref}
          WHERE STRPOS(LOWER(CONCAT(customer_name, ' ', email, ' ', COALESCE(customer_phone, ''))), LOWER(@search)) > 0
            OR (@phone_search != '' AND STRPOS(REGEXP_REPLACE(COALESCE(customer_phone, ''), r'[^0-9]', ''), @phone_search) > 0)
          ORDER BY created_at DESC LIMIT 8`,
        params: {
          search: search.trim(),
          phone_search: /^[+\d\s().-]+$/.test(search.trim()) ? search.replace(/\D/g, '') : '',
        },
      });
      return customers;
    },
    async list({ search = '', offset = 0 } = {}) {
      if (typeof search !== 'string' || search.length > 200 || !Number.isSafeInteger(offset) || offset < 0) throw fail('Enter a valid search and page offset.');
      await ensure();
      const where = "WHERE STRPOS(LOWER(CONCAT(email, ' ', customer_name, ' ', package_name, ' ', purchase_reference)), LOWER(@search)) > 0";
      const [[packages], [count]] = await Promise.all([
        bigquery.query({ query: `SELECT * FROM ${ref} ${where} ORDER BY created_at DESC, package_id LIMIT 50 OFFSET @offset`, params: { search, offset } }),
        bigquery.query({ query: `SELECT COUNT(*) AS total FROM ${ref} ${where}`, params: { search } }),
      ]);
      return { packages: packages.map((pkg) => ({ ...packageWithBalance(pkg), usages: JSON.parse(pkg.usages_json) })), total: Number(count[0].total) };
    },
    async register(body) {
      const record = validatePackageRegistration(body);
      await ensure();
      const params = record;
      await bigquery.query({
        query: `MERGE ${ref} target USING (SELECT @package_id AS package_id) source ON target.package_id = source.package_id
          WHEN MATCHED AND COALESCE(target.customer_phone, '') = '' AND @customer_phone != '' THEN UPDATE SET customer_phone = @customer_phone, revision = target.revision + 1
          WHEN NOT MATCHED THEN INSERT (${FIELDS.map(({ name }) => name).join(', ')}) VALUES (${FIELDS.map(({ name }) => `@${name}`).join(', ')})`,
        params,
      });
      const [rows] = await bigquery.query({ query: `SELECT * FROM ${ref} WHERE package_id = @id`, params: { id: record.package_id } });
      if (rows.length !== 1) throw new Error('Package registration could not be verified.');
      const saved = rows[0];
      if (['email', 'package_name', 'purchase_date', 'duration_minutes', 'initial_remaining', 'subtotal', 'tax_rate'].some((key) => saved[key] !== record[key])) {
        throw fail('This purchase reference already belongs to a different package registration. Existing balance was not overwritten.', 409);
      }
      if (saved.customer_phone && record.customer_phone && saved.customer_phone !== record.customer_phone) {
        throw fail('This purchase reference already has a different customer phone number. Existing package details were not overwritten.', 409);
      }
      return { package: { ...packageWithBalance(saved), usages: JSON.parse(saved.usages_json) } };
    },
    async redeem({ packageId, bookingId, isCompleted }) {
      if (typeof packageId !== 'string' || packageId.length > 100 || typeof bookingId !== 'string' || !bookingId || bookingId.length > 100) throw fail('Select a package and booking.');
      await ensure();
      const [[packages], [bookings]] = await Promise.all([
        bigquery.query({ query: `SELECT * FROM ${ref} WHERE package_id = @id`, params: { id: packageId } }),
        bigquery.query({ query: `SELECT * FROM ${bookingRef} WHERE booking_id = @id`, params: { id: bookingId } }),
      ]);
      if (packages.length !== 1 || bookings.length !== 1) throw fail('One matching package and booking are required.', 404);
      const pkg = packages[0], booking = bookings[0];
      const result = preparePackageRedemption(pkg, booking, { completed: isCompleted(booking) });
      if (result.alreadyLinked) return result;
      const [ledgerExists] = await bigquery.dataset(datasetId).table(loyaltyTableId).exists();
      const [redemptions] = ledgerExists ? await bigquery.query({
        query: `SELECT transaction_id FROM \`${projectId}.${datasetId}.${loyaltyTableId}\` WHERE booking_id = @id AND type IN ('REDEEM', 'USE', 'HOTSTONE', 'EARN') LIMIT 1`,
        params: { id: bookingId },
      }) : [[]];
      if (redemptions.length) throw fail('This booking already has loyalty activity. Reconcile it before package deduction.', 409);
      await bigquery.query({
        query: `BEGIN TRANSACTION;
          ${ledgerExists ? `ASSERT (SELECT COUNT(*) FROM \`${projectId}.${datasetId}.${loyaltyTableId}\` WHERE booking_id = @booking_id AND type IN ('REDEEM', 'USE', 'HOTSTONE', 'EARN')) = 0 AS 'Loyalty activity changed; reconcile before deduction';` : ''}
          ASSERT (SELECT COUNT(*) FROM ${ref} WHERE package_id = @package_id AND revision = @revision AND COALESCE(remaining_minutes, remaining_sessions * duration_minutes) > 0) = 1 AS 'Package balance changed; refresh and retry';
          ASSERT (SELECT COUNT(*) FROM ${bookingRef} WHERE booking_id = @booking_id AND COALESCE(intake_notes, '') = @old_notes AND COALESCE(receipt_number, '') = '' AND COALESCE(receipt_issued_at, '') = '' AND COALESCE(receipt_email_status, '') = '' AND COALESCE(paid_amount, 0) = @old_paid AND COALESCE(total, 0) = @old_total AND COALESCE(status, '') = @old_status AND LOWER(TRIM(email)) = @email AND duration_minutes = @duration AND service_name = @old_service AND date = @old_date AND time = @old_time AND payment_option = @old_payment) = 1 AS 'Booking changed; refresh and retry';
          UPDATE ${ref} SET remaining_sessions = @remaining, remaining_minutes = @remaining_minutes, usages_json = @usages, revision = revision + 1 WHERE package_id = @package_id AND revision = @revision;
          ASSERT @@row_count = 1 AS 'Package deduction failed';
          UPDATE ${bookingRef} SET intake_notes = @notes, paid_amount = @total, total = @total, payment_option = 'Prepaid package redemption (no new payment)', status_notes = @status_notes WHERE booking_id = @booking_id AND COALESCE(discount_percent, 0) = 0 AND COALESCE(membership_discount_amount, 0) = 0;
          ASSERT @@row_count = 1 AS 'Booking linkage failed';
          COMMIT TRANSACTION;`,
        params: {
          package_id: packageId, booking_id: bookingId, revision: Number(pkg.revision),
          remaining: Math.floor(result.remaining), remaining_minutes: result.remainingMinutes,
          usages: result.usages, notes: result.notes, total: result.total,
          old_notes: String(booking.intake_notes || ''), old_paid: Number(booking.paid_amount || 0), old_total: Number(booking.total || 0),
          old_status: String(booking.status || ''), email: pkg.email, duration: Number(pkg.duration_minutes), status_notes: result.statusNotes,
          old_service: booking.service_name, old_date: booking.date, old_time: booking.time, old_payment: booking.payment_option || '',
        },
      });
      return { alreadyLinked: false, usage: result.usage };
    },
  };
}
