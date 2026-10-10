import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import vm from 'node:vm';
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
function render(tab, language = 'th', overrides = {}) {
  fixtures = { activeTab: tab, hasLoadedBusinessProfile: true, ...overrides };
  activeStates = states;
  stateIndex = 0;
  return renderToStaticMarkup(React.createElement(LanguageProvider, { language },
    React.createElement(AdminPortal, { ...props, lang: language })));
}

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

test('localized appointment details include reconciliation, notes, payments and receipt controls', () => {
  const event = { id: 'event-1', booking, summary: 'English Customer', timeRange: booking.time };
  const html = render('calendar', 'th', { selectedCalendarEvent: event, calendarEvents: [event] });
  assert.match(html, /รายละเอียดนัดหมาย/);
  assert.match(html, /ส่วนลดที่พนักงานกำหนด/);
  assert.match(html, /ยืนยันการกระทบยอด/);
  assert.match(html, /ออกและส่งใบเสร็จทางอีเมล/);
  assert.match(html, /หมายเหตุ/);
  assert.match(html, /11:00 น\. - 12:00 น\./);
  assert.match(html, /client@example\.com/);
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
