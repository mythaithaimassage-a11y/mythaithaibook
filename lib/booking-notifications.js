const STAFF_ROLES = new Set(['owner', 'branch_manager', 'branch_receptionist']);

export function bookingAlertRecipients(users, branchId, ownerEmail = '') {
  const recipients = new Set(ownerEmail ? [ownerEmail.trim().toLowerCase()] : []);
  for (const user of users) {
    if (user.status !== 'active' || !STAFF_ROLES.has(user.role)) continue;
    const branchIds = JSON.parse(user.branch_ids || '[]');
    if (!Array.isArray(branchIds)) throw new Error('Invalid dashboard branch assignments for booking alerts.');
    if (user.role === 'owner' || branchIds.map(String).includes(String(branchId))) {
      const email = String(user.email || '').trim().toLowerCase();
      if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) throw new Error('Invalid dashboard email for booking alerts.');
      recipients.add(email);
    }
  }
  return [...recipients];
}

export async function deliverBookingAlerts(recipients, send) {
  if (!recipients.length) throw new Error('No active dashboard staff email recipients are configured.');
  const failures = [];
  let sent = 0;
  for (let index = 0; index < recipients.length; index += 5) {
    await Promise.all(recipients.slice(index, index + 5).map(async (email) => {
      try {
        await send(email);
        sent += 1;
      } catch (error) {
        console.error('New booking staff email failed:', email, error);
        failures.push({ email, message: error.message || 'Staff email failed.' });
      }
    }));
  }
  return { sent, failures };
}

export async function readBookingNotifications(bigquery, table, since, allowedBranches, now = new Date().toISOString()) {
  if (!since) return { cursor: now, notifications: [] };
  if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(since) || !Number.isFinite(Date.parse(since)) || since > now) {
    throw Object.assign(new Error('A valid booking notification cursor is required.'), { statusCode: 400 });
  }
  // Overlap reads so a booking committed just after a poll is not lost.
  const from = new Date(Date.parse(since) - 120000).toISOString();
  const [rows] = await bigquery.query({
    query: `SELECT booking_id, customer_name, branch_name, service_name, therapist_name, date, time, duration_minutes, created_at FROM ${table} WHERE created_at >= @from AND created_at <= @now ORDER BY created_at, booking_id`,
    params: { from, now },
  });
  return {
    cursor: now,
    notifications: rows.filter((row) => !allowedBranches || allowedBranches.has(String(row.branch_name || '').trim().toLowerCase()))
      .map((row) => ({
        id: row.booking_id, customerName: row.customer_name, branchName: row.branch_name,
        serviceName: row.service_name, therapistName: row.therapist_name,
        date: row.date, time: row.time, durationMinutes: Number(row.duration_minutes), createdAt: row.created_at,
      })),
  };
}
