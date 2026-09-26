import { google } from 'googleapis';
import crypto from 'node:crypto';

const CALENDAR_TIME_ZONE = process.env.GOOGLE_CALENDAR_TIME_ZONE || 'America/Toronto';
const CALENDAR_OWNER_EMAIL = process.env.GOOGLE_CALENDAR_OWNER_EMAIL || 'mythaithaimassage@gmail.com';
const PRIMARY_CALENDAR_ID = process.env.GOOGLE_PRIMARY_CALENDAR_ID || CALENDAR_OWNER_EMAIL;
const GOOGLE_GMAIL_SENDER_EMAIL = process.env.GOOGLE_GMAIL_SENDER_EMAIL || '';
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const GOOGLE_OAUTH_REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '';
const PATIENT_HISTORY_SPREADSHEET_ID = process.env.PATIENT_HISTORY_SPREADSHEET_ID || '1tNrhigAWrvAc6DiLi-W_NwG04bPiTZZEs6KwfYDUclA';
const THERAPIST_SESSION_SECRET = process.env.THERAPIST_SESSION_SECRET || '';
const THERAPIST_ACCOUNTS = process.env.THERAPIST_ACCOUNTS || '[]';
const OWNER_ADMIN_PASSWORD = process.env.OWNER_ADMIN_PASSWORD || '';
const OWNER_ADMIN_SESSION_SECRET = process.env.OWNER_ADMIN_SESSION_SECRET || '';
const BUSINESS_PROFILE_FIELDS = ['businessName', 'tagline', 'email', 'phone', 'website', 'address'];
const DEFAULT_BUSINESS_PROFILE = {
  businessName: 'MY THAI THAI',
  tagline: 'Traditional Thai massage & wellness',
  email: 'mythaithaimassage@gmail.com',
  phone: '+1 437 898 7424',
  website: 'https://mythaithaimassage.com',
  address: 'Ontario, Canada',
};

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    const value = part.slice(index + 1);
    try {
      return [part.slice(0, index).trim(), decodeURIComponent(value)];
    } catch {
      return [part.slice(0, index).trim(), ''];
    }
  }));
}

