import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function harness({ permission = 'granted', supported = true } = {}) {
  let stateIndex = 0, effectIndex = 0, poll, visibility, cleanupCount = 0;
  const states = [], effects = [], requests = [], nativeAlerts = [], responses = [];
  const translate = (text, values = {}) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key]));
  const hooks = {
    ...React,
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useEffect(callback, deps) {
      const index = effectIndex++;
      if (!effects[index] || deps.some((value, key) => value !== effects[index].deps[key])) {
        effects[index]?.cleanup?.();
        effects[index] = { deps, cleanup: callback() };
      }
    },
  };
  class BrowserNotification {
    static permission = permission;
    static async requestPermission() { return 'granted'; }
    constructor(title, options) { nativeAlerts.push({ title, options }); }
  }
  const compiled = ts.transpileModule(readFileSync(new URL('../src/BookingNotifications.tsx', import.meta.url), 'utf8'), {
    fileName: 'BookingNotifications.tsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, AbortController, Date, Error,
    ...(supported ? { Notification: BrowserNotification } : {}),
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react-dom') return { createPortal: (content) => content };
      if (name === './localization') return { useTranslation: () => ({ translate, formatTime: (time) => time }) };
      return require(name);
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      const data = responses.shift();
      if (!data) throw new Error('Synthetic offline error');
      return { ok: !data.message, json: async () => data };
    },
    window: { setInterval(callback, delay) { assert.equal(delay, 15000); poll = callback; return 1; }, clearInterval() { cleanupCount++; } },
    document: { hidden: false, addEventListener(_event, callback) { visibility = callback; }, removeEventListener() {} },
  });
  const render = (userId = 'owner') => {
    stateIndex = effectIndex = 0;
    return module.exports.default({ userId });
  };
  return {
    render, responses, requests, nativeAlerts,
    poll: () => poll(), resume: () => visibility(),
    flush: () => new Promise((resolve) => setImmediate(resolve)),
    cleanup: () => effects.forEach((effect) => effect.cleanup?.()),
    get cleanupCount() { return cleanupCount; },
  };
}

const initial = '2026-10-17T15:00:00.000Z';
const booking = { id: 'new-booking', customerName: 'Test Client', branchName: 'Test Branch', serviceName: 'Massage',
  therapistName: 'Test Therapist', date: '2026-10-18', time: '10:00 AM', durationMinutes: 90, createdAt: '2026-10-17T15:00:03.000Z' };

test('dashboard alerts baseline quietly, poll independently, deduplicate overlap reads and render dismissible popups', async () => {
  const ui = harness();
  ui.responses.push({ cursor: initial, notifications: [] });
  ui.render();
  await ui.flush();
  assert.equal(ui.nativeAlerts.length, 0);
  ui.responses.push({ cursor: '2026-10-17T15:00:15.000Z', notifications: [booking, { ...booking, id: 'old', createdAt: '2026-10-17T14:59:00.000Z' }] });
  ui.poll();
  await ui.flush();
  let tree = ui.render();
  assert.equal(ui.requests.length, 2, 'Rerenders must not restart polling');
  assert.match(ui.requests[1].url, /since=2026-10-17T15/);
  assert.equal(ui.nativeAlerts.length, 1);
  assert.doesNotMatch(JSON.stringify(ui.nativeAlerts), /Test Client/, 'Native alerts do not expose personal details');
  assert.match(renderToStaticMarkup(tree), /alertdialog[\s\S]*Test Client[\s\S]*90 minutes/);
  ui.responses.push({ cursor: '2026-10-17T15:00:30.000Z', notifications: [booking] });
  ui.resume();
  await ui.flush();
  assert.equal(ui.nativeAlerts.length, 1);
  tree = ui.render();
  const find = (node) => {
    if (!node || typeof node !== 'object') return undefined;
    if (node.type === 'button' && node.props.children === 'Dismiss') return node;
    return React.Children.toArray(node.props?.children).map(find).find(Boolean);
  };
  find(tree).props.onClick();
  assert.doesNotMatch(renderToStaticMarkup(ui.render()), /alertdialog/);
  ui.cleanup();
  assert.equal(ui.cleanupCount, 1);
  assert.equal(ui.requests[0].options.signal.aborted, true);
});

test('denied or unsupported browser notifications do not prevent in-app alerts; polling errors remain visible', async () => {
  for (const options of [{ permission: 'denied' }, { supported: false }]) {
    const ui = harness(options);
    ui.responses.push({ cursor: initial, notifications: [] });
    ui.render();
    await ui.flush();
    ui.poll();
    await ui.flush();
    assert.match(renderToStaticMarkup(ui.render()), /Synthetic offline error/);
    ui.responses.push({ cursor: '2026-10-17T15:00:30.000Z', notifications: [booking] });
    ui.poll();
    await ui.flush();
    const html = renderToStaticMarkup(ui.render());
    assert.match(html, /Test Client/);
    assert.doesNotMatch(html, /Synthetic offline error/);
    assert.equal(ui.nativeAlerts.length, 0);
    ui.cleanup();
  }
});
