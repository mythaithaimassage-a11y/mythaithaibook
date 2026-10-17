import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createTsLoader } from './helpers/load-ts-module.js';

const require = createRequire(import.meta.url);
const load = createTsLoader();
const { createTranslator } = load(new URL('../src/localization.tsx', import.meta.url).pathname);

function harness(name, { initial = [], fetch, effects = false } = {}) {
  const states = [...initial], refs = [], callbacks = [], deps = [], cleanups = [];
  let cursor = 0, refCursor = 0, effectCursor = 0;
  const translator = { translate: createTranslator('en'), locale: 'en-CA', formatTime: (value) => value };
  const hooks = {
    ...React,
    useState(value) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof value === 'function' ? value() : value;
      return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useMemo: (compute) => compute(),
    useCallback: (callback) => callback,
    useRef(value) { return refs[refCursor++] ||= { current: value }; },
    useEffect(callback, values) {
      const index = effectCursor++;
      if (effects && (!deps[index] || values.some((value, key) => value !== deps[index][key]))) {
        deps[index] = values;
        callbacks.push(callback);
      }
    },
  };
  const source = readFileSync(new URL(`../src/${name}.tsx`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: `${name}.tsx`, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, fetch, AbortController, URLSearchParams, console,
    require(specifier) {
      if (specifier === 'react') return hooks;
      if (specifier === './localization') return { useTranslation: () => translator };
      if (specifier.startsWith('./')) return load(new URL(`../src/${specifier.slice(2)}.tsx`, import.meta.url).pathname);
      return require(specifier);
    },
  });
  return {
    states, refs,
    render(props = {}) {
      cursor = refCursor = effectCursor = 0;
      return module.exports.default(props);
    },
    effects() { callbacks.splice(0).forEach((callback) => cleanups.push(callback())); },
    cleanup() { cleanups.forEach((callback) => callback?.()); },
    flush: () => new Promise((resolve) => setImmediate(resolve)),
  };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}

const event = {
  id: 'created-1', bookingId: 'MTT-1', type: 'created', customerName: 'Future Client',
  branchName: 'Central', serviceName: 'Massage', therapistName: 'Tanya', date: '2026-12-01',
  time: '10:00 AM', durationMinutes: 60, previousDate: '', previousTime: '', actor: '',
  createdAt: '2026-10-17T15:00:00Z',
};

