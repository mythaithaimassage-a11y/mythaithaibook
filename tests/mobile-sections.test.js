import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { createTsLoader } from './helpers/load-ts-module.js';

const load = createTsLoader();
const { default: ResponsiveTable } = load(new URL('../src/ResponsiveTable.tsx', import.meta.url).pathname);
const { default: MobileHelp } = load(new URL('../src/MobileHelp.tsx', import.meta.url).pathname);
const { LanguageProvider } = load(new URL('../src/localization.tsx', import.meta.url).pathname);
const el = React.createElement;

function walk(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map((child) => walk(child, predicate)).find(Boolean);
  return predicate(node) ? node : walk(node.props?.children, predicate);
}

test('mobile table cards preserve column labels, row headings, captions and empty-state spans', () => {
  const markup = renderToStaticMarkup(el(ResponsiveTable, { 'aria-label': 'Monthly shifts', className: 'min-w-[900px]' },
    el('caption', null, 'October'),
    el('thead', null, el('tr', null, el('th', null, 'Staff'), el('th', null, 'Monday'), el('th', null, 'Tuesday'))),
    el('tbody', null,
      el('tr', { key: 'tanya' }, el('th', { scope: 'row' }, 'Tanya'), el('td', null, '10:00–20:00'), el('td', null, 'Off')),
      el('tr', { key: 'empty' }, el('td', { colSpan: 3 }, 'No more shifts')),
    ),
  ));
  assert.match(markup, /role="table" class="mobile-data-table min-w-\[900px\]"/);
  assert.match(markup, /<caption>October<\/caption>/);
  assert.match(markup, /<th scope="row">Tanya<\/th>/);
  assert.match(markup, /class="mobile-cell-label">Monday<\/span>/);
  assert.match(markup, /class="mobile-cell-label">Tuesday<\/span>/);
  assert.match(markup, /colSpan="3" role="cell" class=" mobile-wide-cell"/i);
  assert.match(markup, /No more shifts/);
});

test('mobile table controls retain their callbacks, values, constraints and accessible labels', () => {
  const changes = [];
  const onChange = (event) => changes.push(event.target.value);
  let clicks = 0;
  const onClick = () => clicks++;
  const tree = ResponsiveTable({
    children: [
      el('thead', { key: 'head' }, el('tr', null, el('th', null, 'Price'), el('th', null, 'Active'), el('th', null, 'Action'))),
      el('tbody', { key: 'body' }, el('tr', null,
        el('td', null, el(React.Fragment, null, el('input', { type: 'number', min: 1, max: 999, required: true, value: 95, onChange }))),
        el('td', null, el('input', { type: 'checkbox', checked: true, disabled: true, onChange })),
        el('td', null,
          el('input', { placeholder: 'Description', onChange }),
          el('button', { type: 'button', onClick, 'aria-label': 'Delete service' }, 'Delete'),
        ),
      )),
    ],
  });
  const price = walk(tree, (node) => node.type === 'input' && node.props.type === 'number');
  assert.equal(price.props.value, 95);
  assert.equal(price.props.min, 1);
  assert.equal(price.props.max, 999);
  assert.equal(price.props.required, true);
  assert.equal(price.props['aria-label'], 'Price');
  price.props.onChange({ target: { value: '100' } });
  assert.deepEqual(changes, ['100']);
  const checkbox = walk(tree, (node) => node.type === 'input' && node.props.type === 'checkbox');
  assert.equal(checkbox.props.checked, true);
  assert.equal(checkbox.props.disabled, true);
  assert.equal(checkbox.props['aria-label'], 'Active');
  assert.equal(walk(tree, (node) => node.type === 'input' && node.props.placeholder === 'Description').props['aria-label'], 'Description');
  assert.ok(walk(tree, (node) => node.type === 'label' && node.props.className === 'mobile-table-toggle'));
  const button = walk(tree, (node) => node.type === 'button');
  assert.equal(button.props['aria-label'], 'Delete service');
  button.props.onClick();
  assert.equal(clicks, 1);
});

