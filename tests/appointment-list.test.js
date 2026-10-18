import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createTsLoader } from './helpers/load-ts-module.js';

const path = new URL('../src/AppointmentList.tsx', import.meta.url).pathname;
const load = createTsLoader();
const { default: AppointmentList, matchesAppointment, groupAppointments } = load(path);
const { LanguageProvider } = load(new URL('../src/localization.tsx', import.meta.url).pathname);
const booking = {
  id: 'MTT-REF-1', customerName: 'Alice Smith', date: '2026-12-01', time: '02:00 PM',
  serviceName: 'Massage', therapistName: 'Tanya', branchName: 'Central', total: 113,
  phone: '+1 (437) 555-0101', email: 'alice@example.com', bookingNote: 'Requested quiet room',
  syncedToSheets: true, status: 'Confirmed',
};
const props = { bookings: [booking], onOpen() {}, onEdit() {}, onDelete() {}, deletingId: '' };
const render = (overrides = {}, language = 'en') => renderToStaticMarkup(
  React.createElement(LanguageProvider, { language }, React.createElement(AppointmentList, { ...props, ...overrides })));

test('search matches booking data and formatted phone numbers without excluding older or future dates', () => {
  for (const query of [' alice ', 'MTT-REF', 'example.com', '14375550101', '437 555 0101', 'Massage', 'Tanya', 'Central', '2026-12', 'quiet', 'Confirmed', '']) {
    assert.equal(matchesAppointment(booking, query), true, query);
  }
  assert.equal(matchesAppointment(booking, 'other'), false);
  assert.equal(matchesAppointment(booking, 'wrong123'), false);
  assert.equal(matchesAppointment({ ...booking, phone: undefined, email: undefined, bookingNote: undefined }, '437555'), false);
});

test('date grouping sorts dates in either direction and times chronologically without mutating input', () => {
  const entries = [
    booking, { ...booking, id: 'early', time: '09:30 AM' }, { ...booking, id: 'evening', time: '18:00' },
    { ...booking, id: 'range', time: '11:00 AM - 12:00 PM' }, { ...booking, id: 'past', date: '2026-01-01' },
    { ...booking, id: 'future', date: '2027-01-01' },
  ];
  const original = JSON.stringify(entries);
  const asc = groupAppointments(entries, 'asc');
  assert.deepEqual(Array.from(asc, (group) => group.date), ['2026-01-01', '2026-12-01', '2027-01-01']);
  assert.deepEqual(Array.from(asc[1].bookings, (item) => item.id), ['early', 'range', booking.id, 'evening']);
  assert.deepEqual(Array.from(groupAppointments(entries, 'desc'), (group) => group.date), ['2027-01-01', '2026-12-01', '2026-01-01']);
  assert.equal(JSON.stringify(entries), original);
});

