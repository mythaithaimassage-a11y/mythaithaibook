import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createTsLoader } from './helpers/load-ts-module.js';

const path = new URL('../src/ReviewCustomers.tsx', import.meta.url).pathname;
const load = createTsLoader();
const { default: ReviewCustomers, filterReviewCustomers, reviewRecipients, defaultReviewFilters } = load(path);
const { LanguageProvider } = load(new URL('../src/localization.tsx', import.meta.url).pathname);
const candidate = {
  email: 'client@example.com', name: 'Customer <script>', bookingId: 'MTT-101', serviceName: 'Thai Massage',
  branchName: 'Central', visitDate: '2026-10-19', lastRequestedAt: '', unsubscribed: false, eligible: true,
};
const tracking = { messageId: 'request-1', sentAt: '2026-10-19T15:00:00Z', openedAt: '2026-10-19T15:05:00Z' };
const now = new Date('2026-10-20T02:00:00Z'); // Still October 19 in the clinic.
const filters = (changes = {}) => ({ ...defaultReviewFilters, ...changes });
const filter = (dates, changes) => filterReviewCustomers(dates.map((visitDate) => ({ ...candidate, visitDate })), filters(changes), now).map((row) => row.visitDate).join();

test('rolling ranges include today in clinic time and exact week/month/two-month boundaries', () => {
  assert.equal(filter(['2026-10-12', '2026-10-13', '2026-10-19', '2026-10-20'], { days: '7' }), '2026-10-13,2026-10-19');
  assert.equal(filter(['2026-09-19', '2026-09-20', '2026-10-19'], { days: '30' }), '2026-09-20,2026-10-19');
  assert.equal(filter(['2026-08-20', '2026-08-21', '2026-10-19'], { days: '60' }), '2026-08-21,2026-10-19');
  assert.equal(filter(['2025-01-01', '2026-10-20'], { days: 'all' }), '2025-01-01');
  const dst = filterReviewCustomers(['2026-10-25', '2026-10-26', '2026-11-01', '2026-11-02'].map((visitDate) => ({ ...candidate, visitDate })), filters({ days: '7' }), new Date('2026-11-02T04:30:00Z'));
  assert.equal(dst.map((row) => row.visitDate).join(), '2026-10-26,2026-11-01');
});

test('custom dates are inclusive, support one-sided bounds and reject reversed ranges', () => {
  const dates = ['2026-09-30', '2026-10-01', '2026-10-15', '2026-10-16'];
  assert.equal(filter(dates, { days: 'custom', from: '2026-10-01', to: '2026-10-15' }), '2026-10-01,2026-10-15');
  assert.equal(filter(dates, { days: 'custom', from: '2026-10-15' }), '2026-10-15,2026-10-16');
  assert.equal(filter(dates, { days: 'custom', to: '2026-10-01' }), '2026-09-30,2026-10-01');
  assert.equal(filter(dates, { days: 'custom', from: '2026-10-15', to: '2026-10-01' }), '');
});

test('search tokens, branch, service and honest request/open statuses compose', () => {
  const candidates = [
    candidate,
    { ...candidate, email: 'second@example.com', branchName: 'West', reviewTracking: tracking, lastRequestedAt: tracking.sentAt, eligible: false },
    { ...candidate, email: 'third@example.com', reviewTracking: { ...tracking, openedAt: '' }, lastRequestedAt: tracking.sentAt },
    { ...candidate, email: 'fourth@example.com', unsubscribed: true, eligible: false },
  ];
  const emails = (changes) => filterReviewCustomers(candidates, filters(changes), now).map((row) => row.email).join();
  assert.equal(emails({ query: 'CENTRAL MTT-101 Thai', service: 'Thai Massage' }), 'client@example.com,third@example.com,fourth@example.com');
  assert.equal(emails({ branch: 'West', status: 'opened' }), 'second@example.com');
  assert.equal(emails({ status: 'waiting' }), 'third@example.com');
  assert.equal(emails({ status: 'asked' }), 'second@example.com,third@example.com');
  assert.equal(emails({ status: 'unasked' }), 'client@example.com,fourth@example.com');
  assert.equal(emails({ status: 'unsubscribed' }), 'fourth@example.com');
  assert.equal(emails({ status: 'eligible' }), 'client@example.com,third@example.com');
  assert.equal(emails({ query: 'not-found' }), '');
});

