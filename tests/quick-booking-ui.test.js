import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { AVAILABLE_TIMES, defaultBusinessHours } from '../lib/booking-options.js';
import { validateBookingNote } from '../lib/booking-note.js';
import { createTsLoader } from './helpers/load-ts-module.js';

const source = readFileSync(new URL('../src/QuickBooking.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'QuickBooking.tsx',
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} };
const loadTs = createTsLoader();
const requireWithLocalization = (specifier) => specifier === './localization'
  ? loadTs(new URL('../src/localization.tsx', import.meta.url).pathname)
  : createRequire(import.meta.url)(specifier);
vm.runInNewContext(compiled, { exports: module.exports, require: requireWithLocalization });
const QuickBooking = module.exports.default;

const props = {
  branches: [{ id: 1, name: 'Central' }, { id: 2, name: 'Downtown' }],
  services: [{ id: 1, name: 'Thai Massage' }, { id: 2, name: 'Inactive service', active: false }],
  therapists: [
    { id: 1, name: 'Scheduled Therapist' },
    { id: 2, name: 'Off Duty' },
    { id: 3, name: 'Inactive Therapist', active: false },
    { id: 4, name: 'RMT Therapist', rmtCertified: true },
  ],
  times: AVAILABLE_TIMES,
  date: '2026-11-01', branchId: '2', therapistId: '1', time: '02:15 PM',
  isScheduled: (therapist, branchId, date) => therapist.id !== 2 && branchId === '2' && date === '2026-11-01',
  onClose: () => {},
  onSaved: async () => {},
};
const render = (overrides = {}) => renderToStaticMarkup(React.createElement(QuickBooking, { ...props, ...overrides }));

function customerHarness(fetch) {
  let stateIndex = 0, effectIndex = 0, refIndex = 0;
  const states = [], effects = [], refs = [], pendingEffects = [], timers = new Map();
  let timerId = 0;
  const hooks = {
    ...React,
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ||= { current: initial }; },
    useEffect(callback, deps) {
      const index = effectIndex++;
      if (!effects[index] || deps.some((value, key) => value !== effects[index].deps[key])) {
        pendingEffects.push(() => {
          effects[index]?.cleanup?.();
          effects[index] = { deps, cleanup: callback() };
        });
      }
    },
  };
  const testModule = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: testModule.exports, fetch, URLSearchParams, AbortController,
    setTimeout(callback, delay) { assert.equal(delay, 250); timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    require(specifier) {
      if (specifier === 'react') return hooks;
      if (specifier === './localization') return {
        useTranslation: () => ({ translate: (value) => value, formatTime: (value) => value }),
        message: (key, values) => ({ key, values }),
      };
      return createRequire(import.meta.url)(specifier);
    },
  });
  const walk = (node, predicate) => {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map((child) => walk(child, predicate)).find(Boolean);
    return predicate(node) ? node : walk(node.props?.children, predicate);
  };
  const ui = {
    render() {
      stateIndex = effectIndex = refIndex = 0;
      const tree = testModule.exports.default(props);
      pendingEffects.splice(0).forEach((effect) => effect());
      return tree;
    },
    find(predicate) { return walk(ui.render(), predicate); },
    input() { return ui.find((node) => node.props?.role === 'combobox'); },
    async search(value) {
      ui.input().props.onChange({ target: { value } });
      ui.render();
      await ui.flushTimers();
      return ui.render();
    },
    async flushTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      await Promise.all(callbacks.map((callback) => callback()));
    },
  };
  return ui;
}

test('client name searches by name, email or formatted phone and selection autofills both contact details', async () => {
  const customer = { name: 'Alice Smith', email: 'alice@example.com', phone: '+1 (437) 898-7424' };
  const requests = [];
  const ui = customerHarness(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => options?.method === 'POST' ? { bookingId: 'MTT-test', emailSent: true } : { customers: [customer] } };
  });
  for (const value of ['Alice', 'alice@example.com', '+1 (437) 898-7424']) {
    const tree = await ui.search(value);
    assert.equal(new URL(requests.at(-1).url, 'https://test.example').searchParams.get('search'), value);
    assert.match(renderToStaticMarkup(tree), /Alice Smith/);
    assert.match(renderToStaticMarkup(tree), /alice@example.com/);
    ui.find((node) => node.props?.role === 'option').props.onClick();
    assert.equal(ui.input().props.value, 'Alice Smith');
    assert.equal(ui.input().props['aria-expanded'], false);
    assert.equal(ui.find((node) => node.type === 'input' && node.props.maxLength === 254).props.value, customer.email);
  }
  await ui.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const payload = JSON.parse(requests.at(-1).options.body);
  assert.equal(payload.customerName, customer.name);
  assert.equal(payload.contact, customer.email);
  assert.equal(payload.email, customer.email);
  assert.equal(payload.phone, customer.phone);
  assert.equal(payload.date, props.date);
  assert.equal(payload.branchId, props.branchId);
});

