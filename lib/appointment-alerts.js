import crypto from 'node:crypto';
import { appointmentTimeMinutes } from './booking-options.js';
import { normalizeBookingTime } from './booking-edit.js';

export const CONFIRMED_ON_TIME_TAG = 'Confirmed on time';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isConfirmedOnTime(statusNotes) {
  return Boolean(statusNotes && String(statusNotes).includes(CONFIRMED_ON_TIME_TAG));
}

export function isReminderSent(statusNotes) {
  return Boolean(statusNotes && String(statusNotes).includes('Reminder sent'));
}

export function buildConfirmedOnTimeNotes(existingNotes, timestampIso = new Date().toISOString()) {
  const current = String(existingNotes || '').trim();
  if (isConfirmedOnTime(current)) return current;
  const note = `Confirmed on time by customer at ${timestampIso}`;
  return current ? `${current} | ${note}` : note;
}

export function buildReminderSentNotes(existingNotes, timestampIso = new Date().toISOString()) {
  const current = String(existingNotes || '').trim();
  const note = `Reminder sent at ${timestampIso}`;
  return current ? `${current} | ${note}` : note;
}

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email.trim());
}

export function collectAppointmentAlertCandidates(bookingRows, options = {}) {
  const { todayDate, allowedBranches = null, nowTimeMinutes = null } = options;
  const rows = Array.isArray(bookingRows) ? bookingRows : [];
  const targetDate = String(todayDate || '').trim();

  const stats = {
    total: 0,
    upcoming: 0,
    confirmed: 0,
    remindersSent: 0,
    cancelled: 0,
    missingEmail: 0,
  };

  const candidates = [];

  for (const row of rows) {
    if (!row || !Array.isArray(row) || !row[0] || row[0] === 'Booking ID') continue;

    const rowDate = String(row[7] || '').trim();
    if (targetDate && rowDate !== targetDate) continue;

    const branch = String(row[4] || '').trim();
    if (allowedBranches && !allowedBranches.has(branch.toLowerCase())) continue;

    stats.total += 1;

    const status = String(row[24] || '').trim();
    if (status === 'Cancelled') {
      stats.cancelled += 1;
      continue;
    }

    const email = String(row[3] || '').trim().toLowerCase();
    const hasValidEmail = isValidEmail(email);
    if (!hasValidEmail) {
      stats.missingEmail += 1;
    }

    const statusNotes = String(row[25] || '').trim();
    const confirmed = isConfirmedOnTime(statusNotes);
    if (confirmed) stats.confirmed += 1;

    const reminderSent = isReminderSent(statusNotes);
    if (reminderSent) stats.remindersSent += 1;

    const timeStr = normalizeBookingTime(String(row[8] || '').trim());
    const duration = Number(row[12]) || 60;
    const startMinutes = appointmentTimeMinutes(timeStr);
    const endMinutes = startMinutes + duration;

    let isUpcoming = status !== 'Completed' && status !== 'No Show';
    if (isUpcoming && typeof nowTimeMinutes === 'number' && Number.isFinite(nowTimeMinutes)) {
      isUpcoming = endMinutes > nowTimeMinutes;
    }
    if (isUpcoming) stats.upcoming += 1;

    const eligible = hasValidEmail && status !== 'Cancelled' && status !== 'No Show';

    candidates.push({
      id: String(row[0] || '').trim(),
      customerName: String(row[1] || '').trim(),
      phone: String(row[2] || '').trim(),
      email,
      hasEmail: hasValidEmail,
      branchName: branch,
      serviceName: String(row[5] || '').trim(),
      therapistName: String(row[6] || '').trim(),
      date: rowDate,
      time: timeStr,
      durationMinutes: duration,
      status: status || 'Confirmed',
      statusNotes,
      confirmedOnTime: confirmed,
      reminderSent,
      isUpcoming,
      eligible,
    });
  }

  candidates.sort((a, b) => {
    const aMin = appointmentTimeMinutes(a.time);
    const bMin = appointmentTimeMinutes(b.time);
    return aMin - bMin;
  });

  return {
    todayDate: targetDate,
    candidates,
    stats,
  };
}

