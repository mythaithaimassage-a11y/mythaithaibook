import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTsLoader } from './helpers/load-ts-module.js';

const editorPath = new URL('../src/EditBooking.tsx', import.meta.url).pathname;
const load = createTsLoader();
const EditBooking = load(editorPath).default;
const { LanguageProvider } = load(new URL('../src/localization.tsx', import.meta.url).pathname);
const booking = { id: 'MTT-EDIT', customerName: 'Customer name', email: 'client@example.com', phone: '4375550101',
  branchName: 'Central', serviceName: 'Massage', therapistName: 'Tanya', date: '2026-12-01', time: '10:00 AM',
  paymentOption: 'Cash', total: 113, paidAmount: 0, bookingNote: 'Internal reference', editVersion: 'version-1' };
const props = { booking, services: [{ id: 1, name: 'Massage', duration: 60, price: 100, taxRate: .13 }],
  therapists: [{ id: 1, name: 'Tanya', active: true }], times: ['10:00 AM', '11:00 AM'],
  isScheduled: () => true, onClose() {}, async onSaved() {} };
const render = (language, changes = {}) => renderToStaticMarkup(React.createElement(LanguageProvider, { language },
  React.createElement(EditBooking, { ...props, ...changes })));
test('editor translates its fields while preserving contacts, notes and canonical time values', () => {
  const html = render('th');
  assert.match(html, /แก้ไขการจอง/);
  assert.match(html, /บันทึกการจอง/);
  assert.match(html, /value="10:00 AM"[^>]*>10:00 น\./);
  assert.match(html, /client@example.com/);
  assert.match(html, /Internal reference/);
  assert.doesNotMatch(html, />Edit booking|>Save booking|>Client name/);
  const english = render('en');
  assert.match(english, /Appointment total \(\$\)/);
  assert.match(english, /Use receipt reconciliation for manual discounts/);
  const locked = render('en', { booking: { ...booking, receiptNumber: 'ISSUED' } });
  assert.match(locked, /records lock customer/);
  assert.match(locked, /disabled=""[^>]*value="Customer name"/);
  assert.doesNotMatch(locked, /textarea[^>]* disabled=""/);
  assert.match(render('en', { services: [] }), /value="__existing__" selected="">Massage/);
});

test('editor submits changes with a version, prevents duplicate saves and reports failed writes', async () => {
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0, writes = 0, saved = null;
  let fail = false;
  const jsx = (type, props) => ({ type, props });
  const shallowLoad = createTsLoader({
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      },
      useRef(value) { const index = refIndex++; return refs[index] ||= { current: value }; },
      useEffect() {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    './localization': { useTranslation: () => ({ translate: (text) => text, formatTime: (text) => text }) },
    'test-fetch': async (url, request) => {
      writes++;
      assert.equal(url, '/api/booking?view=edit-booking');
      const body = JSON.parse(request.body);
      assert.equal(body.expectedVersion, 'version-1');
      assert.equal(body.bookingId, booking.id);
      assert.equal(body.customerName, 'Edited customer');
      assert.equal(body.time, '10:00 AM');
      assert.deepEqual(body.therapistNames, ['Tanya']);
      return { ok: !fail, json: async () => fail ? { message: 'Booking was not found.' } : { booking: { ...booking, customerName: body.customerName } } };
    },
  });
  const Editor = shallowLoad(editorPath, '\nglobalThis.fetch = require("test-fetch");').default;
  function shallow() {
    stateIndex = 0; refIndex = 0;
    return Editor({ ...props, onSaved: async (value) => { saved = value; } });
  }
  function nodes(tree) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return [tree, ...nodes(tree.props?.children)];
  }
  let tree = shallow();
  nodes(tree).find((node) => node.type === 'input' && node.props.value === 'Customer name').props.onChange({ target: { value: 'Edited customer' } });
  tree = shallow();
  const submit = nodes(tree).find((node) => node.type === 'form').props.onSubmit;
  const first = submit({ preventDefault() {} });
  await submit({ preventDefault() {} });
  await first;
  assert.equal(writes, 1);
  assert.equal(saved.customerName, 'Edited customer');
  fail = true; saved = null;
  await nodes(shallow()).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved, null);
  assert.equal(nodes(shallow()).find((node) => node.props?.role === 'alert').props.children, 'Booking was not found.');
});
