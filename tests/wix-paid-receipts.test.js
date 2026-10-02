import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import { BOOKING_TABLE_FIELDS } from '../lib/booking-schema.js';
import { validatePackageRegistration } from '../lib/packages.js';

test('reviewed Wix import produces paid records and actual receipt endpoint issues/emails taxable and exempt receipts', async (t) => {
  Object.assign(process.env, {
    OWNER_ADMIN_PASSWORD: 'synthetic-owner-password-for-tests',
    OWNER_ADMIN_SESSION_SECRET: 'synthetic-session-secret-longer-than-thirty-two-characters',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com',
    GOOGLE_PRIVATE_KEY: 'synthetic-key-never-used-by-mocked-network',
    GOOGLE_SPREADSHEET_ID: 'synthetic-spreadsheet',
    BIGQUERY_PROJECT_ID: 'test-project',
    BIGQUERY_DATASET: 'booking_system',
    BIGQUERY_BOOKINGS_TABLE: 'bookings',
    GOOGLE_OAUTH_CLIENT_ID: 'synthetic-oauth-client',
    GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-oauth-secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'synthetic-refresh-token',
    GOOGLE_GMAIL_SENDER_EMAIL: 'test@example.com',
  });
  const services = [
    { id: 1, name: 'Traditional Thai (90 min)', duration: 90, price: 100, taxRate: 0.13 },
    { id: 2, name: 'Registered Massage Therapy (90 min)', duration: 90, price: 120, taxRate: 0 },
  ];
  const profileHeaders = ['businessName', 'legalName', 'tagline', 'email', 'phone', 'website', 'address', 'taxRegistrationNumber', 'photoUrl'];
  t.mock.method(google, 'sheets', () => ({
    spreadsheets: {
      get: async () => ({ data: { sheets: ['Services', 'BusinessProfile'].map((title) => ({ properties: { title } })) } }),
      values: {
        get: async ({ range }) => {
          if (range === 'Services!A2:K') return { data: { values: services.map((service) => [
            service.id, service.name, 'Massage', service.duration, service.price, 0, 'FALSE', service.taxRate, '', 'TRUE',
          ]) } };
          if (range === 'BusinessProfile!A1:I1') return { data: { values: [profileHeaders] } };
          if (range === 'BusinessProfile!A1:I2') return { data: { values: [profileHeaders, [
            'Test Clinic', '', '', 'test@example.com', '4165550100', 'https://test.example', 'Ontario', '', '',
          ]] } };
          throw new Error(`Unexpected spreadsheet read: ${range}`);
        },
      },
    },
  }));
  const emails = [];
  t.mock.method(google, 'gmail', () => ({
    users: { messages: { send: async (options) => { emails.push(options); return { data: { id: 'mock-email-id' } }; } } },
  }));
  const loyaltyColumns = [
    'settings_json', 'updated_at', 'email', 'name', 'phone', 'enrolled_at', 'membership_type',
    'organization', 'paid_through', 'company_id', 'company_contact_email', 'is_primary_contact',
    'transaction_id', 'booking_id', 'type', 'points', 'reward_value', 'description', 'created_at',
    'hours', 'receipt_no', 'contact_email', 'access_token', 'join_token',
  ];
  const packageSchema = [
    ['package_id', 'STRING'], ['email', 'STRING'], ['customer_name', 'STRING'], ['package_name', 'STRING'],
    ['purchase_reference', 'STRING'], ['purchase_date', 'STRING'], ['duration_minutes', 'INT64'],
    ['initial_remaining', 'INT64'], ['remaining_sessions', 'INT64'], ['subtotal', 'FLOAT64'],
    ['tax_rate', 'FLOAT64'], ['usages_json', 'STRING'], ['revision', 'INT64'], ['created_at', 'STRING'],
  ].map(([name, type]) => ({ name, type }));
  t.mock.method(BigQuery.prototype, 'dataset', () => ({
    exists: async () => [true],
    table: (tableId) => ({
      exists: async () => [true],
      getMetadata: async () => [{ schema: { fields: tableId === 'bookings' ? BOOKING_TABLE_FIELDS : tableId === 'session_packages' ? packageSchema : loyaltyColumns.map((name) => ({ name, type: 'STRING' })) } }],
      setMetadata: async () => { throw new Error('Schema changes are not allowed in this test'); },
    }),
    createTable: async () => { throw new Error('Table creation is not allowed'); },
  }));
  const records = new Map();
  const packages = new Map();
  t.mock.method(BigQuery.prototype, 'createQueryJob', async ({ params }) => {
    let inserted = 0;
    for (const record of params.records) {
      if (!records.has(record.booking_id)) { records.set(record.booking_id, { ...record }); inserted += 1; }
    }
    return [{
      getQueryResults: async () => [],
      getMetadata: async () => [{ statistics: { query: { numDmlAffectedRows: String(inserted), dmlStats: { insertedRowCount: String(inserted), updatedRowCount: '0' } } } }],
    }];
  });
  t.mock.method(BigQuery.prototype, 'query', async ({ query, params }) => {
    if (query.startsWith('MERGE `test-project.booking_system.session_packages`')) {
      if (!packages.has(params.package_id)) packages.set(params.package_id, { ...params });
      return [[]];
    }
    if (query.startsWith('SELECT * FROM `test-project.booking_system.session_packages`')) return [[packages.get(params.id)].filter(Boolean)];
    if (query.startsWith('SELECT transaction_id')) return [[]];
    if (query.startsWith('BEGIN TRANSACTION')) {
      if (params.where_booking_id) {
        const record = records.get(params.where_booking_id);
        assert.equal(record.intake_notes, params.expected_notes);
        assert.equal(record.total, params.expected_total);
        assert.equal(record.paid_amount, params.expected_paid);
        assert.equal(record.receipt_number, params.expected_receipt);
        for (const [name, value] of Object.entries(params)) if (name.startsWith('set_')) record[name.slice(4)] = value;
        return [[]];
      }
      const pkg = packages.get(params.package_id), record = records.get(params.booking_id);
      assert.equal(pkg.revision, params.revision);
      assert.equal(record.intake_notes, params.old_notes);
      Object.assign(pkg, { remaining_sessions: params.remaining, usages_json: params.usages, revision: pkg.revision + 1 });
      Object.assign(record, { total: params.total, paid_amount: params.total, intake_notes: params.notes, status_notes: params.status_notes, payment_option: 'Prepaid package redemption (no new payment)' });
      return [[]];
    }
    if (query.startsWith('SELECT * FROM `test-project.booking_system.bookings`')) return [params?.id ? [...records.values()].filter((record) => record.booking_id === params.id) : [...records.values()]];
    if (query.startsWith('SELECT ') && query.includes('FROM `test-project.booking_system.loyalty_')) return [[]];
    if (query.startsWith('UPDATE `test-project.booking_system.bookings`')) {
      const record = records.get(params.where_booking_id);
      for (const [name, value] of Object.entries(params)) if (name.startsWith('set_')) record[name.slice(4)] = value;
      return [[]];
    }
    throw new Error(`Unexpected BigQuery query: ${query}`);
  });
  const { default: handler } = await import('../api/booking.js');
  let cookie;
  const request = async (view, body) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method: 'POST', query: { view }, headers: {
      host: 'test.example', origin: 'https://test.example', 'content-type': 'application/json', cookie,
    } });
    const res = {
      setHeader(key, value) { if (key === 'Set-Cookie') cookie = value.split(';')[0]; },
      status(code) { this.code = code; return this; },
      json(data) { this.data = data; return this; },
    };
    await handler(req, res);
    return res;
  };
  assert.equal((await request('owner-login', { password: process.env.OWNER_ADMIN_PASSWORD })).code, 200);
  const headers = [
    'Session date', 'Start time', 'Registration date', 'Booking contact name', 'Booking contact email',
    'Booking contact phone', 'Client address', 'Spots filled', 'Duration', 'Service name', 'Service type',
    'Staff name', 'Booking status', 'Attendance status', 'Payment status',
  ];
  const csv = [headers, ...['Wix regular service', 'Wix RMT service'].map((service, index) => [
    '2025-01-10', '13:00', '2025-01-01', 'Test Client', `test${index}@example.com`, '4165550100',
    'Unknown', '1', '1h, 30m', service, 'Appointment', 'Test Staff', 'Confirmed', 'Not specified', 'Exempt',
  ])].map((row) => row.map((value) => `"${value}"`).join(',')).join('\n');
  const initial = await request('wix-bookings-import', { csv, preview: true });
  assert.equal(initial.code, 200);
  const priceMappings = initial.data.priceGroups.map((group) => {
    const service = services[group.serviceName === 'Wix regular service' ? 0 : 1];
    return { key: group.key, serviceId: service.id, serviceName: service.name, price: service.price, taxRate: service.taxRate };
  });
  const stale = await request('wix-bookings-import', { csv, preview: true, priceMappings: priceMappings.map((mapping) => ({ ...mapping, price: 1 })) });
  assert.equal(stale.code, 400);
  assert.equal(records.size, 0);
  const reviewed = await request('wix-bookings-import', { csv, preview: true, priceMappings });
  assert.equal(reviewed.code, 200);
  assert.equal(reviewed.data.approvedTotal, 233);
  const imported = await request('wix-bookings-import', { csv, priceMappings, confirmPaid: true });
  assert.equal(imported.code, 200);
  assert.equal(imported.data.imported, 2);
  assert.equal(emails.length, 0);
  for (const record of records.values()) {
    assert.equal(record.paid_amount, record.total);
    const receiptResponse = await request('issue-receipt', { bookingId: record.booking_id });
    assert.equal(receiptResponse.code, 200, JSON.stringify(receiptResponse.data));
    const receipt = receiptResponse.data.receipt;
    const taxable = record.service_name === services[0].name;
    assert.equal(receipt.subtotal, taxable ? 100 : 120);
    assert.equal(receipt.tax, taxable ? 13 : 0);
    assert.equal(receipt.total, taxable ? 113 : 120);
    assert.match(receipt.number, /^MTT-\d{4}-\d{6}$/);
    assert.equal(receiptResponse.data.emailed, true);
    assert.equal(record.receipt_email_status, 'sent');
    const retry = await request('issue-receipt', { bookingId: record.booking_id });
    assert.equal(retry.code, 200);
    assert.equal(retry.data.alreadyIssued, true);
    assert.equal(retry.data.receipt.number, receipt.number);
  }
  assert.equal(emails.length, 2);
  assert.equal((await request('package-register', { confirmed: false })).code, 400);
  const packageForm = {
    email: 'test0@example.com', customerName: 'Test Client', packageName: 'Package: 90 min x 4 Sessions',
    purchaseReference: 'verified-package-001', purchaseDate: '2025-01-01',
    durationMinutes: 90, remainingSessions: 4, subtotal: 540, taxRate: 0.13, confirmed: true,
  };
  const expectedPackage = validatePackageRegistration(packageForm);
  const registered = await request('package-register', packageForm);
  assert.equal(registered.code, 200);
  assert.equal(registered.data.package.package_id, expectedPackage.package_id);
  assert.equal(registered.data.package.remaining_sessions, 4);
  assert.equal((await request('package-register', packageForm)).data.package.remaining_sessions, 4);
  const packageBooking = {
    ...[...records.values()].find((record) => record.service_name === services[0].name),
    booking_id: 'WIX-package-visit', service_name: 'Package: 90 min x 4 Sessions',
    receipt_number: '', receipt_issued_at: '', receipt_email_status: '',
  };
  records.set(packageBooking.booking_id, packageBooking);
  const unlinked = await request('issue-receipt', { bookingId: packageBooking.booking_id });
  assert.equal(unlinked.code, 409);
  const linked = await request('package-redeem', { packageId: expectedPackage.package_id, bookingId: packageBooking.booking_id });
  assert.equal(linked.code, 200, JSON.stringify(linked.data));
  assert.equal(linked.data.usage.remainingSessions, 3);
  assert.equal(packageBooking.total, 152.55);
  const retryLink = await request('package-redeem', { packageId: expectedPackage.package_id, bookingId: packageBooking.booking_id });
  assert.equal(retryLink.data.alreadyLinked, true);
  assert.equal(packages.get(expectedPackage.package_id).remaining_sessions, 3);
  assert.equal((await request('package-register', packageForm)).data.package.remaining_sessions, 3, 'Registration retries cannot top up');
  const issued = await request('issue-receipt', { bookingId: packageBooking.booking_id });
  assert.equal(issued.code, 200);
  assert.equal(issued.data.receipt.subtotal, 135);
  assert.equal(issued.data.receipt.tax, 17.55);
  assert.equal(issued.data.receipt.total, 152.55);
  assert.equal(issued.data.receipt.packageUsage.remainingSessions, 3);
  assert.equal(issued.data.receipt.packageUsage.newPayment, 0);
  assert.match(issued.data.receipt.packageUsage.description, /1 session deducted; 3 of 4 sessions remain/);
  assert.equal(emails.length, 3);
  const mime = Buffer.from(emails[2].requestBody.raw, 'base64url').toString();
  const textBody = mime.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1];
  assert.match(Buffer.from(textBody.replace(/\s/g, ''), 'base64').toString(), /1 session deducted; 3 of 4 sessions remain/);
  const htmlBody = mime.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1];
  assert.match(Buffer.from(htmlBody.replace(/\s/g, ''), 'base64').toString(), /Package usage:/);
  assert.equal((await request('delete-booking', { bookingId: packageBooking.booking_id })).code, 409);
  assert.equal((await request('complete-booking-details', { bookingId: packageBooking.booking_id, total: 140 })).code, 409);
  assert.equal((await request('cancel-booking', { bookingId: packageBooking.booking_id, email: packageBooking.email })).code, 409);
  assert.equal((await request('reschedule-booking', { bookingId: packageBooking.booking_id, email: packageBooking.email, date: '2026-12-01', time: '01:00 PM' })).code, 409);
});
