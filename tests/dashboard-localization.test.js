import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import ReactDOM from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import vm from 'node:vm';
import postcss from 'postcss';
import { createTsLoader } from './helpers/load-ts-module.js';

const appPath = new URL('../src/App.tsx', import.meta.url).pathname;
const localizationPath = new URL('../src/localization.tsx', import.meta.url).pathname;
const source = readFileSync(appPath, 'utf8');
const ast = ts.createSourceFile(appPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const portal = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'AdminPortal');
function stateNames(component) {
  return component.body.statements.flatMap((statement) => {
  if (!ts.isVariableStatement(statement)) return [];
  return statement.declarationList.declarations.flatMap((declaration) =>
    ts.isCallExpression(declaration.initializer) && declaration.initializer.expression.getText(ast) === 'useState'
      ? [declaration.name.elements[0].name.text] : []);
  });
}
const states = stateNames(portal);
let activeStates = states;
let fixtures = {};
let stateIndex = 0;
const load = createTsLoader({
  react: {
    ...React,
    useState(initial) {
      const name = activeStates[stateIndex++];
      return React.useState(Object.prototype.hasOwnProperty.call(fixtures, name) ? fixtures[name] : initial);
    },
  },
  'react-dom': {
    ...ReactDOM,
    createPortal: (node) => node,
  },
  './useTherapistAvailability': {
    __esModule: true,
    default: () => ({ therapistIds: new Set(['1', '2', '3', '4', '5']), loading: false, error: '' }),
  },
});
const { AdminPortal, AdminGate, BodyAreaMap } = load(appPath, '\nexport { AdminPortal, AdminGate, BodyAreaMap };\n');
const { LanguageProvider, translateText, localizeTimeLabel, message, createTranslator } = load(localizationPath);
const booking = {
  id: 'MTT-THAI-1', customerName: 'English Customer', phone: '437-555-0101', email: 'client@example.com',
  branchName: 'Central Branch', therapistName: 'Tanya', serviceName: 'Thai Traditional Massage (60 min)',
  date: '2026-10-10', time: '11:00 AM - 12:00 PM', durationMinutes: 60,
  total: 107.35, paidAmount: 107.35, bookingNote: 'Keep this staff note in English',
};
const props = {
  branches: [{ id: 1, name: 'Central Branch', address: 'Toronto', active: true }],
  services: [{ id: 1, name: booking.serviceName, category: 'Thai Traditional', duration: 60, price: 95, taxRate: .13 }],
  therapists: [{ id: 1, name: 'Tanya', branches: [1], schedule: {}, active: true }],
  bookings: [booking], selectedBranchId: 'all', dashboardUser: { role: 'owner', branchIds: [] },
  onBranchesChange() {}, onServicesChange() {}, onTherapistsChange() {}, setBookings() {},
  setSelectedBranchId() {}, setLang() {},
};
function render(tab, language = 'th', overrides = {}, propOverrides = {}) {
  fixtures = { activeTab: tab, hasLoadedBusinessProfile: true, ...overrides };
  activeStates = states;
  stateIndex = 0;
  return renderToStaticMarkup(React.createElement(LanguageProvider, { language },
    React.createElement(AdminPortal, { ...props, lang: language, ...propOverrides })));
}

