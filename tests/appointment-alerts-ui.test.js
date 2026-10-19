import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { collectAppointmentAlertCandidates } from '../lib/appointment-alerts.js';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let listExpression;
let sendExpression;
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'sendAlertReminders') sendExpression = node.initializer.getText(ast);
  if (ts.isCallExpression(node) && ts.isParenthesizedExpression(node.expression) &&
      ts.isArrowFunction(node.expression.expression) &&
      node.getText(ast).startsWith('(() => {\n              const displayed = alertsData.candidates.filter')) {
    listExpression = node.getText(ast);
  }
  ts.forEachChild(node, visit);
};
visit(ast);

function renderAudience(candidates, alertsFilter = 'all') {
  assert.ok(listExpression, 'Find the actual reminder list rendering expression');
  const selected = candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.id);
  const sent = [];
  const opened = [];
  const module = { exports: {} };
  const compiled = ts.transpileModule(`export default function List() { return ${listExpression}; }`, {
    fileName: 'List.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports: module.exports, require: createRequire(import.meta.url),
    alertsData: { candidates }, alertsFilter, alertsSelected: selected, isSendingAlerts: false, isLoadingAlerts: false,
    tr: (value) => value, formatTime: (value) => value,
    setAlertsSelected: () => {}, setAlertsFilter: () => {}, toggleAlertRecipient: () => {}, setCommunicationBookingId: (id) => opened.push(id),
    sendAlertReminders: (id) => sent.push(id),
    Check: () => null, Mail: () => null,
  });
  const tree = module.exports.default();
  const findAll = (node, predicate) => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
    return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children, predicate)];
  };
  return { html: renderToStaticMarkup(tree), rows: findAll(tree, (node) => node.type === 'li'), findAll, sent, opened };
}

function audience() {
  const rows = [
    ['valid', 'Email Client', '', 'client@example.com', 'Central', 'Massage', 'Staff', '2026-10-17', '10:30 AM'],
    ['missing', 'Phone Client', '437-555-1234', '', 'Central', 'Massage', 'Staff', '2026-10-17', '11:00 AM'],
    ['invalid', 'Invalid Email Client', '', 'invalid@email', 'Central', 'Massage', 'Staff', '2026-10-17', '11:30 AM'],
    ['no-show', 'No Show Client', '', 'noshow@example.com', 'Central', 'Massage', 'Staff', '2026-10-17', '12:00 PM'],
    ['past', 'Earlier Client', '', 'earlier@example.com', 'Central', 'Massage', 'Staff', '2026-10-17', '08:00 AM'],
  ];
  rows[3][24] = 'No Show';
  return collectAppointmentAlertCandidates(rows, { todayDate: '2026-10-17', nowTimeMinutes: 600 }).candidates;
}

test('actual reminder rows show missing-email badges only for invalid or absent addresses and enable valid-email controls', () => {
  const ui = renderAudience(audience());
  const rowFor = (id) => ui.rows.find((row) => row.key === id);
  for (const id of ['valid', 'past', 'no-show']) {
    assert.doesNotMatch(renderToStaticMarkup(rowFor(id)), /Missing email/);
  }
  for (const id of ['missing', 'invalid', 'no-show']) {
    const row = rowFor(id);
    assert.equal(ui.findAll(row, (node) => node.type === 'input')[0].props.disabled, true);
    assert.equal(ui.findAll(row, (node) => node.type === 'button' && node.props['aria-label'] === 'Send reminder to {name}')[0].props.disabled, true);
  }
  for (const id of ['missing', 'invalid']) assert.match(renderToStaticMarkup(rowFor(id)), /Missing email/);
  const valid = rowFor('valid');
  assert.equal(ui.findAll(valid, (node) => node.type === 'input')[0].props.disabled, false);
  const send = ui.findAll(valid, (node) => node.type === 'button' && node.props['aria-label'] === 'Send reminder to {name}')[0];
  assert.equal(send.props.disabled, false);
  send.props.onClick();
  assert.deepEqual(ui.sent, ['valid']);
});

test('the actual upcoming filter excludes past and no-show appointments', () => {
  const ui = renderAudience(audience(), 'upcoming');
  assert.equal(ui.rows.length, 3);
  assert.doesNotMatch(ui.html, /Earlier Client|No Show Client/);
  assert.match(ui.html, /Email Client/);
});

test('tapping a reminder customer opens communication history without sending or changing reminder eligibility', () => {
  const ui = renderAudience(audience());
  const row = ui.rows.find((entry) => entry.key === 'no-show');
  const history = ui.findAll(row, (node) => node.type === 'button' && node.props['aria-label'] === 'Email history for {name}')[0];
  assert.equal(history.props.disabled, false);
  history.props.onClick();
  assert.deepEqual(ui.opened, ['no-show']);
  assert.deepEqual(ui.sent, []);
});
test('the reminder summary reads the API total rather than a nonexistent totalToday field', () => {
  assert.match(source, /alertsData\?\.stats\?\.total \?\? 0/);
  assert.doesNotMatch(source, /alertsData\?\.stats\?\.totalToday|candidate\.isPast/);
});

test('tracking warnings remain visible after the reminder audience refresh clears its previous error', async () => {
  let error = '', result = '', sends = 0;
  const setAlertsError = (value) => { error = typeof value === 'function' ? value(error) : value; };
  await vm.runInNewContext(`(${sendExpression})('valid')`, {
    alertsSelected: [], setAlertsError, setAlertsResult(value) { result = value; }, setIsSendingAlerts() {},
    tr: (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key])),
    fetch: async () => { sends++; return { ok: true, json: async () => ({ sent: 1, failed: 0, trackingWarnings: ['valid'] }) }; },
    loadAlerts: async () => { setAlertsError(''); }, loadBookingsFromBackend: async () => {},
  });
  assert.equal(sends, 1);
  assert.match(result, /Reminder sent to 1 customer/);
  assert.match(error, /open tracking could not be saved for: valid/);
});
