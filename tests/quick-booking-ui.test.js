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
let availabilityIssues = [];
const loadTs = createTsLoader();
const requireWithLocalization = (specifier) => {
  if (specifier === './localization') return loadTs(new URL('../src/localization.tsx', import.meta.url).pathname);
  if (specifier === './useTherapistAvailability') return { __esModule: true, default: () => ({
    therapistIds: new Set(['1', '3', '4']), unavailableTherapists: availabilityIssues, loading: false, error: '',
  }) };
  return createRequire(import.meta.url)(specifier);
};
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
  onClose: () => {},
  onSaved: async () => {},
};
const render = (overrides = {}) => renderToStaticMarkup(React.createElement(QuickBooking, { ...props, ...overrides }));

test('quick appointment explains excluded therapists without hiding their names behind a generic warning', () => {
  availabilityIssues = [{ id: 5, name: 'TANYA', reason: 'Time off overlaps this appointment.', conflicts: [
    { source: 'booking', reference: 'MTT-stale', date: '2026-10-18', time: '03:00 PM', durationMinutes: 120 },
    { source: 'calendar', reference: 'calendar-stale', start: '2026-10-18T15:00:00-04:00', end: '2026-10-18T17:00:00-04:00' },
  ] }];
  try {
    const html = render();
    assert.match(html, /Why is a therapist unavailable/);
    assert.match(html, /TANYA:/);
    assert.match(html, /Time off overlaps this appointment/);
    assert.match(html, /Saved booking #MTT-stale/);
    assert.match(html, /03:00 PM/);
    assert.match(html, /120 minutes/);
    assert.match(html, /Calendar event #calendar-stale/);
  } finally {
    availabilityIssues = [];
  }
});

function customerHarness(fetch, overrides = {}) {
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
    exports: testModule.exports, fetch, URLSearchParams, AbortController, Error,
    setTimeout(callback, delay) { assert.equal(delay, 250); timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    require(specifier) {
      if (specifier === 'react') return hooks;
      if (specifier === './localization') return {
        useTranslation: () => ({ translate: (value) => value, formatTime: (value) => value }),
        message: (key, values) => ({ key, values }),
      };
      if (specifier === './useTherapistAvailability') return { __esModule: true, default: () => ({
        therapistIds: new Set(['1', '3', '4']), loading: false, error: '',
      }) };
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
      const tree = testModule.exports.default({ ...props, ...overrides });
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
  assert.equal(payload.contact, undefined);
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
  assert.equal(ui.find((node) => node.type === 'input' && node.props.type === 'email').props.value, '');
  assert.equal(ui.find((node) => node.type === 'input' && node.props.type === 'tel').props.value, '437-898-7424');
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
  assert.equal(payload.contact, undefined);
  assert.equal(payload.email, 'new@example.com');
  assert.equal(payload.phone, '');
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

test('quick booking renders separate email and phone fields, therapist and time dropdowns without payment or intake fields', () => {
  const html = render();
  assert.match(html, /<dialog[^>]*aria-labelledby="quick-booking-title"/);
  assert.match(html, /Client name<input[^>]*required=""[^>]*maxLength="150"/);
  assert.match(html, /Email<input[^>]*type="email"[^>]*required=""/);
  assert.match(html, /Phone<input[^>]*type="tel"[^>]*required=""/);
  assert.match(html, /Enter at least one email address or phone number/);
  assert.match(html, /Therapist<select required=""/);
  assert.match(html, /Time<select required=""/);
  assert.equal((html.match(/<select/g) || []).length, 4);
  assert.match(html, /<option value="1" selected="">Scheduled Therapist/);
  assert.match(html, /<option value="2" selected="">Downtown/);
  assert.match(html, /<option value="02:15 PM" selected="">02:15 PM/);
  assert.match(html, /value="2026-11-01"/);
  assert.doesNotMatch(html, /Off Duty|Inactive Therapist|Inactive service/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /Couple massage \(2 people\)/);
  assert.doesNotMatch(html, /type="radio"/);
  assert.match(html, /Internal booking note \(optional\)/);
  assert.match(html, /<textarea maxLength="2000"/);
  assert.match(html, /Save appointment/);
  for (const time of AVAILABLE_TIMES) assert.ok(html.includes(time), `Missing time ${time}`);
});

test('date-specific availability allows a therapist outside her regular weekly branch schedule', async () => {
  const requests = [];
  const ui = customerHarness(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ bookingId: 'override-booking', emailSkipped: true }) };
  }, {
    date: '2026-10-18', branchId: '2', time: '01:00 PM',
    services: [{ id: 1, name: 'Thai Traditional Massage (2 hr)', duration: 120 }],
    therapists: [{ id: 1, name: 'Extra shift therapist', branches: [1], schedule: { sun: 1 } }],
  });
  const html = renderToStaticMarkup(ui.render());
  assert.match(html, /value="1" selected="">Extra shift therapist/);
  assert.doesNotMatch(html, /No eligible therapists/);
  ui.input().props.onChange({ target: { value: 'Test Client' } });
  ui.find((node) => node.props.type === 'tel').props.onChange({ target: { value: '437-898-7424' } });
  assert.equal(ui.find((node) => node.type === 'button' && node.props.type === 'submit').props.disabled, false);
  await ui.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const payload = JSON.parse(requests.at(-1).options.body);
  assert.equal(payload.therapistId, '1');
  assert.equal(payload.branchId, '2');
  assert.equal(payload.date, '2026-10-18');
  assert.equal(payload.time, '01:00 PM');
});

test('either contact field satisfies the requirement; both are accepted and validated when present', async () => {
  for (const [email, phone] of [
    ['', ''], ['client@example.com', ''], ['', '437-898-7424'],
    [' Client@Example.com ', '+1 (437) 898-7424'],
    ['invalid@email', '437-898-7424'], ['client@example.com', '123'],
  ]) {
    const requests = [];
    const ui = customerHarness(async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ bookingId: 'new-booking', emailSent: true }) };
    });
    ui.input().props.onChange({ target: { value: 'New Client' } });
    ui.find((node) => node.props.type === 'email').props.onChange({ target: { value: email } });
    ui.find((node) => node.props.type === 'tel').props.onChange({ target: { value: phone } });
    assert.equal(ui.find((node) => node.props.type === 'email').props.required, !phone.trim());
    assert.equal(ui.find((node) => node.props.type === 'tel').props.required, !email.trim());
    await ui.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
    if ((!email && !phone) || email === 'invalid@email' || phone === '123') {
      assert.equal(requests.length, 0, 'Invalid contact details must not be submitted');
      assert.match(renderToStaticMarkup(ui.render()), /role="alert"/);
    } else {
      const payload = JSON.parse(requests[0].options.body);
      assert.equal(payload.email, email.trim().toLowerCase());
      assert.equal(payload.phone, phone);
    }
  }
});

