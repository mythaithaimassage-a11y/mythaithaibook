import crypto from 'node:crypto';
import { isValidEmail } from './appointment-alerts.js';

const HISTORY_PAGE_SIZE = 40;
const TRACKING_TABLE = 'customer_email_activity';
const TRACKING_FIELDS = ['token_hash', 'message_id', 'booking_id', 'email', 'branch_name', 'subject', 'event_type', 'created_at'];
const STAFF_ROLES = new Set(['owner', 'branch_manager', 'branch_receptionist']);
const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export function customerCommunicationAccess(rows, bookingId, session, allowedBranches) {
  if (!STAFF_ROLES.has(session?.role)) throw fail('Dashboard sign-in required', session ? 403 : 401);
  const booking = rows.find((row) => row[0] === bookingId && row[0] !== 'Booking ID');
  if (!booking || (session.role !== 'owner' && (!allowedBranches || !allowedBranches.has(String(booking[4] || '').trim().toLowerCase())))) {
    throw fail('Booking not found or not accessible.', 404);
  }
  const email = normalizeEmail(booking[3]);
  if (!isValidEmail(email)) throw fail('This customer does not have a valid booking email.', 400);
  const customerRows = rows.filter((row) => row[0] && row[0] !== 'Booking ID' && normalizeEmail(row[3]) === email);
  const accessible = customerRows.filter((row) => session.role === 'owner' || allowedBranches.has(String(row[4] || '').trim().toLowerCase()));
  return {
    email, name: String(booking[1] || ''), bookingId,
    bookingIds: accessible.map((row) => String(row[0])),
    restricted: session.role !== 'owner',
    hiddenBookingIds: customerRows.filter((row) => !accessible.includes(row)).map((row) => String(row[0])),
  };
}

function header(payload, name) {
  return payload?.headers?.find((entry) => entry.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeSubject(value) {
  return value.replace(/(\?=)\s+(=\?)/g, '$1$2').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (match, charset, encoding, text) => {
    if (!/^(utf-?8|us-ascii|iso-8859-1|windows-1252)$/i.test(charset)) return match;
    const bytes = encoding.toLowerCase() === 'b' ? Buffer.from(text, 'base64')
      : Buffer.from(text.replace(/_/g, ' ').replace(/=([a-f0-9]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))), 'latin1');
    return new TextDecoder(charset.toLowerCase() === 'utf8' ? 'utf-8' : charset).decode(bytes);
  });
}

function referenceBody(payload) {
  if (payload?.filename) return '';
  if (['text/plain', 'text/html'].includes(payload?.mimeType) && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf8').slice(0, 32000);
  }
  return (payload?.parts || []).map(referenceBody).join('\n').slice(0, 32000);
}

function addresses(value) {
  return (String(value).match(/[^\s<>,;:"()@]+@[^\s<>,;:"()@]+/g) || []).map(normalizeEmail);
}

