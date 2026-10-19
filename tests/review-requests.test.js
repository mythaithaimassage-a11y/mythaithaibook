import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createCustomerEmailStore, createEmailTracking, customerCommunicationAccess } from '../lib/customer-communications.js';
import { reviewEngagementForCustomer, reviewThreadReply, readReviewRequestReply } from '../lib/review-requests.js';

const source = readFileSync(new URL('../api/booking.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('booking.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const blocks = {}, functions = {};
function visit(node) {
  if (ts.isIfStatement(node)) {
    const condition = node.expression.getText(ast);
    for (const [name, expression] of Object.entries({
      reply: "view === 'review-request-reply'",
      audience: "req.method === 'GET' && view === 'review-request-audience'",
      send: "req.method === 'POST' && view === 'review-request-send'",
    })) if (condition === expression) blocks[name] = node.thenStatement.getText(ast);
  }
  if (ts.isFunctionDeclaration(node) && node.name) functions[node.name.text] = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const response = () => ({
  headers: {}, statusCode: 0, body: null,
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const run = (name, context) => vm.runInNewContext(`(async () => ${blocks[name]})()`, { console, Date, Set, String, ...context });
const candidate = { email: 'client@example.com', bookingId: 'MTT-101', name: 'Customer', branchName: 'Central', lastRequestedAt: '2026-10-19T16:00:00.000Z' };
const tracked = { email: candidate.email, messageId: 'request-1', sentAt: candidate.lastRequestedAt, openedAt: '2026-10-19T16:05:00.000Z' };
const request = { id: tracked.messageId, direction: 'sent', kind: 'Review request', threadId: 'thread-1', occurredAt: tracked.sentAt };

test('engagement belongs to the latest request, never an older opened request or another customer', () => {
  assert.equal(reviewEngagementForCustomer(candidate, [tracked]).reviewTracking.messageId, tracked.messageId);
  assert.equal(reviewEngagementForCustomer({ ...candidate, lastRequestedAt: '2026-10-20T16:00:00.000Z' }, [tracked]).reviewTracking, null);
  assert.equal(reviewEngagementForCustomer({ ...candidate, email: 'other@example.com' }, [tracked]).reviewTracking, null);
  assert.equal(reviewEngagementForCustomer(candidate, []).reviewTracking, null);
});

test('only incoming replies after the actual review request in its exact thread count', () => {
  const reply = { ...request, id: 'reply', direction: 'received', occurredAt: '2026-10-19T17:00:00.000Z' };
  const unrelated = [
    { ...reply, id: 'other-thread', threadId: 'thread-2', occurredAt: '2026-10-20T17:00:00.000Z' },
    { ...reply, id: 'old', occurredAt: '2026-10-18T17:00:00.000Z' },
    { ...reply, id: 'outgoing', direction: 'sent', occurredAt: '2026-10-21T17:00:00.000Z' },
  ];
  assert.equal(reviewThreadReply([request, ...unrelated], request.id), null);
  assert.equal(reviewThreadReply([request, reply, ...unrelated], request.id).id, 'reply');
  assert.equal(reviewThreadReply([reply], request.id), null);
  assert.equal(reviewThreadReply([{ ...request, kind: 'Reminder' }, reply], request.id), null);
});

function email({ id = request.id, from = 'clinic@example.com', to = candidate.email, sent = true, time = request.occurredAt, subject = 'How was your visit to Clinic?' } = {}) {
  return {
    id, threadId: 'thread-1', labelIds: sent ? ['SENT'] : ['INBOX'],
    internalDate: String(Date.parse(time)), snippet: 'Thank you <script>alert(1)</script>',
    payload: { headers: [{ name: 'From', value: from }, { name: 'To', value: to }, { name: 'Subject', value: subject }] },
  };
}

test('reply lookup verifies the customer, sent message and Gmail thread without modifying mail; readonly scope failures are actionable', async () => {
  let threadCalls = 0;
  const gmail = { users: {
    messages: { get: async ({ id, format }) => {
      assert.equal(id, request.id);
      assert.equal(format, 'full');
      return { data: email() };
    } },
    threads: { get: async ({ id, format }) => {
      threadCalls++;
      assert.equal(id, 'thread-1');
      assert.equal(format, 'full');
      return { data: { messages: [
        email(), email({ id: 'reply', from: candidate.email, to: 'clinic@example.com', sent: false, time: '2026-10-19T17:00:00Z' }),
        email({ id: 'stranger', from: 'other@example.com', to: 'clinic@example.com', sent: false, time: '2026-10-19T18:00:00Z' }),
      ] } };
    } },
  } };
  const access = { email: candidate.email, bookingIds: [candidate.bookingId], restricted: false };
  const result = await readReviewRequestReply(gmail, access, request.id);
  assert.equal(result.reply.id, 'reply');
  assert.equal(result.messageId, request.id);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
  gmail.users.messages.get = async () => ({ data: email({ to: 'other@example.com' }) });
  await assert.rejects(readReviewRequestReply(gmail, access, request.id), /Unable to verify/);
  assert.equal(threadCalls, 1);
  gmail.users.messages.get = async () => { throw Object.assign(new Error('Insufficient Permission'), { code: 403 }); };
  await assert.rejects(readReviewRequestReply(gmail, access, request.id), /gmail.readonly/);
  await assert.rejects(readReviewRequestReply(gmail, access, '../invalid'), /Invalid review email/);
});

test('tracking batch reads select the latest review request per address and keep review/reminder categories distinct', async () => {
  const queries = [];
  const store = createCustomerEmailStore({
    dataset: () => ({ table: () => ({ exists: async () => [true] }) }),
    query: async (query) => {
      queries.push(query);
      return [[{ email: candidate.email, message_id: request.id, booking_id: candidate.bookingId, subject: 'How was your visit to Clinic?', created_at: tracked.sentAt, opened_at: tracked.openedAt }]];
    },
  }, 'project', 'booking_system');
  assert.deepEqual(await store.readReviewEngagement([]), []);
  assert.equal(queries.length, 0);
  assert.deepEqual(await store.readReviewEngagement([candidate.email]), [tracked]);
  assert.match(queries[0].query, /s.email IN UNNEST\(@emails\)/);
  assert.match(queries[0].query, /STARTS_WITH\(s.subject, 'How was your visit to '\)/);
  assert.match(queries[0].query, /QUALIFY ROW_NUMBER\(\) OVER \(PARTITION BY s.email ORDER BY s.created_at DESC\) = 1/);
  const history = await store.readReminders({ email: candidate.email, bookingId: candidate.bookingId, restricted: false });
  assert.equal(history[0].kind, 'Review request');
  assert.equal(history[0].tracked, true);
});

test('review reply endpoint is owner-only and GET-only before touching any customer data', async () => {
  for (const session of [null, { role: 'branch_manager' }, { role: 'branch_receptionist' }, { role: 'therapist' }]) {
    const res = response();
    await run('reply', { req: { method: 'GET' }, res, dashboardSession: session });
    assert.equal(res.statusCode, session ? 403 : 401);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  const res = response();
  await run('reply', { req: { method: 'POST' }, res, dashboardSession: { role: 'owner' } });
  assert.equal(res.statusCode, 405);
});

test('reply endpoint resolves both customer email and tracked message server-side, not from supplied parameters', async () => {
  const res = response();
  await run('reply', {
    req: { method: 'GET', query: { bookingId: candidate.bookingId, email: 'other@example.com', messageId: 'forged' } },
    res, dashboardSession: { role: 'owner' }, getBigQueryClient: () => ({}),
    bqFetchBookingRows: async () => ({ data: { values: [[candidate.bookingId, 'Customer', '', candidate.email, 'Central']] } }),
    customerCommunicationAccess, getCustomerEmailStore: () => ({
      readReviewEngagement: async (emails) => { assert.equal(emails.join(), candidate.email); return [tracked]; },
    }),
    createGmailApi: () => ({}), readReviewRequestReply: async (_gmail, access, messageId) => {
      assert.equal(access.email, candidate.email);
      assert.equal(messageId, tracked.messageId);
      return { messageId, reply: null };
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.messageId, tracked.messageId);
});

test('tracking failures in audience do not disable search or existing sending eligibility', async () => {
  const res = response();
  await run('audience', {
    req: {}, res, sheets: {}, isGoogleReviewsConfigured: () => true, getBigQueryClient: () => ({}),
    collectReviewRequestCandidates: async () => ({ candidates: [candidate], stats: {} }), getBusinessProfile: async () => ({}),
    getCampaignSendBlockReason: () => '', getCustomerEmailStore: () => ({ readReviewEngagement: async () => { throw new Error('Denied'); } }),
    reviewEngagementForCustomer, REVIEW_REQUEST_COOLDOWN_DAYS: 180, REVIEW_REQUEST_LOOKBACK_DAYS: 730, REVIEW_REQUEST_MAX_RECIPIENTS: 50,
    MARKETING_SENDER_EMAIL: 'clinic@example.com', console: { error() {} },
  });
  assert.equal(res.body.candidates.length, 1);
  assert.equal(res.body.candidates[0].reviewTracking, null);
  assert.equal(res.body.sendReady, true);
  assert.match(res.body.trackingError, /unavailable/);
  assert.ok(Number.isFinite(Date.parse(res.body.fetchedAt)));
});

test('review tracking or sheet-log failures never retry or fail a successfully delivered email', async () => {
  for (const failure of ['prepare', 'recordSent', 'sheet', 'none']) {
    let sends = 0, logged = 0, prepared = false;
    const res = response();
    await run('send', {
      req: { body: { emails: [candidate.email, 'unsubscribed@example.com'] } }, res, sheets: {},
      isGoogleReviewsConfigured: () => true, REVIEW_REQUEST_MAX_RECIPIENTS: 50, getBigQueryClient: () => ({}),
      collectReviewRequestCandidates: async () => ({ candidates: [{ ...candidate, eligible: false }, { ...candidate, email: 'unsubscribed@example.com', unsubscribed: true }] }),
      getBusinessProfile: async () => ({}), fetchGoogleReviews: async () => ({ reviewUrl: 'https://example.com/review' }),
      getCampaignSendBlockReason: () => '', createGmailApi: () => ({}), createEmailTracking,
      getConfirmAttendanceUrl: () => 'https://example.com/api/booking?view=confirm-attendance',
      getCustomerEmailStore: () => ({
        prepare: async () => { if (failure === 'prepare') throw new Error('Denied'); prepared = true; },
        recordSent: async (token, messageId, booking, subject) => {
          logged++;
          assert.match(token, /^[a-f0-9]{64}$/);
          assert.equal(messageId, tracked.messageId);
          assert.equal(booking.email, candidate.email);
          assert.equal(subject, 'How was your visit to Clinic?');
          if (failure === 'recordSent') throw new Error('Denied');
        },
      }),
      sendReviewRequestEmail: async (_gmail, options) => {
        sends++;
        assert.equal(prepared, failure !== 'prepare');
        assert.equal(Boolean(options.trackingUrl), prepared);
        assert.equal(options.candidate.email, candidate.email);
        return { messageId: tracked.messageId, subject: 'How was your visit to Clinic?' };
      },
      recordReviewRequests: async (_sheets, entries) => {
        assert.equal(entries.length, 1);
        if (failure === 'sheet') throw new Error('Denied');
      },
      console: { error() {} },
    });
    assert.equal(sends, 1);
    assert.equal(logged, failure === 'prepare' ? 0 : 1);
    assert.equal(res.body.sent, 1);
    assert.equal(res.body.failed, 0);
    assert.equal(res.body.skipped, 1);
    assert.equal(res.body.trackingWarnings.length, ['prepare', 'recordSent'].includes(failure) ? 1 : 0);
    assert.equal(Boolean(res.body.logError), failure === 'sheet');
  }
});

test('review request sending enforces the existing fifty-recipient maximum', async () => {
  const res = response();
  await run('send', {
    req: { body: { emails: Array.from({ length: 51 }, (_, index) => `${index}@example.com`) } }, res,
    isGoogleReviewsConfigured: () => true, REVIEW_REQUEST_MAX_RECIPIENTS: 50,
  });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /50/);
});

test('review email retains Google review URL, safe HTML and multipart delivery, with optional disclosed tracking', async () => {
  for (const trackingUrl of ['', 'https://example.com/api/booking?view=email-open&token=opaque']) {
    let sends = 0;
    const send = vm.runInNewContext(`(${functions.sendReviewRequestEmail})`, {
      Buffer, crypto, GOOGLE_GMAIL_SENDER_EMAIL: 'clinic@example.com',
      escapeHtml: (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
      sendGmailMessage: async (_gmail, { requestBody: { raw } }) => {
        sends++;
        const mime = Buffer.from(raw, 'base64url').toString();
        assert.match(mime, /multipart\/alternative/);
        const parts = [...mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)].map((match) => Buffer.from(match[1], 'base64').toString());
        assert.equal(parts.length, 2);
        for (const part of parts) assert.match(part, /https:\/\/example.com\/review/);
        assert.match(parts[1], /&lt;script>/);
        assert.doesNotMatch(parts[1], /<script>/);
        assert.equal(parts[1].includes('view=email-open'), Boolean(trackingUrl));
        assert.equal(parts[0].includes('not a read receipt'), Boolean(trackingUrl));
        return { data: { id: tracked.messageId } };
      },
    });
    const result = await send({}, { candidate: { ...candidate, name: '<script>' }, businessProfile: { businessName: 'Clinic' }, reviewUrl: 'https://example.com/review', trackingUrl });
    assert.equal(sends, 1);
    assert.equal(result.messageId, tracked.messageId);
    assert.equal(result.subject, 'How was your visit to Clinic?');
  }
});

test('Places refresh bypasses the cache, reports fetch time and sorts the provided sample newest-first', async () => {
  let calls = 0, fail = false;
  const load = vm.runInNewContext(`
    let cachedGoogleReviews = null, cachedGoogleReviewsAt = 0;
    const GOOGLE_REVIEWS_CACHE_MS = 60000;
    ${functions.fetchGoogleReviews}
    fetchGoogleReviews`, {
    URL, Date, encodeURIComponent, GOOGLE_PLACES_API_KEY: 'test', GOOGLE_PLACE_ID: 'place-test',
    isGoogleReviewsConfigured: () => true,
    fetch: async () => {
      calls++;
      return { ok: !fail, status: 503, json: async () => fail ? { error: { message: 'Google unavailable' } } : {
        displayName: { text: 'Clinic' }, userRatingCount: 23, rating: 4.8,
        reviews: [{ publishTime: '2026-10-01T12:00:00Z' }, { publishTime: '2026-10-19T12:00:00Z' }],
      } };
    },
  });
  const first = await load();
  assert.equal(first.totalRatings, 23);
  assert.ok(Number.isFinite(Date.parse(first.fetchedAt)));
  assert.ok(first.reviews[0].time > first.reviews[1].time);
  assert.equal(await load(), first);
  assert.equal(calls, 1);
  await load({ force: true });
  assert.equal(calls, 2);
  fail = true;
  await assert.rejects(load({ force: true }), /Google unavailable/);
  assert.equal((await load()).totalRatings, 23);
});