test('only visible selected non-unsubscribed recipients are sent, retaining manual resend eligibility and the cap', () => {
  const candidates = [
    { ...candidate, eligible: false, lastRequestedAt: tracking.sentAt },
    { ...candidate, email: 'unsubscribed@example.com', unsubscribed: true },
  ];
  const result = reviewRecipients(candidates, [candidate.email, 'unsubscribed@example.com', 'hidden@example.com'], 50);
  assert.equal(result.recipients.join(), candidate.email);
  assert.equal(result.tooMany, false);
  const fiftyOne = Array.from({ length: 51 }, (_, index) => ({ ...candidate, email: `${index}@example.com` }));
  assert.equal(reviewRecipients(fiftyOne, fiftyOne.map((row) => row.email), 50).tooMany, true);
  assert.equal(reviewRecipients(fiftyOne.slice(0, 50), fiftyOne.map((row) => row.email), 50).tooMany, false);
});

const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
const props = {
  candidates: [{ ...candidate, visitDate: currentDate, reviewTracking: tracking, lastRequestedAt: tracking.sentAt }],
  maximum: 50, busy: false, sending: false, sendBlocked: false, revision: 'revision-1', onOpen() {}, onSend: async () => true,
};
const render = (language, changes = {}) => renderToStaticMarkup(React.createElement(LanguageProvider, { language },
  React.createElement(ReviewCustomers, { ...props, ...changes })));

test('mobile cards render accessible controls, escaped customer text, accurate opens and unchecked-reply status', () => {
  const html = render('en');
  for (const text of ['Last week (7 days)', 'Last 2 months (60 days)', 'Custom visit dates', 'Open signal detected (approximate)', 'Check replies', 'Replies not checked', 'View communication history', 'MTT-101']) assert.ok(html.includes(text), text);
  assert.match(html, /Customer &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|Customer replied to review email|No reply in this email thread/);
  assert.match(html, /min-h-11/);
  assert.match(html, /type="checkbox"/);
  assert.doesNotMatch(render('en', { busy: true }), />Sending…</);
  assert.match(render('en', { sending: true, busy: true }), />Sending…</);
});

test('new follow-up controls and date presets translate into Thai without changing customer data', () => {
  const html = render('th');
  for (const text of ['ค้นหาลูกค้าสำหรับขอรีวิว', '2 เดือนที่ผ่านมา', 'ตรวจสอบการตอบกลับ', 'ดูประวัติการติดต่อ', 'พบสัญญาณการเปิด', 'MTT-101', candidate.email]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, />Search review customers<|>Last attended visit<|>View communication history</);
});

function hookHarness(extra = {}) {
  const states = [], refs = [], effects = [];
  let stateIndex, refIndex, effectIndex;
  const jsx = (type, props) => ({ type, props });
  const loader = createTsLoader({
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      },
      useMemo: (callback) => callback(),
      useRef(initial) { return refs[refIndex++] ||= { current: initial }; },
      useEffect(callback, deps) {
        const index = effectIndex++, previous = effects[index];
        if (!previous || deps.some((dep, index) => dep !== previous.deps[index])) {
          previous?.cleanup?.();
          effects[index] = { callback, deps, pending: true };
        }
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    './localization': { useTranslation: () => ({ translate: (text, values = {}) => text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match), locale: 'en-CA' }) },
    'test-fetch': extra.fetch, 'test-search-params': URLSearchParams,
  });
  const loaded = loader(path, `
    import fetch from 'test-fetch';
    import URLSearchParams from 'test-search-params';
    export { ReviewReply };
  `);
  return {
    loaded,
    render(Component, props) {
      stateIndex = refIndex = effectIndex = 0;
      const tree = Component(props);
      for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup = effect.callback(); }
      return tree;
    },
    unmount() { for (const effect of effects) effect.cleanup?.(); },
  };
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
const text = (node) => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : '';
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node).includes(label));
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('filter changes clear selection, suggested selection caps at fifty, and sending clears a successful batch', async () => {
  const harness = hookHarness();
  const candidates = Array.from({ length: 55 }, (_, index) => ({ ...candidate, visitDate: currentDate, email: `${index}@example.com` }));
  let opened = '', sent = [];
  const options = { ...props, candidates, onOpen: (id) => { opened = id; }, onSend: async (emails) => { sent = emails; return true; } };
  const render = () => harness.render(harness.loaded.default, options);
  let tree = render();
  button(tree, 'Select suggested').props.onClick();
  tree = render();
  assert.equal(button(tree, 'Send to 50').props.disabled, false);
  const search = nodes(tree).find((node) => node.type === 'input' && node.props.type === 'search');
  search.props.onChange({ target: { value: '0@example.com' } });
  tree = render();
  assert.equal(button(tree, 'Send to 0').props.disabled, true);
  const checkbox = nodes(tree).find((node) => node.type === 'input' && node.props.type === 'checkbox');
  checkbox.props.onChange();
  tree = render();
  await button(tree, 'Send to 1').props.onClick();
  assert.equal(sent.join(), '0@example.com');
  tree = render();
  assert.equal(button(tree, 'Send to 0').props.disabled, true);
  button(tree, 'View communication history').props.onClick();
  assert.equal(opened, candidate.bookingId);
  harness.unmount();
});