export function formatAppointmentReminderEmail({ booking, confirmUrl, manageUrl, businessProfile, senderEmail }) {
  const recipient = String(booking?.email || '').trim().toLowerCase();
  if (!isValidEmail(recipient)) {
    throw new Error('A valid customer email is required to send an appointment reminder.');
  }

  const safeBusinessName = String(businessProfile?.businessName || 'MY THAI THAI').replace(/[\r\n"]/g, '').trim();
  const safeSenderEmail = String(senderEmail || businessProfile?.email || 'mythaithaimassage@gmail.com').replace(/[\r\n"]/g, '').trim();
  const greeting = booking.customerName ? `Hello ${booking.customerName},` : 'Hello,';
  const subject = `Reminder: Your appointment today at ${safeBusinessName} - ${booking.time}`;

  const detailsLines = [
    `Service: ${booking.serviceName || 'Massage Session'}`,
    booking.therapistName ? `Therapist: ${booking.therapistName}` : '',
    `Date: ${booking.date}`,
    `Time: ${booking.time}`,
    booking.branchName ? `Location: ${booking.branchName}` : '',
  ].filter(Boolean);

  const text = [
    greeting,
    '',
    `This is a friendly reminder for your appointment today with ${safeBusinessName}.`,
    '',
    'APPOINTMENT DETAILS:',
    ...detailsLines,
    '',
    'CAN YOU MAKE IT ON TIME?',
    'Please let us know you will arrive on time by clicking the confirmation link below:',
    confirmUrl,
    '',
    'NEED TO CANCEL OR RESCHEDULE?',
    'If you need to change your appointment, please use our online booking management link:',
    manageUrl,
    '',
    'Thank you for choosing us, and we look forward to seeing you!',
    safeBusinessName,
    businessProfile?.phone ? `Phone: ${businessProfile.phone}` : '',
  ].filter((line) => line !== null && line !== undefined).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;background:#f3f5f4;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#18251f">
  <div style="display:none;max-height:0;overflow:hidden">Friendly reminder for your appointment today at ${escapeHtml(safeBusinessName)} (${escapeHtml(booking.time)})</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e2e9e5;border-radius:14px;overflow:hidden">
          <tr>
            <td style="padding:26px 32px;background:#073d32;color:#fff">
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;font-weight:bold">${escapeHtml(safeBusinessName).toUpperCase()}</p>
              <h1 style="margin:0;font-size:22px;line-height:1.3">Appointment Reminder Today</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px">
              <p style="margin:0 0 14px;font-size:16px">${escapeHtml(greeting)}</p>
              <p style="margin:0 0 20px;line-height:1.6;color:#374151">This is a friendly reminder for your appointment today at <strong>${escapeHtml(safeBusinessName)}</strong>.</p>
              
              <div style="background:#f8faf9;border:1px solid #e2e9e5;border-radius:10px;padding:18px 20px;margin:0 0 24px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6">
                  <tr><td style="padding:4px 0;color:#6b7280;width:110px;font-weight:600">Service:</td><td style="padding:4px 0;color:#111827;font-weight:bold">${escapeHtml(booking.serviceName || 'Massage Session')}</td></tr>
                  ${booking.therapistName ? `<tr><td style="padding:4px 0;color:#6b7280;font-weight:600">Therapist:</td><td style="padding:4px 0;color:#111827">${escapeHtml(booking.therapistName)}</td></tr>` : ''}
                  <tr><td style="padding:4px 0;color:#6b7280;font-weight:600">Date:</td><td style="padding:4px 0;color:#111827">${escapeHtml(booking.date)}</td></tr>
                  <tr><td style="padding:4px 0;color:#6b7280;font-weight:600">Time:</td><td style="padding:4px 0;color:#087765;font-weight:bold;font-size:15px">${escapeHtml(booking.time)}</td></tr>
                  ${booking.branchName ? `<tr><td style="padding:4px 0;color:#6b7280;font-weight:600">Location:</td><td style="padding:4px 0;color:#111827">${escapeHtml(booking.branchName)}</td></tr>` : ''}
                </table>
              </div>

              <div style="text-align:center;margin:28px 0 24px">
                <p style="margin:0 0 12px;font-weight:bold;color:#111827;font-size:15px">Can you make it on time?</p>
                <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:14px 28px;background:#059669;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">Confirm you can make it on time</a>
                <p style="margin:8px 0 0;font-size:12px;color:#6b7280">Clicking confirms your attendance with our clinic team.</p>
              </div>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />

              <div style="font-size:13px;color:#4b5563;line-height:1.6">
                <p style="margin:0 0 8px;font-weight:600;color:#374151">Need to reschedule or cancel?</p>
                <p style="margin:0 0 12px">If you need to make changes to your booking, you can manage it anytime online:</p>
                <a href="${escapeHtml(manageUrl)}" style="color:#087765;font-weight:bold;text-decoration:underline">Cancel or reschedule appointment</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#f8faf9;color:#718078;font-size:12px;border-top:1px solid #e2e9e5">
              ${escapeHtml(safeBusinessName)}${businessProfile?.address ? ` · ${escapeHtml(businessProfile.address)}` : ''}<br>
              ${escapeHtml(businessProfile?.phone || '')}${businessProfile?.phone && businessProfile?.email ? ' · ' : ''}${escapeHtml(businessProfile?.email || '')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const boundary = `reminder_${crypto.randomBytes(12).toString('hex')}`;
  const encode = (value) => Buffer.from(value).toString('base64').match(/.{1,76}/g).join('\r\n');
  const raw = [
    `From: "${safeBusinessName}" <${safeSenderEmail}>`,
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encode(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encode(html),
    `--${boundary}--`,
  ].join('\r\n');

  return {
    subject,
    text,
    html,
    raw,
  };
}
