import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import { BOOKING_TABLE_FIELDS } from '../lib/booking-schema.js';

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
  t.mock.method(BigQuery.prototype, 'dataset', () => ({
    exists: async () => [true],
    table: (tableId) => ({
      exists: async () => [true],
      getMetadata: async () => [{ schema: { fields: tableId === 'bookings' ? BOOKING_TABLE_FIELDS : loyaltyColumns.map((name) => ({ name, type: 'STRING' })) } }],
      setMetadata: async () => { throw new Error('Schema changes are not allowed in this test'); },
    }),
    createTable: async () => { throw new Error('Table creation is not allowed'); },
  }));
  const records = new Map();
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
    if (query.startsWith('SELECT * FROM `test-project.booking_system.bookings`')) return [[...records.values()]];
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
});
