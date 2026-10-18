import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import { emptyPatientHistory } from '../lib/patient-history.js';
import { BOOKING_TABLE_FIELDS } from '../lib/booking-schema.js';
import { bookingEditVersion } from '../lib/booking-edit.js';
import { defaultBusinessHours } from '../lib/booking-options.js';
import { createDashboardChallengeStore, handleDashboardChallengeQuery, readDashboardOtp } from './helpers/dashboard-auth.js';

test('booking choices persist, skipped history writes nothing, and standalone history only updates the matched patient record', async (t) => {
  let now = Date.parse('2026-10-01T15:13:00Z');
  t.mock.method(Date, 'now', () => now);
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
  let failBranchesSheetRead = false;
  let branchConfigRows = [];
  let appointmentConfigRows = [];
  let failAppointmentConfigSheetReads = false;
  let appointmentConfigBatchGets = 0;
  let profileHeaders = ['businessName', 'legalName', 'tagline', 'email', 'phone', 'website', 'address', 'taxRegistrationNumber', 'photoUrl', 'therapistBufferMinutes'];
  let profileValues = ['Test Clinic', '', '', '', '', '', '', '', '', '15'];
  let busyEvents = [];
  let blockRows = [['Block ID']];
  let scheduleRows = [
    ['Therapist ID', 'Date', 'Branch ID', 'Working', 'Start Time', 'End Time', 'Updated By', 'Updated At', 'Public Visibility'],
    [2, '2026-10-12', 1, 'TRUE', '10:00', '20:00', 'scheduler@example.com', '2026-10-01T00:00:00.000Z'],
    [1, '2026-11-02', 1, 'TRUE', '10:00', '20:00', 'scheduler@example.com', '2026-10-01T00:00:00.000Z'],
    [1, '2026-11-01', 1, 'TRUE', '08:00', '22:00', 'scheduler@example.com', '2026-10-01T00:00:00.000Z', 'TRUE'],
  ];
  const serviceRows = [
    [1, 'Massage', 'Thai', 60, 100, 10, 'FALSE', 0.13, '', 'TRUE'],
    [2, 'Couple Massage', 'Thai', 60, 180, 10, 'FALSE', 0.13, '', 'TRUE'],
    [3, 'RMT Massage', 'RMT', 60, 120, 10, 'TRUE', 0, '', 'TRUE'],
    [4, 'Inactive Massage', 'Thai', 60, 100, 10, 'FALSE', 0.13, '', 'FALSE'],
    [5, 'Hot Stone Add-on', 'Add-on', 15, 20, 0, 'FALSE', 0.13, '', 'TRUE'],
  ];
  const therapistRows = [
    [1, 'Test Therapist', '', 5, 'TRUE', 'FALSE', '1', '{}', 'TRUE'],
    [2, 'Second Therapist', '', 5, 'TRUE', 'TRUE', '1', '{}', 'TRUE'],
    [3, 'Off Duty', '', 5, 'TRUE', 'TRUE', '1', '{"sun":2}', 'TRUE'],
    [4, 'Inactive Therapist', '', 5, 'TRUE', 'TRUE', '1', '{}', 'FALSE'],
  ];
  const headers = [];
  let aliasRows = [];
  let legacyAccount = false;
  t.mock.method(google, 'sheets', () => ({
    spreadsheets: {
      get: async () => ({ data: { sheets: ['Branches', 'Unavailability', 'Services', 'Therapists', 'BusinessProfile', 'StaffWorkSchedule', ...(aliasRows.length ? ['TherapistAliases'] : []), ...(legacyAccount ? ['TherapistAccounts'] : [])].map((title, index) => ({ properties: { title, sheetId: index + 1 } })) } }),
      batchUpdate: async ({ requestBody }) => {
        const operation = requestBody.requests[0];
        if (operation.addSheet) {
          assert.equal(operation.addSheet.properties.title, 'TherapistAliases');
          return;
        }
        assert.ok(operation.updateCells, 'Expected a work schedule row update');
        const rows = operation.updateCells.rows.map(({ values }) => values.map((cell) =>
          cell.userEnteredValue?.numberValue ?? cell.userEnteredValue?.stringValue ?? '',
        ));
        scheduleRows = [scheduleRows[0], ...rows];
      },
      values: {
        batchGet: async ({ ranges }) => {
          appointmentConfigBatchGets += 1;
          return { data: {
            valueRanges: ranges.map((range) => ({
              range,
              values: ({
                'BusinessProfile!A1:K2': [profileHeaders, profileValues],
                'Services!A2:K': serviceRows,
                'Therapists!A2:J': therapistRows,
                'StaffWorkSchedule!A:I': scheduleRows,
                'Unavailability!A:J': blockRows,
                'TherapistAliases!A:E': aliasRows,
              })[range] || [],
            })),
          } };
        },
        get: async ({ range }) => {
          if (failAppointmentConfigSheetReads &&
              /^(BusinessProfile!A1:K[12]|BusinessProfile!A2:K2|Services!A2:K|Therapists!A2:J|StaffWorkSchedule!A1:I1|StaffWorkSchedule!A:I|Unavailability!A1:J1|Unavailability!A:J|TherapistAliases!A:E)$/.test(range)) {
            throw new Error('Synthetic appointment configuration Sheets read after migration');
          }
          if (range === 'TherapistAliases!A:E') return { data: { values: aliasRows } };
          if (range === 'TherapistAccounts!A:F') return { data: { values: [['ID', 'Email', 'Name'], ['legacy-id', 'legacy@example.com', 'Legacy Staff']] } };
          if (range === 'Branches!A2:L') {
            if (failBranchesSheetRead) throw new Error('Synthetic Sheets read quota exceeded');
            return { data: { values: branchRows } };
          }
          if (range === 'Unavailability!A1:J1') return { data: { values: [['Block ID']] } };
          if (range === 'Unavailability!A:J') return { data: { values: blockRows } };
          if (range === 'StaffWorkSchedule!A1:I1') return { data: { values: [scheduleRows[0]] } };
          if (range === 'StaffWorkSchedule!A:I') return { data: { values: scheduleRows } };
          if (range === 'Services!A2:K') return { data: { values: serviceRows } };
          if (range === 'Therapists!A2:J') return { data: { values: therapistRows } };
          if (range === 'BusinessProfile!A1:K1') return { data: { values: [profileHeaders] } };
          if (range === 'BusinessProfile!A2:K2') return { data: { values: [profileValues] } };
          if (range === 'BusinessProfile!A1:K2') return { data: { values: [profileHeaders, profileValues] } };
          throw new Error(`Unexpected sheets read: ${range}`);
        },
        update: async ({ range, requestBody }) => {
          if (range === 'TherapistAliases!A1:E1') aliasRows = requestBody.values;
          else if (range === 'Branches!A1:L1') headers.push(requestBody.values[0]);
          else if (range.startsWith('Branches!A2:L')) branchRows = requestBody.values;
          else if (range === 'BusinessProfile!A1:K1') profileHeaders = requestBody.values[0];
          else if (range === 'BusinessProfile!A2:K2') profileValues = requestBody.values[0];
          else throw new Error(`Unexpected sheets update: ${range}`);
        },
        clear: async ({ range }) => { assert.equal(range, 'Branches!A2:L'); },
        append: async ({ range, requestBody }) => {
          assert.equal(range, 'TherapistAliases!A:E');
          aliasRows.push(...requestBody.values);
        },
        batchUpdate: async ({ requestBody }) => {
          for (const update of requestBody.data) {
            if (update.range.startsWith('Unavailability!D')) blockRows[Number(update.range.match(/\d+/)[0]) - 1][3] = update.values[0][0];
            else if (update.range.startsWith('Therapists!I')) therapistRows[Number(update.range.match(/\d+/)[0]) - 2][8] = update.values[0][0];
            else throw new Error(`Unexpected merge update: ${update.range}`);
          }
        },
      },
    },
  }));
  const events = [];
  const patches = [];
  let calendarMergePages = [];
  let failCalendarPatch = false, failRecovery = false, failBookingWrite = false, raceBookingWrite = false;
  const originalEvent = { summary: 'Original appointment', description: 'Customer: Old name\nTherapist: Test Therapist\nPrivate integration metadata',
    start: { dateTime: '2026-11-01T10:00:00-05:00' }, end: { dateTime: '2026-11-01T11:00:00-05:00' }, etag: '"original"' };
  const coupleCalendarEvents = new Map();
  t.mock.method(google, 'calendar', () => ({ events: {
    list: async (options) => {
      if (options.maxResults === 20) {
        const index = Number(options.pageToken || 0);
        return { data: { items: calendarMergePages[index] || [], nextPageToken: index + 1 < calendarMergePages.length ? String(index + 1) : undefined } };
      }
      return { data: { items: busyEvents } };
    },
    insert: async (options) => { events.push(options); return { data: { id: `event-${events.length}` } }; },
    get: async ({ eventId }) => ({ data: coupleCalendarEvents.get(eventId) || originalEvent }),
    patch: async (options, transport) => {
      patches.push({ ...options, transport });
      if (failCalendarPatch || (failRecovery && options.requestBody.summary === originalEvent.summary)) throw new Error('Synthetic calendar failure');
      return { data: { ...options.requestBody, etag: '"patched"' } };
    },
  } }));
  const emails = [];
  const staffEmails = [];
  t.mock.method(google, 'gmail', () => ({ users: { messages: { send: async (request) => {
    const raw = Buffer.from(request.requestBody.raw, 'base64url').toString();
    const staffSubjects = ['New appointment booked', 'Appointment rescheduled', 'Appointment cancelled']
      .map((subject) => `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`);
    (staffSubjects.some((subject) => raw.includes(subject)) ? staffEmails : emails).push(request);
    return { data: { id: 'email' } };
  } } } }));
  t.mock.method(BigQuery.prototype, 'dataset', () => ({
    exists: async () => [true],
    table: () => ({
      exists: async () => [true], getMetadata: async () => [{ schema: { fields: [] } }],
      setMetadata: async () => {},
    }),
  }));
  const records = [];
  const activities = [];
  const customerSearches = [];
  const histories = [];
  const dashboardChallenges = createDashboardChallengeStore();
  const dashboardUsers = [];
  let failHistoryWrite = false;
  t.mock.method(BigQuery.prototype, 'query', async ({ query, params }) => {
    const dashboardAuthResult = handleDashboardChallengeQuery(query, params, dashboardChallenges);
    if (dashboardAuthResult) return dashboardAuthResult;
    if (query.includes('appointment_config')) {
      if (query.startsWith('SELECT config_type, payload')) {
        return [appointmentConfigRows.filter((row) =>
          row.config_type === params.config_type || row.config_type === params.migration_key,
        )];
      }
      if (query.includes('MERGE')) {
        const existing = appointmentConfigRows.find((row) => row.config_type === params.config_type);
        if (existing) {
          existing.payload = params.payload;
        } else {
          appointmentConfigRows.push({ config_type: params.config_type, payload: params.payload });
        }
        return [[]];
      }
      if (query.includes('INSERT INTO')) {
        const entryIndexes = Object.keys(params).map((key) => key.match(/^type_(\d+)$/)?.[1]).filter(Boolean);
        entryIndexes.forEach((index) => appointmentConfigRows.push({
          config_type: params[`type_${index}`], payload: params[`payload_${index}`],
        }));
        return [[]];
      }
    }
    if (query.includes('branch_config')) {
      if (query.startsWith('SELECT id, name, address')) return [branchConfigRows];
      if (query.includes('DELETE FROM')) {
        branchConfigRows = Object.keys(params)
          .filter((key) => /^branch_\d+_id$/.test(key))
          .map((key) => {
            const prefix = key.slice(0, -2);
            return {
              id: params[key],
              name: params[`${prefix}name`],
              address: params[`${prefix}address`],
              city: params[`${prefix}city`],
              phone: params[`${prefix}phone`],
              active: params[`${prefix}active`],
              collects_deposit: params[`${prefix}collects_deposit`],
              allow_clinic_payment: params[`${prefix}allow_clinic_payment`],
              allow_deposit_payment: params[`${prefix}allow_deposit_payment`],
              allow_full_payment: params[`${prefix}allow_full_payment`],
              business_hours: params[`${prefix}business_hours`],
            };
          });
        return [[]];
      }
    }
    if (query.startsWith('WITH customers AS')) {
      customerSearches.push({ query, params });
      return [[{ name: 'Existing Client', email: 'client@example.com', phone: '+1 (437) 898-7424' }]];
    }
    if (query.includes('dashboard_users')) {
      if (query.startsWith('SELECT email, role, branch_ids, status')) return [dashboardUsers.filter((user) => user.status === 'active')];
      if (query.startsWith('SELECT id FROM') && query.includes("role = 'owner'")) {
        return [dashboardUsers.filter((user) => user.role === 'owner').map(({ id }) => ({ id }))];
      }
      if (query.startsWith('SELECT id, email, name, password_hash')) {
        return [dashboardUsers.filter((user) => user.email === params.email && user.status === 'active')];
      }
      if (query.startsWith('SELECT id FROM') && query.includes('LOWER(email)')) {
        return [dashboardUsers.filter((user) => user.email === params.email && user.id !== params.id).map(({ id }) => ({ id }))];
      }
      if (query.startsWith('SELECT id FROM') && query.includes('WHERE id = @id')) {
        return [dashboardUsers.filter((user) => user.id === params.id).map(({ id }) => ({ id }))];
      }
      if (query.startsWith('SELECT id, email FROM') && query.includes('WHERE id = @id')) {
        return [dashboardUsers.filter((user) => user.id === params.id).map(({ id, email }) => ({ id, email }))];
      }
      if (query.startsWith('SELECT role, branch_ids')) {
        return [dashboardUsers.filter((user) => user.id === params.id)];
      }
      if (query.startsWith('SELECT role FROM')) {
        return [dashboardUsers.filter((user) => user.id === params.id)];
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
        if (user) {
          if (params.status) user.status = params.status;
          if (params.role) user.role = params.role;
          if (params.branch_ids) user.branch_ids = params.branch_ids;
          if (params.password_hash) user.password_hash = params.password_hash;
          if (params.email) user.email = params.email;
          if (params.name) user.name = params.name;
          if (params.receives_alerts !== undefined) user.receives_alerts = params.receives_alerts;
        }
        return [[]];
      }
    }
    if (query.startsWith('SELECT booking_id, customer_name, branch_name')) {
      const to = params.now ?? params.to;
      return [records.filter((record) => record.created_at >= params.from && record.created_at <= to)];
    }
    if (query.startsWith('INSERT INTO `test-project.booking_system.booking_activity`')) { activities.push(params); return [[]]; }
    if (query.startsWith('SELECT id, booking_id, type') && query.includes('booking_activity')) {
      return [activities.filter((activity) => activity.created_at >= params.from && activity.created_at <= params.to)];
    }
    if (query.startsWith('SELECT * FROM `test-project.booking_system.bookings`')) return [records];
    if (query.startsWith('INSERT INTO `test-project.booking_system.bookings`')) { records.push(params); return [[]]; }
    if (params?.where_booking_id) {
      if (failBookingWrite) throw new Error('Synthetic database failure');
      if (raceBookingWrite) throw new Error('Booking changed during editing; refresh and retry');
      const record = records.find((item) => item.booking_id === params.where_booking_id);
      if (query.includes('Booking changed during editing')) {
        for (const field of BOOKING_TABLE_FIELDS) {
          const existing = field.type === 'STRING' ? String(record[field.name] || '') : Number(record[field.name]) || 0;
          assert.equal(params[`expected_${field.name}`], existing);
        }
      }
      if (query.includes('Booking changed during receipt issuance')) {
        assert.equal(params.expected_total, record.total);
        assert.equal(params.expected_paid, record.paid_amount);
      }
      for (const [key, value] of Object.entries(params)) if (key.startsWith('set_')) record[key.slice(4)] = value;
      return [[]];
    }
    if (query.includes('SET booking_note = @note')) {
      const record = records.find((item) => item.booking_id === params.bookingId);
      assert.equal(record.booking_note || '', params.expectedNote);
      assert.match(query, /ASSERT/);
      record.booking_note = params.note;
      return [[]];
    }
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
  const request = async (view, body, { method = 'POST', origin = 'https://test.example', query = {} } = {}) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, { method, query: { view, ...query }, headers: { host: 'test.example', origin, 'content-type': 'application/json', cookie } });
    const res = {
      code: 200, data: null, headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
        if (name === 'Set-Cookie') cookie = String(value).split(';')[0];
      },
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
  assert.equal((await request('booking-notifications', null, { method: 'GET' })).code, 401);
  assert.equal((await request('', { ...base, time: '09:45 AM' })).code, 400);
  assert.equal((await request('reschedule-booking', { bookingId: 'MTT-test', email: base.email, date: base.date, time: '09:30 AM' })).code, 404);
  assert.equal(events.length, 0);
  assert.equal((await request('', { ...base, skipPatientHistory: false, patientHistory: {} })).code, 400);
  busyEvents = [{
    description: 'Therapist: Test Therapist, Second Therapist',
    start: { dateTime: '2026-11-01T10:00:00-05:00' },
    end: { dateTime: '2026-11-01T11:00:00-05:00' },
  }];
  const noAutomaticTherapist = await request('', { ...base, therapistName: 'Any Available' });
  assert.equal(noAutomaticTherapist.code, 409, JSON.stringify(noAutomaticTherapist.data));
  assert.equal(events.length, 0, 'Automatic selection must not save Any Available as a substitute therapist');
  assert.equal(records.length, 0);
  busyEvents = [];
  for (const [option, amount, time] of [['clinic', 0, '10:00 AM'], ['deposit', 10, '11:15 AM'], ['full', 113, '12:30 PM']]) {
    const result = await request('', { ...base, id: `MTT-${option}`, time, paymentOption: option, paidAmount: '999' });
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
  const initialOwnerCookie = cookie;
  assert.equal(profileHeaders.at(-1), 'minimumBookingNoticeMinutes');
  assert.equal(profileValues.at(-1), '15', 'Legacy business profiles acquire the 15-minute notice default');
  assert.equal((await request('owner-verify', { challengeId: login.data.challengeId, code: ownerOtp })).code, 401, 'OTP cannot be replayed');

  const todayAvailability = {
    date: '2026-10-11', branchId: 1, therapistId: 1,
    override: { therapistId: 1, date: '2026-10-11', isWorking: true, startTime: '11:00', endTime: '18:00', showToPublic: true },
  };
  const savedTodayAvailability = await request('staff-work-schedule', todayAvailability);
  assert.equal(savedTodayAvailability.code, 200, JSON.stringify(savedTodayAvailability.data));
  assert.equal(savedTodayAvailability.data.override.startTime, '11:00');
  assert.equal(savedTodayAvailability.data.override.showToPublic, true);
  assert.equal(scheduleRows.find((row) => row[0] === 1 && row[1] === '2026-10-11')[8], 'TRUE');
  assert.ok(scheduleRows.some((row) => row[0] === 1 && row[1] === '2026-10-11'));
  assert.ok(scheduleRows.some((row) => row[0] === 2 && row[1] === '2026-10-12'), 'Saving today must preserve other dates');
  const invalidAvailabilityRows = structuredClone(scheduleRows);
  assert.equal((await request('staff-work-schedule', {
    ...todayAvailability, override: { ...todayAvailability.override, endTime: '09:00' },
  })).code, 400);
  assert.equal((await request('staff-work-schedule', {
    ...todayAvailability, override: { ...todayAvailability.override, showToPublic: 'yes' },
  })).code, 400);
  assert.deepEqual(scheduleRows, invalidAvailabilityRows, 'Invalid hours must not change the saved schedule');
  const dayOverrides = await request('staff-work-schedule', null, {
    method: 'GET', query: { month: '2026-10', branchId: '1' },
  });
  assert.equal(dayOverrides.code, 200);
  assert.ok(dayOverrides.data.overrides.some((entry) => entry.therapistId === 1 && entry.date === '2026-10-11'));
  assert.equal(dayOverrides.data.overrides.find((entry) => entry.therapistId === 1 && entry.date === '2026-10-11').showToPublic, true);
  assert.equal((await request('staff-work-schedule', { date: '2026-10-11', branchId: 1, therapistId: 1, override: null })).code, 200);
  assert.ok(!scheduleRows.some((row) => row[0] === 1 && row[1] === '2026-10-11'), 'Reset removes only that date’s override');
  assert.ok(scheduleRows.some((row) => row[0] === 2 && row[1] === '2026-10-12'), 'Reset must preserve other dates');
  assert.equal((await request('staff-work-schedule', {
    ...todayAvailability, therapistId: 999,
  })).code, 400);

  const branch = { id: 1, name: 'Test Branch', allowClinicPayment: true, allowDepositPayment: false, allowFullPayment: false };
  assert.equal((await request('branches', { branches: [branch] })).code, 200);
  assert.equal(headers[0].length, 12);
  assert.deepEqual(branchRows[0].slice(8, 11), ['TRUE', 'FALSE', 'FALSE']);
  assert.deepEqual(JSON.parse(branchRows[0][11]), defaultBusinessHours());
  const loaded = await request('branches', null, { method: 'GET' });
  assert.equal(loaded.data.branches[0].allowDepositPayment, false);
  assert.deepEqual(loaded.data.branches[0].businessHours, defaultBusinessHours());
  const customHours = defaultBusinessHours();
  customHours.sun = { open: '08:00', close: '22:00', closed: false };
  customHours.mon.closed = true;
  assert.equal((await request('branches', { branches: [{ ...branch, businessHours: customHours }] })).code, 200);
  assert.deepEqual((await request('branches', null, { method: 'GET' })).data.branches[0].businessHours, customHours);
  const storedHours = branchRows[0][11];
  assert.equal((await request('branches', { branches: [{ ...branch, businessHours: {} }] })).code, 400);
  assert.equal(branchRows[0][11], storedHours, 'Invalid schedules do not replace stored hours');
  assert.equal((await request('branches', { branches: [branch] })).code, 200);
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
  const complete = await request('', { ...base, id: 'MTT-complete', time: '01:45 PM', paymentOption: 'deposit', skipPatientHistory: false, patientHistory: history, subtotalAmount: '5', taxRate: 0 });
  assert.equal(complete.code, 200, JSON.stringify(complete.data));
  assert.equal(complete.data.patientHistorySkipped, false);
  assert.equal(complete.data.patientHistorySaved, true);
  assert.equal(Number(complete.data.paidAmount), 5, 'Deposit cannot exceed the appointment total');
  assert.equal(histories.length, 2);
  assert.equal(histories[1].booking_id, 'MTT-complete');
  assert.equal(events.length, 4);
  assert.equal(emails.length, 5);
  assert.equal(records.length, 4);
  assert.equal(branchConfigRows.length, 0, 'Branch reads do not import data automatically');
  const migrationOwnerCookie = initialOwnerCookie;
  cookie = '';
  assert.equal((await request('branches-migrate', {})).code, 401, 'Only a signed-in owner can run the import');
  cookie = migrationOwnerCookie;
  assert.equal((await request('branches-migrate', {}, { origin: 'https://untrusted.example' })).code, 403);
  const branchImport = await request('branches-migrate', {});
  assert.equal(branchImport.code, 200, JSON.stringify(branchImport.data));
  assert.equal(branchImport.data.source, 'bigquery');
  assert.equal(branchImport.data.importedCount, 1);
  assert.equal((await request('branches-migrate', {})).code, 409, 'Branch import can only be run once');
  assert.equal(branchConfigRows.length, 1, 'Branch details are imported into BigQuery on demand');
  assert.deepEqual(JSON.parse(branchConfigRows[0].business_hours), defaultBusinessHours());
  const importedBranches = await request('branches', null, { method: 'GET' });
  assert.equal(importedBranches.data.source, 'bigquery');
  const branchesBeforeSave = structuredClone(branchRows);
  assert.equal((await request('branches', { branches: importedBranches.data.branches })).code, 200);
  assert.deepEqual(branchRows, branchesBeforeSave, 'After migration branch edits no longer write to Sheets');
  assert.equal((await request('branches', null, { method: 'GET' })).data.source, 'bigquery');
  failBranchesSheetRead = true;
  const branchesWithoutSheetRead = await request('branches', null, { method: 'GET' });
  assert.equal(branchesWithoutSheetRead.code, 200, JSON.stringify(branchesWithoutSheetRead.data));
  assert.equal(branchesWithoutSheetRead.data.source, 'bigquery');
  assert.deepEqual(branchesWithoutSheetRead.data.branches, importedBranches.data.branches);
  const rescheduledWithoutSheetRead = await request('reschedule-booking', {
    bookingId: 'MTT-clinic',
    email: 'test@example.com',
    date: '2026-11-03',
    time: '11:00 AM',
  });
  assert.equal(rescheduledWithoutSheetRead.code, 200, JSON.stringify(rescheduledWithoutSheetRead.data));
  assert.equal(rescheduledWithoutSheetRead.data.date, '2026-11-03');
  const rescheduleActivity = activities.find((activity) => activity.booking_id === 'MTT-clinic' && activity.type === 'rescheduled');
  assert.ok(rescheduleActivity, 'Customer reschedules are recorded in booking activity');
  assert.equal(rescheduleActivity.date, '2026-11-03');
  assert.equal(rescheduleActivity.time, '11:00 AM');
  assert.ok(rescheduleActivity.previous_date && rescheduleActivity.previous_time);
  assert.equal(rescheduleActivity.actor, 'customer');
  assert.ok(staffEmails.length >= 1, 'Customer reschedules alert dashboard staff');
  failBranchesSheetRead = false;
  const rescheduledRecord = records.find((record) => record.booking_id === 'MTT-clinic');
  rescheduledRecord.date = '2026-11-01';
  rescheduledRecord.time = '10:00 AM';

  const reused = await request('', {
    ...base,
    id: 'MTT-reused',
    time: '03:00 PM',
    paymentOption: 'deposit',
    skipPatientHistory: false,
    patientHistory: { reuseExisting: true },
  });
  assert.equal(reused.code, 200, JSON.stringify(reused.data));
  assert.equal(reused.data.patientHistorySaved, true);
  const reusedEmail = Buffer.from(emails.at(-1).requestBody.raw, 'base64url').toString();
  const reusedText = reusedEmail.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1];
  const reusedHtml = reusedEmail.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1];
  assert.match(Buffer.from(reusedText.replace(/\s/g, ''), 'base64').toString(), /MEDICAL HISTORY REMINDER[\s\S]*check it before your appointment[\s\S]*update any information that has changed[\s\S]*\?history=1&ref=MTT-reused/);
  assert.match(Buffer.from(reusedHtml.replace(/\s/g, ''), 'base64').toString(), /Check or update medical history/);
  assert.equal(events.length, 5);
  assert.equal(emails.length, 7);
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
  assert.equal(managerCreated.data.user.receivesAlerts, true);
  const managerLogin = await request('owner-login', {
    email: managerCreated.data.user.email, password: 'synthetic-manager-password',
  });
  assert.equal(managerLogin.code, 200);
  const managerVerified = await request('owner-verify', {
    challengeId: managerLogin.data.challengeId, code: readDashboardOtp(emails.at(-1)),
  });
  assert.equal(managerVerified.code, 200);
  const managerCookie = cookie;
  assert.equal((await request('patient-history', null, { method: 'GET' })).code, 403);
  const managerUsers = await request('dashboard-users', null, { method: 'GET' });
  assert.equal(managerUsers.code, 200, JSON.stringify(managerUsers.data));
  assert.deepEqual(managerUsers.data.users, []);
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
  const ownerCookie = cookie;
  assert.equal(receptionistCreated.code, 201, JSON.stringify(receptionistCreated.data));
  assert.equal(receptionistCreated.data.user.receivesAlerts, true);
  const ownerUsers = await request('dashboard-users', null, { method: 'GET' });
  assert.equal(ownerUsers.code, 200, JSON.stringify(ownerUsers.data));
  assert.equal(ownerUsers.data.users.find((user) => user.id === receptionistCreated.data.user.id).receivesAlerts, true);
  const receptionistLogin = await request('owner-login', {
    email: receptionistCreated.data.user.email, password: 'synthetic-reception-password',
  });
  assert.equal(receptionistLogin.code, 200);
  assert.equal((await request('owner-verify', {
    challengeId: receptionistLogin.data.challengeId, code: readDashboardOtp(emails.at(-1)),
  })).code, 200);
  assert.equal((await request('patient-history', null, { method: 'GET' })).code, 403);
  assert.equal((await request('mark-paid', { bookingId: 'MTT-not-found' })).code, 404);
  assert.equal((await request('dashboard-users', null, { method: 'GET' })).code, 403);

  const receptionistCookie = cookie;
  cookie = managerCookie;
  const managerReceptionistUsers = await request('dashboard-users', null, { method: 'GET' });
  assert.equal(managerReceptionistUsers.code, 200, JSON.stringify(managerReceptionistUsers.data));
  assert.deepEqual(managerReceptionistUsers.data.users.map((user) => user.email), ['reception@example.com']);
  const promotedReceptionist = await request('dashboard-user-role', {
    id: receptionistCreated.data.user.id, role: 'branch_manager',
  });
  assert.equal(promotedReceptionist.code, 200, JSON.stringify(promotedReceptionist.data));
  assert.equal(promotedReceptionist.data.role, 'branch_manager');
  cookie = ownerCookie;
  const promotedManager = await request('dashboard-user-role', {
    id: managerCreated.data.user.id, role: 'owner',
  });
  assert.equal(promotedManager.code, 200, JSON.stringify(promotedManager.data));
  assert.equal(promotedManager.data.role, 'owner');
  const resetPassword = await request('dashboard-user-password', {
    id: managerCreated.data.user.id, password: 'synthetic-promoted-password',
  });
  assert.equal(resetPassword.code, 200, JSON.stringify(resetPassword.data));
  const editedAccount = await request('dashboard-user-update', {
    id: managerCreated.data.user.id, name: 'Updated Manager', email: 'updated-manager@example.com', receivesAlerts: false,
  });
  assert.equal(editedAccount.code, 200, JSON.stringify(editedAccount.data));
  assert.deepEqual(editedAccount.data, {
    email: 'updated-manager@example.com', name: 'Updated Manager', receivesAlerts: false,
  });
  const duplicateEmail = await request('dashboard-user-update', {
    id: managerCreated.data.user.id, name: 'Updated Manager', email: 'reception@example.com', receivesAlerts: false,
  });
  assert.equal(duplicateEmail.code, 409);
  const restoredAccount = await request('dashboard-user-update', {
    id: managerCreated.data.user.id, name: 'Branch Manager', email: 'manager@example.com', receivesAlerts: true,
  });
  assert.equal(restoredAccount.code, 200, JSON.stringify(restoredAccount.data));
  cookie = receptionistCookie;
  assert.equal((await request('dashboard-user-password', {
    id: managerCreated.data.user.id, password: 'synthetic-rejected-password',
  })).code, 403);
  assert.equal((await request('dashboard-user-update', {
    id: managerCreated.data.user.id, name: 'Unauthorized edit', email: 'unauthorized@example.com', receivesAlerts: true,
  })).code, 403);
  const restoredManager = dashboardUsers.find((user) => user.id === managerCreated.data.user.id);
  restoredManager.role = 'branch_manager';
  restoredManager.branch_ids = '["1"]';
  const restoredReceptionist = dashboardUsers.find((user) => user.id === receptionistCreated.data.user.id);
  restoredReceptionist.role = 'branch_receptionist';
  records.length = 0;
  const manual = {
    customerName: '  Walk-in Client  ', contact: '+1 (437) 898-7424',
    branchId: '1', serviceId: '1', therapistId: '1', date: '2026-11-01', time: '10:00 AM',
    paidAmount: '999', paymentOption: 'full', subtotalAmount: 1, taxRate: 0, skipPatientHistory: false,
    bookingNote: 'Internal team reference: only Tanya',
  };
  cookie = '';
  assert.equal((await request('manual-booking', manual)).code, 401);
  const expiredStaffAvailability = await request('available-therapists', null, {
    method: 'GET', query: { branchId: '1', date: manual.date, time: manual.time, durationMinutes: '120', staffBooking: 'true' },
  });
  assert.equal(expiredStaffAvailability.code, 401);
  assert.match(expiredStaffAvailability.data.message, /session has expired/);
  assert.equal((await request('customer-search', null, { method: 'GET', query: { search: 'Client' } })).code, 401);
  cookie = receptionistCookie;
  assert.equal((await request('customer-search', null, { method: 'GET', origin: 'https://untrusted.example', query: { search: 'Client' } })).code, 403);
  assert.equal((await request('customer-search', {}, { method: 'POST' })).code, 405);
  assert.equal((await request('customer-search', null, { method: 'GET', query: { search: '' } })).code, 400);
  const customerSearch = await request('customer-search', null, { method: 'GET', query: { search: 'Client' } });
  assert.equal(customerSearch.code, 200);
  assert.equal(customerSearch.headers['Cache-Control'], 'no-store');
  assert.equal(customerSearch.data.customers[0].email, 'client@example.com');
  assert.deepEqual(customerSearches.at(-1).params.branchNames, ['test branch']);
  assert.doesNotMatch(customerSearches.at(-1).query, /wix_contacts/);
  assert.equal((await request('customer-search', null, { method: 'GET', origin: '', query: { search: 'Client' } })).code, 200,
    'Same-origin browser GET requests do not normally include an Origin header');
  assert.equal((await request('manual-booking', manual, { origin: 'https://untrusted.example' })).code, 403);
  const eventCount = events.length;
  const historyCount = histories.length;
  const emailCount = emails.length;
  for (const invalid of [
    { customerName: ' ' }, { customerName: 'x'.repeat(151) }, { contact: '' },
    { contact: 'invalid@email' }, { contact: 'not a phone' }, { contact: '123' },
    { date: '2026-02-30' }, { date: '' }, { time: '09:45 AM' },
    { serviceId: '404' }, { serviceId: '4' }, { therapistId: '3' },
    { therapistId: '4' }, { therapistId: '' }, { serviceId: '3', therapistId: '1' },
    { serviceId: '2', therapistId2: '1' }, { serviceId: '2', therapistId2: '' },
    { bookingNote: 'x'.repeat(2001) }, { bookingNote: { text: 'invalid' } },
    { email: 'invalid@email' }, { phone: '123' }, { email: 'client@example.com', phone: 'different phone' },
    { phone: '+1 555 555 0100' },
  ]) {
    const result = await request('manual-booking', { ...manual, ...invalid });
    assert.equal(result.code, 400, JSON.stringify({ invalid, data: result.data }));
  }
  for (const details of [
    { email: '', phone: '' }, { email: ' ', phone: ' ' },
    { email: 'invalid@email', phone: manual.contact },
    { email: 'client@example.com', phone: '123' },
  ]) {
    const result = await request('manual-booking', { ...manual, contact: undefined, ...details });
    assert.equal(result.code, 400, JSON.stringify(result.data));
  }
  branchRows.push([2, 'Unassigned Branch', '', '', '', 'TRUE', '', 'TRUE', 'TRUE', 'TRUE', 'TRUE']);
  branchConfigRows.push({
    ...branchConfigRows[0], id: '2', name: 'Unassigned Branch',
    business_hours: JSON.stringify(defaultBusinessHours()),
  });
  assert.equal((await request('manual-booking', { ...manual, branchId: '2' })).code, 403);
  busyEvents = [{ start: { dateTime: '2026-11-01T10:00:00-05:00' }, end: { dateTime: '2026-11-01T11:00:00-05:00' }, description: 'Therapist: Test Therapist' }];
  const busyBooking = await request('manual-booking', manual);
  assert.equal(busyBooking.code, 409, JSON.stringify(busyBooking.data));
  busyEvents = [];
  blockRows.push(['block-1', 'business', 'Test Branch', '', manual.date, '10:00', '11:00', 'Closed']);
  assert.equal((await request('manual-booking', manual)).code, 409);
  blockRows = [['Block ID'], ['block-2', 'therapist', '', 'Test Therapist', manual.date, '10:00', '11:00', 'Break']];
  assert.equal((await request('manual-booking', manual)).code, 409);
  blockRows = [['Block ID']];
  assert.equal(events.length, eventCount, 'Invalid or unavailable bookings do not create events');
  const phoneBooking = await request('manual-booking', { ...manual, contact: undefined, email: '', phone: manual.contact });
  assert.equal(phoneBooking.code, 200, JSON.stringify(phoneBooking.data));
  assert.match(phoneBooking.data.bookingId, /^MTT-/);
  assert.equal(phoneBooking.data.emailSkipped, true);
  assert.equal(phoneBooking.data.emailSent, false);
  assert.equal(phoneBooking.data.emailError, '');
  assert.equal(phoneBooking.data.staffNotificationError, '');
  assert.ok(phoneBooking.data.staffEmailsSent >= 2, 'Phone-only bookings still alert dashboard owners and branch staff');
  const staffMessage = Buffer.from(staffEmails.at(-1).requestBody.raw, 'base64url').toString();
  const staffBody = staffMessage.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1];
  const staffText = Buffer.from(staffBody.replace(/\s/g, ''), 'base64').toString();
  assert.match(staffText, /Branch: Test Branch/);
  assert.match(staffText, /Duration: 60 minutes/);
  assert.doesNotMatch(staffText, /undefined|Internal team reference/);
  const baseline = await request('booking-notifications', null, { method: 'GET' });
  assert.equal(baseline.code, 200);
  assert.deepEqual(baseline.data.notifications, []);
  const feed = await request('booking-notifications', null, { method: 'GET', query: { since: new Date(Date.parse(baseline.data.cursor) - 60000).toISOString() } });
  assert.equal(feed.code, 200);
  assert.ok(feed.data.notifications.some((item) => item.id === phoneBooking.data.bookingId));
  assert.ok(feed.data.notifications.every((item) => item.branchName === 'Test Branch'));
  assert.equal((await request('booking-notifications', null, { method: 'GET', query: { since: 'bad' } })).code, 400);
  const activityFeed = await request('booking-activity', null, { method: 'GET' });
  assert.equal(activityFeed.code, 200, JSON.stringify(activityFeed.data));
  assert.ok(activityFeed.data.events.some((event) => event.type === 'created' && event.bookingId === phoneBooking.data.bookingId));
  assert.ok(activityFeed.data.events.every((event) => event.branchName === 'Test Branch'));
  assert.equal(phoneBooking.data.patientHistorySkipped, true);
  assert.equal(phoneBooking.data.patientHistorySaved, false);
  assert.equal(phoneBooking.data.paidAmount, '0.00');
  assert.equal(phoneBooking.data.totalAmount, '113.00', 'Price comes from the catalogue, not the request');
  assert.equal(records.at(-1).customer_name, 'Walk-in Client');
  assert.equal(records.at(-1).email, '');
  assert.equal(records.at(-1).phone, manual.contact);
  assert.equal(records.at(-1).payment_option, 'clinic');
  assert.equal(records.at(-1).booking_note, manual.bookingNote);
  assert.doesNotMatch(events.at(-1).requestBody.description, /Internal team reference/);
  assert.equal(histories.length, historyCount);
  assert.equal(emails.length, emailCount, 'Phone-only bookings do not attempt email delivery');
  const emailBooking = await request('manual-booking', { ...manual, contact: undefined, email: ' Client@Example.com ', phone: manual.contact, serviceId: '2', therapistId2: '2', time: '11:15 AM' });
  assert.equal(emailBooking.code, 200, JSON.stringify(emailBooking.data));
  assert.equal(emailBooking.data.emailSkipped, false);
  assert.equal(emailBooking.data.emailSent, true);
  assert.equal(records.at(-1).email, 'client@example.com');
  assert.equal(records.at(-1).phone, manual.contact);
  assert.equal(emailBooking.data.therapistName, 'Test Therapist, Second Therapist');
  assert.equal(records.at(-1).service_name, 'Couple Massage');
  assert.equal(records.at(-1).duration_minutes, 60, 'Both therapists share the couple package duration');
  assert.equal(records.at(-1).time, '11:15 AM');
  assert.equal(Number(records.at(-1).total), 203.40, 'The existing $180 couple package plus HST is used');
  assert.equal(events.at(-1).requestBody.start.dateTime, '2026-11-01T11:15:00');
  assert.equal(events.at(-1).requestBody.end.dateTime, '2026-11-01T12:15:00');
  assert.equal(records.at(-1).email, 'client@example.com');
  assert.equal(records.at(-1).phone, manual.contact);
  const bookingRecord = records.at(-1);
  const noteRequest = { bookingId: bookingRecord.booking_id, note: 'Changed shared note', expectedNote: manual.bookingNote };
  const beforeEditTotal = bookingRecord.total;
  const beforeEditPaid = bookingRecord.paid_amount;
  const edit = await request('booking-note', noteRequest);
  assert.equal(edit.code, 200, JSON.stringify(edit.data));
  assert.equal(bookingRecord.booking_note, noteRequest.note);
  assert.equal(bookingRecord.total, beforeEditTotal);
  assert.equal(bookingRecord.paid_amount, beforeEditPaid);
  assert.equal((await request('booking-note', noteRequest)).code, 409, 'Stale edits cannot overwrite another note');
  assert.equal((await request('booking-note', { ...noteRequest, note: 'x'.repeat(2001) })).code, 400);
  assert.equal((await request('booking-note', { ...noteRequest, note: undefined })).code, 400);
  assert.equal((await request('booking-note', { ...noteRequest, bookingId: '' })).code, 400);
  assert.equal((await request('booking-note', { ...noteRequest, expectedNote: undefined })).code, 400);
  assert.equal((await request('booking-note', { ...noteRequest, bookingId: 'MTT-not-found' })).code, 404);
  assert.equal((await request('booking-note', noteRequest, { origin: 'https://untrusted.example' })).code, 403);
  const authorizedNote = await request('', null, { method: 'GET' });
  assert.equal(authorizedNote.data.bookings.find((item) => item.id === bookingRecord.booking_id).bookingNote, noteRequest.note);
  assert.equal((await request('booking-note', { ...noteRequest, note: '', expectedNote: noteRequest.note })).code, 200);
  assert.equal(bookingRecord.booking_note, '');
  bookingRecord.branch_name = 'Unassigned Branch';
  assert.equal((await request('booking-note', { ...noteRequest, expectedNote: '' })).code, 403);
  bookingRecord.branch_name = 'Test Branch';
  cookie = '';
  assert.equal((await request('booking-note', { ...noteRequest, expectedNote: '' })).code, 401);
  bookingRecord.booking_note = 'Private clinic team reference';
  const publicLookup = await request('find-booking', null, { method: 'GET', query: { bookingId: bookingRecord.booking_id, email: bookingRecord.email } });
  assert.equal(publicLookup.code, 200, JSON.stringify(publicLookup.data));
  assert.doesNotMatch(JSON.stringify(publicLookup.data), /Private clinic team reference|bookingNote|booking_note/);
  cookie = receptionistCookie;
  for (const message of emails) {
    const mime = Buffer.from(message.requestBody.raw, 'base64url').toString();
    for (const part of mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)) {
      assert.doesNotMatch(Buffer.from(part[1].replace(/\s/g, ''), 'base64').toString(), /Internal team reference|Changed shared note|Private clinic team reference/);
    }
  }
  assert.equal(histories.length, historyCount);
  assert.equal(events.length, eventCount + 2);
  cookie = managerCookie;
  assert.equal((await request('manual-booking', { ...manual, time: '12:30 PM' })).code, 200, 'Managers can book their assigned branch');
  cookie = ownerCookie;
  t.mock.method(google, 'gmail', () => ({ users: { messages: { send: async () => { throw new Error('Synthetic confirmation delivery failure'); } } } }));
  const recordsBeforeEmailFailure = records.length;
  const savedWithoutEmail = await request('manual-booking', { ...manual, contact: undefined, email: 'owner-client@example.com', phone: '', time: '01:45 PM' });
  assert.equal(savedWithoutEmail.code, 200, JSON.stringify(savedWithoutEmail.data));
  assert.equal(savedWithoutEmail.data.emailSent, false);
  assert.equal(savedWithoutEmail.data.emailSkipped, false);
  assert.match(savedWithoutEmail.data.emailError, /Synthetic confirmation delivery failure/);
  assert.equal(savedWithoutEmail.data.staffEmailsSent, 0);
  assert.match(savedWithoutEmail.data.staffNotificationError, /staff booking email\(s\) failed/);
  assert.equal(records.length, recordsBeforeEmailFailure + 1, 'Confirmation failures do not discard the saved appointment');
  assert.equal(events.length, eventCount + 4);
  assert.equal(histories.length, historyCount);
  t.mock.method(google, 'gmail', () => ({ users: { messages: { send: async (message) => { emails.push(message); return { data: { id: 'receipt' } }; } } } }));
  const editable = records.find((record) => record.booking_id === phoneBooking.data.bookingId);
  const completedForCorrection = {
    ...editable,
    booking_id: 'completed-therapist-correction',
    date: '2026-10-10',
    time: '11:00 AM',
    status: 'Completed',
    therapist_name: 'Test Therapist',
    calendar_event_id: 'completed-event',
    receipt_number: 'COMPLETED-RECEIPT',
  };
  records.push(completedForCorrection);
  const correctionAvailability = await request('available-therapists', null, {
    method: 'GET',
    query: {
      date: completedForCorrection.date, branchId: '1', time: completedForCorrection.time,
      durationMinutes: '60', isRmt: 'false', excludeBookingId: completedForCorrection.booking_id,
    },
  });
  assert.equal(correctionAvailability.code, 200, JSON.stringify(correctionAvailability.data));
  assert.deepEqual(correctionAvailability.data.therapistIds, [1, 2],
    'Completed appointments allow branch-assigned therapists even when past availability is not verifiable');
  const reassignCompleted = async (staffCookie, therapistName) => {
    cookie = staffCookie;
    return request('reassign-therapist', {
      bookingId: completedForCorrection.booking_id, therapistName,
    });
  };
  assert.equal((await reassignCompleted(managerCookie, 'Second Therapist')).code, 200,
    'Managers can correct completed appointment assignments');
  assert.equal(completedForCorrection.therapist_name, 'Second Therapist');
  assert.equal((await reassignCompleted(receptionistCookie, 'Test Therapist')).code, 200,
    'Receptionists can correct completed appointment assignments');
  assert.equal((await reassignCompleted(ownerCookie, 'Second Therapist')).code, 200,
    'Owners can correct completed appointment assignments even when a receipt was issued');
  cookie = '';
  assert.equal((await request('reassign-therapist', {
    bookingId: completedForCorrection.booking_id, therapistName: 'Test Therapist',
  })).code, 401, 'Therapist corrections require a dashboard sign-in');
  const upcomingCorrection = { ...completedForCorrection, booking_id: 'upcoming-therapist-correction',
    date: '2099-01-01', status: 'Confirmed', therapist_name: 'Test Therapist',
    receipt_number: '', calendar_event_id: '' };
  upcomingCorrection.service_name = 'Massage + Hot Stone Add-on';
  upcomingCorrection.duration_minutes = 75;
  records.push(upcomingCorrection);
  busyEvents = [{
    id: 'busy-second-therapist',
    description: 'Therapist: Second Therapist',
    start: { dateTime: '2099-01-01T11:00:00-05:00' },
    end: { dateTime: '2099-01-01T12:00:00-05:00' },
  }];
  cookie = managerCookie;
  assert.equal((await request('reassign-therapist', {
    bookingId: upcomingCorrection.booking_id, therapistName: 'Second Therapist',
  })).code, 409, 'Upcoming appointments continue to enforce therapist availability');
  busyEvents = [];
  const reassignedAddOn = await request('reassign-therapist', {
    bookingId: upcomingCorrection.booking_id, therapistName: 'Second Therapist',
  });
  assert.equal(reassignedAddOn.code, 200, JSON.stringify(reassignedAddOn.data));
  assert.equal(upcomingCorrection.therapist_name, 'Second Therapist',
    'Therapist reassignment recognizes bookings whose saved service includes the Hot Stone add-on');
  const recordsBeforeCouplePairing = records.length;
  const coupleBooking = (id, time, customerName) => ({
    ...upcomingCorrection, booking_id: id, time, customer_name: customerName,
    status: 'Confirmed', receipt_number: '', calendar_event_id: '', couple_partner_booking_id: '',
  });
  const coupleA = coupleBooking('couple-pair-a', '11:00 AM', 'Couple A');
  const coupleB = coupleBooking('couple-pair-b', '11:00 AM', 'Couple B');
  const coupleC = coupleBooking('couple-pair-c', '11:00 AM', 'Couple C');
  coupleA.calendar_event_id = 'couple-event-a';
  coupleB.calendar_event_id = 'couple-event-b';
  coupleC.calendar_event_id = 'couple-event-c';
  coupleB.duration_minutes = 60;
  const matchingCalendarRange = {
    start: { dateTime: '2099-01-01T11:15:00-05:00' },
    end: { dateTime: '2099-01-01T12:15:00-05:00' },
  };
  coupleCalendarEvents.set('couple-event-a', matchingCalendarRange);
  coupleCalendarEvents.set('couple-event-b', matchingCalendarRange);
  coupleCalendarEvents.set('couple-event-c', matchingCalendarRange);
  const coupleDifferentStart = coupleBooking('couple-pair-different-start', '11:15 AM', 'Couple Different Start');
  const coupleFar = coupleBooking('couple-pair-far', '03:00 PM', 'Couple Far');
  const coupleDifferentEnd = { ...coupleBooking('couple-pair-different-end', '11:00 AM', 'Couple Different End'), duration_minutes: 60 };
  const coupleCancelled = { ...coupleBooking('couple-pair-cancelled', '11:05 AM', 'Couple X'), status: 'Cancelled' };
  records.push(coupleA, coupleB, coupleC, coupleDifferentStart, coupleFar, coupleDifferentEnd, coupleCancelled);
  const pairRequest = (bookingId, partnerBookingId) => request('couple-pair', { bookingId, partnerBookingId });
  assert.equal((await pairRequest(coupleA.booking_id, coupleDifferentStart.booking_id)).code, 409,
    'Couple pairing rejects appointments with a different start time, even within the former pairing window');
  assert.equal((await pairRequest(coupleA.booking_id, coupleFar.booking_id)).code, 409,
    'Couple pairing rejects appointments with a different start time');
  assert.equal((await pairRequest(coupleA.booking_id, coupleDifferentEnd.booking_id)).code, 409,
    'Couple pairing rejects appointments with a different end time');
  assert.equal((await pairRequest(coupleA.booking_id, coupleCancelled.booking_id)).code, 409,
    'Cancelled appointments cannot be paired');
  assert.equal((await pairRequest(coupleA.booking_id, coupleA.booking_id)).code, 400,
    'An appointment cannot be paired with itself');
  assert.equal((await pairRequest(coupleA.booking_id, 'missing-booking')).code, 404,
    'Pairing requires an existing partner appointment');
  assert.equal((await pairRequest('', coupleB.booking_id)).code, 400,
    'Pairing requires a booking reference');
  const pairedCouple = await pairRequest(coupleA.booking_id, coupleB.booking_id);
  assert.equal(pairedCouple.code, 200, JSON.stringify(pairedCouple.data));
  assert.equal(pairedCouple.data.partner.customerName, 'Couple B');
  assert.equal(coupleA.couple_partner_booking_id, coupleB.booking_id);
  assert.equal(coupleB.couple_partner_booking_id, coupleA.booking_id,
    'Couple pairing is written to both appointments');
  assert.equal((await pairRequest(coupleC.booking_id, coupleB.booking_id)).code, 409,
    'An appointment already paired with another client cannot be re-paired');
  const repairedCouple = await pairRequest(coupleA.booking_id, coupleC.booking_id);
  assert.equal(repairedCouple.code, 200, JSON.stringify(repairedCouple.data));
  assert.equal(coupleB.couple_partner_booking_id, '', 'Re-pairing releases the previous partner');
  assert.equal(coupleC.couple_partner_booking_id, coupleA.booking_id);
  const unpairedCouple = await pairRequest(coupleA.booking_id, '');
  assert.equal(unpairedCouple.code, 200, JSON.stringify(unpairedCouple.data));
  assert.equal(unpairedCouple.data.couplePartnerBookingId, '');
  assert.equal(coupleA.couple_partner_booking_id, '');
  assert.equal(coupleC.couple_partner_booking_id, '', 'Unpairing clears both appointments');
  assert.equal((await pairRequest(coupleA.booking_id, '')).code, 400,
    'Unpairing an unpaired appointment reports a clear error');
  cookie = receptionistCookie;
  assert.equal((await pairRequest(coupleA.booking_id, coupleB.booking_id)).code, 200,
    'Receptionists can pair couple appointments at their branch');
  assert.equal((await pairRequest(coupleA.booking_id, '')).code, 200);
  cookie = '';
  assert.equal((await pairRequest(coupleA.booking_id, coupleB.booking_id)).code, 401,
    'Couple pairing requires a dashboard sign-in');
  cookie = managerCookie;
  records.length = recordsBeforeCouplePairing;
  const version = () => bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => editable[field.name]));
  const editBody = () => ({
    bookingId: editable.booking_id, expectedVersion: version(), customerName: 'Updated client',
    email: 'updated@example.com', phone: '+1 437 555 0101', bookingNote: 'Internal edit note',
    date: editable.date, time: editable.time, serviceId: '1', therapistNames: ['Test Therapist'],
    paymentOption: 'Card', total: '113.00', paidAmount: '113.00',
  });
  const identityRecord = {
    ...editable, booking_id: 'preserve-original-booking-id', date: '2099-01-03', time: '11:00 AM',
    customer_name: 'Original client', email: 'original@example.com', phone: '4375550101',
    service_name: 'Massage', therapist_name: 'Test Therapist', duration_minutes: 60,
    calendar_event_id: 'preserve-original-calendar-event', receipt_number: '', membership_type: '',
    status: 'Confirmed', status_notes: 'Original audit note', total: 113, paid_amount: 0,
  };
  records.push(identityRecord);
  const originalRecordCount = records.length;
  const originalEventCount = events.length;
  const noteOnlyEdit = await request('edit-booking', {
    ...editBody(), bookingId: identityRecord.booking_id,
    expectedVersion: bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => identityRecord[field.name])),
    customerName: identityRecord.customer_name, email: identityRecord.email, phone: identityRecord.phone,
    date: identityRecord.date, time: identityRecord.time, therapistNames: [identityRecord.therapist_name],
    total: '113', paidAmount: '0', bookingNote: 'Changed note only',
  });
  assert.equal(noteOnlyEdit.code, 200, JSON.stringify(noteOnlyEdit.data));
  assert.equal(noteOnlyEdit.data.booking.rescheduled, false);
  assert.equal(noteOnlyEdit.data.booking.id, identityRecord.booking_id);
  for (const change of [
    { customerName: 'Corrected client name' },
    { email: 'corrected@example.com' },
    { phone: '4375550123' },
    { therapistNames: ['Second Therapist'] },
    { time: '02:00 PM' },
  ]) {
    const result = await request('edit-booking', {
      ...editBody(), bookingId: identityRecord.booking_id,
      expectedVersion: bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => identityRecord[field.name])),
      customerName: identityRecord.customer_name, email: identityRecord.email, phone: identityRecord.phone,
      date: identityRecord.date, time: identityRecord.time, therapistNames: [identityRecord.therapist_name],
      total: '113', paidAmount: '0', ...change,
    });
    assert.equal(result.code, 200, JSON.stringify(result.data));
    assert.equal(result.data.booking.id, 'preserve-original-booking-id');
    assert.equal(result.data.booking.calendarEventId, 'preserve-original-calendar-event');
    assert.equal(result.data.booking.rescheduled, true);
    assert.equal(result.data.booking.status, 'Confirmed', 'The tag must not replace lifecycle status');
    assert.match(result.data.booking.statusNotes, /^Original audit note\nBooking edited.*\nRescheduled/);
    assert.equal(records.length, originalRecordCount, 'Edits update the existing row, not insert a second booking');
    assert.equal(events.length, originalEventCount, 'Edits patch the original event, not create a new one');
    assert.equal(patches.at(-1).eventId, 'preserve-original-calendar-event');
    assert.match(patches.at(-1).requestBody.description, /Booking: preserve-original-booking-id/);
    assert.equal(patches.at(-1).requestBody.extendedProperties.private.bookingId, 'preserve-original-booking-id');
  }
  records.splice(records.indexOf(identityRecord), 1);
  const legacyTimeBooking = { ...editable, booking_id: 'MTT-legacy-24-hour-time', time: '16:30', calendar_event_id: '' };
  records.push(legacyTimeBooking);
  const listedBookings = await request('', null, { method: 'GET' });
  assert.equal(listedBookings.code, 200, JSON.stringify(listedBookings.data));
  const listedLegacyBooking = listedBookings.data.bookings.find((booking) => booking.id === legacyTimeBooking.booking_id);
  assert.equal(listedLegacyBooking.time, '04:30 PM');
  assert.equal(listedLegacyBooking.timeRange, '4:30 PM - 5:30 PM');
  const legacyTimeEdit = await request('edit-booking', {
    ...editBody(),
    bookingId: legacyTimeBooking.booking_id,
    expectedVersion: bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => legacyTimeBooking[field.name])),
    time: listedLegacyBooking.time,
  });
  assert.equal(legacyTimeEdit.code, 200, JSON.stringify(legacyTimeEdit.data));
  assert.equal(legacyTimeBooking.time, '04:30 PM');
  cookie = '';
  assert.equal((await request('edit-booking', editBody())).code, 401);
  cookie = receptionistCookie;
  assert.equal((await request('edit-booking', editBody(), { origin: 'https://untrusted.example' })).code, 403);
  assert.equal((await request('edit-booking', { ...editBody(), expectedVersion: 'stale' })).code, 409);
  const stale = editBody();
  const notificationRecord = { ...editable, booking_id: 'notify-client-edit', calendar_event_id: '' };
  records.push(notificationRecord);
  const emailsBeforeEdit = emails.length;
  const notificationEdit = await request('edit-booking', {
    ...editBody(),
    bookingId: notificationRecord.booking_id,
    expectedVersion: bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => notificationRecord[field.name])),
    time: '03:00 PM',
    notifyClient: true,
  });
  assert.equal(notificationEdit.code, 200, JSON.stringify(notificationEdit.data));
  assert.equal(notificationEdit.data.emailSent, true);
  assert.equal(emails.length, emailsBeforeEdit + 1, 'Opted-in schedule edits send a client notification');
  const staffEditActivity = activities.findLast((activity) => activity.booking_id === notificationRecord.booking_id);
  assert.equal(staffEditActivity?.type, 'rescheduled', 'Staff time changes are recorded as reschedules');
  assert.equal(staffEditActivity.time, '03:00 PM');
  assert.ok(staffEditActivity.actor.includes('@'));
  const failedNotificationRecord = { ...editable, booking_id: 'notify-client-edit-failure', calendar_event_id: '' };
  records.push(failedNotificationRecord);
  t.mock.method(google, 'gmail', () => ({ users: { messages: { send: async () => { throw new Error('Synthetic notification email failure'); } } } }));
  const failedNotification = await request('edit-booking', {
    ...editBody(),
    bookingId: failedNotificationRecord.booking_id,
    expectedVersion: bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => failedNotificationRecord[field.name])),
    time: '05:45 PM',
    notifyClient: true,
  });
  assert.equal(failedNotification.code, 200, JSON.stringify(failedNotification.data));
  assert.equal(failedNotification.data.emailSent, false);
  assert.match(failedNotification.data.emailError, /Synthetic notification email failure/);
  assert.equal(failedNotificationRecord.time, '05:45 PM', 'Email failure does not roll back the saved booking');
  t.mock.method(google, 'gmail', () => ({ users: { messages: { send: async (email) => { emails.push(email); return { data: { id: 'retry-email' } }; } } } }));
  const savedEdit = await request('edit-booking', stale);
  assert.equal(savedEdit.code, 200, JSON.stringify(savedEdit.data));
  assert.equal(editable.customer_name, 'Updated client');
  assert.equal(editable.total, 113);
  assert.equal(editable.paid_amount, 113);
  assert.equal(editable.booking_note, 'Internal edit note');
  assert.equal(savedEdit.data.booking.editVersion, version());
  assert.equal(savedEdit.data.booking.intakeNotes, undefined);
  assert.doesNotMatch(patches.at(-1).requestBody.description, /Internal edit note/);
  assert.match(patches.at(-1).requestBody.description, /Customer: Updated client[\s\S]*Private integration metadata[\s\S]*Email: updated@example.com/);
  assert.equal(patches.at(-1).transport.headers['If-Match'], '"original"');
  assert.equal((await request('edit-booking', stale)).code, 409);
  const addonEditRecord = {
    ...editable, booking_id: 'manual-hot-stone-reprice', date: '2026-11-02', time: '10:00 AM',
    service_name: 'Massage', duration_minutes: 60, total: 113, paid_amount: 0, calendar_event_id: '',
  };
  records.push(addonEditRecord);
  const addonEdit = await request('edit-booking', {
    ...editBody(), bookingId: addonEditRecord.booking_id,
    expectedVersion: bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => addonEditRecord[field.name])),
    date: addonEditRecord.date, time: addonEditRecord.time, total: '113.00', paidAmount: '0.00',
    hotStoneAddOn: true,
  });
  assert.equal(addonEdit.code, 200, JSON.stringify(addonEdit.data));
  assert.equal(addonEditRecord.service_name, 'Massage + Hot Stone Add-on');
  assert.equal(addonEditRecord.duration_minutes, 75);
  assert.equal(addonEditRecord.total, 135.6, 'Service and Hot Stone prices are recalculated from the catalogue');
  for (const invalid of [{ serviceId: '404' }, { serviceId: '4' }, { time: '09:45 AM' }, { therapistNames: ['Inactive Therapist'] },
    { therapistNames: ['Off Duty'] }, { serviceId: '3', therapistNames: ['Test Therapist'] }, { serviceId: '2', therapistNames: ['Test Therapist', 'Test Therapist'] },
    { paidAmount: '114' }, { total: '-1' }, { date: '2026-02-30' }, { bookingNote: null }]) {
    const result = await request('edit-booking', { ...editBody(), ...invalid });
    assert.equal(result.code, 400, JSON.stringify({ invalid, data: result.data }));
  }
  editable.branch_name = 'Unassigned Branch';
  assert.equal((await request('edit-booking', editBody())).code, 403);
  assert.equal((await request('issue-receipt', { bookingId: editable.booking_id, manualDiscount: '5', confirmReconciliation: true })).code, 403);
  assert.equal((await request('mark-paid', { bookingId: editable.booking_id })).code, 403);
  editable.branch_name = 'Test Branch';
  busyEvents = [{ id: 'other', description: 'Therapist: Test Therapist', start: { dateTime: '2026-12-01T15:00:00Z' }, end: { dateTime: '2026-12-01T16:00:00Z' } }];
  assert.equal((await request('edit-booking', { ...editBody(), date: '2026-12-01' })).code, 409);
  busyEvents = [{ ...busyEvents[0], id: editable.calendar_event_id }];
  blockRows = [['Block ID'], ['block-edit', 'therapist', '', 'Test Therapist', '2026-12-01', '10:00', '11:00', 'Unavailable']];
  assert.equal((await request('edit-booking', { ...editBody(), date: '2026-12-01' })).code, 409);
  blockRows = [['Block ID']];
  cookie = managerCookie;
  const rescheduled = await request('edit-booking', { ...editBody(), date: '2026-12-01' });
  assert.equal(rescheduled.code, 200, JSON.stringify(rescheduled.data));
  assert.equal(patches.at(-1).requestBody.start.dateTime, '2026-12-01T10:00:00');
  assert.equal(patches.at(-1).requestBody.start.timeZone, 'America/Toronto');
  busyEvents = [];
  failCalendarPatch = true;
  assert.equal((await request('edit-booking', { ...editBody(), customerName: 'Not saved' })).code, 500);
  assert.equal(editable.customer_name, 'Updated client');
  failCalendarPatch = false;
  failBookingWrite = true;
  assert.equal((await request('edit-booking', { ...editBody(), customerName: 'Not saved' })).code, 500);
  assert.equal(patches.at(-1).requestBody.summary, originalEvent.summary);
  assert.equal(patches.at(-1).transport.headers['If-Match'], '"patched"');
  failRecovery = true;
  const recovery = await request('edit-booking', { ...editBody(), customerName: 'Not saved' });
  assert.equal(recovery.code, 500);
  assert.equal(recovery.data.calendarRecoveryRequired, true);
  failRecovery = false;
  failBookingWrite = false;
  raceBookingWrite = true;
  assert.equal((await request('edit-booking', editBody())).code, 409);
  assert.equal(patches.at(-1).requestBody.summary, originalEvent.summary);
  raceBookingWrite = false;
  const conflictRecord = { ...editable, booking_id: 'database-conflict', date: '2026-12-02', calendar_id: '', calendar_event_id: '' };
  records.push(conflictRecord);
  assert.equal((await request('edit-booking', { ...editBody(), date: '2026-12-02' })).code, 409);
  conflictRecord.status = 'Cancelled';
  const coupleEdit = await request('edit-booking', { ...editBody(), date: '2026-12-02', serviceId: '2', therapistNames: ['Test Therapist', 'Second Therapist'], total: '203.40', paidAmount: '0' });
  assert.equal(coupleEdit.code, 200, JSON.stringify(coupleEdit.data));
  assert.equal(editable.therapist_name, 'Test Therapist, Second Therapist');
  assert.equal(editable.service_name, 'Couple Massage');
  assert.equal(editable.total, 203.4);
  assert.equal((await request('edit-booking', editBody())).code, 200);
  for (const staffCookie of [managerCookie, receptionistCookie]) {
    cookie = staffCookie;
    const discountRecord = { ...editable, booking_id: `discount-${staffCookie === managerCookie ? 'manager' : 'receptionist'}`, receipt_number: '', receipt_email_status: '', checked_in_at: '2026-01-01T15:00:00.000Z', checked_in_by: 'Front Desk' };
    records.push(discountRecord);
    assert.equal((await request('issue-receipt', { bookingId: discountRecord.booking_id, manualDiscount: '10' })).code, 400);
    assert.equal((await request('issue-receipt', { bookingId: discountRecord.booking_id, manualDiscount: '10', confirmReconciliation: true })).code, 400);
    assert.equal(discountRecord.receipt_number, '');
    assert.equal(discountRecord.total, 113);
    assert.equal(discountRecord.paid_amount, 113);
    const discountEdit = () => ({
      ...editBody(), bookingId: discountRecord.booking_id,
      expectedVersion: bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => discountRecord[field.name])),
      total: '113.00', paidAmount: String(discountRecord.paid_amount), manualDiscount: '10',
    });
    const patchCount = patches.length;
    assert.equal((await request('edit-booking', discountEdit())).code, 400);
    assert.equal(patches.length, patchCount, 'Unconfirmed discounts do not change Calendar');
    failBookingWrite = true;
    assert.equal((await request('edit-booking', { ...discountEdit(), confirmReconciliation: true })).code, 500);
    failBookingWrite = false;
    assert.equal(discountRecord.total, 113);
    assert.equal(discountRecord.receipt_reconciliation || '', '');
    assert.equal(patches.at(-1).requestBody.summary, originalEvent.summary);
    const applied = await request('edit-booking', { ...discountEdit(), confirmReconciliation: true });
    assert.equal(applied.code, 200, JSON.stringify(applied.data));
    assert.equal(discountRecord.total, 101.7);
    assert.equal(discountRecord.paid_amount, 101.7);
    assert.equal(applied.data.booking.originalBookingTotal, 113);
    assert.equal(applied.data.booking.manualBookingDiscount, 10);
    assert.equal(JSON.parse(discountRecord.receipt_reconciliation).confirmedBy, staffCookie === managerCookie ? 'manager@example.com' : 'reception@example.com');
    assert.match(patches.at(-1).requestBody.description, /Paid: 101\.7[\s\S]*Total: 101\.7/);
    const repeated = await request('edit-booking', { ...discountEdit(), bookingNote: 'Discount saved once' });
    assert.equal(repeated.code, 200, JSON.stringify(repeated.data));
    assert.equal(discountRecord.total, 101.7);
    assert.equal((await request('complete-booking-details', { bookingId: discountRecord.booking_id, total: 100 })).code, 403);
    const issued = await request('issue-receipt', { bookingId: discountRecord.booking_id });
    assert.equal(issued.code, 200, JSON.stringify(issued.data));
    assert.equal(issued.data.receipt.manualDiscount, 10);
    assert.equal(issued.data.receipt.total, 101.7);
    assert.equal(discountRecord.total, 101.7);
    assert.equal(discountRecord.paid_amount, 101.7);
    assert.equal(JSON.parse(discountRecord.receipt_reconciliation).receipt.manualDiscount, 10);
    assert.equal((await request('issue-receipt', { bookingId: discountRecord.booking_id })).code, 200);
    assert.equal(discountRecord.total, 101.7, 'Receipt retries cannot deduct the saved discount again');
    assert.equal((await request('edit-booking', { ...discountEdit(), total: '101.70', manualDiscount: 5, confirmReconciliation: true })).code, 409);
    const listedDiscount = (await request('', null, { method: 'GET' })).data.bookings.find((item) => item.id === discountRecord.booking_id);
    assert.equal(listedDiscount.total, 101.7);
    assert.equal(listedDiscount.manualBookingDiscount, 10);
  }
  const partialRecord = { ...editable, booking_id: 'discount-partial', paid_amount: 50, receipt_number: '', receipt_reconciliation: '', checked_in_at: '2026-01-01T15:00:00.000Z', checked_in_by: 'Front Desk' };
  records.push(partialRecord);
  const partialEdit = () => ({
    ...editBody(), bookingId: partialRecord.booking_id,
    expectedVersion: bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => partialRecord[field.name])),
    total: '113.00', paidAmount: String(partialRecord.paid_amount), manualDiscount: '10', confirmReconciliation: true,
  });
  assert.equal((await request('edit-booking', partialEdit())).code, 200);
  assert.equal(partialRecord.total, 101.7);
  assert.equal(partialRecord.paid_amount, 50, 'Discounts do not mark unpaid balances as paid');
  assert.equal((await request('issue-receipt', { bookingId: partialRecord.booking_id })).code, 409);
  assert.equal((await request('mark-paid', { bookingId: partialRecord.booking_id })).code, 200);
  assert.equal(partialRecord.paid_amount, 101.7);
  assert.equal(JSON.parse(partialRecord.receipt_reconciliation).adjustedPaid, 101.7);
  assert.equal((await request('edit-booking', { ...partialEdit(), manualDiscount: '5' })).code, 200);
  assert.equal(partialRecord.total, 107.35);
  assert.equal(partialRecord.paid_amount, 107.35);
  assert.equal((await request('edit-booking', { ...partialEdit(), manualDiscount: '' })).code, 200);
  assert.equal(partialRecord.total, 113);
  assert.equal(partialRecord.paid_amount, 113);
  const fullyDiscounted = { ...editable, booking_id: 'discount-free', receipt_number: '', receipt_reconciliation: '', checked_in_at: '2026-01-01T15:00:00.000Z', checked_in_by: 'Front Desk' };
  records.push(fullyDiscounted);
  const freeEdit = { ...editBody(), bookingId: fullyDiscounted.booking_id, expectedVersion: bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => fullyDiscounted[field.name])),
    manualDiscount: '100', confirmReconciliation: true };
  assert.equal((await request('edit-booking', freeEdit)).code, 200);
  assert.equal(fullyDiscounted.total, 0);
  const freeReceipt = await request('issue-receipt', { bookingId: fullyDiscounted.booking_id });
  assert.equal(freeReceipt.code, 200, JSON.stringify(freeReceipt.data));
  assert.equal(freeReceipt.data.receipt.total, 0);
  assert.equal((await request('issue-receipt', { bookingId: fullyDiscounted.booking_id })).data.receipt.total, 0);
  const retryRecord = { ...editable, booking_id: 'discount-email-failure', receipt_number: '', receipt_reconciliation: '', checked_in_at: '2026-01-01T15:00:00.000Z', checked_in_by: 'Front Desk' };
  records.push(retryRecord);
  const retryEdit = { ...editBody(), bookingId: retryRecord.booking_id,
    expectedVersion: bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => retryRecord[field.name])),
    manualDiscount: '7.50', confirmReconciliation: true };
  assert.equal((await request('edit-booking', retryEdit)).code, 200);
  t.mock.method(google, 'gmail', () => ({ users: { messages: { send: async () => { throw new Error('Synthetic discounted receipt delivery failure'); } } } }));
  const failedReceipt = await request('issue-receipt', { bookingId: retryRecord.booking_id });
  assert.equal(failedReceipt.code, 500);
  assert.equal(failedReceipt.data.booking.total, 104.53);
  assert.equal(retryRecord.total, 104.53);
  assert.equal(retryRecord.receipt_email_status, 'failed');
  t.mock.method(google, 'gmail', () => ({ users: { messages: { send: async (message) => { emails.push(message); return { data: { id: 'retry-receipt' } }; } } } }));
  const recoveredReceipt = await request('issue-receipt', { bookingId: retryRecord.booking_id });
  assert.equal(recoveredReceipt.code, 200, JSON.stringify(recoveredReceipt.data));
  assert.equal(recoveredReceipt.data.receipt.manualDiscount, 7.5);
  assert.equal(recoveredReceipt.data.receipt.total, 104.53);
  assert.equal(retryRecord.paid_amount, 104.53);
  assert.equal(retryRecord.receipt_email_status, 'sent');
  editable.receipt_number = 'ISSUED';
  assert.equal((await request('edit-booking', { ...editBody(), total: '100', paidAmount: '100' })).code, 409);
  assert.equal((await request('edit-booking', { ...editBody(), bookingNote: 'Note after receipt' })).code, 200);
  editable.receipt_number = '';
  editable.membership_type = 'silver';
  assert.equal((await request('edit-booking', { ...editBody(), total: '100', paidAmount: '100' })).code, 409);
  editable.membership_type = '';
  editable.service_name = 'Legacy custom service';
  const legacyEdit = await request('edit-booking', { ...editBody(), serviceId: '__existing__' });
  assert.equal(legacyEdit.code, 200, JSON.stringify(legacyEdit.data));
  assert.equal(editable.service_name, 'Legacy custom service');
  editable.service_name = 'Massage';
  editable.status = 'Cancelled';
  assert.equal((await request('edit-booking', { ...editBody(), time: '11:00 AM' })).code, 409);
  editable.status = 'Confirmed';
  const listing = await request('', null, { method: 'GET' });
  assert.equal(listing.code, 200, JSON.stringify(listing.data));
  assert.equal(listing.data.bookings.find((record) => record.id === editable.booking_id).total, 113);
  assert.equal(listing.data.bookings.find((record) => record.id === editable.booking_id).intakeNotes, undefined);

  const extraShiftDate = '2099-01-02';
  const extraShiftAvailability = (time = '01:00 PM') => request('available-therapists', null, {
    method: 'GET',
    query: { date: extraShiftDate, branchId: '1', time, durationMinutes: '120', isRmt: 'false' },
  });
  assert.ok(!(await extraShiftAvailability()).data.therapistIds.includes(3),
    'A therapist outside the weekly branch schedule needs a date-specific shift');
  scheduleRows.push([3, extraShiftDate, 1, 'TRUE', '13:00', '17:00', 'owner@example.com', 'test']);
  serviceRows.push([6, 'Thai Traditional Massage (2 hr)', 'Thai', 120, 100, 10, 'FALSE', 0.13, '', 'TRUE']);
  assert.ok((await extraShiftAvailability()).data.therapistIds.includes(3),
    'A date-specific shift makes the therapist available at the selected branch');
  const staffShiftDiagnostics = await request('available-therapists', null, {
    method: 'GET', query: {
      date: extraShiftDate, branchId: '1', time: '04:00 PM', durationMinutes: '120', staffBooking: 'true',
    },
  });
  assert.equal(staffShiftDiagnostics.data.unavailableTherapists.find((item) => item.id === 3).reason,
    'The full appointment does not fit within the saved shift.');
  assert.ok(!(await extraShiftAvailability('04:00 PM')).data.therapistIds.includes(3),
    'The full two-hour service must fit inside the date-specific shift');
  const extraShiftBooking = await request('manual-booking', {
    ...manual, date: extraShiftDate, time: '01:00 PM', serviceId: '6', therapistId: '3',
  });
  assert.equal(extraShiftBooking.code, 200, JSON.stringify(extraShiftBooking.data));
  const extraShiftRecord = records.find((record) => record.booking_id === extraShiftBooking.data.bookingId);
  const busyShiftDiagnostics = await request('available-therapists', null, {
    method: 'GET', query: {
      date: extraShiftDate, branchId: '1', time: '01:45 PM', durationMinutes: '120', staffBooking: 'true',
    },
  });
  assert.match(busyShiftDiagnostics.data.unavailableTherapists.find((item) => item.id === 3).reason, /existing booking or calendar event/);
  assert.equal(busyShiftDiagnostics.data.unavailableTherapists.find((item) => item.id === 3).conflicts[0].reference, extraShiftRecord.booking_id);
  extraShiftRecord.status = 'Cancelled';
  busyEvents = [{
    id: extraShiftRecord.calendar_event_id, description: 'Therapist: Off Duty',
    start: { dateTime: `${extraShiftDate}T13:00:00-05:00` },
    end: { dateTime: `${extraShiftDate}T15:00:00-05:00` },
  }];
  assert.ok((await extraShiftAvailability()).data.therapistIds.includes(3),
    'A leftover event from a cancelled booking must not block the therapist');
  const afterCancellationBooking = await request('manual-booking', {
    ...manual, date: extraShiftDate, time: '01:00 PM', serviceId: '6', therapistId: '3',
  });
  assert.equal(afterCancellationBooking.code, 200, JSON.stringify(afterCancellationBooking.data));
  records.splice(records.findIndex((record) => record.booking_id === afterCancellationBooking.data.bookingId), 1);
  busyEvents = [];
  extraShiftRecord.status = 'Confirmed';
  const extraShiftEdit = () => ({
    ...editBody(), bookingId: extraShiftRecord.booking_id,
    expectedVersion: bookingEditVersion(BOOKING_TABLE_FIELDS.map((field) => extraShiftRecord[field.name])),
    date: extraShiftDate, time: '03:00 PM', serviceId: '6', therapistNames: ['Off Duty'],
  });
  const editedExtraShift = await request('edit-booking', extraShiftEdit());
  assert.equal(editedExtraShift.code, 200, JSON.stringify(editedExtraShift.data));
  for (const therapistName of ['Test Therapist', 'Off Duty']) {
    const reassignment = await request('reassign-therapist', {
      bookingId: extraShiftRecord.booking_id, therapistName,
    });
    assert.equal(reassignment.code, 200, JSON.stringify(reassignment.data));
  }
  scheduleRows.pop();
  assert.equal((await request('edit-booking', { ...extraShiftEdit(), time: '01:00 PM' })).code, 400,
    'Removing the extra shift restores the regular weekly schedule restrictions');
  serviceRows.pop();
  records.splice(records.indexOf(extraShiftRecord), 1);

  cookie = ownerCookie;
  const hours = defaultBusinessHours();
  hours.sun = { open: '08:00', close: '22:00', closed: false };
  hours.mon.closed = true;
  branchRows[0][11] = JSON.stringify(hours);
  branchConfigRows[0].business_hours = JSON.stringify(hours);
  scheduleRows.push([1, '2026-11-01', 1, 'TRUE', '08:00', '22:00', 'owner@example.com', 'test']);
  const morningAvailability = await request('available-therapists', null, {
    method: 'GET',
    query: { date: '2026-11-01', branchId: '1', time: '08:00 AM', durationMinutes: '60', isRmt: 'false' },
  });
  assert.equal(morningAvailability.code, 200, JSON.stringify(morningAvailability.data));
  assert.deepEqual(morningAvailability.data.therapistIds, [1], 'Date-specific shifts filter exact appointment availability');
  scheduleRows.push([2, '2026-11-01', 1, 'TRUE', '08:00', '22:00', 'owner@example.com', 'test']);
  blockRows.push(['closed-window', 'business', 'Test Branch', '', '2026-11-01', '08:00', '09:00', 'Temporary closure']);
  const slotAvailability = await request('available-therapists', null, {
    method: 'GET',
    query: { date: '2026-11-01', branchId: '1', times: JSON.stringify(['08:00 AM', '07:00 PM']), durationMinutes: '60', isRmt: 'false' },
  });
  assert.equal(slotAvailability.code, 200, JSON.stringify(slotAvailability.data));
  assert.deepEqual(slotAvailability.data.therapistIdsByTime['08:00 AM'], [], 'Closed slots have no available therapists');
  assert.ok(slotAvailability.data.therapistIdsByTime['07:00 PM'].includes(1), 'Availability is calculated separately for each slot');
  blockRows.pop();
  therapistRows.push([5, 'Comma Name, RMT', '', 5, 'TRUE', 'TRUE', '1', '{}', 'TRUE']);
  busyEvents = [{
    id: 'comma-name-busy',
    description: 'Therapist: Comma Name, RMT',
    start: { dateTime: '2026-11-01T14:00:00-05:00' },
    end: { dateTime: '2026-11-01T15:00:00-05:00' },
  }];
  const commaNameAvailability = await request('available-therapists', null, {
    method: 'GET',
    query: { date: '2026-11-01', branchId: '1', time: '02:15 PM', durationMinutes: '60', isRmt: 'true' },
  });
  assert.equal(commaNameAvailability.code, 200, JSON.stringify(commaNameAvailability.data));
  assert.ok(!commaNameAvailability.data.therapistIds.includes(5),
    'Calendar events must block RMT therapists whose names contain commas');
  busyEvents = [];
  therapistRows.pop();
  const gapBoundaryAvailability = await request('available-therapists', null, {
    method: 'GET',
    query: { date: '2026-11-01', branchId: '1', times: JSON.stringify(['06:45 PM', '07:00 PM']), durationMinutes: '60', isRmt: 'false' },
  });
  assert.equal(gapBoundaryAvailability.code, 200, JSON.stringify(gapBoundaryAvailability.data));
  assert.ok(!gapBoundaryAvailability.data.therapistIdsByTime['06:45 PM'].includes(1),
    'The therapist finishing at 6:45 remains unavailable during the configured gap');
  assert.ok(gapBoundaryAvailability.data.therapistIdsByTime['07:00 PM'].includes(1),
    'A new appointment is allowed exactly 15 minutes after the previous appointment ends');
  scheduleRows.filter((row) => row[0] && row[1] === '2026-11-01').forEach((row) => { row[8] = 'FALSE'; });
  cookie = '';
  const anonymousSlot = await request('available-therapists', null, {
    method: 'GET',
    query: { date: '2026-11-01', branchId: '1', times: JSON.stringify(['07:00 PM']), durationMinutes: '60', isRmt: 'false' },
  });
  assert.equal(anonymousSlot.code, 200, JSON.stringify(anonymousSlot.data));
  assert.deepEqual(anonymousSlot.data.therapistIdsByTime['07:00 PM'], [],
    'Public slot results do not disclose therapists who opted out');
  assert.equal(anonymousSlot.data.unassignedTherapistCountByTime['07:00 PM'], 2,
    'Available anonymous therapists still contribute booking capacity');
  const anonymousBooking = await request('', { ...base, id: 'MTT-anonymous', therapistName: 'Any Available', time: '07:00 PM', paymentOption: 'deposit' });
  assert.equal(anonymousBooking.code, 200, JSON.stringify(anonymousBooking.data));
  assert.equal(records.find((record) => record.booking_id === 'MTT-anonymous').therapist_name, 'Any Available',
    'A booking that relies on anonymous availability stays unassigned for staff');
  const reducedAnonymousCapacity = await request('available-therapists', null, {
    method: 'GET',
    query: { date: '2026-11-01', branchId: '1', time: '07:00 PM', durationMinutes: '60', isRmt: 'false' },
  });
  assert.equal(reducedAnonymousCapacity.data.unassignedTherapistCount, 1,
    'Unassigned bookings consume anonymous capacity and do not allow overbooking');
  cookie = initialOwnerCookie;
  const beforeHoursBookings = events.length;
  for (const change of [
    { time: '07:45 AM' }, { time: '09:15 PM' }, { date: '2026-11-02' },
    { time: '09:00 PM', durationMinutes: 90 },
  ]) {
    const result = await request('', { ...base, id: `MTT-hours-invalid-${events.length}`, ...change });
    assert.equal(result.code, 400, JSON.stringify(result.data));
  }
  assert.equal(events.length, beforeHoursBookings, 'Out-of-hours requests do not create Calendar events');
  assert.equal((await request('manual-booking', { ...manual, therapistId: '2', time: '08:00 AM' })).code, 200,
    'Earlier branch hours are available to quick appointments');
  assert.equal((await request('manual-booking', { ...manual, time: '09:00 PM' })).code, 200,
    'A one-hour appointment can start exactly one hour before a later closing');
  const flexibleEdit = await request('edit-booking', { ...editBody(), date: base.date, time: '08:45 AM' });
  assert.equal(flexibleEdit.code, 200, JSON.stringify(flexibleEdit.data));
  for (const time of ['07:45 AM', '09:15 PM']) {
    assert.equal((await request('edit-booking', { ...editBody(), time })).code, 400);
    assert.equal((await request('reschedule-booking', { bookingId: editable.booking_id, email: editable.email, date: base.date, time })).code, 400);
  }
  const beforeRescheduleCount = records.length;
  const beforeRescheduleEventCount = events.length;
  const customerReschedule = await request('reschedule-booking', {
    bookingId: editable.booking_id, email: editable.email, date: base.date, time: '07:30 PM',
  });
  assert.equal(customerReschedule.code, 200, JSON.stringify(customerReschedule.data));
  assert.equal(customerReschedule.data.bookingId, editable.booking_id);
  assert.equal(records.length, beforeRescheduleCount);
  assert.equal(events.length, beforeRescheduleEventCount);
  assert.equal(editable.time, '07:30 PM');
  assert.match(editable.status_notes, /Rescheduled/);
  hours.sun.closed = true;
  branchRows[0][11] = JSON.stringify(hours);
  branchConfigRows[0].business_hours = JSON.stringify(hours);
  assert.equal((await request('edit-booking', { ...editBody(), bookingNote: 'Retained existing appointment after hours change' })).code, 200,
    'Changing branch hours does not prevent non-scheduling edits to existing appointments');
  assert.equal((await request('manual-booking', manual)).code, 400, 'Closed days reject new appointments');

  const mergeBody = { sourceName: 'Legacy Staff', targetId: 1, targetName: 'Test Therapist' };
  cookie = '';
  assert.equal((await request('therapist-name-merge', null, { method: 'GET' })).code, 401);
  cookie = receptionistCookie;
  assert.equal((await request('therapist-name-merge', mergeBody)).code, 403);
  cookie = ownerCookie;
  assert.equal((await request('therapist-name-merge', mergeBody, { origin: 'https://untrusted.example' })).code, 403);
  const historical = { ...editable, booking_id: 'WIX-legacy-rename', therapist_name: 'Legacy Staff', intake_notes: '{"sourceFields":{"Staff name":"Legacy Staff"}}', receipt_number: 'HISTORICAL-RECEIPT', status_notes: 'Original history' };
  records.push(historical);
  therapistRows.push([8, 'Legacy Staff', '', 5, 'TRUE', 'FALSE', '1', '{}', 'TRUE']);
  blockRows.push(['legacy-block', 'therapist', '', 'Legacy Staff', '2099-01-01', '10:00', '11:00', 'Leave']);
  const beforeMerge = { ...historical };
  const mergeNames = await request('therapist-name-merge', null, { method: 'GET' });
  assert.ok(mergeNames.data.names.includes('Legacy Staff'));
  legacyAccount = true;
  assert.equal((await request('therapist-name-merge', { ...mergeBody, preview: true })).code, 409,
    'Separate login and treatment-note ownership requires manual review');
  legacyAccount = false;
  const mergePreview = await request('therapist-name-merge', { ...mergeBody, preview: true });
  assert.equal(mergePreview.code, 200, JSON.stringify(mergePreview.data));
  assert.equal(mergePreview.data.bookings, 1);
  assert.equal(mergePreview.data.issuedReceipts, 1);
  assert.equal(aliasRows.length, 0, 'Preview writes nothing');
  assert.equal((await request('therapist-name-merge', mergeBody)).code, 400);
  assert.equal((await request('therapist-name-merge', { ...mergeBody, targetName: 'Stale', confirm: true })).code, 409);
  originalEvent.description = 'Therapist: Legacy Staff\nHistorical details';
  const batch = await request('therapist-name-merge', { ...mergeBody, confirm: true });
  assert.equal(batch.code, 200, JSON.stringify(batch.data));
  assert.equal(batch.data.updated, 1);
  assert.equal(batch.data.done, false);
  assert.equal(historical.therapist_name, 'Test Therapist');
  assert.equal(historical.intake_notes, beforeMerge.intake_notes);
  assert.equal(historical.receipt_number, beforeMerge.receipt_number);
  assert.equal(historical.paid_amount, beforeMerge.paid_amount);
  assert.match(historical.status_notes, /^Original history\nTherapist name merged/);
  assert.equal(patches.at(-1).sendUpdates, 'none');
  assert.equal(patches.at(-1).transport.headers['If-Match'], '"original"');
  assert.equal(aliasRows.length, 2);
  calendarMergePages = [[{ id: 'standalone-old-event', etag: '"standalone"', description: 'Therapist: Legacy Staff\nHistorical details', status: 'confirmed' }], []];
  const finished = await request('therapist-name-merge', { ...mergeBody, confirm: true });
  assert.equal(finished.code, 200, JSON.stringify(finished.data));
  assert.equal(finished.data.done, false);
  assert.equal(finished.data.calendarUpdated, 1);
  assert.equal(patches.at(-1).requestBody.description, 'Therapist: Test Therapist\nHistorical details');
  assert.equal(patches.at(-1).transport.headers['If-Match'], '"standalone"');
  assert.equal(finished.data.updated, 0);
  const finalPage = await request('therapist-name-merge', { ...mergeBody, confirm: true, calendarCursor: finished.data.calendarCursor });
  assert.equal(finalPage.code, 200, JSON.stringify(finalPage.data));
  assert.equal(finalPage.data.done, true);
  assert.equal(blockRows.at(-1)[3], 'Test Therapist');
  assert.equal(therapistRows.at(-1)[8], 'FALSE');
  assert.equal(aliasRows.length, 2, 'Retries do not duplicate the saved alias');
  const roster = (await request('therapists', null, { method: 'GET' })).data.therapists;
  assert.equal((await request('therapists', {
    therapists: roster.map((therapist) => therapist.id === 1 ? { ...therapist, name: 'Changed target' } : therapist),
  })).code, 400, 'Aliases prevent removing or renaming the destination identity');
  assert.equal((await request('therapists', {
    therapists: roster.map((therapist) => therapist.id === 8 ? { ...therapist, active: true } : therapist),
  })).code, 400, 'Merged roster identities cannot be reactivated');
  const csv = 'Session date,Start time,Registration date,Booking contact name,Booking contact email,Booking contact phone,Client address,Spots filled,Duration,Service name,Service type,Staff name,Booking status,Attendance status,Payment status\n2099-01-01,10:00,2026-10-01,Client,client@example.com,,,1,60m,Massage,Appointment,Legacy Staff,Confirmed,Not specified,Paid';
  const aliasPreview = await request('wix-bookings-import', { csv, preview: true });
  assert.equal(aliasPreview.code, 200, JSON.stringify(aliasPreview.data));
  assert.equal(aliasPreview.data.sample[0].therapist_name, 'Test Therapist');
  const override = await request('wix-bookings-import', {
    csv, preview: true,
    therapistMappings: [{ sourceName: 'Test Therapist', therapistId: 2, therapistName: 'Second Therapist' }],
  });
  assert.equal(override.code, 409, JSON.stringify(override.data));

  cookie = '';
  assert.equal((await request('appointment-config-status', null, { method: 'GET' })).code, 401);
  cookie = ownerCookie;
  assert.equal((await request('appointment-config-status', null, { method: 'GET' })).data.source, 'sheets');
  const publicSchedule = await request('staff-work-schedule', {
    date: '2026-11-02', branchId: 1, therapistId: 1,
    override: { therapistId: 1, date: '2026-11-02', isWorking: true, startTime: '10:00', endTime: '20:00', showToPublic: true },
  });
  assert.equal(publicSchedule.code, 200, JSON.stringify(publicSchedule.data));
  assert.equal((await request('appointment-config-migrate', {}, { origin: 'https://untrusted.example' })).code, 403);
  const appointmentConfigImport = await request('appointment-config-migrate', {});
  assert.equal(appointmentConfigImport.code, 200, JSON.stringify(appointmentConfigImport.data));
  assert.equal(appointmentConfigBatchGets, 1, 'The one-time migration reads the source settings in a single Sheets batch request');
  assert.ok(JSON.parse(appointmentConfigRows.find((row) => row.config_type === 'work_schedule').payload)
    .some((entry) => entry.date === '2026-11-02' && entry.therapistId === 1 && entry.showToPublic === true),
  'Consent state survives migration from Sheets to appointment settings');
  assert.deepEqual(appointmentConfigImport.data.importedCounts, {
    businessProfile: 1,
    services: serviceRows.length,
    therapists: therapistRows.length,
    workSchedule: scheduleRows.slice(1).filter((row) => row[0]).length,
    unavailability: blockRows.length - 1,
    therapistAliases: aliasRows.length - 1,
  });
  assert.equal(appointmentConfigRows.length, 7, 'All appointment datasets, therapist aliases, and the migration marker are saved together');
  assert.deepEqual(
    JSON.parse(appointmentConfigRows.find((row) => row.config_type === 'therapist_aliases').payload),
    [{ sourceName: 'Legacy Staff', targetId: 1, targetName: 'Test Therapist' }],
  );
  assert.equal((await request('appointment-config-migrate', {})).code, 409, 'Appointment settings can only be imported once');
  assert.equal((await request('appointment-config-status', null, { method: 'GET' })).data.source, 'bigquery');

  failAppointmentConfigSheetReads = true;
  failBranchesSheetRead = true;
  assert.equal((await request('business-profile', null, { method: 'GET' })).code, 200);
  assert.equal((await request('services', null, { method: 'GET' })).code, 200);
  assert.equal((await request('therapists', null, { method: 'GET' })).code, 200);
  assert.equal((await request('unavailability', null, { method: 'GET' })).code, 200);
  const migratedSchedule = await request('staff-work-schedule', null, {
    method: 'GET', query: { month: '2026-11', branchId: '1' },
  });
  assert.equal(migratedSchedule.code, 200, JSON.stringify(migratedSchedule.data));
  const activeTherapistIds = new Set(therapistRows
    .filter((row) => row[8] !== 'FALSE' && String(row[6] || '').split(',').includes('1'))
    .map((row) => Number(row[0])));
  const expectedScheduleCount = scheduleRows.slice(1).filter((row) =>
    row[0] && row[1].startsWith('2026-11') && Number(row[2]) === 1 && activeTherapistIds.has(Number(row[0])),
  ).length;
  assert.equal(migratedSchedule.data.overrides.length, expectedScheduleCount);
  const rescheduledFromBigQueryConfig = await request('reschedule-booking', {
    bookingId: editable.booking_id, email: editable.email, date: '2026-11-03', time: '10:00 AM',
  });
  assert.equal(rescheduledFromBigQueryConfig.code, 200, JSON.stringify(rescheduledFromBigQueryConfig.data));
  const reassignedFromBigQueryConfig = await request('reassign-therapist', {
    bookingId: editable.booking_id, therapistName: 'Second Therapist',
  });
  assert.equal(reassignedFromBigQueryConfig.code, 200, JSON.stringify(reassignedFromBigQueryConfig.data));
  const newBookingFromBigQueryConfig = await request('manual-booking', {
    ...manual, customerName: 'BigQuery Config Booking', contact: 'bq-booking@example.com',
    date: '2026-11-10', time: '03:00 PM', therapistId: '1',
  });
  assert.equal(newBookingFromBigQueryConfig.code, 200, JSON.stringify(newBookingFromBigQueryConfig.data));
  const migratedServices = await request('services', null, { method: 'GET' });
  assert.equal((await request('services', { services: migratedServices.data.services })).code, 200);
  const migratedTherapists = await request('therapists', null, { method: 'GET' });
  assert.equal((await request('therapists', { therapists: migratedTherapists.data.therapists })).code, 200);
  assert.equal((await request('therapists', {
    therapists: migratedTherapists.data.therapists.map((therapist) =>
      therapist.id === 1 ? { ...therapist, name: 'Changed target' } : therapist),
  })).code, 400, 'Imported aliases continue protecting their destination therapist identity');
  assert.equal((await request('therapists', {
    therapists: migratedTherapists.data.therapists.map((therapist) =>
      therapist.id === 8 ? { ...therapist, active: true } : therapist),
  })).code, 400, 'Imported aliases continue preventing historical names from being reactivated');
  const migratedAliasPreview = await request('wix-bookings-import', { csv, preview: true });
  assert.equal(migratedAliasPreview.code, 200, JSON.stringify(migratedAliasPreview.data));
  assert.equal(migratedAliasPreview.data.sample[0].therapist_name, 'Test Therapist',
    'Historical imports continue applying aliases from BigQuery after migration');
  const migratedProfile = await request('business-profile', null, { method: 'GET' });
  assert.equal((await request('business-profile', { profile: migratedProfile.data.profile })).code, 200);
  const scheduleUpdate = await request('staff-work-schedule', {
    date: '2026-11-04', branchId: 1, therapistId: 1,
    override: { therapistId: 1, date: '2026-11-04', isWorking: true, startTime: '10:00', endTime: '18:00' },
  });
  assert.equal(scheduleUpdate.code, 200, JSON.stringify(scheduleUpdate.data));
  assert.ok(JSON.parse(appointmentConfigRows.find((row) => row.config_type === 'work_schedule').payload)
    .some((override) => override.date === '2026-11-04'));
  const unavailable = await request('unavailability', {
    scope: 'business', branchName: 'Test Branch', date: '2026-11-05',
    startTime: '10:00', endTime: '11:00', reason: 'Test block',
  });
  assert.equal(unavailable.code, 201, JSON.stringify(unavailable.data));
  const deletedUnavailable = await request('unavailability-delete', { id: unavailable.data.block.id });
  assert.equal(deletedUnavailable.code, 200, JSON.stringify(deletedUnavailable.data));
  assert.match(override.data.message, /conflicts with a saved/);

  await t.test('public booking notice rejects past and too-soon appointments and persists configuration', async () => {
    const originalNow = now;
    const profile = migratedProfile.data.profile;
    assert.equal(profile.minimumBookingNoticeMinutes, '15');
    for (const value of ['-1', '1.5', '1441', 'invalid', '']) {
      const invalid = await request('business-profile', { profile: { ...profile, minimumBookingNoticeMinutes: value } });
      assert.equal(invalid.code, 400, JSON.stringify(invalid.data));
    }
    const noticeDate = '2026-11-10';
    now = Date.parse(`${noticeDate}T16:13:00Z`); // 11:13 AM in Toronto after DST.
    cookie = '';
    const slots = async (times) => request('available-therapists', null, {
      method: 'GET', query: {
        date: noticeDate, branchId: '1', times: JSON.stringify(times), durationMinutes: '60', isRmt: 'false', publicBooking: 'true',
      },
    });
    const availability = await slots(['10:00 AM', '11:15 AM', '11:30 AM']);
    assert.equal(availability.code, 200, JSON.stringify(availability.data));
    assert.deepEqual(availability.data.therapistIdsByTime['10:00 AM'], []);
    assert.deepEqual(availability.data.therapistIdsByTime['11:15 AM'], []);
    assert.ok(availability.data.therapistIdsByTime['11:30 AM'].includes(1),
      'Default public visibility includes therapists without an explicit opt-out');
    assert.equal(availability.data.bookingCutoffsByTime['11:30 AM'], Date.parse(`${noticeDate}T16:15:00Z`));
    const eventCount = events.length;
    for (const time of ['10:00 AM', '11:15 AM']) {
      const rejected = await request('', { ...base, id: `MTT-notice-${time}`, date: noticeDate, time });
      assert.equal(rejected.code, 409, JSON.stringify(rejected.data));
      assert.match(rejected.data.message, /at least 15 minutes from now/);
    }
    assert.equal(events.length, eventCount, 'Rejected bookings do not create calendar events');
    now = Date.parse(`${noticeDate}T16:15:00Z`);
    assert.ok((await slots(['11:30 AM'])).data.therapistIdsByTime['11:30 AM'].includes(1));
    const accepted = await request('', { ...base, id: 'MTT-notice-boundary', date: noticeDate, time: '11:30 AM', paymentOption: 'deposit' });
    assert.equal(accepted.code, 200, JSON.stringify(accepted.data));
    now += 1;
    assert.deepEqual((await slots(['11:30 AM'])).data.therapistIdsByTime['11:30 AM'], []);
    const rejectedReschedule = await request('reschedule-booking', {
      bookingId: 'MTT-notice-boundary', email: base.email, date: noticeDate, time: '10:00 AM',
    });
    assert.equal(rejectedReschedule.code, 409, JSON.stringify(rejectedReschedule.data));

    now = originalNow;
    cookie = initialOwnerCookie;
    const configured = await request('business-profile', { profile: { ...profile, minimumBookingNoticeMinutes: '45' } });
    assert.equal(configured.code, 200, JSON.stringify(configured.data));
    assert.equal((await request('business-profile', null, { method: 'GET' })).data.profile.minimumBookingNoticeMinutes, '45');
    now = Date.parse(`${noticeDate}T16:13:00Z`);
    cookie = '';
    const longerNotice = await slots(['11:45 AM', '12:00 PM']);
    assert.deepEqual(longerNotice.data.therapistIdsByTime['11:45 AM'], []);
    assert.ok(longerNotice.data.therapistIdsByTime['12:00 PM'].length > 0);

    now = originalNow;
    cookie = initialOwnerCookie;
    assert.equal((await request('business-profile', { profile: { ...profile, minimumBookingNoticeMinutes: '0' } })).code, 200);
    now = Date.parse(`${noticeDate}T16:13:00Z`);
    cookie = '';
    const zeroNotice = await slots(['11:00 AM', '11:15 AM']);
    assert.deepEqual(zeroNotice.data.therapistIdsByTime['11:00 AM'], []);
    assert.ok(zeroNotice.data.therapistIdsByTime['11:15 AM'].length > 0, 'Zero notice still excludes the past');
    const pastWithZeroNotice = await request('', { ...base, id: 'MTT-zero-notice-past', date: noticeDate, time: '11:00 AM' });
    assert.equal(pastWithZeroNotice.code, 409, JSON.stringify(pastWithZeroNotice.data));
    const freshLogin = await request('owner-login', { email: ownerEmail, password: ownerPassword });
    assert.equal(freshLogin.code, 200, JSON.stringify(freshLogin.data));
    assert.equal((await request('owner-verify', { challengeId: freshLogin.data.challengeId, code: readDashboardOtp(emails.at(-1)) })).code, 200);
    assert.deepEqual((await slots(['11:00 AM'])).data.therapistIdsByTime['11:00 AM'], [],
      'Being signed in to the dashboard does not bypass notice in the public portal');
    const staffAvailability = await request('available-therapists', null, {
      method: 'GET', query: { date: noticeDate, branchId: '1', time: '10:00 AM', durationMinutes: '60', isRmt: 'false' },
    });
    assert.ok(staffAvailability.data.therapistIds.includes(1), 'Staff availability retains historical correction support');
    now = Date.parse(`${noticeDate}T23:00:00Z`); // 6 PM in Toronto.
    const historicalStaffAvailability = await request('available-therapists', null, {
      method: 'GET', query: {
        date: noticeDate, branchId: '1', time: '01:00 PM', durationMinutes: '120', isRmt: 'false', staffBooking: 'true',
      },
    });
    assert.ok(historicalStaffAvailability.data.therapistIds.includes(2), JSON.stringify(historicalStaffAvailability.data));
    assert.match(historicalStaffAvailability.data.unavailableTherapists.find((item) => item.id === 1).reason, /existing booking/);
    assert.ok(historicalStaffAvailability.data.unavailableTherapists.some((item) => item.id === 3));
    cookie = '';
    const publicDiagnostics = await request('available-therapists', null, {
      method: 'GET', query: { date: noticeDate, branchId: '1', time: '01:00 PM', durationMinutes: '120' },
    });
    assert.equal(publicDiagnostics.data.unavailableTherapists, undefined, 'Public requests must not expose staff diagnostic details');
    assert.deepEqual(publicDiagnostics.data.therapistIds, [], 'Customer rules still hide 1 PM at 6 PM');
    now = Date.parse('2026-10-13T15:13:00Z');
    cookie = '';
    const summerAvailability = await request('available-therapists', null, {
      method: 'GET', query: { date: '2026-10-13', branchId: '1', times: JSON.stringify(['11:00 AM', '11:15 AM']), durationMinutes: '60', isRmt: 'false' },
    });
    assert.deepEqual(summerAvailability.data.therapistIdsByTime['11:00 AM'], []);
    assert.equal(summerAvailability.data.bookingCutoffsByTime['11:15 AM'], Date.parse('2026-10-13T15:15:00Z'),
      'The cutoff follows Toronto daylight saving time rather than the server or browser time zone');
    now = originalNow;
    cookie = initialOwnerCookie;
  });
});