test('customer suggestions support keyboard selection, phone-only contacts and Escape without closing the appointment', async () => {
  const customers = [{ name: 'Phone Client', email: '', phone: '437-898-7424' }];
  const ui = customerHarness(async () => ({ ok: true, json: async () => ({ customers }) }));
  await ui.search('437898');
  let prevented = false;
  ui.input().props.onKeyDown({ key: 'ArrowDown', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(ui.input().props['aria-activedescendant'], 'quick-booking-customer-0');
  ui.input().props.onKeyDown({ key: 'Enter', preventDefault() {} });
  assert.equal(ui.input().props.value, 'Phone Client');
  assert.equal(ui.find((node) => node.type === 'input' && node.props.maxLength === 254).props.value, '437-898-7424');
  await ui.search('Phone');
  let stopped = false;
  ui.input().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(ui.input().props['aria-expanded'], false);
});

test('search failures and no matches are explicit and manual client entry remains available', async () => {
  let failure = true;
  const requests = [];
  const ui = customerHarness(async (url, options) => {
    requests.push({ url, options });
    return { ok: !failure, json: async () => failure ? { message: 'Storage unavailable' } : { customers: [] } };
  });
  assert.match(renderToStaticMarkup(await ui.search('New Client')), /role="alert"[^>]*>Storage unavailable/);
  failure = false;
  assert.match(renderToStaticMarkup(await ui.search('New Client 2')), /No matching customers/);
  ui.find((node) => node.type === 'input' && node.props.maxLength === 254).props.onChange({ target: { value: 'new@example.com' } });
  await ui.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const payload = JSON.parse(requests.at(-1).options.body);
  assert.equal(payload.customerName, 'New Client 2');
  assert.equal(payload.contact, 'new@example.com');
  assert.equal(payload.email, undefined);
  assert.equal(payload.phone, undefined);
});

test('debouncing cancels old requests and stale results cannot replace the current customer search', async () => {
  const requests = [];
  const ui = customerHarness((url, options) => new Promise((resolve) => requests.push({ url, options, resolve })));
  ui.input().props.onChange({ target: { value: 'Ali' } });
  ui.render();
  ui.input().props.onChange({ target: { value: 'Alice' } });
  ui.render();
  const first = ui.flushTimers();
  assert.equal(requests.length, 1);
  ui.input().props.onChange({ target: { value: 'Bob' } });
  ui.render();
  assert.equal(requests[0].options.signal.aborted, true);
  const second = ui.flushTimers();
  requests[1].resolve({ ok: true, json: async () => ({ customers: [{ name: 'Bob', email: 'bob@example.com', phone: '' }] }) });
  await second;
  requests[0].resolve({ ok: true, json: async () => ({ customers: [{ name: 'Alice', email: 'alice@example.com', phone: '' }] }) });
  await first;
  assert.match(renderToStaticMarkup(ui.render()), /bob@example.com/);
  assert.doesNotMatch(renderToStaticMarkup(ui.render()), /alice@example.com/);
  ui.input().props.onChange({ target: { value: '' } });
  ui.render();
  await ui.flushTimers();
  assert.equal(requests.length, 2);
});

test('quick booking renders name, one contact input, therapist and time dropdowns without payment or intake fields', () => {
  const html = render();
  assert.match(html, /<dialog[^>]*aria-labelledby="quick-booking-title"/);
  assert.match(html, /Client name<input[^>]*required=""[^>]*maxLength="150"/);
  assert.match(html, /Email or phone number<input[^>]*required=""/);
  assert.match(html, /Therapist<select required=""/);
  assert.match(html, /Time<select required=""/);
  assert.equal((html.match(/<select/g) || []).length, 4);
  assert.match(html, /<option value="1" selected="">Scheduled Therapist/);
  assert.match(html, /<option value="2" selected="">Downtown/);
  assert.match(html, /<option value="02:15 PM" selected="">02:15 PM/);
  assert.match(html, /value="2026-11-01"/);
  assert.doesNotMatch(html, /Off Duty|Inactive Therapist|Inactive service/);
  assert.doesNotMatch(html, /type="checkbox"|type="radio"|type="email"|type="tel"/);
  assert.match(html, /Internal booking note \(optional\)/);
  assert.match(html, /<textarea maxLength="2000"/);
  assert.match(html, /Save appointment/);
  for (const time of AVAILABLE_TIMES) assert.ok(html.includes(time), `Missing time ${time}`);
});

test('RMT and couple services restrict qualified staff and require a second therapist', () => {
  const rmtHtml = render({ services: [{ id: 3, name: 'RMT Massage', isRmt: true }] });
  assert.doesNotMatch(rmtHtml, /Scheduled Therapist/);
  assert.match(rmtHtml, /RMT Therapist/);
  assert.match(rmtHtml, /<option value="" selected="">Choose therapist/);
  const coupleHtml = render({ services: [{ id: 5, name: 'Couple Massage' }] });
  assert.equal((coupleHtml.match(/<select/g) || []).length, 5);
  assert.match(coupleHtml, /Second therapist<select required=""/);
  const secondSelect = coupleHtml.split('Second therapist')[1].split('</select>')[0];
  assert.doesNotMatch(secondSelect, /Scheduled Therapist/);
  assert.match(secondSelect, /RMT Therapist/);
});

test('an empty scheduled roster displays an explicit error and disables booking', () => {
  const html = render({ isScheduled: () => false });
  assert.match(html, /role="alert"[^>]*>No eligible therapists/);
  assert.match(html, /<button type="submit" disabled=""/);
});

test('quick booking times reflect branch weekday hours, selected service duration and closed days', () => {
  const businessHours = defaultBusinessHours();
  businessHours.sun = { open: '08:15', close: '22:00', closed: false };
  const changes = {
    branches: [{ id: 2, name: 'Downtown', businessHours }],
    services: [{ id: 1, name: 'Massage', duration: 90 }],
  };
  const extended = render(changes);
  assert.match(extended, /value="08:15 AM"/);
  assert.match(extended, /value="08:30 PM"/);
  assert.doesNotMatch(extended, /value="08:45 PM"|value="09:00 PM"/);
  businessHours.sun.closed = true;
  const closed = render(changes);
  assert.match(closed, /No appointment times fit the business hours/);
  assert.match(closed, /<button type="submit" disabled=""/);
  const longService = render({ services: [{ id: 1, name: 'Massage', duration: 120 }] });
  assert.match(longService, /value="06:00 PM"/);
  assert.doesNotMatch(longService, /value="06:15 PM"|value="07:00 PM"/);
});

test('calendar toolbar opens manual booking with search applied to both calendar surfaces', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  for (const label of ['Search appointments', 'Calendar view', 'Calendar filters', 'Calendar settings', 'Quick Sale', 'Appointment', 'Blocked staff time', 'Create New Service']) {
    assert.ok(app.includes(label), `Missing calendar control: ${label}`);
  }
  assert.match(app, /const hourEvents = visibleCalendarEvents\.filter/);
  assert.match(app, /visibleCalendarEvents\.map/);
  assert.match(app, /closest\('details'\)\.open = false; openQuickBooking\(\)/);
  assert.match(source, /view=manual-booking/);
  assert.match(source, /if \(!response\.ok\) throw new Error/);
});

test('schedule new-booking button navigates to the booking calendar and preserves the selected branch', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const schedule = app.slice(app.indexOf('{/* TAB CONTENT: SCHEDULE */}'), app.indexOf("{activeTab === 'calendar' &&"));
  assert.match(schedule, /onClick=\{\(\) => \{\s*setCalendarBranch\(effectiveSelectedBranchId\);\s*setActiveTab\('calendar'\);\s*\}\}/);
  assert.match(schedule, /\{t\.addBooking\}/);
  assert.doesNotMatch(schedule, /openQuickBooking|onNavigateToBookingPortal/);
});