function hasReference(text, reference) {
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\w-])${escaped}($|[^\\w-])`, 'i').test(text);
}

export function communicationKind(subject, listUnsubscribe = '') {
  if (/reminder|appointment reminder/i.test(subject)) return 'Reminder';
  if (/review|feedback|how was your visit/i.test(subject)) return 'Review request';
  if (/receipt|invoice|payment/i.test(subject)) return 'Receipt & payment';
  if (/booking|appointment|reschedul|cancel/i.test(subject)) return 'Booking';
  if (/membership|loyalty|points|package/i.test(subject)) return 'Membership';
  if (listUnsubscribe || /offer|promotion|special|newsletter|discount/i.test(subject)) return 'Marketing';
  return 'Email';
}

function cleanSnippet(value) {
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const point = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
  }).replace(/\s+/g, ' ').trim().slice(0, 320);
}

export function gmailCommunication(message, access) {
  const payload = message.payload;
  const fromCustomer = addresses(header(payload, 'From')).includes(access.email);
  const toCustomer = addresses(`${header(payload, 'To')},${header(payload, 'Cc')},${header(payload, 'Bcc')}`).includes(access.email);
  if (!fromCustomer && !(toCustomer && message.labelIds?.includes('SENT'))) return null;
  const subject = decodeSubject(header(payload, 'Subject')) || '(No subject)';
  if (/dashboard sign-in code/i.test(subject)) return null;
  const text = `${subject}\n${referenceBody(payload)}`;
  const bookingIds = access.bookingIds.filter((id) => hasReference(text, id));
  if (access.restricted && (!bookingIds.length || access.hiddenBookingIds.some((id) => hasReference(text, id)))) return null;
  const timestamp = Number(message.internalDate);
  if (!message.id || !Number.isFinite(timestamp) || timestamp <= 0) throw new Error('Gmail returned an invalid email record.');
  return {
    id: message.id, threadId: message.threadId || '', subject,
    snippet: cleanSnippet(message.snippet),
    direction: fromCustomer ? 'received' : 'sent',
    kind: communicationKind(subject, header(payload, 'List-Unsubscribe')),
    occurredAt: new Date(timestamp).toISOString(), bookingIds,
  };
}

export function gmailReadError(error) {
  if (error?.code === 403 || error?.response?.status === 403) {
    return fail('Email history needs Gmail read access. Ask the owner to reauthorize the sender mailbox with gmail.readonly in addition to its existing send permission, update GOOGLE_OAUTH_REFRESH_TOKEN and redeploy.', 503);
  }
  return error;
}

export async function readCustomerEmails(gmail, access, pageToken = '') {
  if (typeof pageToken !== 'string' || pageToken.length > 2048 || /[\r\n]/.test(pageToken)) throw fail('Invalid email history page.', 400);
  // Quote mailbox search terms so an address or legacy reference cannot introduce Gmail operators.
  const quote = (value) => `"${value.replace(/["\\]/g, '\\$&')}"`;
  let q = `{from:${quote(access.email)} to:${quote(access.email)} cc:${quote(access.email)} bcc:${quote(access.email)}} -in:trash -in:spam -in:drafts`;
  if (access.restricted) {
    const references = [access.bookingId, ...access.bookingIds.filter((id) => id !== access.bookingId)].slice(0, 100);
    q += ` {${references.map(quote).join(' ')}}`;
  }
  try {
    const { data } = await gmail.users.messages.list({
      userId: 'me', q, maxResults: HISTORY_PAGE_SIZE, ...(pageToken ? { pageToken } : {}),
    });
    const messages = [];
    const listed = data.messages || [];
    for (let index = 0; index < listed.length; index += 5) {
      const batch = await Promise.all(listed.slice(index, index + 5).map(async ({ id }) => {
        const response = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
        return gmailCommunication(response.data, access);
      }));
      messages.push(...batch.filter(Boolean));
    }
    return {
      messages: messages.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      nextPageToken: data.nextPageToken || '',
    };
  } catch (error) {
    throw gmailReadError(error);
  }
}