test('owner navigation retains each section once and identifies the current page', () => {
  const html = render('schedule', 'en', { mobileNavOpen: true });
  const shortcuts = html.match(/<nav aria-label="(?:Owner|Staff) dashboard shortcuts"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(shortcuts);
  assert.match(shortcuts, /aria-current="page"[^>]*>[\s\S]*?Home/);
  assert.match(shortcuts, /Booking Calendar/);
  assert.match(shortcuts, /Sales &amp; reports/);
  assert.match(shortcuts, /aria-expanded="true" aria-controls="mobile-dashboard-menu"/);
  const menu = html.match(/<nav id="mobile-dashboard-menu"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(menu);
  for (const section of ['Workspace', 'Manage', 'Grow']) assert.match(menu, new RegExp(`aria-label="${section}"`));
  assert.equal((menu.match(/<button /g) || []).length, 20);
  assert.equal((menu.match(/aria-current="page"/g) || []).length, 1);
  assert.doesNotMatch(menu, /Events &amp; bookings/);
  assert.doesNotMatch(html, /Events &amp; bookings/);
  assert.match(menu, /Alerts/);
  assert.match(menu, /Dashboard access/);
  assert.match(menu, /Therapist approvals/);
  assert.doesNotMatch(render('schedule', 'en'), /<nav id="mobile-dashboard-menu"/);
  const thai = render('schedule', 'th', { mobileNavOpen: true });
  assert.match(thai, /ทางลัดแผงควบคุมเจ้าของ/);
  assert.match(thai, /เมนูทั้งหมด/);
});

test('branch migration button is shown only until BigQuery becomes the source of truth', () => {
  const owner = { dashboardUser: { role: 'owner', branchIds: [] } };
  const beforeImport = render('branches', 'en', {}, { ...owner, branchConfigSource: 'sheets' });
  assert.match(beforeImport, /One-time import to BigQuery/);
  assert.match(beforeImport, /After import, BigQuery becomes the source of truth/);
  const afterImport = render('branches', 'en', {}, { ...owner, branchConfigSource: 'bigquery' });
  assert.match(afterImport, /BigQuery source of truth/);
  assert.doesNotMatch(afterImport, /One-time import to BigQuery/);
});

test('all staff roles get icon-first mobile shortcuts without gaining unauthorized sections', () => {
  for (const [role, sections] of [['owner', 20], ['branch_manager', 6], ['branch_receptionist', 4]]) {
    const html = render('schedule', 'en', { compactCalendar: true, mobileNavOpen: true }, {
      dashboardUser: { role, branchIds: ['1'] },
    });
    const shortcuts = html.match(/<nav aria-label="(?:Owner|Staff) dashboard shortcuts"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(shortcuts);
    const buttons = shortcuts.match(/<button[\s\S]*?<\/button>/g);
    assert.equal(buttons.length, role === 'branch_receptionist' ? 4 : 5);
    for (const button of buttons) {
      assert.match(button, /aria-label="[^"]+"/);
      assert.match(button, /title="[^"]+"/);
      assert.match(button, /<span class="sr-only">/);
    }
    const menu = html.match(/<nav id="mobile-dashboard-menu"[\s\S]*?<\/nav>/)?.[0];
    assert.equal((menu.match(/<button /g) || []).length, sections);
    if (role !== 'owner') assert.doesNotMatch(menu, /Service catalogue|Patient Summary|Email marketing|Therapist approvals/);
    assert.match(html, /<details><summary class="calendar-context-toggle/);
  }
});

test('all dashboard sections retain a current title and usable mobile navigation', () => {
  for (const tab of [
    'schedule', 'calendar', 'alerts', 'reports', 'services', 'staff', 'branches',
    'availability', 'work-schedule', 'patient-history', 'wix-contacts', 'wix-bookings',
    'packages', 'therapist-approvals', 'dashboard-users', 'business-profile',
    'loyalty', 'marketing', 'google-ads', 'reviews',
  ]) {
    for (const language of ['en', 'th']) {
      const html = render(tab, language, { compactCalendar: true });
      assert.ok(html.includes(`data-section="${tab}"`), tab);
      assert.match(html, /class="dashboard-page-title /);
      assert.match(html, /class="dashboard-shortcuts /);
      assert.doesNotMatch(html, /id="mobile-dashboard-menu"/);
    }
  }
  const service = render('services', 'en', { compactCalendar: true });
  assert.match(service, /mobile-data-table/);
  for (const label of ['Service Name', 'Duration (min)', 'Price ($)', 'Active']) assert.ok(service.includes(label));
  assert.match(render('patient-history', 'en', { compactCalendar: true }), /Confidential health information/);
});

test('expanded mobile calendar retains one permission-filtered navigation and menu inside its panel', () => {
  for (const [role, sections] of [['owner', 20], ['branch_manager', 6], ['branch_receptionist', 4]]) {
    const html = render('calendar', 'en', { compactCalendar: true, calendarFullscreen: true, mobileNavOpen: true }, {
      dashboardUser: { role, branchIds: ['1'] },
    });
    assert.equal((html.match(/id="mobile-dashboard-menu"/g) || []).length, 1);
    assert.equal((html.match(/aria-label="(?:Owner|Staff) dashboard shortcuts"/g) || []).length, 1);
    const panel = html.slice(html.indexOf('booking-calendar calendar-fullscreen'));
    const menu = panel.match(/<nav id="mobile-dashboard-menu"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(menu);
    assert.equal((menu.match(/<button /g) || []).length, sections);
    assert.match(panel, /aria-label="(?:Owner|Staff) dashboard shortcuts"/);
    assert.match(panel, /aria-label="Previous day"/);
    assert.match(panel, /aria-label="Next day"/);
    if (role !== 'owner') assert.doesNotMatch(menu, /Service catalogue|Patient Summary|Email marketing|Therapist approvals/);
    if (role === 'branch_receptionist') assert.doesNotMatch(menu, /Sales &amp; reports/);
  }
});

test('mobile therapist filter is visible without expanding filters and retains its selection', () => {
  const filter = (html) => html.match(/<label class="text-xs font-semibold text-stone-600">Therapist<select[\s\S]*?<\/select>/g) || [];
  const mobile = render('calendar', 'en', { compactCalendar: true, calendarFiltersOpen: false });
  assert.equal(filter(mobile).length, 1);
  assert.match(filter(mobile)[0], /value="all" selected/);
  assert.match(filter(mobile)[0], /<option value="1">Tanya<\/option>/);
  const selected = render('calendar', 'en', { compactCalendar: true, calendarTherapist: '1' });
  assert.match(filter(selected)[0], /value="1" selected/);
  assert.equal(filter(render('calendar', 'en', { compactCalendar: true, calendarFiltersOpen: true })).length, 1);
  assert.equal(filter(render('calendar', 'en', { compactCalendar: false, calendarFiltersOpen: false })).length, 0);
  assert.equal(filter(render('calendar', 'en', { compactCalendar: false, calendarFiltersOpen: true })).length, 1);
});

test('appointment settings migration button disappears after BigQuery takes over', () => {
  const beforeImport = render('branches', 'en', { appointmentConfigSource: 'sheets' });
  assert.match(beforeImport, /Appointment settings storage/);
  assert.match(beforeImport, /One-time import appointment settings/);
  assert.match(beforeImport, /services, therapists, therapist work schedules, unavailability blocks, and saved therapist identity mappings/);
  const afterImport = render('branches', 'en', { appointmentConfigSource: 'bigquery' });
  assert.match(afterImport, /BigQuery source of truth/);
  assert.doesNotMatch(afterImport, /One-time import appointment settings/);
});

test('business profile configures appointment gaps and the calendar offers therapist columns', () => {
  assert.match(source, /const \[calendarViewMode, setCalendarViewMode\] = useState\('auto'\)/);
  assert.match(source, /Therapist gap after appointments \(minutes\)/);
  assert.match(source, /min=\{field\.min\}[\s\S]*max=\{field\.max\}[\s\S]*step=\{field\.step\}/);
  assert.match(source, /resolvedCalendarViewMode === 'therapists'/);
  assert.match(source, /gridTemplateColumns: `56px repeat\(\$\{calendarColumnTherapists\.length/);
  assert.match(source, /minmax\(128px, 220px\)/);
  assert.match(source, /Next available \(60 min\)/);
  assert.match(source, /available-therapists&\$\{query\}/);
  assert.match(source, /calendarNextAvailability\?\.therapistId === 'any'/);
  assert.match(source, /therapistNames\.join\(', '\)/);
  assert.match(source, /No availability in the next 14 days/);
  assert.match(source, /Buffer · \{value0\} min/);
});

test('dashboard KPIs are scoped to sales, bookings and calendar context', () => {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);
  const bookings = [
    { ...booking, date: today, total: 113, status: 'Confirmed' },
    { ...booking, id: 'MTT-RMT-TODAY', date: today, serviceName: 'Registered Massage Therapy (RMT 60 min)', total: 120, status: 'Confirmed' },
    { ...booking, id: 'MTT-CASH-TODAY', date: today, paymentOption: 'Cash', total: 22, status: 'Confirmed' },
    { ...booking, id: 'MTT-TOMORROW', date: tomorrowDate, total: 120, status: 'Confirmed' },
    { ...booking, id: 'MTT-UNASSIGNED', date: tomorrowDate, therapistName: '', total: 95, status: 'Confirmed' },
    { ...booking, id: 'MTT-CANCELLED', date: tomorrowDate, status: 'Cancelled' },
  ];
  const propsWithBookings = { bookings };

  const home = render('schedule', 'en', {}, propsWithBookings);
  assert.match(home, /Bookings Today/);
  assert.match(home, /Upcoming bookings/);
  assert.match(home, /Bookings Today<\/div>[\s\S]*?text-2xl font-bold tracking-tight text-slate-900">3<\/div>/);
  assert.match(home, /Upcoming bookings<\/div>[\s\S]*?text-2xl font-bold tracking-tight text-slate-900">2<\/div>/);
  assert.doesNotMatch(home, /Revenue Today|HST Tax Collected/);

  const reports = render('reports', 'en', {}, propsWithBookings);
  assert.match(reports, /Revenue Today/);
  assert.match(reports, /HST Tax Collected/);
  assert.match(reports, /Revenue Today<\/div>[\s\S]*?text-2xl font-bold tracking-tight text-emerald-900">\$255\.00<\/div>/);
  assert.match(reports, /HST Tax Collected<\/div>[\s\S]*?text-2xl font-bold tracking-tight text-slate-900">\$13\.00<\/div>/);
  assert.doesNotMatch(reports, /Upcoming bookings/);

  const calendar = render('calendar', 'en', { calendarDate: today }, propsWithBookings);
  assert.match(calendar, /Appointments on selected date/);
  assert.match(calendar, /Therapists booked/);
  assert.match(calendar, /Unassigned appointments/);
  assert.match(calendar, /Set therapist availability today/);
  assert.doesNotMatch(calendar, /Revenue Today|HST Tax Collected/);
});

test('calendar counts only real individual therapists and treats automatic selection as unassigned', () => {
    const date = '2026-10-11';
    const therapists = ['Tanya', 'Sukas', 'Janry', 'Tun', 'Fifth therapist']
      .map((name, index) => ({ id: index + 1, name, active: true, branches: [1], schedule: {} }));
    const bookings = [
      ...therapists.map((therapist, index) => ({ ...booking, id: `named-${index}`, date, therapistName: therapist.name })),
      { ...booking, id: 'automatic', date, therapistName: 'Any Available' },
      { ...booking, id: 'couple', date, therapistName: 'Tanya, Sukas' },
    ];
    const html = render('calendar', 'en', {
      calendarDate: date, calendarViewMode: 'therapists',
      calendarEvents: [{ id: 'automatic-event', therapistName: 'Any Available', localTime: '11:00', summary: 'Unassigned booking' }],
    }, { therapists, bookings });
    assert.match(html, /Therapists booked<\/div>[\s\S]*?text-2xl[^>]*>5<\/div>/);
    assert.match(html, /Unassigned appointments<\/div>[\s\S]*?text-2xl[^>]*>1<\/div>/);
    assert.match(source, /aria-controls="any-therapist-next-availability"/);
});

test('today availability shortcut displays the Work Schedule shift graphic for the selected branch', () => {
  const todayTranslator = createTranslator('en');
  const todayScheduleLoader = createTsLoader({
    react: React,
    './localization': { useTranslation: () => ({ translate: todayTranslator }) },
  });
  const { default: TodayWorkSchedule } = todayScheduleLoader(new URL('../src/TodayWorkSchedule.tsx', import.meta.url).pathname);
  const html = renderToStaticMarkup(React.createElement(TodayWorkSchedule, {
    branches: [{ id: 1, name: 'Central Branch' }],
    therapists: [
      { id: 1, name: 'Tanya', branches: [1], schedule: {} },
      { id: 2, name: 'Other therapist', branches: [2], schedule: {} },
    ],
    initialBranchId: '1',
    onOpenFullSchedule() {},
  }));
  assert.match(html, /Today(?:&#x27;|')s therapist availability/);
  assert.match(html, /Tanya/);
  assert.match(html, /10:00–20:00/);
  assert.match(html, /Open full Work schedule/);
  assert.doesNotMatch(html, /Other therapist/);
});

test('owners, managers and receptionists can correct completed appointment therapist assignments', () => {
  const selectedCalendarEvent = {
    id: 'completed-event',
    booking: { ...booking, status: 'Completed', therapistName: 'Tanya', receiptNumber: 'RECEIPT-1' },
    localTime: booking.time,
  };
  for (const role of ['owner', 'branch_manager', 'branch_receptionist']) {
    const html = render('calendar', 'en', { selectedCalendarEvent }, {
      dashboardUser: { role, branchIds: ['1'] },
    });
    assert.match(html, /Change therapist/);
    assert.match(html, /Completed appointments can be corrected without checking past therapist availability/);
  }
});

test('Wix calendar sync appears below the calendar and appointment list', () => {
  const html = render('calendar', 'en', { calendarViewMode: 'agenda' });
  const calendarContentIndex = html.indexOf('No appointments match this date');
  const syncSectionIndex = html.indexOf('Append missing imported Wix bookings');
  assert.notEqual(calendarContentIndex, -1);
  assert.notEqual(syncSectionIndex, -1);
  assert.ok(syncSectionIndex > calendarContentIndex);
});

test('mobile booking cards retain all nine fields, booking data and existing actions', () => {
  const html = render('schedule', 'en');
  const table = html.match(/<table role="table"[\s\S]*?<\/table>/)?.[0];
  assert.ok(table);
  for (const label of ['Ref ID', 'Customer', 'Service', 'Therapist', 'Time', 'Database', 'Check-in', 'Total', 'Actions']) {
    assert.ok(table.includes(`role="cell" data-label="${label}"`), label);
  }
  for (const value of [booking.id, booking.customerName, booking.phone, booking.bookingNote, booking.serviceName, booking.therapistName, booking.time, '107.35']) {
    assert.ok(table.includes(value), value);
  }
  for (const action of ['Edit booking', 'Appointment details', 'Clear']) assert.ok(table.includes(`>${action}</button>`));
  assert.match(render('schedule', 'th'), /data-label="ลูกค้า"/);
});

test('responsive staff styles stay below 1024px, with scrollable menus and 44px touch controls', () => {
  const css = postcss.parse(readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'));
  const media = css.nodes.findLast((node) => node.type === 'atrule' && node.name === 'media' && node.params === '(max-width: 1023px)');
  assert.equal(media.params, '(max-width: 1023px)');
  media.walkRules((rule) => {
    for (const selector of rule.selectors) assert.ok(selector.startsWith('.staff-dashboard '), selector);
  });

  test('phone calendars default to daily, retain all appointments and allow explicit view choices', () => {
    const events = [{
      id: 'phone-event', summary: 'Phone appointment', therapistName: 'Tanya',
      localTime: '11:00', start: '2026-10-10T11:00:00-04:00', end: '2026-10-10T12:00:00-04:00',
      booking: { ...booking, bookingNote: 'Important team note' },
    }];
    const mobile = render('calendar', 'en', { compactCalendar: true, calendarEvents: events });
    assert.match(mobile, /value="daily" selected/);
    assert.match(mobile, /calendar-schedule/);
    assert.doesNotMatch(mobile, /calendar-agenda/);
    assert.match(mobile, /Phone appointment/);
    assert.match(mobile, /Important team note/);
    for (const action of ['Calendar settings', 'Calendar filters', 'Add ▾', 'Manage ▾', 'Refresh']) {
      assert.ok(mobile.includes(`aria-label="${action}"`), action);
    }
    assert.doesNotMatch(mobile, /calendar-legend[^>]* open=""/);
    assert.doesNotMatch(mobile, /calendar-hours[^>]* open=""/);
    assert.match(mobile, /<details><summary class="calendar-context-toggle/);
    assert.match(mobile, /class="calendar-stats /);
    assert.match(render('calendar', 'en', { compactCalendar: false }), /value="therapists" selected/);
    assert.match(render('calendar', 'en', { compactCalendar: true, calendarViewMode: 'agenda' }), /value="agenda" selected/);
    assert.match(render('calendar', 'en', { compactCalendar: false, calendarViewMode: 'agenda' }), /value="agenda" selected/);
  });

  test('phone therapist columns page independently of appointment filters, including unassigned', () => {
    const date = '2026-10-10';
    const therapists = [
      { id: 1, name: 'Tanya', branches: [1], schedule: {}, active: true },
      { id: 2, name: 'Second therapist', branches: [1], schedule: {}, active: true },
    ];
    const events = therapists.map((therapist) => ({
      id: `event-${therapist.id}`, therapistName: therapist.name, summary: `${therapist.name} appointment`,
      localTime: '11:00', start: `${date}T11:00:00-04:00`, end: `${date}T12:00:00-04:00`,
    }));
    events.push({ ...events[0], id: 'unassigned', therapistName: 'Any Available', summary: 'Unassigned booking' });
    const fixture = { compactCalendar: true, calendarViewMode: 'therapists', calendarDate: date, calendarEvents: events };
    const first = render('calendar', 'en', fixture, { therapists });
    assert.match(first, /Tanya appointment/);
    assert.doesNotMatch(first, /Second therapist appointment|Unassigned booking/);
    assert.match(first, /<option value="2">Second therapist<\/option>/);
    assert.match(first, /<option value="unassigned">Unassigned appointments<\/option>/);
    const second = render('calendar', 'en', { ...fixture, mobileCalendarColumn: '2' }, { therapists });
    assert.match(second, /Second therapist appointment/);
    assert.doesNotMatch(second, /Tanya appointment|Unassigned booking/);
    const unassigned = render('calendar', 'en', { ...fixture, mobileCalendarColumn: 'unassigned' }, { therapists });
    assert.match(unassigned, /Unassigned booking/);
    assert.doesNotMatch(unassigned, /Tanya appointment|Second therapist appointment/);
    const fallback = render('calendar', 'en', { ...fixture, mobileCalendarColumn: 'removed' }, { therapists });
    assert.match(fallback, /Tanya appointment/);
    const desktop = render('calendar', 'en', { ...fixture, compactCalendar: false }, { therapists });
    for (const event of events) assert.ok(desktop.includes(event.summary));
    const agenda = render('calendar', 'en', { ...fixture, calendarViewMode: 'agenda', mobileCalendarColumn: '2' }, { therapists });
    for (const event of events) assert.ok(agenda.includes(event.summary), 'Column selection must not filter the agenda');
  });

  test('compact calendar breakpoint subscription updates and cleans up on resize', () => {
    let effect;
    const visit = (node) => {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
          node.arguments[0]?.getText(ast).includes('const syncCompactCalendar')) effect = node.arguments[0].getText(ast);
      ts.forEachChild(node, visit);
    };
    visit(portal);
    let listener;
    const changes = [];
    const query = {
      matches: true,
      addEventListener(type, callback) { assert.equal(type, 'change'); listener = callback; },
      removeEventListener(type, callback) { assert.equal(type, 'change'); assert.equal(callback, listener); listener = null; },
    };
    const cleanup = vm.runInNewContext(`(${effect})()`, {
      window: { matchMedia(value) { assert.equal(value, '(max-width: 1023px)'); return query; } },
      setCompactCalendar(value) { changes.push(value); },
    });
    query.matches = false;
    listener();
    assert.deepEqual(changes, [true, false]);
    cleanup();
    assert.equal(listener, null);
  });

  test('phone layout fits the grid without altering appointment geometry or hiding warnings', () => {
    const css = postcss.parse(readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'));
    const media = css.nodes.find((node) => node.type === 'atrule' && node.params === '(max-width: 1023px)' &&
      node.nodes.some((rule) => rule.selector === '.calendar-context-toggle'));
    assert.ok(media);
    const declarations = (selector) => {
      const result = {};
      media.walkRules((rule) => {
        if (rule.selectors.includes(selector)) rule.walkDecls((decl) => { result[decl.prop] = decl.value; });
      });
      return result;
    };
    assert.equal(declarations('.booking-calendar .calendar-grid > .grid')['grid-template-columns'], '48px minmax(0, 1fr)');
    assert.equal(declarations('.booking-calendar .calendar-scroll').overflow, 'visible');
    assert.equal(declarations('.booking-calendar .calendar-scroll')['max-height'], 'none');
    assert.equal(declarations('.booking-calendar .calendar-agenda > div > button').opacity, '1');
    assert.equal(declarations('.booking-calendar .calendar-agenda button')['min-height'], '44px');
    assert.deepEqual(declarations('.booking-calendar .calendar-grid button'), {}, 'Duration cards must keep their exact height');
    assert.match(render('calendar', 'en', { compactCalendar: true, calendarWarnings: ['Visible calendar warning'] }), /Visible calendar warning/);
  });
  const declarations = (selector) => {
    const result = {};
    media.walkRules((rule) => {
      if (rule.selectors.includes(selector)) rule.walkDecls((decl) => { result[decl.prop] = decl.value; });
    });
    return result;
  };
  assert.equal(declarations('.staff-dashboard .dashboard-toolbar button')['min-height'], '44px');
  assert.equal(declarations('.staff-dashboard .dashboard-booking-row-actions button')['min-height'], '44px');
  assert.equal(declarations('.staff-dashboard .dashboard-mobile-menu')['max-height'], 'calc(100dvh - 240px)');
  assert.equal(declarations('.staff-dashboard .dashboard-booking-table tbody tr').display, 'grid');
  assert.equal(declarations('.staff-dashboard .dashboard-booking-table td::before').content, 'attr(data-label)');
  for (const role of ['branch_manager', 'branch_receptionist']) {
    const html = render('schedule', 'en', { mobileNavOpen: true }, { dashboardUser: { role, branchIds: ['1'] } });
    assert.doesNotMatch(html, /class="[^"]*\bowner-dashboard\b/);
    assert.match(html, /Staff dashboard shortcuts/);
    assert.match(html, /dashboard-mobile-menu/);
    assert.match(html, /Mobile staff dashboard navigation/);
  }
});

test('owner menu toggles, closes after navigation and supports Escape without booking mutations', () => {
  let index = 0;
  let gestures;
  const values = { activeTab: 'schedule', mobileNavOpen: false, hasLoadedBusinessProfile: true };
  const interactionLoad = createTsLoader({
    './useCalendarGestures': { __esModule: true, default(options) { gestures = options; } },
    react: {
      ...React,
      useState(initial) {
        const name = states[index++];
        if (!Object.prototype.hasOwnProperty.call(values, name)) values[name] = typeof initial === 'function' ? initial() : initial;
        return [values[name], (value) => { values[name] = typeof value === 'function' ? value(values[name]) : value; }];
      },
      useEffect() {},
      useMemo(compute) { return compute(); },
      useRef(current) { return { current }; },
    },
    'react-dom': {
      ...ReactDOM,
      createPortal: (node) => node,
    },
    './useTherapistAvailability': {
      __esModule: true,
      default: () => ({ therapistIds: new Set(['1', '2', '3', '4', '5']), loading: false, error: '' }),
    },
    './localization': {
      useTranslation: () => ({ translate: createTranslator('en'), locale: 'en-CA', formatTime: (value) => value }),
      message,
      createTranslator,
    },
  });
  const { AdminPortal: InteractivePortal } = interactionLoad(appPath, '\nexport { AdminPortal };\n');
  const walk = (node, predicate) => {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map((child) => walk(child, predicate)).find(Boolean);
    return predicate(node) ? node : walk(node.props?.children, predicate);
  };
  const tree = () => {
    index = 0;
    return InteractivePortal({ ...props, lang: 'en', setBookings() { assert.fail('Navigation must not mutate bookings'); } });
  };
  const toggle = () => walk(tree(), (node) => node.props?.['aria-label'] === 'Toggle dashboard menu');
  toggle().props.onClick();
  assert.equal(values.mobileNavOpen, true);
  const menu = walk(tree(), (node) => node.props?.id === 'mobile-dashboard-menu');
  const packages = walk(menu, (node) => node.type === 'button' && walk(node, (child) => child.type === 'span' && child.props.children === 'Package tracking'));
  assert.ok(packages);
  packages.props.onClick();
  assert.equal(values.activeTab, 'packages');
  assert.equal(values.mobileNavOpen, false);
  assert.equal(walk(tree(), (node) => node.props?.id === 'mobile-dashboard-menu'), undefined);
  toggle().props.onClick();
  let focused = false;
  walk(tree(), (node) => node.props?.id === 'mobile-dashboard-menu').props.onKeyDown({
    key: 'Escape',
    preventDefault() {},
    currentTarget: { closest: () => ({ querySelector: () => ({ focus() { focused = true; } }) }) },
  });
  assert.equal(values.mobileNavOpen, false);
  assert.equal(focused, true);
  const shortcuts = walk(tree(), (node) => node.props?.['aria-label'] === 'Owner dashboard shortcuts');
  const calendar = walk(shortcuts, (node) => node.type === 'button' && walk(node, (child) => child.type === 'span' && child.props.children === 'Booking Calendar'));
  calendar.props.onClick();
  assert.equal(values.activeTab, 'calendar');
  assert.equal(values.mobileNavOpen, false);
  values.compactCalendar = true;
  const therapistFilter = walk(tree(), (node) => node.type === 'select' && node.props.onChange?.toString().includes('setCalendarTherapist'));
  assert.ok(therapistFilter, 'Mobile therapist filter is available without opening filters');
  therapistFilter.props.onChange({ target: { value: '1' } });
  assert.equal(values.calendarTherapist, '1');
  assert.equal(values.calendarFiltersOpen, false);
  values.calendarFullscreen = true;
  values.calendarDate = '2026-12-31';
  const fullscreenPanel = () => walk(tree(), (node) => node.props?.className?.includes('booking-calendar calendar-fullscreen'));
  assert.ok(walk(fullscreenPanel(), (node) => node.props?.['aria-label'] === 'Owner dashboard shortcuts'),
    'Bottom navigation is inside the expanded calendar');
  const dayButton = (label) => walk(fullscreenPanel(), (node) => node.props?.['aria-label'] === label);
  dayButton('Next day').props.onClick();
  assert.equal(values.calendarDate, '2027-01-01');
  dayButton('Previous day').props.onClick();
  assert.equal(values.calendarDate, '2026-12-31');
  for (const [start, next] of [['2028-02-28', '2028-02-29'], ['2028-02-29', '2028-03-01'], ['2026-03-08', '2026-03-09'], ['2026-11-01', '2026-11-02']]) {
    values.calendarDate = start;
    dayButton('Next day').props.onClick();
    assert.equal(values.calendarDate, next);
    dayButton('Previous day').props.onClick();
    assert.equal(values.calendarDate, start);
  }
  assert.equal(values.calendarTherapist, '1', 'Date navigation preserves therapist filtering');
  tree();
  assert.equal(gestures.enabled, true);
  assert.equal(gestures.fullscreen, true);
  assert.equal(gestures.blocked, false);
  const beforeGesture = values.calendarDate;
  gestures.onNavigate(1);
  assert.notEqual(values.calendarDate, beforeGesture);
  assert.equal(values.calendarTherapist, '1', 'Swipe navigation preserves therapist filtering');
  for (const [key, value] of [
    ['isLoadingCalendar', true], ['calendarLoadError', 'Unable to load'],
    ['mobileNavOpen', true], ['selectedCalendarEvent', {}], ['quickBooking', {}], ['editingBooking', {}],
  ]) {
    const prior = values[key];
    values[key] = value;
    tree();
    assert.equal(gestures.blocked, true, `${key} pauses gestures`);
    values[key] = prior;
  }
  const allSections = walk(fullscreenPanel(), (node) => node.props?.id === 'dashboard-all-sections');
  allSections.props.onClick();
  const fullscreenMenu = walk(fullscreenPanel(), (node) => node.props?.id === 'mobile-dashboard-menu');
  assert.ok(fullscreenMenu, 'All sections opens within fullscreen rather than behind it');
  let preventedEscape = false;
  fullscreenMenu.props.onKeyDown({
    key: 'Escape', preventDefault() { preventedEscape = true; },
    currentTarget: { closest: () => ({ querySelector: () => ({ focus() {} }) }) },
  });
  assert.equal(preventedEscape, true, 'Closing the menu must not also exit fullscreen');
  assert.equal(values.mobileNavOpen, false);
  walk(fullscreenPanel(), (node) => node.props?.['aria-label'] === 'Home').props.onClick();
  assert.equal(values.activeTab, 'schedule', 'Home works without using Exit fullscreen');
  assert.equal(values.mobileNavOpen, false);
});

test('managers and receptionists can edit bookings and issue receipts without manual discounts or medical access', () => {
  for (const role of ['branch_manager', 'branch_receptionist']) {
    const user = { dashboardUser: { role, branchIds: ['1'] } };
    const schedule = render('schedule', 'en', {}, user);
    assert.match(schedule, />Edit booking</);
    assert.match(schedule, />Appointment details</);
    assert.match(schedule, /\$107\.35/);
    assert.doesNotMatch(schedule, />Clear</);
    const details = render('calendar', 'en', { selectedCalendarEvent: { id: 'event', booking, localTime: booking.time } }, user);
    assert.doesNotMatch(details, /Manual discount|Confirm reconciliation/);
    assert.match(details, />Edit booking</);
    assert.doesNotMatch(details, /Log a quick note about this appointment/);
  }
});

test('Thai is shared by dashboard navigation, booking list and child workflows without translating customer data', () => {
  const thai = render('schedule');
  assert.match(thai, /ตารางงานและการจอง/);
  assert.match(thai, /ปฏิทินการจอง/);
  assert.match(thai, /นำเข้าการจองจาก Wix/);
  assert.match(thai, /ฐานข้อมูล/);
  assert.match(thai, /11:00 น\. - 12:00 น\./);
  assert.match(thai, /นวด(?:ไทยแผนโบราณ|แผนไทย) \(60 นาที\)/);
  assert.match(thai, /English Customer/);
  assert.match(thai, /Keep this staff note in English/);
  assert.match(thai, /Central Branch/);
  assert.doesNotMatch(thai, />Booking Calendar<|>Customer<|>Team note:</);
  const english = render('schedule', 'en');
  assert.match(english, /Schedule &amp; Bookings/);
  assert.match(english, /11:00 AM - 12:00 PM/);
  assert.match(english, /Thai Traditional Massage \(60 min\)/);
});

for (const [tab, expected] of [
  ['calendar', 'มุมมองปฏิทิน'], ['services', 'บันทึกบริการ'], ['staff', 'บันทึกผู้ให้บริการและตารางหมุนเวียน'],
  ['branches', 'บันทึกสาขา'], ['availability', 'เพิ่มช่วงเวลาปิดรับจอง'], ['reports', 'รายงานรายวัน'],
  ['loyalty', 'สิทธิพิเศษ MY THAI THAI'], ['marketing', 'ผู้ช่วยเลือกกลุ่มผู้รับ'],
  ['business-profile', 'บันทึกข้อมูลธุรกิจ'], ['therapist-approvals', 'อนุมัติบัญชีผู้ให้บริการ'],
  ['dashboard-users', 'สร้างบัญชีแผงควบคุม'], ['patient-history', 'ประวัติลูกค้า'],
  ['google-ads', 'ผลการโฆษณา Google Ads'], ['reviews', 'รีวิวบน Google'],
  ['wix-contacts', 'Wix'], ['wix-bookings', 'Wix'], ['packages', 'แพ็กเกจ'],
  ['alerts', 'การแจ้งเตือน'],
]) {
  test(`dashboard feature ${tab} renders under the Thai language provider`, () => {
    assert.ok(render(tab).includes(expected), `Missing Thai heading/control: ${expected}`);
  });
}

test('localized appointment details include notes, payments and receipt controls without manual discounts', () => {
  const event = { id: 'event-1', booking, summary: 'English Customer', timeRange: booking.time };
  const html = render('calendar', 'th', { selectedCalendarEvent: event, calendarEvents: [event] });
  assert.match(html, /รายละเอียดนัดหมาย/);
  assert.doesNotMatch(html, /ส่วนลดที่พนักงานกำหนด|ยืนยันการกระทบยอด/);
  assert.match(html, /ออกและส่งใบเสร็จทางอีเมล/);
  assert.match(html, /หมายเหตุ/);
  assert.match(html, /11:00 น\. - 12:00 น\./);
  assert.match(html, /client@example\.com/);
});

test('a fully discounted appointment can issue a receipt without discount entry controls', () => {
  const discounted = { ...booking, total: 0, paidAmount: 0, manualBookingDiscount: 95, autoLinked: true };
  const html = render('calendar', 'en', { selectedCalendarEvent: { id: 'free-event', booking: discounted, localTime: '11:00 AM' } });
  assert.match(html, /Issue &amp; email receipt/);
  assert.doesNotMatch(html, /Receipts are available only after full payment|Manual discount \(\$\)|Confirm reconciliation/);
});

test('catalog covers every static dashboard display call and has no untranslated JSX or accessibility literals', () => {
  const { dashboardThai } = load(new URL('../src/dashboard-th.ts', import.meta.url).pathname);
  const { componentThai } = load(new URL('../src/components-th.ts', import.meta.url).pathname);
  const catalog = { ...dashboardThai, ...componentThai };
  const brands = new Set(['M', 'MT', 'MedBook', 'EN', 'Google Ads', 'MY THAI THAI', 'GOOGLE_PLACES_API_KEY', 'GOOGLE_PLACE_ID', 'CLEAR LEDGER']);
  const missing = new Set();
  function visit(node) {
    if (ts.isCallExpression(node) && ['tr', 'label', 'message'].includes(node.expression.getText(ast)) && ts.isStringLiteral(node.arguments[0])) {
      const key = node.arguments[0].text;
      if (/[A-Za-z]/.test(key) && !brands.has(key) && !Object.prototype.hasOwnProperty.call(catalog, key)) missing.add(key);
    }
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text) && !brands.has(node.text.trim())) missing.add(`raw JSX: ${node.text.trim()}`);
    if (ts.isJsxAttribute(node) && ['placeholder', 'aria-label', 'title', 'alt'].includes(node.name.text) &&
        ts.isStringLiteral(node.initializer) && /[A-Za-z]/.test(node.initializer.text)) missing.add(`raw attribute: ${node.initializer.text}`);
    ts.forEachChild(node, visit);
  }
  visit(portal);
  visit(ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'AdminGate'));
  assert.deepEqual([...missing], []);
});

test('translation interpolates without modifying identifiers, supports server notices and preserves unknown data', () => {
  assert.equal(translateText('Receipt {value0} was emailed to {value1}.', 'th', { value0: 'R-1', value1: 'person@example.com' }),
    'ส่งอีเมลใบเสร็จ R-1 ถึง person@example.com แล้ว');
  assert.equal(translateText('Receipt R-1 was emailed to person@example.com.', 'th'),
    'ส่งอีเมลใบเสร็จ R-1 ถึง person@example.com แล้ว');
  assert.match(translateText('Thai Traditional Massage (90 min)', 'th'), /^นวด(?:ไทยแผนโบราณ|แผนไทย) \(90 นาที\)$/);
  assert.equal(translateText('Custom service by Jane', 'th'), 'Custom service by Jane');
  assert.equal(translateText('constructor', 'th'), 'constructor');
  assert.equal(translateText('Receipt {value0} was emailed to {value1}.', 'en', { value0: 'R-1', value1: 'person@example.com' }),
    'Receipt R-1 was emailed to person@example.com.');
});

test('Thai clock labels preserve appointment ranges, midnight, noon and original submission values', () => {
  assert.equal(localizeTimeLabel('11:00 AM - 12:00 PM', 'th'), '11:00 น. - 12:00 น.');
  assert.equal(localizeTimeLabel('11:00 PM - 12:00 AM', 'th'), '23:00 น. - 00:00 น.');
  assert.equal(localizeTimeLabel('02:15 PM', 'en'), '02:15 PM');
  assert.equal(localizeTimeLabel('10:00', 'en'), '10:00 AM');
  assert.equal(localizeTimeLabel('17:15', 'en'), '5:15 PM');
  assert.equal(localizeTimeLabel('20:00', 'en'), '8:00 PM');
  assert.equal(localizeTimeLabel('17:15', 'th'), '17:15 น.');
  assert.equal(localizeTimeLabel('25:00 PM', 'th'), '25:00 PM');
  assert.equal(localizeTimeLabel(undefined, 'th'), '');
});

test('read-only body map localizes its labels and accessibility text without changing stored medical values', () => {
  fixtures = {};
  stateIndex = 0;
  const html = renderToStaticMarkup(React.createElement(LanguageProvider, { language: 'th' },
    React.createElement(BodyAreaMap, { value: 'Neck, Upper back', gender: 'Female', readOnly: true })));
  assert.match(html, /แผนภาพร่างกายสามมิติ/);
  assert.match(html, /หมุนร่างกาย/);
  assert.match(html, /หลังส่วนบน/);
  assert.match(html, /คอ/);
  assert.doesNotMatch(html, />Reported areas<|>Upper back<|aria-label="Rotate body"/);
});

test('populated reports, loyalty summaries and campaign statuses use Thai rather than English enum labels', () => {
  const loyalty = render('loyalty', 'th', {
    loyaltyDashboard: { summary: { members: 1, availablePoints: 50, pendingVisits: 0 }, members: [], eligibleBookings: [], transactions: [] },
  });
  assert.match(loyalty, /แต้มคงเหลือทั้งหมด/);
  assert.match(loyalty, /บริการที่พร้อมให้แต้ม/);
  const ads = render('google-ads', 'th', {
    googleAdsReport: {
      configured: true, customerId: '123', dateRange: '2026-10-01 - 2026-10-10', currencyCode: 'CAD',
      totals: { impressions: 500, clicks: 10, cost: 25, conversions: 3 },
      campaigns: [{ id: '1', name: 'English campaign name', status: 'ENABLED', impressions: 500, clicks: 10, cost: 25, conversions: 3 }],
    },
  });
  assert.match(ads, /ค่าโฆษณา/);
  assert.match(ads, /เปิดใช้งาน/);
  assert.match(ads, /English campaign name/);
  assert.doesNotMatch(ads, />enabled<|>Ad spend</);
});

test('nested saved notices re-render in either language without translating customer identifiers', () => {
  const notice = message('{value0}{value1}{value2}', {
    value0: message('{value0} points awarded to {value1}', { value0: 50, value1: 'Jane English' }),
    value1: '.',
    value2: message(' Loyalty balance email sent.'),
  });
  assert.equal(translateText(notice, 'en'), '50 points awarded to Jane English. Loyalty balance email sent.');
  assert.equal(translateText(notice, 'th'), 'ให้ 50 แต้มแก่ Jane English. ส่งอีเมลยอดสะสมแต้มแล้ว');
  assert.equal(translateText(notice, 'en'), '50 points awarded to Jane English. Loyalty balance email sent.');
  assert.match(render('loyalty', 'th', { loyaltyNotice: notice }), /ให้ 50 แต้มแก่ Jane English/);
});

test('sign-out and sign-in remain Thai inside the shared dashboard language provider', () => {
  const gate = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'AdminGate');
  activeStates = stateNames(gate);
  fixtures = { dashboardUser: { role: 'owner' }, isCheckingSession: false };
  stateIndex = 0;
  const authenticated = renderToStaticMarkup(React.createElement(LanguageProvider, { language: 'th' },
    React.createElement(AdminGate, null, React.createElement('div', null, 'User content'))));
  assert.match(authenticated, /ออกจากระบบ/);
  assert.match(authenticated, /ลืมอุปกรณ์นี้และออกจากระบบ/);
  fixtures = { isCheckingSession: false };
  stateIndex = 0;
  const login = renderToStaticMarkup(React.createElement(LanguageProvider, { language: 'th' },
    React.createElement(AdminGate, null, React.createElement('div'))));
  assert.match(login, /เข้าสู่แผงควบคุม/);
  assert.match(login, /ใส่รหัสผ่านของคุณ/);
});

test('device registration is optional on the OTP step and localized', () => {
  activeStates = stateNames(ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'AdminGate'));
  for (const language of ['en', 'th']) {
    fixtures = { isCheckingSession: false, challengeId: 'challenge', email: 'staff@example.com' };
    stateIndex = 0;
    const html = renderToStaticMarkup(React.createElement(LanguageProvider, { language },
      React.createElement(AdminGate, null, React.createElement('div'))));
    assert.match(html, /type="checkbox"/);
    assert.doesNotMatch(html, /type="checkbox"[^>]*(?:checked|required)/);
    assert.match(html, language === 'en' ? /Remember this device for 90 days/ : /จดจำอุปกรณ์นี้เป็นเวลา 90 วัน/);
    assert.match(html, language === 'en' ? /Do not use on shared devices/ : /ห้ามใช้กับอุปกรณ์ที่ใช้ร่วมกัน/);
  }
});

test('login submits device consent only during OTP verification and supports both sign-out actions', async () => {
  const gate = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'AdminGate');
  let submit;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === 'onSubmit') submit = node.initializer.expression;
    ts.forEachChild(node, visit);
  }
  visit(gate);
  const signOut = gate.body.statements.flatMap((statement) =>
    ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
    .find((node) => node.name.getText(ast) === 'signOut').initializer;
  const requests = [];
  const context = vm.createContext({
    setupMode: false, challengeId: '', email: 'staff@example.com', password: 'password',
    otpCode: '123456', rememberDevice: false,
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ user: { role: 'owner' } }) };
    },
    setIsSigningIn() {}, setError(value) { assert.equal(value, ''); },
    setSuccessMessage() {}, setDashboardUser() {}, setPassword() {}, setOtpCode() {},
    setChallengeId() {}, setEmail() {}, setSetupMode() {}, setRememberDevice() {},
  });
  vm.runInContext(ts.transpileModule(`const submit = ${submit.getText(ast)}; const signOut = ${signOut.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  await vm.runInContext('submit({ preventDefault() {} })', context);
  assert.deepEqual(requests.at(-1), {
    url: '/api/booking?view=owner-login', body: { email: 'staff@example.com', password: 'password' },
  });
  context.challengeId = 'challenge';
  for (const consent of [false, true]) {
    context.rememberDevice = consent;
    await vm.runInContext('submit({ preventDefault() {} })', context);
    assert.deepEqual(requests.at(-1), {
      url: '/api/booking?view=owner-verify',
      body: { challengeId: 'challenge', code: '123456', rememberDevice: consent },
    });
  }
  await vm.runInContext('signOut()', context);
  assert.deepEqual(requests.at(-1).body, { forgetDevice: false });
  await vm.runInContext('signOut(true)', context);
  assert.deepEqual(requests.at(-1), {
    url: '/api/booking?view=owner-logout', body: { forgetDevice: true },
  });
});

test('printable receipt follows Thai labels, preserves amounts and escapes customer content', () => {
  const declaration = portal.body.statements.flatMap((statement) => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
    .find((node) => node.name.getText(ast) === 'printIssuedReceipt');
  let html = '';
  const popup = {
    document: {
      write(value) { html += value; },
      querySelector() { return { insertAdjacentHTML(position, value) { html += value; } }; },
      close() {},
    },
    focus() {},
  };
  const compiled = ts.transpileModule(`const print = ${declaration.initializer.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({ window: { open: () => popup }, tr: createTranslator('th'), lang: 'th', locale: 'th-TH', setReceiptError() {} });
  vm.runInContext(compiled, context);
  context.receiptData = {
    booking: { ...booking, customerName: '<Jane & English>', paymentOption: 'cash' },
    receipt: { number: 'R-1', issuedAt: '2026-10-10', subtotal: 95, total: 96.05, tax: 11.05,
      taxLabel: 'HST (13%)', manualDiscount: 10, loyaltyDiscount: 0, membershipDiscountAmount: 0, overpaymentAmount: 0 },
    businessProfile: { businessName: 'Original Company', legalName: 'Original Company', address: 'Toronto', phone: '437-555-0101', email: 'clinic@example.com' },
  };
  vm.runInContext('print(receiptData);', context);
  assert.match(html, /lang="th"/);
  assert.match(html, /ใบเสร็จรับเงิน/);
  assert.match(html, /ส่วนลดที่พนักงานกำหนด/);
  assert.match(html, /พิมพ์ใบเสร็จ/);
  assert.match(html, /&lt;Jane &amp; English&gt;/);
  assert.match(html, /\$96\.05/);
  assert.doesNotMatch(html, /<Jane|Keep this staff note/);
});
