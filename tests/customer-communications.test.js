import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { communicationKind, createCustomerEmailStore, createReminderTracking, customerCommunicationAccess, gmailCommunication, readCustomerEmails } from '../lib/customer-communications.js';
import { formatAppointmentReminderEmail } from '../lib/appointment-alerts.js';

const rows = [
  ['Booking ID'],
  ['MTT-101', 'Customer', '', ' Client@Example.com ', 'Central'],
  ['MTT-102', 'Customer', '', 'client@example.com', 'West'],
  ['MTT-103', 'Other', '', 'other@example.com', 'Central'],
];
const owner = customerCommunicationAccess(rows, 'MTT-101', { role: 'owner' }, null);
const branch = customerCommunicationAccess(rows, 'MTT-101', { role: 'branch_receptionist' }, new Set(['central']));

function email(changes = {}, headers = {}) {
  return {
    id: 'gmail-1', threadId: 'thread-1', labelIds: ['SENT'], internalDate: String(Date.parse('2026-10-19T16:00:00Z')),
    snippet: 'Hello &amp; welcome. &lt;img src=x&gt;',
    payload: {
      mimeType: 'text/plain', body: { data: Buffer.from('Reference: MTT-101').toString('base64url') },
      headers: Object.entries({ From: 'Clinic <clinic@example.com>', To: '"Customer" <client@example.com>', Subject: 'Booking confirmed MTT-101', ...headers }).map(([name, value]) => ({ name, value })),
    }, ...changes,
  };
}

test('customer history resolves email from an authorized booking and never crosses branch or customer boundaries', () => {
  assert.equal(owner.email, 'client@example.com');
  assert.deepEqual(owner.bookingIds, ['MTT-101', 'MTT-102']);
  assert.deepEqual(branch.bookingIds, ['MTT-101']);
  assert.deepEqual(branch.hiddenBookingIds, ['MTT-102']);
  for (const session of [null, { role: 'therapist' }]) {
    assert.throws(() => customerCommunicationAccess(rows, 'MTT-101', session, null), { statusCode: session ? 403 : 401 });
  }
  for (const id of ['MTT-102', 'unknown']) assert.throws(() => customerCommunicationAccess(rows, id, { role: 'branch_manager' }, new Set(['central'])), { statusCode: 404 });
  assert.throws(() => customerCommunicationAccess(rows, 'MTT-101', { role: 'branch_manager' }, null), { statusCode: 404 });
  assert.throws(() => customerCommunicationAccess([['phone', 'Phone customer', '555', '', 'Central']], 'phone', { role: 'owner' }, null), { statusCode: 400 });
});

test('Gmail normalization uses actual correspondents, safe previews, exact references and sent labels', () => {
  const outgoing = gmailCommunication(email(), owner);
  assert.equal(outgoing.direction, 'sent');
  assert.equal(outgoing.snippet, 'Hello & welcome. <img src=x>');
  assert.deepEqual(outgoing.bookingIds, ['MTT-101']);
  assert.equal(outgoing.occurredAt, '2026-10-19T16:00:00.000Z');
  const reply = gmailCommunication(email({ labelIds: ['INBOX'] }, { From: 'client@example.com', To: 'clinic@example.com', Subject: 'Re: Booking' }), owner);
  assert.equal(reply.direction, 'received');
  assert.equal(gmailCommunication(email({}, { To: 'other@example.com' }), owner), null);
  assert.equal(gmailCommunication(email({}, { To: 'notclient@example.com' }), owner), null);
  assert.equal(gmailCommunication(email({ labelIds: ['DRAFT'] }), owner), null);
  assert.equal(gmailCommunication(email({}, { Subject: 'Your MY THAI THAI dashboard sign-in code' }), owner), null);
  assert.throws(() => gmailCommunication(email({ internalDate: 'invalid' }), owner), /invalid email record/);
});

test('branch mailbox messages require accessible references, including HTML-only mail, and exclude cross-branch threads', () => {
  assert.ok(gmailCommunication(email(), branch));
  const body = (value, mimeType = 'text/plain') => ({ ...email().payload, mimeType, body: { data: Buffer.from(value).toString('base64url') } });
  assert.equal(gmailCommunication(email({ payload: body('MTT-1010') }, { Subject: 'Update' }), { ...branch, bookingIds: ['MTT-10'] }), null);
  assert.equal(gmailCommunication(email({ payload: body('Reference MTT-102') }), branch), null);
  assert.equal(gmailCommunication(email({ payload: body('References MTT-101 and MTT-102') }), branch), null);
  assert.ok(gmailCommunication(email({ payload: body('<p>Reference MTT-101</p>', 'text/html') }), branch));
  const marketing = email({ payload: body('An offer for you') });
  marketing.payload.headers = marketing.payload.headers.map((entry) => entry.name === 'Subject' ? { ...entry, value: 'Special offer' } : entry);
  assert.equal(gmailCommunication(marketing, branch), null);
  assert.equal(gmailCommunication(marketing, owner).kind, 'Marketing');
});

