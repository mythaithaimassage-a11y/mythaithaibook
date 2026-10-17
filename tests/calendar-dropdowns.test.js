import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/useCalendarDropdowns.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(enabled = true) {
  const listeners = new Map(), panelListeners = new Map(), timers = new Map();
  let id = 0, cleanup;
  class Node {}
  class Element extends Node {
    constructor(parent = null, tag = '') { super(); this.parent = parent; this.tag = tag; }
    contains(node) { return node === this || Boolean(node?.parent && this.contains(node.parent)); }
    closest(selector) {
      return selector.split(', ').includes(this.tag) ? this : this.parent?.closest(selector) || null;
    }
    focus() { document.activeElement = this; }
  }
  class HTMLDetailsElement extends Element {
    constructor() { super(null, 'details'); this.open = false; this.summary = new Element(this, 'summary'); }
    querySelector() { return this.summary; }
  }
  const menus = [new HTMLDetailsElement(), new HTMLDetailsElement(), new HTMLDetailsElement()];
  const document = {
    activeElement: null,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); },
  };
  const panel = {
    querySelectorAll(selector) { assert.equal(selector, '.calendar-actions details'); return menus; },
    addEventListener(name, callback) { panelListeners.set(name, callback); },
    removeEventListener(name, callback) { assert.equal(panelListeners.get(name), callback); panelListeners.delete(name); },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, document, Node, Element, HTMLDetailsElement,
    setTimeout(callback, delay) { assert.equal(delay, 5000); timers.set(++id, callback); return id; },
    clearTimeout(key) { timers.delete(key); },
    require: () => ({ useEffect(callback) { cleanup = callback(); } }),
  });
  exports.default({ current: panel }, enabled);
  return {
    menus, document, listeners, panelListeners, timers, Element,
    open(index) {
      menus[index].open = true;
      panelListeners.get('toggle')({ target: menus[index] });
    },
    expire() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
    cleanup: () => cleanup?.(),
  };
}

test('calendar dropdowns close after five idle seconds and opening one closes the previous menu', () => {
  const ui = harness();
  ui.open(0);
  assert.equal(ui.timers.size, 1);
  ui.open(1);
  assert.equal(ui.menus[0].open, false);
  assert.equal(ui.menus[1].open, true);
  assert.equal(ui.timers.size, 1);
  ui.expire();
  assert.equal(ui.menus[1].open, false);
  assert.equal(ui.timers.size, 0);
});

test('outside taps and selected actions dismiss menus, including actions that close themselves', () => {
  const ui = harness();
  ui.open(0);
  ui.listeners.get('pointerdown')({ target: new ui.Element(ui.menus[0]) });
  assert.equal(ui.menus[0].open, true);
  ui.listeners.get('pointerdown')({ target: new ui.Element() });
  assert.equal(ui.menus[0].open, false);
  ui.open(1);
  ui.listeners.get('click')({ target: new ui.Element(new ui.Element(ui.menus[1], 'button'), 'svg') });
  assert.equal(ui.menus[1].open, false);
  ui.open(2);
  ui.menus[2].open = false;
  ui.listeners.get('click')({ target: new ui.Element(ui.menus[2], 'button') });
  assert.equal(ui.timers.size, 0);
});

test('interaction resets idle timeout and focused keyboard controls are not dismissed by the timer', () => {
  const ui = harness();
  ui.open(0);
  const first = [...ui.timers.keys()][0];
  ui.panelListeners.get('change')();
  assert.equal(ui.timers.has(first), false);
  ui.document.activeElement = new ui.Element(ui.menus[0], 'input');
  ui.expire();
  assert.equal(ui.menus[0].open, true);
  assert.equal(ui.timers.size, 1);
  ui.document.activeElement = ui.menus[0].summary;
  ui.expire();
  assert.equal(ui.menus[0].open, false);
});

test('Escape closes only the menu, returns focus and prevents fullscreen Escape handling', () => {
  const ui = harness();
  ui.open(1);
  let prevented = false, stopped = false;
  ui.listeners.get('keydown')({
    key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() { stopped = true; },
  });
  assert.equal(ui.menus[1].open, false);
  assert.equal(ui.document.activeElement, ui.menus[1].summary);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

test('leaving the calendar closes menus and clears timers and document listeners', () => {
  const ui = harness();
  ui.open(0);
  ui.cleanup();
  assert.equal(ui.menus[0].open, false);
  assert.equal(ui.timers.size, 0);
  assert.equal(ui.listeners.size, 0);
  assert.equal(ui.panelListeners.size, 0);
  const disabled = harness(false);
  assert.equal(disabled.listeners.size, 0);
});
