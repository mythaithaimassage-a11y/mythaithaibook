import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { AVAILABLE_TIMES } from '../lib/booking-options.js';

const source = readFileSync(new URL('../src/QuickBooking.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'QuickBooking.tsx',
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { exports: module.exports, require: createRequire(import.meta.url) });
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
  assert.match(html, /<option selected="">02:15 PM/);
  assert.match(html, /value="2026-11-01"/);
  assert.doesNotMatch(html, /Off Duty|Inactive Therapist|Inactive service/);
  assert.doesNotMatch(html, /<textarea|type="checkbox"|type="radio"|type="email"|type="tel"/);
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
  assert.equal((app.match(/\{event\.timeRange \|\| event\.localTime\}/g) || []).length, 2);
  assert.match(app, /\{selectedCalendarEvent\.timeRange \|\| selectedCalendarEvent\.localTime\}/);
  assert.match(app, /\['Appointment time', selectedCalendarEvent\.timeRange \|\| selectedCalendarEvent\.localTime\]/);
  assert.match(app, /const hourEvents = visibleCalendarEvents\.filter\(\(event\) => Number\(event\.localTime/);
});

test('optional dollar discount is sent only by receipt issuance and displayed in screen and print receipts', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /Manual discount \(\$\) — optional/);
  assert.match(app, /type="number" min="0" step="0\.01" placeholder="0\.00"/);
  const issueReceipt = app.slice(app.indexOf('const issueReceipt ='), app.indexOf('const markBookingPaid ='));
  assert.match(issueReceipt, /manualDiscount: manualReceiptDiscount/);
  assert.match(issueReceipt, /!selectedCalendarEvent\?\.booking\?\.receiptNumber/);
  const deleteBooking = app.slice(app.indexOf('const deleteBooking ='), app.indexOf('const issueReceipt ='));
  assert.doesNotMatch(deleteBooking, /manualDiscount/);
  assert.match(app, /setManualReceiptDiscount\(''\)/);
  assert.match(app, /issuedReceipt\.receipt\.manualDiscount\.toFixed\(2\)/);
  assert.match(app, /insertAdjacentHTML\('beforebegin', `<div class="row"><span>Manual discount/);
  assert.match(app, /no automatic refund has been issued/);
});