test('both autofilled contact fields stay editable without losing the other contact value', async () => {
  const requests = [];
  const customer = { name: 'Alice Smith', email: 'alice@example.com', phone: '437-898-7424' };
  const ui = customerHarness(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => options?.method === 'POST' ? { bookingId: 'new-booking' } : { customers: [customer] } };
  });
  await ui.search('Alice');
  ui.find((node) => node.props.role === 'option').props.onClick();
  ui.find((node) => node.props.type === 'email').props.onChange({ target: { value: 'changed@example.com' } });
  assert.equal(ui.find((node) => node.props.type === 'tel').props.value, customer.phone);
  ui.find((node) => node.props.type === 'tel').props.onChange({ target: { value: '416-555-1234' } });
  await ui.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const payload = JSON.parse(requests.at(-1).options.body);
  assert.equal(payload.email, 'changed@example.com');
  assert.equal(payload.phone, '416-555-1234');
});

test('RMT and couple services restrict qualified staff and require a second therapist', () => {
  const rmtHtml = render({ services: [{ id: 3, name: 'RMT Massage', isRmt: true }] });
  assert.doesNotMatch(rmtHtml, /Scheduled Therapist/);
  assert.match(rmtHtml, /RMT Therapist/);
  assert.match(rmtHtml, /<option value="" selected="">Choose therapist/);
  const coupleHtml = render({ services: [{ id: 5, name: 'Couple Massage', duration: 60 }] });
  assert.equal((coupleHtml.match(/<select/g) || []).length, 5);
  assert.match(coupleHtml, /Second therapist<select required=""/);
  const secondSelect = coupleHtml.split('Second therapist')[1].split('</select>')[0];
  assert.doesNotMatch(secondSelect, /Scheduled Therapist/);
  assert.match(secondSelect, /RMT Therapist/);
});