test('email categories include booking, marketing, reviews, receipts, memberships and general replies', () => {
  for (const [subject, expected] of [
    ['Reminder: Today', 'Reminder'], ['How was your visit to MY THAI THAI?', 'Review request'],
    ['Receipt R-1', 'Receipt & payment'], ['Your appointment is confirmed', 'Booking'],
    ['Membership welcome', 'Membership'], ['Summer offer', 'Marketing'], ['A question', 'Email'],
  ]) assert.equal(communicationKind(subject), expected);
  assert.equal(communicationKind('A message', '<https://example.com/unsubscribe>'), 'Marketing');
});

test('encoded Gmail subjects are decoded before display and classification, including Thai and folded words', () => {
  const thaiSubject = 'Reminder: นัดหมายวันนี้';
  const encoded = `=?UTF-8?B?${Buffer.from(thaiSubject).toString('base64')}?=`;
  assert.equal(gmailCommunication(email({}, { Subject: encoded }), owner).subject, thaiSubject);
  assert.equal(gmailCommunication(email({}, { Subject: encoded }), owner).kind, 'Reminder');
  assert.equal(gmailCommunication(email({}, { Subject: '=?UTF-8?Q?Review_request?=' }), owner).subject, 'Review request');
  assert.equal(gmailCommunication(email({}, { Subject: '=?UTF-8?B?Qm9v?= \r\n =?UTF-8?B?a2luZw==?=' }), owner).subject, 'Booking');
});

test('Gmail history paginates, reads without modifying messages, and surfaces errors', async () => {
  let calls = 0;
  const gmail = { users: { messages: {
    async list(request) {
      calls++;
      assert.equal(request.userId, 'me');
      assert.equal(request.maxResults, 40);
      assert.equal(request.pageToken, 'page-two');
      assert.match(request.q, /from:"client@example.com" to:"client@example.com"/);
      assert.match(request.q, /-in:drafts/);
      return { data: { messages: [{ id: 'first' }, { id: 'second' }], nextPageToken: 'page-three' } };
    },
    async get({ id, format }) {
      assert.equal(format, 'full');
      return { data: email({ id, internalDate: id === 'first' ? '1792425600000' : '1792429200000' }) };
    },
  } } };
  const result = await readCustomerEmails(gmail, owner, 'page-two');
  assert.deepEqual(result.messages.map((message) => message.id), ['second', 'first']);
  assert.equal(result.nextPageToken, 'page-three');
  await assert.rejects(readCustomerEmails(gmail, owner, '\r\noperator'), { statusCode: 400 });
  assert.equal(calls, 1);
  gmail.users.messages.list = async () => { throw Object.assign(new Error('Insufficient Permission'), { code: 403 }); };
  await assert.rejects(readCustomerEmails(gmail, owner), /gmail.readonly/);
  const error = new Error('Gmail unavailable');
  gmail.users.messages.list = async () => { throw error; };
  await assert.rejects(readCustomerEmails(gmail, owner), (actual) => actual === error);
});

test('branch Gmail search includes only accessible references and still post-filters results', async () => {
  const gmail = { users: { messages: {
    async list({ q }) {
      assert.match(q, /"MTT-101"/);
      assert.doesNotMatch(q, /MTT-102|MTT-103/);
      return { data: { messages: [{ id: 'cross-branch' }], nextPageToken: 'next' } };
    },
    async get() { return { data: email({}, { Subject: 'MTT-102', To: 'client@example.com' }) }; },
  } } };
  const result = await readCustomerEmails(gmail, branch);
  assert.deepEqual(result.messages, []);
  assert.equal(result.nextPageToken, 'next');
});

