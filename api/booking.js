import { google } from 'googleapis';
import crypto from 'node:crypto';

const CALENDAR_TIME_ZONE = process.env.GOOGLE_CALENDAR_TIME_ZONE || 'America/Toronto';
const CALENDAR_OWNER_EMAIL = process.env.GOOGLE_CALENDAR_OWNER_EMAIL || 'mythaithaimassage@gmail.com';
const PRIMARY_CALENDAR_ID = process.env.GOOGLE_PRIMARY_CALENDAR_ID || CALENDAR_OWNER_EMAIL;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'bookings@mythaithaimassage.com';
const PATIENT_HISTORY_SPREADSHEET_ID = process.env.PATIENT_HISTORY_SPREADSHEET_ID || '1tNrhigAWrvAc6DiLi-W_NwG04bPiTZZEs6KwfYDUclA';
const THERAPIST_SESSION_SECRET = process.env.THERAPIST_SESSION_SECRET || '';
const THERAPIST_ACCOUNTS = process.env.THERAPIST_ACCOUNTS || '[]';

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
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

async function sendConfirmationEmail(payload, calendarEvent) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  if (!payload.email) {
    throw new Error('Customer email is required for confirmation email');
  }
  if (!RESEND_FROM_EMAIL.includes('@')) {
    throw new Error('RESEND_FROM_EMAIL must be a valid email address');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [payload.email],
      subject: `MY THAI THAI booking confirmation - ${payload.id}`,
      text: [
        `Your MY THAI THAI appointment is confirmed.`,
        '',
        `Booking: ${payload.id}`,
        `Service: ${payload.serviceName}`,
        `Therapist: ${payload.therapistName}`,
        `Date: ${payload.date}`,
        `Time: ${payload.time}`,
        `Branch: ${payload.branchName}`,
        `Payment: ${payload.paymentOption}`,
        `Paid: $${payload.paidAmount}`,
        `Total: $${payload.totalAmount}`,
        '',
        'Your appointment has been added to the therapist calendar.',
      ].join('\n'),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    if (
      response.status === 403 &&
      details.toLowerCase().includes('domain is not verified')
    ) {
      throw new Error(
        `Resend sender domain is not verified. Add and verify the domain used by RESEND_FROM_EMAIL in the Resend account for RESEND_API_KEY, then redeploy the app. Details: ${details}`,
      );
    }
    throw new Error(`Resend email failed (${response.status}): ${details}`);
  }
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
            serviceName: row[5], branchName: row[4], pressure: history?.[28] || '',
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
      return res.status(200).json({
        therapist: { name: account.name },
        appointments: upcoming,
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
      await sendConfirmationEmail(payload, calendarEvent);
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
