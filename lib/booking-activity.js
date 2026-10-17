export const BOOKING_ACTIVITY_TYPES = ['created', 'rescheduled', 'cancelled', 'edited', 'deleted'];

export const BOOKING_ACTIVITY_FIELDS = [
  { name: 'id', type: 'STRING' },
  { name: 'booking_id', type: 'STRING' },
  { name: 'type', type: 'STRING' },
  { name: 'customer_name', type: 'STRING' },
  { name: 'branch_name', type: 'STRING' },
  { name: 'service_name', type: 'STRING' },
  { name: 'therapist_name', type: 'STRING' },
  { name: 'date', type: 'STRING' },
  { name: 'time', type: 'STRING' },
  { name: 'duration_minutes', type: 'INT64' },
  { name: 'previous_date', type: 'STRING' },
  { name: 'previous_time', type: 'STRING' },
  { name: 'actor', type: 'STRING' },
  { name: 'created_at', type: 'STRING' },
];

const ACTIVITY_COLUMNS = BOOKING_ACTIVITY_FIELDS.map(({ name }) => name);

export function bookingActivityRecord(type, row, { previousDate = '', previousTime = '', actor = '', now = new Date().toISOString() } = {}) {
  if (!BOOKING_ACTIVITY_TYPES.includes(type)) throw new Error(`Unknown booking activity type: ${type}`);
  const bookingId = String(row?.[0] || '');
  return {
    id: `${type}-${bookingId}-${now}`,
    booking_id: bookingId,
    type,
    customer_name: String(row?.[1] || ''),
    branch_name: String(row?.[4] || ''),
    service_name: String(row?.[5] || ''),
    therapist_name: String(row?.[6] || ''),
    date: String(row?.[7] || ''),
    time: String(row?.[8] || ''),
    duration_minutes: Math.round(Number(row?.[12]) || 0),
    previous_date: String(previousDate || ''),
    previous_time: String(previousTime || ''),
    actor: String(actor || ''),
    created_at: now,
  };
}

export async function ensureBookingActivityTable(bigquery, datasetId, tableId) {
  const table = bigquery.dataset(datasetId).table(tableId);
  const [exists] = await table.exists();
  if (exists) return;
  try {
    await bigquery.dataset(datasetId).createTable(tableId, {
      schema: BOOKING_ACTIVITY_FIELDS.map(({ name, type }) => ({ name, type, mode: 'NULLABLE' })),
    });
  } catch (error) {
    const [existsNow] = await table.exists();
    if (!existsNow) throw error;
  }
}

export async function insertBookingActivity(bigquery, tableRef, record) {
  await bigquery.query({
    query: `INSERT INTO ${tableRef} (${ACTIVITY_COLUMNS.join(', ')}) VALUES (${ACTIVITY_COLUMNS.map((name) => `@${name}`).join(', ')})`,
    params: record,
  });
}

function activityFromCreatedRow(row) {
  return {
    id: row.booking_id, bookingId: row.booking_id, type: 'created',
    customerName: row.customer_name || '', branchName: row.branch_name || '', serviceName: row.service_name || '',
    therapistName: row.therapist_name || '', date: row.date || '', time: row.time || '',
    durationMinutes: Number(row.duration_minutes) || 0, previousDate: '', previousTime: '', actor: '',
    createdAt: row.created_at,
  };
}

function activityFromRecord(row) {
  return {
    id: row.id, bookingId: row.booking_id, type: row.type,
    customerName: row.customer_name || '', branchName: row.branch_name || '', serviceName: row.service_name || '',
    therapistName: row.therapist_name || '', date: row.date || '', time: row.time || '',
    durationMinutes: Number(row.duration_minutes) || 0, previousDate: row.previous_date || '',
    previousTime: row.previous_time || '', actor: row.actor || '', createdAt: row.created_at,
  };
}

// New bookings come from the bookings table (so history before this log existed still shows);
// reschedules, cancellations, edits and deletions come from the activity log.
export async function readBookingActivity(bigquery, { bookingsTable, activityTable, from, to, allowedBranches, limit = 500 }) {
  const params = { from, to };
  const [[createdRows], [activityRows]] = await Promise.all([
    bigquery.query({
      query: `SELECT booking_id, customer_name, branch_name, service_name, therapist_name, date, time, duration_minutes, created_at FROM ${bookingsTable} WHERE created_at >= @from AND created_at <= @to ORDER BY created_at DESC LIMIT ${limit}`,
      params,
    }),
    bigquery.query({
      query: `SELECT ${ACTIVITY_COLUMNS.join(', ')} FROM ${activityTable} WHERE created_at >= @from AND created_at <= @to ORDER BY created_at DESC LIMIT ${limit}`,
      params,
    }),
  ]);
  return [...createdRows.map(activityFromCreatedRow), ...activityRows.filter((row) => row.type !== 'created').map(activityFromRecord)]
    .filter((event) => !allowedBranches || allowedBranches.has(String(event.branchName || '').trim().toLowerCase()))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id)))
    .slice(0, limit);
}
