import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { createTsLoader } from './helpers/load-ts-module.js';

const path = new URL('../src/CustomerCommunications.tsx', import.meta.url).pathname;
const load = createTsLoader();
const { CustomerCommunicationHistory, mergeCustomerEmails, groupCustomerEmails, parseCustomerCommunications } = load(path);
const { LanguageProvider } = load(new URL('../src/localization.tsx', import.meta.url).pathname);
const message = {
  id: 'gmail-1', subject: 'Reminder for MTT-101', snippet: 'We look forward to seeing you.', kind: 'Reminder',
  direction: 'sent', occurredAt: '2026-10-19T15:00:00Z', bookingIds: ['MTT-101'],
};
const data = {
  customer: { name: 'Customer', email: 'client@example.com', bookingId: 'MTT-101' },
  messages: [
    { ...message, id: 'reply-1', subject: 'Re: Appointment', direction: 'received', snippet: '<img src=x onerror=alert(1)> Yes, I will be there.', occurredAt: '2026-10-19T15:05:00Z' },
    message,
    { ...message, id: 'marketing-1', kind: 'Marketing', subject: 'Autumn offer', occurredAt: '2026-10-18T15:00:00Z', bookingIds: [] },
  ],
  reminders: [{ ...message, tracked: true, openedAt: '2026-10-19T15:03:00Z', snippet: '' }],
  nextPageToken: 'older', historyError: '', restricted: false,
};
const render = (language, changes = {}) => renderToStaticMarkup(React.createElement(LanguageProvider, { language },
  React.createElement(CustomerCommunicationHistory, { data: { ...data, ...changes }, bookingId: 'MTT-101' })));

test('mailbox responses validate their exact data shape before rendering summaries or dates', () => {
  assert.equal(parseCustomerCommunications(data).customer.bookingId, 'MTT-101');
  for (const invalid of [
    null, {}, { ...data, customer: {} }, { ...data, messages: [{}] },
    { ...data, messages: [{ ...message, occurredAt: 'invalid' }] },
    { ...data, reminders: [{ ...message, openedAt: 'invalid' }] },
    { ...data, nextPageToken: {} }, { ...data, trackingError: {} },
  ]) assert.throws(() => parseCustomerCommunications(invalid), /Unable to verify/);
});

test('customer timeline deduplicates tracked reminders, preserves previews and groups by clinic date rather than UTC', () => {
  const messages = mergeCustomerEmails(data.messages, data.reminders);
  assert.equal(messages.length, 3);
  assert.equal(messages[0].id, 'reply-1');
  assert.equal(messages[1].openedAt, '2026-10-19T15:03:00Z');
  assert.equal(messages[1].snippet, message.snippet);
  const groups = groupCustomerEmails([
    { ...message, occurredAt: '2026-10-19T02:00:00Z' },
    { ...message, id: 'older', occurredAt: '2026-10-18T18:00:00Z' },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0][0], '2026-10-18');
  assert.equal(groups[0][1].length, 2);
});

test('beautiful date-grouped history includes extractive summaries, replies, references and honest open status without rendering email HTML', () => {
  const html = render('en');
  for (const expected of ['Quick communication summary', 'Latest message to customer', 'Latest customer reply', 'October 19, 2026', 'October 18, 2026', 'Ref:', 'MTT-101', 'Marketing', 'Open signal detected (approximate)', 'Open tracking unavailable']) assert.ok(html.includes(expected), expected);
  assert.match(html, /No signal does not mean unread/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x|dangerouslySetInnerHTML|<iframe/);
  const noSignal = render('en', { reminders: [{ ...message, tracked: true, openedAt: '' }] });
  assert.match(noSignal, /No open signal yet/);
  assert.doesNotMatch(noSignal, />Unread</);
  assert.match(render('en', { messages: [], reminders: [] }), /No tracked reminder for this appointment/);
});

test('missing mailbox permission and branch scoping are explicitly visible; no false empty-conversation claim is shown', () => {
  const html = render('en', { messages: [], historyError: 'Read permission missing', restricted: true });
  assert.match(html, /Mailbox history unavailable/);
  assert.match(html, /Read permission missing/);
  assert.match(html, /summary is incomplete/);
  assert.match(html, /Unreferenced marketing emails are visible to the owner only/);
  assert.doesNotMatch(html, /No customer reply in the loaded history/);
  const unavailable = render('en', { trackingError: 'Tracking table access is unavailable.' });
  assert.match(unavailable, /Reminder tracking unavailable/);
  assert.match(unavailable, /Tracking table access is unavailable/);
});

