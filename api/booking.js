import { google } from 'googleapis';

const CALENDAR_TIME_ZONE = process.env.GOOGLE_CALENDAR_TIME_ZONE || 'America/Toronto';
const CALENDAR_OWNER_EMAIL = process.env.GOOGLE_CALENDAR_OWNER_EMAIL || 'mythaithaimassage@gmail.com';

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

async function getOrCreateTherapistCalendar(calendarApi, therapistName) {
  const summary = `${therapistName} - MY THAI THAI`;
  let pageToken;

  do {
    const calendars = await calendarApi.calendarList.list({
      minAccessRole: 'owner',
      maxResults: 250,
      pageToken,
    });
    const existing = calendars.data.items?.find((calendar) => calendar.summary === summary);
    if (existing?.id) return existing.id;
    pageToken = calendars.data.nextPageToken;
  } while (pageToken);

  const created = await calendarApi.calendars.insert({
    requestBody: {
      summary,
      description: `Appointments for ${therapistName}`,
      timeZone: CALENDAR_TIME_ZONE,
    },
  });
  const calendarId = created.data.id;
  if (!calendarId) throw new Error(`Unable to create a calendar for ${therapistName}`);

  await calendarApi.acl.insert({
    calendarId,
    sendNotifications: true,
    requestBody: {
      scope: { type: 'user', value: CALENDAR_OWNER_EMAIL },
      role: 'writer',
    },
  });

  return calendarId;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const calendarApi = google.calendar({ version: 'v3', auth });
    const payload = req.body;
    const therapistName = payload.therapistName || 'Any Available';
    const calendarId = await getOrCreateTherapistCalendar(calendarApi, therapistName);
    const startDateTime = parseBookingDateTime(payload.date, payload.time);
    const durationMinutes = Number(payload.durationMinutes) || 60;
    const endDateTime = addMinutes(startDateTime, durationMinutes);

    const calendarEvent = await calendarApi.events.insert({
      calendarId,
      sendUpdates: 'all',
      requestBody: {
        summary: `${payload.serviceName} - ${payload.customerName}`,
        location: payload.branchAddress || payload.branchName,
        description: [
          `Booking: ${payload.id}`,
          `Customer: ${payload.customerName}`,
          `Phone: ${payload.phone}`,
          `Email: ${payload.email}`,
          `Service: ${payload.serviceName}`,
          `Payment: ${payload.paymentOption}`,
          `Paid: $${payload.paidAmount}`,
          `Total: $${payload.totalAmount}`,
          payload.intakeNotes ? `Intake notes: ${payload.intakeNotes}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: startDateTime, timeZone: CALENDAR_TIME_ZONE },
        end: { dateTime: endDateTime, timeZone: CALENDAR_TIME_ZONE },
        attendees: payload.email ? [{ email: payload.email }] : [],
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

    return res.status(200).json({
      status: 'success',
      calendarId,
      calendarEventId: calendarEvent.data.id,
    });
  } catch (error) {
    console.error('Google Sheets API Error:', error);
    return res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
}
