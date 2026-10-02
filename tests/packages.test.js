import test from 'node:test';
import assert from 'node:assert/strict';
import { createPackageStore, packageReceiptDetails, preparePackageRedemption, readPackageUsage, validatePackageRegistration } from '../lib/packages.js';
import { applyWixCataloguePrices, prepareWixBookings } from '../lib/wix-bookings.js';
import { WIX_120_SERVICE, wixImportServices } from '../lib/wix-pricing.js';

const registration = {
  email: ' CLIENT@example.com ', customerName: 'Test Client', packageName: 'Package: 60 min x 4 Sessions',
  purchaseReference: 'purchase-001', purchaseDate: '2025-01-01',
  durationMinutes: 60, remainingSessions: 4, subtotal: 360, taxRate: 0.13, confirmed: true,
};
const pkg = () => validatePackageRegistration(registration);
const booking = (id = 'WIX-test') => ({
  booking_id: id, email: 'client@example.com', duration_minutes: 60, status: 'Confirmed',
  date: '2025-01-10', time: '01:00 PM', service_name: 'Package: 60 min x 4 Sessions',
  paid_amount: 101.7, total: 101.7, intake_notes: '{"sourceFields":{"Form answer 1":"preserve"}}',
  status_notes: 'Preserve original provenance.', receipt_number: '', receipt_issued_at: '', receipt_email_status: '',
  payment_option: 'Historical payment (owner confirmed)', discount_percent: 0, membership_discount_amount: 0,
});

test('120-minute import option is always available at exactly $185 + 13% ($209.05)', () => {
  const services = wixImportServices([]);
  assert.deepEqual(services, [WIX_120_SERVICE]);
  assert.equal(wixImportServices(services).length, 1);
  const headers = ['Session date', 'Start time', 'Registration date', 'Booking contact name', 'Booking contact email', 'Booking contact phone', 'Client address', 'Spots filled', 'Duration', 'Service name', 'Service type', 'Staff name', 'Booking status', 'Attendance status', 'Payment status'];
  const rows = [headers, ...['90-min, Pay full at the spa', '60-min, Pay full at the spa'].map((name) => [
    '2025-01-01', '13:00', '2025-01-01', 'Test', 'test@example.com', '4165550100', 'Unknown', '1',
    '2h, 0m', name, 'Appointment', 'Staff', 'Confirmed', 'Not specified', 'Exempt',
  ])];
  const csv = rows.map((row) => row.map((value) => `"${value}"`).join(',')).join('\n');
  const prepared = prepareWixBookings(csv, { today: '2026-10-02' });
  const mappings = prepared.bookings.map((record) => ({
    key: JSON.stringify([record.service_name, record.duration_minutes]),
    serviceId: WIX_120_SERVICE.id, serviceName: WIX_120_SERVICE.name, price: 185, taxRate: 0.13,
  }));
  const priced = applyWixCataloguePrices(prepared, [], mappings, true);
  assert.equal(priced.bookings.length, 2);
  assert.ok(priced.bookings.every((record) => record.total === 209.05 && record.paid_amount === 209.05));
  assert.equal(priced.summary.approvedTotal, 418.1);
  assert.throws(() => applyWixCataloguePrices(prepared, [], mappings.map((mapping) => ({ ...mapping, price: 180 })), true), /changed/);
});

test('historical package visit uses one quarter of the package price without inventing a purchase or balance', () => {
  const prepared = {
    bookings: [{ ...booking(), service_name: 'Package pre-paid 60 min' }],
    summary: { totalRows: 1, validBookings: 1 },
  };
  const service = { id: 16, name: 'Package: 60 min x 4 Sessions', price: 360, taxRate: 0.13, duration: 60, active: true };
  const priced = applyWixCataloguePrices(prepared, [service], [{
    key: JSON.stringify(['Package pre-paid 60 min', 60]),
    serviceId: 16, serviceName: service.name, price: 360, taxRate: 0.13,
  }], true);
  assert.equal(priced.bookings[0].total, 101.7);
  assert.equal(JSON.parse(priced.bookings[0].intake_notes).pricing.packageSessions, 4);
  assert.equal(readPackageUsage(priced.bookings[0].intake_notes), null);
});