test('a new reminder never inherits an older reminder open signal for the same appointment', () => {
  const latest = { ...message, id: 'new-reminder', occurredAt: '2026-10-19T15:10:00Z', tracked: true, openedAt: '' };
  const html = render('en', { messages: [...data.messages, latest], reminders: [...data.reminders, latest] });
  const summary = html.match(/<section aria-label="Quick communication summary"[\s\S]*?<\/section>/)?.[0];
  assert.ok(summary);
  assert.match(summary, /Latest reminder for this appointment[\s\S]*?No open signal yet/);
  assert.doesNotMatch(summary, /Open signal detected \(approximate\)/);
});

test('review tracking has a separate summary and never populates the reminder summary', () => {
  const review = { ...message, id: 'review-1', kind: 'Review request', subject: 'How was your visit to Clinic?', tracked: true, openedAt: '2026-10-19T15:03:00Z' };
  const html = render('en', { messages: [review], reminders: [review] });
  const summary = html.match(/<section aria-label="Quick communication summary"[\s\S]*?<\/section>/)?.[0];
  assert.match(summary, /Latest review request[\s\S]*?Open signal detected/);
  assert.match(summary, /No tracked reminder for this appointment/);
  const newer = { ...review, id: 'untracked', tracked: false, openedAt: '', occurredAt: '2026-10-20T15:00:00Z' };
  const updated = render('en', { messages: [newer, review], reminders: [review] });
  assert.match(updated, /Latest review request[\s\S]*?Open tracking unavailable/);
});

test('the customer history labels translate while customer messages and booking references remain unchanged', () => {
  const html = render('th');
  assert.match(html, /สรุปการติดต่อโดยย่อ/);
  assert.match(html, /ลูกค้าตอบกลับ/);
  assert.match(html, /พบสัญญาณการเปิด/);
  assert.match(html, /Reminder for MTT-101/);
  assert.match(html, /Autumn offer/);
  assert.doesNotMatch(html, />Quick communication summary</);
});

test('mobile communication modal bounds its flex layout and uses native touch scrolling and accessible controls', () => {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /element\?\.showModal\(\)/);
  assert.match(source, /event\.preventDefault\(\); event\.stopPropagation\(\); onClose\(\)/);
  assert.match(source, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
  assert.match(source, /aria-labelledby="customer-communications-title"/);
  assert.match(source, /aria-label=\{tr\('Close email history'\)\}/);
  const css = postcss.parse(readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'));
  const bounds = [];
  css.walkRules('.customer-communications-dialog > div', (rule) => {
    rule.walkDecls('max-height', (declaration) => bounds.push(declaration.value));
  });
  assert.deepEqual(bounds, ['calc(100vh - 2rem)', 'calc(100dvh - 2rem)']);
});

test('the live panel loads pages once, merges duplicates and cleans up its dialog on close', async () => {
  const states = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0, requests = 0, closed = 0, lastSignal;
  const jsx = (type, props) => ({ type, props });
  const shallowLoad = createTsLoader({
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      },
      useRef(value) {
        const index = refIndex++;
        return refs[index] ||= { current: index === 0 ? { showModal() {}, close() { closed++; } } : value };
      },
      useEffect(callback) { effects.push(callback); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    './localization': { useTranslation: () => ({ translate: (text) => text, locale: 'en-CA' }) },
    'test-search-params': URLSearchParams,
    'test-fetch': async (url, { signal, cache }) => {
      requests++;
      lastSignal = signal;
      assert.equal(cache, 'no-store');
      const query = new URL(url, 'https://example.com').searchParams;
      assert.equal(query.get('bookingId'), 'MTT-101');
      return { ok: true, json: async () => query.get('pageToken') ? { ...data, nextPageToken: '', messages: [message, { ...message, id: 'older' }] } : data };
    },
  });
  const Panel = shallowLoad(path, '\nglobalThis.fetch = require("test-fetch"); globalThis.URLSearchParams = require("test-search-params");').default;
  const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const renderPanel = () => { stateIndex = 0; refIndex = 0; return Panel({ bookingId: 'MTT-101', onClose() { closed++; } }); };
  renderPanel();
  const cleanups = effects.splice(0).map((effect) => effect());
  await new Promise(setImmediate);
  let tree = renderPanel();
  const more = nodes(tree).find((node) => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('Load older emails'));
  assert.ok(more, states[1]);
  more.props.onClick();
  more.props.onClick();
  await new Promise(setImmediate);
  tree = renderPanel();
  const history = nodes(tree).find((node) => node.type.name === 'CustomerCommunicationHistory');
  assert.equal(history.props.data.messages.length, 4);
  assert.equal(requests, 2);
  assert.equal(nodes(tree).some((node) => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('Load older emails')), false);
  for (const cleanup of cleanups) cleanup?.();
  assert.equal(closed, 1);
  assert.equal(lastSignal.aborted, false, 'Completed pagination requests need not remain active');
});
