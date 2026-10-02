import crypto from 'node:crypto';

const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const pendingSql = `STARTS_WITH(booking_id, 'WIX-')
  AND COALESCE(calendar_event_id, '') = ''
  AND COALESCE(status, '') NOT IN ('Cancelled', 'No Show')`;

export function wixCalendarEvent(booking, timeZone) {
  const date = String(booking.date || '');
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(booking.time || '').trim());
  const duration = Number(booking.duration_minutes);
  const day = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date ||
      !match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59 ||
      !Number.isInteger(duration) || duration <= 0 || duration > 1440) {
    throw fail(`Booking ${booking.booking_id} has an invalid date, time or duration. Correct it before Calendar sync.`);
  }
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  const start = `${date}T${String(hour).padStart(2, '0')}:${match[2]}:00`;
  const end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, Number(match[2]) + duration))
    .toISOString().slice(0, 19);
  return {
    summary: `${booking.service_name} - ${booking.customer_name || booking.email || booking.phone || 'Wix customer'}`,
    location: booking.branch_address || booking.branch_name || '',
    description: [
      `Booking: ${booking.booking_id}`, 'Source: Wix historical import',
      `Customer: ${booking.customer_name || ''}`, `Phone: ${booking.phone || ''}`, `Email: ${booking.email || ''}`,
      `Branch: ${booking.branch_name || ''}`, `Service: ${booking.service_name || ''}`,
      `Therapist: ${booking.therapist_name || ''}`, `Status: ${booking.status || ''}`,
      `Payment: ${booking.payment_option || ''}`, `Paid: $${Number(booking.paid_amount) || 0}`,
      `Total: $${Number(booking.total) || 0}`,
    ].join('\n'),
    start: { dateTime: start, timeZone },
    end: { dateTime: end, timeZone },
    extendedProperties: { private: { wixBookingId: booking.booking_id } },
    reminders: { useDefault: false },
  };
}

export async function syncWixCalendarBatch(bigquery, calendar, { projectId, datasetId, tableId, calendarId, timeZone }) {
  if (!/^[\w-]+$/.test(projectId) || !/^\w+$/.test(datasetId) || !/^\w+$/.test(tableId) || !calendarId) {
    throw new Error('Configure the existing bookings table and primary Calendar before syncing Wix bookings.');
  }
  new Intl.DateTimeFormat('en-CA', { timeZone }).format();
  const ref = `\`${projectId}.${datasetId}.${tableId}\``;
  const [bookings] = await bigquery.query({
    query: `SELECT * FROM ${ref} WHERE ${pendingSql} ORDER BY booking_id LIMIT 10`,
  });
  let synced = 0;
  const errors = [];
  for (const booking of bookings) {
    try {
      const eventId = `a11${crypto.createHash('sha256').update(`${ref}\n${booking.booking_id}`).digest('hex')}`;
      const event = wixCalendarEvent(booking, timeZone);
      try {
        await calendar.events.insert({
          calendarId, sendUpdates: 'none', requestBody: { id: eventId, ...event },
        });
      } catch (error) {
        if (Number(error.code || error.response?.status) !== 409) throw error;
        // An earlier attempt may have created the event before its database link was saved.
        const existing = await calendar.events.get({ calendarId, eventId });
        if (existing.data?.status === 'cancelled' || existing.data?.extendedProperties?.private?.wixBookingId !== booking.booking_id) {
          throw fail('The deterministic Calendar event is deleted or belongs to another booking. Reconcile it before retrying.');
        }
        await calendar.events.patch({ calendarId, eventId, sendUpdates: 'none', requestBody: event });
      }
      await bigquery.query({
        query: `BEGIN TRANSACTION;
          ASSERT (SELECT COUNT(*) FROM ${ref} WHERE booking_id = @bookingId
            AND ${pendingSql} AND COALESCE(date, '') = @date AND COALESCE(time, '') = @time
            AND duration_minutes = @duration AND COALESCE(therapist_name, '') = @therapist
            AND COALESCE(status, '') = @status) = 1 AS 'Booking changed during Calendar sync; refresh and retry';
          UPDATE ${ref} SET calendar_id = @calendarId, calendar_event_id = @eventId WHERE booking_id = @bookingId;
          COMMIT TRANSACTION;`,
        params: {
          bookingId: booking.booking_id, calendarId, eventId, date: booking.date, time: booking.time,
          duration: booking.duration_minutes, therapist: booking.therapist_name || '', status: booking.status || '',
        },
      });
      synced += 1;
    } catch (error) {
      console.error('Wix Calendar sync failed:', booking.booking_id, error.message);
      errors.push({ bookingId: booking.booking_id, message: error.message || 'Calendar sync failed.' });
      // Stop on errors to avoid rate-limit storms and surface a resumable partial result.
      break;
    }
  }
  const [remaining] = await bigquery.query({
    query: `SELECT COUNT(*) AS pending FROM ${ref} WHERE ${pendingSql}`,
  });
  return { synced, pending: Number(remaining[0].pending), errors };
}