test('couple checkbox selects an existing package of matching duration and submits one shared appointment time', async () => {
  const requests = [];
  const ui = customerHarness(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ bookingId: 'MTT-couple', emailSkipped: true }) };
  }, {
    services: [
      { id: 1, name: 'Single massage (90 min)', duration: 90, price: 150 },
      { id: 5, name: 'Couple massage (60 min)', duration: 60, price: 185 },
      { id: 6, name: 'Couple massage (90 min)', duration: 90, price: 275 },
      { id: 7, name: 'Couple massage (120 min)', duration: 120, price: 350 },
      { id: 8, name: 'Inactive couple massage (60 min)', duration: 60, active: false },
    ],
  });
  const checkbox = () => ui.find((node) => node.type === 'input' && node.props.type === 'checkbox');
  const serviceSelect = () => ui.find((node) => node.type === 'select' && node.props.children?.some?.(
    (child) => child?.type === 'option' && child.props.children === 'Choose a couple package'));
  assert.equal(checkbox().props.checked, false);
  checkbox().props.onChange({ target: { checked: true } });
  let html = renderToStaticMarkup(ui.render());
  assert.equal(checkbox().props.checked, true);
  assert.match(html, /value="6" selected="">Couple massage \(90 min\) - \$275\.00/);
  assert.match(html, /value="5">Couple massage \(60 min\) - \$185\.00/);
  assert.doesNotMatch(html, /Single massage|120 min|Inactive couple/);
  assert.match(html, /Second therapist<select required=""/);
  const secondTherapist = () => ui.find((node) => node.type === 'select' && node.props.children?.some?.(
    (child) => child?.type === 'option' && child.props.children === 'Choose a different therapist'));
  secondTherapist().props.onChange({ target: { value: '4' } });
  ui.find((node) => node.props.type === 'tel').props.onChange({ target: { value: '437-898-7424' } });
  await ui.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const payload = JSON.parse(requests.at(-1).options.body);
  assert.equal(payload.serviceId, '6');
  assert.equal(payload.therapistId, '1');
  assert.equal(payload.therapistId2, '4');
  assert.equal(payload.time, props.time);
  assert.equal(payload.date, props.date);
  assert.equal(payload.subtotalAmount, undefined, 'Package price is resolved by the server catalogue');
  serviceSelect().props.onChange({ target: { value: '5' } });
  assert.equal(secondTherapist().props.value, '', 'Changing the package clears the second therapist');
  assert.match(renderToStaticMarkup(ui.render()), /<button type="submit" disabled=""/);
  checkbox().props.onChange({ target: { checked: false } });
  html = renderToStaticMarkup(ui.render());
  assert.match(html, /Single massage \(90 min\)/);
  assert.doesNotMatch(html, /Second therapist<select/);
});