test('tracking tokens are opaque and reminder pixels preserve existing links and text', () => {
  const tracking = createReminderTracking('https://example.com/api/booking?view=confirm-attendance&ref=MTT-101');
  const next = createReminderTracking('https://example.com/api/booking?view=confirm-attendance&ref=MTT-101');
  assert.match(tracking.token, /^[a-f0-9]{64}$/);
  assert.notEqual(tracking.token, next.token);
  const url = new URL(tracking.url);
  assert.equal(url.searchParams.get('view'), 'email-open');
  assert.equal(url.searchParams.get('token'), tracking.token);
  assert.equal(url.searchParams.has('ref'), false);
  assert.doesNotMatch(tracking.url, /client@example|MTT-101/);
  const options = {
    booking: { id: 'MTT-101', customerName: 'Customer', email: 'client@example.com', date: '2026-10-19', time: '12:00 PM' },
    confirmUrl: 'https://example.com/confirm', manageUrl: 'https://example.com/manage',
    businessProfile: { businessName: 'Clinic' }, senderEmail: 'clinic@example.com',
  };
  const before = formatAppointmentReminderEmail(options);
  const after = formatAppointmentReminderEmail({ ...options, trackingUrl: tracking.url });
  assert.equal(before.subject, after.subject);
  for (const link of [options.confirmUrl, options.manageUrl]) assert.ok(after.text.includes(link) && after.html.includes(link));
  assert.match(after.html, /width="1" height="1" alt=""/);
  assert.ok(after.raw.includes(Buffer.from(after.html).toString('base64').slice(0, 76)));
  assert.match(after.text, /privacy tools/);
  assert.doesNotMatch(before.html, /view=email-open/);
});

test('tracking storage hashes tokens, creates only its own table, scopes reads and limits open signals to 180 days', async () => {
  let created = 0;
  const queries = [];
  const bigquery = {
    dataset(id) {
      assert.equal(id, 'booking_system');
      return {
        table(name) { assert.equal(name, 'customer_email_activity'); return { exists: async () => [created > 0] }; },
        async createTable(name, options) {
          assert.equal(name, 'customer_email_activity');
          assert.equal(options.schema.length, 8);
          created++;
        },
      };
    },
    async query(request) {
      queries.push(request);
      if (request.query.startsWith('SELECT')) return [[{ message_id: 'gmail-1', booking_id: 'MTT-101', subject: 'Reminder', created_at: '2026-10-19T16:00:00Z', opened_at: '2026-10-19T16:05:00Z' }]];
      return [[]];
    },
  };
  const store = createCustomerEmailStore(bigquery, 'project', 'booking_system');
  const token = 'a'.repeat(64);
  await store.recordSent(token, 'gmail-1', { id: 'MTT-101', email: 'Client@Example.com', branchName: 'Central' }, 'Reminder', '2026-10-19T16:00:00Z');
  assert.equal(created, 1);
  assert.equal(queries[0].params.token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(queries[0].params.email, 'client@example.com');
  assert.ok(!JSON.stringify(queries).includes(token));
  await store.recordOpen(token, '2026-10-19T16:05:00Z');
  assert.match(queries[1].query, /event_type IN \('prepared', 'sent'\)/);
  assert.match(queries[1].query, /NOT EXISTS/);
  assert.equal(queries[1].params.cutoff, new Date(Date.parse('2026-10-19T16:05:00Z') - 180 * 86400000).toISOString());
  await assert.rejects(store.recordOpen('tampered'), { statusCode: 400 });
  await assert.rejects(store.recordSent(token, '', {}, ''), /verify/);
  const reminders = await store.readReminders(branch);
  assert.match(queries[2].query, /s\.booking_id IN UNNEST\(@bookingIds\)/);
  assert.deepEqual(queries[2].params.bookingIds, ['MTT-101']);
  assert.equal(reminders[0].tracked, true);
  assert.equal(reminders[0].openedAt, '2026-10-19T16:05:00Z');
  await store.readReminders(owner);
  assert.doesNotMatch(queries[3].query, /UNNEST/);
  assert.equal(created, 1);
  await store.prepare(token, '2026-10-19T16:00:00Z');
  assert.equal(queries[4].params.event_type, 'prepared');
  assert.equal(queries[4].params.email, '');
});

test('tracking table failures are not silently swallowed and initialization can be retried', async () => {
  let attempts = 0;
  const store = createCustomerEmailStore({
    dataset: () => ({ table: () => ({ exists: async () => [false] }), createTable: async () => { attempts++; throw new Error('BigQuery denied'); } }),
  }, 'project', 'booking_system');
  for (let index = 0; index < 2; index++) await assert.rejects(store.readReminders(owner), /BigQuery denied/);
  assert.equal(attempts, 2);
});