export function createEmailTracking(confirmationUrl) {
  const url = new URL(confirmationUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid reminder tracking URL.');
  const token = crypto.randomBytes(32).toString('hex');
  url.search = new URLSearchParams({ view: 'email-open', token }).toString();
  return { token, url: url.toString() };
}

export const createReminderTracking = createEmailTracking;

export function createCustomerEmailStore(bigquery, projectId, datasetId) {
  const tableRef = `\`${projectId}.${datasetId}.${TRACKING_TABLE}\``;
  let ready;
  async function ensure() {
    if (!ready) ready = (async () => {
      const dataset = bigquery.dataset(datasetId);
      const [exists] = await dataset.table(TRACKING_TABLE).exists();
      if (exists) return;
      try {
        await dataset.createTable(TRACKING_TABLE, {
          schema: TRACKING_FIELDS.map((name) => ({ name, type: 'STRING', mode: 'NULLABLE' })),
        });
      } catch (error) {
        const [existsNow] = await dataset.table(TRACKING_TABLE).exists();
        if (!existsNow) throw error;
      }
    })().catch((error) => { ready = undefined; throw error; });
    await ready;
  }
  const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
  async function insert(record) {
    await ensure();
    await bigquery.query({
      query: `INSERT INTO ${tableRef} (${TRACKING_FIELDS.join(', ')}) VALUES (${TRACKING_FIELDS.map((name) => `@${name}`).join(', ')})`,
      params: record,
    });
  }
  return {
    async prepare(token, now = new Date().toISOString()) {
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Unable to verify reminder tracking.');
      // Mail privacy proxies can load the image before Gmail's send response arrives.
      await insert({
        token_hash: hash(token), message_id: '', booking_id: '', email: '', branch_name: '', subject: '',
        event_type: 'prepared', created_at: now,
      });
    },
    async recordSent(token, messageId, booking, subject, now = new Date().toISOString()) {
      if (!/^[a-f0-9]{64}$/.test(token) || !messageId) throw new Error('Unable to verify reminder tracking.');
      const record = {
        token_hash: hash(token), message_id: messageId, booking_id: booking.id,
        email: normalizeEmail(booking.email), branch_name: booking.branchName, subject,
        event_type: 'sent', created_at: now,
      };
      await insert(record);
    },
    async recordOpen(token, now = new Date().toISOString()) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw fail('Invalid email tracking token.', 400);
      await ensure();
      await bigquery.query({
        query: `INSERT INTO ${tableRef} (${TRACKING_FIELDS.join(', ')})
          SELECT token_hash, message_id, booking_id, email, branch_name, subject, 'open', @now
          FROM ${tableRef} s WHERE token_hash = @token_hash AND event_type IN ('prepared', 'sent')
          AND created_at >= @cutoff AND NOT EXISTS (
            SELECT 1 FROM ${tableRef} o WHERE o.token_hash = s.token_hash AND o.event_type = 'open'
          ) LIMIT 1`,
        params: { token_hash: hash(token), now, cutoff: new Date(Date.parse(now) - 180 * 86400000).toISOString() },
      });
    },
    async readReminders(access) {
      await ensure();
      const [rows] = await bigquery.query({
        query: `SELECT s.message_id, s.booking_id, s.subject, s.created_at,
          MIN(o.created_at) AS opened_at FROM ${tableRef} s
          LEFT JOIN ${tableRef} o ON o.token_hash = s.token_hash AND o.event_type = 'open'
          WHERE s.event_type = 'sent' AND s.email = @email
          ${access.restricted ? 'AND s.booking_id IN UNNEST(@bookingIds)' : ''}
          GROUP BY s.message_id, s.booking_id, s.subject, s.created_at
          ORDER BY IF(s.booking_id = @bookingId, 0, 1), s.created_at DESC LIMIT 100`,
        params: { email: access.email, bookingId: access.bookingId, ...(access.restricted ? { bookingIds: access.bookingIds } : {}) },
      });
      return rows.map((row) => ({
        id: row.message_id, subject: row.subject, snippet: '', direction: 'sent', kind: communicationKind(row.subject),
        occurredAt: row.created_at, bookingIds: [row.booking_id], openedAt: row.opened_at || '', tracked: true,
      }));
    },
    async readReviewEngagement(emails) {
      if (!emails.length) return [];
      await ensure();
      const [rows] = await bigquery.query({
        query: `SELECT s.email, s.message_id, s.created_at, MIN(o.created_at) AS opened_at
          FROM ${tableRef} s LEFT JOIN ${tableRef} o ON o.token_hash = s.token_hash AND o.event_type = 'open'
          WHERE s.event_type = 'sent' AND s.email IN UNNEST(@emails)
          AND STARTS_WITH(s.subject, 'How was your visit to ')
          GROUP BY s.email, s.message_id, s.created_at
          QUALIFY ROW_NUMBER() OVER (PARTITION BY s.email ORDER BY s.created_at DESC) = 1`,
        params: { emails },
      });
      return rows.map((row) => ({
        email: row.email, messageId: row.message_id, sentAt: row.created_at, openedAt: row.opened_at || '',
      }));
    },
  };
}