test('couple booking reports missing packages and insufficient simultaneous therapists', () => {
  const ui = customerHarness(async () => ({ ok: true, json: async () => ({}) }));
  ui.find((node) => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  const noPackages = renderToStaticMarkup(ui.render());
  assert.match(noPackages, /No active 60- or 90-minute couple packages are available/);
  assert.match(noPackages, /<button type="submit" disabled=""/);
  const insufficientStaff = render({
    services: [{ id: 5, name: 'Couple massage (60 min)', duration: 60, price: 185 }],
    therapists: [props.therapists[0]],
  });
  assert.match(insufficientStaff, /Two different therapists must be available at the same time/);
  assert.match(insufficientStaff, /<button type="submit" disabled=""/);
});

test('a roster with no available therapists displays an explicit error and disables booking', () => {
  const html = render({ therapists: [props.therapists[1]] });
  assert.match(html, /role="alert"[^>]*>No eligible therapists/);
  assert.match(html, /<button type="submit" disabled=""/);
});

test('dashboard quick booking ignores public hours and closed weekdays but keeps visits within the day', () => {
  const businessHours = defaultBusinessHours();
  businessHours.sun = { open: '08:15', close: '22:00', closed: false };
  const changes = {
    branches: [{ id: 2, name: 'Downtown', businessHours }],
    services: [{ id: 1, name: 'Massage', duration: 90 }],
  };
  const extended = render(changes);
  assert.match(extended, /value="08:15 AM"/);
  assert.match(extended, /value="12:00 AM"/);
  assert.match(extended, /value="10:30 PM"/);
  assert.doesNotMatch(extended, /value="10:45 PM"/);
  businessHours.sun.closed = true;
  const closed = render(changes);
  assert.match(closed, /value="06:00 AM"/);
  assert.match(closed, /value="10:30 PM"/);
  assert.doesNotMatch(closed, /No appointment times fit the business hours/);
  const longService = render({ services: [{ id: 1, name: 'Massage', duration: 120 }] });
  assert.match(longService, /value="10:00 PM"/);
  assert.doesNotMatch(longService, /value="10:15 PM"/);
});

test('calendar toolbar opens manual booking with search applied to both calendar surfaces', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  for (const label of ['Search appointments', 'Calendar view', 'Calendar filters', 'Calendar settings', 'Quick Sale', 'Appointment', 'Blocked staff time', 'Create New Service']) {
    assert.ok(app.includes(label), `Missing calendar control: ${label}`);
  }
  assert.match(app, /const hourEvents = visibleCalendarEvents\.filter/);
  assert.match(app, /<AppointmentList bookings=\{agendaBookings\}/);
  assert.match(app, /closest\('details'\)\.open = false; openQuickBooking\(\)/);
  assert.match(source, /view=manual-booking/);
  assert.match(source, /if \(!response\.ok\) throw new Error/);
});

test('booking calendar can be fitted to the viewport and exits on browser fullscreen changes', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /ref=\{calendarPanelRef\} className=\{calendarFullscreen/);
  assert.match(app, /typeof panel\.requestFullscreen === 'function'/);
  assert.match(app, /await panel\.requestFullscreen\(\)/);
  assert.match(app, /document\.exitFullscreen\(\)/);
  assert.match(app, /document\.addEventListener\('fullscreenchange', syncFullscreenState\)/);
  assert.match(app, /aria-label=\{tr\(calendarFullscreen \? 'Exit fullscreen calendar' : 'Fit calendar to screen'\)\}/);
  assert.match(app, /h-dvh flex-col gap-3 overflow-hidden bg-white/);
  assert.match(app, /calendarFullscreen \? 'min-h-0 flex-1 overflow-y-auto' : 'max-h-\[620px\] overflow-y-auto'/);
  assert.match(app, /calendarFullscreen \? 'min-h-0 flex-1 overflow-auto' : 'max-h-\[680px\] overflow-auto'/);
  assert.match(app, /calendarFullscreenError && <p role="alert"/);
});

test('saving a quick booking does not filter the calendar to the booked therapist', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const saveHandler = app.slice(app.indexOf('{quickBooking && <QuickBooking'), app.indexOf('{/* TAB CONTENT: SERVICES CATALOGUE MANAGER */}'));
  assert.match(saveHandler, /setCalendarBranch\(branchId\)/);
  assert.doesNotMatch(saveHandler, /setCalendarTherapist\(therapistId\)/);
  assert.match(saveHandler, /date === calendarDate && branchId === calendarBranch\) await loadCalendar\(\)/);
});