test('cards preserve details, accessible status icons, role-restricted actions and localized dates', () => {
  const html = render();
  assert.match(html, /dateTime="2026-12-01"/);
  for (const value of [booking.customerName, booking.phone, booking.bookingNote, booking.serviceName, booking.therapistName, booking.id, '113.00']) assert.ok(html.includes(value));
  for (const label of ['Edit booking', 'Appointment details', 'Delete appointment MTT-REF-1', 'Synced', 'Not checked in']) assert.ok(html.includes(`aria-label="${label}"`));
  for (const button of html.matchAll(/<button[^>]*title="[^"]+"[^>]*>/g)) {
    assert.match(button[0], /\bh-11\b/);
    assert.match(button[0], /\bw-11\b/);
  }
  assert.doesNotMatch(html, />Edit booking<|>Appointment details<|>Delete appointment</);
  assert.doesNotMatch(render({ onDelete: undefined }), /aria-label="Delete appointment/);
  assert.match(render({ deletingId: booking.id }), /disabled="" title="Delete appointment/);
  assert.match(render({}, 'th'), /แก้ไขการจอง/);
  assert.match(render({}, 'th'), /รายละเอียดนัดหมาย/);
  assert.match(render({ bookings: [] }), /No appointments found/);
  assert.match(render({ bookings: [], loading: true }), /Loading\.\.\./);
  assert.match(render({ bookings: [{ ...booking, date: '' }] }), /Date not set/);
});

test('appointment cards show the Rescheduled tag alongside the original status and ID', () => {
  const html = render({ bookings: [{ ...booking, status: 'Completed', rescheduled: true }] });
  assert.match(html, />Rescheduled</);
  assert.match(html, />Completed</);
  assert.match(html, /#MTT-REF-1/);
  assert.doesNotMatch(render(), />Rescheduled</);
});

test('card icon actions invoke their original callbacks and date order can be changed', () => {
  const states = [];
  let index = 0;
  const calls = [];
  const shallowLoad = createTsLoader({
    react: { ...React, useState(initial) {
      const i = index++;
      if (!(i in states)) states[i] = initial;
      return [states[i], (value) => { states[i] = value; }];
    } },
    './localization': { useTranslation: () => ({ translate: (value) => value, locale: 'en-CA', formatTime: (value) => value }) },
  });
  const shallow = shallowLoad(path).default;
  const walk = (node, predicate) => {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map((child) => walk(child, predicate)).find(Boolean);
    return predicate(node) ? node : walk(node.props?.children, predicate);
  };
  const tree = () => {
    index = 0;
    return shallow({ ...props, onEdit: (value) => calls.push(['edit', value]), onOpen: (value) => calls.push(['open', value]), onDelete: (id) => calls.push(['delete', id]) });
  };
  for (const label of ['Edit booking', 'Appointment details', 'Delete appointment {value0}']) {
    walk(tree(), (node) => node.type === 'button' && node.props['aria-label'] === label).props.onClick();
  }
  assert.equal(calls[0][0], 'edit');
  assert.equal(calls[0][1], booking);
  assert.equal(calls[1][0], 'open');
  assert.equal(calls[1][1], booking);
  assert.deepEqual(calls[2], ['delete', booking.id]);
  walk(tree(), (node) => node.type === 'select').props.onChange({ target: { value: 'asc' } });
  assert.equal(walk(tree(), (node) => node.type === 'select').props.value, 'asc');
});

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let loadCalendar;
const agendaExpressions = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadCalendar') loadCalendar = node.initializer.getText(ast);
  if (ts.isVariableDeclaration(node) && ['bookingListDateParts', 'bookingListToday', 'agendaBookings', 'dashboardBookings', 'scheduleBookings'].includes(node.name.getText(ast))) {
    agendaExpressions[node.name.getText(ast)] = node.initializer.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);

test('Agenda includes all of today and future dates in Toronto, excludes history in either sort, and preserves filters', () => {
  const entries = [
    { ...booking, id: 'past', date: '2026-10-17' },
    { ...booking, id: 'today-early', date: '2026-10-18', time: '10:00 AM' },
    { ...booking, id: 'today-late', date: '2026-10-18', time: '07:00 PM' },
    { ...booking, id: 'tomorrow', date: '2026-10-19' },
    { ...booking, id: 'far-future', date: '2028-01-01' },
    { ...booking, id: 'other-branch', date: '2026-10-19', branchName: 'Other' },
    { ...booking, id: 'other-therapist', date: '2026-10-19', therapistName: 'Other' },
    { ...booking, id: 'no-date', date: '' },
  ];
  const evaluate = (instant, changes = {}) => {
    const context = {
      Date: class extends Date { constructor() { super(instant); } },
      bookings: entries, calendarCoupleFilter: 'all', calendarBranchDetails: { name: 'Central', address: 'Central address' },
      calendarTherapistName: 'Tanya', therapists: [], calendarSearch: '',
      filterCoupleCalendarEvents: (events) => events,
      getAssignedTherapistNames: (name) => [name], matchesAppointment,
      ...changes,
    };
    return vm.runInNewContext(
      `const bookingListDateParts = ${agendaExpressions.bookingListDateParts};
       const bookingListToday = ${agendaExpressions.bookingListToday};
       ${agendaExpressions.agendaBookings}`, context,
    );
  };
  const visible = evaluate('2026-10-19T02:00:00Z');
  assert.deepEqual(Array.from(visible, (item) => item.id), ['today-early', 'today-late', 'tomorrow', 'far-future'],
    'UTC is already tomorrow, but Toronto is still today; keep earlier appointments today');
  for (const order of ['asc', 'desc']) {
    assert.deepEqual(Array.from(groupAppointments(visible, order), (group) => group.date),
      order === 'asc' ? ['2026-10-18', '2026-10-19', '2028-01-01'] : ['2028-01-01', '2026-10-19', '2026-10-18']);
  }
  assert.deepEqual(Array.from(evaluate('2026-10-19T04:00:00Z'), (item) => item.id), ['tomorrow', 'far-future'],
    'The cutoff advances at Toronto midnight');
  assert.deepEqual(Array.from(evaluate('2026-10-19T02:00:00Z', { calendarSearch: '2028' }), (item) => item.id), ['far-future']);
  assert.deepEqual(Array.from(evaluate('2026-10-19T02:00:00Z', { calendarSearch: '2026-10-17' })), [],
    'Searching must not bring historical bookings back into Agenda');
  assert.match(appSource, /<AppointmentList bookings=\{agendaBookings\} defaultOrder="asc"/);
  assert.match(render({ bookings: visible, defaultOrder: 'asc' }), /value="asc" selected="">Oldest first/);
});

test('Home defaults to oldest first, includes today onward in Toronto, and preserves branch and search filters', () => {
  const entries = [
    { ...booking, id: 'past', date: '2026-10-17' },
    { ...booking, id: 'early', date: '2026-10-18', time: '09:00 AM' },
    { ...booking, id: 'late', date: '2026-10-18', time: '07:00 PM' },
    { ...booking, id: 'tomorrow', date: '2026-10-19' },
    { ...booking, id: 'future', date: '2028-01-01' },
    { ...booking, id: 'other', date: '2026-10-19', branchName: 'Other' },
    { ...booking, id: 'undated', date: '' },
  ];
  const evaluate = (instant, changes = {}) => vm.runInNewContext(
    `const bookingListDateParts = ${agendaExpressions.bookingListDateParts};
     const bookingListToday = ${agendaExpressions.bookingListToday};
     const dashboardBookings = ${agendaExpressions.dashboardBookings};
     ${agendaExpressions.scheduleBookings}`,
    {
      Date: class extends Date { constructor() { super(instant); } },
      useMemo: (fn) => fn(), bookings: entries, selectedBranchName: 'Central',
      scheduleSearch: '', matchesAppointment, ...changes,
    },
  );
  const visible = evaluate('2026-10-19T02:00:00Z');
  assert.deepEqual(Array.from(visible, ({ id }) => id), ['early', 'late', 'tomorrow', 'future']);
  for (const order of ['asc', 'desc']) {
    const dates = Array.from(groupAppointments(visible, order), ({ date }) => date);
    assert.deepEqual(dates, order === 'asc'
      ? ['2026-10-18', '2026-10-19', '2028-01-01']
      : ['2028-01-01', '2026-10-19', '2026-10-18']);
  }
  assert.deepEqual(Array.from(evaluate('2026-10-19T04:00:00Z'), ({ id }) => id), ['tomorrow', 'future']);
  assert.deepEqual(Array.from(evaluate('2026-10-19T02:00:00Z', { scheduleSearch: '2028' }), ({ id }) => id), ['future']);
  assert.equal(evaluate('2026-10-19T02:00:00Z', { scheduleSearch: '2026-10-17' }).length, 0);
  assert.deepEqual(Array.from(evaluate('2026-10-19T02:00:00Z', { selectedBranchName: 'Other' }), ({ id }) => id), ['other']);
  assert.equal(evaluate('2026-10-19T02:00:00Z', { selectedBranchName: '' }).length, 5);
  assert.match(appSource, /<AppointmentList bookings=\{scheduleBookings\} defaultOrder="asc"/);
  assert.match(render({ bookings: visible, defaultOrder: 'asc' }), /value="asc" selected="">Oldest first/);
});

test('agenda refresh requests all authorized bookings without a date filter and reports API errors', async () => {
  for (const ok of [true, false]) {
    const urls = [], saved = [], errors = [];
    const context = {
      calendarRequest: { current: null }, AbortController, resolvedCalendarViewMode: 'agenda',
      setIsLoadingCalendar() {}, setCalendarLoadError: (value) => errors.push(value),
      setBookings: (value) => saved.push(value),
      fetch: async (url) => {
        urls.push(url);
        return { ok, json: async () => ok ? { bookings: [booking] } : { message: 'Unable to read bookings.' } };
      },
    };
    const result = await vm.runInNewContext(`(${loadCalendar})()`, context);
    assert.deepEqual(urls, ['/api/booking']);
    assert.equal(result, ok);
    assert.equal(context.calendarRequest.current, null);
    if (ok) assert.equal(saved[0][0], booking);
    else assert.equal(errors.at(-1), 'Unable to read bookings.');
  }
});

test('Agenda disables mobile date gestures while daily and therapist views retain them', () => {
  let enabled;
  function find(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useCalendarGestures') {
      enabled = node.arguments[0].properties.find((property) => property.name?.getText(ast) === 'enabled').initializer.getText(ast);
    }
    ts.forEachChild(node, find);
  }
  find(ast);
  for (const mode of ['daily', 'therapists', 'agenda']) {
    assert.equal(vm.runInNewContext(enabled, {
      compactCalendar: true, activeTab: 'calendar', resolvedCalendarViewMode: mode,
    }), mode !== 'agenda');
  }
  assert.match(appSource, /\[activeTab, calendarDate, calendarBranch, calendarTherapist, calendarAutoRefresh, resolvedCalendarViewMode\]/);
});