function signTherapistSession(therapistId) {
  const payload = Buffer.from(JSON.stringify({ therapistId, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', THERAPIST_SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function getTherapistSession(req) {
  if (!THERAPIST_SESSION_SECRET) return null;
  const value = parseCookies(req).mtt_therapist_session || '';
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', THERAPIST_SESSION_SECRET).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function getTherapistAccounts() {
  try {
    const accounts = JSON.parse(THERAPIST_ACCOUNTS);
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    throw new Error('THERAPIST_ACCOUNTS must be valid JSON');
  }
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, digest] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !digest) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return actual.length === digest.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(digest));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function therapistCookie(value, maxAge) {
  return `mtt_therapist_session=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict; Secure`;
}

function signOwnerSession() {
  const payload = Buffer.from(JSON.stringify({ role: 'owner', expiresAt: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', OWNER_ADMIN_SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function isOwnerAuthConfigured() {
  return OWNER_ADMIN_PASSWORD.length >= 16 && OWNER_ADMIN_SESSION_SECRET.length >= 32;
}

function getOwnerSession(req) {
  if (!isOwnerAuthConfigured()) return null;
  const value = parseCookies(req).mtt_owner_session || '';
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', OWNER_ADMIN_SESSION_SECRET).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return session.role === 'owner' && session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function ownerCookie(value, maxAge) {
  return `mtt_owner_session=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict; Secure`;
}

function isSameOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return origin === `${protocol}://${host}`;
}

function parseBookingDateTime(date, time) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time || '');
  if (!date || !match) {
    throw new Error('Booking date and time must be provided as YYYY-MM-DD and h:mm AM/PM');
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) {
    throw new Error('Booking time is invalid');
  }
  if (match[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (match[3].toUpperCase() === 'AM' && hour === 12) hour = 0;

  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function addMinutes(dateTime, minutes) {
  const [date, time] = dateTime.split('T');
  const [hours, mins, seconds] = time.split(':').map(Number);
  const value = new Date(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hours,
    mins,
    seconds,
  ));
  value.setUTCMinutes(value.getUTCMinutes() + minutes);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}T${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}:${String(value.getUTCSeconds()).padStart(2, '0')}`;
}

function getTherapistFromDescription(description = '') {
  return description.match(/^Therapist:\s*(.+)$/m)?.[1]?.trim() || '';
}

function getLocalDateTime(value) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat('en-CA', {
      timeZone: CALENDAR_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date),
    time: new Intl.DateTimeFormat('en-US', {
      timeZone: CALENDAR_TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).format(date),
  };
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function hasTimeOverlap(startA, endA, startB, endB) {
  return new Date(startA).getTime() < new Date(endB).getTime() &&
    new Date(endA).getTime() > new Date(startB).getTime();
}

async function findExistingPatientHistory(sheets, payload) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
    range: 'PatientHistory!A:AH',
  });
  const rows = result.data.values || [];
  const email = String(payload.email || '').trim().toLowerCase();
  const phone = String(payload.phone || '').replace(/\D/g, '');
  const row = rows.slice(1).reverse().find((candidate) => {
    const rowEmail = String(candidate[6] || '').trim().toLowerCase();
    const rowPhone = String(candidate[5] || '').replace(/\D/g, '');
    return (email && rowEmail === email) || (phone && rowPhone === phone);
  });
  if (!row) return null;

  return {
    dateOfBirth: row[3] || '',
    gender: row[4] || '',
    address: row[7] || '',
    city: row[8] || '',
    postalCode: row[9] || '',
    heardAbout: row[10] || '',
    conditions: {
      heart: row[11] || '', bloodPressure: row[12] || '', diabetes: row[13] || '',
      cancer: row[14] || '', headaches: row[15] || '', boneJoint: row[16] || '',
      brokenBones: row[17] || '', osteoporosis: row[18] || '', allergies: row[19] || '',
      surgeries: row[20] || '', numbness: row[21] || '', skinSensitivity: row[22] || '',
      pregnant: row[23] || '', medications: row[24] || '',
    },
    details: row[25] || '',
    painAreas: row[26] || '',
    bodyAreas: row[27] || '',
    pressure: row[28] || '',
    consent: true,
    signature: row[30] || '',
    signatureDate: row[31] || '',
  };
}

async function ensurePatientHistorySheet(sheets) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const existingTitles = new Set((spreadsheet.data.sheets || []).map((sheet) => sheet.properties?.title));
  const requests = [];
  if (!existingTitles.has('PatientHistory')) {
    requests.push({ addSheet: { properties: { title: 'PatientHistory' } } });
  }
  if (!existingTitles.has('TherapistAccounts')) {
    requests.push({ addSheet: { properties: { title: 'TherapistAccounts' } } });
  }
  if (!requests.length) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
    requestBody: { requests },
  });
}

async function ensureBusinessProfileSheet(sheets) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not configured');
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const exists = (spreadsheet.data.sheets || [])
    .some((sheet) => sheet.properties?.title === 'BusinessProfile');
  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: 'BusinessProfile' } } }] },
      });
    } catch (error) {
      const refreshed = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties',
      });
      const createdByConcurrentRequest = (refreshed.data.sheets || [])
        .some((sheet) => sheet.properties?.title === 'BusinessProfile');
      if (!createdByConcurrentRequest) throw error;
    }
  }
  const header = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'BusinessProfile!A1:F1',
  });
  if (BUSINESS_PROFILE_FIELDS.some((field, index) => header.data.values?.[0]?.[index] !== field)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'BusinessProfile!A1:F1',
      valueInputOption: 'RAW',
      requestBody: { values: [BUSINESS_PROFILE_FIELDS] },
    });
  }
}

function validateBusinessProfile(input) {
  const profile = Object.fromEntries(BUSINESS_PROFILE_FIELDS.map((field) => [
    field,
    String(input?.[field] || '').trim(),
  ]));
  if (!profile.businessName || profile.businessName.length > 100) {
    throw new Error('Business name is required and must be 100 characters or fewer');
  }
  for (const field of BUSINESS_PROFILE_FIELDS.slice(1)) {
    if (profile[field].length > 250) {
      throw new Error(`${field} must be 250 characters or fewer`);
    }
  }
  if (profile.email && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(profile.email)) {
    throw new Error('Enter a valid business email address');
  }
  if (profile.website) {
    let website;
    try {
      website = new URL(profile.website);
    } catch {
      throw new Error('Website must be a valid https:// or http:// URL');
    }
    if (!['http:', 'https:'].includes(website.protocol)) {
      throw new Error('Website must use https:// or http://');
    }
  }
  return profile;
}

function createGmailApi() {
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_OAUTH_REFRESH_TOKEN) {
    throw new Error('Google Gmail OAuth client ID, client secret, and refresh token must be configured');
  }
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(GOOGLE_GMAIL_SENDER_EMAIL)) {
    throw new Error('GOOGLE_GMAIL_SENDER_EMAIL must be a valid Gmail mailbox');
  }

  const auth = new google.auth.OAuth2(
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth });
}

async function sendGmailConfirmation(gmail, payload) {
  const recipient = String(payload.email || '').trim();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)) {
    throw new Error('A valid customer email is required for confirmation email');
  }

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const base64Lines = (value) => Buffer.from(value)
    .toString('base64')
    .match(/.{1,76}/g)
    .join('\r\n');
  const subject = `Your MY THAI THAI appointment is confirmed - ${payload.id}`;
  const text = [
    `Hello${payload.customerName ? ` ${payload.customerName}` : ''},`,
    '',
    'Your appointment with MY THAI THAI is confirmed. We look forward to welcoming you.',
    '',
    'YOUR APPOINTMENT',
    `Booking reference: ${payload.id}`,
    `Service: ${payload.serviceName}`,
    `Therapist: ${payload.therapistName}`,
    `Date: ${payload.date}`,
    `Time: ${payload.time}`,
    `Location: ${payload.branchName}`,
    '',
    'PAYMENT SUMMARY',
    `Payment method: ${payload.paymentOption}`,
    `Deposit paid: $${payload.paidAmount}`,
    `Appointment total: $${payload.totalAmount}`,
    '',
    'Your appointment has been added to the therapist calendar.',
    'Please keep your booking reference for your records.',
    '',
    'Thank you for choosing MY THAI THAI.',
  ].join('\n');
  const details = [
    ['Booking reference', payload.id],
    ['Service', payload.serviceName],
    ['Therapist', payload.therapistName],
    ['Date', payload.date],
    ['Time', payload.time],
    ['Location', payload.branchName],
  ];
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Appointment confirmed</title></head>
  <body style="margin:0;padding:0;background:#f5f3ef;color:#292821;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ef;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr><td style="background:#31594b;padding:30px 36px;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#dce9df;">MY THAI THAI</p>
            <h1 style="margin:0;font-size:26px;line-height:1.3;">Your appointment is confirmed</h1>
          </td></tr>
          <tr><td style="padding:30px 36px 12px;">
            <p style="margin:0 0 10px;font-size:17px;">Hello${payload.customerName ? ` ${escapeHtml(payload.customerName)}` : ''},</p>
            <p style="margin:0;color:#625f56;line-height:1.6;">We look forward to welcoming you. Here are the details of your upcoming visit.</p>
          </td></tr>
          <tr><td style="padding:16px 36px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e8e5dd;border-radius:10px;">
              ${details.map(([label, value], index) => `<tr><td style="padding:12px 16px;${index < details.length - 1 ? 'border-bottom:1px solid #eeeae3;' : ''}color:#777368;font-size:13px;width:40%;">${escapeHtml(label)}</td><td style="padding:12px 16px;${index < details.length - 1 ? 'border-bottom:1px solid #eeeae3;' : ''}font-size:14px;font-weight:600;">${escapeHtml(value)}</td></tr>`).join('')}
            </table>
          </td></tr>
          <tr><td style="padding:12px 36px 24px;">
            <h2 style="margin:0 0 12px;font-size:17px;">Payment summary</h2>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f6f2;border-radius:10px;">
              <tr><td style="padding:12px 16px;color:#625f56;">Payment method</td><td align="right" style="padding:12px 16px;font-weight:600;">${escapeHtml(payload.paymentOption)}</td></tr>
              <tr><td style="padding:8px 16px;color:#625f56;">Deposit paid</td><td align="right" style="padding:8px 16px;">$${escapeHtml(payload.paidAmount)}</td></tr>
              <tr><td style="padding:8px 16px 14px;color:#292821;font-weight:700;">Appointment total</td><td align="right" style="padding:8px 16px 14px;font-weight:700;">$${escapeHtml(payload.totalAmount)}</td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:0 36px 30px;">
            <p style="margin:0 0 8px;color:#625f56;line-height:1.6;">Your visit has been added to the therapist calendar. Please keep your booking reference <strong>${escapeHtml(payload.id)}</strong> for your records.</p>
            <p style="margin:18px 0 0;color:#31594b;font-weight:600;">Thank you for choosing MY THAI THAI.</p>
          </td></tr>
          <tr><td style="padding:16px 36px;background:#f7f6f2;color:#888477;font-size:12px;text-align:center;">MY THAI THAI · We look forward to seeing you</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const boundary = `mtt_${crypto.randomBytes(12).toString('hex')}`;
  const message = [
    `From: ${GOOGLE_GMAIL_SENDER_EMAIL}`,
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(html),
    `--${boundary}--`,
  ].join('\r\n');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(message).toString('base64url') },
  });
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    if (req.method === 'POST' && req.query?.view === 'therapist-logout') {
      res.setHeader('Set-Cookie', therapistCookie('', 0));
      return res.status(200).json({ status: 'signed_out' });
    }

    if (req.query?.view === 'owner-session' && req.method === 'GET') {
      if (!isOwnerAuthConfigured()) {
        return res.status(503).json({ message: 'Configure an owner password of at least 16 characters and a session secret of at least 32 characters.' });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ authenticated: Boolean(getOwnerSession(req)) });
    }

    if (req.query?.view === 'owner-login' && req.method === 'POST') {
      if (!isOwnerAuthConfigured()) {
        return res.status(503).json({ message: 'Configure an owner password of at least 16 characters and a session secret of at least 32 characters.' });
      }
      if (!isSameOriginRequest(req)) {
        return res.status(403).json({ message: 'Sign-in request origin is not allowed' });
      }
      const password = String(req.body?.password || '');
      const provided = Buffer.from(password);
      const expected = Buffer.from(OWNER_ADMIN_PASSWORD);
      if (
        password.length > 1024 ||
        provided.length !== expected.length ||
        !crypto.timingSafeEqual(provided, expected)
      ) {
        return res.status(401).json({ message: 'Incorrect owner password' });
      }
      res.setHeader('Set-Cookie', ownerCookie(signOwnerSession(), 8 * 60 * 60));
      return res.status(200).json({ authenticated: true });
    }

    if (req.query?.view === 'owner-logout' && req.method === 'POST') {
      if (!isSameOriginRequest(req)) {
        return res.status(403).json({ message: 'Sign-out request origin is not allowed' });
      }
      res.setHeader('Set-Cookie', ownerCookie('', 0));
      return res.status(200).json({ authenticated: false });
    }

    const view = String(req.query?.view || '');
    const validGetViews = ['', 'calendar', 'patient-history', 'business-profile', 'therapist-dashboard', 'therapist-session'];
    if (req.method === 'GET' && !validGetViews.includes(view)) {
      return res.status(404).json({ message: 'Unknown booking view' });
    }
    const ownerOnlyRequest = req.method === 'GET' && ['', 'calendar', 'patient-history', 'business-profile'].includes(view) ||
      view === 'business-profile';
    if (ownerOnlyRequest) res.setHeader('Cache-Control', 'no-store');
    if (ownerOnlyRequest && !getOwnerSession(req)) {
      return res.status(401).json({ message: 'Owner sign-in required' });
    }
    if (view === 'business-profile' && req.method === 'POST' && !isSameOriginRequest(req)) {
      return res.status(403).json({ message: 'Profile update origin is not allowed' });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/calendar',
      ],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const calendarApi = google.calendar({ version: 'v3', auth });

    if (req.query?.view === 'therapist-dashboard' || req.query?.view === 'therapist-session') {
      const session = getTherapistSession(req);
      if (!session) return res.status(401).json({ message: 'Therapist sign-in required' });
      const accountsResult = await sheets.spreadsheets.values.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistAccounts!A:F',
      }).catch((error) => {
        if (error.code === 400) return { data: { values: [] } };
        throw error;
      });
      const sheetAccount = (accountsResult.data.values || []).slice(1)
        .map((row) => ({ id: row[0], username: row[1], name: row[2], passwordHash: row[3], status: row[4] }))
        .find((item) => item.id === session.therapistId && item.status === 'approved');
      const account = sheetAccount || getTherapistAccounts().find((item) => item.id === session.therapistId);
      if (!account) return res.status(401).json({ message: 'Therapist account is not available or is not approved' });
      if (req.query.view === 'therapist-session') return res.status(200).json({ therapist: { id: account.id, name: account.name } });
    }

    if (req.method === 'POST' && req.query?.view === 'therapist-signup') {
      if (!THERAPIST_SESSION_SECRET) return res.status(503).json({ message: 'Therapist authentication is not configured' });
      const name = String(req.body?.name || '').trim();
      const username = String(req.body?.username || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!name || !/^[a-z0-9._-]{3,32}$/.test(username) || password.length < 12) {
        return res.status(400).json({ message: 'Enter a name, a username using 3-32 letters/numbers, and a password of at least 12 characters.' });
      }
      await ensurePatientHistorySheet(sheets);
      const accountsResult = await sheets.spreadsheets.values.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistAccounts!A:F',
      }).catch((error) => {
        if (error.code === 400) return { data: { values: [] } };
        throw error;
      });
      const accounts = accountsResult.data.values || [];
      const existing = accounts.slice(1).find((row) => String(row[1] || '').toLowerCase() === username);
      if (existing) return res.status(409).json({ message: 'That username is already registered.' });
      if (!accounts.length) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
          range: 'TherapistAccounts!A:F',
          valueInputOption: 'RAW',
          requestBody: { values: [['Therapist ID', 'Username', 'Name', 'Password Hash', 'Status', 'Created At']] },
        });
      }
      await sheets.spreadsheets.values.append({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistAccounts!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[crypto.randomUUID(), username, name, hashPassword(password), 'pending', new Date().toISOString()]] },
      });
      return res.status(201).json({ status: 'pending', message: 'Registration submitted. An administrator must approve your account before sign-in.' });
    }

    if (req.method === 'POST' && req.query?.view === 'therapist-login') {
      if (!THERAPIST_SESSION_SECRET) return res.status(503).json({ message: 'Therapist authentication is not configured' });
      const username = String(req.body?.username || '').trim().toLowerCase();
      const accountsResult = await sheets.spreadsheets.values.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistAccounts!A:F',
      }).catch((error) => {
        if (error.code === 400) return { data: { values: [] } };
        throw error;
      });
      const sheetAccount = (accountsResult.data.values || []).slice(1)
        .map((row) => ({ id: row[0], username: row[1], name: row[2], passwordHash: row[3], status: row[4] }))
        .find((item) => item.username === username);
      const account = sheetAccount || getTherapistAccounts().find((item) => item.username === username);
      if (sheetAccount && sheetAccount.status !== 'approved') {
        return res.status(403).json({ message: sheetAccount ? 'Your account is awaiting administrator approval.' : 'Invalid therapist username or password' });
      }
      if (!account || !verifyPassword(req.body?.password, account.passwordHash)) {
        return res.status(401).json({ message: 'Invalid therapist username or password' });
      }
      res.setHeader('Set-Cookie', therapistCookie(signTherapistSession(account.id), 8 * 60 * 60));
      return res.status(200).json({ therapist: { id: account.id, name: account.name } });
    }

    if (req.query?.view === 'therapist-dashboard') {
      const [bookingResult, historyResult] = await Promise.all([
        sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID, range: 'Sheet1!A:R' }),
        sheets.spreadsheets.values.get({ spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID, range: 'PatientHistory!A:AH' }),
      ]);
      const bookings = (bookingResult.data.values || []).filter((row) => row[0] && row[0] !== 'Booking ID');
      const histories = (historyResult.data.values || []).filter((row) => row[0] && row[0] !== 'Booking ID');
      const session = getTherapistSession(req);
      const accountsResult = await sheets.spreadsheets.values.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistAccounts!A:F',
      }).catch(() => ({ data: { values: [] } }));
      const sheetAccount = (accountsResult.data.values || []).slice(1)
        .map((row) => ({ id: row[0], name: row[2], status: row[4] }))
        .find((item) => item.id === session.therapistId && item.status === 'approved');
      const account = sheetAccount || getTherapistAccounts().find((item) => item.id === session.therapistId);
      const therapistBookings = bookings.filter((row) => row[6] === account.name);
      const upcoming = therapistBookings.filter((row) => row[7] >= new Date().toISOString().slice(0, 10))
        .map((row) => {
          const history = histories.find((candidate) => candidate[0] === row[0]);
          const yesConditions = history ? [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].filter((index) => String(history[index] || '').toLowerCase() === 'yes').length : 0;
          return {
            bookingId: row[0], patientName: row[1], date: row[7], time: row[8],
            serviceName: row[5], branchName: row[4], durationMinutes: Number(row[12]) || 0, pressure: history?.[28] || '',
            painAreas: history?.[26] || '', bodyAreas: history?.[27] || '',
            hasReportedConditions: yesConditions > 0, reportedConditionCount: yesConditions,
            allergiesToOil: history?.[19] === 'Yes', additionalDetails: history?.[25] || '',
          };
        });
      const attended = therapistBookings
        .filter((row) => row[7] < new Date().toISOString().slice(0, 10))
        .sort((a, b) => `${b[7]} ${b[8]}`.localeCompare(`${a[7]} ${a[8]}`))
        .map((row) => ({
          bookingId: row[0],
          patientName: row[1],
          date: row[7],
          time: row[8],
          serviceName: row[5],
          branchName: row[4],
          durationMinutes: Number(row[12]) || 0,
          status: 'Completed',
        }));
      const branchNames = [...new Set(therapistBookings.map((row) => row[4]).filter(Boolean))];
      const attendedHours = attended.reduce((total, appointment) => total + appointment.durationMinutes, 0) / 60;
      const calendarDate = String(req.query.date || new Date().toISOString().slice(0, 10));
      const calendarView = String(req.query.calendarView || 'agenda');
      const calendarStart = calendarView === 'month'
        ? `${calendarDate.slice(0, 7)}-01`
        : calendarView === 'week'
          ? shiftDate(calendarDate, -((new Date(`${calendarDate}T12:00:00Z`).getUTCDay() + 6) % 7))
          : calendarDate;
      const calendarEnd = calendarView === 'month'
        ? `${shiftDate(calendarStart, 32).slice(0, 7)}-01`
        : shiftDate(calendarStart, calendarView === 'week' ? 7 : 1);
      const calendarResult = await calendarApi.events.list({
        calendarId: PRIMARY_CALENDAR_ID,
        timeMin: `${calendarStart}T00:00:00Z`,
        timeMax: `${calendarEnd}T00:00:00Z`,
        singleEvents: true,
        orderBy: 'startTime',
      });
      const calendarEvents = (calendarResult.data.items || [])
        .filter((event) => getTherapistFromDescription(event.description) === account.name)
        .map((event) => ({
          id: event.id,
          title: event.summary || '',
          start: event.start?.dateTime || event.start?.date || '',
          end: event.end?.dateTime || event.end?.date || '',
          location: event.location || '',
          description: event.description || '',
        }));
      return res.status(200).json({
        therapist: { name: account.name },
        appointments: upcoming,
        calendarEvents,
        calendarDate,
        calendarView,
        profile: {
          branchNames,
          attendedHours,
          attendedClientCount: attended.length,
        },
        attended,
        summary: {
          upcomingCount: upcoming.length,
          flaggedCount: upcoming.filter((item) => item.hasReportedConditions || item.allergiesToOil).length,
        },
      });
    }

    if (req.method === 'GET') {
      if (req.query?.view === 'business-profile') {
        await ensureBusinessProfileSheet(sheets);
        const result = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
          range: 'BusinessProfile!A1:F2',
        });
        const row = result.data.values?.[1] || [];
        const profile = Object.fromEntries(BUSINESS_PROFILE_FIELDS.map((field, index) => [
          field,
          row[index] === undefined ? DEFAULT_BUSINESS_PROFILE[field] : row[index],
        ]));
        return res.status(200).json({ profile });
      }

      if (req.query?.view === 'patient-history') {
        const result = await sheets.spreadsheets.values.get({
          spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
          range: 'PatientHistory!A:AH',
        });
        const rows = result.data.values || [];
        const dataRows = rows[0]?.[0] === 'Booking ID' ? rows.slice(1) : rows;
        return res.status(200).json({
          patientHistory: dataRows.reverse().filter((row) => row[0]).map((row) => ({
            bookingId: row[0] || '',
            createdAt: row[1] || '',
            patientName: row[2] || '',
            dateOfBirth: row[3] || '',
            gender: row[4] || '',
            phone: row[5] || '',
            email: row[6] || '',
            address: row[7] || '',
            city: row[8] || '',
            postalCode: row[9] || '',
            heardAbout: row[10] || '',
            conditions: {
              heart: row[11] || '', bloodPressure: row[12] || '', diabetes: row[13] || '',
              cancer: row[14] || '', headaches: row[15] || '', boneJoint: row[16] || '',
              brokenBones: row[17] || '', osteoporosis: row[18] || '', allergies: row[19] || '',
              surgeries: row[20] || '', numbness: row[21] || '', skinSensitivity: row[22] || '',
              pregnant: row[23] || '', medications: row[24] || '',
            },
            details: row[25] || '',
            painAreas: row[26] || '',
            bodyAreas: row[27] || '',
            pressure: row[28] || '',
            consent: row[29] || '',
            signature: row[30] || '',
            signatureDate: row[31] || '',
          })),
        });
      }

      if (req.query?.view === 'calendar') {
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        const branch = String(req.query.branch || '').toLowerCase();
        const therapist = String(req.query.therapist || '').toLowerCase();
        const sheetResult = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
          range: 'Sheet1!A:R',
        });
        const sheetRows = sheetResult.data.values || [];
        const dataRows = sheetRows[0]?.[0] === 'Booking ID' ? sheetRows.slice(1) : sheetRows;
        const bookingByEventId = new Map(dataRows.map((row) => [row[16], row[6]]).filter(([id]) => id));
        const calendarIds = [...new Set([
          PRIMARY_CALENDAR_ID,
          ...dataRows.map((row) => row[15]).filter(Boolean),
        ])];
        const calendars = await calendarApi.calendarList.list({ minAccessRole: 'reader', maxResults: 250 });
        const events = [];
        const calendarErrors = [];

        for (const calendarId of calendarIds) {
          try {
            const calendar = calendars.data.items?.find((item) => item.id === calendarId);
            const result = await calendarApi.events.list({
              calendarId,
              timeMin: `${shiftDate(date, -1)}T00:00:00Z`,
              timeMax: `${shiftDate(date, 2)}T00:00:00Z`,
              singleEvents: true,
              orderBy: 'startTime',
            });
            for (const event of result.data.items || []) {
              const location = event.location || '';
              const start = event.start?.dateTime || event.start?.date || '';
              const localStart = start ? getLocalDateTime(start) : { date: '', time: '' };
              const eventTherapist = bookingByEventId.get(event.id) || getTherapistFromDescription(event.description);
              if (
                localStart.date === date &&
                (!branch || location.toLowerCase().includes(branch)) &&
                (!therapist || eventTherapist.toLowerCase() === therapist)
              ) {
                events.push({
                  id: event.id,
                  calendarName: calendar?.summary || calendarId,
                  summary: event.summary || '',
                  location,
                  description: event.description || '',
                  start,
                  end: event.end?.dateTime || event.end?.date || '',
                  therapistName: eventTherapist,
                  localTime: localStart.time,
                });
              }
            }
          } catch (error) {
            console.error(`Unable to load calendar ${calendarId}:`, error);
            calendarErrors.push(`${calendarId}: ${error.message || 'access denied'}`);
          }
        }
        return res.status(200).json({
          date,
          calendarId: PRIMARY_CALENDAR_ID,
          calendarUrl: `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(PRIMARY_CALENDAR_ID)}`,
          events,
          errors: calendarErrors,
        });
      }

      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: 'Sheet1!A:R',
      });
      const rows = result.data.values || [];
      const dataRows = rows[0]?.[0] === 'Booking ID' ? rows.slice(1) : rows;
      return res.status(200).json({
        bookings: dataRows.reverse().map((row) => ({
          id: row[0] || '',
          customerName: row[1] || '',
          phone: row[2] || '',
          email: row[3] || '',
          branchName: row[4] || '',
          serviceName: row[5] || '',
          therapistName: row[6] || '',
          date: row[7] || '',
          time: row[8] || '',
          paymentOption: row[9] || '',
          paidAmount: Number(row[10]) || 0,
          total: Number(row[11]) || 0,
          durationMinutes: Number(row[12]) || 0,
          branchAddress: row[13] || '',
          intakeNotes: row[14] || '',
          calendarId: row[15] || '',
          calendarEventId: row[16] || '',
          createdAt: row[17] || '',
          syncedToSheets: true,
        })),
      });
    }

    if (req.method === 'POST' && req.query?.view === 'business-profile') {
      const profile = validateBusinessProfile(req.body?.profile);
      await ensureBusinessProfileSheet(sheets);
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: 'BusinessProfile!A2:F2',
        valueInputOption: 'RAW',
        requestBody: { values: [BUSINESS_PROFILE_FIELDS.map((field) => profile[field])] },
      });
      return res.status(200).json({ profile });
    }

    const payload = req.body;
    let patientHistory = payload.patientHistory || {};
    if (patientHistory.reuseExisting) {
      patientHistory = await findExistingPatientHistory(sheets, payload);
      if (!patientHistory) {
        return res.status(409).json({
          message: 'No existing patient history was found for this email or phone number. Please complete the health history form.',
        });
      }
    }
    const requestedTherapist = payload.therapistName || 'Any Available';
    const calendarId = PRIMARY_CALENDAR_ID;
    const startDateTime = parseBookingDateTime(payload.date, payload.time);
    const durationMinutes = Number(payload.durationMinutes) || 60;
    const endDateTime = addMinutes(startDateTime, durationMinutes);
    const startInstant = `${startDateTime}-04:00`;
    const endInstant = `${endDateTime}-04:00`;
    const dayEvents = await calendarApi.events.list({
      calendarId,
      timeMin: `${payload.date}T00:00:00Z`,
      timeMax: `${payload.date}T23:59:59Z`,
      singleEvents: true,
    });
    const busyTherapists = new Set(
      (dayEvents.data.items || [])
        .filter((event) => {
          const eventStart = event.start?.dateTime || event.start?.date || '';
          const eventEnd = event.end?.dateTime || event.end?.date || '';
          return eventStart && eventEnd && hasTimeOverlap(startInstant, endInstant, eventStart, eventEnd);
        })
        .map((event) => getTherapistFromDescription(event.description)),
    );
    const candidates = Array.isArray(payload.therapistCandidates) ? payload.therapistCandidates : [];
    const availableCandidates = candidates.filter((name) => !busyTherapists.has(name));
    const therapistName = requestedTherapist !== 'Any Available' && !busyTherapists.has(requestedTherapist)
      ? requestedTherapist
      : availableCandidates[0] || (requestedTherapist === 'Any Available' ? 'Any Available' : '');
    if (!therapistName) {
      return res.status(409).json({ message: 'The selected therapist is busy and no other therapist is available for this time.' });
    }

    const calendarEvent = await calendarApi.events.insert({
      calendarId,
      sendUpdates: 'none',
      requestBody: {
        summary: `${payload.serviceName} - ${payload.customerName}`,
        location: payload.branchAddress || payload.branchName,
        description: [
          `Booking: ${payload.id}`,
          `Customer: ${payload.customerName}`,
          `Phone: ${payload.phone}`,
          `Email: ${payload.email}`,
          `Service: ${payload.serviceName}`,
          `Therapist: ${therapistName}`,
          `Payment: ${payload.paymentOption}`,
          `Paid: $${payload.paidAmount}`,
          `Total: $${payload.totalAmount}`,
          payload.intakeNotes ? `Intake notes: ${payload.intakeNotes}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: startDateTime, timeZone: CALENDAR_TIME_ZONE },
        end: { dateTime: endDateTime, timeZone: CALENDAR_TIME_ZONE },
      },
    });

    const rowValues = [
      payload.id,
      payload.customerName,
      payload.phone,
      payload.email,
      payload.branchName,
      payload.serviceName,
      therapistName,
      payload.date,
      payload.time,
      payload.paymentOption,
      payload.paidAmount,
      payload.totalAmount,
      payload.durationMinutes || '',
      payload.branchAddress || '',
      payload.intakeNotes || '',
      calendarId,
      calendarEvent.data.id || '',
      new Date().toISOString(),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Sheet1!A:R',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowValues],
      },
    });

    let patientHistorySaved = false;
    let patientHistoryError = '';
    try {
      await ensurePatientHistorySheet(sheets);
      const history = patientHistory;
      await sheets.spreadsheets.values.append({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'PatientHistory!A:AH',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            payload.id,
            new Date().toISOString(),
            payload.customerName,
            history.dateOfBirth || '',
            history.gender || '',
            payload.phone,
            payload.email,
            history.address || '',
            history.city || '',
            history.postalCode || '',
            history.heardAbout || '',
            history.conditions?.heart || '',
            history.conditions?.bloodPressure || '',
            history.conditions?.diabetes || '',
            history.conditions?.cancer || '',
            history.conditions?.headaches || '',
            history.conditions?.boneJoint || '',
            history.conditions?.brokenBones || '',
            history.conditions?.osteoporosis || '',
            history.conditions?.allergies || '',
            history.conditions?.surgeries || '',
            history.conditions?.numbness || '',
            history.conditions?.skinSensitivity || '',
            history.conditions?.pregnant || '',
            history.conditions?.medications || '',
            history.details || '',
            history.painAreas || '',
            history.bodyAreas || '',
            history.pressure || '',
            history.consent ? 'Yes' : 'No',
            history.signature || '',
            history.signatureDate || '',
            history.preCollectionConsent ? 'Yes' : 'No',
            history.consentTimestamp || '',
          ]],
        },
      });
      patientHistorySaved = true;
    } catch (error) {
      patientHistoryError = error.message || 'Patient history could not be saved';
      console.error('Patient history spreadsheet error:', error);
    }

    let emailSent = false;
    let emailError = '';
    try {
      await sendGmailConfirmation(createGmailApi(), payload);
      emailSent = true;
    } catch (error) {
      emailError = error.message || 'Confirmation email failed';
      console.error('Booking confirmation email error:', error);
    }

    return res.status(200).json({
      status: 'success',
      calendarId,
      calendarEventId: calendarEvent.data.id,
      emailSent,
      emailError,
      therapistName,
      patientHistorySaved,
      patientHistoryError,
    });
  } catch (error) {
    console.error('Google Sheets API Error:', error);
    return res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
}
