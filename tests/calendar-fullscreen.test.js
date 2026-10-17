import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expressions = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'toggleCalendarFullscreen') {
    expressions.toggle = node.initializer.getText(ast);
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const callback = node.arguments[0]?.getText(ast) || '';
    if (callback.includes('const syncFullscreenState')) expressions.sync = callback;
    if (callback.includes('const exitViewportCalendar')) expressions.viewport = callback;
    if (callback.includes("if (activeTab !== 'calendar') setCalendarFullscreen(false)")) expressions.navigation = callback;
  }
  ts.forEachChild(node, visit);
}
visit(ast);

function harness(panel = {}) {
  const listeners = new Map();
  const context = vm.createContext({
    Error,
    calendarPanelRef: { current: panel },
    calendarFullscreen: false,
    compactCalendar: false,
    calendarFullscreenError: '',
    activeTab: 'calendar',
    selectedCalendarEvent: null,
    quickBooking: null,
    editingBooking: null,
    document: {
      fullscreenElement: null,
      body: { style: { overflow: 'auto' } },
      documentElement: { style: { overflow: '' } },
      addEventListener(type, callback) { listeners.set(type, callback); },
      removeEventListener(type, callback) {
        assert.equal(listeners.get(type), callback);
        listeners.delete(type);
      },
    },
  });
  context.setCalendarFullscreen = (value) => { context.calendarFullscreen = value; };
  context.setCalendarFullscreenError = (value) => { context.calendarFullscreenError = value; };
  const run = (name) => {
    assert.ok(expressions[name], `Missing ${name} handler`);
    const compiled = ts.transpileModule(`(${expressions[name]})()`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return vm.runInContext(compiled, context);
  };
  return { context, listeners, run };
}

test('fit-to-screen enters and exits viewport mode when mobile fullscreen APIs are absent', async () => {
  const { context, run } = harness();
  await run('toggle');
  assert.equal(context.calendarFullscreen, true);
  assert.equal(context.calendarFullscreenError, '');
  await run('toggle');
  assert.equal(context.calendarFullscreen, false);
});

test('disabled or incomplete fullscreen implementations use the viewport layout', async () => {
  for (const enabled of [true, false]) {
    let requests = 0;
    const { context, run } = harness({ requestFullscreen() { requests++; } });
    context.document.fullscreenEnabled = enabled;
    if (!enabled) context.document.exitFullscreen = async () => {};
    await run('toggle');
    assert.equal(requests, 0);
    assert.equal(context.calendarFullscreen, true);
    assert.equal(context.calendarFullscreenError, '');
  }
});

test('mobile fit uses viewport mode even when native fullscreen is available, keeping dashboard navigation visible', async () => {
  const { context, run } = harness({
    requestFullscreen() { assert.fail('Mobile calendar must retain app navigation'); },
  });
  context.compactCalendar = true;
  context.document.exitFullscreen = async () => {};
  await run('toggle');
  assert.equal(context.calendarFullscreen, true);
  await run('toggle');
  assert.equal(context.calendarFullscreen, false);
});
test('supported browsers enter native fullscreen, track browser exit and clean up listeners', async () => {
  const { context, run, listeners } = harness();
  const panel = context.calendarPanelRef.current;
  let requests = 0;
  panel.requestFullscreen = async function () {
    assert.equal(this, panel);
    requests++;
    context.document.fullscreenElement = panel;
    listeners.get('fullscreenchange')();
  };
  context.document.exitFullscreen = async () => {
    context.document.fullscreenElement = null;
    listeners.get('fullscreenchange')();
  };
  const cleanup = run('sync');
  await run('toggle');
  assert.equal(requests, 1);
  assert.equal(context.calendarFullscreen, true);
  await run('toggle');
  assert.equal(context.calendarFullscreen, false);
  await run('toggle');
  await context.document.exitFullscreen();
  assert.equal(context.calendarFullscreen, false, 'Browser Escape is reflected in the UI');
  cleanup();
  assert.equal(listeners.size, 0);
});

test('a rejected native request still fits the calendar and explicitly reports the browser error', async () => {
  const { context, run } = harness({
    async requestFullscreen() { throw new Error('Fullscreen is not allowed'); },
  });
  context.document.exitFullscreen = async () => {};
  await run('toggle');
  assert.equal(context.calendarFullscreen, true);
  assert.equal(context.calendarFullscreenError, 'Fullscreen is not allowed');
  await run('toggle');
  assert.equal(context.calendarFullscreen, false);
  assert.equal(context.calendarFullscreenError, '');
});

test('a rejected native exit keeps the fitted calendar open and reports the error', async () => {
  const { context, run } = harness();
  context.calendarFullscreen = true;
  context.document.fullscreenElement = context.calendarPanelRef.current;
  context.document.exitFullscreen = async () => { throw new Error('Exit failed'); };
  await run('toggle');
  assert.equal(context.calendarFullscreen, true);
  assert.equal(context.calendarFullscreenError, 'Exit failed');
});

test('missing calendar panels report an error without claiming fullscreen succeeded', async () => {
  const { context, run, listeners } = harness(null);
  await run('toggle');
  assert.equal(context.calendarFullscreen, false);
  assert.equal(context.calendarFullscreenError, 'Unable to change calendar fullscreen mode.');
  const cleanup = run('sync');
  context.document.fullscreenElement = null;
  listeners.get('fullscreenchange')();
  cleanup();
  assert.equal(context.calendarFullscreen, false);
});

test('viewport mode locks page scrolling, respects dialogs on Escape and restores original styles', () => {
  const { context, listeners, run } = harness();
  context.calendarFullscreen = true;
  const cleanup = run('viewport');
  assert.equal(context.document.body.style.overflow, 'hidden');
  assert.equal(context.document.documentElement.style.overflow, 'hidden');
  for (const state of ['selectedCalendarEvent', 'quickBooking', 'editingBooking']) {
    context[state] = {};
    listeners.get('keydown')({ key: 'Escape', defaultPrevented: false });
    assert.equal(context.calendarFullscreen, true);
    context[state] = null;
  }
  listeners.get('keydown')({ key: 'Escape', defaultPrevented: true });
  assert.equal(context.calendarFullscreen, true);
  listeners.get('keydown')({ key: 'Enter', defaultPrevented: false });
  assert.equal(context.calendarFullscreen, true);
  listeners.get('keydown')({ key: 'Escape', defaultPrevented: false });
  assert.equal(context.calendarFullscreen, false);
  cleanup();
  assert.equal(context.document.body.style.overflow, 'auto');
  assert.equal(context.document.documentElement.style.overflow, '');
  assert.equal(listeners.size, 0);
});

test('leaving the calendar resets viewport mode and inactive layouts do not lock scrolling', () => {
  const { context, run } = harness();
  assert.equal(run('viewport'), undefined);
  context.calendarFullscreen = true;
  context.activeTab = 'availability';
  assert.equal(run('viewport'), undefined);
  assert.equal(context.document.body.style.overflow, 'auto');
  run('navigation');
  assert.equal(context.calendarFullscreen, false);
});

test('mobile calendar navigation automatically fits the viewport without requesting native fullscreen', () => {
  const { context, run } = harness({
    requestFullscreen() { assert.fail('Automatic mobile layout must not request native fullscreen'); },
  });
  context.compactCalendar = true;
  run('navigation');
  assert.equal(context.calendarFullscreen, true);
  context.activeTab = 'schedule';
  run('navigation');
  assert.equal(context.calendarFullscreen, false);
  context.activeTab = 'calendar';
  run('navigation');
  assert.equal(context.calendarFullscreen, true);
  context.compactCalendar = false;
  run('navigation');
  assert.equal(context.calendarFullscreen, false);
  context.calendarFullscreen = true;
  context.document.fullscreenElement = context.calendarPanelRef.current;
  run('navigation');
  assert.equal(context.calendarFullscreen, true, 'Desktop native fullscreen remains supported');
});