test('checked replies retain previews, auto-recheck on refresh, and reset for a different review request', async () => {
  let calls = 0, lastSignal, fail = false, respond = false;
  const harness = hookHarness({ fetch: async (_url, { signal, cache }) => {
    calls++;
    lastSignal = signal;
    assert.equal(cache, 'no-store');
    if (fail) return { ok: false, json: async () => ({ message: 'Mailbox unavailable' }) };
    return { ok: true, json: async () => ({
      messageId: tracking.messageId, checkedAt: '2026-10-19T18:00:00Z',
      reply: respond ? { subject: 'Re: How was your visit?', snippet: '<script>Thanks</script>', occurredAt: '2026-10-19T17:00:00Z' } : null,
    }) };
  } });
  let revision = 'first';
  const render = (row = props.candidates[0]) => harness.render(harness.loaded.ReviewReply, { candidate: row, revision });
  let tree = render();
  assert.equal(calls, 0);
  await button(tree, 'Check replies').props.onClick();
  await settle();
  tree = render();
  assert.match(text(tree), /No reply in this email thread/);
  assert.match(text(tree), /Checked at/);
  respond = true;
  revision = 'second';
  render();
  await settle();
  tree = render();
  assert.equal(calls, 2);
  assert.match(text(tree), /Customer replied to review email/);
  assert.match(text(tree), /<script>Thanks<\/script>/);
  fail = true;
  await button(tree, 'Check again').props.onClick();
  await settle();
  tree = render();
  assert.match(text(tree), /Mailbox unavailable/);
  assert.match(text(tree), /Checked at/);
  const changed = { ...props.candidates[0], reviewTracking: { ...tracking, messageId: 'new-request' } };
  render(changed);
  tree = render(changed);
  assert.match(text(tree), /Replies not checked/);
  assert.doesNotMatch(text(tree), /Customer replied|Mailbox unavailable/);
  assert.equal(lastSignal.aborted, false); // Completed requests do not remain active.
  harness.unmount();
});

test('reply checks reject mismatched message ids and abort unfinished requests on unmount', async () => {
  let signal;
  const harness = hookHarness({ fetch: async (_url, options) => {
    signal = options.signal;
    return { ok: true, json: async () => ({ messageId: 'different', checkedAt: '2026-10-19T18:00:00Z', reply: null }) };
  } });
  const options = { candidate: props.candidates[0], revision: 'first' };
  const render = () => harness.render(harness.loaded.ReviewReply, options);
  await button(render(), 'Check replies').props.onClick();
  await settle();
  assert.match(text(render()), /Refresh customers and check again/);
  harness.unmount();
  const pending = hookHarness({ fetch: (_url, options) => { signal = options.signal; return new Promise(() => {}); } });
  const tree = pending.render(pending.loaded.ReviewReply, options);
  button(tree, 'Check replies').props.onClick();
  pending.unmount();
  assert.equal(signal.aborted, true);
});

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let refreshFunction, refreshEffect;
const loaders = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['loadGoogleReviews', 'loadReviewRequests', 'sendReviewRequests'].includes(node.name.getText(ast))) loaders[node.name.getText(ast)] = node.initializer.getText(ast);
  if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'reviewRefresh.current') refreshFunction = node.right.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('const timer = window.setInterval(refresh, 60000)')) refreshEffect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

