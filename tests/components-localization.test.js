import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as wixPricing from '../lib/wix-pricing.js';
import * as calendarSync from '../src/runWixCalendarSync.js';

const require = createRequire(import.meta.url);
const compile = (name) => ts.transpileModule(readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'), {
  fileName: name,
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const catalogModule = { exports: {} };
vm.runInNewContext(compile('components-th.ts'), { exports: catalogModule.exports });
const { componentThai } = catalogModule.exports;
const localizationModule = { exports: {} };
vm.runInNewContext(compile('localization.tsx'), {
  exports: localizationModule.exports,
  require(path) {
    if (path === './components-th') return { componentThai };
    if (path === './dashboard-th') {
      const module = { exports: {} };
      vm.runInNewContext(compile('dashboard-th.ts'), { exports: module.exports });
      return module.exports;
    }
    return require(path);
  },
});
const { localizeTimeLabel, message, translateText } = localizationModule.exports;
const translate = (locale, text, values = {}) => translateText(text, locale === 'th-TH' ? 'th' : 'en', values);

function harness(name, locale = 'en-CA', overrides = {}, fetch = async () => { throw new Error('Unexpected request'); }) {
  let cursor = 0;
  const states = new Map(Object.entries(overrides).map(([key, value]) => [Number(key), value]));
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!states.has(index)) states.set(index, typeof initial === 'function' ? initial() : initial);
      return [states.get(index), (value) => states.set(index, typeof value === 'function' ? value(states.get(index)) : value)];
    },
    useRef: (initial) => ({ current: initial }),
    useEffect: () => {},
  };
  const module = { exports: {} };
  const cache = new Map();
  function load(path) {
    if (path === 'react') return hooks;
    if (path === './localization') return { useTranslation: () => ({
      locale,
      translate: (text, values) => translate(locale, text, values),
      formatTime: (value) => localizeTimeLabel(value, locale === 'th-TH' ? 'th' : 'en'),
    }), message };
    if (path === '../lib/wix-pricing.js') return wixPricing;
    if (path === './runWixCalendarSync') return calendarSync;
    if (path.startsWith('./')) {
      if (!cache.has(path)) {
        const dependency = { exports: {} };
        vm.runInNewContext(compile(`${path.slice(2)}.ts`), {
          exports: dependency.exports, require: load, fetch, setTimeout, clearTimeout,
        });
        cache.set(path, dependency.exports);
      }
      return cache.get(path);
    }
    return require(path);
  }
  vm.runInNewContext(compile(`${name}.tsx`), { exports: module.exports, require: load, fetch, AbortController, URLSearchParams });
  return {
    states,
    setLocale(value) { locale = value; },
    render(props = {}) {
      cursor = 0;
      return module.exports.default(props);
    },
  };
}

function find(element, predicate) {
  if (!element || typeof element !== 'object') return undefined;
  if (Array.isArray(element)) return element.map((child) => find(child, predicate)).find(Boolean);
  return predicate(element) ? element : find(element.props?.children, predicate);
}
const html = (element) => renderToStaticMarkup(element);
const quickProps = {
  branches: [{ id: 1, name: 'Central' }],
  services: [{ id: 1, name: 'Thai Massage' }],
  therapists: [{ id: 1, name: 'Tanya' }],
  times: ['10:00 AM'], date: '2026-10-10', branchId: '1', therapistId: '1',
  isScheduled: () => true, onClose() {}, async onSaved() {},
};
const screens = [
  ['QuickBooking', quickProps, 'Quick appointment', 'เพิ่มนัดหมายด่วน'],
  ['BookingNote', { bookingId: 'B1', initialNote: 'Keep this English note', async onSaved() {} }, 'Shared internal booking note', 'บันทึกภายในเกี่ยวกับการจองสำหรับทีม'],
  ['WixCalendarSync', { async onSynced() {} }, 'Sync Wix bookings', 'ซิงค์การจอง Wix'],
  ['WixBookings', { onViewBookings() {} }, 'Import historical Wix bookings', 'นำเข้าประวัติการจองจาก Wix'],
  ['WixContacts', {}, 'Historical Wix contacts', 'รายชื่อติดต่อเดิมจาก Wix'],
  ['PackageTracking', { onViewBookings() {} }, 'Four-session package tracking', 'ติดตามแพ็กเกจ 4 ครั้ง'],
  ['ClearBookingHistory', { async onCleared() {} }, 'Clear past booking history', 'ลบประวัติการจองที่ผ่านมา'],
];
for (const [name, props, english, thai] of screens) {
  test(`${name} renders meaningful Thai and preserves default English`, () => {
    const englishHtml = html(harness(name).render(props));
    const thaiHtml = html(harness(name, 'th-TH').render(props));
    assert.ok(englishHtml.includes(english));
    assert.ok(thaiHtml.includes(thai));
    assert.ok(!thaiHtml.includes(english));
    if (name === 'QuickBooking') {
      assert.match(thaiHtml, /aria-label="ปิดหน้าต่างเพิ่มนัดหมายด่วน"/);
      assert.match(thaiHtml, /client@example.com หรือ/);
      assert.match(thaiHtml, /value="1"[^>]*>นวดไทย/);
      assert.match(thaiHtml, /Tanya/);
      assert.match(thaiHtml, /Central/);
      assert.match(thaiHtml, /value="10:00 AM" selected="">10:00 น\./);
      assert.match(englishHtml, /value="10:00 AM" selected="">10:00 AM/);
    }
    if (name === 'BookingNote') assert.match(thaiHtml, /Keep this English note/);
    if (name === 'PackageTracking') {
      assert.match(thaiHtml, /เลขอ้างอิงการซื้อที่ไม่ซ้ำ/);
      assert.match(thaiHtml, /value="Package: 60 min x 4 Sessions"/);
    }
  });
}