test('mobile table respects existing field labels and multi-column header offsets', () => {
  const tree = ResponsiveTable({
    children: [
      el('thead', { key: 'head' }, el('tr', null, el('th', null, 'A'), el('th', null, 'B'), el('th', null, 'C'))),
      el('tbody', { key: 'body' }, el('tr', null,
        el('td', { colSpan: 2 }, el('input', { 'aria-label': 'Existing label' })),
        el('td', null, el('select', { 'aria-labelledby': 'explicit-label' }, el('option', null, 'Value'))),
      )),
    ],
  });
  assert.equal(walk(tree, (node) => node.type === 'input').props['aria-label'], 'Existing label');
  const select = walk(tree, (node) => node.type === 'select');
  assert.equal(select.props['aria-labelledby'], 'explicit-label');
  assert.equal(select.props['aria-label'], undefined);
  const labels = [];
  function collect(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(collect);
    if (node.props?.className === 'mobile-cell-label') labels.push(node.props.children);
    collect(node.props?.children);
  }
  collect(tree);
  assert.deepEqual(labels, ['A', 'C']);
});

test('help is collapsed on mobile, available inline on desktop and localized', () => {
  for (const [language, expected] of [['en', 'Help'], ['th', 'ช่วยเหลือ']]) {
    const markup = renderToStaticMarkup(el(LanguageProvider, { language },
      el(MobileHelp, null, el('p', null, 'Original explanation')),
    ));
    assert.match(markup, /<details class="lg:hidden">/);
    assert.ok(markup.includes(expected));
    assert.match(markup, /<div class="hidden lg:block"><p>Original explanation<\/p><\/div>/);
    assert.doesNotMatch(markup, /<details[^>]* open/);
  }
});

test('compact section styles are mobile-only, preserve desktop tables and respect safe areas', () => {
  const css = postcss.parse(readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'));
  const declarations = (selector) => {
    const result = {};
    css.walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return;
      if (selector !== '.mobile-cell-label' && selector !== '.mobile-cell-content') {
        assert.equal(rule.parent.type, 'atrule');
        assert.equal(rule.parent.params, '(max-width: 1023px)');
      }
      rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
    });
    return result;
  };
  assert.equal(declarations('.mobile-data-table').display, 'block');
  assert.equal(declarations('.mobile-data-table')['min-width'], '0');
  assert.equal(declarations('.mobile-cell-label').display, 'none');
  assert.equal(declarations('.mobile-cell-content').display, 'contents');
  assert.equal(declarations('.mobile-data-table .mobile-table-toggle')['min-height'], '44px');
  assert.match(declarations('.staff-dashboard .dashboard-content').padding, /88px \+ env\(safe-area-inset-bottom\)/);
  assert.match(declarations('.staff-dashboard .dashboard-shortcuts')['padding-bottom'], /safe-area-inset-bottom/);
  assert.equal(declarations('.staff-dashboard .dashboard-toolbar').top, '0');
  assert.match(declarations('.booking-calendar.calendar-fullscreen')['padding-top'], /safe-area-inset-top/);
  assert.match(declarations('.booking-calendar.calendar-fullscreen')['padding-bottom'], /88px \+ env\(safe-area-inset-bottom\)/);
  assert.equal(declarations('.booking-calendar.calendar-fullscreen .calendar-filters').position, 'sticky');
  assert.equal(declarations('.staff-dashboard .booking-calendar .calendar-mobile-menu')['max-height'], 'none');
  assert.match(declarations('.staff-dashboard .booking-calendar .calendar-mobile-menu').bottom, /safe-area-inset-bottom/);
});

test('staff mobile header is hidden while desktop and public headers and platform switching remain available', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /<header className=\{`\$\{viewMode === 'customer' \? 'flex' : 'hidden lg:flex'\}/);
  const footer = source.slice(source.indexOf('{/* Footer */}'), source.indexOf('// Self-service portal'));
  assert.match(footer, /entry\.staffNavigation && viewMode !== 'customer'/);
  assert.match(footer, /aria-label=\{tr\('Staff platform views'\)\} value=\{viewMode\}/);
  assert.match(footer, /onChange=\{\(event\) => setViewMode\(event\.target\.value\)\}/);
  for (const value of ['customer', 'admin', 'therapist']) assert.ok(footer.includes(`value="${value}"`));
});
