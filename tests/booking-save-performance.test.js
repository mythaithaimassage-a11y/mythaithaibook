import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const api = readFileSync(new URL('../api/booking.js', import.meta.url), 'utf8');
const start = api.indexOf('const [dayEvents, savedBookings] =');
const end = api.indexOf('const bookingStartIndex', start);
assert.ok(start >= 0 && end > start);

function conflictReads(calendar, database) {
  const calls = [];
  const result = vm.runInNewContext(`(async () => {
    ${api.slice(start, end)}
    return { dayEvents, bookingRows };
  })()`, {
    calendarId: 'primary', payload: { date: '2026-11-01' },
    calendarApi: { events: { list(options) { calls.push('calendar'); assert.equal(options.timeMin, '2026-11-01T00:00:00Z'); return calendar.promise; } } },
    getBigQueryClient: () => ({}),
    bqFetchBookingRows() { calls.push('database'); return database.promise; },
  });
  return { calls, result };
}

test('calendar and database conflict reads start together and both must finish', async () => {
  const calendar = deferred(), database = deferred();
  const { calls, result } = conflictReads(calendar, database);
  assert.deepEqual(calls, ['calendar', 'database']);
  let finished = false;
  result.then(() => { finished = true; });
  calendar.resolve({ data: { items: [] } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false, 'Saving must still wait for the database conflict check');
  const rows = [['booking']];
  database.resolve({ data: { values: rows } });
  assert.equal((await result).bookingRows, rows);
});

test('failure of either conflict source rejects saving rather than treating it as availability', async () => {
  for (const failedSource of ['calendar', 'database']) {
    const calendar = deferred(), database = deferred();
    const { result } = conflictReads(calendar, database);
    const failure = new Error(`${failedSource} unavailable`);
    const rejected = assert.rejects(result, (error) => error === failure);
    if (failedSource === 'calendar') {
      calendar.reject(failure);
      database.resolve({ data: { values: [] } });
    } else {
      database.reject(failure);
      calendar.resolve({ data: { items: [] } });
    }
    await rejected;
  }
});

test('post-save calendar and booking-list refreshes run together without dropping either refresh', async () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'QuickBooking') {
      handler = node.attributes.properties.find((attribute) => attribute.name?.getText(ast) === 'onSaved').initializer.expression.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(handler);
  for (const sameContext of [true, false]) {
    const calendar = deferred(), database = deferred(), calls = [];
    const compiled = ts.transpileModule(`(${handler})({ date: '2026-11-01', branchId: '1', notice: 'Saved' })`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const result = vm.runInNewContext(compiled, {
      activeTab: 'calendar', calendarDate: sameContext ? '2026-11-01' : '2026-11-02', calendarBranch: '1',
      setQuickBooking() {}, setQuickBookingNotice() {}, setActiveTab() {}, setCalendarDate() {}, setCalendarBranch() {},
      loadCalendar() { calls.push('calendar'); return calendar.promise; },
      loadBookingsFromBackend() { calls.push('bookings'); return database.promise; },
    });
    assert.deepEqual(calls, sameContext ? ['calendar', 'bookings'] : ['bookings']);
    calendar.resolve(true);
    database.resolve(true);
    await result;
  }
});
