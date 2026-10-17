import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../api/booking.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('booking.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let cancellation;
const accessGuards = [];
function visit(node) {
  if (ts.isIfStatement(node) && node.expression.getText(ast).includes("'staff-cancel-booking'") &&
      !node.expression.getText(ast).includes("'cancel-booking'")) {
    accessGuards.push(node.getText(ast));
  }
  if (ts.isIfStatement(node) && node.expression.getText(ast) === "req.method === 'POST' && ['cancel-booking', 'staff-cancel-booking'].includes(view)") {
    cancellation = node.thenStatement.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(cancellation);

test('staff cancellation requires a dashboard role and same-origin request before reading booking data', async () => {
  assert.equal(accessGuards.length, 2);
  for (const [session, sameOrigin, expected] of [
    [null, true, 401],
    [{ role: 'therapist' }, true, 403],
    [{ role: 'owner' }, false, 403],
    ...['owner', 'branch_manager', 'branch_receptionist'].map((role) => [{ role }, true, 200]),
  ]) {
    const res = {
      setHeader() {},
      status(code) { this.code = code; return this; },
      json(data) { this.data = data; return this; },
    };
    await vm.runInNewContext(`(async () => { ${accessGuards.join('\n')} return res.status(200).json({ allowed: true }); })()`, {
      view: 'staff-cancel-booking', req: { method: 'POST' }, res, dashboardSession: session,
      isSameOriginRequest: () => sameOrigin,
    });
    assert.equal(res.code, expected);
  }
});

async function cancel({ view = 'staff-cancel-booking', body = { bookingId: 'MTT-1' }, changes = {}, allowedBranches = null,
  refundEligible = false, calendarFailure = false, emailFailure = false } = {}) {
  const row = ['MTT-1', 'Client', '4375550101', 'client@example.com', 'Central', 'Massage', 'Tanya',
    '2026-12-01', '10:00 AM', 'Cash', 0, 113, 60, '', '', 'calendar', 'event'];
  row[24] = 'Confirmed';
  Object.assign(row, changes);
  const calls = { updates: [], activities: [], calendar: [], emails: [], refunds: [] };
  const res = {
    status(code) { this.code = code; return this; },
    json(data) { this.data = data; return this; },
  };
  await vm.runInNewContext(`(async () => ${cancellation})()`, {
    req: { method: 'POST', body }, view, res,
    dashboardSession: { email: 'staff@example.com', role: 'branch_receptionist' },
    sheets: {}, PRIMARY_CALENDAR_ID: 'primary',
    getBigQueryClient: () => ({}),
    bqFetchBookingRows: async () => ({ data: { values: [row] } }),
    getDashboardBranchNames: async () => allowedBranches,
    readPackageUsage: (value) => value === 'package' ? {} : null,
    computeBookingRefundEligibility: () => ({ eligible: refundEligible, hoursUntil: refundEligible ? 48 : 12 }),
    bqFindCompletedSquarePaymentsByBookingId: async () => [],
    squareRefundPayment: async (...args) => calls.refunds.push(args),
    bqUpdateBookingFields: async (...args) => calls.updates.push(args),
    logBookingActivity: async (...args) => calls.activities.push(args),
    notifyStaffOfBookingChange: async () => ({ sent: 0, failures: [{ message: 'Staff email unavailable' }] }),
    calendarApi: { events: { delete: async (args) => {
      calls.calendar.push(args);
      if (calendarFailure) throw new Error('Calendar unavailable');
    } } },
    getBusinessProfile: async () => ({ businessName: 'Clinic' }),
    createGmailApi: () => ({}),
    sendFormattedLoyaltyEmail: async (...args) => {
      calls.emails.push(args);
      if (emailFailure) throw new Error('Email unavailable');
    },
    console: { error() {} },
  });
  return { res, calls };
}

test('staff can cancel a phone-only booking in their branch without deleting its record', async () => {
  const { res, calls } = await cancel({ changes: { 3: '' }, allowedBranches: new Set(['central']) });
  assert.equal(res.code, 200);
  assert.equal(res.data.cancelled, true);
  assert.equal(res.data.emailSkipped, true);
  assert.equal(calls.emails.length, 0);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0][2].status, 'Cancelled');
  assert.equal(calls.activities[0][3].actor, 'staff@example.com');
  assert.equal(calls.calendar[0].eventId, 'event');
  assert.equal(res.data.staffNotificationError, 'Staff email unavailable');
});

test('staff cancellation rejects invalid, inaccessible and terminal bookings before side effects', async () => {
  for (const [options, code] of [
    [{ body: {} }, 400],
    [{ body: { bookingId: 'missing' } }, 404],
    [{ allowedBranches: new Set(['another branch']) }, 403],
    ...['Cancelled', 'Completed', 'No Show'].map((status) => [{ changes: { 24: status } }, 409]),
    [{ changes: { 14: 'package' } }, 409],
  ]) {
    const { res, calls } = await cancel(options);
    assert.equal(res.code, code);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.calendar.length, 0);
    assert.equal(calls.emails.length, 0);
  }
});