test('foreground review refresh runs on entry, every minute, focus and visibility, then removes all listeners', () => {
  let reviews = 0, audience = 0, clears = 0;
  const document = { visibilityState: 'visible' };
  const refresh = vm.runInNewContext(`(${refreshFunction})`, {
    document, isSendingReviewRequests: false, loadGoogleReviews: () => { reviews++; }, loadReviewRequests: () => { audience++; },
  });

  const listeners = new Map();
  const events = {
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: (event, callback) => { assert.equal(listeners.get(event), callback); listeners.delete(event); },
  };
  const setup = vm.runInNewContext(`(${refreshEffect})`, {
    activeTab: 'reviews', reviewRefresh: { current: refresh },
    document: Object.assign(document, events),
    window: { ...events, setInterval(callback, delay) { assert.equal(delay, 60000); listeners.set('interval', callback); return 42; }, clearInterval(id) { assert.equal(id, 42); clears++; } },
  });
  const cleanup = setup();
  assert.equal(reviews, 1);
  assert.equal(audience, 1);
  document.visibilityState = 'hidden';
  listeners.get('interval')();
  assert.equal(reviews, 1);
  document.visibilityState = 'visible';
  listeners.get('visibilitychange')();
  listeners.get('focus')();
  assert.equal(reviews, 3);
  assert.equal(audience, 3);
  cleanup();
  assert.equal(listeners.has('focus'), false);
  assert.equal(listeners.has('visibilitychange'), false);
  assert.equal(clears, 1);
  const sendingRefresh = vm.runInNewContext(`(${refreshFunction})`, { document, isSendingReviewRequests: true });
  assert.doesNotThrow(sendingRefresh);
});

test('send outcomes use explicit selected addresses and keep delivery warnings separate from refresh errors', async () => {
  let sendError = '', loadError = '', result = '', requests = 0;
  const refresh = () => { loadError = ''; };
  const send = vm.runInNewContext(`(${loaders.sendReviewRequests})`, {
    isSendingReviewRequests: false,
    setIsSendingReviewRequests() {},
    setReviewRequestSendError: (value) => { sendError = value; },
    setReviewRequestError: (value) => { loadError = value; },
    setReviewRequestResult: (value) => { result = value; },
    loadReviewRequests: refresh,
    tr: (text, params = {}) => text.replace(/\{(\w+)\}/g, (match, key) => params[key] ?? match),
    fetch: async (_url, options) => {
      requests++;
      assert.equal(options.method, 'POST');
      assert.equal(JSON.parse(options.body).emails.join(), candidate.email);
      return { ok: true, json: async () => ({
        sent: 1, failed: 0, skipped: 0, trackingWarnings: [candidate.email], logError: 'Sheet log unavailable',
      }) };
    },
  });
  assert.equal(await send([candidate.email]), true);
  assert.equal(requests, 1);
  assert.match(result, /1 sent, 0 failed, 0 skipped/);
  assert.match(sendError, /Sheet log unavailable/);
  assert.match(sendError, /client@example.com/);
  refresh();
  assert.equal(loadError, '');
  assert.match(sendError, /open tracking could not be saved/);
  assert.equal(await send([]), false);
  assert.equal(requests, 1);
});

test('review loaders do not overlap, request uncached data, support manual force and retain data on failure', async () => {
  for (const name of ['loadGoogleReviews', 'loadReviewRequests']) {
    let release, calls = 0, stored = 'previous', error = '', fail = false;
    const context = {
      reviewsLoading: { current: false }, reviewAudienceLoading: { current: false },
      setIsLoadingGoogleReviews() {}, setIsLoadingReviewRequests() {},
      setGoogleReviews: (value) => { stored = value; }, setReviewRequestData: (value) => { stored = value; },
      setGoogleReviewsError: (value) => { error = value; }, setReviewRequestError: (value) => { error = value; },
      fetch: async (url, options) => {
        calls++;
        assert.equal(options.cache, 'no-store');
        if (name === 'loadGoogleReviews') assert.match(url, /refresh=1/);
        await new Promise((resolve) => { release = resolve; });
        return { ok: !fail, json: async () => fail ? { message: 'Refresh failed' } : { fetchedAt: 'new' } };
      },
    };
    const loader = vm.runInNewContext(`(${loaders[name]})`, context);
    const pending = loader(true);
    await loader(true);
    assert.equal(calls, 1);
    release();
    await pending;
    assert.equal(stored.fetchedAt, 'new');
    fail = true;
    const failure = loader(true);
    release();
    await failure;
    assert.equal(stored.fetchedAt, 'new');
    assert.equal(error, 'Refresh failed');
  }
});
