import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/useCalendarGestures.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(overrides = {}) {
  const listeners = new Map();
  const windowListeners = new Map();
  const refs = [];
  let index = 0;
  let effects = [];
  let previousEffects = [];
  const navigations = [];
  class Element {
    constructor(excluded = false) { this.excluded = excluded; }
    closest() { return this.excluded ? this : null; }
  }
  const panel = {
    scrollTop: 0, scrollHeight: 1000, clientHeight: 400,
    rect: { top: -400, bottom: 740 },
    getBoundingClientRect() { return this.rect; },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); },
  };
  const window = {
    scrollY: 0, innerHeight: 740,
    scrollTo({ top }) { this.scrollY = top; },
    addEventListener(name, callback) { windowListeners.set(name, callback); },
    removeEventListener(name, callback) { assert.equal(windowListeners.get(name), callback); windowListeners.delete(name); },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, window, Element,
    require: () => ({
      useRef(value) { return refs[index++] ||= { current: value }; },
      useEffect(callback, deps) { effects.push({ callback, deps }); },
    }),
  });
  const options = {
    panelRef: { current: panel }, enabled: true, fullscreen: true, blocked: false, date: '2026-10-17',
    onNavigate(days) { navigations.push(days); }, ...overrides,
  };
  const render = () => {
    index = 0;
    effects = [];
    exports.default(options);
    effects.forEach((effect, i) => {
      const previous = previousEffects[i];
      if (!effect.deps || !previous || effect.deps.some((dep, j) => dep !== previous.deps[j])) {
        previous?.cleanup?.();
        effect.cleanup = effect.callback();
      } else effect.cleanup = previous.cleanup;
    });
    previousEffects = effects;
  };
  render();
  const target = new Element();
  const touch = (name, x, y, extra = {}) => {
    const point = { clientX: x, clientY: y };
    let prevented = false;
    listeners.get(`touch${name}`)?.({
      target, touches: name === 'end' ? [] : [point], changedTouches: [point],
      cancelable: true, preventDefault() { prevented = true; }, ...extra,
    });
    return prevented;
  };
  return { panel, window, options, render, listeners, windowListeners, touch, target, Element, navigations,
    cleanup() { previousEffects.forEach((effect) => effect.cleanup?.()); } };
}

test('mobile horizontal swipes navigate once, reset scroll after the date changes, and preserve vertical scrolling', () => {
  const h = harness();
  h.touch('start', 200, 100);
  assert.equal(h.touch('move', 100, 105), true);
  h.touch('end', 100, 105);
  assert.deepEqual(h.navigations, [1]);
  h.panel.scrollTop = 400;
  h.options.date = '2026-10-18';
  h.render();
  assert.equal(h.panel.scrollTop, 0);
  h.touch('start', 100, 100);
  h.touch('move', 200, 105);
  h.touch('end', 200, 105);
  assert.deepEqual(h.navigations, [1, -1]);
  h.touch('start', 200, 100);
  assert.equal(h.touch('move', 190, 200), false);
  h.touch('end', 190, 200);
  assert.deepEqual(h.navigations, [1, -1]);
  h.cleanup();
  assert.equal(h.listeners.size, 0);
});

test('bottom scrolling advances once per gesture and never on initial layout, resets, upward scrolling, or short days', () => {
  const h = harness();
  h.panel.scrollTop = 600;
  h.listeners.get('scroll')();
  assert.deepEqual(h.navigations, []);
  h.panel.scrollTop = 400;
  h.listeners.get('scroll')();
  h.touch('start', 100, 400);
  h.touch('move', 100, 200);
  h.panel.scrollTop = 600;
  h.listeners.get('scroll')();
  h.listeners.get('scroll')();
  assert.deepEqual(h.navigations, [1]);
  h.options.date = '2026-10-18';
  h.render();
  h.panel.scrollTop = 600;
  h.listeners.get('scroll')();
  assert.deepEqual(h.navigations, [1], 'Inertial scrolling after navigation must not skip dates');
  h.touch('start', 100, 200);
  h.panel.scrollTop = 400;
  h.listeners.get('scroll')();
  assert.deepEqual(h.navigations, [1]);
  h.panel.scrollHeight = 400;
  h.panel.scrollTop = 0;
  h.listeners.get('scroll')();
  assert.deepEqual(h.navigations, [1], 'An empty day must not auto-advance');
});

test('controls, loading, menus, errors and dialogs do not trigger gestures; multi-touch and cancelled gestures are ignored', () => {
  const h = harness();
  const swipe = (extra) => {
    h.touch('start', 200, 100, extra);
    h.touch('move', 100, 100);
    h.touch('end', 100, 100);
  };
  swipe({ target: new h.Element(true) });
  h.options.blocked = true;
  h.render();
  swipe();
  h.options.blocked = false;
  h.render();
  swipe({ touches: [{ clientX: 200, clientY: 100 }, { clientX: 210, clientY: 100 }] });
  h.touch('start', 200, 100);
  h.touch('cancel', 200, 100);
  h.touch('end', 100, 100);
  h.touch('start', 200, 100);
  h.touch('move', 180, 100);
  h.touch('end', 180, 100);
  assert.deepEqual(h.navigations, []);
});

test('non-fullscreen mobile scrolling uses the page and returns to the calendar top; desktop installs no gestures', () => {
  const h = harness({ fullscreen: false });
  h.touch('start', 100, 400);
  h.window.scrollY = 400;
  h.windowListeners.get('scroll')();
  assert.deepEqual(h.navigations, [1]);
  h.options.date = '2026-10-18';
  h.render();
  assert.equal(h.window.scrollY, 0);
  h.cleanup();
  assert.equal(h.windowListeners.size, 0);
  assert.equal(harness({ enabled: false }).listeners.size, 0);
});

test('mobile wheel scrolling can advance a date without allowing momentum to skip another', () => {
  const h = harness();
  const wheel = () => h.listeners.get('wheel')({ target: h.target, deltaY: 30, deltaX: 0, ctrlKey: false });
  wheel();
  h.panel.scrollTop = 600;
  h.listeners.get('scroll')();
  assert.deepEqual(h.navigations, [1]);
  h.options.date = '2026-10-18';
  h.render();
  wheel();
  h.panel.scrollTop = 600;
  h.listeners.get('scroll')();
  assert.deepEqual(h.navigations, [1]);
});
