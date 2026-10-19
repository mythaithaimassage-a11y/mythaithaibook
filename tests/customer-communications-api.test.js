import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { customerCommunicationAccess, createReminderTracking } from '../lib/customer-communications.js';
import { formatAppointmentReminderEmail, isValidEmail, buildReminderSentNotes } from '../lib/appointment-alerts.js';
import { normalizeBookingTime } from '../lib/booking-edit.js';

const source = readFileSync(new URL('../api/booking.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('booking.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const blocks = {};
function visit(node) {
  if (ts.isIfStatement(node)) {
    const condition = node.expression.getText(ast);
    if (condition === "view === 'customer-communications'") blocks.history = node.thenStatement.getText(ast);
    if (condition === "req.method === 'POST' && view === 'appointment-alerts-send'") blocks.send = node.thenStatement.getText(ast);
    if (condition === "req.query?.view === 'email-open'") blocks.pixel = node.thenStatement.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);

function response() {
  return {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(body) { this.body = body; return this; },
  };
}
function run(name, context) {
  assert.ok(blocks[name], `Locate actual ${name} endpoint`);
  return vm.runInNewContext(`(async () => ${blocks[name]})()`, { Buffer, Date, Set, String, console, ...context });
}

test('email history endpoint authenticates before touching customer data or mailbox services', async () => {
  for (const dashboardSession of [null, { role: 'therapist' }]) {
    const res = response();
    await run('history', { req: { method: 'GET' }, res, dashboardSession });
    assert.equal(res.statusCode, dashboardSession ? 403 : 401);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  const res = response();
  await run('history', { req: { method: 'POST' }, res, dashboardSession: { role: 'owner' } });
  assert.equal(res.statusCode, 405);
});

test('email history resolves customer email server-side and returns tracked reminders with an explicit mailbox error', async () => {
  const res = response();
  let mailboxCalls = 0;
  await run('history', {
    req: { method: 'GET', query: { bookingId: 'MTT-101', email: 'attacker@example.com' } }, res,
    dashboardSession: { role: 'owner' }, createSheetsClient: () => ({}), getBigQueryClient: () => ({}),
    bqFetchBookingRows: async () => ({ data: { values: [['MTT-101', 'Customer', '', 'client@example.com', 'Central']] } }),
    getDashboardBranchNames: async () => null, customerCommunicationAccess,
    getCustomerEmailStore: () => ({ readReminders: async (access) => { assert.equal(access.email, 'client@example.com'); return [{ id: 'saved-reminder' }]; } }),
    createGmailApi: () => ({}),
    readCustomerEmails: async () => { mailboxCalls++; throw Object.assign(new Error('Gmail needs gmail.readonly'), { statusCode: 503 }); },
    console: { error() {} },
  });
  assert.equal(mailboxCalls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.customer.email, 'client@example.com');
  assert.match(res.body.historyError, /gmail.readonly/);
  assert.equal(res.body.reminders[0].id, 'saved-reminder');
  assert.equal(res.body.messages.length, 0);
});

test('reminder tracking preparation and log failures never retry or mark a successfully sent reminder as failed', async () => {
  for (const failure of ['prepare', 'log', 'none']) {
    const res = response();
    let sends = 0, notes = 0, warnings = 0, prepared = false, logged = 0;
    await run('send', {
      req: { body: { bookingIds: ['MTT-101'] } }, res, dashboardSession: { role: 'owner' }, sheets: {},
      getBigQueryClient: () => ({}),
      bqFetchBookingRows: async () => ({ data: { values: [['MTT-101', 'Customer', '', 'client@example.com', 'Central', 'Massage', 'Therapist', '2026-10-19', '12:00 PM']] } }),
      getBusinessProfile: async () => ({ businessName: 'Clinic' }), getDashboardBranchNames: async () => null,
      createGmailApi: () => ({}), isValidEmail, normalizeBookingTime, buildReminderSentNotes, createReminderTracking, formatAppointmentReminderEmail,
      GOOGLE_GMAIL_SENDER_EMAIL: 'clinic@example.com',
      getManageBookingUrl: () => 'https://example.com/manage', getConfirmAttendanceUrl: () => 'https://example.com/api/booking?view=confirm-attendance&ref=MTT-101',
      sendGmailMessage: async (_gmail, request) => {
        sends++;
        assert.equal(prepared, failure !== 'prepare');
        assert.match(Buffer.from(request.requestBody.raw, 'base64url').toString(), /multipart\/alternative/);
        return { data: { id: 'gmail-1' } };
      },
      getCustomerEmailStore: () => ({
        async prepare() {
          if (failure === 'prepare') throw new Error('Tracking preparation denied');
          prepared = true;
        },
        async recordSent(token, id) {
          logged++;
          assert.match(token, /^[a-f0-9]{64}$/);
          assert.equal(id, 'gmail-1');
          if (failure === 'log') throw new Error('Tracking table denied');
        },
      }),
      bqUpdateBookingFields: async (_bigquery, id, fields) => {
        notes++;
        assert.equal(id, 'MTT-101');
        assert.match(fields.statusNotes, /Reminder sent at/);
      },
      console: { error() { warnings++; } },
    });
    assert.equal(sends, 1);
    assert.equal(notes, 1);
    assert.equal(warnings, failure === 'none' ? 0 : 1);
    assert.equal(logged, failure === 'prepare' ? 0 : 1);
    assert.equal(res.body.sent, 1);
    assert.equal(res.body.failed, 0);
    assert.equal(res.body.trackingWarnings.join(','), failure === 'none' ? '' : 'MTT-101');
  }
});

test('open-signal endpoint returns an uncached transparent pixel only after persistence and exposes no customer data', async () => {
  const res = response();
  let recorded = false;
  await run('pixel', {
    req: { method: 'GET', query: { token: 'a'.repeat(64) } }, res,
    getCustomerEmailStore: () => ({ recordOpen: async (token) => { assert.equal(token, 'a'.repeat(64)); recorded = true; } }),
  });
  assert.equal(recorded, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'image/gif');
  assert.match(res.headers['Cache-Control'], /no-store/);
  assert.ok(Buffer.isBuffer(res.body));
  assert.equal(res.body.subarray(0, 6).toString(), 'GIF89a');
  const rejected = response();
  await run('pixel', { req: { method: 'POST' }, res: rejected });
  assert.equal(rejected.statusCode, 405);
});

test('tracking read errors are visible without blocking Gmail correspondence', async () => {
  const res = response();
  await run('history', {
    req: { method: 'GET', query: { bookingId: 'MTT-101' } }, res,
    dashboardSession: { role: 'owner' }, createSheetsClient: () => ({}), getBigQueryClient: () => ({}),
    bqFetchBookingRows: async () => ({ data: { values: [['MTT-101', 'Customer', '', 'client@example.com', 'Central']] } }),
    getDashboardBranchNames: async () => null, customerCommunicationAccess,
    getCustomerEmailStore: () => ({ readReminders: async () => { throw new Error('Tracking read denied'); } }),
    createGmailApi: () => ({}), readCustomerEmails: async () => ({ messages: [{ id: 'gmail-1' }], nextPageToken: '' }),
    console: { error() {} },
  });
  assert.equal(res.body.messages[0].id, 'gmail-1');
  assert.match(res.body.trackingError, /customer_email_activity/);
  assert.equal(res.body.historyError, '');
});