test('Thai catalogue covers literal translations, validation fallbacks and mapped headings', () => {
  const missing = new Set();
  for (const [name] of screens) {
    const source = ts.createSourceFile(`${name}.tsx`, readFileSync(new URL(`../src/${name}.tsx`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function walk(node) {
      if (ts.isCallExpression(node) && ['tr', 'message'].includes(node.expression.getText(source))) {
        const argument = node.arguments[0];
        if (ts.isStringLiteral(argument) && !componentThai[argument.text]) missing.add(argument.text);
        if (ts.isConditionalExpression(argument)) {
          for (const value of [argument.whenTrue, argument.whenFalse]) if (ts.isStringLiteral(value) && value.text && !componentThai[value.text]) missing.add(value.text);
        }
      }
      if (ts.isStringLiteral(node) && /^(Unable to|Choose the Wix|The CSV must|Choose start|Internal booking note saved|Syncing existing)/.test(node.text) && !componentThai[node.text]) missing.add(node.text);
      if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text)) assert.equal(node.text.trim(), 'Mississauga Central', `Untranslated static JSX in ${name}`);
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  assert.deepEqual([...missing], []);
  for (const [english, thai] of Object.entries(componentThai)) {
    assert.match(thai, /[\u0e00-\u0e7f]/, `Missing Thai translation: ${english}`);
    assert.deepEqual([...english.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(), [...thai.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(), `Placeholder mismatch: ${english}`);
  }
  assert.equal(translate('th-TH', 'An unknown API error'), 'An unknown API error');
});

test('Thai quick-booking confirmation translates messages without changing request data', async () => {
  let body;
  let saved;
  const ui = harness('QuickBooking', 'th-TH', { 0: 'Alice Smith', 1: 'alice@example.com', 2: 'Please keep Tanya' }, async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, async json() { return { bookingId: 'B123', emailSkipped: true }; } };
  });
  const element = ui.render({ ...quickProps, async onSaved(value) { saved = value; } });
  await find(element, (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(body.customerName, 'Alice Smith');
  assert.equal(body.bookingNote, 'Please keep Tanya');
  assert.equal(body.serviceId, '1');
  assert.equal(body.time, '10:00 AM');
  assert.match(translate('th-TH', saved.notice), /บันทึกนัดหมาย B123 แล้ว/);
  assert.match(translate('th-TH', saved.notice), /ไม่ได้ส่งอีเมลยืนยัน/);
});

test('booking note success and unknown API errors render in Thai without translating user notes', async () => {
  const props = { bookingId: 'B1', initialNote: 'Original', async onSaved() {} };
  const ui = harness('BookingNote', 'th-TH', { 0: 'Requested Tanya' }, async (_url, options) => {
    assert.equal(JSON.parse(options.body).note, 'Requested Tanya');
    return { ok: true, async json() { return { bookingNote: 'Requested Tanya' }; } };
  });
  await ui.render(props).props.onSubmit({ preventDefault() {} });
  assert.match(html(ui.render(props)), /บันทึกหมายเหตุภายในสำหรับทีมคลินิกแล้ว/);
  assert.match(html(ui.render(props)), /Requested Tanya/);
  const failure = harness('BookingNote', 'th-TH', {}, async () => ({ ok: false, async json() { return { message: 'Custom API conflict' }; } }));
  await failure.render(props).props.onSubmit({ preventDefault() {} });
  assert.match(html(failure.render(props)), /Custom API conflict/);
});

test('clear-history Thai preview preserves the required destructive confirmation token and payload', async () => {
  const preview = { count: 12, paidBookings: 3, receipts: 2, kept: 5, cutoff: '2026-10-10T12:00:00Z', timeZone: 'America/Toronto', token: 'unchanged-token' };
  let sent;
  const ui = harness('ClearBookingHistory', 'th-TH', { 0: preview, 1: 'CLEAR PAST BOOKINGS' }, async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, async json() { return { deleted: 12 }; } };
  });
  const props = { async onCleared() {} };
  const element = ui.render(props);
  assert.match(html(element), /พิมพ์ CLEAR PAST BOOKINGS เพื่อยืนยัน/);
  assert.match(html(element), /ลบการจองที่ผ่านมา 12 รายการอย่างถาวร/);
  await find(element, (node) => node.type === 'button' && node.props.children?.includes?.('12')).props.onClick();
  assert.deepEqual(sent, { token: 'unchanged-token', confirmation: 'CLEAR PAST BOOKINGS' });
  assert.match(html(ui.render(props)), /ลบการจองที่ผ่านมา 12 รายการแล้ว/);
});

test('Wix contacts preview translates summary, headings and statuses but preserves personal data', () => {
  const preview = { totalRows: 3, validContacts: 1, invalidRows: 1, duplicates: 1, invalidDates: 1, issues: [{ row: 3, message: 'Unknown CSV diagnostic' }], sample: [{ contact_id: 'C1', name: 'Alice Smith', email: 'alice@example.com', phone: '+123', email_subscriber_status: 'Subscribed' }] };
  const output = html(harness('WixContacts', 'th-TH', { 1: 'contacts.csv', 2: preview, 13: false }).render());
  assert.match(output, /contacts.csv: 3 แถว/);
  assert.match(output, /นำเข้าข้อมูลติดต่อ 1 รายชื่อ/);
  assert.match(output, /สมัครรับข่าวสารแล้ว/);
  assert.match(output, /Alice Smith/);
  assert.match(output, /alice@example.com/);
  assert.match(output, /Unknown CSV diagnostic/);
});

test('Wix calendar validation message is translated', async () => {
  const ui = harness('WixCalendarSync', 'th-TH', { 3: 'range' });
  const props = { async onSynced() {} };
  await find(ui.render(props), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.match(html(ui.render(props)), /กรุณาเลือกวันเริ่มต้นและวันสิ้นสุด/);
});

test('Wix calendar progress translates placeholder counts and selected scope', async () => {
  let requests = 0;
  const ui = harness('WixCalendarSync', 'th-TH', {}, async () => {
    requests++;
    return { ok: true, async json() { return { synced: 2, pending: 0, errors: [] }; } };
  });
  const props = { async onSynced() {} };
  await find(ui.render(props), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  // The form intentionally launches sync without returning its promise.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 1);
  assert.match(html(ui.render(props)), /ซิงค์ปฏิทิน Wix สำหรับ ทุกวันที่ เสร็จแล้ว เพิ่มการจอง 2 รายการ/);
});

test('Wix booking review translates totals and confirmations while preserving staff and branch names', () => {
  const preview = {
    totalRows: 2, validBookings: 2, duplicates: 0, invalidRows: 0, futureRows: 0,
    branchName: 'Mississauga Central', timeZone: 'America/Toronto', throughDate: '2026-10-10',
    earliestDate: '2026-10-01', latestDate: '2026-10-09', warnings: 0, issues: [],
    approvedTotal: 203.4, mappedTherapistBookings: 2,
    therapistGroups: [{ sourceName: 'Tanya', count: 2 }], priceGroups: [],
    sample: [{ booking_id: 'WIX1', customer_name: 'Alice', date: '2026-10-01', time: '10:00 AM', service_name: 'Thai Massage', therapist_name: 'Tanya', duration_minutes: 60, status: 'Completed', total: 101.7, paid_amount: 101.7 }],
  };
  for (const locale of ['en-CA', 'th-TH']) {
    const output = html(harness('WixBookings', locale, { 1: 'bookings.csv', 2: preview, 10: true }).render({ onViewBookings() {} }));
    assert.match(output, /Alice/);
    assert.match(output, /Tanya/);
    assert.match(output, /Mississauga Central/);
    if (locale === 'th-TH') {
      assert.match(output, /ยอดรวมภาษีสำหรับ CSV นี้: \$203.40/);
      assert.match(output, /ฉันยืนยันว่าการจองย้อนหลังเหล่านี้ชำระเงินแล้ว/);
      assert.match(output, /60 นาที/);
      assert.match(output, /เสร็จสิ้น/);
      assert.match(output, /10:00 น\./);
    } else {
      assert.match(output, /Tax-inclusive total for this CSV: \$203.40/);
      assert.match(output, /I confirm these historical bookings were paid/);
      assert.match(output, /10:00 AM/);
    }
  }
});

test('package balances, usage and deduction confirmation render localized templates', () => {
  const pkg = {
    package_id: 'PKG1', customer_name: 'Alice', email: 'alice@example.com',
    package_name: 'Package: 60 min x 4 Sessions', duration_minutes: 60,
    purchase_reference: 'Owner REF', purchase_date: '2026-10-01', remaining_sessions: 3, initial_remaining: 4,
    usages: [{ bookingId: 'B1', remainingSessions: 3, allocatedTotal: 101.7 }],
  };
  const output = html(harness('PackageTracking', 'th-TH', { 1: [pkg], 6: 'PKG1', 9: false }).render({ onViewBookings() {} }));
  assert.match(output, /เหลือ 3 \/ 4 ครั้ง/);
  assert.match(output, /B1 \| หัก 1 ครั้ง \| เหลือ 3 ครั้งหลังรับบริการ \| มูลค่าที่จัดสรร \$101.70/);
  assert.match(output, /ฉันยืนยันว่ามีการรับบริการครั้งนี้จริง/);
  assert.match(output, /Owner REF/);
  assert.match(output, /Alice/);
  assert.match(output, /แพ็กเกจ: 60 นาที [x×] 4 ครั้ง - เหลือ 3 ครั้ง/);
});

test('Thai time options preserve original API values when a different time is selected', async () => {
  let sent;
  const ui = harness('QuickBooking', 'th-TH', {}, async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, async json() { return { bookingId: 'B124', emailSent: true }; } };
  });
  const props = { ...quickProps, times: ['12:00 AM', '12:00 PM', '02:15 PM'] };
  const element = ui.render(props);
  const output = html(element);
  assert.match(output, /value="12:00 AM"[^>]*>00:00 น\./);
  assert.match(output, /value="12:00 PM">12:00 น\./);
  assert.match(output, /value="02:15 PM">14:15 น\./);
  const timeSelect = find(element, (node) => node.type === 'select'
    && node.props.children?.some?.((child) => child.props?.value === '02:15 PM'));
  timeSelect.props.onChange({ target: { value: '02:15 PM' } });
  const updated = ui.render(props);
  assert.match(html(updated), /value="02:15 PM" selected="">14:15 น\./);
  await find(updated, (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(sent.time, '02:15 PM');
});

test('package matching bookings show Thai time but retain booking IDs and raw time data', () => {
  const pkg = { package_id: 'PKG1', email: 'alice@example.com', customer_name: 'Alice', package_name: 'Custom package', duration_minutes: 60, remaining_sessions: 3, initial_remaining: 4, usages: [] };
  const booking = { id: 'B2', email: 'alice@example.com', serviceName: 'Thai Traditional Massage (60 min)', date: '2026-10-10', time: '02:15 PM', durationMinutes: 60, status: 'Confirmed', receiptNumber: '' };
  const props = { onViewBookings() {} };
  const output = html(harness('PackageTracking', 'th-TH', { 1: [pkg], 6: 'PKG1', 8: [booking], 9: false }).render(props));
  assert.match(output, /value="B2">2026-10-10 14:15 น\. \| นวดไทยแผนโบราณ \(60 นาที\) \| B2/);
  assert.equal(booking.time, '02:15 PM');
  assert.equal(booking.status, 'Confirmed');
  assert.match(output, /Custom package/);
});

test('known catalogue names and Wix statuses have meaningful Thai translations', () => {
  for (const source of [
    'Thai Traditional Massage (30 min)', 'Thai Traditional Massage - Couple (90 min)',
    'Thai Combination Swedish (60 min)', 'Thai Combo Swedish + Hot Stone (90 min)',
    'Package: 90 min x 4 Sessions', 'Registered Massage Therapy (RMT 60 min)',
    'Traditional Thai Acupuncture (60 min)', 'Confirmed', 'Completed', 'Cancelled',
    'Pending', 'No Show', 'Subscribed', 'Never subscribed', 'Unsubscribed',
  ]) {
    assert.match(translate('th-TH', source), /[\u0e00-\u0e7f]/);
    assert.equal(translate('en-CA', source), source);
  }
});

test('persisted calendar progress and nested scope follow language changes during and after sync', async () => {
  let resolveBatch;
  const ui = harness('WixCalendarSync', 'en-CA', { 3: 'range', 4: '2026-10-01', 5: '2026-10-10' },
    () => new Promise((resolve) => { resolveBatch = resolve; }));
  const props = { async onSynced() {} };
  find(ui.render(props), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.match(html(ui.render(props)), /Appending missing Wix bookings for 2026-10-01 to 2026-10-10 \(inclusive\)/);
  assert.equal(ui.states.get(1).text, 'Appending missing Wix bookings for {scope} to the primary Google Calendar...');
  ui.setLocale('th-TH');
  assert.match(html(ui.render(props)), /สำหรับ 2026-10-01 ถึง 2026-10-10 \(รวมวันสิ้นสุด\)/);
  resolveBatch({ ok: true, async json() { return { synced: 2, pending: 0, errors: [] }; } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(html(ui.render(props)), /ซิงค์ปฏิทิน Wix สำหรับ 2026-10-01 ถึง 2026-10-10 \(รวมวันสิ้นสุด\) เสร็จแล้ว/);
  ui.setLocale('en-CA');
  assert.match(html(ui.render(props)), /Wix Calendar sync complete for 2026-10-01 to 2026-10-10 \(inclusive\): 2 bookings appended/);
});

test('persisted booking note success follows language changes without rewriting user notes', async () => {
  const ui = harness('BookingNote', 'en-CA', { 0: 'Keep Tanya' },
    async () => ({ ok: true, async json() { return { bookingNote: 'Keep Tanya' }; } }));
  const props = { bookingId: 'B1', initialNote: 'Original', async onSaved() {} };
  await ui.render(props).props.onSubmit({ preventDefault() {} });
  assert.match(html(ui.render(props)), /Internal booking note saved for the clinic team/);
  ui.setLocale('th-TH');
  assert.match(html(ui.render(props)), /บันทึกหมายเหตุภายในสำหรับทีมคลินิกแล้ว/);
  assert.match(html(ui.render(props)), /Keep Tanya/);
  ui.setLocale('en-CA');
  assert.match(html(ui.render(props)), /Internal booking note saved for the clinic team/);
});

test('nested package result and unknown remaining count are core-compatible persisted descriptors', () => {
  const notice = message('{result} {remaining} sessions remained after this visit. Receipt is now available in Events & bookings.', {
    result: message('Already linked; no duplicate deduction.'), remaining: 3,
  });
  const ui = harness('PackageTracking', 'en-CA', { 12: notice });
  const props = { onViewBookings() {} };
  assert.match(html(ui.render(props)), /Already linked; no duplicate deduction/);
  ui.setLocale('th-TH');
  assert.match(html(ui.render(props)), /เชื่อมโยงไว้แล้ว ไม่มีการหักซ้ำ/);
  assert.match(html(ui.render(props)), /เหลือ 3 ครั้ง/);
  const progress = message('Calendar: {synced} bookings synced in this run; {pending} remaining.', {
    synced: 2, pending: message('unknown'),
  });
  const wix = harness('WixBookings', 'en-CA', { 14: progress });
  assert.match(html(wix.render(props)), /2 bookings synced in this run; unknown remaining/);
  wix.setLocale('th-TH');
  assert.match(html(wix.render(props)), /ซิงค์แล้ว 2 รายการในรอบนี้ ยังเหลือ ไม่ทราบ รายการ/);
});