test('registration validates owner confirmation, price, duration, tax, remaining count, and unique purchase identity', () => {
  const record = pkg();
  assert.equal(record.email, 'client@example.com');
  assert.equal(record.remaining_sessions, 4);
  assert.equal(record.initial_remaining, 4);
  assert.equal(record.usages_json, '[]');
  assert.equal(record.package_id, pkg().package_id);
  assert.notEqual(record.package_id, validatePackageRegistration({ ...registration, purchaseReference: 'purchase-002' }).package_id);
  for (const change of [
    { confirmed: false }, { email: 'bad' }, { subtotal: -1 }, { taxRate: 0.05 }, { taxRate: 0 },
    { remainingSessions: 5 }, { remainingSessions: -1 }, { remainingSessions: 1.5 },
    { durationMinutes: 0 }, { purchaseDate: '2025-02-30' }, { purchaseReference: '' },
  ]) assert.throws(() => validatePackageRegistration({ ...registration, ...change }), { statusCode: 400 });
});

test('four distinct completed bookings deduct 4→3→2→1→0; retry does not deduct and fifth use fails', () => {
  const packageRecord = pkg();
  const records = [];
  for (let index = 0; index < 4; index += 1) {
    const record = booking(`WIX-${index}`);
    const result = preparePackageRedemption(packageRecord, record, { completed: true });
    assert.equal(result.remaining, 3 - index);
    assert.equal(result.total, 101.7);
    assert.equal(JSON.parse(result.notes).sourceFields['Form answer 1'], 'preserve');
    assert.match(result.statusNotes, /Preserve original provenance/);
    packageRecord.remaining_sessions = result.remaining;
    packageRecord.usages_json = result.usages;
    record.intake_notes = result.notes;
    records.push(record);
    const retry = preparePackageRedemption(packageRecord, record, { completed: true });
    assert.equal(retry.alreadyLinked, true);
    assert.equal(packageRecord.remaining_sessions, 3 - index);
    const receipt = packageReceiptDetails(record.intake_notes);
    assert.equal(receipt.remainingSessions, 3 - index);
    assert.equal(receipt.allocatedSubtotal, 90);
    assert.equal(receipt.allocatedTax, 11.7);
    assert.equal(receipt.newPayment, 0);
    assert.match(receipt.description, /1 session deducted/);
  }
  assert.equal(JSON.parse(packageRecord.usages_json).length, 4);
  assert.throws(() => preparePackageRedemption(packageRecord, booking('WIX-fifth'), { completed: true }), /no sessions remaining/);
  assert.equal(packageReceiptDetails(records[0].intake_notes).remainingSessions, 3, 'Earlier receipt keeps balance-at-visit snapshot');
});

test('verified partial balance deducts only what remains; fractional cents conserve complete package value', () => {
  const packageRecord = validatePackageRegistration({ ...registration, subtotal: 360.03 });
  let subtotal = 0, tax = 0;
  for (let index = 0; index < 4; index += 1) {
    const result = preparePackageRedemption(packageRecord, booking(`WIX-${index}`), { completed: true });
    subtotal += result.usage.allocatedSubtotal;
    tax += result.usage.allocatedTax;
    packageRecord.remaining_sessions = result.remaining;
    packageRecord.usages_json = result.usages;
  }
  assert.equal(Math.round(subtotal * 100), 36003);
  assert.equal(Math.round(tax * 100), Math.round(360.03 * 0.13 * 100));
  const partial = validatePackageRegistration({ ...registration, remainingSessions: 2 });
  assert.equal(preparePackageRedemption(partial, booking(), { completed: true }).remaining, 1);
});

test('prevents customer/duration mismatch, uncompleted/cancelled visits, receipt rewrites, extra payments and double benefits', () => {
  for (const changes of [
    { email: 'other@example.com' }, { duration_minutes: 90 }, { status: 'Cancelled' },
    { status: 'No Show' }, { receipt_number: 'RECEIPT' }, { receipt_email_status: 'pending' },
    { receipt_issued_at: '2025-01-01' }, { date: '2024-12-31' },
    { booking_id: 'MTT-normal-paid' }, { membership_discount_amount: 1 }, { service_name: 'RMT service' },
  ]) assert.throws(() => preparePackageRedemption(pkg(), { ...booking(), ...changes }, { completed: true }), { statusCode: 409 });
  assert.throws(() => preparePackageRedemption(pkg(), booking(), { completed: false }), /completed treatment/);
  assert.equal(readPackageUsage('Plain original clinical notes'), null);
  assert.throws(() => readPackageUsage('{"packageUsage":'), /malformed/);
  assert.throws(() => readPackageUsage('{"packageUsage":{}}'), /invalid/);
});