test('appointment details render inside the fullscreen calendar rather than behind it', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /import \{ createPortal \} from 'react-dom'/);
  const start = app.indexOf('{selectedCalendarEvent && createPortal(');
  assert.ok(start >= 0, 'Appointment details must be rendered through a portal');
  const details = app.slice(start, app.indexOf('</main>', start));
  assert.match(details, /role="dialog" aria-modal="true" aria-labelledby="appointment-receipt-title"/);
  assert.match(details, /calendarFullscreen && calendarPanelRef\.current \? calendarPanelRef\.current : document\.body/);
  assert.match(details, /aria-label=\{tr\("Close appointment details"\)\}/);
  assert.match(details, /setSelectedCalendarEvent\(null\)/);
  assert.doesNotMatch(details, /exitFullscreen/);
});

test('schedule new-booking button navigates to the booking calendar and preserves the selected branch', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const schedule = app.slice(app.indexOf('{/* TAB CONTENT: SCHEDULE */}'), app.indexOf("{activeTab === 'calendar' &&"));
  assert.match(schedule, /onClick=\{\(\) => \{\s*setCalendarBranch\(effectiveSelectedBranchId\);\s*setActiveTab\('calendar'\);\s*\}\}/);
  assert.match(schedule, /aria-label=\{t\.addBooking\}/);
  assert.doesNotMatch(schedule, /openQuickBooking|onNavigateToBookingPortal/);
});

test('daily calendar, agenda and appointment details display the shared start-end range', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const list = readFileSync(new URL('../src/AppointmentList.tsx', import.meta.url), 'utf8');
  assert.match(list, /formatTime\(booking\.timeRange \|\| booking\.time\)/);
  assert.match(app, /<AppointmentList bookings=\{agendaBookings\}/);
  assert.match(app, /\{formatTime\(selectedCalendarEvent\.timeRange \|\| selectedCalendarEvent\.localTime\)\}/);
  assert.match(app, /\['Appointment time', selectedCalendarEvent\.timeRange \|\| selectedCalendarEvent\.localTime\]/);
  assert.match(app, /const hourEvents = visibleCalendarEvents\.filter\(\(event\) => Number\(event\.localTime/);
});

test('owner can delete calendar appointments from hover- and focus-revealed controls', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.equal((app.match(/aria-label=\{tr\("Delete appointment \{value0\}"/g) || []).length, 1);
  const list = readFileSync(new URL('../src/AppointmentList.tsx', import.meta.url), 'utf8');
  assert.match(list, /aria-label=\{tr\('Delete appointment \{value0\}'/);
  assert.equal((app.match(/group-hover:opacity-100 group-focus-within:opacity-100/g) || []).length, 1);
  assert.equal((app.match(/dashboardUser\.role === 'owner' && event\.booking\?\.id && <button/g) || []).length, 1);
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
  const list = readFileSync(new URL('../src/AppointmentList.tsx', import.meta.url), 'utf8');
  assert.match(source, /date, time: validTime, bookingNote/);
  assert.match(list, /booking\.bookingNote/);
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

test('calendar offers a couple massage filter that narrows the visible appointments', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /filterCoupleCalendarEvents/);
  assert.match(app, /const \[calendarCoupleFilter, setCalendarCoupleFilter\] = useState\('all'\)/);
  assert.match(app, /const visibleCalendarEvents = filterCoupleCalendarEvents\(calendarEvents, calendarCoupleFilter\)/);
  const toolbar = app.slice(app.indexOf('{calendarFiltersOpen && <label'), app.indexOf('{calendarFullscreenError'));
  assert.match(toolbar, /tr\("Couple massage"\)/);
  assert.match(toolbar, /<option value="couple">\{tr\("Couple massage only"\)\}<\/option>/);
  assert.match(toolbar, /<option value="unpaired">\{tr\("Couple massage without a partner"\)\}<\/option>/);
  assert.match(toolbar, /calendarCoupleFilter !== 'all'/);
});
