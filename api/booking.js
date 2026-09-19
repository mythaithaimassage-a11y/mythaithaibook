import { google } from 'googleapis';

const CALENDAR_TIME_ZONE = process.env.GOOGLE_CALENDAR_TIME_ZONE || 'America/Toronto';
const CALENDAR_OWNER_EMAIL = process.env.GOOGLE_CALENDAR_OWNER_EMAIL || 'mythaithaimassage@gmail.com';
const PRIMARY_CALENDAR_ID = process.env.GOOGLE_PRIMARY_CALENDAR_ID || CALENDAR_OWNER_EMAIL;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'mythaithaimassage@gmail.com';

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

async function sendConfirmationEmail(payload, calendarEvent) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  if (!payload.email) {
    throw new Error('Customer email is required for confirmation email');
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
    throw new Error(`Resend email failed (${response.status}): ${details}`);
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
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

    if (req.method === 'GET') {
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
    });
  } catch (error) {
    console.error('Google Sheets API Error:', error);
    return res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
}
