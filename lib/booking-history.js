import crypto from 'node:crypto';

export const CLEAR_HISTORY_CONFIRMATION = 'CLEAR PAST BOOKINGS';
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const fingerprintSql = `TO_HEX(SHA256(COALESCE(
  STRING_AGG(TO_HEX(SHA256(TO_JSON_STRING(b))), '' ORDER BY TO_JSON_STRING(b)), ''
)))`;
const pastBookingSql = `duration_minutes > 0 AND
  SAFE.TIMESTAMP_ADD(
    SAFE.TIMESTAMP(DATETIME(
      SAFE.PARSE_DATE('%F', date),
      COALESCE(SAFE.PARSE_TIME('%I:%M %p', UPPER(TRIM(time))), SAFE.PARSE_TIME('%H:%M', TRIM(time)))
    ), @timeZone),
    INTERVAL duration_minutes MINUTE
  ) <= TIMESTAMP(@cutoff)`;

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createBookingHistoryStore(bigquery, { projectId, datasetId, tableId, timeZone, secret }) {
  if (!/^[\w-]+$/.test(projectId) || !/^\w+$/.test(datasetId) || !/^\w+$/.test(tableId)) {
    throw new Error('Configure a valid existing BigQuery bookings table.');
  }
  if (!secret || secret.length < 32) throw new Error('Owner session secret is required for booking history confirmation.');
  const ref = `\`${projectId}.${datasetId}.${tableId}\``;
  new Intl.DateTimeFormat('en-CA', { timeZone }).format();

  return {
    async preview() {
      const cutoff = new Date().toISOString();
      const [rows] = await bigquery.query({
        query: `SELECT COUNT(*) AS count,
          COUNTIF(COALESCE(receipt_number, '') != '') AS receipts,
          COUNTIF(COALESCE(paid_amount, 0) > 0) AS paidBookings,
          (SELECT COUNT(*) FROM ${ref}) - COUNT(*) AS kept,
          ${fingerprintSql} AS fingerprint
          FROM ${ref} AS b WHERE ${pastBookingSql}`,
        params: { cutoff, timeZone },
      });
      const row = rows[0];
      const payload = Buffer.from(JSON.stringify({
        cutoff, fingerprint: row.fingerprint, count: Number(row.count),
        expires: Date.now() + 10 * 60 * 1000, table: ref, timeZone,
      })).toString('base64url');
      return {
        count: Number(row.count), receipts: Number(row.receipts), paidBookings: Number(row.paidBookings),
        kept: Number(row.kept), cutoff, timeZone, token: `${payload}.${sign(payload, secret)}`,
      };
    },
    async clear({ token, confirmation } = {}) {
      if (confirmation !== CLEAR_HISTORY_CONFIRMATION) throw fail(`Type ${CLEAR_HISTORY_CONFIRMATION} to confirm permanent deletion.`);
      if (typeof token !== 'string' || token.length > 4096) throw fail('Preview past bookings before clearing.');
      const [payload, signature, extra] = token.split('.');
      const expected = Buffer.from(sign(payload || '', secret));
      const provided = Buffer.from(signature || '');
      if (extra !== undefined || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
        throw fail('Invalid confirmation preview. Preview past bookings again.');
      }
      let reviewed;
      try {
        reviewed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch {
        throw fail('Invalid confirmation preview. Preview past bookings again.');
      }
      if (reviewed.table !== ref || reviewed.timeZone !== timeZone || !Number.isFinite(reviewed.expires) || reviewed.expires < Date.now()) {
        throw fail('Confirmation preview expired or configuration changed. Preview past bookings again.', 409);
      }
      let rows;
      try {
        [rows] = await bigquery.query({
          query: `DECLARE deleted_count INT64;
            BEGIN TRANSACTION;
            CREATE TEMP TABLE past_bookings AS SELECT * FROM ${ref} WHERE ${pastBookingSql};
            ASSERT (SELECT ${fingerprintSql} FROM past_bookings AS b) = @fingerprint
              AS 'Booking history changed; preview again';
            DELETE FROM ${ref} WHERE ${pastBookingSql};
            SET deleted_count = @@row_count;
            COMMIT TRANSACTION;
            SELECT deleted_count AS deleted;`,
          params: { cutoff: reviewed.cutoff, timeZone, fingerprint: reviewed.fingerprint },
        });
      } catch (error) {
        if (error.message?.includes('Booking history changed; preview again')) {
          throw fail('Booking history changed since your preview. Preview again before clearing.', 409);
        }
        throw error;
      }
      return { deleted: Number(rows[0].deleted), cutoff: reviewed.cutoff, timeZone };
    },
  };
}