test('activity groups by appointment date, retains reschedule history and sorts changes newest-first', () => {
  const ui = harness('BookingActivityFeed', { initial: [[
    event,
    { ...event, id: 'past', customerName: 'Past Client', date: '2026-01-01' },
    { ...event, id: 'rescheduled', type: 'rescheduled', customerName: 'Moved Client', previousDate: '2026-11-30', previousTime: '09:00 AM', createdAt: '2026-10-17T16:00:00Z', actor: 'customer' },
  ]] });
  let tree = ui.render();
  let html = renderToStaticMarkup(tree);
  assert.equal((html.match(/class="appointment-date-group/g) || []).length, 2);
  assert.ok(html.indexOf('dateTime="2026-12-01"') < html.indexOf('dateTime="2026-01-01"'));
  assert.ok(html.indexOf('Moved Client') < html.indexOf('Future Client'));
  assert.match(html, /2026-11-30.*09:00 AM/);
  assert.match(html, /By customer/);
  assert.match(html, /dateTime="2026-10-17T16:00:00Z"/);
  find(tree, (node) => node.type === 'select').props.onChange({ target: { value: 'asc' } });
  html = renderToStaticMarkup(ui.render());
  assert.ok(html.indexOf('dateTime="2026-01-01"') < html.indexOf('dateTime="2026-12-01"'));
  tree = ui.render();
  find(tree, (node) => node.type === 'button' && Array.isArray(node.props.children) && node.props.children[0] === 'Rescheduled').props.onClick();
  html = renderToStaticMarkup(ui.render());
  assert.match(html, /Moved Client/);
  assert.doesNotMatch(html, /Past Client|Future Client/);
});

test('activity icon refresh preserves fetch errors and recovers without changing the seven-day scope', async () => {
  let fail = true;
  const requests = [];
  const ui = harness('BookingActivityFeed', { fetch: async (url) => {
    requests.push(url);
    return { ok: !fail, json: async () => fail ? { message: 'Activity unavailable' } : { events: [event] } };
  } });
  const refresh = () => find(ui.render(), (node) => node.type === 'button' && node.props.title === 'Refresh');
  refresh().props.onClick();
  await ui.flush();
  assert.match(renderToStaticMarkup(ui.render()), /role="alert"[^>]*>Activity unavailable/);
  fail = false;
  refresh().props.onClick();
  await ui.flush();
  assert.match(renderToStaticMarkup(ui.render()), /Future Client/);
  assert.doesNotMatch(renderToStaticMarkup(ui.render()), /Activity unavailable/);
  assert.deepEqual(requests, ['/api/booking?view=booking-activity&days=7', '/api/booking?view=booking-activity&days=7']);
});

const props = {
  branches: [{ id: 1, name: 'Central' }, { id: 2, name: 'West' }],
  therapists: [{ id: 7, name: 'Tanya', branches: [1, 2], schedule: {} }],
  initialBranchId: '2', initialDate: '2026-12-15', onOpenFullSchedule() {},
};

test('calendar availability loads and saves the selected date and branch, and supports another month', async () => {
  const requests = [], opened = [];
  let saves = 0;
  const ui = harness('TodayWorkSchedule', { effects: true, fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => options.method === 'POST'
      ? { override: JSON.parse(options.body).override } : { overrides: [] } };
  } });
  const inputProps = { ...props, onSaved() { saves++; }, onOpenFullSchedule: (...args) => opened.push(args) };
  const render = () => {
    const tree = ui.render(inputProps);
    ui.effects();
    return tree;
  };
  render();
  await ui.flush();
  let tree = render();
  assert.match(requests[0].url, /month=2026-12&branchId=2/);
  assert.equal(find(tree, (node) => node.type === 'input' && node.props.type === 'date').props.value, '2026-12-15');
  find(tree, (node) => node.type === 'input' && node.props.type === 'date').props.onChange({ target: { value: '2027-01-04' } });
  render();
  await ui.flush();
  tree = render();
  assert.match(requests.at(-1).url, /month=2027-01&branchId=2/);
  find(tree, (node) => node.type === 'button' && node.props['aria-label'] === 'Set availability for Tanya').props.onClick();
  tree = render();
  const save = find(tree, (node) => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('Save availability'));
  save.props.onClick();
  await ui.flush();
  tree = render();
  const body = JSON.parse(requests.at(-1).options.body);
  assert.equal(body.date, '2027-01-04');
  assert.equal(body.branchId, 2);
  assert.equal(body.therapistId, 7);
  assert.equal(body.override.date, '2027-01-04');
  assert.equal(saves, 1);
  assert.match(renderToStaticMarkup(tree), /Therapist availability was saved for this date/);
  find(tree, (node) => node.type === 'button' && node.props.children === 'Open full Work schedule').props.onClick();
  assert.deepEqual(opened, [['2', '2027-01-04']]);
});

test('date-specific availability reports failed writes and never announces a successful save', async () => {
  let saved = false;
  const ui = harness('TodayWorkSchedule', { fetch: async () => ({
    ok: false, json: async () => ({ message: 'This branch is not assigned to you.' }),
  }) });
  const inputProps = { ...props, onSaved() { saved = true; } };
  let tree = ui.render(inputProps);
  find(tree, (node) => node.type === 'button' && node.props['aria-label'] === 'Set availability for Tanya').props.onClick();
  tree = ui.render(inputProps);
  find(tree, (node) => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('Save availability')).props.onClick();
  await ui.flush();
  tree = ui.render(inputProps);
  assert.match(renderToStaticMarkup(tree), /role="alert"[^>]*>This branch is not assigned to you/);
  assert.equal(saved, false);
  assert.ok(find(tree, (node) => node.props?.role === 'dialog'));
});

test('availability modal uses the top layer, blocks closing during saves, and closes its native dialog on unmount', () => {
  const ui = harness('CalendarAvailability', { effects: true });
  let closed = 0, shown = 0, dismissed = 0;
  const dialogProps = { ...props, onClose() { closed++; } };
  let tree = ui.render(dialogProps);
  ui.refs[0].current = { showModal() { shown++; }, close() { dismissed++; } };
  ui.effects();
  assert.equal(shown, 1);
  find(tree, (node) => typeof node.type === 'function' && node.props.onBusyChange).props.onBusyChange(true);
  tree = ui.render(dialogProps);
  tree.props.onCancel({ preventDefault() {} });
  assert.equal(closed, 0);
  assert.equal(find(tree, (node) => node.type === 'button').props.disabled, true);
  find(tree, (node) => typeof node.type === 'function' && node.props.onBusyChange).props.onBusyChange(false);
  tree = ui.render(dialogProps);
  tree.props.onCancel({ preventDefault() {} });
  assert.equal(closed, 1);
  ui.cleanup();
  assert.equal(dismissed, 1);
});

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let openWorkSchedule;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'openCalendarWorkSchedule') openWorkSchedule = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

test('Work schedule shortcut preserves date/branch and exits native fullscreen before navigation', async () => {
  for (const native of [false, true, 'failure']) {
    const panel = {};
    const calls = [], errors = [];
    const context = {
      Error,
      calendarBranch: '2', calendarDate: '2027-02-15', calendarPanelRef: { current: panel },
      document: { fullscreenElement: native ? panel : null, async exitFullscreen() {
        calls.push('exit');
        if (native === 'failure') throw new Error('Exit failed');
      } },
      setCalendarFullscreenError: (value) => errors.push(value),
      setWorkScheduleInitialBranchId: (value) => calls.push(['branch', value]),
      setWorkScheduleInitialDate: (value) => calls.push(['date', value]),
      setCalendarAvailabilityOpen: (value) => calls.push(['availability', value]),
      setActiveTab: (value) => calls.push(['tab', value]),
    };
    await vm.runInNewContext(`(${openWorkSchedule})()`, context);
    if (native === 'failure') {
      assert.deepEqual(calls, ['exit']);
      assert.equal(errors.at(-1), 'Exit failed');
    } else {
      if (native) assert.equal(calls.shift(), 'exit');
      assert.deepEqual(calls, [['branch', '2'], ['date', '2027-02-15'], ['availability', false], ['tab', 'work-schedule']]);
    }
  }
});

test('Work schedule starts in the shortcut month instead of the current month', () => {
  const ui = harness('WorkSchedule');
  ui.render({ ...props, initialDate: '2027-02-15' });
  assert.equal(ui.states[0], '2027-02');
  assert.equal(ui.states[1], '2');
});
