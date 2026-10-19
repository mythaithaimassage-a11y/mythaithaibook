import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { calendarEventRange, calendarEventStyle } from '../lib/calendar-layout.js';

const appointment = (id, time, start, end) => ({
  id, localTime: time, start: { dateTime: start }, end: { dateTime: end },
});

test('10 AM to 11:30 AM occupies six 15-minute rows, not only its start row', () => {
  const event = appointment('a', '10:00', '2026-10-17T10:00:00-04:00', '2026-10-17T11:30:00-04:00');
  assert.deepEqual(calendarEventRange(event), { start: 600, end: 690 });
  const style = calendarEventStyle(event);
  assert.equal(style.height + 4, 6 * 40);
  assert.equal(style.top, 2);
  assert.deepEqual(calendarEventRange({ ...event, start: event.start.dateTime, end: event.end.dateTime }), { start: 600, end: 690 }, 'The calendar API returns string timestamps');
  const range = calendarEventRange(event);
  for (const minute of [600, 615, 630, 645, 660, 675]) {
    assert.ok(range.start < minute + 15 && range.end > minute);
  }
  assert.equal(range.end > 690, false, 'The end boundary is free, before any separate buffer');
});

test('non-quarter-hour starts, cross-midnight ends, and stored duration retain exact geometry', () => {
  const event = appointment('a', '10:07', '2026-10-17T10:07:00-04:00', '2026-10-17T11:37:00-04:00');
  assert.equal(calendarEventStyle(event).top, 7 / 15 * 40 + 2);
  assert.equal(calendarEventStyle(event).height, 236);
  assert.equal(calendarEventRange(appointment('b', '23:30', '2026-10-17T23:30:00-04:00', '2026-10-18T01:00:00-04:00')).end, 1500);
  assert.equal(calendarEventStyle({ id: 'c', localTime: '10:00', booking: { durationMinutes: 60 } }).height, 156);
  assert.throws(() => calendarEventRange({ id: 'bad', localTime: '10:00' }), /invalid start or end/);
});

test('overlapping appointments get separate lanes, adjacent appointments regain full width', () => {
  const a = appointment('a', '10:00', '2026-10-17T10:00:00-04:00', '2026-10-17T11:30:00-04:00');
  const b = appointment('b', '10:30', '2026-10-17T10:30:00-04:00', '2026-10-17T11:00:00-04:00');
  const c = appointment('c', '11:30', '2026-10-17T11:30:00-04:00', '2026-10-17T12:30:00-04:00');
  const events = [c, b, a];
  assert.equal(calendarEventStyle(a, events).width, 'calc(50% - 8px)');
  assert.equal(calendarEventStyle(b, events).left, 'calc(50% + 4px)');
  assert.equal(calendarEventStyle(c, events).width, 'calc(100% - 8px)');
});

test('appointments crossing business hours are clipped without changing their stored times', () => {
  const early = appointment('early', '09:30', '2026-10-17T09:30:00-04:00', '2026-10-17T10:30:00-04:00');
  const late = appointment('late', '19:30', '2026-10-17T19:30:00-04:00', '2026-10-17T20:30:00-04:00');
  for (const event of [early, late]) {
    const style = calendarEventStyle(event, [event], { start: 600, end: 1200 });
    assert.equal(style.top, 2);
    assert.equal(style.height, 76);
    assert.equal(calendarEventStyle(event).height, 156);
  }
});

test('the actual therapist grid renders full-duration cards and keeps covered rows occupied', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'calendarDisplaySlots.map') expression = node.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(expression);
  const assigned = { id: 'a', localTime: '10:00', start: '2026-10-17T10:00:00-04:00', end: '2026-10-17T11:30:00-04:00', therapistName: 'Therapist', summary: '90 minute appointment' };
  const unassigned = { ...assigned, id: 'b', therapistName: 'Any Available' };
  const module = { exports: {} };
  const compiled = ts.transpileModule(`export default function Grid() { return <>${'{' + expression + '}'}</>; }`, {
    fileName: 'Grid.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports: module.exports, require: createRequire(import.meta.url),
    calendarDisplaySlots: Array.from({ length: 7 }, (_, index) => ({ label: String(index), minutes: 600 + index * 15 })),
    calendarFirstMinute: 600, calendarLastMinute: 1200,
    calendarColumnTherapists: [{ id: 1, name: 'Therapist' }], therapists: [],
    calendarHasUnassignedColumn: true, visibleCalendarEvents: [assigned, unassigned],
    calendarUnavailability: [], calendarGapMinutes: 0,
    getAssignedTherapistNames: (name) => [name], calendarEventRange, calendarEventStyle,
    getTherapistCalendarColor: () => ({ event: '', text: '' }), formatTime: (value) => value,
    tr: (value) => value,
  });
  const rows = module.exports.default().props.children;
  const firstCells = React.Children.toArray(rows[0].props.children);
  const button = React.Children.toArray(firstCells[1].props.children)[0];
  assert.equal(button.type, 'button');
  assert.equal(button.props.style.height, 236);
  assert.equal(React.Children.toArray(firstCells[2].props.children)[0].props.style.height, 236, 'Unassigned appointments span their duration too');
  for (const row of rows.slice(1, 6)) {
    const cell = React.Children.toArray(row.props.children)[1];
    assert.equal(React.Children.toArray(cell.props.children).length, 0, 'Covered rows are not rendered as free time');
  }
  const endCell = React.Children.toArray(rows[6].props.children)[1];
  assert.equal(React.Children.toArray(endCell.props.children)[0].props['aria-hidden'], 'true', 'The end-time boundary is free');
});
