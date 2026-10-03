import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import { emptyPatientHistory } from '../lib/patient-history.js';
import { createDashboardChallengeStore, handleDashboardChallengeQuery, readDashboardOtp } from './helpers/dashboard-auth.js';

test('booking choices persist, skipped history writes nothing, and standalone history only updates the matched patient record', async (t) => {
  Object.assign(process.env, {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com', GOOGLE_PRIVATE_KEY: 'synthetic-key',
    GOOGLE_SPREADSHEET_ID: 'test-sheet', BIGQUERY_PROJECT_ID: 'test-project',
    BIGQUERY_DATASET: 'booking_system', GOOGLE_GMAIL_SENDER_EMAIL: 'test@example.com',
    GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client', GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'synthetic-refresh-token',
    OWNER_ADMIN_PASSWORD: '',
    OWNER_ADMIN_EMAIL: '',
    OWNER_ADMIN_SESSION_SECRET: 'synthetic-session-secret-at-least-thirty-two-characters',
    OWNER_INITIAL_SETUP_SECRET: 'synthetic-one-time-setup-secret-at-least-thirty-two',
  });
  const ownerEmail = 'owner@example.com';
  const ownerPassword = 'synthetic-owner-password';
  let branchRows = [[1, 'Test Branch', 'Address', 'City', '555', 'TRUE', '', 'TRUE', 'TRUE', 'TRUE', 'TRUE']];
  const headers = [];
  t.mock.method(google, 'sheets', () => ({
    spreadsheets: {
      get: async () => ({ data: { sheets: ['Branches', 'Unavailability'].map((title) => ({ properties: { title } })) } }),
      values: {
        get: async ({ range }) => {
          if (range === 'Branches!A2:K') return { data: { values: branchRows } };
          if (range === 'Unavailability!A1:J1') return { data: { values: [['Block ID']] } };
          if (range === 'Unavailability!A:J') return { data: { values: [['Block ID']] } };
          throw new Error(`Unexpected sheets read: ${range}`);
        },
        update: async ({ range, requestBody }) => {
          if (range === 'Branches!A1:K1') headers.push(requestBody.values[0]);
          else if (range.startsWith('Branches!A2:K')) branchRows = requestBody.values;
          else throw new Error(`Unexpected sheets update: ${range}`);
        },
        clear: async ({ range }) => { assert.equal(range, 'Branches!A2:K'); },
      },
    },
  }));
  const events = [];
  t.mock.method(google, 'calendar', () => ({ events: {
    list: async () => ({ data: { items: [] } }),
    insert: async (options) => { events.push(options); return { data: { id: `event-${events.length}` } }; },
  } }));
  const emails = [];
  t.mock.method(google, 'gmail', () => ({ users: { messages: { send: async (request) => { emails.push(request); return { data: { id: 'email' } }; } } } }));
  t.mock.method(BigQuery.prototype, 'dataset', () => ({
    exists: async () => [true],
    table: () => ({
      exists: async () => [true], getMetadata: async () => [{ schema: { fields: [] } }],
      setMetadata: async () => {},
    }),
  }));
  const records = [];
  const histories = [];
  const dashboardChallenges = createDashboardChallengeStore();
  const dashboardUsers = [];
  let failHistoryWrite = false;
  t.mock.method(BigQuery.prototype, 'query', async ({ query, params }) => {
    const dashboardAuthResult = handleDashboardChallengeQuery(query, params, dashboardChallenges);
    if (dashboardAuthResult) return dashboardAuthResult;
    if (query.includes('dashboard_users')) {
      if (query.startsWith('SELECT id FROM') && query.includes("role = 'owner'")) {
        return [dashboardUsers.filter((user) => user.role === 'owner').map(({ id }) => ({ id }))];
      }
      if (query.startsWith('SELECT id, email, name, password_hash')) {
        return [dashboardUsers.filter((user) => user.email === params.email && user.status === 'active')];
      }
      if (query.startsWith('SELECT id FROM') && query.includes('LOWER(email)')) {
        return [dashboardUsers.filter((user) => user.email === params.email).map(({ id }) => ({ id }))];
      }
      if (query.startsWith('INSERT INTO')) {
        dashboardUsers.push({
          ...params,
          role: params.role || (query.includes("'owner'") ? 'owner' : ''),
          branch_ids: params.branch_ids || '[]',
          status: 'active',
        });
        return [[]];
      }
      if (query.startsWith('SELECT id, email, name, role')) return [dashboardUsers];
      if (query.startsWith('UPDATE')) {
        const user = dashboardUsers.find((entry) => entry.id === params.id);
        if (user) user.status = params.status;
        return [[]];
      }
    }
    if (query.startsWith('SELECT * FROM `test-project.booking_system.bookings`')) return [records];
    if (query.startsWith('INSERT INTO `test-project.booking_system.bookings`')) { records.push(params); return [[]]; }
    if (/FROM `test-project\.booking_system\.patient_history`/.test(query)) return [histories];
    if (query.startsWith('INSERT INTO `test-project.booking_system.patient_history`')) {
      if (failHistoryWrite) throw new Error('Synthetic medical storage outage');
      histories.push(params); return [[]];
    }
    if (query.startsWith('SELECT migration_id')) return [[{ migration_id: 'existing-migration' }]];
    if (query.startsWith('SELECT') && /loyalty_/.test(query)) return [[]];
    throw new Error(`Unexpected database operation: ${query}`);
  });
  const { default: handler } = await import(`../api/booking.js?booking-form-test=${Date.now()}`);
  let cookie = '';
  const request = async (view, body, { method = 'POST', origin = 'https://test.example' } = {}) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, { method, query: { view }, headers: { host: 'test.example', origin, 'content-type': 'application/json', cookie } });
    const res = {
      code: 200, data: null,
      setHeader(name, value) { if (name === 'Set-Cookie') cookie = String(value).split(';')[0]; },
      status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; },
    };
    await handler(req, res);
    return res;
  };
  const base = {
    id: 'MTT-test', customerName: 'Test Patient', email: 'test@example.com', phone: '555',
    branchName: 'Test Branch', serviceName: 'Massage', therapistName: 'Test Therapist',
    date: '2026-11-01', time: '10:00 AM', durationMinutes: 60,
    subtotalAmount: '100', taxRate: 0.13, paymentOption: 'clinic', skipPatientHistory: true,
  };
  assert.equal((await request('', { ...base, time: '09:45 AM' })).code, 400);
  assert.equal((await request('reschedule-booking', { bookingId: 'MTT-test', email: base.email, date: base.date, time: '09:30 AM' })).code, 400);
  assert.equal(events.length, 0);
  assert.equal((await request('', { ...base, skipPatientHistory: false, patientHistory: {} })).code, 400);
  for (const [option, amount] of [['clinic', 0], ['deposit', 10], ['full', 113]]) {
    const result = await request('', { ...base, id: `MTT-${option}`, paymentOption: option, paidAmount: '999' });
    assert.equal(result.code, 200, JSON.stringify(result.data));
    assert.equal(result.data.patientHistorySkipped, true);
    assert.equal(result.data.patientHistorySaved, false);
    assert.equal(Number(result.data.paidAmount), amount);
    assert.equal(result.data.emailSent, true);
  }
  assert.equal(histories.length, 0);
  assert.equal(records.length, 3);
  assert.equal(events.length, 3);
  const plainEmail = Buffer.from(emails[0].requestBody.raw, 'base64url').toString();
  const encodedBody = plainEmail.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1];
  assert.match(Buffer.from(encodedBody.replace(/\s/g, ''), 'base64').toString(), /MEDICAL HISTORY REMINDER[\s\S]*required before treatment[\s\S]*fill it in[\s\S]*\?history=1&ref=MTT-clinic/);

  const history = { ...emptyPatientHistory(), consent: true, preCollectionConsent: true, signature: 'Test Patient', consentTimestamp: new Date().toISOString(), bodyAreas: ['Neck'] };
  const submission = { bookingId: 'MTT-clinic', email: 'test@example.com', customerName: 'Forged Name', phone: 'forged-phone', patientHistory: history };
  assert.equal((await request('submit-patient-history', submission, { origin: 'https://wrong.example' })).code, 403);
  assert.equal((await request('submit-patient-history', { ...submission, email: 'wrong@example.com' })).code, 404);
  assert.equal((await request('submit-patient-history', { ...submission, patientHistory: { ...history, consent: false } })).code, 400);
  records[0].status = 'Cancelled';
  assert.equal((await request('submit-patient-history', submission)).code, 409);
  records[0].status = '';
  const saved = await request('submit-patient-history', submission);
  assert.equal(saved.code, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.patientHistorySaved, true);
  assert.equal(histories.length, 1);
  assert.equal(histories[0].booking_id, 'MTT-clinic');
  assert.equal(histories[0].patient_name, 'Test Patient');
  assert.equal(histories[0].phone, '555');
  assert.equal(histories[0].body_areas, 'Neck');
  assert.equal(records.length, 3);
  assert.equal(events.length, 3);
  assert.equal(emails.length, 3);
  failHistoryWrite = true;
  assert.equal((await request('submit-patient-history', submission)).code, 500);
  assert.equal(histories.length, 1);

  const setupStatus = await request('owner-session', null, { method: 'GET' });
  assert.equal(setupStatus.code, 200);
  assert.equal(setupStatus.data.setupAvailable, true);
  assert.equal((await request('owner-setup', {
    name: 'Practice Owner', email: ownerEmail, setupSecret: 'wrong-key',
    password: ownerPassword, confirmPassword: ownerPassword,
  })).code, 401);
  assert.equal((await request('owner-setup', {
    name: 'Practice Owner', email: ownerEmail, setupSecret: process.env.OWNER_INITIAL_SETUP_SECRET,
    password: ownerPassword, confirmPassword: 'a-different-password',
  })).code, 400);
  const ownerCreated = await request('owner-setup', {
    name: 'Practice Owner', email: ownerEmail, setupSecret: process.env.OWNER_INITIAL_SETUP_SECRET,
    password: ownerPassword, confirmPassword: ownerPassword,
  });
  assert.equal(ownerCreated.code, 201, JSON.stringify(ownerCreated.data));
  assert.equal((await request('owner-setup', {
    name: 'Another Owner', email: 'another-owner@example.com',
    setupSecret: process.env.OWNER_INITIAL_SETUP_SECRET,
    password: ownerPassword, confirmPassword: ownerPassword,
  })).code, 409, 'initial owner setup cannot be reused');
  const login = await request('owner-login', { email: ownerEmail, password: ownerPassword });
  assert.equal(login.code, 200);
  assert.equal(login.data.otpRequired, true);
  const ownerOtp = readDashboardOtp(emails.at(-1));
  const invalidOwnerOtp = ownerOtp === '000000' ? '000001' : '000000';
  assert.equal((await request('owner-verify', { challengeId: login.data.challengeId, code: invalidOwnerOtp })).code, 401);
  const verified = await request('owner-verify', { challengeId: login.data.challengeId, code: ownerOtp });
  assert.equal(verified.code, 200);
  assert.equal((await request('owner-verify', { challengeId: login.data.challengeId, code: ownerOtp })).code, 401, 'OTP cannot be replayed');

  const branch = { id: 1, name: 'Test Branch', allowClinicPayment: true, allowDepositPayment: false, allowFullPayment: false };
  assert.equal((await request('branches', { branches: [branch] })).code, 200);
  assert.equal(headers[0].length, 11);
  assert.deepEqual(branchRows[0].slice(8), ['TRUE', 'FALSE', 'FALSE']);
  const loaded = await request('branches', null, { method: 'GET' });
  assert.equal(loaded.data.branches[0].allowDepositPayment, false);
  assert.equal((await request('branches', { branches: [{ ...branch, allowClinicPayment: false }] })).code, 400);
  assert.equal((await request('', { ...base, paymentOption: 'deposit' })).code, 400);
  assert.equal((await request('', { ...base, paymentOption: 'full' })).code, 400);
  assert.equal(events.length, 3);

  cookie = '';
  assert.equal((await request('', { ...base, paymentOption: 'deposit' })).code, 400);
  branchRows = [[1, 'Test Branch', '', '', '', 'TRUE', '', 'FALSE']];
  const legacy = await request('branches', null, { method: 'GET' });
  assert.equal(legacy.data.branches[0].allowClinicPayment, true);
  assert.equal(legacy.data.branches[0].allowDepositPayment, false);
  assert.equal(legacy.data.branches[0].allowFullPayment, false);
  branchRows[0][7] = 'TRUE';
  assert.equal((await request('', base)).code, 400, 'Customers cannot bypass a disabled clinic choice');
  failHistoryWrite = false;
  const complete = await request('', { ...base, id: 'MTT-complete', paymentOption: 'deposit', skipPatientHistory: false, patientHistory: history, subtotalAmount: '5', taxRate: 0 });
  assert.equal(complete.code, 200, JSON.stringify(complete.data));
  assert.equal(complete.data.patientHistorySkipped, false);
  assert.equal(complete.data.patientHistorySaved, true);
  assert.equal(Number(complete.data.paidAmount), 5, 'Deposit cannot exceed the appointment total');
  assert.equal(histories.length, 2);
  assert.equal(histories[1].booking_id, 'MTT-complete');
  assert.equal(events.length, 4);
  assert.equal(emails.length, 5);
  assert.equal(records.length, 4);

  const reused = await request('', {
    ...base,
    id: 'MTT-reused',
    paymentOption: 'deposit',
    skipPatientHistory: false,
    patientHistory: { reuseExisting: true },
  });
  assert.equal(reused.code, 200, JSON.stringify(reused.data));
  assert.equal(reused.data.patientHistorySaved, true);
  const reusedEmail = Buffer.from(emails[5].requestBody.raw, 'base64url').toString();
  const reusedText = reusedEmail.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1];
  const reusedHtml = reusedEmail.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1];
  assert.match(Buffer.from(reusedText.replace(/\s/g, ''), 'base64').toString(), /MEDICAL HISTORY REMINDER[\s\S]*check it before your appointment[\s\S]*update any information that has changed[\s\S]*\?history=1&ref=MTT-reused/);
  assert.match(Buffer.from(reusedHtml.replace(/\s/g, ''), 'base64').toString(), /Check or update medical history/);
  assert.equal(events.length, 5);
  assert.equal(emails.length, 6);
  assert.equal(records.length, 5);

  const ownerLoginForAccounts = await request('owner-login', {
    email: ownerEmail, password: ownerPassword,
  });
  assert.equal(ownerLoginForAccounts.code, 200);
  assert.equal((await request('owner-verify', {
    challengeId: ownerLoginForAccounts.data.challengeId, code: readDashboardOtp(emails.at(-1)),
  })).code, 200);
  const managerCreated = await request('dashboard-user', {
    email: 'manager@example.com', name: 'Branch Manager', password: 'synthetic-manager-password',
    role: 'branch_manager', branchIds: ['1'],
  });
  assert.equal(managerCreated.code, 201, JSON.stringify(managerCreated.data));
  assert.equal(managerCreated.data.user.role, 'branch_manager');
  assert.deepEqual(managerCreated.data.user.branchIds, ['1']);
  const managerLogin = await request('owner-login', {
    email: managerCreated.data.user.email, password: 'synthetic-manager-password',
  });
  assert.equal(managerLogin.code, 200);
  const managerVerified = await request('owner-verify', {
    challengeId: managerLogin.data.challengeId, code: readDashboardOtp(emails.at(-1)),
  });
  assert.equal(managerVerified.code, 200);
  assert.equal((await request('patient-history', null, { method: 'GET' })).code, 403);
  assert.equal((await request('dashboard-users', null, { method: 'GET' })).code, 403);
  assert.equal((await request('mark-paid', { bookingId: 'MTT-not-found' })).code, 404);

  const ownerLoginAgain = await request('owner-login', {
    email: ownerEmail, password: ownerPassword,
  });
  assert.equal(ownerLoginAgain.code, 200);
  assert.equal((await request('owner-verify', {
    challengeId: ownerLoginAgain.data.challengeId, code: readDashboardOtp(emails.at(-1)),
  })).code, 200);
  const receptionistCreated = await request('dashboard-user', {
    email: 'reception@example.com', name: 'Branch Receptionist', password: 'synthetic-reception-password',
    role: 'branch_receptionist', branchIds: ['1'],
  });
  assert.equal(receptionistCreated.code, 201, JSON.stringify(receptionistCreated.data));
  const receptionistLogin = await request('owner-login', {
    email: receptionistCreated.data.user.email, password: 'synthetic-reception-password',
  });
  assert.equal(receptionistLogin.code, 200);
  assert.equal((await request('owner-verify', {
    challengeId: receptionistLogin.data.challengeId, code: readDashboardOtp(emails.at(-1)),
  })).code, 200);
  assert.equal((await request('patient-history', null, { method: 'GET' })).code, 403);
  assert.equal((await request('mark-paid', { bookingId: 'MTT-not-found' })).code, 403);
  assert.equal((await request('dashboard-users', null, { method: 'GET' })).code, 403);
});
