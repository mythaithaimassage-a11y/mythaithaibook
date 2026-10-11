import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
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
  const shortcuts = html.match(/<nav aria-label="Owner dashboard shortcuts"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(shortcuts);
  assert.match(shortcuts, /aria-current="page"[^>]*>[\s\S]*?Home/);
  assert.match(shortcuts, /Booking Calendar/);
  assert.match(shortcuts, /Sales &amp; reports/);
  assert.match(shortcuts, /aria-expanded="true" aria-controls="mobile-dashboard-menu"/);
  const menu = html.match(/<nav id="mobile-dashboard-menu"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(menu);
  for (const section of ['Workspace', 'Manage', 'Grow']) assert.match(menu, new RegExp(`aria-label="${section}"`));
  assert.equal((menu.match(/<button /g) || []).length, 19);
  assert.equal((menu.match(/aria-current="page"/g) || []).length, 1);
  assert.doesNotMatch(menu, /Events &amp; bookings/);
  assert.doesNotMatch(html, /Events &amp; bookings/);
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
  assert.match(source, /Therapist gap after appointments \(minutes\)/);
  assert.match(source, /min=\{field\.min\}[\s\S]*max=\{field\.max\}[\s\S]*step=\{field\.step\}/);
  assert.match(source, /calendarViewMode === 'therapists'/);
  assert.match(source, /gridTemplateColumns: `56px repeat\(\$\{calendarColumnTherapists\.length/);
  assert.match(source, /minmax\(128px, 220px\)/);
  assert.match(source, /Next available \(60 min\)/);
  assert.match(source, /available-therapists&\$\{query\}/);
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
  const html = render('calendar', 'en');
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

test('responsive styles are owner-only, below 1024px, with scrollable menus and 44px touch controls', () => {
  const css = postcss.parse(readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'));
  const media = css.nodes.find((node) => node.type === 'atrule' && node.name === 'media');
  assert.equal(media.params, '(max-width: 1023px)');
  media.walkRules((rule) => {
    for (const selector of rule.selectors) assert.ok(selector.startsWith('.owner-dashboard '), selector);
  });
  const declarations = (selector) => {
    const result = {};
    media.walkRules((rule) => {
      if (rule.selectors.includes(selector)) rule.walkDecls((decl) => { result[decl.prop] = decl.value; });
    });
    return result;
  };
  assert.equal(declarations('.owner-dashboard .dashboard-toolbar button')['min-height'], '44px');
  assert.equal(declarations('.owner-dashboard .dashboard-booking-row-actions button')['min-height'], '44px');
  assert.equal(declarations('.owner-dashboard .dashboard-mobile-menu')['max-height'], 'calc(100dvh - 240px)');
  assert.equal(declarations('.owner-dashboard .dashboard-booking-table tbody tr').display, 'grid');
  assert.equal(declarations('.owner-dashboard .dashboard-booking-table td::before').content, 'attr(data-label)');
  for (const role of ['branch_manager', 'branch_receptionist']) {
    const html = render('schedule', 'en', { mobileNavOpen: true }, { dashboardUser: { role, branchIds: ['1'] } });
    assert.doesNotMatch(html, /class="[^"]*\bowner-dashboard\b|Owner dashboard shortcuts|dashboard-mobile-menu/);
    assert.match(html, /Mobile owner dashboard navigation/);
  }
});

test('owner menu toggles, closes after navigation and supports Escape without booking mutations', () => {
  let index = 0;
  const values = { activeTab: 'schedule', mobileNavOpen: false, hasLoadedBusinessProfile: true };
  const interactionLoad = createTsLoader({
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
    currentTarget: { parentElement: { querySelector: () => ({ focus() { focused = true; } }) } },
  });
  assert.equal(values.mobileNavOpen, false);
  assert.equal(focused, true);
  const shortcuts = walk(tree(), (node) => node.props?.['aria-label'] === 'Owner dashboard shortcuts');
  const calendar = walk(shortcuts, (node) => node.type === 'button' && walk(node, (child) => child.type === 'span' && child.props.children === 'Booking Calendar'));
  calendar.props.onClick();
  assert.equal(values.activeTab, 'calendar');
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
    assert.doesNotMatch(details, /Log a quick note about this appointment|Change therapist…/);
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
  fixtures = { isCheckingSession: false };
  stateIndex = 0;
  const login = renderToStaticMarkup(React.createElement(LanguageProvider, { language: 'th' },
    React.createElement(AdminGate, null, React.createElement('div'))));
  assert.match(login, /เข้าสู่แผงควบคุม/);
  assert.match(login, /ใส่รหัสผ่านของคุณ/);
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
