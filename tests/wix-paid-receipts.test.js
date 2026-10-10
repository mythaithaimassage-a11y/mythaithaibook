import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import { BOOKING_TABLE_FIELDS } from '../lib/booking-schema.js';
import { validatePackageRegistration } from '../lib/packages.js';
import { createDashboardChallengeStore, handleDashboardChallengeQuery, readDashboardOtp } from './helpers/dashboard-auth.js';

test('reviewed Wix import produces paid records and actual receipt endpoint issues/emails taxable and exempt receipts', async (t) => {
  Object.assign(process.env, {
    OWNER_ADMIN_PASSWORD: 'synthetic-owner-password-for-tests',
    OWNER_ADMIN_EMAIL: 'owner@example.com',
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
  let businessPhotoUrl = '';
  t.mock.method(google, 'sheets', () => ({
    spreadsheets: {
      get: async () => ({ data: { sheets: ['Services', 'BusinessProfile', 'Therapists'].map((title) => ({ properties: { title } })) } }),
      values: {
        get: async ({ range }) => {
          if (range === 'Therapists!A2:J') return { data: { values: [[7, 'Mapped Therapist', '', 4.9, 'TRUE', 'FALSE', '1', '{}', 'TRUE']] } };
          if (range === 'Services!A2:K') return { data: { values: services.map((service) => [
            service.id, service.name, 'Massage', service.duration, service.price, 0, 'FALSE', service.taxRate, '', 'TRUE',
          ]) } };
          if (range === 'BusinessProfile!A1:I1') return { data: { values: [profileHeaders] } };
          if (range === 'BusinessProfile!A1:I2') return { data: { values: [profileHeaders, [
            'Test Clinic', '', '', 'test@example.com', '4165550100', 'https://test.example', 'Ontario', '', businessPhotoUrl,
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
  const calendarEvents = [];
  t.mock.method(google, 'calendar', () => ({
    events: { insert: async (options) => { calendarEvents.push(options); return { data: { id: options.requestBody.id } }; } },
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
  let bookingSchema = BOOKING_TABLE_FIELDS.filter((field) => !['receipt_manual_discount', 'receipt_reconciliation', 'booking_note'].includes(field.name));
  const schemaUpdates = [];
  t.mock.method(BigQuery.prototype, 'dataset', () => ({
    exists: async () => [true],
    table: (tableId) => ({
      exists: async () => [true],
      getMetadata: async () => [{ schema: { fields: tableId === 'bookings' ? bookingSchema : tableId === 'session_packages' ? packageSchema : loyaltyColumns.map((name) => ({ name, type: 'STRING' })) } }],
      setMetadata: async ({ schema }) => {
        assert.equal(tableId, 'bookings');
        assert.deepEqual(schema.fields.slice(0, -3), bookingSchema);
        assert.deepEqual(schema.fields.slice(-3), [
          { name: 'receipt_manual_discount', type: 'FLOAT64', mode: 'NULLABLE' },
          { name: 'receipt_reconciliation', type: 'STRING', mode: 'NULLABLE' },
          { name: 'booking_note', type: 'STRING', mode: 'NULLABLE' },
        ]);
        bookingSchema = schema.fields;
        schemaUpdates.push(schema);
      },
    }),
    createTable: async () => { throw new Error('Table creation is not allowed'); },
  }));
  const records = new Map();
  let loyaltyRecords = [];
  const packages = new Map();
  const dashboardChallenges = createDashboardChallengeStore();
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
    const dashboardAuthResult = handleDashboardChallengeQuery(query, params, dashboardChallenges);
    if (dashboardAuthResult) return dashboardAuthResult;
    if (!params?.links && query.includes("COALESCE(calendar_event_id, '') = ''")) {
      const pending = [...records.values()].filter((record) => !record.calendar_event_id && !['Cancelled', 'No Show'].includes(record.status));
      if (query.startsWith('SELECT COUNT')) return [[{ pending: pending.length }]];
      if (query.startsWith('SELECT *')) return [pending.slice(0, 10)];
      if (query.startsWith('BEGIN TRANSACTION')) {
        const record = records.get(params.bookingId);
        Object.assign(record, { calendar_id: params.calendarId, calendar_event_id: params.eventId });
        return [[]];
      }
    }
    if (query.startsWith('MERGE `test-project.booking_system.session_packages`')) {
      if (!packages.has(params.package_id)) packages.set(params.package_id, { ...params });
      return [[]];
    }
    if (query.startsWith('SELECT * FROM `test-project.booking_system.session_packages`')) return [[packages.get(params.id)].filter(Boolean)];
    if (query.startsWith('SELECT transaction_id')) return [[]];
    if (query.startsWith('BEGIN TRANSACTION')) {
      if (params.links) {
        for (const link of params.links) {
          Object.assign(records.get(link.bookingId), { calendar_id: params.calendarId, calendar_event_id: link.eventId });
        }
        return [[]];
      }
      if (params.where_booking_id) {
        const record = records.get(params.where_booking_id);
        for (const field of BOOKING_TABLE_FIELDS) {
          const value = field.type === 'STRING' ? String(record[field.name] || '') : Number(record[field.name]) || 0;
          assert.equal(value, params[`expected_${field.name}`]);
        }
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
    if (query.startsWith('SELECT ') && query.includes('FROM `test-project.booking_system.loyalty_')) {
      return [query.includes('loyalty_ledger') ? loyaltyRecords : []];
    }
    if (query.startsWith('UPDATE `test-project.booking_system.loyalty_ledger`')) return [[]];
    if (query.startsWith('UPDATE `test-project.booking_system.bookings`')) {
      const record = records.get(params.where_booking_id);
      for (const [name, value] of Object.entries(params)) if (name.startsWith('set_')) record[name.slice(4)] = value;
      return [[]];
    }
    throw new Error(`Unexpected BigQuery query: ${query}`);
  });
  const { default: handler } = await import('../api/booking.js');
  let cookie;
  const request = async (view, body, confirmReconciliation = true) => {
    if (view === 'issue-receipt') body = { ...body, confirmReconciliation };
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
  const login = await request('owner-login', { email: process.env.OWNER_ADMIN_EMAIL, password: process.env.OWNER_ADMIN_PASSWORD });
  assert.equal(login.code, 200);
  const verified = await request('owner-verify', {
    challengeId: login.data.challengeId,
    code: readDashboardOtp(emails.at(-1)),
  });
  assert.equal(verified.code, 200);
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
  assert.deepEqual(initial.data.therapistGroups, [{ sourceName: 'Test Staff', count: 2 }]);
  const therapistMappings = [{ sourceName: 'Test Staff', therapistId: 7, therapistName: 'Mapped Therapist' }];
  const staleTherapist = await request('wix-bookings-import', { csv, preview: true, therapistMappings: [{ ...therapistMappings[0], therapistName: 'Old name' }] });
  assert.equal(staleTherapist.code, 400);
  const reviewed = await request('wix-bookings-import', { csv, preview: true, priceMappings, therapistMappings });
  assert.equal(reviewed.code, 200);
  assert.equal(reviewed.data.approvedTotal, 233);
  assert.equal(reviewed.data.mappedTherapistBookings, 2);
  assert.ok(reviewed.data.sample.every((record) => record.therapist_name === 'Mapped Therapist'));
  const imported = await request('wix-bookings-import', { csv, priceMappings, therapistMappings, confirmPaid: true });
  assert.equal(imported.code, 200);
  assert.equal(imported.data.imported, 2);
  assert.deepEqual(imported.data.calendarSync, { synced: 2, pending: 0, errors: [] });
  assert.equal(calendarEvents.length, 2);
  assert.ok(calendarEvents.every((event) => event.sendUpdates === 'none' && /Mapped Therapist/.test(event.requestBody.description)));
  assert.equal(emails.length, 1);
  for (const record of records.values()) {
    assert.match(record.calendar_event_id, /^a11[a-f0-9]{64}$/);
    assert.equal(record.therapist_name, 'Mapped Therapist');
    assert.equal(JSON.parse(record.intake_notes).sourceFields['Staff name'], 'Test Staff');
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
  assert.equal(emails.length, 3);
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
  assert.equal(emails.length, 4);
  const mime = Buffer.from(emails[3].requestBody.raw, 'base64url').toString();
  const textBody = mime.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1];
  assert.match(Buffer.from(textBody.replace(/\s/g, ''), 'base64').toString(), /1 session deducted; 3 of 4 sessions remain/);
  const htmlBody = mime.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1];
  assert.match(Buffer.from(htmlBody.replace(/\s/g, ''), 'base64').toString(), /Package usage:/);
  assert.equal((await request('delete-booking', { bookingId: packageBooking.booking_id })).code, 409);
  assert.equal((await request('complete-booking-details', { bookingId: packageBooking.booking_id, total: 140 })).code, 409);
  assert.equal((await request('cancel-booking', { bookingId: packageBooking.booking_id, email: packageBooking.email })).code, 409);
  assert.equal((await request('reschedule-booking', { bookingId: packageBooking.booking_id, email: packageBooking.email, date: '2026-12-01', time: '01:00 PM' })).code, 409);
  assert.equal(schemaUpdates.length, 1, 'Existing booking schema gains only the discount column');
  const regular = [...records.values()].find((record) => record.service_name === services[0].name);
  const newRecord = (id, changes = {}) => {
    const record = { ...regular, booking_id: id, receipt_number: '', receipt_issued_at: '', receipt_email_status: '', receipt_manual_discount: 0, booking_note: 'Internal private receipt reference', ...changes };
    records.set(id, record);
    return record;
  };
  const receiptHtml = () => {
    const mime = Buffer.from(emails.at(-1).requestBody.raw, 'base64url').toString();
    const encoded = mime.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1];
    return Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString();
  };
  const noLogo = newRecord('MTT-initials-receipt');
  assert.equal((await request('issue-receipt', { bookingId: noLogo.booking_id })).code, 200);
  assert.match(receiptHtml(), /font-size:22px;font-weight:bold">TC<\/td>/);
  assert.doesNotMatch(receiptHtml(), /<img /);
  businessPhotoUrl = 'https://images.example.com/business-logo.png?size=64&theme="light"';
  const logoBooking = newRecord('MTT-logo-receipt');
  assert.equal((await request('issue-receipt', { bookingId: logoBooking.booking_id })).code, 200);
  const brandedHtml = receiptHtml();
  assert.match(brandedHtml, /<img src="https:\/\/images\.example\.com\/business-logo\.png\?size=64&amp;theme=&quot;light&quot;" alt="Test Clinic logo" width="64" height="64"/);
  assert.ok(brandedHtml.indexOf('<img ') < brandedHtml.indexOf('Payment receipt'));
  assert.match(brandedHtml, /Total paid[\s\S]*\$113\.00/);
  businessPhotoUrl = 'javascript:alert(1)';
  const invalidLogo = newRecord('MTT-invalid-logo');
  const invalidLogoResponse = await request('issue-receipt', { bookingId: invalidLogo.booking_id });
  assert.equal(invalidLogoResponse.code, 500);
  assert.match(invalidLogoResponse.data.message, /Business photo URL must use https:\/\/ or http:\/\//);
  assert.equal(invalidLogo.receipt_email_status, 'failed');
  businessPhotoUrl = '';
  assert.equal((await request('issue-receipt', { bookingId: invalidLogo.booking_id })).code, 200);
  const discounted = newRecord('MTT-manual-discount');
  assert.equal((await request('issue-receipt', { bookingId: discounted.booking_id, manualDiscount: 10 }, false)).code, 400);
  assert.equal(discounted.total, 113);
  assert.equal(discounted.receipt_number, '');
  for (const value of [-1, 'abc', '10.001', null, true, {}, 'Infinity', '1e2', 100.01, 10, '10.00']) {
    assert.equal((await request('issue-receipt', { bookingId: discounted.booking_id, manualDiscount: value })).code, 400, `Invalid discount ${JSON.stringify(value)}`);
    assert.equal(discounted.receipt_number, '');
  }
  const historicalDiscount = (record, discount, total, subtotal, tax) => {
    const reconciliation = {
      originalPaid: record.paid_amount, originalTotal: record.total,
      adjustedAmount: Math.round((record.paid_amount - total) * 100) / 100,
      confirmedBy: process.env.OWNER_ADMIN_EMAIL, confirmedAt: '2026-10-01T12:00:00Z',
    };
    const receipt = {
      number: `OLD-${record.booking_id}`, issuedAt: '2026-10-01T12:00:00Z', manualDiscount: discount,
      subtotal, tax, taxLabel: tax ? 'HST (13%)' : 'HST exempt', total, overpaymentAmount: 0,
      recordedPaidAmount: total, reconciliation, membershipDiscountAmount: 0, loyaltyDiscount: 0,
      pointsRedeemed: 0, pointsBalance: 0,
    };
    Object.assign(record, {
      receipt_number: receipt.number, receipt_issued_at: receipt.issuedAt,
      receipt_manual_discount: discount, total, paid_amount: total,
      receipt_reconciliation: JSON.stringify({ ...reconciliation, receipt }),
    });
  };
  historicalDiscount(discounted, 10, 101.7, 100, 11.7);
  const discountedReceipt = await request('issue-receipt', { bookingId: discounted.booking_id });
  assert.equal(discountedReceipt.code, 200, JSON.stringify(discountedReceipt.data));
  assert.equal(discountedReceipt.data.receipt.manualDiscount, 10);
  assert.equal(discountedReceipt.data.receipt.subtotal, 100);
  assert.equal(discountedReceipt.data.receipt.tax, 11.7);
  assert.equal(discountedReceipt.data.receipt.total, 101.7);
  assert.equal(discountedReceipt.data.receipt.overpaymentAmount, 0);
  assert.equal(discountedReceipt.data.receipt.recordedPaidAmount, 101.7);
  assert.equal(discounted.total, 101.7);
  assert.equal(discounted.paid_amount, 101.7);
  const savedReconciliation = JSON.parse(discounted.receipt_reconciliation);
  assert.equal(savedReconciliation.originalPaid, 113);
  assert.equal(savedReconciliation.originalTotal, 113);
  assert.equal(savedReconciliation.adjustedAmount, 11.3);
  assert.equal(savedReconciliation.confirmedBy, process.env.OWNER_ADMIN_EMAIL);
  assert.equal(discountedReceipt.data.booking.total, 101.7);
  assert.equal(discountedReceipt.data.booking.paidAmount, 101.7);
  assert.equal(discounted.receipt_manual_discount, 10);
  const discountedMime = Buffer.from(emails.at(-1).requestBody.raw, 'base64url').toString();
  for (const type of ['plain', 'html']) {
    const encoded = discountedMime.match(new RegExp(`Content-Type: text/${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`))[1];
    const body = Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString();
    assert.match(body, /Manual discount[\s\S]*-\$10\.00/);
    assert.doesNotMatch(body, /Internal private receipt reference/);
    assert.doesNotMatch(body, /Excess recorded payment/);
  }
  const emailsBeforeRetry = emails.length;
  const discountRetry = await request('issue-receipt', { bookingId: discounted.booking_id });
  assert.equal(discountRetry.data.receipt.manualDiscount, 10);
  assert.equal(discountRetry.data.receipt.total, 101.7);
  assert.equal(discountRetry.data.alreadyIssued, true);
  assert.equal(emails.length, emailsBeforeRetry);
  assert.equal(discounted.total, 101.7, 'Retry does not reduce the booking total again');
  const legacyReceipt = newRecord('MTT-legacy-discount', { receipt_number: 'OLD-RECEIPT', receipt_email_status: 'sent', receipt_manual_discount: 10 });
  const legacyRetry = await request('issue-receipt', { bookingId: legacyReceipt.booking_id });
  assert.equal(legacyRetry.data.receipt.total, 101.7);
  assert.equal(legacyReceipt.total, 113, 'Previously issued receipts keep their original payment records');
  assert.equal((await request('issue-receipt', { bookingId: discounted.booking_id, manualDiscount: 5 })).code, 409);
  const exempt = newRecord('MTT-exempt-discount', { service_name: services[1].name, total: 120, paid_amount: 120 });
  assert.equal((await request('issue-receipt', { bookingId: exempt.booking_id, manualDiscount: 10 })).code, 400);
  const exemptReceipt = await request('issue-receipt', { bookingId: exempt.booking_id });
  assert.equal(exemptReceipt.data.receipt.total, 120);
  assert.equal(exemptReceipt.data.receipt.tax, 0);
  const zero = newRecord('MTT-zero-discount');
  assert.equal((await request('issue-receipt', { bookingId: zero.booking_id, manualDiscount: '' })).data.receipt.total, 113);
  assert.equal(zero.receipt_manual_discount, 0);
  const unissuedDiscount = newRecord('MTT-unissued-discount', { receipt_manual_discount: 10 });
  assert.equal((await request('issue-receipt', { bookingId: unissuedDiscount.booking_id })).data.receipt.total, 113);
  assert.equal(unissuedDiscount.receipt_manual_discount, 0);
  const orphan = newRecord('MTT-orphan-reconciliation', { receipt_reconciliation: discounted.receipt_reconciliation });
  assert.equal((await request('issue-receipt', { bookingId: orphan.booking_id })).code, 409);
  assert.equal(orphan.receipt_number, '');
  const full = newRecord('MTT-full-discount');
  assert.equal((await request('issue-receipt', { bookingId: full.booking_id, manualDiscount: 100 })).code, 400);
  historicalDiscount(full, 100, 0, 100, 0);
  const fullReceipt = await request('issue-receipt', { bookingId: full.booking_id });
  assert.equal(fullReceipt.data.receipt.total, 0);
  assert.equal(fullReceipt.data.receipt.tax, 0);
  assert.equal(full.total, 0);
  assert.equal(full.paid_amount, 0);
  assert.equal((await request('issue-receipt', { bookingId: full.booking_id })).data.receipt.total, 0);
  const combined = newRecord('MTT-combined-discount', { membership_type: 'gold', discount_percent: 10, membership_discount_amount: 10, total: 101.7, paid_amount: 101.7 });
  loyaltyRecords = [{ row_index: 2, transaction_id: 'redeem-1', email: combined.email, booking_id: combined.booking_id, type: 'REDEEM', points: -10000, reward_value: 10 }];
  assert.equal((await request('issue-receipt', { bookingId: combined.booking_id, manualDiscount: 80.01 })).code, 400);
  assert.equal((await request('issue-receipt', { bookingId: combined.booking_id, manualDiscount: 5 })).code, 400);
  const combinedReceipt = await request('issue-receipt', { bookingId: combined.booking_id });
  assert.equal(combinedReceipt.code, 200, JSON.stringify(combinedReceipt.data));
  assert.equal(combinedReceipt.data.receipt.subtotal, 100);
  assert.equal(combinedReceipt.data.receipt.loyaltyDiscount, 10);
  assert.equal(combinedReceipt.data.receipt.manualDiscount, 0);
  assert.equal(combinedReceipt.data.receipt.tax, 10.4);
  assert.equal(combinedReceipt.data.receipt.total, 90.4);
  loyaltyRecords = [];
  assert.equal((await request('issue-receipt', { bookingId: packageBooking.booking_id, manualDiscount: 5 })).code, 409);
  const failed = newRecord('MTT-discount-email-retry');
  historicalDiscount(failed, 7.5, 104.53, 100, 12.03);
  let failEmail = true;
  t.mock.method(google, 'gmail', () => ({ users: { messages: { send: async (options) => {
    if (failEmail) throw new Error('Synthetic email outage');
    emails.push(options);
    return { data: { id: 'retry-email' } };
  } } } }));
  const failedResponse = await request('issue-receipt', { bookingId: failed.booking_id });
  assert.equal(failedResponse.code, 500);
  assert.equal(failedResponse.data.reconciliationSaved, true);
  assert.equal(failedResponse.data.booking.total, 104.53);
  assert.equal(failed.receipt_manual_discount, 7.5);
  assert.equal(failed.receipt_email_status, 'failed');
  assert.equal(failed.total, 104.53);
  assert.equal(failed.paid_amount, 104.53);
  failEmail = false;
  const recovered = await request('issue-receipt', { bookingId: failed.booking_id });
  assert.equal(recovered.code, 200, JSON.stringify(recovered.data));
  assert.equal(recovered.data.receipt.manualDiscount, 7.5);
  assert.equal(recovered.data.receipt.total, 104.53);
  assert.equal(failed.receipt_email_status, 'sent');
});