test('daily calendar, agenda and appointment details display the shared start-end range', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.equal((app.match(/\{formatTime\(event\.timeRange \|\| event\.localTime\)\}/g) || []).length, 2);
  assert.match(app, /\{formatTime\(selectedCalendarEvent\.timeRange \|\| selectedCalendarEvent\.localTime\)\}/);
  assert.match(app, /\['Appointment time', selectedCalendarEvent\.timeRange \|\| selectedCalendarEvent\.localTime\]/);
  assert.match(app, /const hourEvents = visibleCalendarEvents\.filter\(\(event\) => Number\(event\.localTime/);
});

test('owner can delete calendar appointments from hover- and focus-revealed controls', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.equal((app.match(/aria-label=\{tr\("Delete appointment \{value0\}"/g) || []).length, 2);
  assert.equal((app.match(/group-hover:opacity-100 group-focus-within:opacity-100/g) || []).length, 2);
  assert.equal((app.match(/dashboardUser\.role === 'owner' && event\.booking\?\.id && <button/g) || []).length, 2);
  const deleteBooking = app.slice(app.indexOf('const deleteBooking ='), app.indexOf('const issueReceipt ='));
  assert.match(deleteBooking, /view=delete-booking/);
  assert.match(deleteBooking, /setCalendarEvents\(\(prev\) => prev\.filter\(\(event\) => event\.booking\?\.id !== bookingId\)\)/);
});

test('manual discount entry is removed while historical discounts remain visible on receipts', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /Manual discount \(\$\) — optional|manualReceiptDiscount/);
  const issueReceipt = app.slice(app.indexOf('const issueReceipt ='), app.indexOf('const markBookingPaid ='));
  assert.match(issueReceipt, /body: JSON\.stringify\(\{ bookingId \}\)/);
  assert.doesNotMatch(issueReceipt, /confirmReconciliation:|manualDiscount:/);
  const deleteBooking = app.slice(app.indexOf('const deleteBooking ='), app.indexOf('const issueReceipt ='));
  assert.doesNotMatch(deleteBooking, /manualDiscount/);
  assert.match(app, /issuedReceipt\.receipt\.manualDiscount\.toFixed\(2\)/);
  assert.match(app, /insertAdjacentHTML\('beforebegin', `<div class="row"><span>\$\{label\('Manual discount'\)\}/);
  assert.match(app, /no automatic refund has been issued/);
});

test('receipts refresh booking records even after email failures without reconciliation entry controls', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /Confirm reconciliation|confirmReceiptReconciliation|setManualReceiptDiscount/);
  const issue = app.slice(app.indexOf('const issueReceipt ='), app.indexOf('const markBookingPaid ='));
  assert.equal((issue.match(/Promise\.all\(\[loadCalendar\(\), loadBookingsFromBackend\(\)\]\)/g) || []).length, 2);
  assert.ok(issue.indexOf('setBookings(') < issue.indexOf('if (!response.ok)'));
});

test('shared internal booking note is wired to booking creation, staff views and therapist details', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../src/BookingNote.tsx', import.meta.url), 'utf8');
  assert.match(source, /date, time: validTime, bookingNote/);
  assert.match(app, /b\.bookingNote/);
  assert.match(app, /event\.booking\?\.bookingNote/);
  assert.match(app, /selectedAppointment\.bookingNote/);
  assert.match(app, /<BookingNote key=\{booking\.id\}/);
  assert.match(editor, /view=booking-note/);
  assert.match(editor, /expectedNote: savedNote/);
  assert.match(editor, /maxLength=\{2000\}/);
  assert.match(editor, /Save booking note/);
});

test('internal booking note validation trims text and rejects invalid or oversized values', () => {
  assert.equal(validateBookingNote(), '');
  assert.equal(validateBookingNote('   '), '');
  assert.equal(validateBookingNote('  Shared reference  '), 'Shared reference');
  assert.equal(validateBookingNote('x'.repeat(2000)).length, 2000);
  for (const value of [null, 42, {}, ['note'], 'x'.repeat(2001)]) {
    assert.throws(() => validateBookingNote(value), (error) => error.statusCode === 400);
  }
});

test('booking note editor displays saved notes, a length limit and internal-only guidance', () => {
  const editorSource = readFileSync(new URL('../src/BookingNote.tsx', import.meta.url), 'utf8');
  const editorCompiled = ts.transpileModule(editorSource, {
    fileName: 'BookingNote.tsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const editorModule = { exports: {} };
  vm.runInNewContext(editorCompiled, { exports: editorModule.exports, require: requireWithLocalization });
  const html = renderToStaticMarkup(React.createElement(editorModule.exports.default, {
    bookingId: 'MTT-note', initialNote: 'Please use the quiet room', onSaved: async () => {},
  }));
  assert.match(html, /Please use the quiet room/);
  assert.match(html, /<textarea maxLength="2000"/);
  assert.match(html, /not customers/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Save booking note/);
});