test('public cancellation still requires a matching email and records the customer actor', async () => {
  for (const body of [{ bookingId: 'MTT-1' }, { bookingId: 'MTT-1', email: 'wrong@example.com' }]) {
    const { res, calls } = await cancel({ view: 'cancel-booking', body });
    assert.equal(res.code, body.email ? 404 : 400);
    assert.equal(calls.updates.length, 0);
  }
  const { res, calls } = await cancel({ view: 'cancel-booking', body: { bookingId: 'MTT-1', email: 'CLIENT@EXAMPLE.COM' } });
  assert.equal(res.code, 200);
  assert.equal(calls.activities[0][3].actor, 'customer');
});

test('cancellation preserves the refund policy and exposes post-cancellation delivery failures', async () => {
  for (const refundEligible of [true, false]) {
    const { res, calls } = await cancel({ changes: { 10: 50 }, refundEligible, calendarFailure: true, emailFailure: true });
    assert.equal(res.code, 200);
    assert.equal(res.data.refundEligible, refundEligible);
    assert.match(res.data.statusNotes, refundEligible ? /refund.*owed/ : /no refund issued/);
    assert.equal(res.data.calendarError, 'Calendar unavailable');
    assert.equal(res.data.emailError, 'Email unavailable');
    assert.equal(calls.updates[0][2].status, 'Cancelled');
  }
});

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const appAst = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let cancelHandler;
function visitApp(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(appAst) === 'cancelCalendarAppointment') {
    cancelHandler = node.initializer.getText(appAst);
  }
  ts.forEachChild(node, visitApp);
}
visitApp(appAst);

function staffUi({ confirmed = true, ok = true } = {}) {
  const booking = { id: 'MTT-1', email: '', status: 'Confirmed' };
  const state = {
    bookings: [booking], selected: { booking }, issued: { booking },
    events: [{ booking }, { booking: { id: 'MTT-2' } }], error: '', notice: '', busy: '', refreshes: 0,
  };
  const requests = [];
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const update = (key) => (value) => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  const handler = vm.runInNewContext(`(${cancelHandler})`, {
    cancellationInProgress: { current: false },
    confirm: () => confirmed,
    tr: (key) => key,
    message: (key, values) => ({ key, values }),
    setCancellingBookingId: update('busy'), setReceiptError: update('error'), setReceiptNotice: update('notice'),
    setBookings: update('bookings'), setSelectedCalendarEvent: update('selected'),
    setIssuedReceipt: update('issued'), setCalendarEvents: update('events'),
    loadBookingsFromBackend: async () => { state.refreshes++; },
    loadCalendar: async () => { state.refreshes++; },
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      await pending;
      return { ok, json: async () => ok
        ? { cancelled: true, statusNotes: 'No payment on file.', calendarError: 'Calendar unavailable' }
        : { message: 'Booking cannot be cancelled.' } };
    },
  });
  return { state, requests, finish, cancel: () => handler(booking) };
}

test('staff cancellation confirms first, prevents duplicate submissions and refreshes all booking surfaces', async () => {
  const declined = staffUi({ confirmed: false });
  await declined.cancel();
  assert.equal(declined.requests.length, 0);
  const ui = staffUi();
  const saving = ui.cancel();
  await ui.cancel();
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].url, '/api/booking?view=staff-cancel-booking');
  assert.equal(ui.requests[0].body.bookingId, 'MTT-1');
  assert.equal(ui.state.busy, 'MTT-1');
  ui.finish();
  await saving;
  assert.equal(ui.state.bookings[0].status, 'Cancelled');
  assert.equal(ui.state.selected.booking.status, 'Cancelled');
  assert.equal(ui.state.issued.booking.status, 'Cancelled');
  assert.equal(ui.state.events.length, 1);
  assert.equal(ui.state.events[0].booking.id, 'MTT-2');
  assert.equal(ui.state.refreshes, 2);
  assert.match(ui.state.error, /Calendar cleanup failed/);
  assert.equal(ui.state.notice.values.details, 'No payment on file.');
  assert.equal(ui.state.busy, '');
});

test('failed staff cancellation stays open, surfaces the API error and preserves the booking', async () => {
  const ui = staffUi({ ok: false });
  const saving = ui.cancel();
  ui.finish();
  await saving;
  assert.equal(ui.state.error, 'Booking cannot be cancelled.');
  assert.equal(ui.state.selected.booking.status, 'Confirmed');
  assert.equal(ui.state.events.length, 2);
  assert.equal(ui.state.refreshes, 0);
  assert.equal(ui.state.busy, '');
});