test('store commits package decrement and booking link in one transaction with revision and snapshot guards', async () => {
  const packageRecord = pkg(), record = booking();
  const calls = [];
  const schema = Object.entries(packageRecord).map(([name, value]) => ({
    name, type: typeof value === 'number' ? ['subtotal', 'tax_rate'].includes(name) ? 'FLOAT64' : 'INT64' : 'STRING',
  }));
  const bigquery = {
    dataset: () => ({
      table: () => ({ exists: async () => [true], getMetadata: async () => [{ schema: { fields: schema } }] }),
    }),
    query: async (options) => {
      calls.push(options);
      if (options.query.includes('SELECT transaction_id')) return [[]];
      if (options.query.startsWith('SELECT * FROM `test-project.booking_system.session_packages`')) return [[packageRecord]];
      if (options.query.startsWith('SELECT * FROM `test-project.booking_system.bookings`')) return [[record]];
      if (options.query.startsWith('BEGIN TRANSACTION')) return [[]];
      throw new Error(`Unexpected query ${options.query}`);
    },
  };
  const config = { projectId: 'test-project', datasetId: 'booking_system', bookingsTableId: 'bookings' };
  const result = await createPackageStore(bigquery, config).redeem({ packageId: packageRecord.package_id, bookingId: record.booking_id, isCompleted: () => true });
  assert.equal(result.usage.remainingSessions, 3);
  const script = calls.find(({ query }) => query.startsWith('BEGIN TRANSACTION'));
  assert.match(script.query, /revision = @revision/);
  assert.match(script.query, /COALESCE\(intake_notes, ''\) = @old_notes/);
  assert.match(script.query, /receipt_number/);
  assert.match(script.query, /UPDATE `test-project.booking_system.session_packages`/);
  assert.match(script.query, /UPDATE `test-project.booking_system.bookings`/);
  assert.match(script.query, /COMMIT TRANSACTION/);
  assert.equal(script.params.remaining, 3);
  assert.equal(script.params.total, 101.7);
  assert.throws(() => createPackageStore(bigquery, { ...config, tableId: 'bookings' }), /separate/);
  assert.throws(() => createPackageStore(bigquery, { ...config, tableId: 'loyalty_ledger', forbiddenTables: ['loyalty_ledger'] }), /separate/);
  bigquery.query = async (options) => {
    if (options.query.includes('SELECT transaction_id')) return [[{ transaction_id: 'used-loyalty' }]];
    if (options.query.includes('session_packages')) return [[packageRecord]];
    return [[record]];
  };
  await assert.rejects(() => createPackageStore(bigquery, config).redeem({ packageId: packageRecord.package_id, bookingId: record.booking_id, isCompleted: () => true }), /already has loyalty activity/);
});

test('transaction failure is surfaced, not reported as a successful deduction', async () => {
  const packageRecord = pkg(), record = booking();
  const schema = Object.entries(packageRecord).map(([name, value]) => ({
    name, type: typeof value === 'number' ? ['subtotal', 'tax_rate'].includes(name) ? 'FLOAT64' : 'INT64' : 'STRING',
  }));
  const bigquery = {
    dataset: () => ({ table: () => ({ exists: async () => [true], getMetadata: async () => [{ schema: { fields: schema } }] }) }),
    query: async ({ query }) => {
      if (query.startsWith('BEGIN TRANSACTION')) throw new Error('Package balance changed; refresh and retry');
      if (query.includes('SELECT transaction_id')) return [[]];
      return query.includes('session_packages') ? [[packageRecord]] : [[record]];
    },
  };
  await assert.rejects(() => createPackageStore(bigquery, { projectId: 'test-project', datasetId: 'booking_system', bookingsTableId: 'bookings' }).redeem({
    packageId: packageRecord.package_id, bookingId: record.booking_id, isCompleted: () => true,
  }), /Package balance changed/);
  assert.equal(packageRecord.remaining_sessions, 4);
  assert.equal(record.intake_notes, booking().intake_notes);
});
