import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import crypto from 'node:crypto';
import { createWixContactStore, prepareWixContacts } from '../lib/wix-contacts.js';
import { applyWixCataloguePrices, applyWixTherapistMappings, importWixBookings, prepareWixBookings } from '../lib/wix-bookings.js';
import { BOOKING_TABLE_FIELDS } from '../lib/booking-schema.js';
import { createPackageStore, historicalPackageVisit, readPackageUsage, packageReceiptDetails } from '../lib/packages.js';

// Body parsing is done manually (see readRawBody/parseRequestBody below) so the Square
// webhook handler can verify its HMAC signature against the exact raw request bytes;
// every other view still gets the same parsed `req.body` object it always has.
export const config = { api: { bodyParser: false }, maxDuration: 60 };

async function readRawBody(req, maxBytes = Infinity) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw Object.assign(new Error('Import request is too large. Split the CSV into smaller files.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const CALENDAR_TIME_ZONE = process.env.GOOGLE_CALENDAR_TIME_ZONE || 'America/Toronto';
const CALENDAR_OWNER_EMAIL = process.env.GOOGLE_CALENDAR_OWNER_EMAIL || 'mythaithaimassage@gmail.com';
const PRIMARY_CALENDAR_ID = process.env.GOOGLE_PRIMARY_CALENDAR_ID || CALENDAR_OWNER_EMAIL;
const GOOGLE_GMAIL_SENDER_EMAIL = process.env.GOOGLE_GMAIL_SENDER_EMAIL || '';
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const GOOGLE_OAUTH_REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '';
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
const GOOGLE_ADS_CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID || '';
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '';
const GOOGLE_ADS_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID || '';
const GOOGLE_ADS_CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET || '';
const GOOGLE_ADS_REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN || '';
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PATIENT_HISTORY_SPREADSHEET_ID = process.env.PATIENT_HISTORY_SPREADSHEET_ID || '1tNrhigAWrvAc6DiLi-W_NwG04bPiTZZEs6KwfYDUclA';
const THERAPIST_SESSION_SECRET = process.env.THERAPIST_SESSION_SECRET || '';
const THERAPIST_ACCOUNTS = process.env.THERAPIST_ACCOUNTS || '[]';
const OWNER_ADMIN_PASSWORD = process.env.OWNER_ADMIN_PASSWORD || '';
const OWNER_ADMIN_SESSION_SECRET = process.env.OWNER_ADMIN_SESSION_SECRET || '';
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN || '';
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID || '';
const SQUARE_ENVIRONMENT = (process.env.SQUARE_ENVIRONMENT || 'production').toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
const SQUARE_WEBHOOK_SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '';
const SQUARE_WEBHOOK_NOTIFICATION_URL = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || '';
const SQUARE_API_VERSION = '2024-08-21';
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const GOOGLE_PLACE_ID = process.env.GOOGLE_PLACE_ID || '';
const BUSINESS_PROFILE_FIELDS = ['businessName', 'legalName', 'tagline', 'email', 'phone', 'website', 'address', 'taxRegistrationNumber', 'photoUrl'];
const LEGACY_BUSINESS_PROFILE_FIELDS = ['businessName', 'tagline', 'email', 'phone', 'website', 'address'];
const DEFAULT_BUSINESS_PROFILE = {
  businessName: 'MY THAI THAI',
  legalName: '',
  tagline: 'Traditional Thai massage & wellness',
  email: 'mythaithaimassage@gmail.com',
  phone: '+1 437 898 7424',
  website: 'https://mythaithaimassage.com',
  address: 'Ontario, Canada',
  taxRegistrationNumber: '',
  photoUrl: '',
};
const BRANCH_FIELDS = ['ID', 'Name', 'Address', 'City', 'Phone', 'Active', 'Updated At', 'Collects Deposit'];
const DEFAULT_BRANCHES = [
  { id: 1, name: 'Mississauga Central', address: '4310 Sherwoodtowne Blvd', city: 'Mississauga, ON', phone: '+1 437 898 7424', active: true },
  { id: 2, name: 'Oakville Downtown', address: '123 Lakeshore Rd E', city: 'Oakville, ON', phone: '+1 437 898 7424', active: true },
  { id: 3, name: 'Toronto West', address: '456 Bloor St W', city: 'Toronto, ON', phone: '+1 437 898 7424', active: true },
  { id: 4, name: 'Yorkville Flagship', address: '88 Yorkville Ave', city: 'Toronto, ON', phone: '+1 437 898 7424', active: true },
];
const SERVICE_FIELDS = ['ID', 'Name', 'Category', 'Duration', 'Price', 'Deposit', 'Is RMT', 'Tax Rate', 'Description', 'Active', 'Updated At'];
const DEFAULT_SERVICES = [
  { id: 1, name: "Thai Traditional Massage (30 min)", category: "Thai Traditional", duration: 30, price: 60, deposit: 15, isRmt: false, taxRate: 0.13, description: "Deep Tissue Massage (No oil)", active: true },
  { id: 2, name: "Thai Traditional Massage (60 min)", category: "Thai Traditional", duration: 60, price: 95, deposit: 20, isRmt: false, taxRate: 0.13, description: "Deep Tissue Massage (No oil)", active: true },
  { id: 3, name: "Thai Traditional Massage (90 min)", category: "Thai Traditional", duration: 90, price: 140, deposit: 30, isRmt: false, taxRate: 0.13, description: "Deep Tissue Massage (No oil)", active: true },
  { id: 4, name: "Thai Traditional Massage - Couple (60 min)", category: "Thai Traditional", duration: 60, price: 185, deposit: 40, isRmt: false, taxRate: 0.13, description: "Deep Tissue Massage (No oil) for 2 people", active: true },
  { id: 5, name: "Thai Traditional Massage - Couple (90 min)", category: "Thai Traditional", duration: 90, price: 275, deposit: 50, isRmt: false, taxRate: 0.13, description: "Deep Tissue Massage (No oil) for 2 people", active: true },
  { id: 6, name: "Thai Combination Swedish (30 min)", category: "Thai Combo Swedish", duration: 30, price: 60, deposit: 15, isRmt: false, taxRate: 0.13, description: "Thai Massage + Swedish Massage", active: true },
  { id: 7, name: "Thai Combination Swedish (60 min)", category: "Thai Combo Swedish", duration: 60, price: 95, deposit: 20, isRmt: false, taxRate: 0.13, description: "Thai Massage + Swedish Massage", active: true },
  { id: 8, name: "Thai Combination Swedish (90 min)", category: "Thai Combo Swedish", duration: 90, price: 140, deposit: 30, isRmt: false, taxRate: 0.13, description: "Thai Massage + Swedish Massage", active: true },
  { id: 9, name: "Thai Combination Swedish - Couple (60 min)", category: "Thai Combo Swedish", duration: 60, price: 185, deposit: 40, isRmt: false, taxRate: 0.13, description: "Thai Massage + Swedish Massage for 2 people", active: true },
  { id: 10, name: "Thai Combination Swedish - Couple (90 min)", category: "Thai Combo Swedish", duration: 90, price: 275, deposit: 50, isRmt: false, taxRate: 0.13, description: "Thai Massage + Swedish Massage for 2 people", active: true },
  { id: 11, name: "Thai Combo Swedish + Hot Stone (60 min)", category: "Hot Stone Combo", duration: 60, price: 105, deposit: 25, isRmt: false, taxRate: 0.13, description: "Thai + Swedish + Hot Stone Massage", active: true },
  { id: 12, name: "Thai Combo Swedish + Hot Stone (90 min)", category: "Hot Stone Combo", duration: 90, price: 150, deposit: 35, isRmt: false, taxRate: 0.13, description: "Thai + Swedish + Hot Stone Massage", active: true },
  { id: 13, name: "Thai Combo Swedish + Hot Stone - Couple (60 min)", category: "Hot Stone Combo", duration: 60, price: 205, deposit: 45, isRmt: false, taxRate: 0.13, description: "Hot Stone Combo for 2 people", active: true },
  { id: 14, name: "Thai Combo Swedish + Hot Stone - Couple (90 min)", category: "Hot Stone Combo", duration: 90, price: 295, deposit: 60, isRmt: false, taxRate: 0.13, description: "Hot Stone Combo for 2 people", active: true },
  { id: 15, name: "Hot Stone Add-On", category: "Add-On & Packages", duration: 15, price: 15, deposit: 0, isRmt: false, taxRate: 0.13, description: "Add warm volcanic stones to any treatment", active: true },
  { id: 16, name: "Package: 60 min x 4 Sessions", category: "Add-On & Packages", duration: 60, price: 360, deposit: 50, isRmt: false, taxRate: 0.13, description: "Bundled 4 sessions of 60 min massage", active: true },
  { id: 17, name: "Package: 90 min x 4 Sessions", category: "Add-On & Packages", duration: 90, price: 540, deposit: 100, isRmt: false, taxRate: 0.13, description: "Bundled 4 sessions of 90 min massage", active: true },
  { id: 18, name: "Registered Massage Therapy (RMT 60 min)", category: "RMT Healthcare", duration: 60, price: 120, deposit: 30, isRmt: true, taxRate: 0.00, description: "Regulated Healthcare with Insurance Receipt", active: true },
  { id: 19, name: "Registered Massage Therapy (RMT 90 min)", category: "RMT Healthcare", duration: 90, price: 170, deposit: 40, isRmt: true, taxRate: 0.00, description: "Regulated Healthcare with Insurance Receipt", active: true },
  { id: 20, name: "Traditional Thai Acupuncture (60 min)", category: "RMT Healthcare", duration: 60, price: 110, deposit: 25, isRmt: true, taxRate: 0.00, description: "Certified Medical Acupuncture", active: true },
];
const THERAPIST_FIELDS = ['ID', 'Name', 'Bio', 'Rating', 'Thai Certified', 'RMT Certified', 'Branch IDs', 'Schedule', 'Active', 'Updated At'];
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_THERAPISTS = [
  { id: 1, name: 'Kanya S.', bio: '10+ years traditional Wat Pho Thai technique experience', rating: 4.9, thaiCertified: true, rmtCertified: false, branches: [1, 2], schedule: {}, active: true },
  { id: 2, name: 'Michael T., RMT', bio: 'CMTO Registered Massage Therapist & Deep Tissue specialist', rating: 4.8, thaiCertified: true, rmtCertified: true, branches: [1, 3], schedule: {}, active: true },
  { id: 3, name: 'Priya P.', bio: 'Hot stone specialist and body stretch master', rating: 4.9, thaiCertified: true, rmtCertified: false, branches: [2, 4], schedule: {}, active: true },
  { id: 4, name: 'Somchai R., RMT', bio: 'Acupuncture practitioner and sports rehabilitation', rating: 5.0, thaiCertified: true, rmtCertified: true, branches: [1, 4], schedule: {}, active: true },
];

// Returns the weekday key ('sun'..'sat') for a YYYY-MM-DD date string, avoiding timezone shifts.
function weekdayKeyForDate(dateStr) {
  const parsed = new Date(`${String(dateStr || '').slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return WEEKDAY_KEYS[parsed.getUTCDay()];
}

// Determines whether a therapist works at a given branch on a given date, honouring a
// per-weekday rotation schedule when configured and falling back to their static branch list.
function isTherapistScheduledAtBranch(therapist, branchId, dateStr) {
  const targetBranchId = Number(branchId);
  const dayKey = weekdayKeyForDate(dateStr);
  const scheduledBranch = dayKey ? therapist?.schedule?.[dayKey] : undefined;
  if (scheduledBranch !== undefined && scheduledBranch !== null && scheduledBranch !== '') {
    return Number(scheduledBranch) === targetBranchId;
  }
  const hasAnySchedule = therapist?.schedule && WEEKDAY_KEYS.some((key) => {
    const value = therapist.schedule[key];
    return value !== undefined && value !== null && value !== '';
  });
  if (hasAnySchedule) return false;
  return (therapist?.branches || []).map(Number).includes(targetBranchId);
}

const DEFAULT_LOYALTY_SETTINGS = {
  enabled: true,
  pointsPerDollar: 10,
  firstSessionMultiplier: 5,
  redemptionPoints: 10000,
  redemptionValue: 10,
  membershipPlans: {
    gold: { monthlyFee: 39, discountPercent: 10, pointsMultiplier: 1.5, freeHotStonePerMonth: 1 },
    platinum: { topUpPrice: 1500, includedHours: 50, discountPercent: 30, hotStoneDiscount: 10, hotStoneSurcharge: 5 },
    silver: { monthlyFee: 250, discountPercent: 5, maxEmployees: 50 },
  },
  tiers: [
    { name: 'Member', threshold: 0 },
    { name: 'Silver', threshold: 500 },
    { name: 'Gold', threshold: 1500 },
  ],
};
const LOYALTY_SHEETS = {
  LoyaltySettings: ['Settings JSON', 'Updated At'],
  LoyaltyMembers: ['Email', 'Name', 'Phone', 'Enrolled At', 'Updated At', 'Membership Type', 'Organization', 'Paid Through', 'Company ID', 'Company Contact Email', 'Is Primary Contact'],
  LoyaltyLedger: ['Transaction ID', 'Email', 'Booking ID', 'Type', 'Points', 'Reward Value', 'Description', 'Created At', 'Hours', 'Receipt No.'],
  LoyaltyCompanies: ['Organization', 'Company ID', 'Contact Email', 'Access Token', 'Created At', 'Updated At', 'Join Token'],
};
const MARKETING_CONTACT_HEADERS = [
  'Email',
  'Customer Name',
  'Status',
  'Consent At',
  'Consent Source',
  'Unsubscribe Token',
  'Unsubscribed At',
];
const MARKETING_SENDER_EMAIL = 'mythaithaimassage@gmail.com';

// --- BigQuery-backed booking records --------------------------------------
// Booking records (formerly rows in the Sheet1 tab) are stored in a proper,
// typed BigQuery table instead of an untyped spreadsheet. Every other data
// set (branches, services, therapists, loyalty, patient history, Square
// payments, marketing contacts) remains in Google Sheets and is unaffected.
//
// Date/time/timestamp fields are intentionally kept as STRING columns (not
// BigQuery DATE/TIMESTAMP types) because the rest of this file parses and
// formats them itself (parseBookingDateTime, ISO strings, "h:mm AM/PM", …).
// Storing them as plain strings preserves exact byte-for-byte compatibility
// with the existing parsing/formatting code and avoids the BigQuery client
// library's wrapper objects for temporal types leaking into the app.
const BIGQUERY_PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
const BIGQUERY_DATASET_ID = process.env.BIGQUERY_DATASET || 'booking_system';
const BIGQUERY_BOOKINGS_TABLE = process.env.BIGQUERY_BOOKINGS_TABLE || 'bookings';

// Sentinel first row so every existing `rows[0]?.[0] === 'Booking ID' ? rows.slice(1) : rows`
// header-detection check throughout this file keeps working unchanged.
const BOOKING_ROW_SENTINEL_HEADER = ['Booking ID'];

let bigQueryClientSingleton = null;
function getBigQueryClient() {
  if (!bigQueryClientSingleton) {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be configured for BigQuery access');
    }
    if (!BIGQUERY_PROJECT_ID) {
      throw new Error('BIGQUERY_PROJECT_ID (or GOOGLE_CLOUD_PROJECT) must be configured with your Google Cloud project ID, e.g. "my-thai-thai-booking-system"');
    }
    bigQueryClientSingleton = new BigQuery({
      projectId: BIGQUERY_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });
  }
  return bigQueryClientSingleton;
}

function bookingsTableRef() {
  return `\`${BIGQUERY_PROJECT_ID}.${BIGQUERY_DATASET_ID}.${BIGQUERY_BOOKINGS_TABLE}\``;
}

let ensureBookingsTablePromise = null;
async function ensureBookingsTable(bigquery) {
  if (!ensureBookingsTablePromise) {
    ensureBookingsTablePromise = (async () => {
      const dataset = bigquery.dataset(BIGQUERY_DATASET_ID);
      const [datasetExists] = await dataset.exists();
      if (!datasetExists) {
        try {
          await bigquery.createDataset(BIGQUERY_DATASET_ID, { location: process.env.BIGQUERY_LOCATION || 'US' });
        } catch (error) {
          const [existsNow] = await dataset.exists();
          if (!existsNow) throw error;
        }
      }
      const table = dataset.table(BIGQUERY_BOOKINGS_TABLE);
      const [tableExists] = await table.exists();
      if (!tableExists) {
        const schema = BOOKING_TABLE_FIELDS.map(({ name, type, mode }) => ({ name, type, mode: mode || 'NULLABLE' }));
        try {
          await dataset.createTable(BIGQUERY_BOOKINGS_TABLE, { schema });
        } catch (error) {
          const [existsNow] = await table.exists();
          if (!existsNow) throw error;
        }
      }
    })().catch((error) => {
      ensureBookingsTablePromise = null;
      throw error;
    });
  }
  return ensureBookingsTablePromise;
}

// Converts a BigQuery result row (a plain object keyed by column name) into
// the legacy 26-element positional array format (row[0]..row[25]) that every
// existing booking-reading code path in this file already expects.
function bookingRowArrayFromRecord(record) {
  return BOOKING_TABLE_FIELDS.map(({ name, type }) => {
    const value = record?.[name];
    if (value === null || value === undefined) return type === 'FLOAT64' || type === 'INT64' ? 0 : '';
    return value;
  });
}

// Maps a legacy 26-element positional row array (row[0]..row[25]) back into
// a { column_name: value } object suitable for a parameterized BigQuery query.
function bookingParamsFromRowArray(rowArray) {
  const params = {};
  BOOKING_TABLE_FIELDS.forEach(({ name, type }, index) => {
    const raw = rowArray[index];
    if (type === 'FLOAT64') params[name] = raw === '' || raw === null || raw === undefined ? 0 : Number(raw) || 0;
    else if (type === 'INT64') params[name] = raw === '' || raw === null || raw === undefined ? 0 : Math.trunc(Number(raw) || 0);
    else params[name] = raw === null || raw === undefined ? '' : String(raw);
  });
  return params;
}

async function bqFetchBookingRows(bigquery) {
  await ensureBookingsTable(bigquery);
  const [rows] = await bigquery.query({
    query: `SELECT * FROM ${bookingsTableRef()} ORDER BY created_at ASC`,
  });
  return { data: { values: [BOOKING_ROW_SENTINEL_HEADER, ...rows.map(bookingRowArrayFromRecord)] } };
}

async function bqInsertBookingRow(bigquery, rowArray) {
  await ensureBookingsTable(bigquery);
  const params = bookingParamsFromRowArray(rowArray);
  const columnNames = BOOKING_TABLE_FIELDS.map(({ name }) => name);
  const placeholders = columnNames.map((name) => `@${name}`);
  await bigquery.query({
    query: `INSERT INTO ${bookingsTableRef()} (${columnNames.join(', ')}) VALUES (${placeholders.join(', ')})`,
    params,
  });
}

async function bqAppendBookingRows(bigquery, rowArrays) {
  for (const rowArray of rowArrays) {
    await bqInsertBookingRow(bigquery, rowArray);
  }
}

// fields uses the same camelCase property names as the row-array mapping
// (e.g. { paidAmount: 50 }, { status: 'Cancelled', statusNotes: '...' }).
async function bqUpdateBookingFields(bigquery, bookingId, fields, receiptSnapshot = null) {
  await ensureBookingsTable(bigquery);
  const entries = Object.entries(fields).map(([prop, value]) => {
    const field = BOOKING_TABLE_FIELDS.find((candidate) => candidate.prop === prop);
    if (!field) throw new Error(`Unknown booking field: ${prop}`);
    return { field, value };
  });
  if (!entries.length) return;
  const setClauses = entries.map(({ field }) => `${field.name} = @set_${field.name}`);
  const params = { where_booking_id: bookingId };
  entries.forEach(({ field, value }) => {
    if (field.type === 'FLOAT64') params[`set_${field.name}`] = value === '' || value === null || value === undefined ? 0 : Number(value) || 0;
    else if (field.type === 'INT64') params[`set_${field.name}`] = value === '' || value === null || value === undefined ? 0 : Math.trunc(Number(value) || 0);
    else params[`set_${field.name}`] = value === null || value === undefined ? '' : String(value);
  });
  if (receiptSnapshot) {
    Object.assign(params, {
      expected_notes: String(receiptSnapshot.notes || ''),
      expected_total: receiptSnapshot.total, expected_paid: receiptSnapshot.paid,
      expected_receipt: String(receiptSnapshot.receipt || ''),
    });
    await bigquery.query({
      query: `BEGIN TRANSACTION;
        ASSERT (SELECT COUNT(*) FROM ${bookingsTableRef()} WHERE booking_id = @where_booking_id AND COALESCE(intake_notes, '') = @expected_notes AND total = @expected_total AND paid_amount = @expected_paid AND COALESCE(receipt_number, '') = @expected_receipt) = 1 AS 'Booking changed during receipt issuance; refresh and retry';
        UPDATE ${bookingsTableRef()} SET ${setClauses.join(', ')} WHERE booking_id = @where_booking_id;
        COMMIT TRANSACTION;`,
      params,
    });
    return;
  }
  await bigquery.query({
    query: `UPDATE ${bookingsTableRef()} SET ${setClauses.join(', ')} WHERE booking_id = @where_booking_id`,
    params,
  });
}

async function bqDeleteBookingRow(bigquery, bookingId) {
  await ensureBookingsTable(bigquery);
  await bigquery.query({
    query: `DELETE FROM ${bookingsTableRef()} WHERE booking_id = @booking_id`,
    params: { booking_id: bookingId },
  });
}

const BIGQUERY_PATIENT_HISTORY_TABLE = process.env.BIGQUERY_PATIENT_HISTORY_TABLE || 'patient_history';
const BIGQUERY_PATIENT_HISTORY_MIGRATIONS_TABLE = `${BIGQUERY_PATIENT_HISTORY_TABLE}_migrations`;
const PATIENT_HISTORY_TABLE_FIELDS = [
  { name: 'booking_id', type: 'STRING' },
  { name: 'created_at', type: 'STRING' },
  { name: 'patient_name', type: 'STRING' },
  { name: 'date_of_birth', type: 'STRING' },
  { name: 'gender', type: 'STRING' },
  { name: 'phone', type: 'STRING' },
  { name: 'email', type: 'STRING' },
  { name: 'address', type: 'STRING' },
  { name: 'city', type: 'STRING' },
  { name: 'postal_code', type: 'STRING' },
  { name: 'heard_about', type: 'STRING' },
  { name: 'condition_heart', type: 'STRING' },
  { name: 'condition_blood_pressure', type: 'STRING' },
  { name: 'condition_diabetes', type: 'STRING' },
  { name: 'condition_cancer', type: 'STRING' },
  { name: 'condition_headaches', type: 'STRING' },
  { name: 'condition_bone_joint', type: 'STRING' },
  { name: 'condition_broken_bones', type: 'STRING' },
  { name: 'condition_osteoporosis', type: 'STRING' },
  { name: 'condition_allergies', type: 'STRING' },
  { name: 'condition_surgeries', type: 'STRING' },
  { name: 'condition_numbness', type: 'STRING' },
  { name: 'condition_skin_sensitivity', type: 'STRING' },
  { name: 'condition_pregnant', type: 'STRING' },
  { name: 'condition_medications', type: 'STRING' },
  { name: 'details', type: 'STRING' },
  { name: 'pain_areas', type: 'STRING' },
  { name: 'body_areas', type: 'STRING' },
  { name: 'pressure', type: 'STRING' },
  { name: 'consent', type: 'STRING' },
  { name: 'signature', type: 'STRING' },
  { name: 'signature_date', type: 'STRING' },
  { name: 'pre_collection_consent', type: 'STRING' },
  { name: 'consent_timestamp', type: 'STRING' },
];
const PATIENT_HISTORY_TABLE_COLUMNS = ['record_id', ...PATIENT_HISTORY_TABLE_FIELDS.map(({ name }) => name)];
const PATIENT_HISTORY_SHEET_HEADERS = [
  'Booking ID', 'Created At', 'Patient Name', 'Date of Birth', 'Gender', 'Phone', 'Email',
  'Address', 'City', 'Postal Code', 'How Heard About Us', 'Heart Condition', 'Blood Pressure',
  'Diabetes', 'Cancer', 'Headaches or Migraines', 'Bone or Joint Disorder',
  'Broken Bones or Implants', 'Osteoporosis or Arthritis', 'Allergies to Oil', 'Surgeries',
  'Numbness or Loss of Sensation', 'Skin Sensitivity or Easy Bruising',
  'Pregnant or Recently Gave Birth', 'Medications or Supplements', 'Additional Health Details',
  'Pain or Discomfort Areas', 'Body Areas', 'Preferred Pressure', 'Consent', 'Typed Signature',
  'Signature Date', 'Pre-collection Consent', 'Consent Timestamp',
];

function patientHistoryTableRef() {
  return `\`${BIGQUERY_PROJECT_ID}.${BIGQUERY_DATASET_ID}.${BIGQUERY_PATIENT_HISTORY_TABLE}\``;
}

let ensurePatientHistoryTablePromise = null;
async function ensurePatientHistoryTable(bigquery) {
  if (!ensurePatientHistoryTablePromise) {
    ensurePatientHistoryTablePromise = (async () => {
      const dataset = bigquery.dataset(BIGQUERY_DATASET_ID);
      const [datasetExists] = await dataset.exists();
      if (!datasetExists) {
        try {
          await bigquery.createDataset(BIGQUERY_DATASET_ID, { location: process.env.BIGQUERY_LOCATION || 'US' });
        } catch (error) {
          const [existsNow] = await dataset.exists();
          if (!existsNow) throw error;
        }
      }
      const table = dataset.table(BIGQUERY_PATIENT_HISTORY_TABLE);
      const [tableExists] = await table.exists();
      if (!tableExists) {
        const schema = [
          { name: 'record_id', type: 'STRING', mode: 'REQUIRED' },
          ...PATIENT_HISTORY_TABLE_FIELDS.map(({ name, type }) => ({ name, type, mode: 'NULLABLE' })),
        ];
        try {
          await dataset.createTable(BIGQUERY_PATIENT_HISTORY_TABLE, { schema });
        } catch (error) {
          const [existsNow] = await table.exists();
          if (!existsNow) throw error;
        }
      }
      const migrationsTable = dataset.table(BIGQUERY_PATIENT_HISTORY_MIGRATIONS_TABLE);
      const [migrationsTableExists] = await migrationsTable.exists();
      if (!migrationsTableExists) {
        try {
          await dataset.createTable(BIGQUERY_PATIENT_HISTORY_MIGRATIONS_TABLE, {
            schema: [
              { name: 'migration_id', type: 'STRING', mode: 'REQUIRED' },
              { name: 'completed_at', type: 'STRING', mode: 'REQUIRED' },
              { name: 'imported_rows', type: 'INT64', mode: 'REQUIRED' },
            ],
          });
        } catch (error) {
          const [existsNow] = await migrationsTable.exists();
          if (!existsNow) throw error;
        }
      }
    })().catch((error) => {
      ensurePatientHistoryTablePromise = null;
      throw error;
    });
  }
  return ensurePatientHistoryTablePromise;
}

function patientHistoryValuesFromSheetRow(row) {
  return PATIENT_HISTORY_TABLE_FIELDS.map((_, index) =>
    row[index] === null || row[index] === undefined ? '' : String(row[index]),
  );
}

function patientHistoryRecordId(row, suffix) {
  return `legacy:${String(row[0] || '')}:${String(row[1] || '')}:${suffix}`;
}

async function migratePatientHistorySpreadsheet(bigquery, sheets) {
  const [migrationRows] = await bigquery.query({
    query: `SELECT migration_id FROM \`${BIGQUERY_PROJECT_ID}.${BIGQUERY_DATASET_ID}.${BIGQUERY_PATIENT_HISTORY_MIGRATIONS_TABLE}\` WHERE migration_id = @migration_id LIMIT 1`,
    params: { migration_id: 'legacy_patient_history_spreadsheet_v1' },
  });
  if (migrationRows.length) return 0;
  let rows = [];
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
      range: 'PatientHistory!A:AH',
    });
    rows = result.data.values || [];
  } catch (error) {
    // A missing legacy tab means there is nothing to migrate.
    if (!/Unable to parse range/i.test(String(error?.message || ''))) throw error;
  }
  const dataRows = rows[0]?.[0] === 'Booking ID' ? rows.slice(1) : rows;
  const legacyRows = dataRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row[0])
    .map(({ row, index }) => ({
      record_id: patientHistoryRecordId(row, index),
      values: patientHistoryValuesFromSheetRow(row),
    }));
  const insertColumns = PATIENT_HISTORY_TABLE_COLUMNS.join(', ');
  const insertValues = PATIENT_HISTORY_TABLE_COLUMNS.map((column) => `source.${column}`).join(', ');
  for (let offset = 0; offset < legacyRows.length; offset += 100) {
    const batch = legacyRows.slice(offset, offset + 100);
    const params = {};
    const valuesSql = batch.map(({ record_id, values }, batchIndex) => {
      params[`record_id_${batchIndex}`] = record_id;
      PATIENT_HISTORY_TABLE_FIELDS.forEach(({ name }, fieldIndex) => {
        params[`${name}_${batchIndex}`] = values[fieldIndex];
      });
      return `SELECT @record_id_${batchIndex} AS record_id, ${PATIENT_HISTORY_TABLE_FIELDS.map(({ name }) => `@${name}_${batchIndex} AS ${name}`).join(', ')}`;
    }).join(', ');
    await bigquery.query({
      query: `MERGE ${patientHistoryTableRef()} AS target USING (${valuesSql}) AS source ON target.record_id = source.record_id WHEN NOT MATCHED THEN INSERT (${insertColumns}) VALUES (${insertValues})`,
      params,
    });
  }
  await bigquery.query({
    query: `MERGE \`${BIGQUERY_PROJECT_ID}.${BIGQUERY_DATASET_ID}.${BIGQUERY_PATIENT_HISTORY_MIGRATIONS_TABLE}\` AS target USING (SELECT @migration_id AS migration_id, @completed_at AS completed_at, @imported_rows AS imported_rows) AS source ON target.migration_id = source.migration_id WHEN NOT MATCHED THEN INSERT (migration_id, completed_at, imported_rows) VALUES (source.migration_id, source.completed_at, source.imported_rows)`,
    params: {
      migration_id: 'legacy_patient_history_spreadsheet_v1',
      completed_at: new Date().toISOString(),
      imported_rows: legacyRows.length,
    },
  });
  return legacyRows.length;
}

let patientHistoryMigrationPromise = null;
async function ensurePatientHistoryStorage(bigquery, sheets) {
  await ensurePatientHistoryTable(bigquery);
  if (!patientHistoryMigrationPromise) {
    patientHistoryMigrationPromise = migratePatientHistorySpreadsheet(bigquery, sheets)
      .catch((error) => {
        patientHistoryMigrationPromise = null;
        throw error;
      });
  }
  await patientHistoryMigrationPromise;
}

async function bqPatientHistoryValuesGet(bigquery, sheets) {
  await ensurePatientHistoryStorage(bigquery, sheets);
  const [records] = await bigquery.query({
    query: `SELECT ${PATIENT_HISTORY_TABLE_COLUMNS.join(', ')} FROM ${patientHistoryTableRef()} ORDER BY created_at ASC, record_id ASC`,
  });
  return {
    data: {
      values: [
        PATIENT_HISTORY_SHEET_HEADERS,
        ...records.map((record) => PATIENT_HISTORY_TABLE_FIELDS.map(({ name }) => record[name] ?? '')),
      ],
    },
  };
}

async function bqAppendPatientHistory(bigquery, sheets, values) {
  await ensurePatientHistoryStorage(bigquery, sheets);
  const params = { record_id: crypto.randomUUID() };
  PATIENT_HISTORY_TABLE_FIELDS.forEach(({ name }, index) => {
    params[name] = values[index] === null || values[index] === undefined ? '' : String(values[index]);
  });
  await bigquery.query({
    query: `INSERT INTO ${patientHistoryTableRef()} (${PATIENT_HISTORY_TABLE_COLUMNS.join(', ')}) VALUES (@record_id, ${PATIENT_HISTORY_TABLE_FIELDS.map(({ name }) => `@${name}`).join(', ')})`,
    params,
  });
}

async function bqDeletePatientHistory(bigquery, sheets, bookingId, createdAt) {
  await ensurePatientHistoryStorage(bigquery, sheets);
  const [records] = await bigquery.query({
    query: `SELECT record_id FROM ${patientHistoryTableRef()} WHERE booking_id = @booking_id AND (@created_at = '' OR created_at = @created_at) ORDER BY created_at ASC, record_id ASC`,
    params: { booking_id: bookingId, created_at: createdAt },
  });
  const recordIds = records.slice(0, 1).map((record) => record.record_id);
  if (!recordIds.length) return 0;
  await bigquery.query({
    query: `DELETE FROM ${patientHistoryTableRef()} WHERE record_id IN UNNEST(@record_ids)`,
    params: { record_ids: recordIds },
  });
  return recordIds.length;
}
// --- end BigQuery-backed booking records ----------------------------------

// --- BigQuery-backed Square payment records ---------------------------------
// Square payment link/checkout records (formerly the SquarePayments sheet tab)
// are stored in a typed BigQuery table since payment volume is expected to
// grow much larger than the booking table. Same design conventions as the
// bookings table above (query-based INSERT to avoid the streaming buffer,
// STRING-typed timestamps).
const BIGQUERY_SQUARE_PAYMENTS_TABLE = process.env.BIGQUERY_SQUARE_PAYMENTS_TABLE || 'square_payments';
const SQUARE_PAYMENT_TABLE_FIELDS = [
  { name: 'payment_link_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'order_id', type: 'STRING' },
  { name: 'booking_id', type: 'STRING' },
  { name: 'amount', type: 'FLOAT64' },
  { name: 'status', type: 'STRING' },
  { name: 'email', type: 'STRING' },
  { name: 'created_at', type: 'STRING' },
  { name: 'purpose', type: 'STRING' },
  { name: 'square_payment_id', type: 'STRING' },
];

function squarePaymentsTableRef() {
  return `\`${BIGQUERY_PROJECT_ID}.${BIGQUERY_DATASET_ID}.${BIGQUERY_SQUARE_PAYMENTS_TABLE}\``;
}

let ensureSquarePaymentsTablePromise = null;
async function ensureSquarePaymentsTable(bigquery) {
  if (!ensureSquarePaymentsTablePromise) {
    ensureSquarePaymentsTablePromise = (async () => {
      const dataset = bigquery.dataset(BIGQUERY_DATASET_ID);
      const [datasetExists] = await dataset.exists();
      if (!datasetExists) {
        try {
          await bigquery.createDataset(BIGQUERY_DATASET_ID, { location: process.env.BIGQUERY_LOCATION || 'US' });
        } catch (error) {
          const [existsNow] = await dataset.exists();
          if (!existsNow) throw error;
        }
      }
      const table = dataset.table(BIGQUERY_SQUARE_PAYMENTS_TABLE);
      const [tableExists] = await table.exists();
      if (!tableExists) {
        const schema = SQUARE_PAYMENT_TABLE_FIELDS.map(({ name, type, mode }) => ({ name, type, mode: mode || 'NULLABLE' }));
        try {
          await dataset.createTable(BIGQUERY_SQUARE_PAYMENTS_TABLE, { schema });
        } catch (error) {
          const [existsNow] = await table.exists();
          if (!existsNow) throw error;
        }
      }
    })().catch((error) => {
      ensureSquarePaymentsTablePromise = null;
      throw error;
    });
  }
  return ensureSquarePaymentsTablePromise;
}

function squarePaymentRecordFromRow(record) {
  return {
    paymentLinkId: record.payment_link_id || '',
    orderId: record.order_id || '',
    bookingId: record.booking_id || '',
    amount: Number(record.amount) || 0,
    status: record.status || '',
    email: record.email || '',
    createdAt: record.created_at || '',
    purpose: record.purpose || '',
    squarePaymentId: record.square_payment_id || '',
  };
}

async function bqInsertSquarePayment(bigquery, payment) {
  await ensureSquarePaymentsTable(bigquery);
  const params = {
    payment_link_id: payment.paymentLinkId || '',
    order_id: payment.orderId || '',
    booking_id: payment.bookingId || '',
    amount: Number(payment.amount) || 0,
    status: payment.status || '',
    email: payment.email || '',
    created_at: payment.createdAt || new Date().toISOString(),
    purpose: payment.purpose || '',
    square_payment_id: payment.squarePaymentId || '',
  };
  const columnNames = Object.keys(params);
  await bigquery.query({
    query: `INSERT INTO ${squarePaymentsTableRef()} (${columnNames.join(', ')}) VALUES (${columnNames.map((name) => `@${name}`).join(', ')})`,
    params,
  });
}

async function bqFindSquarePaymentByOrderId(bigquery, orderId) {
  await ensureSquarePaymentsTable(bigquery);
  const [rows] = await bigquery.query({
    query: `SELECT * FROM ${squarePaymentsTableRef()} WHERE order_id = @order_id ORDER BY created_at DESC LIMIT 1`,
    params: { order_id: orderId },
  });
  return rows[0] ? squarePaymentRecordFromRow(rows[0]) : null;
}

async function bqFindCompletedSquarePaymentsByBookingId(bigquery, bookingId) {
  await ensureSquarePaymentsTable(bigquery);
  const [rows] = await bigquery.query({
    query: `SELECT * FROM ${squarePaymentsTableRef()} WHERE booking_id = @booking_id AND status = 'COMPLETED' AND square_payment_id IS NOT NULL AND square_payment_id != ''`,
    params: { booking_id: bookingId },
  });
  return rows.map(squarePaymentRecordFromRow);
}

// fields uses the same camelCase keys as squarePaymentRecordFromRow.
async function bqUpdateSquarePaymentByOrderId(bigquery, orderId, fields) {
  await ensureSquarePaymentsTable(bigquery);
  const fieldNameMap = {
    status: 'status', email: 'email', createdAt: 'created_at', purpose: 'purpose', squarePaymentId: 'square_payment_id',
  };
  const entries = Object.entries(fields).map(([prop, value]) => {
    const column = fieldNameMap[prop];
    if (!column) throw new Error(`Unknown square payment field: ${prop}`);
    return { column, value };
  });
  if (!entries.length) return;
  const setClauses = entries.map(({ column }) => `${column} = @set_${column}`);
  const params = { where_order_id: orderId };
  entries.forEach(({ column, value }) => { params[`set_${column}`] = value === null || value === undefined ? '' : String(value); });
  await bigquery.query({
    query: `UPDATE ${squarePaymentsTableRef()} SET ${setClauses.join(', ')} WHERE order_id = @where_order_id`,
    params,
  });
}
// --- end BigQuery-backed Square payment records -----------------------------

// --- BigQuery-backed marketing campaign log ---------------------------------
// Every targeted email campaign send is logged here (one row per send) along
// with the individual recipients it reached, so campaigns can be audited or
// analyzed later even though the audience itself is resolved live from Sheets
// at send time. Same design conventions as the tables above.
const BIGQUERY_CAMPAIGN_LOG_TABLE = process.env.BIGQUERY_CAMPAIGN_LOG_TABLE || 'campaign_log';
const BIGQUERY_CAMPAIGN_RECIPIENTS_TABLE = process.env.BIGQUERY_CAMPAIGN_RECIPIENTS_TABLE || 'campaign_recipients';
const CAMPAIGN_LOG_TABLE_FIELDS = [
  { name: 'campaign_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'sent_at', type: 'STRING' },
  { name: 'sender_email', type: 'STRING' },
  { name: 'subject', type: 'STRING' },
  { name: 'preview', type: 'STRING' },
  { name: 'message', type: 'STRING' },
  { name: 'goal', type: 'STRING' },
  { name: 'audience_query', type: 'STRING' },
  { name: 'audience_description', type: 'STRING' },
  { name: 'recipient_count', type: 'INT64' },
  { name: 'sent_count', type: 'INT64' },
  { name: 'failed_count', type: 'INT64' },
  { name: 'status', type: 'STRING' },
];
const CAMPAIGN_RECIPIENTS_TABLE_FIELDS = [
  { name: 'campaign_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'email', type: 'STRING' },
  { name: 'name', type: 'STRING' },
  { name: 'delivery_status', type: 'STRING' },
  { name: 'sent_at', type: 'STRING' },
];

function campaignLogTableRef() {
  return `\`${BIGQUERY_PROJECT_ID}.${BIGQUERY_DATASET_ID}.${BIGQUERY_CAMPAIGN_LOG_TABLE}\``;
}
function campaignRecipientsTableRef() {
  return `\`${BIGQUERY_PROJECT_ID}.${BIGQUERY_DATASET_ID}.${BIGQUERY_CAMPAIGN_RECIPIENTS_TABLE}\``;
}

let ensureCampaignTablesPromise = null;
async function ensureCampaignTables(bigquery) {
  if (!ensureCampaignTablesPromise) {
    ensureCampaignTablesPromise = (async () => {
      const dataset = bigquery.dataset(BIGQUERY_DATASET_ID);
      const [datasetExists] = await dataset.exists();
      if (!datasetExists) {
        try {
          await bigquery.createDataset(BIGQUERY_DATASET_ID, { location: process.env.BIGQUERY_LOCATION || 'US' });
        } catch (error) {
          const [existsNow] = await dataset.exists();
          if (!existsNow) throw error;
        }
      }
      for (const [tableName, fields] of [
        [BIGQUERY_CAMPAIGN_LOG_TABLE, CAMPAIGN_LOG_TABLE_FIELDS],
        [BIGQUERY_CAMPAIGN_RECIPIENTS_TABLE, CAMPAIGN_RECIPIENTS_TABLE_FIELDS],
      ]) {
        const table = dataset.table(tableName);
        const [tableExists] = await table.exists();
        if (!tableExists) {
          const schema = fields.map(({ name, type, mode }) => ({ name, type, mode: mode || 'NULLABLE' }));
          try {
            await dataset.createTable(tableName, { schema });
          } catch (error) {
            const [existsNow] = await table.exists();
            if (!existsNow) throw error;
          }
        }
      }
    })().catch((error) => {
      ensureCampaignTablesPromise = null;
      throw error;
    });
  }
  return ensureCampaignTablesPromise;
}

async function bqLogCampaignSend(bigquery, campaignId, entry) {
  await ensureCampaignTables(bigquery);
  const params = {
    campaign_id: campaignId,
    sent_at: entry.sentAt || new Date().toISOString(),
    sender_email: entry.senderEmail || '',
    subject: entry.subject || '',
    preview: entry.preview || '',
    message: entry.message || '',
    goal: entry.goal || '',
    audience_query: entry.audienceQuery || '',
    audience_description: entry.audienceDescription || '',
    recipient_count: Math.trunc(Number(entry.recipientCount) || 0),
    sent_count: Math.trunc(Number(entry.sentCount) || 0),
    failed_count: Math.trunc(Number(entry.failedCount) || 0),
    status: entry.status || '',
  };
  const columnNames = Object.keys(params);
  await bigquery.query({
    query: `INSERT INTO ${campaignLogTableRef()} (${columnNames.join(', ')}) VALUES (${columnNames.map((name) => `@${name}`).join(', ')})`,
    params,
  });
}

async function bqLogCampaignRecipients(bigquery, campaignId, recipients) {
  if (!recipients.length) return;
  await ensureCampaignTables(bigquery);
  const rows = recipients.map((recipient) => ({
    campaign_id: campaignId,
    email: recipient.email || '',
    name: recipient.name || '',
    delivery_status: recipient.deliveryStatus || '',
    sent_at: recipient.sentAt || new Date().toISOString(),
  }));
  const valuesSql = rows.map((_, index) =>
    `(@campaign_id_${index}, @email_${index}, @name_${index}, @delivery_status_${index}, @sent_at_${index})`).join(', ');
  const params = {};
  rows.forEach((row, index) => {
    params[`campaign_id_${index}`] = row.campaign_id;
    params[`email_${index}`] = row.email;
    params[`name_${index}`] = row.name;
    params[`delivery_status_${index}`] = row.delivery_status;
    params[`sent_at_${index}`] = row.sent_at;
  });
  await bigquery.query({
    query: `INSERT INTO ${campaignRecipientsTableRef()} (campaign_id, email, name, delivery_status, sent_at) VALUES ${valuesSql}`,
    params,
  });
}

async function bqFetchRecentCampaigns(bigquery, limit) {
  await ensureCampaignTables(bigquery);
  const [rows] = await bigquery.query({
    query: `SELECT * FROM ${campaignLogTableRef()} ORDER BY sent_at DESC LIMIT @limit`,
    params: { limit: Math.trunc(Number(limit) || 25) },
  });
  return rows.map((record) => ({
    campaignId: record.campaign_id || '',
    sentAt: record.sent_at || '',
    senderEmail: record.sender_email || '',
    subject: record.subject || '',
    preview: record.preview || '',
    goal: record.goal || '',
    audienceQuery: record.audience_query || '',
    audienceDescription: record.audience_description || '',
    recipientCount: Number(record.recipient_count) || 0,
    sentCount: Number(record.sent_count) || 0,
    failedCount: Number(record.failed_count) || 0,
    status: record.status || '',
  }));
}
// --- end BigQuery-backed marketing campaign log -----------------------------

// --- BigQuery-backed loyalty program tables ---------------------------------
// The loyalty settings, member directory, points/hours ledger and company
// portal registry now live in BigQuery instead of the spreadsheet. The column
// layout mirrors the historical LOYALTY_SHEETS headers one-for-one (plus an
// internal row_index bookkeeping column) so every existing positional `row[N]`
// access keeps working unchanged.
//
// Values are stored as STRING for the same reason the bookings table does:
// the rest of this file already formats and parses these fields itself
// (ISO timestamps, `Number(row[4]) || 0`, "Y" flags, …).
//
// `row_index` keeps the spreadsheet row numbering contract alive: row 1 is the
// header and data rows are numbered from 2 upwards with no gaps, so callers
// that derive a row number as `arrayIndex + 1` / `arrayIndex + 2` still address
// the right record. Deletes renumber the survivors to preserve that invariant.
const LOYALTY_TABLE_NAMES = {
  LoyaltySettings: process.env.BIGQUERY_LOYALTY_SETTINGS_TABLE || 'loyalty_settings',
  LoyaltyMembers: process.env.BIGQUERY_LOYALTY_MEMBERS_TABLE || 'loyalty_members',
  LoyaltyLedger: process.env.BIGQUERY_LOYALTY_LEDGER_TABLE || 'loyalty_ledger',
  LoyaltyCompanies: process.env.BIGQUERY_LOYALTY_COMPANIES_TABLE || 'loyalty_companies',
};
// Typed verbatim by the owner before the whole ledger can be wiped.
const LOYALTY_LEDGER_RESET_PHRASE = 'CLEAR LEDGER';
const LOYALTY_TABLE_COLUMNS = {
  LoyaltySettings: ['settings_json', 'updated_at'],
  LoyaltyMembers: [
    'email', 'name', 'phone', 'enrolled_at', 'updated_at', 'membership_type',
    'organization', 'paid_through', 'company_id', 'company_contact_email', 'is_primary_contact',
  ],
  LoyaltyLedger: [
    'transaction_id', 'email', 'booking_id', 'type', 'points', 'reward_value',
    'description', 'created_at', 'hours', 'receipt_no',
  ],
  LoyaltyCompanies: ['organization', 'company_id', 'contact_email', 'access_token', 'created_at', 'updated_at', 'join_token'],
};
const LOYALTY_ROW_INDEX_COLUMN = 'row_index';
const LOYALTY_FIRST_DATA_ROW = 2;

function loyaltyTableRef(title) {
  const tableName = LOYALTY_TABLE_NAMES[title];
  if (!tableName) throw new Error(`Unknown loyalty table: ${title}`);
  return `\`${BIGQUERY_PROJECT_ID}.${BIGQUERY_DATASET_ID}.${tableName}\``;
}

// Translates an A1 range such as "LoyaltyMembers!A:J", "LoyaltySettings!A1:B2",
// "LoyaltyMembers!B7:J7" or "LoyaltyMembers!K4" into table/row/column bounds.
function parseLoyaltyRange(range) {
  const match = /^([A-Za-z]+)!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/.exec(String(range || '').trim());
  if (!match) throw new Error(`Unsupported loyalty range: ${range}`);
  const [, title, startColumnLetters, startRowText, endColumnLetters, endRowText] = match;
  if (!LOYALTY_TABLE_COLUMNS[title]) throw new Error(`Unknown loyalty table: ${title}`);
  const columnIndex = (letters) => letters.split('').reduce((total, letter) => total * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
  const startColumn = columnIndex(startColumnLetters);
  const endColumn = endColumnLetters ? columnIndex(endColumnLetters) : startColumn;
  return {
    title,
    startColumn,
    endColumn: Math.min(endColumn, LOYALTY_TABLE_COLUMNS[title].length - 1),
    startRow: startRowText ? Number(startRowText) : null,
    endRow: endRowText ? Number(endRowText) : (startRowText && !endColumnLetters ? Number(startRowText) : null),
  };
}

let ensureLoyaltyTablesPromise = null;
async function ensureLoyaltyTables(bigquery = getBigQueryClient()) {
  if (!ensureLoyaltyTablesPromise) {
    ensureLoyaltyTablesPromise = (async () => {
      const dataset = bigquery.dataset(BIGQUERY_DATASET_ID);
      const [datasetExists] = await dataset.exists();
      if (!datasetExists) {
        try {
          await bigquery.createDataset(BIGQUERY_DATASET_ID, { location: process.env.BIGQUERY_LOCATION || 'US' });
        } catch (error) {
          const [existsNow] = await dataset.exists();
          if (!existsNow) throw error;
        }
      }
      const createdTitles = [];
      for (const [title, columns] of Object.entries(LOYALTY_TABLE_COLUMNS)) {
        const tableName = LOYALTY_TABLE_NAMES[title];
        const table = dataset.table(tableName);
        const [tableExists] = await table.exists();
        if (tableExists) {
          // Tables created by an earlier release can be missing columns added since.
          // BigQuery only allows appending NULLABLE columns, which is all we ever do.
          const [metadata] = await table.getMetadata();
          const existing = new Set((metadata.schema?.fields || []).map((field) => field.name));
          const missing = columns.filter((name) => !existing.has(name));
          if (missing.length) {
            try {
              await table.setMetadata({
                schema: {
                  fields: [
                    ...(metadata.schema?.fields || []),
                    ...missing.map((name) => ({ name, type: 'STRING', mode: 'NULLABLE' })),
                  ],
                },
              });
            } catch (error) {
              console.error(`Loyalty table ${tableName} column migration failed:`, error.message || error);
            }
          }
          continue;
        }
        const schema = [
          { name: LOYALTY_ROW_INDEX_COLUMN, type: 'INT64', mode: 'REQUIRED' },
          ...columns.map((name) => ({ name, type: 'STRING', mode: 'NULLABLE' })),
        ];
        try {
          await dataset.createTable(tableName, { schema });
          createdTitles.push(title);
        } catch (error) {
          const [existsNow] = await table.exists();
          if (!existsNow) throw error;
        }
      }
      if (createdTitles.length) {
        // One-time migration: copy whatever the spreadsheet already holds into the
        // freshly created tables. Never fatal — a missing/empty spreadsheet simply
        // means the program starts out empty in BigQuery.
        try {
          await importLoyaltySheetData(bigquery, createdTitles);
        } catch (error) {
          console.error('Loyalty spreadsheet migration skipped:', error.message || error);
        }
      }
    })().catch((error) => {
      ensureLoyaltyTablesPromise = null;
      throw error;
    });
  }
  return ensureLoyaltyTablesPromise;
}

function createSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Reads the legacy Loyalty* spreadsheet tabs and copies their rows into the
// BigQuery tables. Only tables that are currently empty are filled, so running
// this twice never duplicates data.
async function importLoyaltySheetData(bigquery, titles = Object.keys(LOYALTY_TABLE_COLUMNS)) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) return {};
  const sheetsClient = createSheetsClient();
  const spreadsheet = await sheetsClient.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const existingTitles = new Set((spreadsheet.data.sheets || []).map((sheet) => sheet.properties?.title));
  const imported = {};
  for (const title of titles) {
    imported[title] = 0;
    if (!existingTitles.has(title)) continue;
    const columns = LOYALTY_TABLE_COLUMNS[title];
    const [alreadyStored] = await bigquery.query({
      query: `SELECT COUNT(*) AS total FROM ${loyaltyTableRef(title)}`,
    });
    if (Number(alreadyStored[0]?.total || 0) > 0) continue;
    const endColumn = String.fromCharCode(64 + columns.length);
    const result = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `${title}!A:${endColumn}`,
    });
    const dataRows = (result.data.values || []).slice(1)
      .map((row) => columns.map((_, index) => (row[index] === null || row[index] === undefined ? '' : String(row[index]))))
      .filter((row) => row.some((cell) => cell !== ''));
    if (!dataRows.length) continue;
    await bqLoyaltyInsertRows(bigquery, title, dataRows.map((row, index) => ({ rowNumber: LOYALTY_FIRST_DATA_ROW + index, values: row })));
    imported[title] = dataRows.length;
  }
  return imported;
}

async function bqLoyaltyInsertRows(bigquery, title, entries) {
  if (!entries.length) return;
  const columns = LOYALTY_TABLE_COLUMNS[title];
  const params = {};
  const valuesSql = entries.map(({ rowNumber, values }, index) => {
    params[`row_index_${index}`] = rowNumber;
    columns.forEach((column, columnIndex) => {
      const cell = values[columnIndex];
      params[`${column}_${index}`] = cell === null || cell === undefined ? '' : String(cell);
    });
    return `(@row_index_${index}, ${columns.map((column) => `@${column}_${index}`).join(', ')})`;
  }).join(', ');
  await bigquery.query({
    query: `INSERT INTO ${loyaltyTableRef(title)} (${LOYALTY_ROW_INDEX_COLUMN}, ${columns.join(', ')}) VALUES ${valuesSql}`,
    params,
  });
}

// Returns every stored data row as a full-width positional array, ordered by
// the spreadsheet row number it occupies.
async function bqLoyaltyFetchRows(bigquery, title) {
  await ensureLoyaltyTables(bigquery);
  const columns = LOYALTY_TABLE_COLUMNS[title];
  const [records] = await bigquery.query({
    query: `SELECT ${LOYALTY_ROW_INDEX_COLUMN}, ${columns.join(', ')} FROM ${loyaltyTableRef(title)} ORDER BY ${LOYALTY_ROW_INDEX_COLUMN} ASC`,
  });
  return records.map((record) => ({
    rowNumber: Number(record[LOYALTY_ROW_INDEX_COLUMN]),
    values: columns.map((column) => (record[column] === null || record[column] === undefined ? '' : String(record[column]))),
  }));
}

// Drop-in replacement for `sheets.spreadsheets.values.get({ range })` on the
// loyalty tabs: returns `{ data: { values } }` with the header row first, just
// like the Sheets API did.
async function bqLoyaltyValuesGet(range) {
  const bigquery = getBigQueryClient();
  const { title, startColumn, endColumn, startRow, endRow } = parseLoyaltyRange(range);
  const stored = await bqLoyaltyFetchRows(bigquery, title);
  const width = LOYALTY_TABLE_COLUMNS[title].length;
  const lastRow = stored.length ? stored[stored.length - 1].rowNumber : 1;
  const grid = [LOYALTY_SHEETS[title].slice()];
  for (let rowNumber = LOYALTY_FIRST_DATA_ROW; rowNumber <= lastRow; rowNumber += 1) {
    grid[rowNumber - 1] = stored.find((entry) => entry.rowNumber === rowNumber)?.values || new Array(width).fill('');
  }
  const firstRow = startRow || 1;
  const lastRequestedRow = endRow || grid.length;
  const values = grid.slice(firstRow - 1, lastRequestedRow)
    .map((row) => (row || []).slice(startColumn, endColumn + 1));
  // Sheets omits trailing empty rows; mirror that so existing emptiness checks behave.
  while (values.length && values[values.length - 1].every((cell) => cell === '')) values.pop();
  return { data: { values } };
}

// Drop-in replacement for `sheets.spreadsheets.values.update({ range, values })`.
// Writes are addressed by spreadsheet row number and only touch the columns the
// range covers; rows that do not exist yet are created (as Sheets would).
async function bqLoyaltyValuesUpdate(range, values) {
  const bigquery = getBigQueryClient();
  const { title, startColumn, endColumn, startRow } = parseLoyaltyRange(range);
  const columns = LOYALTY_TABLE_COLUMNS[title];
  const stored = await bqLoyaltyFetchRows(bigquery, title);
  const storedByRow = new Map(stored.map((entry) => [entry.rowNumber, entry.values]));
  const inserts = [];
  for (const [offset, rowValues] of (values || []).entries()) {
    const rowNumber = (startRow || 1) + offset;
    if (rowNumber < LOYALTY_FIRST_DATA_ROW) continue;
    const current = storedByRow.get(rowNumber) || new Array(columns.length).fill('');
    const next = current.slice();
    for (let column = startColumn; column <= endColumn; column += 1) {
      const cell = rowValues?.[column - startColumn];
      next[column] = cell === null || cell === undefined ? '' : String(cell);
    }
    if (storedByRow.has(rowNumber)) {
      const params = { where_row_index: rowNumber };
      columns.forEach((column, index) => { params[`set_${column}`] = next[index]; });
      await bigquery.query({
        query: `UPDATE ${loyaltyTableRef(title)} SET ${columns.map((column) => `${column} = @set_${column}`).join(', ')} WHERE ${LOYALTY_ROW_INDEX_COLUMN} = @where_row_index`,
        params,
      });
    } else {
      inserts.push({ rowNumber, values: next });
    }
  }
  if (inserts.length) await bqLoyaltyInsertRows(bigquery, title, inserts);
}

// Drop-in replacement for `sheets.spreadsheets.values.append({ range, values })`.
async function bqLoyaltyValuesAppend(range, values) {
  const bigquery = getBigQueryClient();
  const { title, startColumn, endColumn } = parseLoyaltyRange(range);
  const columns = LOYALTY_TABLE_COLUMNS[title];
  const stored = await bqLoyaltyFetchRows(bigquery, title);
  let nextRowNumber = stored.length
    ? stored[stored.length - 1].rowNumber + 1
    : LOYALTY_FIRST_DATA_ROW;
  const entries = (values || []).map((rowValues) => {
    const next = new Array(columns.length).fill('');
    for (let column = startColumn; column <= endColumn; column += 1) {
      const cell = rowValues?.[column - startColumn];
      next[column] = cell === null || cell === undefined ? '' : String(cell);
    }
    return { rowNumber: nextRowNumber++, values: next };
  });
  await bqLoyaltyInsertRows(bigquery, title, entries);
}

// Removes rows by spreadsheet row number and closes the resulting gaps so the
// "array position + 1 === row number" contract holds for later reads.
async function bqLoyaltyDeleteRows(title, rowNumbers) {
  const unique = [...new Set((rowNumbers || []).map((rowNumber) => Number(rowNumber)))]
    .filter((rowNumber) => Number.isFinite(rowNumber) && rowNumber >= LOYALTY_FIRST_DATA_ROW);
  if (!unique.length) return;
  const bigquery = getBigQueryClient();
  await ensureLoyaltyTables(bigquery);
  await bigquery.query({
    query: `DELETE FROM ${loyaltyTableRef(title)} WHERE ${LOYALTY_ROW_INDEX_COLUMN} IN UNNEST(@row_indexes)`,
    params: { row_indexes: unique },
  });
  const stored = await bqLoyaltyFetchRows(bigquery, title);
  const renumbered = stored
    .map((entry, index) => ({ entry, nextRowNumber: LOYALTY_FIRST_DATA_ROW + index }))
    .filter(({ entry, nextRowNumber }) => entry.rowNumber !== nextRowNumber);
  for (const { entry, nextRowNumber } of renumbered) {
    await bigquery.query({
      query: `UPDATE ${loyaltyTableRef(title)} SET ${LOYALTY_ROW_INDEX_COLUMN} = @next WHERE ${LOYALTY_ROW_INDEX_COLUMN} = @current`,
      params: { next: nextRowNumber, current: entry.rowNumber },
    });
  }
}
// --- end BigQuery-backed loyalty program tables -----------------------------

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

// Reused by find-booking/cancel-booking to decide whether a cancellation
// still qualifies for a refund under the 24-hour cancellation policy.
const BOOKING_CANCELLATION_WINDOW_HOURS = 24;
function computeBookingRefundEligibility(date, time) {
  try {
    const startDateTime = parseBookingDateTime(date, time);
    const startInstant = new Date(`${startDateTime}-04:00`).getTime();
    if (Number.isNaN(startInstant)) return { hoursUntil: null, eligible: false };
    const hoursUntil = (startInstant - Date.now()) / (1000 * 60 * 60);
    return { hoursUntil, eligible: hoursUntil >= BOOKING_CANCELLATION_WINDOW_HOURS };
  } catch {
    return { hoursUntil: null, eligible: false };
  }
}


function getTherapistFromDescription(description = '') {
  return description.match(/^Therapist:\s*(.+)$/m)?.[1]?.trim() || '';
}

function parseBookingFieldsFromDescription(description = '') {
  const field = (label) => description.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'))?.[1]?.trim() || '';
  const paid = field('Paid').replace(/^\$/, '');
  const total = field('Total').replace(/^\$/, '');
  return {
    bookingId: field('Booking'),
    customerName: field('Customer'),
    phone: field('Phone'),
    email: field('Email'),
    serviceName: field('Service'),
    therapistName: field('Therapist'),
    paymentOption: field('Payment'),
    paidAmount: Number(paid) || 0,
    total: Number(total) || 0,
  };
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

async function findExistingPatientHistory(bigquery, sheets, payload) {
  const result = await bqPatientHistoryValuesGet(bigquery, sheets);
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

async function ensureTherapistProfilesSheet(sheets) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const exists = (spreadsheet.data.sheets || [])
    .some((sheet) => sheet.properties?.title === 'TherapistProfiles');
  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: 'TherapistProfiles' } } }] },
      });
    } catch (error) {
      const refreshed = await sheets.spreadsheets.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        fields: 'sheets.properties',
      });
      const createdByConcurrentRequest = (refreshed.data.sheets || [])
        .some((sheet) => sheet.properties?.title === 'TherapistProfiles');
      if (!createdByConcurrentRequest) throw error;
    }
  }

  const headers = ['Therapist ID', 'Email', 'Phone', 'Specialties', 'Certifications', 'Bio', 'Updated At'];
  const headerResult = await sheets.spreadsheets.values.get({
    spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
    range: 'TherapistProfiles!A1:G1',
  });
  if (!headerResult.data.values?.[0]?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
      range: 'TherapistProfiles!A1:G1',
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  } else if (headers.some((header, index) => headerResult.data.values[0][index] !== header)) {
    throw new Error('TherapistProfiles sheet has an unexpected header format');
  }
}

async function ensureTherapistNotesSheet(sheets) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const exists = (spreadsheet.data.sheets || [])
    .some((sheet) => sheet.properties?.title === 'TherapistNotes');
  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: 'TherapistNotes' } } }] },
      });
    } catch (error) {
      const refreshed = await sheets.spreadsheets.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        fields: 'sheets.properties',
      });
      const createdByConcurrentRequest = (refreshed.data.sheets || [])
        .some((sheet) => sheet.properties?.title === 'TherapistNotes');
      if (!createdByConcurrentRequest) throw error;
    }
  }

  const headers = ['Note ID', 'Therapist ID', 'Booking ID', 'Patient Name', 'Category', 'Note', 'Created At'];
  const headerResult = await sheets.spreadsheets.values.get({
    spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
    range: 'TherapistNotes!A1:G1',
  });
  if (!headerResult.data.values?.[0]?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
      range: 'TherapistNotes!A1:G1',
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  } else if (headers.some((header, index) => headerResult.data.values[0][index] !== header)) {
    throw new Error('TherapistNotes sheet has an unexpected header format');
  }
}

async function ensureAppointmentNotesSheet(sheets) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const exists = (spreadsheet.data.sheets || [])
    .some((sheet) => sheet.properties?.title === 'AppointmentNotes');
  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: 'AppointmentNotes' } } }] },
      });
    } catch (error) {
      const refreshed = await sheets.spreadsheets.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        fields: 'sheets.properties',
      });
      const createdByConcurrentRequest = (refreshed.data.sheets || [])
        .some((sheet) => sheet.properties?.title === 'AppointmentNotes');
      if (!createdByConcurrentRequest) throw error;
    }
  }

  const headers = ['Note ID', 'Booking ID', 'Note', 'Created By', 'Created At'];
  const headerResult = await sheets.spreadsheets.values.get({
    spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
    range: 'AppointmentNotes!A1:E1',
  });
  if (!headerResult.data.values?.[0]?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
      range: 'AppointmentNotes!A1:E1',
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  } else if (headers.some((header, index) => headerResult.data.values[0][index] !== header)) {
    throw new Error('AppointmentNotes sheet has an unexpected header format');
  }
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
    range: 'BusinessProfile!A1:I1',
  });
  const headerRow = header.data.values?.[0] || [];
  if (BUSINESS_PROFILE_FIELDS.some((field, index) => headerRow[index] !== field)) {
    const isPreviousProfile = BUSINESS_PROFILE_FIELDS.slice(0, -1)
      .every((field, index) => headerRow[index] === field);
    const isLegacyProfile = LEGACY_BUSINESS_PROFILE_FIELDS.every(
      (field, index) => headerRow[index] === field,
    );
    let migratedProfile;
    if (isPreviousProfile) {
      const previousValues = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'BusinessProfile!A2:H2',
      });
      const previousRow = previousValues.data.values?.[0] || [];
      migratedProfile = BUSINESS_PROFILE_FIELDS.map((field, index) => (
        index < BUSINESS_PROFILE_FIELDS.length - 1
          ? previousRow[index] ?? DEFAULT_BUSINESS_PROFILE[field] ?? ''
          : DEFAULT_BUSINESS_PROFILE[field]
      ));
    } else if (isLegacyProfile) {
      const legacyValues = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'BusinessProfile!A2:F2',
      });
      const legacyRow = legacyValues.data.values?.[0] || [];
      const legacyProfile = Object.fromEntries(LEGACY_BUSINESS_PROFILE_FIELDS.map((field, index) => [field, legacyRow[index] || '']));
      migratedProfile = BUSINESS_PROFILE_FIELDS.map((field) => legacyProfile[field] || DEFAULT_BUSINESS_PROFILE[field] || '');
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'BusinessProfile!A1:I1',
      valueInputOption: 'RAW',
      requestBody: { values: [BUSINESS_PROFILE_FIELDS] },
    });
    if (migratedProfile) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'BusinessProfile!A2:I2',
        valueInputOption: 'RAW',
        requestBody: { values: [migratedProfile] },
      });
    }
  }
}

async function getBusinessProfile(sheets) {
  await ensureBusinessProfileSheet(sheets);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'BusinessProfile!A1:I2',
  });
  const row = result.data.values?.[1] || [];
  return Object.fromEntries(BUSINESS_PROFILE_FIELDS.map((field, index) => [
    field,
    row[index] === undefined ? DEFAULT_BUSINESS_PROFILE[field] : row[index],
  ]));
}

// --- Therapist / business unavailability blocks ----------------------------
// Owner-configurable "Availability" tab (business-wide closures/holidays) and
// therapist self-service breaks/day-off blocks, stored in an Unavailability
// sheet alongside Branches/Services/Therapists. These are checked against
// new bookings (server-side) and surfaced in the owner Booking Calendar.
const UNAVAILABILITY_HEADERS = ['Block ID', 'Scope', 'Branch', 'Therapist', 'Date', 'Start Time', 'End Time', 'Reason', 'Created By', 'Created At'];
async function ensureUnavailabilitySheet(sheets) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not configured');
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const exists = (spreadsheet.data.sheets || [])
    .some((sheet) => sheet.properties?.title === 'Unavailability');
  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: 'Unavailability' } } }] },
      });
    } catch (error) {
      const refreshed = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties',
      });
      const createdByConcurrentRequest = (refreshed.data.sheets || [])
        .some((sheet) => sheet.properties?.title === 'Unavailability');
      if (!createdByConcurrentRequest) throw error;
    }
  }
  const header = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Unavailability!A1:J1',
  });
  if (!header.data.values?.[0]?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Unavailability!A1:J1',
      valueInputOption: 'RAW',
      requestBody: { values: [UNAVAILABILITY_HEADERS] },
    });
  }
}

async function getUnavailabilityBlocks(sheets) {
  await ensureUnavailabilitySheet(sheets);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'Unavailability!A:J',
  });
  const rows = result.data.values || [];
  const startIndex = rows[0]?.[0] === 'Block ID' ? 1 : 0;
  return rows.slice(startIndex).filter((row) => row[0]).map((row) => ({
    id: row[0] || '',
    scope: row[1] || 'business',
    branchName: row[2] || '',
    therapistName: row[3] || '',
    date: row[4] || '',
    startTime: row[5] || '',
    endTime: row[6] || '',
    reason: row[7] || '',
    createdBy: row[8] || '',
    createdAt: row[9] || '',
  }));
}

// True when a block's [date startTime, date endTime) window overlaps the
// given ISO-with-offset instant window (matching hasTimeOverlap's format).
function blockOverlapsWindow(block, date, startInstant, endInstant) {
  if (block.date !== date) return false;
  if (!/^\d{2}:\d{2}$/.test(block.startTime) || !/^\d{2}:\d{2}$/.test(block.endTime)) return false;
  const blockStart = `${block.date}T${block.startTime}:00-04:00`;
  const blockEnd = `${block.date}T${block.endTime}:00-04:00`;
  return hasTimeOverlap(startInstant, endInstant, blockStart, blockEnd);
}

async function ensureBranchesSheet(sheets) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not configured');
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const exists = (spreadsheet.data.sheets || [])
    .some((sheet) => sheet.properties?.title === 'Branches');
  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: 'Branches' } } }] },
      });
    } catch (error) {
      const refreshed = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties',
      });
      const createdByConcurrentRequest = (refreshed.data.sheets || [])
        .some((sheet) => sheet.properties?.title === 'Branches');
      if (!createdByConcurrentRequest) throw error;
    }
    const seedRows = DEFAULT_BRANCHES.map((branch) => [
      branch.id, branch.name, branch.address, branch.city, branch.phone, branch.active ? 'TRUE' : 'FALSE', new Date().toISOString(), branch.collectsDeposit === false ? 'FALSE' : 'TRUE',
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Branches!A1:H1',
      valueInputOption: 'RAW',
      requestBody: { values: [BRANCH_FIELDS] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Branches!A2:H${seedRows.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: seedRows },
    });
  }
}

function validateBranches(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('At least one branch is required');
  }
  const seenIds = new Set();
  return input.map((branch) => {
    const name = String(branch?.name || '').trim();
    if (!name) throw new Error('Every branch requires a name');
    let id = Number(branch?.id);
    if (!Number.isFinite(id) || id <= 0) id = Date.now() + Math.floor(Math.random() * 1000);
    if (seenIds.has(id)) id = Date.now() + Math.floor(Math.random() * 1000) + seenIds.size;
    seenIds.add(id);
    return {
      id,
      name,
      address: String(branch?.address || '').trim(),
      city: String(branch?.city || '').trim(),
      phone: String(branch?.phone || '').trim(),
      active: branch?.active !== false,
      // Branches collect a deposit unless explicitly opted out, so existing
      // branches keep their current behaviour.
      collectsDeposit: branch?.collectsDeposit !== false,
    };
  });
}

async function getBranches(sheets) {
  await ensureBranchesSheet(sheets);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'Branches!A2:H',
  });
  const rows = result.data.values || [];
  if (rows.length === 0) return DEFAULT_BRANCHES;
  return rows
    .filter((row) => row[0] !== undefined && row[0] !== '')
    .map((row) => ({
      id: Number(row[0]) || row[0],
      name: row[1] || '',
      address: row[2] || '',
      city: row[3] || '',
      phone: row[4] || '',
      active: String(row[5] || 'TRUE').toUpperCase() !== 'FALSE',
      collectsDeposit: String(row[7] ?? 'TRUE').toUpperCase() !== 'FALSE',
    }));
}

async function saveBranches(sheets, branches) {
  const validated = validateBranches(branches);
  await ensureBranchesSheet(sheets);
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const rows = validated.map((branch) => [
    branch.id, branch.name, branch.address, branch.city, branch.phone, branch.active ? 'TRUE' : 'FALSE', new Date().toISOString(), branch.collectsDeposit === false ? 'FALSE' : 'TRUE',
  ]);
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'Branches!A2:H',
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Branches!A2:H${rows.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
  return validated;
}

async function ensureServicesSheet(sheets) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not configured');
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const exists = (spreadsheet.data.sheets || [])
    .some((sheet) => sheet.properties?.title === 'Services');
  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: 'Services' } } }] },
      });
    } catch (error) {
      const refreshed = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties',
      });
      const createdByConcurrentRequest = (refreshed.data.sheets || [])
        .some((sheet) => sheet.properties?.title === 'Services');
      if (!createdByConcurrentRequest) throw error;
    }
    const seedRows = DEFAULT_SERVICES.map((service) => [
      service.id, service.name, service.category, service.duration, service.price, service.deposit,
      service.isRmt ? 'TRUE' : 'FALSE', service.taxRate, service.description, service.active ? 'TRUE' : 'FALSE', new Date().toISOString(),
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Services!A1:K1',
      valueInputOption: 'RAW',
      requestBody: { values: [SERVICE_FIELDS] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Services!A2:K${seedRows.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: seedRows },
    });
  }
}

function validateServices(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('At least one service is required');
  }
  const seenIds = new Set();
  return input.map((service) => {
    const name = String(service?.name || '').trim();
    if (!name) throw new Error('Every service requires a name');
    const price = Number(service?.price);
    if (!Number.isFinite(price) || price < 0) throw new Error(`Service "${name}" requires a valid price`);
    const duration = Number(service?.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Service "${name}" requires a valid duration in minutes`);
    const deposit = Number(service?.deposit);
    const taxRate = Number(service?.taxRate);
    let id = Number(service?.id);
    if (!Number.isFinite(id) || id <= 0) id = Date.now() + Math.floor(Math.random() * 1000);
    if (seenIds.has(id)) id = Date.now() + Math.floor(Math.random() * 1000) + seenIds.size;
    seenIds.add(id);
    return {
      id,
      name,
      category: String(service?.category || '').trim() || 'Uncategorized',
      duration,
      price,
      deposit: Number.isFinite(deposit) && deposit >= 0 ? deposit : 0,
      isRmt: service?.isRmt === true,
      taxRate: Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= 1 ? taxRate : 0.13,
      description: String(service?.description || '').trim(),
      active: service?.active !== false,
    };
  });
}

async function getServices(sheets) {
  await ensureServicesSheet(sheets);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'Services!A2:K',
  });
  const rows = result.data.values || [];
  if (rows.length === 0) return DEFAULT_SERVICES;
  return rows
    .filter((row) => row[0] !== undefined && row[0] !== '')
    .map((row) => ({
      id: Number(row[0]) || row[0],
      name: row[1] || '',
      category: row[2] || '',
      duration: Number(row[3]) || 0,
      price: Number(row[4]) || 0,
      deposit: Number(row[5]) || 0,
      isRmt: String(row[6] || 'FALSE').toUpperCase() === 'TRUE',
      taxRate: Number(row[7]) || 0,
      description: row[8] || '',
      active: String(row[9] || 'TRUE').toUpperCase() !== 'FALSE',
    }));
}

async function saveServices(sheets, services) {
  const validated = validateServices(services);
  await ensureServicesSheet(sheets);
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const rows = validated.map((service) => [
    service.id, service.name, service.category, service.duration, service.price, service.deposit,
    service.isRmt ? 'TRUE' : 'FALSE', service.taxRate, service.description, service.active ? 'TRUE' : 'FALSE', new Date().toISOString(),
  ]);
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'Services!A2:K',
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Services!A2:K${rows.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
  return validated;
}

async function ensureTherapistsSheet(sheets) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not configured');
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const exists = (spreadsheet.data.sheets || [])
    .some((sheet) => sheet.properties?.title === 'Therapists');
  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: 'Therapists' } } }] },
      });
    } catch (error) {
      const refreshed = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties',
      });
      const createdByConcurrentRequest = (refreshed.data.sheets || [])
        .some((sheet) => sheet.properties?.title === 'Therapists');
      if (!createdByConcurrentRequest) throw error;
    }
    const seedRows = DEFAULT_THERAPISTS.map((therapist) => [
      therapist.id, therapist.name, therapist.bio, therapist.rating,
      therapist.thaiCertified ? 'TRUE' : 'FALSE', therapist.rmtCertified ? 'TRUE' : 'FALSE',
      (therapist.branches || []).join(','), JSON.stringify(therapist.schedule || {}),
      therapist.active ? 'TRUE' : 'FALSE', new Date().toISOString(),
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Therapists!A1:J1',
      valueInputOption: 'RAW',
      requestBody: { values: [THERAPIST_FIELDS] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Therapists!A2:J${seedRows.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: seedRows },
    });
  }
}

function validateTherapists(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('At least one therapist is required');
  }
  const seenIds = new Set();
  return input.map((therapist) => {
    const name = String(therapist?.name || '').trim();
    if (!name) throw new Error('Every therapist requires a name');
    let id = Number(therapist?.id);
    if (!Number.isFinite(id) || id <= 0) id = Date.now() + Math.floor(Math.random() * 1000);
    if (seenIds.has(id)) id = Date.now() + Math.floor(Math.random() * 1000) + seenIds.size;
    seenIds.add(id);
    let rating = Number(therapist?.rating);
    if (!Number.isFinite(rating)) rating = 4.8;
    rating = Math.min(5, Math.max(1, rating));
    const branches = Array.isArray(therapist?.branches)
      ? therapist.branches.map(Number).filter((value) => Number.isFinite(value) && value > 0)
      : [];
    const schedule = {};
    WEEKDAY_KEYS.forEach((key) => {
      const value = therapist?.schedule?.[key];
      const branchId = Number(value);
      schedule[key] = Number.isFinite(branchId) && branchId > 0 ? branchId : null;
    });
    return {
      id,
      name,
      bio: String(therapist?.bio || '').trim(),
      rating,
      thaiCertified: therapist?.thaiCertified === true,
      rmtCertified: therapist?.rmtCertified === true,
      branches,
      schedule,
      active: therapist?.active !== false,
    };
  });
}

async function getTherapists(sheets) {
  await ensureTherapistsSheet(sheets);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'Therapists!A2:J',
  });
  const rows = result.data.values || [];
  if (rows.length === 0) return DEFAULT_THERAPISTS;
  return rows
    .filter((row) => row[0] !== undefined && row[0] !== '')
    .map((row) => {
      let schedule = {};
      try { schedule = JSON.parse(row[7] || '{}') || {}; } catch { schedule = {}; }
      return {
        id: Number(row[0]) || row[0],
        name: row[1] || '',
        bio: row[2] || '',
        rating: Number(row[3]) || 4.8,
        thaiCertified: String(row[4] || 'FALSE').toUpperCase() === 'TRUE',
        rmtCertified: String(row[5] || 'FALSE').toUpperCase() === 'TRUE',
        branches: String(row[6] || '').split(',').map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0),
        schedule,
        active: String(row[8] || 'TRUE').toUpperCase() !== 'FALSE',
      };
    });
}

async function saveTherapists(sheets, therapists) {
  const validated = validateTherapists(therapists);
  await ensureTherapistsSheet(sheets);
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const rows = validated.map((therapist) => [
    therapist.id, therapist.name, therapist.bio, therapist.rating,
    therapist.thaiCertified ? 'TRUE' : 'FALSE', therapist.rmtCertified ? 'TRUE' : 'FALSE',
    therapist.branches.join(','), JSON.stringify(therapist.schedule || {}),
    therapist.active ? 'TRUE' : 'FALSE', new Date().toISOString(),
  ]);
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'Therapists!A2:J',
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Therapists!A2:J${rows.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
  return validated;
}

async function deleteSheetRows(sheets, title, rowNumbers, spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID) {
  if (!rowNumbers.length) return;
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const sheetId = (spreadsheet.data.sheets || [])
    .find((sheet) => sheet.properties?.title === title)?.properties?.sheetId;
  if (sheetId === undefined) throw new Error(`Sheet "${title}" was not found`);
  // Delete from the bottom up so earlier row indexes stay valid as rows are removed.
  const requests = [...new Set(rowNumbers)]
    .sort((a, b) => b - a)
    .map((rowNumber) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rowNumber - 1,
          endIndex: rowNumber,
        },
      },
    }));
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

function normalizeOrganizationKey(organization) {
  return String(organization || '').trim().toLowerCase();
}

async function getCompanyPortalRows(sheets) {
  const result = await bqLoyaltyValuesGet('LoyaltyCompanies!A:G');
  return result.data.values || [];
}

// Finds (or creates) the magic-link access token a Platinum company's primary contact
// uses to reach the self-service company portal. Idempotent: calling this again for the
// same organization keeps the existing token and simply refreshes the company ID/contact
// email on file if either changed.
async function ensureCompanyPortalAccess(sheets, organization, companyId, contactEmail) {
  const orgKey = normalizeOrganizationKey(organization);
  if (!orgKey) throw new Error('A company name is required to set up the company portal.');
  await ensureLoyaltyTables();
  const rows = await getCompanyPortalRows(sheets);
  const rowIndex = rows.findIndex((row, index) => index > 0 && normalizeOrganizationKey(row[0]) === orgKey);
  const now = new Date().toISOString();
  if (rowIndex >= 1) {
    const row = rows[rowIndex];
    const existingCompanyId = String(row[1] || '');
    const existingContactEmail = normalizeLoyaltyEmail(row[2]);
    const nextCompanyId = companyId || existingCompanyId;
    const nextContactEmail = contactEmail || existingContactEmail;
    // Companies enrolled before employee self-signup existed have no join token yet.
    const joinToken = row[6] || crypto.randomBytes(24).toString('hex');
    if (nextCompanyId !== existingCompanyId || nextContactEmail !== existingContactEmail || joinToken !== row[6]) {
      await bqLoyaltyValuesUpdate(`LoyaltyCompanies!B${rowIndex + 1}:G${rowIndex + 1}`, [[nextCompanyId, nextContactEmail, row[3] || '', row[4] || now, now, joinToken]]);
    }
    return { token: row[3] || '', joinToken, isNew: false, contactEmail: nextContactEmail };
  }
  const token = crypto.randomBytes(24).toString('hex');
  const joinToken = crypto.randomBytes(24).toString('hex');
  await bqLoyaltyValuesAppend('LoyaltyCompanies!A:G', [[organization.trim(), companyId || '', contactEmail || '', token, now, now, joinToken]]);
  return { token, joinToken, isNew: true, contactEmail: contactEmail || '' };
}

// Ensures at most one primary owner/contact per company: clears the "Is Primary Contact"
// flag on every other Platinum row in the same organization when promoting `keepEmail`.
// `memberRows` must be header-stripped data rows (e.g. `rows.slice(1)`); sheet row numbers
// are derived as `index + 2` (row 1 is the header, data starts at row 2).
async function demoteOtherPrimaryContacts(sheets, memberRows, organization, keepEmail) {
  const orgKey = normalizeOrganizationKey(organization);
  const keep = normalizeLoyaltyEmail(keepEmail);
  const toDemote = memberRows
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) =>
      String(row[5] || '').toLowerCase() === 'platinum' &&
      normalizeOrganizationKey(row[6]) === orgKey &&
      normalizeLoyaltyEmail(row[0]) !== keep &&
      isPrimaryContactFlag(row[10]),
    );
  for (const { rowNumber } of toDemote) {
    await bqLoyaltyValuesUpdate(`LoyaltyMembers!K${rowNumber}`, [['']]);
  }
}

async function findCompanyPortalByToken(sheets, token) {
  const rows = await getCompanyPortalRows(sheets);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[3] === token);
  if (rowIndex < 1) return null;
  const row = rows[rowIndex];
  return { organization: row[0] || '', companyId: row[1] || '', contactEmail: normalizeLoyaltyEmail(row[2]), joinToken: row[6] || '' };
}

// The join token is the employee-facing counterpart of the admin access token: it only
// ever authorises self-enrolment, never reading the employee roster or usage history.
async function findCompanyByJoinToken(sheets, joinToken) {
  const rows = await getCompanyPortalRows(sheets);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[6] && row[6] === joinToken);
  if (rowIndex < 1) return null;
  const row = rows[rowIndex];
  return { organization: row[0] || '', companyId: row[1] || '', contactEmail: normalizeLoyaltyEmail(row[2]) };
}

function getManageBookingUrl(req, bookingId) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host || /[\r\n/]/.test(host)) return '';
  const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  return `${protocol}://${host}/?manage=1&ref=${encodeURIComponent(bookingId)}`;
}

// Shared enrolment path for both the admin company portal and the restricted employee join link.
// Organization, company ID, and contact email are forced from the token record (not client-supplied) so a
// link cannot be used to enroll an employee under a different company. The new employee is never marked as
// the primary contact (column K left blank) - only staff can designate a primary owner/contact, and only
// that person's top-ups fund the company's shared prepaid-hour pool.
async function enrollCompanyEmployee(sheets, res, company, payload) {
  const settings = await getLoyaltySettings();
  if (!settings.enabled) return res.status(409).json({ message: 'The loyalty program is currently paused.' });
  const email = normalizeLoyaltyEmail(payload?.email);
  const name = String(payload?.name || '').trim().slice(0, 120);
  const phone = String(payload?.phone || '').trim().slice(0, 50);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    return res.status(400).json({ message: 'Enter a valid employee email and name.' });
  }
  const membersResult = await bqLoyaltyValuesGet('LoyaltyMembers!A:K');
  const rows = membersResult.data.values || [];
  const existingIndex = rows.findIndex((row, index) => index > 0 && normalizeLoyaltyEmail(row[0]) === email);
  if (existingIndex >= 1) {
    const existingType = String(rows[existingIndex][5] || 'regular').toLowerCase();
    const existingOrganization = String(rows[existingIndex][6] || '').trim();
    if (existingType === 'platinum' && normalizeOrganizationKey(existingOrganization) === normalizeOrganizationKey(company.organization)) {
      return res.status(409).json({ message: 'This employee is already signed up for your company\'s Platinum membership.' });
    }
    return res.status(409).json({ message: 'This email is already enrolled under a different membership. Contact the clinic to update it.' });
  }
  const now = new Date().toISOString();
  await bqLoyaltyValuesAppend('LoyaltyMembers!A:K', [[email, name, phone, now, now, 'platinum', company.organization, '', company.companyId, company.contactEmail, '']]);
  const ledgerRows = (await bqLoyaltyValuesGet('LoyaltyLedger!A:J')).data.values?.slice(1) || [];
  const hoursBalance = loyaltyPlatinumHoursBalance(rows.slice(1), ledgerRows, company.organization, email);
  const member = {
    email, name, phone, membershipType: 'platinum', organization: company.organization, companyId: company.companyId, hoursBalance,
  };
  let emailSent = false;
  let emailError = '';
  try {
    await sendMembershipEmail(createGmailApi(), member, settings, await getBusinessProfile(sheets), 'welcome', company.contactEmail);
    emailSent = true;
  } catch (error) {
    emailError = error.message || 'Membership email could not be sent.';
    console.error('Company portal signup email error:', emailError);
  }
  return res.status(200).json({ member, emailSent, emailError });
}

function getCompanyPortalUrl(req, token) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host || /[\r\n/]/.test(host)) throw new Error('Unable to determine the public app address for the company portal link');
  const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  return `${protocol}://${host}/?companyToken=${encodeURIComponent(token)}`;
}

function getCompanyJoinUrl(req, joinToken) {
  if (!joinToken) return '';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host || /[\r\n/]/.test(host)) return '';
  const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  return `${protocol}://${host}/?joinToken=${encodeURIComponent(joinToken)}`;
}

function validateLoyaltySettings(input) {
  const membershipPlansInput = input?.membershipPlans || DEFAULT_LOYALTY_SETTINGS.membershipPlans;
  const goldInput = membershipPlansInput.gold || DEFAULT_LOYALTY_SETTINGS.membershipPlans.gold;
  const platinumInput = membershipPlansInput.platinum || DEFAULT_LOYALTY_SETTINGS.membershipPlans.platinum;
  const silverInput = membershipPlansInput.silver || DEFAULT_LOYALTY_SETTINGS.membershipPlans.silver;
  const hasLegacyDefaults = Number(input?.pointsPerDollar) === 1 &&
    Number(input?.redemptionPoints) === 100 &&
    Number(input?.redemptionValue) === 5;
  const settings = {
    enabled: input?.enabled !== false,
    pointsPerDollar: hasLegacyDefaults ? DEFAULT_LOYALTY_SETTINGS.pointsPerDollar : Number(input?.pointsPerDollar),
    firstSessionMultiplier: Number(input?.firstSessionMultiplier ?? DEFAULT_LOYALTY_SETTINGS.firstSessionMultiplier),
    redemptionPoints: hasLegacyDefaults ? DEFAULT_LOYALTY_SETTINGS.redemptionPoints : Number(input?.redemptionPoints),
    redemptionValue: hasLegacyDefaults ? DEFAULT_LOYALTY_SETTINGS.redemptionValue : Number(input?.redemptionValue),
    membershipPlans: {
      gold: {
        monthlyFee: Number(goldInput.monthlyFee),
        discountPercent: Number(goldInput.discountPercent),
        pointsMultiplier: Number(goldInput.pointsMultiplier ?? DEFAULT_LOYALTY_SETTINGS.membershipPlans.gold.pointsMultiplier),
        freeHotStonePerMonth: Number(goldInput.freeHotStonePerMonth ?? DEFAULT_LOYALTY_SETTINGS.membershipPlans.gold.freeHotStonePerMonth),
      },
      platinum: {
        topUpPrice: Number(platinumInput.topUpPrice),
        includedHours: Number(platinumInput.includedHours),
        discountPercent: Number(platinumInput.discountPercent),
        hotStoneDiscount: Number(platinumInput.hotStoneDiscount),
        // Surcharge added to a Platinum member's bill whenever the Hot Stone add-on is used.
        // Defaulted so loyalty settings saved before this field existed stay valid.
        hotStoneSurcharge: Number(platinumInput.hotStoneSurcharge ?? DEFAULT_LOYALTY_SETTINGS.membershipPlans.platinum.hotStoneSurcharge),
      },
      silver: {
        monthlyFee: Number(silverInput.monthlyFee),
        discountPercent: Number(silverInput.discountPercent),
        maxEmployees: Number(silverInput.maxEmployees),
      },
    },
    tiers: Array.isArray(input?.tiers) ? input.tiers.map((tier) => ({
      name: String(tier?.name || '').trim(),
      threshold: Number(tier?.threshold),
    })) : [],
  };
  if (
    !Number.isFinite(settings.pointsPerDollar) || settings.pointsPerDollar <= 0 || settings.pointsPerDollar > 100 ||
    !Number.isFinite(settings.firstSessionMultiplier) || settings.firstSessionMultiplier < 1 || settings.firstSessionMultiplier > 100 ||
    !Number.isInteger(settings.redemptionPoints) || settings.redemptionPoints < 1 || settings.redemptionPoints > 1000000 ||
    !Number.isFinite(settings.redemptionValue) || settings.redemptionValue <= 0 || settings.redemptionValue > 10000 ||
    !Number.isFinite(settings.membershipPlans.gold.monthlyFee) || settings.membershipPlans.gold.monthlyFee < 0 || settings.membershipPlans.gold.monthlyFee > 100000 ||
    !Number.isFinite(settings.membershipPlans.gold.discountPercent) || settings.membershipPlans.gold.discountPercent < 0 || settings.membershipPlans.gold.discountPercent > 100 ||
    !Number.isFinite(settings.membershipPlans.gold.pointsMultiplier) || settings.membershipPlans.gold.pointsMultiplier < 0 || settings.membershipPlans.gold.pointsMultiplier > 100 ||
    !Number.isInteger(settings.membershipPlans.gold.freeHotStonePerMonth) || settings.membershipPlans.gold.freeHotStonePerMonth < 0 || settings.membershipPlans.gold.freeHotStonePerMonth > 100 ||
    !Number.isFinite(settings.membershipPlans.platinum.topUpPrice) || settings.membershipPlans.platinum.topUpPrice < 0 || settings.membershipPlans.platinum.topUpPrice > 100000 ||
    !Number.isFinite(settings.membershipPlans.platinum.includedHours) || settings.membershipPlans.platinum.includedHours <= 0 || settings.membershipPlans.platinum.includedHours > 10000 ||
    !Number.isFinite(settings.membershipPlans.platinum.discountPercent) || settings.membershipPlans.platinum.discountPercent < 0 || settings.membershipPlans.platinum.discountPercent > 100 ||
    !Number.isFinite(settings.membershipPlans.platinum.hotStoneDiscount) || settings.membershipPlans.platinum.hotStoneDiscount < 0 || settings.membershipPlans.platinum.hotStoneDiscount > 10000 ||
    !Number.isFinite(settings.membershipPlans.platinum.hotStoneSurcharge) || settings.membershipPlans.platinum.hotStoneSurcharge < 0 || settings.membershipPlans.platinum.hotStoneSurcharge > 10000 ||
    !Number.isFinite(settings.membershipPlans.silver.monthlyFee) || settings.membershipPlans.silver.monthlyFee < 0 || settings.membershipPlans.silver.monthlyFee > 100000 ||
    !Number.isFinite(settings.membershipPlans.silver.discountPercent) || settings.membershipPlans.silver.discountPercent < 0 || settings.membershipPlans.silver.discountPercent > 100 ||
    !Number.isInteger(settings.membershipPlans.silver.maxEmployees) || settings.membershipPlans.silver.maxEmployees < 1 || settings.membershipPlans.silver.maxEmployees > 5000 ||
    settings.tiers.length < 1 || settings.tiers.length > 6
  ) {
    throw new Error('Enter valid earning and redemption values, and configure between one and six loyalty tiers.');
  }
  const names = new Set();
  let previousThreshold = -1;
  settings.tiers.forEach((tier, index) => {
    const normalizedName = tier.name.toLowerCase();
    if (
      !tier.name || tier.name.length > 40 || names.has(normalizedName) ||
      !Number.isInteger(tier.threshold) || tier.threshold < 0 ||
      (index === 0 && tier.threshold !== 0) || tier.threshold <= previousThreshold
    ) {
      throw new Error('Tier names must be unique. Set the first tier to zero points and later thresholds to increasing whole numbers.');
    }
    names.add(normalizedName);
    previousThreshold = tier.threshold;
  });
  return settings;
}

async function getLoyaltySettings() {
  await ensureLoyaltyTables();
  const result = await bqLoyaltyValuesGet('LoyaltySettings!A1:B2');
  const settingsValue = result.data.values?.[1]?.[0];
  if (!settingsValue) return DEFAULT_LOYALTY_SETTINGS;
  let settings;
  try {
    settings = JSON.parse(settingsValue);
  } catch {
    throw new Error('LoyaltySettings contains invalid settings data; please save the loyalty settings again.');
  }
  return validateLoyaltySettings(settings);
}

async function getPublicLoyaltySettings() {
  const result = await bqLoyaltyValuesGet('LoyaltySettings!A1:B2');
  const settingsValue = result.data.values?.[1]?.[0];
  if (!settingsValue) return DEFAULT_LOYALTY_SETTINGS;
  let settings;
  try {
    settings = JSON.parse(settingsValue);
  } catch {
    throw new Error('Loyalty program settings are temporarily unavailable.');
  }
  return validateLoyaltySettings(settings);
}

function normalizeLoyaltyEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isAppointmentCompleteByTime(date, time, durationMinutes = 60) {
  try {
    const localParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: CALENDAR_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    const currentLocalDateTime = `${localParts.year}-${localParts.month}-${localParts.day}T${localParts.hour}:${localParts.minute}:00`;
    const appointmentEnd = addMinutes(parseBookingDateTime(date, time), Number(durationMinutes) || 60);
    return appointmentEnd <= currentLocalDateTime;
  } catch {
    return false;
  }
}

async function enrollLoyaltyMember(sheets, payload) {
  const email = normalizeLoyaltyEmail(payload.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid email is required to enroll in the loyalty program.');
  }
  const platinumEnrollment = payload.platinumEnrollment === true;
  const organization = String(payload.companyName || '').trim().slice(0, 120);
  const companyId = String(payload.companyId || '').trim().slice(0, 120);
  let companyContactEmail = '';
  if (platinumEnrollment && !organization) {
    throw new Error('Enter the company name to request Platinum enrollment.');
  }
  const result = await bqLoyaltyValuesGet('LoyaltyMembers!A:J');
  const rows = result.data.values || [];
  if (platinumEnrollment && !companyContactEmail) {
    companyContactEmail = normalizeLoyaltyEmail(rows.slice(1).find((row) =>
      String(row[5] || '').toLowerCase() === 'platinum' &&
      String(row[6] || '').trim().toLowerCase() === organization.toLowerCase() &&
      row[9],
    )?.[9]);
  }
  const existingIndex = rows.findIndex((row, index) => index > 0 && normalizeLoyaltyEmail(row[0]) === email);
  const now = new Date().toISOString();
  const memberName = String(payload.customerName || '').trim().slice(0, 120);
  const phone = String(payload.phone || '').trim().slice(0, 50);
  if (existingIndex >= 0) {
    const rowNumber = existingIndex + 1;
    const row = rows[existingIndex];
    const existingType = String(row[5] || 'regular').toLowerCase();
    const existingOrganization = String(row[6] || '').trim();
    if (platinumEnrollment && !['regular', 'platinum'].includes(existingType)) {
      throw new Error(`This email is already enrolled in the ${existingType} plan. Contact the clinic to change memberships.`);
    }
    if (platinumEnrollment && existingType === 'platinum' && existingOrganization &&
        existingOrganization.toLowerCase() !== organization.toLowerCase()) {
      throw new Error('This email is already linked to a different company. Contact the clinic to update it.');
    }
    await bqLoyaltyValuesUpdate(`LoyaltyMembers!B${rowNumber}:J${rowNumber}`, [[
        memberName || row[1] || '',
        phone || row[2] || '',
        row[3] || now,
        now,
        platinumEnrollment ? 'platinum' : existingType,
        platinumEnrollment ? organization : row[6] || '',
        row[7] || '',
        platinumEnrollment ? companyId || row[8] || '' : row[8] || '',
        platinumEnrollment ? companyContactEmail || row[9] || '' : row[9] || '',
      ]]);
    const resultOrganization = platinumEnrollment ? organization : row[6] || '';
    const ledgerRows = platinumEnrollment
      ? (await bqLoyaltyValuesGet('LoyaltyLedger!A:J')).data.values?.slice(1) || []
      : [];
    return {
      created: false,
      membershipType: platinumEnrollment ? 'platinum' : existingType,
      companyContactEmail: platinumEnrollment ? companyContactEmail || row[9] || '' : '',
      hoursBalance: platinumEnrollment ? loyaltyPlatinumHoursBalance(rows.slice(1), ledgerRows, resultOrganization, email) : 0,
    };
  }
  await bqLoyaltyValuesAppend('LoyaltyMembers!A:J', [[email, memberName, phone, now, now, platinumEnrollment ? 'platinum' : 'regular', platinumEnrollment ? organization : '', '', platinumEnrollment ? companyId : '', platinumEnrollment ? companyContactEmail : '']]);
  return {
    created: true,
    membershipType: platinumEnrollment ? 'platinum' : 'regular',
    companyContactEmail: platinumEnrollment ? companyContactEmail : '',
    hoursBalance: 0,
  };
}

function isValidMembershipDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isMembershipActive(member, today = new Date().toISOString().slice(0, 10)) {
  const type = String(member?.[5] || 'regular').toLowerCase();
  return ['gold', 'silver'].includes(type) && isValidMembershipDate(String(member?.[7] || '')) && member[7] >= today;
}

function loyaltyHoursBalance(transactions, email) {
  return transactions
    .filter((transaction) => normalizeLoyaltyEmail(transaction[1]) === email)
    .reduce((sum, transaction) => sum + (Number(transaction[8]) || 0), 0);
}

function isPrimaryContactFlag(value) {
  return String(value || '').trim().toUpperCase() === 'Y';
}

function loyaltyOrgMemberEmails(members, organization) {
  const orgKey = normalizeOrganizationKey(organization);
  if (!orgKey) return new Set();
  return new Set(
    members
      .filter((row) => String(row[5] || '').toLowerCase() === 'platinum' && normalizeOrganizationKey(row[6]) === orgKey)
      .map((row) => normalizeLoyaltyEmail(row[0])),
  );
}

// Platinum prepaid hours are pooled per company: only the company's designated primary
// owner/contact can pay for a top-up, and every employee enrolled under that same
// organization draws from that one shared balance instead of needing their own top-up.
function loyaltyPlatinumHoursBalance(members, transactions, organization, email) {
  const orgEmails = loyaltyOrgMemberEmails(members, organization);
  if (!orgEmails.size) return loyaltyHoursBalance(transactions, email);
  return transactions
    .filter((transaction) => orgEmails.has(normalizeLoyaltyEmail(transaction[1])))
    .reduce((sum, transaction) => sum + (Number(transaction[8]) || 0), 0);
}

function currentLoyaltyMonth() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
}

function loyaltyMonthForDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
}

function loyaltyHotStoneRedemptions(transactions, email, month = currentLoyaltyMonth()) {
  return transactions.filter((transaction) =>
    transaction[3] === 'HOTSTONE' &&
    normalizeLoyaltyEmail(transaction[1]) === email &&
    loyaltyMonthForDate(transaction[7]) === month,
  ).length;
}

async function getMemberBenefit(sheets, email, settings) {
  const normalizedEmail = normalizeLoyaltyEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return null;
  const [membersResult, ledgerResult] = await Promise.all([
    bqLoyaltyValuesGet('LoyaltyMembers!A:J'),
    bqLoyaltyValuesGet('LoyaltyLedger!A:J'),
  ]);
  const member = (membersResult.data.values || []).slice(1)
    .find((row) => normalizeLoyaltyEmail(row[0]) === normalizedEmail);
  if (!member) return null;
  const type = String(member[5] || 'regular').toLowerCase();
  const transactions = (ledgerResult.data.values || []).slice(1);
  const hoursBalance = type === 'platinum'
    ? loyaltyPlatinumHoursBalance((membersResult.data.values || []).slice(1), transactions, member[6], normalizedEmail)
    : loyaltyHoursBalance(transactions, normalizedEmail);
  const active = type === 'platinum' ? hoursBalance > 0 : isMembershipActive(member);
  if (!active) return null;
  const plan = settings.membershipPlans[type];
  if (!plan) return null;
  return {
    type,
    discountPercent: plan.discountPercent,
    paidThrough: member[7],
    pointsMultiplier: type === 'gold' ? plan.pointsMultiplier : 1,
    freeHotStonePerMonth: type === 'gold' ? plan.freeHotStonePerMonth : 0,
    freeHotStoneAvailable: type === 'gold' &&
      loyaltyHotStoneRedemptions(transactions, normalizedEmail) < plan.freeHotStonePerMonth,
    hotStoneDiscount: type === 'platinum' ? plan.hotStoneDiscount : 0,
    hotStoneSurcharge: type === 'platinum' ? (Number(plan.hotStoneSurcharge) || 0) : 0,
    hoursBalance,
  };
}

function isSingleSessionPurchase(serviceName) {
  return !/(package|bundle|add[\s-]?on|couple|gift\s*card|top[\s-]?up)/i.test(String(serviceName || ''));
}

function getFirstPaidSingleSessionBookingId(rows, email) {
  const candidates = rows.filter((row) => {
    const total = Number(row[11]) || 0;
    const paidAmount = Number(row[10]) || 0;
    return normalizeLoyaltyEmail(row[3]) === email &&
      total > 0 && paidAmount > 0 && paidAmount + 0.005 >= total &&
      isSingleSessionPurchase(row[5]) &&
      isAppointmentCompleteByTime(row[7], row[8], row[12]);
  });
  candidates.sort((a, b) =>
    parseBookingDateTime(a[7], a[8]).localeCompare(parseBookingDateTime(b[7], b[8])),
  );
  return String(candidates[0]?.[0] || '');
}

async function ensureMarketingContactsSheet(sheets) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not configured');
  let spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  let exists = (spreadsheet.data.sheets || [])
    .some((sheet) => sheet.properties?.title === 'MarketingContacts');
  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: 'MarketingContacts' } } }] },
      });
    } catch (error) {
      spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties',
      });
      exists = (spreadsheet.data.sheets || [])
        .some((sheet) => sheet.properties?.title === 'MarketingContacts');
      if (!exists) throw error;
    }
  }
  const header = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'MarketingContacts!A1:G1',
  });
  const values = header.data.values?.[0] || [];
  if (!values.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'MarketingContacts!A1:G1',
      valueInputOption: 'RAW',
      requestBody: { values: [MARKETING_CONTACT_HEADERS] },
    });
  } else if (MARKETING_CONTACT_HEADERS.some((field, index) => values[index] !== field)) {
    throw new Error('MarketingContacts sheet has an unexpected header. Preserve its data and restore the required Email through Unsubscribed At columns before retrying.');
  }
}

async function getMarketingContactRows(sheets) {
  await ensureMarketingContactsSheet(sheets);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'MarketingContacts!A:G',
  });
  return (result.data.values || []).slice(1);
}

async function recordMarketingConsent(sheets, payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
    throw new Error('A valid customer email is required to record marketing consent');
  }
  const rows = await getMarketingContactRows(sheets);
  const rowIndex = rows.findIndex((row) => String(row[0] || '').trim().toLowerCase() === email);
  const now = new Date().toISOString();
  const name = String(payload.customerName || '').trim().slice(0, 200);
  if (rowIndex >= 0 && String(rows[rowIndex][2] || '').toLowerCase() === 'subscribed') {
    return;
  }
  const token = crypto.randomBytes(32).toString('hex');
  const values = [[email, name, 'subscribed', now, 'booking form opt-in', token, '']];
  if (rowIndex >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `MarketingContacts!A${rowIndex + 2}:G${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    return;
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'MarketingContacts!A:G',
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

// --- Google review requests -----------------------------------------------
// Owners can email past visitors a link to the clinic's Google review form.
// Every send is logged in a ReviewRequests tab so the same customer is not
// asked repeatedly.
const REVIEW_REQUEST_HEADERS = ['Email', 'Customer Name', 'Booking ID', 'Requested At'];
const REVIEW_REQUEST_COOLDOWN_DAYS = 180;
const REVIEW_REQUEST_LOOKBACK_DAYS = 730;
const REVIEW_REQUEST_MAX_RECIPIENTS = 50;

async function ensureReviewRequestsSheet(sheets) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  let spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  let exists = (spreadsheet.data.sheets || []).some((sheet) => sheet.properties?.title === 'ReviewRequests');
  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: 'ReviewRequests' } } }] },
      });
    } catch (error) {
      spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
      exists = (spreadsheet.data.sheets || []).some((sheet) => sheet.properties?.title === 'ReviewRequests');
      if (!exists) throw error;
    }
  }
  const header = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'ReviewRequests!A1:D1' });
  const values = header.data.values?.[0] || [];
  if (!values.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'ReviewRequests!A1:D1',
      valueInputOption: 'RAW',
      requestBody: { values: [REVIEW_REQUEST_HEADERS] },
    });
  } else if (REVIEW_REQUEST_HEADERS.some((field, index) => values[index] !== field)) {
    throw new Error('ReviewRequests sheet has an unexpected header. Restore the Email, Customer Name, Booking ID and Requested At columns before retrying.');
  }
}

async function getReviewRequestRows(sheets) {
  await ensureReviewRequestsSheet(sheets);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'ReviewRequests!A:D',
  });
  return (result.data.values || []).slice(1);
}

async function recordReviewRequests(sheets, entries) {
  if (!entries.length) return;
  await ensureReviewRequestsSheet(sheets);
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'ReviewRequests!A:D',
    valueInputOption: 'RAW',
    requestBody: {
      values: entries.map((entry) => [entry.email, entry.name || '', entry.bookingId || '', entry.requestedAt]),
    },
  });
}

// One entry per customer who has actually attended an appointment (past date,
// not cancelled), carrying their most recent visit so the email can reference it.
async function collectReviewRequestCandidates(sheets, bigquery) {
  const [bookingResult, requestRows, contactRows] = await Promise.all([
    bqFetchBookingRows(bigquery),
    getReviewRequestRows(sheets),
    getMarketingContactRows(sheets),
  ]);
  const allRows = bookingResult.data.values || [];
  const bookingRows = allRows[0]?.[0] === 'Booking ID' ? allRows.slice(1) : allRows;
  const unsubscribed = new Set(
    contactRows
      .filter((row) => String(row[2] || '').trim().toLowerCase() === 'unsubscribed')
      .map((row) => String(row[0] || '').trim().toLowerCase()),
  );
  const lastRequestedAt = new Map();
  for (const row of requestRows) {
    const email = String(row[0] || '').trim().toLowerCase();
    const requestedAt = String(row[3] || '').trim();
    if (!email || !requestedAt) continue;
    const previous = lastRequestedAt.get(email);
    if (!previous || requestedAt > previous) lastRequestedAt.set(email, requestedAt);
  }
  const today = new Date();
  const cooldownCutoff = new Date(today.getTime() - REVIEW_REQUEST_COOLDOWN_DAYS * 86400000).toISOString();
  const earliestVisit = new Date(today.getTime() - REVIEW_REQUEST_LOOKBACK_DAYS * 86400000);
  const localDateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(today).map((part) => [part.type, part.value]));
  const startOfClinicToday = new Date(Date.UTC(
    Number(localDateParts.year), Number(localDateParts.month) - 1, Number(localDateParts.day), 12,
  ));
  const stats = { totalBookings: bookingRows.length, missingEmail: 0, notVisitedYet: 0, cancelled: 0, tooOld: 0 };
  const byEmail = new Map();
  for (const row of bookingRows) {
    const email = String(row[3] || '').trim().toLowerCase();
    const date = String(row[7] || '').trim();
    if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) { stats.missingEmail += 1; continue; }
    if (String(row[24] || '').trim() === 'Cancelled') { stats.cancelled += 1; continue; }
    const visitedAt = parseBookingDate(date);
    if (!visitedAt) { stats.notVisitedYet += 1; continue; }
    // Prefer the clinic-timezone appointment-end check so a session that
    // finished earlier today already counts. Legacy/migrated rows with a
    // missing or unparseable time fall back to "the date is before today".
    const visited = isAppointmentCompleteByTime(date, row[8], row[12]) || visitedAt < startOfClinicToday;
    if (!visited) { stats.notVisitedYet += 1; continue; }
    if (visitedAt < earliestVisit) { stats.tooOld += 1; continue; }
    const existing = byEmail.get(email);
    if (existing && existing.visitDate >= date) continue;
    byEmail.set(email, {
      email,
      name: String(row[1] || '').trim(),
      bookingId: String(row[0] || '').trim(),
      serviceName: String(row[5] || '').trim(),
      branchName: String(row[4] || '').trim(),
      visitDate: date,
    });
  }
  const candidates = [...byEmail.values()]
    .map((candidate) => {
      const requestedAt = lastRequestedAt.get(candidate.email) || '';
      return {
        ...candidate,
        lastRequestedAt: requestedAt,
        unsubscribed: unsubscribed.has(candidate.email),
        // Pre-select only customers who have never been asked, or who were
        // asked long enough ago that a fresh nudge is reasonable.
        eligible: !unsubscribed.has(candidate.email) && (!requestedAt || requestedAt < cooldownCutoff),
      };
    })
    .sort((a, b) => (a.visitDate < b.visitDate ? 1 : a.visitDate > b.visitDate ? -1 : 0));
  return { candidates, stats };
}

async function sendReviewRequestEmail(gmail, { candidate, reviewUrl, businessProfile }) {
  const recipient = String(candidate.email || '').trim().toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)) {
    throw new Error('A valid customer email is required to send a review request.');
  }
  const safeBusinessName = String(businessProfile.businessName || 'MY THAI THAI').replace(/[\r\n"]/g, '');
  const greeting = candidate.name ? `Hello ${candidate.name},` : 'Hello,';
  const visitLine = candidate.serviceName
    ? `We hope you enjoyed your ${candidate.serviceName}${candidate.visitDate ? ` on ${candidate.visitDate}` : ''}.`
    : 'We hope you enjoyed your recent visit.';
  const subject = `How was your visit to ${safeBusinessName}?`;
  const text = [
    greeting,
    '',
    visitLine,
    '',
    'Would you take a moment to leave us a Google review? It only takes a minute and helps other people find us.',
    '',
    reviewUrl,
    '',
    'Thank you,',
    safeBusinessName,
  ].join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f3f5f4;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#18251f"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(visitLine)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e2e9e5;border-radius:14px;overflow:hidden"><tr><td style="padding:26px 32px;background:#073d32;color:#fff"><p style="margin:0 0 8px;font-size:12px;letter-spacing:2px">${escapeHtml(safeBusinessName).toUpperCase()}</p><h1 style="margin:0;font-size:24px">How was your visit?</h1></td></tr><tr><td style="padding:28px 32px"><p style="margin:0 0 14px">${escapeHtml(greeting)}</p><p style="margin:0 0 18px;line-height:1.6">${escapeHtml(visitLine)}</p><p style="margin:0 0 24px;line-height:1.6">Would you take a moment to leave us a Google review? It only takes a minute and helps other people find us.</p><p style="margin:0 0 24px"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:13px 24px;background:#087765;color:#fff;border-radius:9px;text-decoration:none;font-weight:bold">Leave a Google review</a></p><p style="margin:0;color:#5f6d66;font-size:13px;line-height:1.5">If the button does not work, paste this link into your browser:<br><a href="${escapeHtml(reviewUrl)}" style="color:#087765">${escapeHtml(reviewUrl)}</a></p></td></tr><tr><td style="padding:16px 32px;background:#f8faf9;color:#718078;font-size:12px">${escapeHtml(safeBusinessName)}${businessProfile.address ? ` · ${escapeHtml(businessProfile.address)}` : ''}<br>${escapeHtml(businessProfile.phone || '')}${businessProfile.phone && businessProfile.email ? ' · ' : ''}${escapeHtml(businessProfile.email || '')}</td></tr></table></td></tr></table></body></html>`;
  const boundary = `review_${crypto.randomBytes(12).toString('hex')}`;
  const encode = (value) => Buffer.from(value).toString('base64').match(/.{1,76}/g).join('\r\n');
  const raw = [
    `From: "${safeBusinessName}" <${GOOGLE_GMAIL_SENDER_EMAIL}>`,
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
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url') } });
}

const WEEKDAYS = [
  ['sunday', 0], ['monday', 1], ['tuesday', 2], ['wednesday', 3],
  ['thursday', 4], ['friday', 5], ['saturday', 6],
];
const AUDIENCE_MEMBERSHIP_TYPES = ['regular', 'silver', 'gold', 'platinum'];
const AUDIENCE_HELP_MESSAGE = 'I can find opted-in customers by membership, weekday, recent visit, branch, service, or most recent customer count. Try “Gold members” or “customers who visit every Wednesday at Oakville Downtown”.';

// The branch and service names that actually occur in booking history; used to
// validate both assistant-parsed and manually chosen filters.
function audienceFilterOptions(bookingRows) {
  return {
    branches: [...new Set(bookingRows.map((row) => String(row[4] || '').trim()).filter(Boolean))].sort(),
    services: [...new Set(bookingRows.map((row) => String(row[5] || '').trim()).filter(Boolean))].sort(),
    membershipTypes: AUDIENCE_MEMBERSHIP_TYPES,
    weekdays: WEEKDAYS.map(([name]) => name),
  };
}

// Shared validation + human-readable summary for every audience source
// (keyword parsing, Gemini matching and manual filters) so they all produce
// exactly the same criteria shape.
function finalizeAudienceCriteria(input) {
  const weekdayEntry = input.weekday === null || input.weekday === undefined
    ? null
    : WEEKDAYS.find(([, index]) => index === input.weekday) || null;
  const days = input.days || null;
  if (days !== null && (!Number.isFinite(days) || days < 1 || days > 365)) {
    throw new Error('Choose a recent-visit window between 1 and 365 days.');
  }
  const limit = input.limit || null;
  if (limit !== null && (!Number.isFinite(limit) || limit < 1 || limit > 50)) {
    throw new Error('Choose between 1 and 50 most recent customers per campaign.');
  }
  const membershipType = input.membershipType === 'points' ? 'regular' : (input.membershipType || '');
  if (membershipType && !AUDIENCE_MEMBERSHIP_TYPES.includes(membershipType)) {
    throw new Error(`Choose one of these membership types: ${AUDIENCE_MEMBERSHIP_TYPES.join(', ')}.`);
  }
  const branch = input.branch || '';
  const service = input.service || '';
  const allOptedIn = Boolean(input.allOptedIn);
  if (!weekdayEntry && !days && !branch && !service && !limit && !allOptedIn && !membershipType) {
    throw new Error(input.emptyMessage || AUDIENCE_HELP_MESSAGE);
  }
  const recurring = Boolean(weekdayEntry && input.recurring);
  const descriptions = [];
  if (weekdayEntry) descriptions.push(`${recurring ? 'at least two past bookings on' : 'a past booking on'} ${weekdayEntry[0].charAt(0).toUpperCase()}${weekdayEntry[0].slice(1)}s`);
  if (days) descriptions.push(`a booking in the last ${days} days`);
  if (branch) descriptions.push(`the ${branch} branch`);
  if (service) descriptions.push(`${service} appointments`);
  if (membershipType) descriptions.push(`${membershipType} members`);
  if (allOptedIn && descriptions.length === 0) descriptions.push('all active opted-in subscribers');
  if (limit) descriptions.push(`the ${limit} most recently active customers`);
  return {
    query: input.query || '',
    source: input.source || 'keyword',
    weekday: weekdayEntry?.[1] ?? null,
    recurring,
    days,
    branch,
    service,
    membershipType,
    limit,
    allOptedIn,
    description: `Opted-in customers with ${descriptions.join(' and ')}.`,
  };
}

function parseAudienceQuery(query, bookingRows) {
  const text = String(query || '').trim();
  if (!text || text.length > 300) {
    throw new Error('Describe the audience in 1-300 characters.');
  }
  const normalized = text.toLowerCase();
  const weekday = WEEKDAYS.find(([name]) => new RegExp(`\\b${name}\\b`).test(normalized));
  const recurring = Boolean(weekday && /\b(every|regular|regularly|recurring|frequent|often)\b/.test(normalized));
  const rangeMatch = normalized.match(/\b(?:last|past|within)\s+(\d{1,3})\s+(day|week|month)s?\b/);
  const recent = /\b(recent|latest|newest|most recent)\b/.test(normalized) || Boolean(rangeMatch);
  const days = rangeMatch
    ? Number(rangeMatch[1]) * ({ day: 1, week: 7, month: 30 }[rangeMatch[2]])
    : recent ? 30 : null;
  const { branches, services } = audienceFilterOptions(bookingRows);
  const matchingBranches = branches.filter((branch) => normalized.includes(branch.toLowerCase()));
  if (/\b(branch|location)\b/.test(normalized) && matchingBranches.length > 1) {
    throw new Error('Please name one branch so I can build a precise audience.');
  }
  const branch = matchingBranches.length === 1 ? matchingBranches[0] : '';
  const matchingServices = services.filter((service) => normalized.includes(service.toLowerCase()));
  if (matchingServices.length > 1) {
    throw new Error('Please name one service so I can build a precise audience.');
  }
  const service = matchingServices[0] || '';
  const countMatch = normalized.match(/\b(?:last|latest|most recent)\s+(\d{1,2})\s+(?:customers|clients|patients)\b/);
  const limit = countMatch ? Number(countMatch[1]) : null;
  const allOptedIn = /\b(all|everyone|everybody)\b/.test(normalized) &&
    /\b(subscribers|opted[ -]?in|customers|clients|patients|contacts)\b/.test(normalized);
  const membershipType = /\b(gold|silver|platinum|regular|points)\s+(?:membership\s+)?(?:members?|customers?)\b/.exec(normalized)?.[1] || '';
  return finalizeAudienceCriteria({
    query: text,
    source: 'keyword',
    weekday: weekday?.[1] ?? null,
    recurring,
    days,
    branch,
    service,
    membershipType,
    limit,
    allOptedIn,
  });
}

function matchAudienceOption(value, options) {
  const text = String(value || '').trim();
  if (!text) return '';
  return options.find((option) => option.toLowerCase() === text.toLowerCase()) || '';
}

// Builds criteria from filters the owner picked by hand in the dashboard, with
// no AI involved at all.
function buildManualAudienceCriteria(filters, bookingRows) {
  const input = filters || {};
  const { branches, services } = audienceFilterOptions(bookingRows);
  const weekdayName = String(input.weekday || '').trim().toLowerCase();
  const weekdayEntry = weekdayName ? WEEKDAYS.find(([name]) => name === weekdayName) : null;
  if (weekdayName && !weekdayEntry) throw new Error('Choose a valid weekday.');
  const branchInput = String(input.branch || '').trim();
  const branch = matchAudienceOption(branchInput, branches);
  if (branchInput && !branch) throw new Error(`No booking history exists for the branch “${branchInput}”.`);
  const serviceInput = String(input.service || '').trim();
  const service = matchAudienceOption(serviceInput, services);
  if (serviceInput && !service) throw new Error(`No booking history exists for the service “${serviceInput}”.`);
  const days = input.days === '' || input.days === null || input.days === undefined ? null : Number(input.days);
  const limit = input.limit === '' || input.limit === null || input.limit === undefined ? null : Number(input.limit);
  const membershipType = String(input.membershipType || '').trim().toLowerCase();
  const summaryParts = [
    weekdayEntry ? `${input.recurring ? 'every ' : ''}${weekdayEntry[0]}` : '',
    days ? `last ${days} days` : '',
    branch,
    service,
    membershipType ? `${membershipType} members` : '',
    limit ? `${limit} most recent` : '',
    input.allOptedIn ? 'all opted-in subscribers' : '',
  ].filter(Boolean);
  return finalizeAudienceCriteria({
    query: summaryParts.join(', '),
    source: 'manual',
    weekday: weekdayEntry?.[1] ?? null,
    recurring: Boolean(input.recurring),
    days,
    branch,
    service,
    membershipType,
    limit,
    allOptedIn: Boolean(input.allOptedIn),
    emptyMessage: 'Choose at least one filter, or select “All active opted-in subscribers”.',
  });
}

// Asks Gemini to turn a free-text audience description into structured filter
// values. Only the description plus the branch/service/membership vocabulary is
// sent — never customer, patient or booking data.
async function buildGeminiAudienceCriteria(query, bookingRows) {
  const { branches, services } = audienceFilterOptions(bookingRows);
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      model: 'gemini-3.8-flash',
      store: false,
      system_instruction: 'You convert a marketing audience description for a Thai massage clinic into structured filter values. Only use the branch and service names supplied in the vocabulary; leave a field empty when the description does not clearly ask for it. weekday must be empty or one of sunday, monday, tuesday, wednesday, thursday, friday, saturday. recurring is true only when the description implies repeat visits on that weekday. days is a recent-visit window between 1 and 365, or 0 when not requested. limit is the number of most recent customers between 1 and 50, or 0 when not requested. membershipType must be empty or one of regular, silver, gold, platinum. allOptedIn is true only when the description asks for everyone or all subscribers. Set unsupported to true when the description asks for something these filters cannot express. Never invent branch or service names.',
      input: JSON.stringify({
        audienceDescription: String(query || '').slice(0, 300),
        vocabulary: { branches, services, membershipTypes: AUDIENCE_MEMBERSHIP_TYPES },
      }),
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: {
          type: 'object',
          properties: {
            weekday: { type: 'string' },
            recurring: { type: 'boolean' },
            days: { type: 'integer' },
            branch: { type: 'string' },
            service: { type: 'string' },
            membershipType: { type: 'string' },
            limit: { type: 'integer' },
            allOptedIn: { type: 'boolean' },
            unsupported: { type: 'boolean' },
          },
          required: ['weekday', 'recurring', 'days', 'branch', 'service', 'membershipType', 'limit', 'allOptedIn', 'unsupported'],
        },
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini returned status ${response.status}`);
  }
  const text = data.steps
    ?.filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('')
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini returned an audience result that could not be read.');
  }
  if (parsed.unsupported === true) {
    const error = new Error(AUDIENCE_HELP_MESSAGE);
    error.audienceFatal = true;
    throw error;
  }
  const weekdayEntry = WEEKDAYS.find(([name]) => name === String(parsed.weekday || '').trim().toLowerCase());
  return finalizeAudienceCriteria({
    query: String(query || '').trim(),
    source: 'gemini',
    weekday: weekdayEntry?.[1] ?? null,
    recurring: parsed.recurring === true,
    days: Number(parsed.days) > 0 ? Math.trunc(Number(parsed.days)) : null,
    branch: matchAudienceOption(parsed.branch, branches),
    service: matchAudienceOption(parsed.service, services),
    membershipType: String(parsed.membershipType || '').trim().toLowerCase(),
    limit: Number(parsed.limit) > 0 ? Math.trunc(Number(parsed.limit)) : null,
    allOptedIn: parsed.allOptedIn === true,
  });
}

// Assistant mode: Gemini does the matching when it is configured, and the
// original keyword parser stays available as a fallback (and as an explicit
// "keyword" mode) so the assistant keeps working without an API key.
async function buildAssistantAudienceCriteria(query, bookingRows, mode) {
  const text = String(query || '').trim();
  if (!text || text.length > 300) {
    throw new Error('Describe the audience in 1-300 characters.');
  }
  if (mode === 'keyword' || !GEMINI_API_KEY) return parseAudienceQuery(text, bookingRows);
  try {
    return await buildGeminiAudienceCriteria(text, bookingRows);
  } catch (error) {
    if (error.audienceFatal) throw error;
    console.error('Gemini audience matching failed; falling back to keyword matching:', error.message || error);
    return parseAudienceQuery(text, bookingRows);
  }
}

function parseBookingDate(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Every email address the business still holds a customer/patient record for.
// A marketing contact that is not in this set no longer has any record in the
// system and must not appear in an audience or campaign.
function collectKnownCustomerEmails(bookingRows, memberRows) {
  const emails = new Set();
  for (const row of bookingRows) {
    const email = String(row[3] || '').trim().toLowerCase();
    if (email) emails.add(email);
  }
  for (const row of memberRows) {
    const email = normalizeLoyaltyEmail(row[0]);
    if (email) emails.add(email);
  }
  return emails;
}

// Keeps the marketing list in step with the live database: any contact whose
// customer/patient records have all been deleted is removed from the list, so
// they immediately drop out of every audience and future campaign.
// `contacts` must be header-stripped rows (sheet row number === index + 2).
async function pruneDeletedMarketingContacts(sheets, contacts, bookingRows, memberRows) {
  // A completely empty database almost always means a failed read rather than a
  // real deletion, so never prune the whole list on that basis.
  if (!bookingRows.length && !memberRows.length) return { contacts, removed: [] };
  const known = collectKnownCustomerEmails(bookingRows, memberRows);
  const stale = [];
  const surviving = [];
  contacts.forEach((row, index) => {
    const email = String(row[0] || '').trim().toLowerCase();
    if (email && !known.has(email)) stale.push({ rowNumber: index + 2, email });
    else surviving.push(row);
  });
  if (!stale.length) return { contacts, removed: [] };
  try {
    await deleteSheetRows(sheets, 'MarketingContacts', stale.map(({ rowNumber }) => rowNumber));
  } catch (error) {
    console.error('Marketing contact cleanup failed:', error.message || error);
    return { contacts, removed: [] };
  }
  return { contacts: surviving, removed: stale.map(({ email }) => email) };
}

// Standalone entry point used after a deletion (booking, patient history or
// loyalty member) so the marketing list is refreshed right away instead of
// waiting for the next audience lookup.
async function syncMarketingContactsWithDatabase(sheets, bigquery) {
  try {
    const [contacts, bookingResult, membersResult] = await Promise.all([
      getMarketingContactRows(sheets),
      bqFetchBookingRows(bigquery),
      bqLoyaltyValuesGet('LoyaltyMembers!A:J'),
    ]);
    const allRows = bookingResult.data.values || [];
    const bookingRows = allRows[0]?.[0] === 'Booking ID' ? allRows.slice(1) : allRows;
    const memberRows = (membersResult.data.values || []).slice(1);
    const { removed } = await pruneDeletedMarketingContacts(sheets, contacts, bookingRows, memberRows);
    return removed;
  } catch (error) {
    console.error('Marketing contact sync failed:', error.message || error);
    return [];
  }
}

// Normalizes the audience selection sent by the dashboard: either an assistant
// query ("assistant" = Gemini when configured, "keyword" = offline matching)
// or the explicit filters picked in manual mode.
function readAudienceRequest(body) {
  const mode = String(body?.mode || 'assistant').trim().toLowerCase();
  return {
    query: String(body?.query || ''),
    mode: ['assistant', 'keyword', 'manual'].includes(mode) ? mode : 'assistant',
    filters: body?.filters && typeof body.filters === 'object' ? body.filters : null,
  };
}

async function resolveMarketingAudience(sheets, bigquery, request) {
  const { query = '', mode = 'assistant', filters = null } = typeof request === 'string'
    ? { query: request }
    : (request || {});
  const [rawContacts, bookingResult, membersResult] = await Promise.all([
    getMarketingContactRows(sheets),
    bqFetchBookingRows(bigquery),
    bqLoyaltyValuesGet('LoyaltyMembers!A:J'),
  ]);
  const allRows = bookingResult.data.values || [];
  const bookingRows = allRows[0]?.[0] === 'Booking ID' ? allRows.slice(1) : allRows;
  const memberRows = (membersResult.data.values || []).slice(1);
  // The audience is always built from the live database: contacts whose records
  // have been deleted are dropped from the list before anyone is selected.
  const { contacts, removed: removedContacts } = await pruneDeletedMarketingContacts(
    sheets, rawContacts, bookingRows, memberRows,
  );
  const criteria = mode === 'manual'
    ? buildManualAudienceCriteria(filters, bookingRows)
    : await buildAssistantAudienceCriteria(query, bookingRows, mode);
  const membershipByEmail = new Map(memberRows.map((row) => [
    normalizeLoyaltyEmail(row[0]),
    String(row[5] || 'regular').toLowerCase(),
  ]));
  const now = new Date();
  const localDateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const today = Date.UTC(Number(localDateParts.year), Number(localDateParts.month) - 1, Number(localDateParts.day));
  const cutoff = criteria.days
    ? today - (criteria.days - 1) * 24 * 60 * 60 * 1000
    : null;
  const bookingsByEmail = new Map();
  for (const row of bookingRows) {
    const email = String(row[3] || '').trim().toLowerCase();
    const date = parseBookingDate(row[7]);
    if (!email || !date || date.getTime() > today) continue;
    const booking = {
      timestamp: date.getTime(),
      weekday: date.getUTCDay(),
      branch: String(row[4] || '').trim(),
      service: String(row[5] || '').trim(),
    };
    const history = bookingsByEmail.get(email) || [];
    history.push(booking);
    bookingsByEmail.set(email, history);
  }
  const activeContacts = contacts.filter((row) =>
    String(row[2] || '').toLowerCase() === 'subscribed' &&
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(String(row[0] || '').trim()) &&
    /^[a-f0-9]{64}$/.test(String(row[5] || '')));
  let recipients = activeContacts
    .map((row) => {
      const email = String(row[0] || '').trim().toLowerCase();
      if (criteria.membershipType && membershipByEmail.get(email) !== criteria.membershipType) return null;
      const history = bookingsByEmail.get(email) || [];
      const matchedHistory = history.filter((booking) =>
        (!criteria.branch || booking.branch.toLowerCase() === criteria.branch.toLowerCase()) &&
        (!criteria.service || booking.service.toLowerCase() === criteria.service.toLowerCase()));
      if (criteria.weekday !== null) {
        const visits = matchedHistory.filter((booking) => booking.weekday === criteria.weekday);
        if (visits.length < (criteria.recurring ? 2 : 1)) return null;
      }
      if (cutoff !== null && !matchedHistory.some((booking) => booking.timestamp >= cutoff)) return null;
      if ((criteria.branch || criteria.service) && !matchedHistory.length) return null;
      return {
        email,
        name: String(row[1] || '').trim(),
        token: String(row[5] || ''),
        lastVisit: matchedHistory.reduce((latest, booking) => Math.max(latest, booking.timestamp), 0),
        consentAt: String(row[3] || ''),
      };
    })
    .filter(Boolean);
  const uniqueRecipients = new Map();
  for (const recipient of recipients) {
    if (!uniqueRecipients.has(recipient.email)) uniqueRecipients.set(recipient.email, recipient);
  }
  recipients = [...uniqueRecipients.values()];
  recipients.sort((a, b) => b.lastVisit - a.lastVisit || b.consentAt.localeCompare(a.consentAt));
  if (criteria.limit) recipients = recipients.slice(0, criteria.limit);
  return {
    criteria,
    recipients,
    subscriberCount: new Set(activeContacts.map((row) => String(row[0] || '').trim().toLowerCase())).size,
    removedContacts,
  };
}

function getCampaignUnsubscribeUrl(req, token) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host || /[\r\n/]/.test(host)) throw new Error('Unable to determine the public app address for unsubscribe links');
  const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  return `${protocol}://${host}/api/booking?view=unsubscribe&token=${encodeURIComponent(token)}`;
}

function getCampaignSendBlockReason(businessProfile) {
  if (
    GOOGLE_GMAIL_SENDER_EMAIL.trim().toLowerCase() !== MARKETING_SENDER_EMAIL ||
    !GOOGLE_OAUTH_CLIENT_ID ||
    !GOOGLE_OAUTH_CLIENT_SECRET ||
    !GOOGLE_OAUTH_REFRESH_TOKEN
  ) {
    return `Configure Gmail OAuth for ${MARKETING_SENDER_EMAIL} in Vercel before sending campaigns.`;
  }
  if (
    !businessProfile.address ||
    businessProfile.address.trim().length < 10 ||
    businessProfile.address.trim().toLowerCase() === 'ontario, canada' ||
    !/\d/.test(businessProfile.address)
  ) {
    return 'Add the full street mailing address, including street number, in Business profile before sending campaigns.';
  }
  if (!businessProfile.phone && !businessProfile.email) {
    return 'Add a business email or phone number in Business profile before sending campaigns.';
  }
  return '';
}

async function generateCampaignCopy(goal, audienceDescription, audienceCount) {
  if (!GEMINI_API_KEY) {
    throw new Error('Campaign writing assistant is not configured. Add GEMINI_API_KEY to Vercel Environment Variables and redeploy.');
  }
  const cleanGoal = String(goal || '').trim();
  if (!cleanGoal || cleanGoal.length > 500) {
    throw new Error('Describe the campaign goal in 1-500 characters.');
  }
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      model: 'gemini-3.8-flash',
      store: false,
      system_instruction: 'You write warm, concise, professional promotional emails for a Thai massage and wellness clinic in Ontario, Canada. Return a JSON object with string keys subject, preview, and message. Subject must be at most 100 characters, preview at most 140 characters, and message at most 2500 characters. Use plain text in message, no HTML. Never invent prices, discounts, offers, availability, medical outcomes, or facts. Do not give medical advice or imply a guaranteed health benefit. Do not include customer names, email addresses, or other personal data. Make the email relevant to the aggregate audience description while avoiding language that reveals sensitive health information. Mention the booking website only when a website is supplied in the business context.',
      input: JSON.stringify({
        campaignGoal: cleanGoal,
        audience: String(audienceDescription || '').slice(0, 300),
        optedInRecipientCount: Number(audienceCount) || 0,
      }),
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            preview: { type: 'string' },
            message: { type: 'string' },
          },
          required: ['subject', 'preview', 'message'],
        },
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = data.error?.message || `Gemini returned status ${response.status}`;
    console.error('Campaign copy generation failed:', providerMessage);
    const hint = response.status === 429
      ? 'The Gemini quota or rate limit has been reached. Wait a minute, or check the quota and billing for this API key in Google AI Studio.'
      : [400, 401, 403].includes(response.status)
        ? 'Check that GEMINI_API_KEY in Vercel is a valid Gemini API key with the Generative Language API enabled.'
        : 'Gemini is temporarily unavailable. Please try again shortly.';
    throw new Error(`The campaign writing assistant could not generate copy (Gemini ${response.status}: ${String(providerMessage).slice(0, 200)}). ${hint}`);
  }
  const text = data.steps
    ?.filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('')
    .trim();
  if (!text) {
    throw new Error('Gemini returned an empty campaign draft. Please try again.');
  }
  let draft;
  try {
    draft = JSON.parse(text);
  } catch {
    throw new Error('The campaign writing assistant returned an invalid draft. Please try again.');
  }
  const subject = String(draft.subject || '').trim();
  const preview = String(draft.preview || '').trim();
  const message = String(draft.message || '').trim();
  if (
    !subject || subject.length > 180 || /[\r\n]/.test(subject) ||
    preview.length > 200 ||
    !message || message.length > 5000
  ) {
    throw new Error('The generated campaign draft did not meet the required format. Please try again.');
  }
  return { subject, preview, message };
}

async function sendMarketingEmail(gmail, campaign, recipient, businessProfile, unsubscribeUrl) {
  const sender = GOOGLE_GMAIL_SENDER_EMAIL;
  if (sender.trim().toLowerCase() !== MARKETING_SENDER_EMAIL) {
    throw new Error(`Campaign sender must be configured as ${MARKETING_SENDER_EMAIL}`);
  }
  const subject = String(campaign.subject || '').trim();
  const preview = String(campaign.preview || '').trim();
  const message = String(campaign.message || '').trim()
    .replace(/{{\s*name\s*}}/gi, recipient.name || 'there');
  if (!subject || subject.length > 180 || /[\r\n]/.test(subject)) throw new Error('Enter a subject line of 1-180 characters');
  if (preview.length > 200) throw new Error('Preview text must be 200 characters or fewer');
  if (!message || message.length > 5000) throw new Error('Enter a campaign message of 1-5000 characters');
  const safeSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const safeName = String(businessProfile.businessName || 'MY THAI THAI').replace(/[\r\n"]/g, '');
  const text = [
    message,
    '',
    businessProfile.businessName,
    businessProfile.address,
    businessProfile.phone,
    businessProfile.email,
    '',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].filter(Boolean).join('\n');
  const htmlMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f3f5f4;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#18251f"><span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${escapeHtml(preview)}</span><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e2e9e5;border-radius:14px"><tr><td style="padding:26px 30px;background:#073d32;color:#fff"><p style="margin:0;font-size:12px;letter-spacing:2px">${escapeHtml(safeName).toUpperCase()}</p></td></tr><tr><td style="padding:28px 30px;font-size:15px;line-height:1.7">${htmlMessage}<hr style="border:0;border-top:1px solid #e5ebe7;margin:28px 0 18px"><p style="margin:0;color:#64716b;font-size:12px">${escapeHtml(businessProfile.businessName)} · ${escapeHtml(businessProfile.address)}<br>${escapeHtml(businessProfile.phone)} · ${escapeHtml(businessProfile.email)}</p><p style="margin:12px 0 0;font-size:12px"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#087765">Unsubscribe from marketing emails</a></p></td></tr></table></td></tr></table></body></html>`;
  const boundary = `campaign_${crypto.randomBytes(12).toString('hex')}`;
  const encode = (value) => Buffer.from(value).toString('base64').match(/.{1,76}/g).join('\r\n');
  const rawMessage = [
    `From: "${safeName}" <${sender}>`,
    `To: ${recipient.email}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    `List-Unsubscribe: <${unsubscribeUrl}>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
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
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(rawMessage).toString('base64url') },
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendFormattedLoyaltyEmail(gmail, { email, ccEmail, name, subject, businessName, heading, intro, details, note }) {
  const recipient = normalizeLoyaltyEmail(email);
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)) {
    throw new Error('A valid loyalty member email is required for notifications.');
  }
  const ccRecipient = normalizeLoyaltyEmail(ccEmail);
  if (ccRecipient && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(ccRecipient)) {
    throw new Error('A valid company contact email is required for notifications.');
  }
  const safeBusinessName = String(businessName || 'MY THAI THAI').replace(/[\r\n"]/g, '');
  const greeting = name ? `Hello ${name},` : 'Hello,';
  const text = [greeting, '', intro, ...details.map(({ label, value }) => `${label}: ${value}`), '', note, '', safeBusinessName].join('\n');
  const detailRows = details.map(({ label, value }) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e8eeeb;color:#64716b">${escapeHtml(label)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #e8eeeb;color:#18251f;font-weight:600">${escapeHtml(value)}</td></tr>`,
  ).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(heading)}</title></head><body style="margin:0;background:#f3f5f4;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#18251f"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(intro)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e2e9e5;border-radius:14px;overflow:hidden"><tr><td style="padding:26px 32px;background:#073d32;color:#fff"><p style="margin:0 0 8px;font-size:12px;letter-spacing:2px">${escapeHtml(safeBusinessName).toUpperCase()}</p><h1 style="margin:0;font-size:24px">${escapeHtml(heading)}</h1></td></tr><tr><td style="padding:28px 32px"><p style="margin:0 0 14px">${escapeHtml(greeting)}</p><p style="margin:0 0 20px;line-height:1.6">${escapeHtml(intro)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${detailRows}</table><p style="margin:22px 0 0;padding:14px;background:#f3f7f5;border-radius:8px;color:#5f6d66;font-size:13px;line-height:1.5">${escapeHtml(note)}</p></td></tr><tr><td style="padding:16px 32px;background:#f8faf9;color:#718078;font-size:12px">${escapeHtml(safeBusinessName)}</td></tr></table></td></tr></table></body></html>`;
  const boundary = `loyalty_${crypto.randomBytes(12).toString('hex')}`;
  const encode = (value) => Buffer.from(value).toString('base64').match(/.{1,76}/g).join('\r\n');
  const raw = [
    `From: "${safeBusinessName}" <${GOOGLE_GMAIL_SENDER_EMAIL}>`,
    `To: ${recipient}`,
    ...(ccRecipient && ccRecipient !== recipient ? [`Cc: ${ccRecipient}`] : []),
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
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url') } });
}

async function sendMembershipEmail(gmail, member, settings, businessProfile, event, companyContactEmail = '') {
  const recipient = normalizeLoyaltyEmail(member.email);
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)) {
    throw new Error('A valid member email is required for membership notifications.');
  }
  const type = String(member.membershipType || 'regular').toLowerCase();
  const plan = settings.membershipPlans[type];
  const title = type === 'gold' ? 'Gold membership' : type === 'platinum' ? 'Platinum company top-up' : type === 'silver' ? 'Silver corporate membership' : 'Points rewards membership';
  const monthlyFee = plan?.monthlyFee || 0;
  const discountPercent = plan?.discountPercent || 0;
  const businessName = businessProfile.businessName || 'MY THAI THAI';
  const details = event === 'topup'
    ? `Your Platinum top-up payment has been recorded. Your prepaid-hour balance is now ${Number(member.hoursBalance || 0).toFixed(2)} hours.`
    : event === 'payment'
    ? `Your ${title} payment has been recorded through ${member.paidThrough}. You are eligible for ${discountPercent}% off eligible services while your membership is active.`
    : type === 'regular'
      ? `You are enrolled in the points rewards program. Earn ${settings.pointsPerDollar} points per $1 actually paid, with ${settings.firstSessionMultiplier}x points on your first single-session purchase. Redeem ${settings.redemptionPoints} points for $${settings.redemptionValue} off.`
      : type === 'platinum'
        ? `Your Platinum company membership has been recorded for ${member.organization || 'your company'}${member.companyId ? ` (company ID ${member.companyId})` : ''}. Each confirmed $${settings.membershipPlans.platinum.topUpPrice} top-up adds ${settings.membershipPlans.platinum.includedHours} prepaid hours. Active benefits include ${settings.membershipPlans.platinum.discountPercent}% off services and $${settings.membershipPlans.platinum.hotStoneDiscount} off each Hot Stone add-on. The owner must confirm each top-up payment before hours are added.`
        : `Your ${title} has been recorded. The monthly fee is $${monthlyFee.toFixed(2)} and the benefit is ${discountPercent}% off services${type === 'gold' ? `, ${plan.pointsMultiplier}x points, and ${plan.freeHotStonePerMonth} free Hot Stone add-on(s) per month` : ` for up to ${settings.membershipPlans.silver.maxEmployees} employees at ${member.organization || 'your organization'}`}. Eligibility is active through ${member.paidThrough || 'only after an owner records payment'}.`;
  const isTopUp = event === 'topup';
  const isPayment = event === 'payment';
  const intro = event === 'welcome' && type === 'platinum'
    ? `Your Platinum company request is recorded for ${member.organization || 'your company'}${member.companyId ? ` (employee/company ID ${member.companyId})` : ''}. The clinic will verify the company and confirm payment before activating hours and booking benefits.`
    : details;
  const emailDetails = isTopUp
    ? [
      { label: 'Top-up payment', value: `$${settings.membershipPlans.platinum.topUpPrice.toFixed(2)}` },
      { label: 'Hours added', value: `${settings.membershipPlans.platinum.includedHours} hours` },
      { label: 'Prepaid-hour balance', value: `${Number(member.hoursBalance || 0).toFixed(2)} hours` },
    ]
    : type === 'platinum'
      ? [
        { label: 'Company', value: member.organization || 'Pending verification' },
        ...(member.companyId ? [{ label: 'Employee/company ID', value: member.companyId }] : []),
        { label: 'Prepaid-hour balance', value: `${Number(member.hoursBalance || 0).toFixed(2)} hours` },
        { label: 'Top-up', value: `$${settings.membershipPlans.platinum.topUpPrice.toFixed(2)} adds ${settings.membershipPlans.platinum.includedHours} hours` },
        { label: 'Benefits after verification/payment', value: `${settings.membershipPlans.platinum.discountPercent}% off services and $${settings.membershipPlans.platinum.hotStoneDiscount.toFixed(2)} off Hot Stone add-ons` },
      ]
      : [{ label: title, value: details }];
  await sendFormattedLoyaltyEmail(gmail, {
    email: member.email,
    ccEmail: ['welcome', 'topup'].includes(event) && type === 'platinum' ? companyContactEmail : '',
    name: member.name,
    subject: isTopUp ? `${businessName} Platinum balance updated` : isPayment ? `${businessName} membership payment recorded` : `${businessName} rewards membership details`,
    businessName,
    heading: isTopUp ? 'Platinum balance updated' : isPayment ? 'Membership payment recorded' : 'Rewards membership details',
    intro,
    details: emailDetails,
    note: 'Membership and top-up payments are recorded by the business and are not automatically charged. Contact the clinic if any details need correction.',
  });
}

async function sendCompanyPortalInviteEmail(gmail, { contactEmail, organization, businessProfile, portalUrl }) {
  const recipient = normalizeLoyaltyEmail(contactEmail);
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)) {
    throw new Error('A valid company contact email is required for the company portal invite.');
  }
  const businessName = businessProfile.businessName || 'MY THAI THAI';
  await sendFormattedLoyaltyEmail(gmail, {
    email: recipient,
    name: organization || 'there',
    subject: `${businessName} Platinum company portal for ${organization}`,
    businessName,
    heading: 'Your company portal is ready',
    intro: `As the primary contact for ${organization}, you can use your company portal to view prepaid-hour balances, see which employees are using their Platinum benefit, and sign up new employees.`,
    details: [{ label: 'Company portal link', value: portalUrl }],
    note: 'Keep this link private — anyone with it can view and manage your company\'s Platinum membership. Contact the clinic if you need a new link.',
  });
}

async function sendCompanyUsageNotificationEmail(gmail, { contactEmail, organization, employeeName, employeeEmail, serviceName, hoursUsed, hoursRemaining, businessProfile, portalUrl }) {
  const recipient = normalizeLoyaltyEmail(contactEmail);
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)) {
    throw new Error('A valid company contact email is required for the usage notification.');
  }
  const businessName = businessProfile.businessName || 'MY THAI THAI';
  await sendFormattedLoyaltyEmail(gmail, {
    email: recipient,
    name: organization || 'there',
    subject: `${businessName} Platinum usage: ${employeeName || employeeEmail}`,
    businessName,
    heading: 'Platinum hours used',
    intro: `${employeeName || employeeEmail} just used prepaid Platinum hours at ${businessName} under ${organization}.`,
    details: [
      { label: 'Employee', value: `${employeeName || 'Employee'} (${employeeEmail})` },
      { label: 'Service', value: serviceName || 'Massage service' },
      { label: 'Hours used', value: `${hoursUsed.toFixed(2)} hours` },
      { label: 'Employee remaining balance', value: `${hoursRemaining.toFixed(2)} hours` },
      ...(portalUrl ? [{ label: 'Company portal link', value: portalUrl }] : []),
    ],
    note: 'You are receiving this because you are the primary contact on file for this company\'s Platinum membership.',
  });
}

async function sendReceiptEmail(gmail, booking, receipt, businessProfile) {
  const recipient = String(booking.email || '').trim();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)) {
    throw new Error('A valid patient email is required to email this receipt');
  }
  const subject = `Receipt ${receipt.number} - ${businessProfile.businessName}`;
  const text = [
    `Receipt ${receipt.number}`,
    businessProfile.businessName,
    '',
    `Client: ${booking.customerName}`,
    `Service: ${booking.serviceName}`,
    `Service date: ${booking.date}`,
    `Payment method: ${booking.paymentOption}`,
    `Subtotal: $${receipt.subtotal.toFixed(2)}`,
    ...(receipt.membershipDiscountAmount > 0
      ? [`${receipt.membershipDiscountLabel} (${receipt.membershipDiscountPercent}%): -$${receipt.membershipDiscountAmount.toFixed(2)}`]
      : []),
    ...(receipt.loyaltyDiscount > 0 ? [`Loyalty discount: -$${receipt.loyaltyDiscount.toFixed(2)}`, `Points redeemed: ${receipt.pointsRedeemed.toLocaleString()}`] : []),
    `${receipt.taxLabel}: $${receipt.tax.toFixed(2)}`,
    `Total paid: $${receipt.total.toFixed(2)}`,
    ...(receipt.packageUsage ? [receipt.packageUsage.description, `Allocated prepaid session value: $${receipt.packageUsage.allocatedTotal.toFixed(2)}; new payment collected: $0.00.`] : []),
    ...(receipt.loyaltyMember ? [`Loyalty points balance: ${receipt.pointsBalance.toLocaleString()} points`] : []),
    '',
    'Thank you for choosing us.',
  ].join('\n');
  const loyaltyRows = receipt.loyaltyDiscount > 0
    ? `<tr><td style="padding:8px 0;color:#64716b">Loyalty discount · ${receipt.pointsRedeemed.toLocaleString()} points</td><td align="right" style="padding:8px 0">-$${receipt.loyaltyDiscount.toFixed(2)}</td></tr>`
    : '';
  const membershipDiscountRow = receipt.membershipDiscountAmount > 0
    ? `<tr><td style="padding:8px 0;color:#64716b">${escapeHtml(receipt.membershipDiscountLabel)} (${receipt.membershipDiscountPercent}%)</td><td align="right" style="padding:8px 0">-$${receipt.membershipDiscountAmount.toFixed(2)}</td></tr>`
    : '';
  const packageBalance = receipt.packageUsage
    ? `<p style="margin:18px 0 0;padding:12px;background:#eff6f3;border-radius:8px;font-size:13px"><strong>Package usage:</strong> ${escapeHtml(receipt.packageUsage.description)}<br>Allocated prepaid session value: $${receipt.packageUsage.allocatedTotal.toFixed(2)}. New payment collected: $0.00.</p>`
    : '';
  const loyaltyBalance = (receipt.loyaltyMember
    ? `<p style="margin:18px 0 0;padding:12px;background:#eff6f3;border-radius:8px;font-size:13px"><strong>Loyalty balance:</strong> ${receipt.pointsBalance.toLocaleString()} points</p>`
    : '') + packageBalance;
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Receipt ${escapeHtml(receipt.number)}</title></head><body style="margin:0;background:#f3f5f4;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#18251f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e2e9e5;border-radius:14px;overflow:hidden"><tr><td style="padding:28px 32px;background:#073d32;color:#fff"><p style="margin:0 0 8px;font-size:12px;letter-spacing:2px">${escapeHtml(businessProfile.businessName).toUpperCase()}</p><h1 style="margin:0;font-size:25px">Payment receipt</h1></td></tr><tr><td style="padding:26px 32px"><p style="margin:0 0 6px;font-weight:bold">${escapeHtml(businessProfile.legalName || businessProfile.businessName)}</p><p style="margin:0 0 4px;color:#66736d">${escapeHtml(businessProfile.address)}</p><p style="margin:0 0 4px;color:#66736d">${escapeHtml(businessProfile.phone)} · ${escapeHtml(businessProfile.email)}</p>${businessProfile.taxRegistrationNumber ? `<p style="margin:0 0 20px;color:#66736d">GST/HST No.: ${escapeHtml(businessProfile.taxRegistrationNumber)}</p>` : '<div style="height:20px"></div>'}<p style="margin:0 0 6px"><strong>Receipt No.</strong> ${escapeHtml(receipt.number)}</p><p style="margin:0 0 22px;color:#66736d">Issued ${escapeHtml(receipt.issuedAt.slice(0, 10))}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td style="padding:10px 0;border-bottom:1px solid #e6ebe8;color:#64716b">Client</td><td align="right" style="padding:10px 0;border-bottom:1px solid #e6ebe8;font-weight:bold">${escapeHtml(booking.customerName)}</td></tr><tr><td style="padding:10px 0;border-bottom:1px solid #e6ebe8;color:#64716b">Email</td><td align="right" style="padding:10px 0;border-bottom:1px solid #e6ebe8">${escapeHtml(booking.email)}</td></tr><tr><td style="padding:10px 0;border-bottom:1px solid #e6ebe8;color:#64716b">Service</td><td align="right" style="padding:10px 0;border-bottom:1px solid #e6ebe8">${escapeHtml(booking.serviceName)}</td></tr><tr><td style="padding:10px 0;border-bottom:1px solid #e6ebe8;color:#64716b">Service date</td><td align="right" style="padding:10px 0;border-bottom:1px solid #e6ebe8">${escapeHtml(booking.date)}</td></tr><tr><td style="padding:10px 0;color:#64716b">Payment method</td><td align="right" style="padding:10px 0">${escapeHtml(booking.paymentOption)}</td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border-top:2px solid #087765"><tr><td style="padding:10px 0;color:#64716b">Subtotal</td><td align="right" style="padding:10px 0">$${receipt.subtotal.toFixed(2)}</td></tr>${membershipDiscountRow}${loyaltyRows}<tr><td style="padding:8px 0;color:#64716b">${escapeHtml(receipt.taxLabel)}</td><td align="right" style="padding:8px 0">$${receipt.tax.toFixed(2)}</td></tr><tr><td style="padding:14px 0;border-top:1px solid #d8e2dc;font-size:18px;font-weight:bold">Total paid</td><td align="right" style="padding:14px 0;border-top:1px solid #d8e2dc;font-size:18px;font-weight:bold">$${receipt.total.toFixed(2)}</td></tr></table>${loyaltyBalance}<p style="margin:24px 0 0;text-align:center;color:#64716b">Thank you for choosing ${escapeHtml(businessProfile.businessName)}.</p></td></tr></table></td></tr></table></body></html>`;
  const boundary = `receipt_${crypto.randomBytes(12).toString('hex')}`;
  const encode = (value) => Buffer.from(value).toString('base64').match(/.{1,76}/g).join('\r\n');
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
    encode(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encode(html),
    `--${boundary}--`,
  ].join('\r\n');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(message).toString('base64url') } });
}

async function sendLoyaltyRedemptionEmail(gmail, member, redemption, businessProfile) {
  await sendFormattedLoyaltyEmail(gmail, {
    email: member.email,
    name: member.name,
    subject: `${businessProfile.businessName} rewards redemption confirmation`,
    businessName: businessProfile.businessName,
    heading: 'Rewards redemption confirmed',
    intro: `You redeemed ${redemption.points.toLocaleString()} points for $${redemption.rewardValue.toFixed(2)} off your purchase.`,
    details: [
      { label: 'Booking', value: redemption.bookingId },
      { label: 'Points remaining', value: redemption.pointsBalance.toLocaleString() },
      { label: 'Remaining reward value', value: `$${redemption.balanceValue.toFixed(2)}` },
      { label: 'Receipt number', value: 'Pending receipt issuance' },
    ],
    note: 'The discount is linked to this booking and will appear on the receipt when the clinic issues it.',
  });
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
    const maxLength = field === 'photoUrl' ? 2048 : 250;
    if (profile[field].length > maxLength) {
      throw new Error(`${field} must be ${maxLength} characters or fewer`);
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
  if (profile.photoUrl) {
    let photoUrl;
    try {
      photoUrl = new URL(profile.photoUrl);
    } catch {
      throw new Error('Business photo URL must be a valid https:// or http:// URL');
    }
    if (!['http:', 'https:'].includes(photoUrl.protocol)) {
      throw new Error('Business photo URL must use https:// or http://');
    }
    if (photoUrl.username || photoUrl.password) {
      throw new Error('Business photo URL must not contain login credentials');
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
  const manageUrl = String(payload.manageUrl || '');
  // Customers who already paid online have money at stake, so the refund rule is
  // stated explicitly for them rather than in general terms.
  const paidOnline = Number(payload.paidAmount) > 0;
  const policyLines = [
    paidOnline
      ? `This appointment includes a $${payload.paidAmount} online payment. Cancel at least 24 hours before your appointment time to receive a full refund of that payment. Cancelling less than 24 hours before your appointment does not qualify for a refund.`
      : 'Cancel at least 24 hours before your appointment time for a full refund of any payment made. Cancelling less than 24 hours before your appointment does not qualify for a refund.',
    'Rescheduling is always free and never issues a refund, regardless of timing.',
  ];
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
    payload.membershipDiscountAmount > 0 ? `Membership discount (${payload.membershipDiscountPercent}%): -$${payload.membershipDiscountAmount}` : '',
    `Appointment total: $${payload.totalAmount}`,
    '',
    'Your appointment has been added to the therapist calendar.',
    'Please keep your booking reference for your records.',
    '',
    'CANCELLATION POLICY',
    ...policyLines,
    '',
    ...(manageUrl
      ? ['CANCEL OR RESCHEDULE', 'Manage this appointment at any time here:', manageUrl, `You will be asked for your booking reference (${payload.id}) and this email address.`, '']
      : ['To cancel or reschedule, use the "Manage an existing booking" link on our booking page.', '']),
    'Thank you for choosing MY THAI THAI.',
  ].join('\n');
  const details = [
    ['Booking reference', payload.id],
    ['Service', payload.serviceName],
    ['Therapist', payload.therapistName],
    ['Date', payload.date],
    ['Time', payload.time],
    ['Location', payload.branchName],
    ...(payload.membershipDiscountAmount > 0
      ? [['Membership discount', `${payload.membershipDiscountPercent}% · -$${payload.membershipDiscountAmount}`]]
      : []),
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
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 0;background:#fdf6e7;border:1px solid #f0dfb5;border-radius:10px;">
              <tr><td style="padding:16px 18px;">
                <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#7a5a12;">Cancellation policy</p>
                ${policyLines.map((line) => `<p style="margin:0 0 6px;color:#6b5a33;font-size:13px;line-height:1.6;">${escapeHtml(line)}</p>`).join('')}
              </td></tr>
            </table>
            ${manageUrl ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 0;">
              <tr><td align="center" style="padding:4px 0 10px;">
                <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#31594b;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 26px;border-radius:9px;">Cancel or reschedule this appointment</a>
              </td></tr>
              <tr><td align="center" style="color:#888477;font-size:12px;line-height:1.6;">You will be asked for your booking reference and this email address.<br><a href="${escapeHtml(manageUrl)}" style="color:#31594b;">${escapeHtml(manageUrl)}</a></td></tr>
            </table>` : '<p style="margin:14px 0 0;color:#625f56;font-size:13px;line-height:1.6;">To cancel or reschedule, use the &quot;Manage an existing booking&quot; link on our booking page.</p>'}
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

function squareApiBase() {
  return SQUARE_ENVIRONMENT === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
}

function isSquareConfigured() {
  return Boolean(SQUARE_ACCESS_TOKEN && SQUARE_LOCATION_ID);
}

function isGoogleReviewsConfigured() {
  return Boolean(GOOGLE_PLACES_API_KEY && GOOGLE_PLACE_ID);
}

let cachedGoogleReviews = null;
let cachedGoogleReviewsAt = 0;
const GOOGLE_REVIEWS_CACHE_MS = 10 * 60 * 1000;

async function fetchGoogleReviews() {
  if (!isGoogleReviewsConfigured()) {
    const error = new Error('Google Reviews are not configured yet. Add GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID to enable this.');
    error.statusCode = 503;
    throw error;
  }
  if (cachedGoogleReviews && Date.now() - cachedGoogleReviewsAt < GOOGLE_REVIEWS_CACHE_MS) {
    return cachedGoogleReviews;
  }
  // Uses Places API (New) rather than the legacy `maps.googleapis.com/maps/api/place/details`
  // endpoint, which Google now rejects for projects that only have the new API enabled
  // ("You're calling a legacy API, which is not enabled for your project").
  const placeResourceId = GOOGLE_PLACE_ID.startsWith('places/') ? GOOGLE_PLACE_ID : `places/${GOOGLE_PLACE_ID}`;
  const url = new URL(`https://places.googleapis.com/v1/${placeResourceId}`);
  const response = await fetch(url.toString(), {
    headers: {
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'displayName,rating,userRatingCount,reviews,googleMapsUri',
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error?.message || `Google Places API returned status ${response.status}`;
    const error = new Error(detail);
    error.statusCode = 502;
    throw error;
  }
  const payload = {
    businessName: data.displayName?.text || '',
    rating: data.rating || 0,
    totalRatings: data.userRatingCount || 0,
    reviewUrl: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(GOOGLE_PLACE_ID)}`,
    mapsUrl: data.googleMapsUri || '',
    reviews: (data.reviews || []).map((review) => ({
      authorName: review.authorAttribution?.displayName || 'Google user',
      authorPhotoUrl: review.authorAttribution?.photoUri || '',
      authorUrl: review.authorAttribution?.uri || '',
      rating: review.rating || 0,
      relativeTime: review.relativePublishTimeDescription || '',
      time: review.publishTime ? new Date(review.publishTime).getTime() : null,
      text: review.text?.text || review.originalText?.text || '',
    })),
  };
  cachedGoogleReviews = payload;
  cachedGoogleReviewsAt = Date.now();
  return payload;
}

async function squareRequest(method, path, body) {
  const response = await fetch(`${squareApiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
      'Square-Version': SQUARE_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.errors?.[0]?.detail || `Square API returned status ${response.status}`;
    const error = new Error(detail);
    error.statusCode = 502;
    throw error;
  }
  return data;
}

async function squareRefundPayment(paymentId, amountCents, reason) {
  const data = await squareRequest('POST', '/v2/refunds', {
    idempotency_key: crypto.randomUUID(),
    payment_id: paymentId,
    amount_money: { amount: Math.round(amountCents), currency: 'CAD' },
    reason: String(reason || '').slice(0, 190),
  });
  return data?.refund;
}

function getSquareWebhookNotificationUrl(req) {
  if (SQUARE_WEBHOOK_NOTIFICATION_URL) return SQUARE_WEBHOOK_NOTIFICATION_URL;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  return `${protocol}://${host}/api/booking?view=square-webhook`;
}

function isValidSquareWebhookSignature(req, rawBody) {
  if (!SQUARE_WEBHOOK_SIGNATURE_KEY) return false;
  const signature = req.headers['x-square-hmacsha256-signature'];
  if (!signature) return false;
  const notificationUrl = getSquareWebhookNotificationUrl(req);
  const expected = crypto.createHmac('sha256', SQUARE_WEBHOOK_SIGNATURE_KEY)
    .update(notificationUrl + rawBody)
    .digest('base64');
  const provided = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(expected);
  return provided.length === expectedBuffer.length && crypto.timingSafeEqual(provided, expectedBuffer);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Manual body parsing (bodyParser is disabled above): mirrors the previous automatic
  // JSON parsing for every existing view, while keeping the raw text available so the
  // Square webhook handler below can verify its signature against the exact bytes sent.
  let rawRequestBody = '';
  req.body = {};
  if (req.method === 'POST') {
    try {
      rawRequestBody = await readRawBody(req, ['wix-contacts-import', 'wix-bookings-import'].includes(req.query?.view) ? 4 * 1024 * 1024 : Infinity);
    } catch (error) {
      if (error.statusCode !== 413) throw error;
      return res.status(413).json({ message: error.message });
    }
    const contentType = String(req.headers['content-type'] || '');
    if (contentType.includes('application/json') && rawRequestBody) {
      try {
        req.body = JSON.parse(rawRequestBody);
      } catch {
        return res.status(400).json({ message: 'Request body must be valid JSON' });
      }
    }
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
    const packageViews = ['packages', 'package-register', 'package-redeem'];
    const validGetViews = ['', 'calendar', 'patient-history', 'appointment-notes', 'business-profile', 'business-name', 'square-config', 'google-reviews', 'branches', 'services', 'therapists', 'google-ads-report', 'loyalty-program', 'loyalty-dashboard', 'loyalty-eligibility', 'therapist-dashboard', 'therapist-session', 'unsubscribe', 'company-portal', 'company-join', 'find-booking', 'availability', 'unavailability', 'campaign-log', 'campaign-audience-options', 'review-request-audience', 'therapist-accounts', 'wix-contacts'];
    if (req.method === 'GET' && !validGetViews.includes(view) && !['wix-contacts-import', 'wix-bookings-import', ...packageViews].includes(view)) {
      return res.status(404).json({ message: 'Unknown booking view' });
    }
    const ownerOnlyRequest =
      ['wix-contacts', 'wix-contacts-import', 'wix-bookings-import', ...packageViews].includes(view) ||
      (req.method === 'GET' && ['', 'calendar', 'patient-history', 'appointment-notes', 'business-profile', 'google-ads-report', 'loyalty-dashboard', 'google-reviews', 'unavailability', 'campaign-log', 'campaign-audience-options', 'review-request-audience', 'therapist-accounts'].includes(view)) ||
      ['business-profile', 'mark-paid', 'therapist-account-status', 'issue-receipt', 'complete-booking-details', 'delete-booking', 'delete-patient-history', 'appointment-note', 'campaign-audience', 'campaign-generate', 'campaign-send', 'loyalty-settings', 'loyalty-migrate', 'loyalty-member', 'loyalty-remove-member', 'loyalty-remove-company', 'loyalty-clear-ledger', 'loyalty-payment', 'loyalty-topup', 'loyalty-award', 'loyalty-redeem', 'loyalty-set-primary-contact', 'company-portal-link', 'unavailability-delete', 'review-request-send', 'reassign-therapist'].includes(view) ||
      (req.method === 'POST' && ['branches', 'services', 'therapists', 'unavailability'].includes(view));
    if (ownerOnlyRequest) res.setHeader('Cache-Control', 'no-store');
    if (ownerOnlyRequest && !getOwnerSession(req)) {
      return res.status(401).json({ message: 'Owner sign-in required' });
    }
    if (req.method === 'POST' && ['wix-contacts-import', 'wix-bookings-import', ...packageViews].includes(view) && !isSameOriginRequest(req)) {
      return res.status(403).json({ message: 'Wix import origin is not allowed' });
    }
    if (packageViews.includes(view)) {
      if ((view === 'packages' && req.method !== 'GET') || (view !== 'packages' && req.method !== 'POST')) return res.status(405).json({ message: 'Method Not Allowed' });
      const store = createPackageStore(getBigQueryClient(), {
        projectId: BIGQUERY_PROJECT_ID, datasetId: BIGQUERY_DATASET_ID,
        tableId: process.env.BIGQUERY_PACKAGES_TABLE || 'session_packages',
        bookingsTableId: BIGQUERY_BOOKINGS_TABLE, loyaltyTableId: LOYALTY_TABLE_NAMES.LoyaltyLedger,
        forbiddenTables: [BIGQUERY_PATIENT_HISTORY_TABLE, BIGQUERY_PATIENT_HISTORY_MIGRATIONS_TABLE, BIGQUERY_SQUARE_PAYMENTS_TABLE, BIGQUERY_CAMPAIGN_LOG_TABLE, BIGQUERY_CAMPAIGN_RECIPIENTS_TABLE, process.env.BIGQUERY_WIX_CONTACTS_TABLE || 'wix_contacts', ...Object.values(LOYALTY_TABLE_NAMES)],
      });
      if (view === 'packages') return res.status(200).json(await store.list({ search: req.query?.search || '', offset: Number(req.query?.offset || 0) }));
      if (view === 'package-register') return res.status(200).json(await store.register(req.body));
      return res.status(200).json(await store.redeem({
        packageId: req.body?.packageId, bookingId: req.body?.bookingId,
        isCompleted: (booking) => isAppointmentCompleteByTime(booking.date, booking.time, booking.duration_minutes),
      }));
    }
    if (view === 'wix-bookings-import') {
      if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
      let prepared = prepareWixBookings(req.body?.csv, { timeZone: CALENDAR_TIME_ZONE });
      if (req.body?.preview !== true && req.body?.confirmPaid !== true) {
        return res.status(400).json({ message: 'Confirm historical payment and review current catalogue prices before importing.' });
      }
      if (req.body?.priceMappings !== undefined || req.body?.preview !== true) {
        const pricingAuth = new google.auth.GoogleAuth({
          credentials: { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const catalogue = await getServices(google.sheets({ version: 'v4', auth: pricingAuth }));
        prepared = applyWixCataloguePrices(prepared, catalogue, req.body?.priceMappings, req.body?.preview !== true);
      } else {
        prepared = applyWixCataloguePrices(prepared, [], []);
      }
      if (req.body?.therapistMappings !== undefined && (!Array.isArray(req.body.therapistMappings) || req.body.therapistMappings.length)) {
        const therapistAuth = new google.auth.GoogleAuth({
          credentials: { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const therapists = await getTherapists(google.sheets({ version: 'v4', auth: therapistAuth }));
        prepared = applyWixTherapistMappings(prepared, therapists, req.body.therapistMappings);
      } else {
        prepared = applyWixTherapistMappings(prepared, []);
      }
      if (req.body?.preview === true) {
        return res.status(200).json({ ...prepared.summary, sample: prepared.bookings.slice(0, 5) });
      }
      if (!prepared.bookings.length) {
        return res.status(400).json({ message: 'No valid historical bookings to import. Correct the skipped rows and preview again.', ...prepared.summary });
      }
      const counts = await importWixBookings(getBigQueryClient(), prepared.bookings, {
        projectId: BIGQUERY_PROJECT_ID, datasetId: BIGQUERY_DATASET_ID,
        tableId: BIGQUERY_BOOKINGS_TABLE, fields: BOOKING_TABLE_FIELDS, reviewedPaid: true,
      });
      return res.status(200).json({ ...prepared.summary, ...counts, existing: prepared.bookings.length - counts.imported - counts.updated });
    }
    if (view === 'wix-contacts' || view === 'wix-contacts-import') {
      if ((view === 'wix-contacts' && req.method !== 'GET') || (view === 'wix-contacts-import' && req.method !== 'POST')) {
        return res.status(405).json({ message: 'Method Not Allowed' });
      }
      const prepared = view === 'wix-contacts-import' ? prepareWixContacts(req.body?.csv) : null;
      if (prepared && req.body?.preview === true) {
        return res.status(200).json({ ...prepared.summary, sample: prepared.contacts.slice(0, 5) });
      }
      if (prepared && !prepared.contacts.length) {
        return res.status(400).json({ message: 'No valid contacts to import. Correct the skipped rows and preview again.', ...prepared.summary });
      }
      const store = createWixContactStore(getBigQueryClient(), {
        projectId: BIGQUERY_PROJECT_ID,
        datasetId: BIGQUERY_DATASET_ID,
        tableId: process.env.BIGQUERY_WIX_CONTACTS_TABLE || 'wix_contacts',
        forbiddenTables: [
          BIGQUERY_BOOKINGS_TABLE, BIGQUERY_PATIENT_HISTORY_TABLE, BIGQUERY_PATIENT_HISTORY_MIGRATIONS_TABLE,
          BIGQUERY_SQUARE_PAYMENTS_TABLE, BIGQUERY_CAMPAIGN_LOG_TABLE, BIGQUERY_CAMPAIGN_RECIPIENTS_TABLE,
          ...Object.values(LOYALTY_TABLE_NAMES),
        ],
      });
      if (!prepared) {
        return res.status(200).json(await store.list({
          search: req.query?.search || '',
          offset: Number(req.query?.offset || 0),
        }));
      }
      const imported = await store.importContacts(prepared.contacts);
      return res.status(200).json({ ...prepared.summary, imported, existing: prepared.contacts.length - imported });
    }
    if (['business-profile', 'branches', 'services', 'therapists', 'therapist-account-status', 'mark-paid', 'issue-receipt', 'complete-booking-details', 'delete-booking', 'delete-patient-history', 'appointment-note', 'campaign-audience', 'campaign-generate', 'campaign-send', 'loyalty-settings', 'loyalty-migrate', 'loyalty-member', 'loyalty-remove-member', 'loyalty-remove-company', 'loyalty-clear-ledger', 'loyalty-payment', 'loyalty-topup', 'loyalty-award', 'loyalty-redeem', 'loyalty-set-primary-contact', 'company-portal-signup', 'company-portal-bulk-signup', 'company-join-signup', 'company-portal-link', 'square-create-checkout', 'cancel-booking', 'reschedule-booking', 'unavailability', 'unavailability-delete', 'review-request-send', 'reassign-therapist'].includes(view) && req.method === 'POST' && !isSameOriginRequest(req)) {
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

    if (req.method === 'GET' && view === 'business-name') {
      res.setHeader('Cache-Control', 'no-store');
      const businessProfile = await getBusinessProfile(sheets);
      return res.status(200).json({
        businessName: businessProfile.businessName,
        photoUrl: businessProfile.photoUrl,
      });
    }

    if (req.method === 'GET' && view === 'square-config') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ enabled: isSquareConfigured() });
    }

    if (req.method === 'GET' && view === 'google-reviews') {
      res.setHeader('Cache-Control', 'no-store');
      if (!isGoogleReviewsConfigured()) {
        return res.status(200).json({ enabled: false });
      }
      const reviews = await fetchGoogleReviews();
      return res.status(200).json({ enabled: true, ...reviews });
    }

    if (req.method === 'GET' && view === 'review-request-audience') {
      res.setHeader('Cache-Control', 'no-store');
      if (!isGoogleReviewsConfigured()) {
        return res.status(200).json({ enabled: false, candidates: [] });
      }
      const bigquery = getBigQueryClient();
      const [{ candidates, stats }, businessProfile] = await Promise.all([
        collectReviewRequestCandidates(sheets, bigquery),
        getBusinessProfile(sheets),
      ]);
      const sendBlockReason = getCampaignSendBlockReason(businessProfile);
      return res.status(200).json({
        enabled: true,
        candidates,
        stats,
        cooldownDays: REVIEW_REQUEST_COOLDOWN_DAYS,
        lookbackDays: REVIEW_REQUEST_LOOKBACK_DAYS,
        maxRecipients: REVIEW_REQUEST_MAX_RECIPIENTS,
        senderEmail: MARKETING_SENDER_EMAIL,
        sendReady: !sendBlockReason,
        sendBlockReason,
      });
    }

    if (req.method === 'POST' && view === 'review-request-send') {
      if (!isGoogleReviewsConfigured()) {
        return res.status(409).json({ message: 'Connect Google Reviews before sending review requests.' });
      }
      const requested = Array.isArray(req.body?.emails) ? req.body.emails : [];
      const selected = new Set(
        requested.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean),
      );
      if (!selected.size) {
        return res.status(400).json({ message: 'Select at least one customer to ask for a review.' });
      }
      if (selected.size > REVIEW_REQUEST_MAX_RECIPIENTS) {
        return res.status(409).json({ message: `Review requests are limited to ${REVIEW_REQUEST_MAX_RECIPIENTS} customers at a time.` });
      }
      const bigquery = getBigQueryClient();
      const [{ candidates }, businessProfile, reviews] = await Promise.all([
        collectReviewRequestCandidates(sheets, bigquery),
        getBusinessProfile(sheets),
        fetchGoogleReviews(),
      ]);
      const sendBlockReason = getCampaignSendBlockReason(businessProfile);
      if (sendBlockReason) return res.status(409).json({ message: sendBlockReason });
      // Only addresses that are still valid past visitors and not unsubscribed
      // may be emailed, regardless of what the client submitted.
      const recipients = candidates.filter((candidate) => selected.has(candidate.email) && !candidate.unsubscribed);
      if (!recipients.length) {
        return res.status(409).json({ message: 'None of the selected customers can be emailed right now. Refresh the list and try again.' });
      }
      const gmail = createGmailApi();
      const requestedAt = new Date().toISOString();
      const results = { sent: 0, failed: 0 };
      const logged = [];
      for (const candidate of recipients) {
        try {
          await sendReviewRequestEmail(gmail, { candidate, reviewUrl: reviews.reviewUrl, businessProfile });
          results.sent += 1;
          logged.push({ email: candidate.email, name: candidate.name, bookingId: candidate.bookingId, requestedAt });
        } catch (error) {
          results.failed += 1;
          console.error('Review request delivery failed:', error.message || error);
        }
      }
      try {
        await recordReviewRequests(sheets, logged);
      } catch (error) {
        console.error('Review request log write failed:', error.message || error);
      }
      return res.status(200).json({ ...results, skipped: selected.size - recipients.length });
    }

    if (req.method === 'GET' && view === 'branches') {
      res.setHeader('Cache-Control', 'no-store');
      const branches = await getBranches(sheets);
      return res.status(200).json({ branches });
    }

    if (req.method === 'POST' && view === 'branches') {
      try {
        const branches = await saveBranches(sheets, req.body?.branches);
        return res.status(200).json({ branches });
      } catch (validationError) {
        return res.status(400).json({ message: validationError.message || 'Unable to save branches' });
      }
    }

    if (req.method === 'GET' && view === 'services') {
      res.setHeader('Cache-Control', 'no-store');
      const services = await getServices(sheets);
      return res.status(200).json({ services });
    }

    if (req.method === 'POST' && view === 'services') {
      try {
        const services = await saveServices(sheets, req.body?.services);
        return res.status(200).json({ services });
      } catch (validationError) {
        return res.status(400).json({ message: validationError.message || 'Unable to save services' });
      }
    }

    if (req.method === 'GET' && view === 'therapists') {
      res.setHeader('Cache-Control', 'no-store');
      const therapists = await getTherapists(sheets);
      return res.status(200).json({ therapists });
    }

    if (req.method === 'POST' && view === 'therapists') {
      try {
        const therapists = await saveTherapists(sheets, req.body?.therapists);
        return res.status(200).json({ therapists });
      } catch (validationError) {
        return res.status(400).json({ message: validationError.message || 'Unable to save therapists' });
      }
    }

    if (req.method === 'GET' && view === 'availability') {
      res.setHeader('Cache-Control', 'no-store');
      const date = String(req.query?.date || '').trim();
      const branchName = String(req.query?.branch || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: 'A valid date is required' });
      }
      const blocks = (await getUnavailabilityBlocks(sheets))
        .filter((block) => block.date === date)
        .filter((block) => block.scope !== 'business' || !branchName || !block.branchName || block.branchName === branchName)
        .map((block) => ({
          scope: block.scope,
          branchName: block.branchName,
          therapistName: block.therapistName,
          startTime: block.startTime,
          endTime: block.endTime,
          reason: block.reason,
        }));
      return res.status(200).json({ date, blocks });
    }

    if (req.method === 'GET' && view === 'unavailability') {
      res.setHeader('Cache-Control', 'no-store');
      const blocks = await getUnavailabilityBlocks(sheets);
      return res.status(200).json({ blocks: blocks.sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`)) });
    }

    if (req.method === 'POST' && view === 'unavailability') {
      const scope = req.body?.scope === 'therapist' ? 'therapist' : 'business';
      const branchName = String(req.body?.branchName || '').trim();
      const therapistName = String(req.body?.therapistName || '').trim();
      const date = String(req.body?.date || '').trim();
      const startTime = String(req.body?.startTime || '').trim();
      const endTime = String(req.body?.endTime || '').trim();
      const reason = String(req.body?.reason || '').trim().slice(0, 500);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: 'Choose a valid date' });
      }
      if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) {
        return res.status(400).json({ message: 'Choose a valid start and end time (end must be after start)' });
      }
      if (scope === 'therapist' && !therapistName) {
        return res.status(400).json({ message: 'Choose which therapist this block applies to' });
      }
      await ensureUnavailabilitySheet(sheets);
      const block = {
        id: crypto.randomUUID(),
        scope,
        branchName: scope === 'business' ? branchName : '',
        therapistName: scope === 'therapist' ? therapistName : '',
        date,
        startTime,
        endTime,
        reason,
        createdBy: 'owner',
        createdAt: new Date().toISOString(),
      };
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: 'Unavailability!A:J',
        valueInputOption: 'RAW',
        requestBody: { values: [[
          block.id, block.scope, block.branchName, block.therapistName, block.date, block.startTime, block.endTime, block.reason, block.createdBy, block.createdAt,
        ]] },
      });
      return res.status(201).json({ block });
    }

    if (req.method === 'POST' && view === 'unavailability-delete') {
      const id = String(req.body?.id || '').trim();
      if (!id) return res.status(400).json({ message: 'A block ID is required' });
      const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
      const result = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Unavailability!A:J' });
      const rows = result.data.values || [];
      const startIndex = rows[0]?.[0] === 'Block ID' ? 1 : 0;
      const rowIndex = rows.findIndex((row, index) => index >= startIndex && row[0] === id);
      if (rowIndex < 0) return res.status(404).json({ message: 'Block was not found' });
      await deleteSheetRows(sheets, 'Unavailability', [rowIndex + 1]);
      return res.status(200).json({ deleted: true, id });
    }

    if (req.method === 'POST' && view === 'therapist-unavailability') {
      if (!isSameOriginRequest(req)) {
        return res.status(403).json({ message: 'Request origin is not allowed' });
      }
      const session = getTherapistSession(req);
      if (!session) return res.status(401).json({ message: 'Therapist sign-in required' });
      const date = String(req.body?.date || '').trim();
      const startTime = String(req.body?.startTime || '').trim();
      const endTime = String(req.body?.endTime || '').trim();
      const reason = String(req.body?.reason || '').trim().slice(0, 500);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: 'Choose a valid date' });
      }
      if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) {
        return res.status(400).json({ message: 'Choose a valid start and end time (end must be after start)' });
      }
      const accountsResult = await sheets.spreadsheets.values.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistAccounts!A:F',
      }).catch(() => ({ data: { values: [] } }));
      const sheetAccount = (accountsResult.data.values || []).slice(1)
        .map((row) => ({ id: row[0], name: row[2], status: row[4] }))
        .find((item) => item.id === session.therapistId && item.status === 'approved');
      const account = sheetAccount || getTherapistAccounts().find((item) => item.id === session.therapistId);
      if (!account) return res.status(401).json({ message: 'Therapist account is not available' });
      await ensureUnavailabilitySheet(sheets);
      const block = {
        id: crypto.randomUUID(),
        scope: 'therapist',
        branchName: '',
        therapistName: account.name,
        date,
        startTime,
        endTime,
        reason,
        createdBy: account.name,
        createdAt: new Date().toISOString(),
      };
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: 'Unavailability!A:J',
        valueInputOption: 'RAW',
        requestBody: { values: [[
          block.id, block.scope, block.branchName, block.therapistName, block.date, block.startTime, block.endTime, block.reason, block.createdBy, block.createdAt,
        ]] },
      });
      return res.status(201).json({ block });
    }

    if (req.method === 'POST' && view === 'therapist-unavailability-delete') {
      if (!isSameOriginRequest(req)) {
        return res.status(403).json({ message: 'Request origin is not allowed' });
      }
      const session = getTherapistSession(req);
      if (!session) return res.status(401).json({ message: 'Therapist sign-in required' });
      const id = String(req.body?.id || '').trim();
      if (!id) return res.status(400).json({ message: 'A block ID is required' });
      const accountsResult = await sheets.spreadsheets.values.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistAccounts!A:F',
      }).catch(() => ({ data: { values: [] } }));
      const sheetAccount = (accountsResult.data.values || []).slice(1)
        .map((row) => ({ id: row[0], name: row[2], status: row[4] }))
        .find((item) => item.id === session.therapistId && item.status === 'approved');
      const account = sheetAccount || getTherapistAccounts().find((item) => item.id === session.therapistId);
      if (!account) return res.status(401).json({ message: 'Therapist account is not available' });
      const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
      const result = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Unavailability!A:J' });
      const rows = result.data.values || [];
      const startIndex = rows[0]?.[0] === 'Block ID' ? 1 : 0;
      const rowIndex = rows.findIndex((row, index) => index >= startIndex && row[0] === id && row[3] === account.name);
      if (rowIndex < 0) return res.status(404).json({ message: 'Block was not found for your account' });
      await deleteSheetRows(sheets, 'Unavailability', [rowIndex + 1]);
      return res.status(200).json({ deleted: true, id });
    }

    if (req.method === 'GET' && view === 'loyalty-program') {
      res.setHeader('Cache-Control', 'no-store');
      const settings = await getPublicLoyaltySettings();
      return res.status(200).json({
        enabled: settings.enabled,
        pointsPerDollar: settings.pointsPerDollar,
        firstSessionMultiplier: settings.firstSessionMultiplier,
        redemptionPoints: settings.redemptionPoints,
        redemptionValue: settings.redemptionValue,
        membershipPlans: settings.membershipPlans,
        tiers: settings.tiers,
      });
    }

    if (req.method === 'GET' && view === 'loyalty-eligibility') {
      res.setHeader('Cache-Control', 'no-store');
      const email = normalizeLoyaltyEmail(req.query.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'Enter a valid email address to check membership eligibility.' });
      }
      const settings = await getPublicLoyaltySettings();
      const benefit = settings.enabled ? await getMemberBenefit(sheets, email, settings) : null;
      return res.status(200).json({
        eligible: Boolean(benefit),
        membershipType: benefit?.type || '',
        discountPercent: benefit?.discountPercent || 0,
        pointsMultiplier: benefit?.pointsMultiplier || 1,
        freeHotStonePerMonth: benefit?.freeHotStonePerMonth || 0,
        freeHotStoneAvailable: Boolean(benefit?.freeHotStoneAvailable),
        hotStoneDiscount: benefit?.hotStoneDiscount || 0,
        hotStoneSurcharge: benefit?.hotStoneSurcharge || 0,
        hoursBalance: benefit?.hoursBalance || 0,
      });
    }

    if (req.method === 'GET' && view === 'loyalty-dashboard') {
      res.setHeader('Cache-Control', 'no-store');
      const settings = await getLoyaltySettings();
      const bigquery = getBigQueryClient();
      const [membersResult, ledgerResult, bookingsResult] = await Promise.all([
        bqLoyaltyValuesGet('LoyaltyMembers!A:K'),
        bqLoyaltyValuesGet('LoyaltyLedger!A:J'),
        bqFetchBookingRows(bigquery),
      ]);
      const memberRows = (membersResult.data.values || []).slice(1).filter((row) => row[0]);
      const ledgerRows = (ledgerResult.data.values || []).slice(1).filter((row) => row[0]);
      const transactions = ledgerRows.map((row) => ({
        id: row[0] || '',
        email: normalizeLoyaltyEmail(row[1]),
        bookingId: row[2] || '',
        type: row[3] || '',
        points: Number(row[4]) || 0,
        rewardValue: Number(row[5]) || 0,
        description: row[6] || '',
        createdAt: row[7] || '',
        hours: Number(row[8]) || 0,
        receiptNumber: row[9] || '',
      }));
      const transactionByEmail = new Map();
      transactions.forEach((transaction) => {
        const existing = transactionByEmail.get(transaction.email) || [];
        existing.push(transaction);
        transactionByEmail.set(transaction.email, existing);
      });
      const getTier = (lifetimePoints) => settings.tiers
        .filter((tier) => lifetimePoints >= tier.threshold)
        .at(-1)?.name || settings.tiers[0].name;
      const bookingRows = bookingsResult.data.values || [];
      const bookingDataRows = bookingRows[0]?.[0] === 'Booking ID' ? bookingRows.slice(1) : bookingRows;
      const redemptionsByBooking = new Set(transactions
        .filter((transaction) => transaction.type === 'REDEEM' && transaction.bookingId)
        .map((transaction) => `${transaction.email}:${transaction.bookingId}`));
      const members = memberRows.map((row) => {
        const email = normalizeLoyaltyEmail(row[0]);
        const memberTransactions = transactionByEmail.get(email) || [];
        const lifetimePoints = memberTransactions
          .filter((transaction) => transaction.type === 'EARN')
          .reduce((sum, transaction) => sum + Math.max(0, transaction.points), 0);
        const pointsBalance = memberTransactions.reduce((sum, transaction) => sum + transaction.points, 0);
        const membershipType = String(row[5] || 'regular').toLowerCase();
        // Platinum's prepaid-hour balance is shared across the whole company, funded only by the
        // primary owner/contact's top-ups, so it is computed org-wide rather than per employee.
        const hoursBalance = membershipType === 'platinum'
          ? loyaltyPlatinumHoursBalance(memberRows, ledgerRows, row[6], email)
          : memberTransactions.reduce((sum, transaction) => sum + transaction.hours, 0);
        const membershipActive = membershipType === 'platinum'
          ? hoursBalance > 0
          : isMembershipActive(row);
        const freeHotStoneUsedThisMonth = memberTransactions.filter((transaction) =>
          transaction.type === 'HOTSTONE' &&
          loyaltyMonthForDate(transaction.createdAt) === currentLoyaltyMonth(),
        ).length;
        return {
          email,
          name: row[1] || '',
          phone: row[2] || '',
          enrolledAt: row[3] || '',
          membershipType,
          organization: row[6] || '',
          paidThrough: row[7] || '',
          companyId: row[8] || '',
          companyContactEmail: row[9] || '',
          isPrimaryContact: isPrimaryContactFlag(row[10]),
          prepaidHoursBalance: hoursBalance,
          membershipActive,
          membershipDiscountPercent: membershipActive
            ? settings.membershipPlans[membershipType]?.discountPercent || 0
            : 0,
          freeHotStoneUsedThisMonth,
          freeHotStoneAvailable: membershipType === 'gold' && membershipActive &&
            freeHotStoneUsedThisMonth < settings.membershipPlans.gold.freeHotStonePerMonth,
          pointsBalance,
          lifetimePoints,
          tier: getTier(lifetimePoints),
          receiptCandidates: bookingDataRows.filter((booking) =>
            normalizeLoyaltyEmail(booking[3]) === email &&
            String(booking[0] || '') &&
            !booking[18] &&
            (Number(booking[11]) || 0) > 0 &&
            (Number(booking[10]) || 0) + 0.005 >= (Number(booking[11]) || 0) &&
            !redemptionsByBooking.has(`${email}:${String(booking[0])}`),
          ).map((booking) => ({
            bookingId: String(booking[0]),
            serviceName: booking[5] || '',
            date: booking[7] || '',
            total: Number(booking[11]) || 0,
          })),
          transactions: memberTransactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
        };
      });
      const membersByEmail = new Map(members.map((member) => [member.email, member]));
      const earnedBookingIds = new Set(transactions.filter((item) => item.type === 'EARN' && item.bookingId).map((item) => `${item.email}:${item.bookingId}`));
      const usedBookingIds = new Set(transactions.filter((item) => item.type === 'USE' && item.bookingId).map((item) => `${item.email}:${item.bookingId}`));
      const hotStoneBookingIds = new Set(transactions.filter((item) => item.type === 'HOTSTONE' && item.bookingId).map((item) => `${item.email}:${item.bookingId}`));
      const firstSessionBookingByEmail = new Map(members.map((member) => [
        member.email,
        getFirstPaidSingleSessionBookingId(bookingDataRows, member.email),
      ]));
      const customerDirectory = new Map();
      bookingDataRows.forEach((row) => {
        const email = normalizeLoyaltyEmail(row[3]);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
        const previous = customerDirectory.get(email) || {};
        customerDirectory.set(email, {
          email,
          name: String(row[1] || previous.name || '').trim(),
          phone: String(row[2] || previous.phone || '').trim(),
        });
      });
      const eligibleBookings = bookingDataRows.filter((row) => {
        if (String(row[0] || '').startsWith('WIX-')) return false;
        if (readPackageUsage(row[14])) return false;
        const email = normalizeLoyaltyEmail(row[3]);
        const total = Number(row[11]) || 0;
        const paidAmount = Number(row[10]) || 0;
        const member = membersByEmail.get(email);
        const bookingKey = `${email}:${String(row[0] || '')}`;
        const durationMinutes = Number(row[12]) || 60;
        const hasPlatinumHours = member?.membershipType === 'platinum' &&
          member.prepaidHoursBalance > 0;
        const freeHotStone = member?.membershipType === 'gold' &&
          member.freeHotStoneAvailable &&
          String(row[5] || '').toLowerCase().includes('hot stone add-on');
        const fullyPaid = total > 0 && paidAmount + 0.005 >= total;
        return email && member && isAppointmentCompleteByTime(row[7], row[8], durationMinutes) &&
          !earnedBookingIds.has(bookingKey) && !usedBookingIds.has(bookingKey) && !hotStoneBookingIds.has(bookingKey) &&
          (hasPlatinumHours || freeHotStone || (fullyPaid && paidAmount > 0));
      }).map((row) => {
        const email = normalizeLoyaltyEmail(row[3]);
        const member = membersByEmail.get(email);
        const bookingId = String(row[0] || '');
        const durationMinutes = Number(row[12]) || 60;
        const hoursToUse = member.membershipType === 'platinum' &&
          member.prepaidHoursBalance > 0
          ? Math.min(member.prepaidHoursBalance, durationMinutes / 60)
          : 0;
        const freeHotStone = member.membershipType === 'gold' &&
          member.freeHotStoneAvailable &&
          String(row[5] || '').toLowerCase().includes('hot stone add-on');
        const firstSession = firstSessionBookingByEmail.get(email) === bookingId;
        const plan = settings.membershipPlans[member.membershipType];
        const pointsMultiplier = firstSession
          ? settings.firstSessionMultiplier
          : member.membershipActive && member.membershipType === 'gold'
            ? plan.pointsMultiplier
            : 1;
        const paidAmount = Number(row[10]) || 0;
        const points = paidAmount > 0 && (Number(row[11]) || 0) > 0 && paidAmount + 0.005 >= Number(row[11])
          ? Math.floor(paidAmount * settings.pointsPerDollar * pointsMultiplier)
          : 0;
        return {
          id: bookingId,
          email,
          customerName: row[1] || '',
          date: row[7] || '',
          serviceName: row[5] || '',
          paidAmount,
          points,
          pointsMultiplier,
          firstSession,
          hoursToUse,
          freeHotStone,
        };
      })
        .sort((a, b) => b.date.localeCompare(a.date));
      return res.status(200).json({
        settings,
        members: members.sort((a, b) => a.name.localeCompare(b.name)),
        eligibleBookings,
        customerDirectory: [...customerDirectory.values()]
          .filter((customer) => !membersByEmail.has(customer.email))
          .sort((a, b) => a.name.localeCompare(b.name)),
        summary: {
          members: members.length,
          availablePoints: members.reduce((sum, member) => sum + member.pointsBalance, 0),
          pendingVisits: eligibleBookings.length,
        },
      });
    }

    if (req.method === 'POST' && view === 'loyalty-migrate') {
      await ensureLoyaltyTables();
      // Only tables that are still empty are filled, so re-running this is safe.
      const imported = await importLoyaltySheetData(getBigQueryClient());
      return res.status(200).json({ imported });
    }

    if (req.method === 'POST' && view === 'loyalty-settings') {
      const settings = validateLoyaltySettings(req.body?.settings);
      await ensureLoyaltyTables();
      await bqLoyaltyValuesUpdate('LoyaltySettings!A2:B2', [[JSON.stringify(settings), new Date().toISOString()]]);
      return res.status(200).json({ settings });
    }

    if (req.method === 'POST' && view === 'loyalty-member') {
      const email = normalizeLoyaltyEmail(req.body?.email);
      const name = String(req.body?.name || '').trim().slice(0, 120);
      const phone = String(req.body?.phone || '').trim().slice(0, 50);
      const membershipType = String(req.body?.membershipType || '').toLowerCase();
      const organization = String(req.body?.organization || '').trim().slice(0, 120);
      const paidThrough = String(req.body?.paidThrough || '').trim();
      const companyId = String(req.body?.companyId || '').trim().slice(0, 120);
      let companyContactEmail = normalizeLoyaltyEmail(req.body?.companyContactEmail);
      const initialTopUpPaid = req.body?.initialTopUpPaid === true;
      const isPrimaryOwner = membershipType === 'platinum' && req.body?.isPrimaryOwner === true;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !['regular', 'gold', 'platinum', 'silver'].includes(membershipType)) {
        return res.status(400).json({ message: 'Enter a valid email, member name, and membership type.' });
      }
      if (['silver', 'platinum'].includes(membershipType) && !organization) {
        return res.status(400).json({ message: 'Enter the company name for a corporate member.' });
      }
      if (companyContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyContactEmail)) {
        return res.status(400).json({ message: 'Enter a valid company contact email address.' });
      }
      if (initialTopUpPaid && membershipType !== 'platinum') {
        return res.status(400).json({ message: 'An initial top-up can only be recorded for a Platinum member.' });
      }
      if (paidThrough && !isValidMembershipDate(paidThrough)) {
        return res.status(400).json({ message: 'Paid-through date must be a valid YYYY-MM-DD date.' });
      }
      const settings = await getLoyaltySettings();
      if (!settings.enabled) return res.status(409).json({ message: 'The loyalty program is currently paused.' });
      await ensureLoyaltyTables();
      const membersResult = await bqLoyaltyValuesGet('LoyaltyMembers!A:K');
      const rows = membersResult.data.values || [];
      const existingIndex = rows.findIndex((row, index) => index > 0 && normalizeLoyaltyEmail(row[0]) === email);
      if (membershipType === 'platinum' && !companyContactEmail) {
        companyContactEmail = normalizeLoyaltyEmail(rows.slice(1).find((row) =>
          String(row[5] || '').toLowerCase() === 'platinum' &&
          String(row[6] || '').trim().toLowerCase() === organization.toLowerCase() &&
          row[9],
        )?.[9]);
      }
      if (membershipType === 'platinum' && initialTopUpPaid && !isPrimaryOwner) {
        const existingPrimary = rows.slice(1).find((row) =>
          String(row[5] || '').toLowerCase() === 'platinum' &&
          normalizeOrganizationKey(row[6]) === normalizeOrganizationKey(organization) &&
          isPrimaryContactFlag(row[10]),
        );
        const primaryHint = existingPrimary ? ` This company's primary contact on file is ${existingPrimary[1] || existingPrimary[0]}.` : '';
        return res.status(400).json({ message: `Only the company's primary owner/contact can receive a Platinum top-up.${primaryHint} Check "Primary owner/contact" to designate this person, or record the top-up on the existing primary contact instead.` });
      }
      if (membershipType === 'silver') {
        const employeeCount = rows.slice(1).filter((row, index) =>
          index + 1 !== existingIndex &&
          String(row[5] || '').toLowerCase() === 'silver' &&
          String(row[6] || '').trim().toLowerCase() === organization.toLowerCase(),
        ).length;
        if (employeeCount >= settings.membershipPlans.silver.maxEmployees) {
          return res.status(409).json({ message: `This corporate plan is limited to ${settings.membershipPlans.silver.maxEmployees} employees.` });
        }
      }
      const now = new Date().toISOString();
      const existing = existingIndex >= 1 ? rows[existingIndex] : [];
      const member = {
        email,
        name,
        phone,
        enrolledAt: existing[3] || now,
        membershipType,
        organization: ['silver', 'platinum'].includes(membershipType) ? organization : '',
        paidThrough: membershipType === 'regular' ? '' : paidThrough,
        companyId: membershipType === 'platinum' ? companyId : '',
        companyContactEmail: membershipType === 'platinum' ? companyContactEmail : '',
        isPrimaryContact: isPrimaryOwner,
      };
      const values = [email, name, phone, member.enrolledAt, now, member.membershipType, member.organization, member.paidThrough, member.companyId, member.companyContactEmail, isPrimaryOwner ? 'Y' : ''];
      if (existingIndex >= 1) {
        await bqLoyaltyValuesUpdate(`LoyaltyMembers!A${existingIndex + 1}:K${existingIndex + 1}`, [values]);
      } else {
        await bqLoyaltyValuesAppend('LoyaltyMembers!A:K', [values]);
      }
      if (membershipType === 'platinum' && isPrimaryOwner) {
        await demoteOtherPrimaryContacts(sheets, rows.slice(1), organization, email);
      }
      if (membershipType === 'platinum' && companyContactEmail) {
        for (const [index, row] of rows.slice(1).entries()) {
          if (
            String(row[5] || '').toLowerCase() === 'platinum' &&
            String(row[6] || '').trim().toLowerCase() === organization.toLowerCase() &&
            normalizeLoyaltyEmail(row[9]) !== companyContactEmail
          ) {
            const rowNumber = index + 2;
            await bqLoyaltyValuesUpdate(`LoyaltyMembers!J${rowNumber}`, [[companyContactEmail]]);
          }
        }
      }
      let hoursBalance = 0;
      if (initialTopUpPaid) {
        await bqLoyaltyValuesAppend('LoyaltyLedger!A:J', [[
            crypto.randomUUID(), email, '', 'TOPUP', 0, 0,
            `Platinum top-up: $${settings.membershipPlans.platinum.topUpPrice.toFixed(2)} for ${settings.membershipPlans.platinum.includedHours} hours`,
            now, settings.membershipPlans.platinum.includedHours,
          ]]);
      }
      if (membershipType === 'platinum') {
        hoursBalance = loyaltyPlatinumHoursBalance(
          rows.slice(1),
          (await bqLoyaltyValuesGet('LoyaltyLedger!A:J')).data.values?.slice(1) || [],
          organization,
          email,
        );
      }
      member.hoursBalance = hoursBalance;
      let emailSent = false;
      let emailError = '';
      const businessProfile = await getBusinessProfile(sheets);
      try {
        await sendMembershipEmail(createGmailApi(), member, settings, businessProfile, initialTopUpPaid ? 'topup' : 'welcome', companyContactEmail);
        emailSent = true;
      } catch (error) {
        emailError = error.message || 'Membership email could not be sent.';
        console.error('Membership onboarding email error:', emailError);
      }
      let companyPortalUrl = '';
      if (membershipType === 'platinum' && organization && companyContactEmail) {
        try {
          const access = await ensureCompanyPortalAccess(sheets, organization, companyId, companyContactEmail);
          companyPortalUrl = getCompanyPortalUrl(req, access.token);
          if (access.isNew) {
            await sendCompanyPortalInviteEmail(createGmailApi(), {
              contactEmail: companyContactEmail,
              organization,
              businessProfile,
              portalUrl: companyPortalUrl,
            });
          }
        } catch (error) {
          console.error('Company portal setup error:', error.message || error);
        }
      }
      return res.status(200).json({ member, emailSent, emailError, hoursBalance, companyPortalUrl });
    }

    if (req.method === 'POST' && view === 'loyalty-remove-member') {
      const email = normalizeLoyaltyEmail(req.body?.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'A valid member email is required.' });
      }
      await ensureLoyaltyTables();
      const membersResult = await bqLoyaltyValuesGet('LoyaltyMembers!A:J');
      const rows = membersResult.data.values || [];
      const rowIndex = rows.findIndex((row, index) => index > 0 && normalizeLoyaltyEmail(row[0]) === email);
      if (rowIndex < 1) return res.status(404).json({ message: 'No loyalty member was found for that email.' });
      const removedMember = {
        email,
        name: rows[rowIndex][1] || '',
        membershipType: String(rows[rowIndex][5] || '').toLowerCase(),
        organization: rows[rowIndex][6] || '',
      };
      await bqLoyaltyDeleteRows('LoyaltyMembers', [rowIndex + 1]);
      let emailSent = false;
      let emailError = '';
      try {
        const businessProfile = await getBusinessProfile(sheets);
        await sendFormattedLoyaltyEmail(createGmailApi(), {
          email,
          ccEmail: rows[rowIndex][9] || '',
          name: removedMember.name,
          subject: `${businessProfile.businessName} loyalty membership ended`,
          businessName: businessProfile.businessName,
          heading: 'Membership ended',
          intro: 'Your membership in the loyalty rewards program has been removed by our team.',
          details: [
            { label: 'Membership type', value: removedMember.membershipType || 'Not recorded' },
            ...(removedMember.organization ? [{ label: 'Company', value: removedMember.organization }] : []),
          ],
          note: 'If you believe this was a mistake or would like to re-enroll, please contact the clinic.',
        });
        emailSent = true;
      } catch (error) {
        emailError = error.message || 'Removal confirmation email could not be sent.';
        console.error('Loyalty member removal email error:', emailError);
      }
      return res.status(200).json({
        removed: removedMember,
        emailSent,
        emailError,
        removedContacts: await syncMarketingContactsWithDatabase(sheets, getBigQueryClient()),
      });
    }

    if (req.method === 'POST' && view === 'company-portal-link') {
      const organization = String(req.body?.organization || '').trim();
      const companyId = String(req.body?.companyId || '').trim();
      const companyContactEmail = normalizeLoyaltyEmail(req.body?.companyContactEmail);
      if (!organization) return res.status(400).json({ message: 'A company/organization name is required.' });
      if (!companyContactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyContactEmail)) {
        return res.status(400).json({ message: 'A valid company contact email on file is required to create a portal link.' });
      }
      await ensureLoyaltyTables();
      const access = await ensureCompanyPortalAccess(sheets, organization, companyId, companyContactEmail);
      return res.status(200).json({ organization, portalUrl: getCompanyPortalUrl(req, access.token), joinUrl: getCompanyJoinUrl(req, access.joinToken) });
    }

    if (req.method === 'POST' && view === 'loyalty-remove-company') {
      const organization = String(req.body?.organization || '').trim();
      if (!organization) {
        return res.status(400).json({ message: 'A company/organization name is required.' });
      }
      await ensureLoyaltyTables();
      const membersResult = await bqLoyaltyValuesGet('LoyaltyMembers!A:J');
      const rows = membersResult.data.values || [];
      const matches = rows
        .map((row, index) => ({ row, rowNumber: index + 1 }))
        .filter(({ row, rowNumber }) =>
          rowNumber > 1 &&
          ['silver', 'platinum'].includes(String(row[5] || '').toLowerCase()) &&
          String(row[6] || '').trim().toLowerCase() === organization.toLowerCase(),
        );
      if (!matches.length) return res.status(404).json({ message: 'No company members were found for that organization name.' });
      const removedEmails = matches.map(({ row }) => normalizeLoyaltyEmail(row[0]));
      const companyContactEmail = matches.find(({ row }) => row[9])?.row[9] || '';
      await bqLoyaltyDeleteRows('LoyaltyMembers', matches.map(({ rowNumber }) => rowNumber));
      try {
        const companyRows = await getCompanyPortalRows(sheets);
        const companyRowIndex = companyRows.findIndex((row, index) => index > 0 && normalizeOrganizationKey(row[0]) === normalizeOrganizationKey(organization));
        if (companyRowIndex >= 1) await bqLoyaltyDeleteRows('LoyaltyCompanies', [companyRowIndex + 1]);
      } catch (error) {
        console.error('Company portal cleanup error:', error.message || error);
      }
      const businessProfile = await getBusinessProfile(sheets);
      const emailResults = await Promise.allSettled(matches.map(({ row }) => sendFormattedLoyaltyEmail(createGmailApi(), {
        email: normalizeLoyaltyEmail(row[0]),
        ccEmail: companyContactEmail,
        name: row[1] || '',
        subject: `${businessProfile.businessName} loyalty membership ended`,
        businessName: businessProfile.businessName,
        heading: 'Membership ended',
        intro: `${organization}'s corporate loyalty membership with ${businessProfile.businessName} has been removed by our team.`,
        details: [
          { label: 'Membership type', value: String(row[5] || '').toLowerCase() },
          { label: 'Company', value: organization },
        ],
        note: 'If you believe this was a mistake or would like to re-enroll, please contact the clinic.',
      })));
      const emailsSent = emailResults.filter((result) => result.status === 'fulfilled').length;
      return res.status(200).json({
        organization,
        removedCount: matches.length,
        removedEmails,
        emailsSent,
        emailsFailed: matches.length - emailsSent,
      });
    }

    if (req.method === 'POST' && view === 'loyalty-clear-ledger') {
      const scope = String(req.body?.scope || '').trim().toLowerCase();
      if (scope !== 'member' && scope !== 'all') {
        return res.status(400).json({ message: 'Choose whether to clear one member or the entire ledger.' });
      }
      const email = normalizeLoyaltyEmail(req.body?.email);
      if (scope === 'member' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'A valid member email is required to clear a single ledger.' });
      }
      // Wiping every entry is unrecoverable, so require the exact phrase the UI shows.
      if (scope === 'all' && String(req.body?.confirm || '').trim().toUpperCase() !== LOYALTY_LEDGER_RESET_PHRASE) {
        return res.status(400).json({ message: `Type ${LOYALTY_LEDGER_RESET_PHRASE} to confirm clearing the entire ledger.` });
      }
      await ensureLoyaltyTables();
      const ledgerRows = (await bqLoyaltyValuesGet('LoyaltyLedger!A:J')).data.values || [];
      const rowNumbers = [];
      for (let index = 1; index < ledgerRows.length; index += 1) {
        const row = ledgerRows[index] || [];
        if (!row.some((cell) => String(cell || '').trim())) continue;
        if (scope === 'member' && normalizeLoyaltyEmail(row[1]) !== email) continue;
        rowNumbers.push(index + 1);
      }
      if (!rowNumbers.length) {
        return res.status(404).json({
          message: scope === 'member'
            ? 'That member has no recorded ledger entries to clear.'
            : 'The loyalty ledger is already empty.',
        });
      }
      await bqLoyaltyDeleteRows('LoyaltyLedger', rowNumbers);
      return res.status(200).json({ scope, email: scope === 'member' ? email : '', clearedCount: rowNumbers.length });
    }

    if (req.method === 'POST' && view === 'loyalty-topup') {
      const email = normalizeLoyaltyEmail(req.body?.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'A valid Platinum member email is required.' });
      }
      const settings = await getLoyaltySettings();
      if (!settings.enabled) return res.status(409).json({ message: 'The loyalty program is currently paused.' });
      const membersResult = await bqLoyaltyValuesGet('LoyaltyMembers!A:K');
      const memberRows = membersResult.data.values || [];
      const member = memberRows.slice(1)
        .find((row) => normalizeLoyaltyEmail(row[0]) === email && String(row[5] || '').toLowerCase() === 'platinum');
      if (!member) return res.status(404).json({ message: 'No Platinum member was found for that email.' });
      if (!isPrimaryContactFlag(member[10])) {
        const organization = member[6] || '';
        const existingPrimary = memberRows.slice(1).find((row) =>
          String(row[5] || '').toLowerCase() === 'platinum' &&
          normalizeOrganizationKey(row[6]) === normalizeOrganizationKey(organization) &&
          normalizeLoyaltyEmail(row[0]) !== email &&
          isPrimaryContactFlag(row[10]),
        );
        const primaryHint = existingPrimary ? ` This company's primary contact on file is ${existingPrimary[1] || existingPrimary[0]}.` : '';
        return res.status(400).json({ message: `Only the company's primary owner/contact can receive a Platinum top-up.${primaryHint} Mark this person as the primary owner/contact to top them up.` });
      }
      await bqLoyaltyValuesAppend('LoyaltyLedger!A:J', [[
          crypto.randomUUID(), email, '', 'TOPUP', 0, 0,
          `Platinum top-up: $${settings.membershipPlans.platinum.topUpPrice.toFixed(2)} for ${settings.membershipPlans.platinum.includedHours} hours`,
          new Date().toISOString(), settings.membershipPlans.platinum.includedHours,
        ]]);
      const ledgerResult = await bqLoyaltyValuesGet('LoyaltyLedger!A:J');
      const hoursBalance = loyaltyPlatinumHoursBalance(memberRows.slice(1), ledgerResult.data.values?.slice(1) || [], member[6], email);
      let emailSent = false;
      let emailError = '';
      try {
        await sendMembershipEmail(createGmailApi(), {
          email: member[0],
          name: member[1],
          membershipType: 'platinum',
          organization: member[6],
          companyId: member[8],
          hoursBalance,
        }, settings, await getBusinessProfile(sheets), 'topup');
        emailSent = true;
      } catch (error) {
        emailError = error.message || 'Platinum balance email could not be sent.';
        console.error('Platinum top-up email error:', emailError);
      }
      return res.status(200).json({
        email,
        hoursAdded: settings.membershipPlans.platinum.includedHours,
        hoursBalance,
        emailSent,
        emailError,
      });
    }

    if (req.method === 'POST' && view === 'loyalty-set-primary-contact') {
      const email = normalizeLoyaltyEmail(req.body?.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'A valid Platinum member email is required.' });
      }
      const makePrimary = req.body?.isPrimaryOwner === true;
      await ensureLoyaltyTables();
      const membersResult = await bqLoyaltyValuesGet('LoyaltyMembers!A:K');
      const rows = membersResult.data.values || [];
      const rowIndex = rows.findIndex((row, index) => index > 0 && normalizeLoyaltyEmail(row[0]) === email && String(row[5] || '').toLowerCase() === 'platinum');
      if (rowIndex < 1) return res.status(404).json({ message: 'No Platinum member was found for that email.' });
      const organization = rows[rowIndex][6] || '';
      await bqLoyaltyValuesUpdate(`LoyaltyMembers!K${rowIndex + 1}`, [[makePrimary ? 'Y' : '']]);
      if (makePrimary) {
        await demoteOtherPrimaryContacts(sheets, rows.slice(1), organization, email);
      }
      return res.status(200).json({ email, organization, isPrimaryContact: makePrimary });
    }

    if (req.method === 'POST' && view === 'loyalty-payment') {
      const email = normalizeLoyaltyEmail(req.body?.email);
      const organization = String(req.body?.organization || '').trim();
      const paidThrough = String(req.body?.paidThrough || '').trim();
      if (!isValidMembershipDate(paidThrough)) {
        return res.status(400).json({ message: 'Paid-through date must be a valid YYYY-MM-DD date.' });
      }
      const settings = await getLoyaltySettings();
      const membersResult = await bqLoyaltyValuesGet('LoyaltyMembers!A:J');
      const rows = membersResult.data.values || [];
      const matches = rows.slice(1).map((row, index) => ({ row, rowNumber: index + 2 }))
        .filter(({ row }) => organization
          ? String(row[5] || '').toLowerCase() === 'silver' && String(row[6] || '').trim().toLowerCase() === organization.toLowerCase()
          : normalizeLoyaltyEmail(row[0]) === email && String(row[5] || '').toLowerCase() === 'gold');
      if (!matches.length) return res.status(404).json({ message: 'No matching Gold member or Silver corporate account was found.' });
      if (organization && matches.length > settings.membershipPlans.silver.maxEmployees) {
        return res.status(409).json({ message: 'The corporate account exceeds the configured employee limit; adjust the roster before recording payment.' });
      }
      const updatedMembers = [];
      for (const { row, rowNumber } of matches) {
        const member = {
          email: normalizeLoyaltyEmail(row[0]),
          name: row[1] || '',
          membershipType: String(row[5] || '').toLowerCase(),
          organization: row[6] || '',
          paidThrough,
        };
        await bqLoyaltyValuesUpdate(`LoyaltyMembers!E${rowNumber}:H${rowNumber}`, [[new Date().toISOString(), row[5] || '', row[6] || '', paidThrough]]);
        updatedMembers.push(member);
      }
      const emailFailures = [];
      const businessProfile = await getBusinessProfile(sheets);
      for (const member of updatedMembers) {
        try {
          await sendMembershipEmail(createGmailApi(), member, settings, businessProfile, 'payment');
        } catch (error) {
          emailFailures.push({ email: member.email, reason: error.message || 'Payment email could not be sent.' });
        }
      }
      if (emailFailures.length) console.error('Membership payment notification failures:', emailFailures);
      return res.status(200).json({
        updatedCount: updatedMembers.length,
        paidThrough,
        emailsSent: updatedMembers.length - emailFailures.length,
        emailFailures,
      });
    }

    if (req.method === 'POST' && view === 'loyalty-award') {
      const bookingId = String(req.body?.bookingId || '').trim();
      if (bookingId.startsWith('WIX-')) {
        return res.status(409).json({ message: 'Historical Wix bookings cannot consume current loyalty benefits or earn retroactive points.' });
      }
      if (!bookingId || bookingId.length > 100) {
        return res.status(400).json({ message: 'A valid booking ID is required.' });
      }
      const settings = await getLoyaltySettings();
      if (!settings.enabled) return res.status(409).json({ message: 'The loyalty program is currently paused.' });
      const bigquery = getBigQueryClient();
      const [membersResult, ledgerResult, bookingsResult] = await Promise.all([
        bqLoyaltyValuesGet('LoyaltyMembers!A:K'),
        bqLoyaltyValuesGet('LoyaltyLedger!A:J'),
        bqFetchBookingRows(bigquery),
      ]);
      const bookingRows = bookingsResult.data.values || [];
      const hasHeader = bookingRows[0]?.[0] === 'Booking ID';
      const rowIndex = bookingRows.findIndex((row, index) => index >= (hasHeader ? 1 : 0) && String(row[0] || '') === bookingId);
      if (rowIndex < 0) return res.status(404).json({ message: 'Booking was not found.' });
      const booking = bookingRows[rowIndex];
      if (readPackageUsage(booking[14])) return res.status(409).json({ message: 'This visit is covered by a prepaid package and cannot also consume loyalty benefits.' });
      const email = normalizeLoyaltyEmail(booking[3]);
      const memberRows = (membersResult.data.values || []).slice(1);
      const member = memberRows.find((row) => normalizeLoyaltyEmail(row[0]) === email);
      if (!member) return res.status(409).json({ message: 'This customer is not enrolled in the loyalty program.' });
      const ledgerRows = (ledgerResult.data.values || []).slice(1);
      if (ledgerRows.some((row) => ['EARN', 'USE', 'HOTSTONE'].includes(row[3]) && normalizeLoyaltyEmail(row[1]) === email && String(row[2] || '') === bookingId)) {
        return res.status(200).json({ alreadyAwarded: true, bookingId });
      }
      const total = Number(booking[11]) || 0;
      const paidAmount = Number(booking[10]) || 0;
      const durationMinutes = Number(booking[12]) || 60;
      const isPlatinum = String(member[5] || '').toLowerCase() === 'platinum';
      const availableHours = isPlatinum ? loyaltyPlatinumHoursBalance(memberRows, ledgerRows, member[6], email) : 0;
      const hoursUsed = isPlatinum && availableHours > 0
        ? Math.min(availableHours, durationMinutes / 60)
        : 0;
      const freeHotStone = String(member[5] || '').toLowerCase() === 'gold' &&
        isMembershipActive(member) &&
        String(booking[5] || '').toLowerCase().includes('hot stone add-on') &&
        loyaltyHotStoneRedemptions(ledgerRows, email) < settings.membershipPlans.gold.freeHotStonePerMonth;
      if (!isAppointmentCompleteByTime(booking[7], booking[8], booking[12])) {
        return res.status(409).json({ message: 'Points can only be awarded after the appointment treatment time has passed.' });
      }
      const fullyPaid = total > 0 && paidAmount + 0.005 >= total;
      if (!hoursUsed && !freeHotStone && !fullyPaid) {
        return res.status(409).json({ message: 'Record full payment before awarding points for this visit.' });
      }
      const firstSession = getFirstPaidSingleSessionBookingId(
        bookingRows[0]?.[0] === 'Booking ID' ? bookingRows.slice(1) : bookingRows,
        email,
      ) === bookingId;
      const pointsMultiplier = firstSession
        ? settings.firstSessionMultiplier
        : String(member[5] || '').toLowerCase() === 'gold' && isMembershipActive(member)
          ? settings.membershipPlans.gold.pointsMultiplier
          : 1;
      const points = fullyPaid
        ? Math.floor(paidAmount * settings.pointsPerDollar * pointsMultiplier)
        : 0;
      const createdAt = new Date().toISOString();
      const ledgerEntries = [];
      if (hoursUsed) {
        ledgerEntries.push([
          crypto.randomUUID(), email, bookingId, 'USE', 0, 0,
          `Platinum session usage: ${booking[5] || 'massage service'}`, createdAt, -hoursUsed,
        ]);
      }
      if (freeHotStone) {
        ledgerEntries.push([
          crypto.randomUUID(), email, bookingId, 'HOTSTONE', 0, 0,
          'Gold monthly free Hot Stone add-on', createdAt, 0,
        ]);
      }
      if (points > 0) {
        ledgerEntries.push([
          crypto.randomUUID(), email, bookingId, 'EARN', points, 0,
          `Completed visit: ${booking[5] || 'massage service'}${firstSession ? ` (first-session ${pointsMultiplier}x)` : ` (${pointsMultiplier}x)`}`,
          createdAt, 0,
        ]);
      }
      if (ledgerEntries.length) {
        await bqLoyaltyValuesAppend('LoyaltyLedger!A:J', ledgerEntries);
      }
      if (!points && !hoursUsed && !freeHotStone) {
        return res.status(409).json({ message: 'This visit does not qualify for points or prepaid hours.' });
      }
      let balanceEmailSent = true;
      let balanceEmailError = '';
      const businessProfile = await getBusinessProfile(sheets);
      const hoursBalance = isPlatinum ? loyaltyPlatinumHoursBalance(memberRows, [...ledgerRows, ...ledgerEntries], member[6], email) : 0;
      try {
        const pointsBalance = ledgerRows
          .filter((row) => normalizeLoyaltyEmail(row[1]) === email)
          .reduce((sum, row) => sum + (Number(row[4]) || 0), 0) + points;
        await sendFormattedLoyaltyEmail(createGmailApi(), {
          email,
          name: member[1] || '',
          subject: `${businessProfile.businessName} rewards balance updated`,
          businessName: businessProfile.businessName,
          heading: 'Rewards balance updated',
          intro: `Your completed visit has been recorded${points ? ` and earned ${points.toLocaleString()} points` : ''}.`,
          details: [
            { label: 'Points balance', value: pointsBalance.toLocaleString() },
            ...(isPlatinum ? [{ label: 'Prepaid hours balance', value: `${hoursBalance.toFixed(2)} hours` }] : []),
            { label: 'Booking reference', value: bookingId },
          ],
          note: 'Your visit rewards and eligible prepaid-hour usage are now reflected in your account.',
        });
      } catch (error) {
        balanceEmailSent = false;
        balanceEmailError = error.message || 'Loyalty balance email could not be sent.';
        console.error('Loyalty award email error:', balanceEmailError);
      }
      let companyNotifySent = false;
      let companyNotifyError = '';
      const organization = String(member[6] || '').trim();
      const companyContactEmail = normalizeLoyaltyEmail(member[9]);
      if (hoursUsed > 0 && organization && companyContactEmail) {
        try {
          const access = await ensureCompanyPortalAccess(sheets, organization, member[8] || '', companyContactEmail);
          await sendCompanyUsageNotificationEmail(createGmailApi(), {
            contactEmail: companyContactEmail,
            organization,
            employeeName: member[1] || '',
            employeeEmail: email,
            serviceName: booking[5] || '',
            hoursUsed,
            hoursRemaining: hoursBalance,
            businessProfile,
            portalUrl: getCompanyPortalUrl(req, access.token),
          });
          companyNotifySent = true;
        } catch (error) {
          companyNotifyError = error.message || 'Company usage notification could not be sent.';
          console.error('Company usage notification error:', companyNotifyError);
        }
      }
      return res.status(200).json({ awarded: points > 0, points, hoursUsed, freeHotStone, bookingId, email, balanceEmailSent, balanceEmailError, companyNotifySent, companyNotifyError });
    }

    if (req.method === 'POST' && view === 'loyalty-redeem') {
      const email = normalizeLoyaltyEmail(req.body?.email);
      const points = Number(req.body?.points);
      const bookingId = String(req.body?.bookingId || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !bookingId || bookingId.length > 100) {
        return res.status(400).json({ message: 'A valid member email and paid booking are required to link the reward to its receipt.' });
      }
      const settings = await getLoyaltySettings();
      if (!settings.enabled) return res.status(409).json({ message: 'The loyalty program is currently paused.' });
      if (!Number.isInteger(points) || points < settings.redemptionPoints || points > 1000000 || points % settings.redemptionPoints !== 0) {
        return res.status(400).json({ message: `Redeem points in multiples of ${settings.redemptionPoints}.` });
      }
      const bigquery = getBigQueryClient();
      const [membersResult, ledgerResult, bookingsResult] = await Promise.all([
        bqLoyaltyValuesGet('LoyaltyMembers!A:J'),
        bqLoyaltyValuesGet('LoyaltyLedger!A:J'),
        bqFetchBookingRows(bigquery),
      ]);
      const member = (membersResult.data.values || []).slice(1)
        .find((row) => normalizeLoyaltyEmail(row[0]) === email);
      if (!member) return res.status(404).json({ message: 'Loyalty member was not found.' });
      const bookingRows = bookingsResult.data.values || [];
      const hasHeader = bookingRows[0]?.[0] === 'Booking ID';
      const booking = bookingRows.find((row, index) =>
        index >= (hasHeader ? 1 : 0) && String(row[0] || '') === bookingId,
      );
      if (!booking || normalizeLoyaltyEmail(booking[3]) !== email) {
        return res.status(404).json({ message: 'The selected receipt booking was not found for this loyalty member.' });
      }
      if (readPackageUsage(booking[14])) return res.status(409).json({ message: 'A package-covered visit cannot also redeem a loyalty discount.' });
      const bookingTotal = Number(booking[11]) || 0;
      if (!bookingTotal || (Number(booking[10]) || 0) + 0.005 < bookingTotal) {
        return res.status(409).json({ message: 'A loyalty discount can only be linked to a fully paid booking.' });
      }
      if (booking[18]) {
        return res.status(409).json({ message: `Receipt ${booking[18]} has already been issued. Select a paid booking before its receipt is issued.` });
      }
      const memberTransactions = (ledgerResult.data.values || []).slice(1)
        .filter((row) => normalizeLoyaltyEmail(row[1]) === email);
      if (memberTransactions.some((row) =>
        row[3] === 'REDEEM' && String(row[2] || '') === bookingId,
      )) {
        return res.status(409).json({ message: 'A loyalty redemption is already linked to this booking.' });
      }
      const balance = memberTransactions.reduce((sum, row) => sum + (Number(row[4]) || 0), 0);
      if (points > balance) return res.status(409).json({ message: `Insufficient points. Available balance: ${balance}.` });
      const rewardValue = (points / settings.redemptionPoints) * settings.redemptionValue;
      const isTaxExempt = /registered massage therapy|\brmt\b|acupuncture/i.test(String(booking[5] || ''));
      const preDiscountSubtotal = isTaxExempt ? bookingTotal : bookingTotal / 1.13;
      if (rewardValue > preDiscountSubtotal + 0.005) {
        return res.status(409).json({ message: 'The selected points redemption is greater than the eligible pre-tax purchase amount.' });
      }
      const now = new Date().toISOString();
      await bqLoyaltyValuesAppend('LoyaltyLedger!A:J', [[crypto.randomUUID(), email, bookingId, 'REDEEM', -points, rewardValue, `Redeemed for $${rewardValue.toFixed(2)}; pending receipt for booking ${bookingId}`, now, 0, '']]);
      const pointsBalance = balance - points;
      let emailSent = false;
      let emailError = '';
      try {
        await sendLoyaltyRedemptionEmail(createGmailApi(), {
          email,
          name: member[1] || '',
        }, {
          points,
          rewardValue,
          bookingId,
          pointsBalance,
          balanceValue: pointsBalance / settings.redemptionPoints * settings.redemptionValue,
        }, await getBusinessProfile(sheets));
        emailSent = true;
      } catch (error) {
        emailError = error.message || 'Redemption confirmation email could not be sent.';
        console.error('Loyalty redemption email error:', emailError);
      }
      return res.status(200).json({
        email,
        bookingId,
        redeemedPoints: points,
        rewardValue,
        remainingPoints: pointsBalance,
        emailSent,
        emailError,
      });
    }

    if (req.method === 'GET' && view === 'google-ads-report') {
      res.setHeader('Cache-Control', 'no-store');
      const missingSettings = [
        ['GOOGLE_ADS_DEVELOPER_TOKEN', GOOGLE_ADS_DEVELOPER_TOKEN],
        ['GOOGLE_ADS_CUSTOMER_ID', GOOGLE_ADS_CUSTOMER_ID],
        ['GOOGLE_ADS_CLIENT_ID', GOOGLE_ADS_CLIENT_ID],
        ['GOOGLE_ADS_CLIENT_SECRET', GOOGLE_ADS_CLIENT_SECRET],
        ['GOOGLE_ADS_REFRESH_TOKEN', GOOGLE_ADS_REFRESH_TOKEN],
      ].filter(([, value]) => !value).map(([setting]) => setting);
      if (missingSettings.length) {
        return res.status(200).json({ configured: false, missingSettings });
      }

      const customerId = GOOGLE_ADS_CUSTOMER_ID.replace(/\D/g, '');
      const loginCustomerId = GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/\D/g, '');
      if (!/^\d{10}$/.test(customerId) || (GOOGLE_ADS_LOGIN_CUSTOMER_ID && !/^\d{10}$/.test(loginCustomerId))) {
        return res.status(500).json({ message: 'Google Ads customer IDs must contain exactly 10 digits (hyphens are optional).' });
      }
      if (!/^v\d+$/.test(GOOGLE_ADS_API_VERSION)) {
        return res.status(500).json({ message: 'GOOGLE_ADS_API_VERSION must use the format vNN.' });
      }
      const isValidDate = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
        const parsedDate = new Date(`${value}T00:00:00Z`);
        return Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
      };
      const startDate = String(req.query.startDate || '');
      const endDate = String(req.query.endDate || '');
      if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate || endDate > new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ message: 'Choose a valid start and end date for the Google Ads report.' });
      }

      const adsOAuthClient = new google.auth.OAuth2(GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET);
      adsOAuthClient.setCredentials({ refresh_token: GOOGLE_ADS_REFRESH_TOKEN });
      const { token } = await adsOAuthClient.getAccessToken();
      if (!token) throw new Error('Google Ads OAuth did not return an access token');

      const adsHeaders = {
        Authorization: `Bearer ${token}`,
        'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
      };
      if (loginCustomerId) adsHeaders['login-customer-id'] = loginCustomerId;
      const searchAds = async (query, pageToken) => {
        const adsResponse = await fetch(
          `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
          {
            method: 'POST',
            headers: adsHeaders,
            body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
          },
        );
        const adsData = await adsResponse.json();
        if (!adsResponse.ok) {
          const upstreamMessage = adsData.error?.message || 'Google Ads API request failed.';
          const statusCode = adsResponse.status === 401 || adsResponse.status === 403 ? adsResponse.status : 502;
          const error = new Error(upstreamMessage);
          error.statusCode = statusCode;
          throw error;
        }
        return adsData;
      };

      const query = `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND campaign.status != 'REMOVED' ORDER BY metrics.impressions DESC`;
      const results = [];
      let pageToken;
      do {
        const page = await searchAds(query, pageToken);
        results.push(...(page.results || []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      const customerData = await searchAds('SELECT customer.currency_code FROM customer LIMIT 1');
      const campaigns = results.map((result) => ({
        id: String(result.campaign?.id || ''),
        name: result.campaign?.name || 'Unnamed campaign',
        status: result.campaign?.status || 'UNKNOWN',
        impressions: Number(result.metrics?.impressions || 0),
        clicks: Number(result.metrics?.clicks || 0),
        cost: Number(result.metrics?.costMicros || 0) / 1_000_000,
        conversions: Number(result.metrics?.conversions || 0),
      }));
      return res.status(200).json({
        configured: true,
        customerId,
        currencyCode: customerData.results?.[0]?.customer?.currencyCode || null,
        dateRange: `${startDate} to ${endDate}`,
        campaigns,
        totals: campaigns.reduce((totals, campaign) => ({
          impressions: totals.impressions + campaign.impressions,
          clicks: totals.clicks + campaign.clicks,
          cost: totals.cost + campaign.cost,
          conversions: totals.conversions + campaign.conversions,
        }), { impressions: 0, clicks: 0, cost: 0, conversions: 0 }),
      });
    }

    if (req.method === 'POST' && req.query?.view === 'therapist-note') {
      res.setHeader('Cache-Control', 'no-store');
      if (!isSameOriginRequest(req)) {
        return res.status(403).json({ message: 'Note update origin is not allowed' });
      }
      const session = getTherapistSession(req);
      if (!session) return res.status(401).json({ message: 'Therapist sign-in required' });
      const bookingId = String(req.body?.bookingId || '').trim();
      const category = String(req.body?.category || '').trim();
      const note = String(req.body?.note || '').trim();
      const allowedCategories = ['Treatment note', 'Progress update', 'Follow-up', 'Rebooking'];
      if (!bookingId || !allowedCategories.includes(category) || !note || note.length > 3000) {
        return res.status(400).json({ message: 'Choose a patient, note type, and enter a note of no more than 3,000 characters.' });
      }

      const bigquery = getBigQueryClient();
      const [accountsResult, bookingResult] = await Promise.all([
        sheets.spreadsheets.values.get({
          spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
          range: 'TherapistAccounts!A:F',
        }).catch((error) => {
          if (error.code === 400) return { data: { values: [] } };
          throw error;
        }),
        bqFetchBookingRows(bigquery),
      ]);
      const sheetAccount = (accountsResult.data.values || []).slice(1)
        .map((row) => ({ id: row[0], name: row[2], status: row[4] }))
        .find((item) => item.id === session.therapistId);
      if (sheetAccount && sheetAccount.status !== 'approved') {
        return res.status(403).json({ message: 'Therapist account is not approved' });
      }
      const account = sheetAccount || getTherapistAccounts().find((item) => item.id === session.therapistId);
      if (!account) return res.status(401).json({ message: 'Therapist account is not available' });
      const assignedBooking = (bookingResult.data.values || [])
        .find((row) => row[0] === bookingId && row[6] === account.name);
      if (!assignedBooking) {
        return res.status(404).json({ message: 'That appointment is not assigned to your therapist account.' });
      }

      await ensureTherapistNotesSheet(sheets);
      const createdAt = new Date().toISOString();
      const savedNote = {
        noteId: crypto.randomUUID(),
        bookingId,
        patientName: assignedBooking[1] || '',
        category,
        note,
        createdAt,
      };
      await sheets.spreadsheets.values.append({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistNotes!A:G',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[savedNote.noteId, session.therapistId, bookingId, savedNote.patientName, category, note, createdAt]],
        },
      });
      return res.status(201).json({ note: savedNote });
    }

    if (req.method === 'POST' && req.query?.view === 'therapist-profile') {
      res.setHeader('Cache-Control', 'no-store');
      if (!isSameOriginRequest(req)) {
        return res.status(403).json({ message: 'Profile update origin is not allowed' });
      }
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
        .map((row) => ({ id: row[0], name: row[2], status: row[4] }))
        .find((item) => item.id === session.therapistId);
      if (sheetAccount && sheetAccount.status !== 'approved') {
        return res.status(403).json({ message: 'Therapist account is not approved' });
      }
      const account = sheetAccount || getTherapistAccounts().find((item) => item.id === session.therapistId);
      if (!account) return res.status(401).json({ message: 'Therapist account is not available' });

      const profile = {
        email: String(req.body?.email || '').trim().slice(0, 254),
        phone: String(req.body?.phone || '').trim().slice(0, 40),
        specialties: String(req.body?.specialties || '').trim().slice(0, 300),
        certifications: String(req.body?.certifications || '').trim().slice(0, 300),
        bio: String(req.body?.bio || '').trim().slice(0, 1200),
      };
      if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
      }

      await ensureTherapistProfilesSheet(sheets);
      const profileRowsResult = await sheets.spreadsheets.values.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistProfiles!A:G',
      });
      const profileRows = profileRowsResult.data.values || [];
      const profileRowIndex = profileRows.slice(1).findIndex((row) => row[0] === session.therapistId);
      const updatedAt = new Date().toISOString();
      const values = [
        session.therapistId,
        profile.email,
        profile.phone,
        profile.specialties,
        profile.certifications,
        profile.bio,
        updatedAt,
      ];
      if (profileRowIndex >= 0) {
        const sheetRow = profileRowIndex + 2;
        await sheets.spreadsheets.values.update({
          spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
          range: `TherapistProfiles!A${sheetRow}:G${sheetRow}`,
          valueInputOption: 'RAW',
          requestBody: { values: [values] },
        });
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
          range: 'TherapistProfiles!A:G',
          valueInputOption: 'RAW',
          requestBody: { values: [values] },
        });
      }
      return res.status(200).json({ profile: { ...profile, updatedAt } });
    }

    if (view === 'company-portal' && req.method === 'GET') {
      const token = String(req.query?.token || '');
      if (!/^[a-f0-9]{48}$/.test(token)) {
        return res.status(400).json({ message: 'This company portal link is invalid or incomplete.' });
      }
      await ensureLoyaltyTables();
      const company = await findCompanyPortalByToken(sheets, token);
      if (!company) return res.status(404).json({ message: 'This company portal link is invalid or no longer active.' });
      // Companies created before employee self-signup existed have no join token stored yet.
      let joinToken = company.joinToken;
      if (!joinToken) {
        try {
          joinToken = (await ensureCompanyPortalAccess(sheets, company.organization, company.companyId, company.contactEmail)).joinToken;
        } catch (error) {
          console.error('Company join token backfill error:', error.message);
        }
      }
      const [membersResult, ledgerResult] = await Promise.all([
        bqLoyaltyValuesGet('LoyaltyMembers!A:K'),
        bqLoyaltyValuesGet('LoyaltyLedger!A:J'),
      ]);
      const orgKey = normalizeOrganizationKey(company.organization);
      const memberRows = (membersResult.data.values || []).slice(1);
      const employeeRows = memberRows
        .filter((row) => String(row[5] || '').toLowerCase() === 'platinum' && normalizeOrganizationKey(row[6]) === orgKey);
      const ledgerRows = (ledgerResult.data.values || []).slice(1);
      const employeeEmails = new Set(employeeRows.map((row) => normalizeLoyaltyEmail(row[0])));
      // Hours are pooled per company: every employee shares one balance, funded only by the
      // primary owner/contact's top-ups, so each employee's own usage is shown separately from
      // the one shared remaining-hours figure (in `totals`).
      const sharedHoursBalance = loyaltyPlatinumHoursBalance(memberRows, ledgerRows, company.organization, '');
      const employees = employeeRows.map((row) => {
        const email = normalizeLoyaltyEmail(row[0]);
        const hoursUsedByEmployee = Math.abs(
          ledgerRows.filter((ledgerRow) => ledgerRow[3] === 'USE' && normalizeLoyaltyEmail(ledgerRow[1]) === email)
            .reduce((sum, ledgerRow) => sum + (Number(ledgerRow[8]) || 0), 0),
        );
        return {
          email,
          name: row[1] || '',
          phone: row[2] || '',
          enrolledAt: row[3] || '',
          isPrimaryContact: isPrimaryContactFlag(row[10]),
          hoursUsedByEmployee,
        };
      }).sort((a, b) => (b.isPrimaryContact - a.isPrimaryContact) || a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
      const employeeNameByEmail = new Map(employees.map((employee) => [employee.email, employee.name]));
      const companyLedgerRows = ledgerRows.filter((row) => employeeEmails.has(normalizeLoyaltyEmail(row[1])));
      const topUps = companyLedgerRows
        .filter((row) => row[3] === 'TOPUP')
        .map((row) => ({
          email: normalizeLoyaltyEmail(row[1]),
          employeeName: employeeNameByEmail.get(normalizeLoyaltyEmail(row[1])) || '',
          createdAt: row[7] || '',
          hoursAdded: Number(row[8]) || 0,
          description: row[6] || '',
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50);
      const usage = companyLedgerRows
        .filter((row) => row[3] === 'USE')
        .map((row) => ({
          email: normalizeLoyaltyEmail(row[1]),
          employeeName: employeeNameByEmail.get(normalizeLoyaltyEmail(row[1])) || '',
          createdAt: row[7] || '',
          hoursUsed: Math.abs(Number(row[8]) || 0),
          description: row[6] || '',
          bookingId: row[2] || '',
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50);
      const totals = {
        employeeCount: employees.length,
        hoursBalance: sharedHoursBalance,
        hoursToppedUpAllTime: companyLedgerRows.filter((row) => row[3] === 'TOPUP').reduce((sum, row) => sum + (Number(row[8]) || 0), 0),
        hoursUsedAllTime: Math.abs(companyLedgerRows.filter((row) => row[3] === 'USE').reduce((sum, row) => sum + (Number(row[8]) || 0), 0)),
      };
      return res.status(200).json({
        organization: company.organization,
        companyId: company.companyId,
        contactEmail: company.contactEmail,
        joinUrl: getCompanyJoinUrl(req, joinToken),
        employees,
        topUps,
        usage,
        totals,
      });
    }

    // Employee-facing join link. Deliberately returns only the company name and the Platinum
    // plan benefits - never the employee roster, top-ups, or usage history that the admin
    // `company-portal` view exposes.
    if (view === 'company-join' && req.method === 'GET') {
      const joinToken = String(req.query?.token || '');
      if (!/^[a-f0-9]{48}$/.test(joinToken)) {
        return res.status(400).json({ message: 'This signup link is invalid or incomplete.' });
      }
      await ensureLoyaltyTables();
      const company = await findCompanyByJoinToken(sheets, joinToken);
      if (!company) return res.status(404).json({ message: 'This signup link is invalid or no longer active.' });
      const settings = await getLoyaltySettings();
      return res.status(200).json({
        organization: company.organization,
        enabled: !!settings.enabled,
        platinum: {
          discountPercent: Number(settings.membershipPlans?.platinum?.discountPercent) || 0,
          includedHours: Number(settings.membershipPlans?.platinum?.includedHours) || 0,
          hotStoneDiscount: Number(settings.membershipPlans?.platinum?.hotStoneDiscount) || 0,
        },
      });
    }

    if (view === 'company-join-signup' && req.method === 'POST') {
      const joinToken = String(req.body?.token || '');
      if (!/^[a-f0-9]{48}$/.test(joinToken)) {
        return res.status(400).json({ message: 'This signup link is invalid or incomplete.' });
      }
      await ensureLoyaltyTables();
      const company = await findCompanyByJoinToken(sheets, joinToken);
      if (!company) return res.status(404).json({ message: 'This signup link is invalid or no longer active.' });
      return enrollCompanyEmployee(sheets, res, company, req.body);
    }

    if (view === 'company-portal-signup' && req.method === 'POST') {
      const token = String(req.body?.token || '');
      if (!/^[a-f0-9]{48}$/.test(token)) {
        return res.status(400).json({ message: 'This company portal link is invalid or incomplete.' });
      }
      await ensureLoyaltyTables();
      const company = await findCompanyPortalByToken(sheets, token);
      if (!company) return res.status(404).json({ message: 'This company portal link is invalid or no longer active.' });
      return enrollCompanyEmployee(sheets, res, company, req.body);
    }

    if (view === 'company-portal-bulk-signup' && req.method === 'POST') {
      const token = String(req.body?.token || '');
      if (!/^[a-f0-9]{48}$/.test(token)) {
        return res.status(400).json({ message: 'This company portal link is invalid or incomplete.' });
      }
      await ensureLoyaltyTables();
      const company = await findCompanyPortalByToken(sheets, token);
      if (!company) return res.status(404).json({ message: 'This company portal link is invalid or no longer active.' });
      const settings = await getLoyaltySettings();
      if (!settings.enabled) return res.status(409).json({ message: 'The loyalty program is currently paused.' });
      const incoming = Array.isArray(req.body?.employees) ? req.body.employees.slice(0, 200) : [];
      if (!incoming.length) return res.status(400).json({ message: 'Upload a file with at least one employee row.' });
      const membersResult = await bqLoyaltyValuesGet('LoyaltyMembers!A:K');
      const rows = membersResult.data.values || [];
      const existingEmails = new Set(rows.slice(1).map((row) => normalizeLoyaltyEmail(row[0])));
      const now = new Date().toISOString();
      const seen = new Set();
      const toCreate = [];
      const results = [];
      for (const entry of incoming) {
        const email = normalizeLoyaltyEmail(entry?.email);
        const name = String(entry?.name || '').trim().slice(0, 120);
        const phone = String(entry?.phone || '').trim().slice(0, 50);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
          results.push({ email: entry?.email || '', name, status: 'skipped', reason: 'Missing a valid name and email.' });
          continue;
        }
        if (existingEmails.has(email) || seen.has(email)) {
          results.push({ email, name, status: 'skipped', reason: 'Already enrolled.' });
          continue;
        }
        seen.add(email);
        toCreate.push([email, name, phone, now, now, 'platinum', company.organization, '', company.companyId, company.contactEmail, '']);
        results.push({ email, name, status: 'created' });
      }
      if (toCreate.length) {
        await bqLoyaltyValuesAppend('LoyaltyMembers!A:K', toCreate);
      }
      const businessProfile = await getBusinessProfile(sheets);
      const ledgerRows = (await bqLoyaltyValuesGet('LoyaltyLedger!A:J')).data.values?.slice(1) || [];
      const hoursBalance = loyaltyPlatinumHoursBalance(rows.slice(1), ledgerRows, company.organization, '');
      const emailResults = await Promise.allSettled(toCreate.map(([email, name, phone]) => sendMembershipEmail(createGmailApi(), {
        email, name, phone, membershipType: 'platinum', organization: company.organization, companyId: company.companyId, hoursBalance,
      }, settings, businessProfile, 'welcome', company.contactEmail)));
      emailResults.forEach((result, index) => {
        const row = results.find((entry) => entry.status === 'created' && entry.email === toCreate[index][0]);
        if (row) row.emailSent = result.status === 'fulfilled';
      });
      return res.status(200).json({
        createdCount: toCreate.length,
        skippedCount: results.length - toCreate.length,
        results,
      });
    }

    if (view === 'unsubscribe' && req.method === 'GET') {
      const token = String(req.query?.token || '');
      if (!/^[a-f0-9]{64}$/.test(token)) {
        return res.status(400).json({ message: 'This unsubscribe link is invalid or incomplete.' });
      }
      const contacts = await getMarketingContactRows(sheets);
      const contact = contacts.find((row) => row[5] === token && String(row[2] || '').toLowerCase() === 'subscribed');
      const message = contact
        ? 'Confirm that you want to unsubscribe from MY THAI THAI marketing emails.'
        : 'This email address is already unsubscribed, or this link is no longer valid.';
      const form = contact
        ? `<form method="post" action="/api/booking?view=unsubscribe&amp;token=${encodeURIComponent(token)}"><input type="hidden" name="token" value="${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`
        : '';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title><body style="font:16px Arial,sans-serif;background:#f3f5f4;color:#18251f;padding:32px"><main style="max-width:520px;margin:10vh auto;background:white;border:1px solid #e2e9e5;border-radius:16px;padding:28px"><h1 style="font-size:22px">Email preferences</h1><p>${message}</p>${form}<style>button{background:#073d32;color:white;border:0;border-radius:8px;padding:12px 18px;font-weight:bold;cursor:pointer}</style></main></body></html>`);
    }

    if (view === 'unsubscribe' && req.method === 'POST') {
      const token = String(req.query?.token || req.body?.token || '');
      if (!/^[a-f0-9]{64}$/.test(token)) {
        return res.status(400).json({ message: 'This unsubscribe link is invalid or incomplete.' });
      }
      const contacts = await getMarketingContactRows(sheets);
      const rowIndex = contacts.findIndex((row) => row[5] === token && String(row[2] || '').toLowerCase() === 'subscribed');
      if (rowIndex < 0) {
        return res.status(200).json({ status: 'already_unsubscribed' });
      }
      const row = contacts[rowIndex];
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: `MarketingContacts!C${rowIndex + 2}:G${rowIndex + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values: [['unsubscribed', row[3] || '', row[4] || '', row[5], new Date().toISOString()]] },
      });
      if (req.headers['list-unsubscribe'] || req.body?.['List-Unsubscribe']) {
        return res.status(200).json({ status: 'unsubscribed' });
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title><body style="font:16px Arial,sans-serif;background:#f3f5f4;color:#18251f;padding:32px"><main style="max-width:520px;margin:10vh auto;background:white;border:1px solid #e2e9e5;border-radius:16px;padding:28px"><h1 style="font-size:22px">You are unsubscribed</h1><p>You will no longer receive marketing emails from MY THAI THAI. Booking and receipt emails are not affected.</p></main></body></html>');
    }

    if (req.method === 'GET' && view === 'campaign-audience-options') {
      const bigquery = getBigQueryClient();
      const [bookingResult, membersResult] = await Promise.all([
        bqFetchBookingRows(bigquery),
        bqLoyaltyValuesGet('LoyaltyMembers!A:J'),
      ]);
      const allRows = bookingResult.data.values || [];
      const bookingRows = allRows[0]?.[0] === 'Booking ID' ? allRows.slice(1) : allRows;
      const memberRows = (membersResult.data.values || []).slice(1);
      const options = audienceFilterOptions(bookingRows);
      const usedTiers = new Set(memberRows.map((row) => String(row[5] || 'regular').toLowerCase()));
      return res.status(200).json({
        branches: options.branches,
        services: options.services,
        membershipTypes: options.membershipTypes.filter((tier) => usedTiers.has(tier)),
        weekdays: options.weekdays,
        geminiReady: Boolean(GEMINI_API_KEY),
        geminiBlockReason: GEMINI_API_KEY
          ? ''
          : 'Add GEMINI_API_KEY to Vercel Environment Variables and redeploy to enable Gemini audience matching. Keyword matching is used until then.',
      });
    }

    if (req.method === 'POST' && view === 'campaign-audience') {
      const bigquery = getBigQueryClient();
      const audience = await resolveMarketingAudience(sheets, bigquery, readAudienceRequest(req.body));
      const businessProfile = await getBusinessProfile(sheets);
      const sendBlockReason = getCampaignSendBlockReason(businessProfile);
      return res.status(200).json({
        description: audience.criteria.description,
        count: audience.recipients.length,
        subscriberCount: audience.subscriberCount,
        sampleNames: audience.recipients.slice(0, 3).map((recipient) => recipient.name || 'Subscriber'),
        senderEmail: MARKETING_SENDER_EMAIL,
        audienceMode: audience.criteria.source,
        removedContacts: audience.removedContacts,
        copyAssistantReady: Boolean(GEMINI_API_KEY),
        copyAssistantBlockReason: GEMINI_API_KEY
          ? ''
          : 'Add GEMINI_API_KEY to Vercel Environment Variables and redeploy to enable AI campaign writing.',
        sendReady: !sendBlockReason,
        sendBlockReason,
      });
    }

    if (req.method === 'POST' && view === 'campaign-generate') {
      const bigquery = getBigQueryClient();
      const audience = await resolveMarketingAudience(sheets, bigquery, readAudienceRequest(req.body));
      const draft = await generateCampaignCopy(
        req.body?.goal,
        audience.criteria.description,
        audience.recipients.length,
      );
      return res.status(200).json({
        draft,
        audienceDescription: audience.criteria.description,
        audienceCount: audience.recipients.length,
      });
    }

    if (req.method === 'POST' && view === 'campaign-send') {
      const campaign = {
        subject: String(req.body?.subject || '').trim(),
        preview: String(req.body?.preview || '').trim(),
        message: String(req.body?.message || '').trim(),
      };
      if (!campaign.subject || campaign.subject.length > 180 || /[\r\n]/.test(campaign.subject)) {
        return res.status(400).json({ message: 'Enter a subject line of 1-180 characters.' });
      }
      if (campaign.preview.length > 200 || !campaign.message || campaign.message.length > 5000) {
        return res.status(400).json({ message: 'Preview text must be 200 characters or fewer and the message must be 1-5000 characters.' });
      }
      const bigquery = getBigQueryClient();
      const audience = await resolveMarketingAudience(sheets, bigquery, readAudienceRequest(req.body));
      if (audience.recipients.length === 0) {
        return res.status(409).json({ message: 'This audience has no active, opted-in recipients.' });
      }
      if (audience.recipients.length > 50) {
        return res.status(409).json({ message: `This audience has ${audience.recipients.length} subscribers. Campaigns are limited to 50 recipients; narrow the audience in chat and try again.` });
      }
      const businessProfile = await getBusinessProfile(sheets);
      const sendBlockReason = getCampaignSendBlockReason(businessProfile);
      if (sendBlockReason) return res.status(409).json({ message: sendBlockReason });
      const gmail = createGmailApi();
      const results = { sent: 0, failed: 0 };
      const deliveryLog = [];
      const sentAt = new Date().toISOString();
      for (const recipient of audience.recipients) {
        try {
          const unsubscribeUrl = getCampaignUnsubscribeUrl(req, recipient.token);
          await sendMarketingEmail(gmail, campaign, recipient, businessProfile, unsubscribeUrl);
          results.sent += 1;
          deliveryLog.push({ email: recipient.email, name: recipient.name, deliveryStatus: 'SENT', sentAt });
        } catch (error) {
          results.failed += 1;
          deliveryLog.push({ email: recipient.email, name: recipient.name, deliveryStatus: 'FAILED', sentAt });
          console.error('Marketing campaign delivery failed:', error.message || error);
        }
      }
      // Every send is logged to BigQuery with a campaign ID for future reference/audit,
      // even if the logging itself fails — a logging error must never block delivery results.
      const campaignId = crypto.randomUUID();
      try {
        await bqLogCampaignSend(bigquery, campaignId, {
          sentAt,
          senderEmail: MARKETING_SENDER_EMAIL,
          subject: campaign.subject,
          preview: campaign.preview,
          message: campaign.message,
          goal: String(req.body?.goal || ''),
          audienceQuery: audience.criteria.query,
          audienceDescription: audience.criteria.description,
          recipientCount: audience.recipients.length,
          sentCount: results.sent,
          failedCount: results.failed,
          status: results.failed === 0 ? 'SENT' : (results.sent === 0 ? 'FAILED' : 'PARTIAL'),
        });
        await bqLogCampaignRecipients(bigquery, campaignId, deliveryLog);
      } catch (error) {
        console.error('Campaign log write to BigQuery failed:', error.message || error);
      }
      return res.status(200).json({
        ...results,
        campaignId,
        audienceCount: audience.recipients.length,
        description: audience.criteria.description,
      });
    }

    if (req.method === 'GET' && view === 'campaign-log') {
      const bigquery = getBigQueryClient();
      const campaigns = await bqFetchRecentCampaigns(bigquery, req.query?.limit || 25);
      return res.status(200).json({ campaigns });
    }

    if (req.query?.view === 'therapist-dashboard' || req.query?.view === 'therapist-session') {
      res.setHeader('Cache-Control', 'no-store');
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

    if (req.method === 'GET' && view === 'therapist-accounts') {
      const accountsResult = await sheets.spreadsheets.values.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistAccounts!A:F',
      }).catch((error) => {
        if (error.code === 400) return { data: { values: [] } };
        throw error;
      });
      const accounts = (accountsResult.data.values || [])
        .filter((row) => row[0] && row[0] !== 'Therapist ID')
        .map((row) => ({
          id: row[0],
          username: row[1] || '',
          name: row[2] || '',
          status: String(row[4] || 'pending').toLowerCase(),
          createdAt: row[5] || '',
        }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return res.status(200).json({ accounts });
    }

    if (req.method === 'POST' && view === 'therapist-account-status') {
      const id = String(req.body?.id || '').trim();
      const status = String(req.body?.status || '').trim().toLowerCase();
      if (!id || id.length > 100 || !['approved', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ message: 'A therapist account and a valid status are required.' });
      }
      const accountsResult = await sheets.spreadsheets.values.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistAccounts!A:F',
      }).catch((error) => {
        if (error.code === 400) return { data: { values: [] } };
        throw error;
      });
      const rows = accountsResult.data.values || [];
      const rowIndex = rows.findIndex((row) => row[0] === id && row[0] !== 'Therapist ID');
      if (rowIndex < 0) return res.status(404).json({ message: 'Therapist account was not found.' });
      await sheets.spreadsheets.values.update({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: `TherapistAccounts!E${rowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[status]] },
      });
      const row = rows[rowIndex];
      return res.status(200).json({
        account: { id: row[0], username: row[1] || '', name: row[2] || '', status, createdAt: row[5] || '' },
      });
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
        return res.status(403).json({ message: sheetAccount.status === 'rejected' ? 'Your account request was not approved. Please contact the owner.' : 'Your account is awaiting administrator approval.' });
      }
      if (!account || !verifyPassword(req.body?.password, account.passwordHash)) {
        return res.status(401).json({ message: 'Invalid therapist username or password' });
      }
      res.setHeader('Set-Cookie', therapistCookie(signTherapistSession(account.id), 8 * 60 * 60));
      return res.status(200).json({ therapist: { id: account.id, name: account.name } });
    }

    if (req.query?.view === 'therapist-dashboard') {
      const bigquery = getBigQueryClient();
      const [bookingResult, historyResult, roster, allBranches] = await Promise.all([
        bqFetchBookingRows(bigquery),
        bqPatientHistoryValuesGet(bigquery, sheets),
        getTherapists(sheets),
        getBranches(sheets),
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
      await ensureTherapistProfilesSheet(sheets);
      const professionalProfilesResult = await sheets.spreadsheets.values.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistProfiles!A:G',
      });
      const professionalProfileRow = (professionalProfilesResult.data.values || [])
        .slice(1)
        .find((row) => row[0] === session.therapistId) || [];
      await ensureTherapistNotesSheet(sheets);
      const therapistNotesResult = await sheets.spreadsheets.values.get({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'TherapistNotes!A:G',
      });
      const therapistNotes = (therapistNotesResult.data.values || []).slice(1)
        .filter((row) => row[1] === session.therapistId && row[0])
        .map((row) => ({
          noteId: row[0],
          bookingId: row[2] || '',
          patientName: row[3] || '',
          category: row[4] || 'Treatment note',
          note: row[5] || '',
          createdAt: row[6] || '',
        }))
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
      const therapistBookings = bookings.filter((row) => row[6] === account.name);
      const upcoming = therapistBookings.filter((row) => row[7] >= new Date().toISOString().slice(0, 10))
        .sort((first, second) => `${first[7]} ${first[8]}`.localeCompare(`${second[7]} ${second[8]}`))
        .map((row) => {
          const history = histories.find((candidate) => candidate[0] === row[0]);
          const conditionLabels = ['Heart condition', 'Blood pressure', 'Diabetes', 'Cancer', 'Headaches', 'Bone or joint concern', 'Broken bones', 'Osteoporosis', 'Allergies', 'Surgeries', 'Numbness', 'Skin sensitivity', 'Pregnancy', 'Medications'];
          const conditionFlags = history
            ? [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
              .map((index, conditionIndex) => String(history[index] || '').toLowerCase() === 'yes' ? conditionLabels[conditionIndex] : '')
              .filter(Boolean)
            : [];
          return {
            bookingId: row[0], patientName: row[1], date: row[7], time: row[8],
            serviceName: row[5], branchName: row[4], durationMinutes: Number(row[12]) || 0, pressure: history?.[28] || '',
            painAreas: history?.[26] || '', bodyAreas: history?.[27] || '',
            hasReportedConditions: conditionFlags.length > 0, reportedConditionCount: conditionFlags.length, conditionFlags,
            allergiesToOil: history?.[19] === 'Yes', additionalDetails: history?.[25] || '',
            patientPhone: history?.[5] || row[2] || '', patientEmail: history?.[6] || row[3] || '',
            dateOfBirth: history?.[3] || '', gender: history?.[4] || '',
            medications: history?.[24] || '', historyCreatedAt: history?.[1] || '',
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
          phone: row[2] || '',
          email: row[3] || '',
          status: 'Completed',
        }));
      const patientIdentity = (row) => {
        const email = String(row[3] || '').trim().toLowerCase();
        const phone = String(row[2] || '').replace(/\D/g, '');
        return email ? `email:${email}` : phone ? `phone:${phone}` : `name:${String(row[1] || '').trim().toLowerCase()}`;
      };
      const bookedPatientIdentities = new Set(
        therapistBookings.filter((row) => row[7] >= new Date().toISOString().slice(0, 10)).map(patientIdentity),
      );
      const latestPastBookings = new Map();
      attended.forEach((appointment) => {
        const sourceRow = therapistBookings.find((row) => row[0] === appointment.bookingId);
        if (!sourceRow) return;
        const identity = patientIdentity(sourceRow);
        const current = latestPastBookings.get(identity);
        if (!current || `${appointment.date} ${appointment.time}` > `${current.date} ${current.time}`) {
          latestPastBookings.set(identity, { ...appointment, phone: sourceRow[2] || '', email: sourceRow[3] || '' });
        }
      });
      const todayUtc = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
      const rebookingReminders = [...latestPastBookings.entries()]
        .filter(([identity]) => !bookedPatientIdentities.has(identity))
        .map(([, appointment]) => ({
          ...appointment,
          daysSinceLastVisit: Math.floor((todayUtc.getTime() - new Date(`${appointment.date}T00:00:00Z`).getTime()) / 86400000),
        }))
        .filter((appointment) => Number.isFinite(appointment.daysSinceLastVisit) && appointment.daysSinceLastVisit >= 30)
        .sort((first, second) => second.daysSinceLastVisit - first.daysSinceLastVisit);
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
      const rosterEntry = roster.find((item) => String(item.name || '').trim().toLowerCase() === String(account.name || '').trim().toLowerCase());
      const branchById = new Map(allBranches.map((branch) => [Number(branch.id), branch.name]));
      const myUnavailability = (await getUnavailabilityBlocks(sheets))
        .filter((block) => block.scope === 'therapist' && block.therapistName === account.name)
        .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
      const weeklySchedule = WEEKDAY_KEYS.map((dayKey) => {
        const branchId = rosterEntry?.schedule?.[dayKey];
        return { day: dayKey, branchId: branchId || null, branchName: branchId ? (branchById.get(Number(branchId)) || null) : null };
      });
      const todayBranchId = rosterEntry ? (() => {
        const todayKey = weekdayKeyForDate(new Date().toISOString().slice(0, 10));
        const scheduled = rosterEntry.schedule?.[todayKey];
        if (scheduled) return Number(scheduled);
        const hasAnySchedule = WEEKDAY_KEYS.some((key) => rosterEntry.schedule?.[key]);
        return hasAnySchedule ? null : (rosterEntry.branches?.[0] || null);
      })() : null;
      return res.status(200).json({
        therapist: { name: account.name },
        professionalProfile: {
          email: professionalProfileRow[1] || '',
          phone: professionalProfileRow[2] || '',
          specialties: professionalProfileRow[3] || '',
          certifications: professionalProfileRow[4] || '',
          bio: professionalProfileRow[5] || '',
          updatedAt: professionalProfileRow[6] || '',
        },
        appointments: upcoming,
        patientNotes: therapistNotes,
        rebookingReminders,
        calendarEvents,
        calendarDate,
        calendarView,
        myUnavailability,
        profile: {
          branchNames,
          attendedHours,
          attendedClientCount: attended.length,
          weeklySchedule,
          todayBranchName: todayBranchId ? (branchById.get(Number(todayBranchId)) || null) : null,
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
          range: 'BusinessProfile!A1:I2',
        });
        const row = result.data.values?.[1] || [];
        const profile = Object.fromEntries(BUSINESS_PROFILE_FIELDS.map((field, index) => [
          field,
          row[index] === undefined ? DEFAULT_BUSINESS_PROFILE[field] : row[index],
        ]));
        return res.status(200).json({ profile });
      }

      if (req.query?.view === 'patient-history') {
        const result = await bqPatientHistoryValuesGet(getBigQueryClient(), sheets);
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

      if (req.query?.view === 'appointment-notes') {
        const bookingId = String(req.query?.bookingId || '').trim();
        if (!bookingId || bookingId.length > 100) {
          return res.status(400).json({ message: 'A valid booking ID is required' });
        }
        await ensureAppointmentNotesSheet(sheets);
        const result = await sheets.spreadsheets.values.get({
          spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
          range: 'AppointmentNotes!A:E',
        });
        const rows = (result.data.values || []).slice(1);
        const notes = rows
          .filter((row) => row[0] && row[1] === bookingId)
          .map((row) => ({
            noteId: row[0],
            bookingId: row[1] || '',
            note: row[2] || '',
            createdBy: row[3] || '',
            createdAt: row[4] || '',
          }))
          .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
        return res.status(200).json({ notes });
      }

      if (req.query?.view === 'find-booking') {
        const bookingId = String(req.query?.bookingId || '').trim();
        const email = String(req.query?.email || '').trim().toLowerCase();
        if (!bookingId || bookingId.length > 100 || !email) {
          return res.status(400).json({ message: 'A booking reference and the email used at booking are required.' });
        }
        const bigquery = getBigQueryClient();
        const result = await bqFetchBookingRows(bigquery);
        const rows = result.data.values || [];
        const hasHeader = rows[0]?.[0] === 'Booking ID';
        const startIndex = hasHeader ? 1 : 0;
        const rowIndex = rows.findIndex((row, index) =>
          index >= startIndex &&
          String(row[0] || '') === bookingId &&
          String(row[3] || '').trim().toLowerCase() === email,
        );
        if (rowIndex < 0) {
          return res.status(404).json({ message: 'We could not find a booking with that reference and email. Double-check both and try again.' });
        }
        const row = rows[rowIndex];
        const status = row[24] || '';
        const { hoursUntil, eligible } = computeBookingRefundEligibility(row[7], row[8]);
        return res.status(200).json({
          booking: {
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
            status,
            statusNotes: row[25] || '',
            isCouple: /couple/i.test(row[5] || ''),
          },
          cancelled: status === 'Cancelled',
          hoursUntilAppointment: hoursUntil,
          refundEligible: eligible,
        });
      }

      if (req.query?.view === 'calendar') {
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        const branch = String(req.query.branch || '').toLowerCase();
        const therapist = String(req.query.therapist || '').toLowerCase();
        const bigquery = getBigQueryClient();
        const sheetResult = await bqFetchBookingRows(bigquery);
        const sheetRows = sheetResult.data.values || [];
        const hasHeader = sheetRows[0]?.[0] === 'Booking ID';
        const dataRows = hasHeader ? sheetRows.slice(1) : sheetRows;
        const bookingByEventId = new Map(dataRows
          .map((row) => [row[16], row])
          .filter(([id]) => id));
        const calendarIds = [...new Set([
          PRIMARY_CALENDAR_ID,
          ...dataRows.map((row) => row[15]).filter(Boolean),
        ])];
        const calendars = await calendarApi.calendarList.list({ minAccessRole: 'reader', maxResults: 250 });
        const events = [];
        const calendarErrors = [];
        const pendingAutoLinks = [];

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
              const end = event.end?.dateTime || event.end?.date || '';
              const localStart = start ? getLocalDateTime(start) : { date: '', time: '' };
              const bookingRow = bookingByEventId.get(event.id);
              const parsedDescription = parseBookingFieldsFromDescription(event.description || '');
              const eventTherapist = bookingRow?.[6] || parsedDescription.therapistName || getTherapistFromDescription(event.description);
              if (
                localStart.date === date &&
                (!branch || location.toLowerCase().includes(branch)) &&
                (!therapist || eventTherapist.toLowerCase() === therapist)
              ) {
                let booking = bookingRow ? {
                  id: bookingRow[0] || '',
                  customerName: bookingRow[1] || '',
                  phone: bookingRow[2] || '',
                  email: bookingRow[3] || '',
                  branchName: bookingRow[4] || '',
                  serviceName: bookingRow[5] || '',
                  therapistName: bookingRow[6] || '',
                  date: bookingRow[7] || localStart.date,
                  time: bookingRow[8] || localStart.time,
                  paymentOption: bookingRow[9] || '',
                  paidAmount: Number(bookingRow[10]) || 0,
                  total: Number(bookingRow[11]) || 0,
                  durationMinutes: Number(bookingRow[12]) || 0,
                  receiptNumber: bookingRow[18] || '',
                  receiptEmailStatus: bookingRow[20] || '',
                  status: bookingRow[24] || '',
                  statusNotes: bookingRow[25] || '',
                } : null;

                if (!booking) {
                  // Automatically create a linked booking record for calendar events
                  // that were never written to Sheet1 (e.g. a walk-in typed directly
                  // into Google Calendar, or a booking whose sheet write failed).
                  // Structured fields from the event description (written by the
                  // booking flow) are used when present; otherwise best-effort
                  // values are derived from the event summary/location.
                  const [summaryService, summaryName] = String(event.summary || '').split(' - ');
                  const autoDurationMinutes = start && end ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000)) : 0;
                  const autoBookingId = crypto.randomUUID();
                  const autoCustomerName = parsedDescription.customerName || (summaryName || '').trim() || 'Walk-in customer';
                  const autoServiceName = parsedDescription.serviceName || (summaryService || '').trim() || event.summary || '';
                  const autoRow = [
                    autoBookingId,
                    autoCustomerName,
                    parsedDescription.phone || '',
                    parsedDescription.email || '',
                    location,
                    autoServiceName,
                    eventTherapist,
                    localStart.date,
                    localStart.time,
                    parsedDescription.paymentOption || '',
                    parsedDescription.paidAmount || 0,
                    parsedDescription.total || 0,
                    autoDurationMinutes,
                    '',
                    '',
                    calendarId,
                    event.id,
                    new Date().toISOString(),
                    '', '', '', '', '', '',
                  ];
                  pendingAutoLinks.push(autoRow);
                  booking = {
                    id: autoBookingId,
                    customerName: autoCustomerName,
                    phone: parsedDescription.phone || '',
                    email: parsedDescription.email || '',
                    branchName: location,
                    serviceName: autoServiceName,
                    therapistName: eventTherapist,
                    date: localStart.date,
                    time: localStart.time,
                    paymentOption: parsedDescription.paymentOption || '',
                    paidAmount: parsedDescription.paidAmount || 0,
                    total: parsedDescription.total || 0,
                    durationMinutes: autoDurationMinutes,
                    receiptNumber: '',
                    receiptEmailStatus: '',
                    status: '',
                    statusNotes: '',
                    autoLinked: true,
                  };
                }

                events.push({
                  id: event.id,
                  calendarId,
                  calendarName: calendar?.summary || calendarId,
                  summary: event.summary || '',
                  location,
                  description: event.description || '',
                  start,
                  end,
                  therapistName: eventTherapist,
                  localTime: localStart.time,
                  isCouple: /couple/i.test(booking.serviceName || event.summary || ''),
                  booking,
                });
              }
            }
          } catch (error) {
            console.error(`Unable to load calendar ${calendarId}:`, error);
            calendarErrors.push(`${calendarId}: ${error.message || 'access denied'}`);
          }
        }

        if (pendingAutoLinks.length > 0) {
          await bqAppendBookingRows(bigquery, pendingAutoLinks);
        }

        const unavailability = (await getUnavailabilityBlocks(sheets))
          .filter((block) => block.date === date)
          .filter((block) => block.scope !== 'business' || !branch || !block.branchName || block.branchName.toLowerCase() === branch)
          .filter((block) => block.scope !== 'therapist' || !therapist || block.therapistName.toLowerCase() === therapist)
          .map((block) => ({
            id: block.id,
            scope: block.scope,
            branchName: block.branchName,
            therapistName: block.therapistName,
            startTime: block.startTime,
            endTime: block.endTime,
            reason: block.reason,
          }));

        return res.status(200).json({
          date,
          calendarId: PRIMARY_CALENDAR_ID,
          calendarUrl: `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(PRIMARY_CALENDAR_ID)}`,
          events,
          errors: calendarErrors,
          unavailability,
        });
      }

      const result = await bqFetchBookingRows(getBigQueryClient());
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
          receiptNumber: row[18] || '',
          receiptIssuedAt: row[19] || '',
          receiptEmailStatus: row[20] || '',
          status: row[24] || '',
          statusNotes: row[25] || '',
          isCouple: /couple/i.test(row[5] || ''),
          syncedToSheets: true,
        })),
      });
    }

    if (req.method === 'POST' && req.query?.view === 'complete-booking-details') {
      const bookingId = String(req.body?.bookingId || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const phone = String(req.body?.phone || '').trim();
      const total = req.body?.total === undefined || req.body?.total === '' ? null : Number(req.body.total);
      const paidAmount = req.body?.paidAmount === undefined || req.body?.paidAmount === '' ? null : Number(req.body.paidAmount);
      const paymentOption = String(req.body?.paymentOption || '').trim();

      if (!bookingId || bookingId.length > 100) {
        return res.status(400).json({ message: 'A valid booking ID is required' });
      }
      if (email && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
        return res.status(400).json({ message: 'Enter a valid patient email address' });
      }
      if (total !== null && (Number.isNaN(total) || total <= 0)) {
        return res.status(400).json({ message: 'Enter a valid appointment total' });
      }
      if (paidAmount !== null && (Number.isNaN(paidAmount) || paidAmount < 0)) {
        return res.status(400).json({ message: 'Enter a valid amount paid' });
      }

      const bigquery = getBigQueryClient();
      const result = await bqFetchBookingRows(bigquery);
      const rows = result.data.values || [];
      const hasHeader = rows[0]?.[0] === 'Booking ID';
      const startIndex = hasHeader ? 1 : 0;
      const rowIndex = rows.findIndex((row, index) => index >= startIndex && String(row[0] || '') === bookingId);
      if (rowIndex < 0) return res.status(404).json({ message: 'Booking was not found' });

      const row = rows[rowIndex];
      const resolvedTotal = total !== null ? total : (Number(row[11]) || 0);
      if (readPackageUsage(row[14])) return res.status(409).json({ message: 'Package-linked booking amounts and contact details are locked to preserve its usage record and receipt.' });
      const resolvedPaid = paidAmount !== null ? paidAmount : (Number(row[10]) || 0);
      if (resolvedPaid > resolvedTotal + 0.005) {
        return res.status(400).json({ message: 'The amount paid cannot exceed the appointment total' });
      }
      const updatedRow = {
        email: email || row[3] || '',
        phone: phone || row[2] || '',
        paymentOption: paymentOption || row[9] || '',
        paidAmount: resolvedPaid,
        total: resolvedTotal,
      };
      await bqUpdateBookingFields(bigquery, bookingId, {
        phone: updatedRow.phone,
        email: updatedRow.email,
        paymentOption: updatedRow.paymentOption,
        paidAmount: updatedRow.paidAmount,
        total: updatedRow.total,
      });

      return res.status(200).json({
        booking: {
          id: row[0] || '',
          customerName: row[1] || '',
          phone: updatedRow.phone,
          email: updatedRow.email,
          branchName: row[4] || '',
          serviceName: row[5] || '',
          therapistName: row[6] || '',
          date: row[7] || '',
          time: row[8] || '',
          paymentOption: updatedRow.paymentOption,
          paidAmount: updatedRow.paidAmount,
          total: updatedRow.total,
          durationMinutes: Number(row[12]) || 0,
          receiptNumber: row[18] || '',
          receiptEmailStatus: row[20] || '',
          autoLinked: true,
        },
      });
    }

    if (req.method === 'POST' && req.query?.view === 'square-create-checkout') {
      if (!isSquareConfigured()) {
        return res.status(503).json({ message: 'Online payments are not configured yet. Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID to enable this.' });
      }
      const bookingId = String(req.body?.bookingId || '').trim();
      const requestedAmount = Math.round((Number(req.body?.amount) || 0) * 100) / 100;
      if (!bookingId || bookingId.length > 100) {
        return res.status(400).json({ message: 'A valid booking ID is required' });
      }
      if (!(requestedAmount > 0)) {
        return res.status(400).json({ message: 'Enter a valid payment amount' });
      }
      const result = await bqFetchBookingRows(getBigQueryClient());
      const rows = result.data.values || [];
      const hasHeader = rows[0]?.[0] === 'Booking ID';
      const startIndex = hasHeader ? 1 : 0;
      const rowIndex = rows.findIndex((row, index) => index >= startIndex && String(row[0] || '') === bookingId);
      if (rowIndex < 0) return res.status(404).json({ message: 'Booking was not found' });
      const row = rows[rowIndex];
      const total = Number(row[11]) || 0;
      const paidAmount = Number(row[10]) || 0;
      const remaining = Math.round((total - paidAmount) * 100) / 100;
      if (readPackageUsage(row[14])) return res.status(409).json({ message: 'This appointment is covered by a prepaid package; no new payment is due.' });
      if (remaining <= 0) {
        return res.status(409).json({ message: 'This booking is already fully paid' });
      }
      if (requestedAmount > remaining + 0.005) {
        return res.status(400).json({ message: `The payment amount cannot exceed the remaining balance of $${remaining.toFixed(2)}` });
      }
      const email = String(row[3] || '').trim();
      const customerName = String(row[1] || '').trim();
      await ensureLoyaltyTables();
      const idempotencyKey = crypto.randomUUID();
      const businessProfile = await getBusinessProfile(sheets);
      const businessName = businessProfile?.name || 'My Thai Thai Massage';
      const purpose = requestedAmount + 0.005 >= remaining ? 'full' : 'deposit';
      const payment = await squareRequest('POST', '/v2/online-checkout/payment-links', {
        idempotency_key: idempotencyKey,
        quick_pay: {
          name: `${businessName} - Booking ${bookingId}`,
          price_money: { amount: Math.round(requestedAmount * 100), currency: 'CAD' },
          location_id: SQUARE_LOCATION_ID,
        },
        checkout_options: {
          redirect_url: `${req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}/?paymentComplete=1&bookingId=${encodeURIComponent(bookingId)}`,
        },
        payment_note: `Booking ${bookingId} (${purpose} payment)`,
      });
      const paymentLink = payment?.payment_link;
      if (!paymentLink?.url) {
        return res.status(502).json({ message: 'Square did not return a payment link. Please try again.' });
      }
      await bqInsertSquarePayment(getBigQueryClient(), {
        paymentLinkId: paymentLink.id || '',
        orderId: paymentLink.order_id || '',
        bookingId,
        amount: requestedAmount,
        status: 'PENDING',
        email,
        createdAt: new Date().toISOString(),
        purpose,
        squarePaymentId: '',
      });
      return res.status(200).json({
        url: paymentLink.url,
        paymentLinkId: paymentLink.id || '',
        orderId: paymentLink.order_id || '',
        amount: requestedAmount,
        customerName,
      });
    }

    if (req.method === 'POST' && req.query?.view === 'square-webhook') {
      if (!SQUARE_WEBHOOK_SIGNATURE_KEY) {
        return res.status(503).json({ message: 'Square webhook signature key is not configured' });
      }
      if (!isValidSquareWebhookSignature(req, rawRequestBody)) {
        return res.status(401).json({ message: 'Invalid Square webhook signature' });
      }
      const eventType = String(req.body?.type || '');
      const paymentObject = req.body?.data?.object?.payment;
      if (!['payment.updated', 'payment.created'].includes(eventType) || !paymentObject) {
        return res.status(200).json({ received: true });
      }
      if (paymentObject.status !== 'COMPLETED') {
        return res.status(200).json({ received: true });
      }
      if (!process.env.GOOGLE_SPREADSHEET_ID) {
        throw new Error('GOOGLE_SPREADSHEET_ID is not configured');
      }
      const orderId = String(paymentObject.order_id || '');
      const squarePaymentId = String(paymentObject.id || '');
      const bigquery = getBigQueryClient();
      const paymentRecord = await bqFindSquarePaymentByOrderId(bigquery, orderId);
      if (!paymentRecord) {
        // Unknown or already-cleaned-up payment link; acknowledge so Square stops retrying.
        return res.status(200).json({ received: true, matched: false });
      }
      if (paymentRecord.status === 'COMPLETED') {
        return res.status(200).json({ received: true, alreadyProcessed: true });
      }
      const bookingId = paymentRecord.bookingId;
      const amountPaid = paymentRecord.amount;
      const payerEmail = paymentRecord.email.trim();
      await bqUpdateSquarePaymentByOrderId(bigquery, orderId, {
        status: 'COMPLETED',
        email: payerEmail,
        createdAt: paymentRecord.createdAt || new Date().toISOString(),
        purpose: paymentRecord.purpose || '',
        squarePaymentId,
      });

      const bookingResult = await bqFetchBookingRows(bigquery);
      const bookingRows = bookingResult.data.values || [];
      const bookingRowIndex = bookingRows.findIndex((row, index) => index > 0 && String(row[0] || '') === bookingId);
      let updatedPaid = amountPaid;
      let bookingTotal = 0;
      let customerName = '';
      if (bookingRowIndex >= 0) {
        const bookingRow = bookingRows[bookingRowIndex];
        bookingTotal = Number(bookingRow[11]) || 0;
        customerName = String(bookingRow[1] || '');
        const currentPaid = Number(bookingRow[10]) || 0;
        updatedPaid = Math.min(bookingTotal, Math.round((currentPaid + amountPaid) * 100) / 100);
        await bqUpdateBookingFields(bigquery, bookingId, { paidAmount: updatedPaid });
      }

      const businessProfile = await getBusinessProfile(sheets);
      if (payerEmail) {
        try {
          await sendFormattedLoyaltyEmail(createGmailApi(), {
            email: payerEmail,
            name: customerName,
            subject: 'Payment received',
            businessName: businessProfile?.name || 'My Thai Thai Massage',
            heading: 'Thank you for your payment!',
            intro: `We've received your payment of $${amountPaid.toFixed(2)} for booking ${bookingId}.`,
            details: [
              { label: 'Booking ID', value: bookingId },
              { label: 'Amount paid', value: `$${amountPaid.toFixed(2)}` },
              { label: 'Balance remaining', value: `$${Math.max(0, bookingTotal - updatedPaid).toFixed(2)}` },
            ],
            note: 'A receipt will be issued once your appointment is fully paid.',
          });
        } catch (error) {
          console.error('Square payment confirmation email error:', error.message || error);
        }

        try {
          const loyaltySettings = await getLoyaltySettings();
          if (loyaltySettings.enabled) {
            const membersResult = await bqLoyaltyValuesGet('LoyaltyMembers!A:J');
            const alreadyEnrolled = (membersResult.data.values || []).slice(1)
              .some((row) => normalizeLoyaltyEmail(row[0]) === normalizeLoyaltyEmail(payerEmail));
            if (!alreadyEnrolled) {
              const enrollment = await enrollLoyaltyMember(sheets, {
                email: payerEmail,
                customerName,
                phone: '',
              });
              try {
                await sendMembershipEmail(createGmailApi(), {
                  email: payerEmail,
                  name: customerName,
                  membershipType: enrollment.membershipType,
                  organization: '',
                  companyId: '',
                  companyContactEmail: '',
                  hoursBalance: enrollment.hoursBalance,
                  paidThrough: '',
                }, loyaltySettings, businessProfile, 'welcome', '');
              } catch (error) {
                console.error('Square auto-enrollment welcome email error:', error.message || error);
              }
            }
          }
        } catch (error) {
          console.error('Square auto-enrollment error:', error.message || error);
        }
      }

      return res.status(200).json({ received: true, matched: true, bookingId, updatedPaid });
    }

    if (req.method === 'POST' && req.query?.view === 'mark-paid') {
      const bookingId = String(req.body?.bookingId || '').trim();
      if (!bookingId || bookingId.length > 100) {
        return res.status(400).json({ message: 'A valid booking ID is required' });
      }
      const bigquery = getBigQueryClient();
      const result = await bqFetchBookingRows(bigquery);
      const rows = result.data.values || [];
      const hasHeader = rows[0]?.[0] === 'Booking ID';
      const startIndex = hasHeader ? 1 : 0;
      const rowIndex = rows.findIndex((row, index) => index >= startIndex && String(row[0] || '') === bookingId);
      if (rowIndex < 0) return res.status(404).json({ message: 'Booking was not found' });

      const row = rows[rowIndex];
      const total = Number(row[11]) || 0;
      if (total <= 0) {
        return res.status(409).json({ message: 'This booking does not have a valid appointment total' });
      }
      const paidAmount = Number(row[10]) || 0;
      if (paidAmount + 0.005 < total) {
        await bqUpdateBookingFields(bigquery, bookingId, { paidAmount: total });
      }
      return res.status(200).json({
        booking: {
          id: row[0] || '',
          customerName: row[1] || '',
          email: row[3] || '',
          paymentOption: row[9] || '',
          paidAmount: Math.max(paidAmount, total),
          total,
        },
        alreadyPaid: paidAmount + 0.005 >= total,
      });
    }

    if (req.method === 'POST' && req.query?.view === 'issue-receipt') {
      const bookingId = String(req.body?.bookingId || '').trim();
      if (!bookingId || bookingId.length > 100) {
        return res.status(400).json({ message: 'A valid booking ID is required' });
      }
      const bigquery = getBigQueryClient();
      const result = await bqFetchBookingRows(bigquery);
      const rows = result.data.values || [];
      const hasHeader = rows[0]?.[0] === 'Booking ID';
      const startIndex = hasHeader ? 1 : 0;
      const rowIndex = rows.findIndex((row, index) => index >= startIndex && String(row[0] || '') === bookingId);
      if (rowIndex < 0) return res.status(404).json({ message: 'Booking was not found' });

      const row = rows[rowIndex];
      const booking = {
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
      };
      const packageUsage = packageReceiptDetails(row[14]);
      if (historicalPackageVisit(row[0], row[5], row[14]) && !packageUsage) {
        return res.status(409).json({ message: 'Register/verify this customer package and link the visit in Package tracking before issuing its receipt.' });
      }
      if (packageUsage && (Math.abs(packageUsage.allocatedTotal - booking.total) > 0.005 || Math.abs(booking.paidAmount - booking.total) > 0.005)) {
        return res.status(409).json({ message: 'Package allocation and booking payment do not match. Reconcile the record before issuing a receipt.' });
      }
      if (!booking.email || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(booking.email)) {
        return res.status(400).json({ message: 'This appointment does not have a valid patient email address' });
      }
      if (booking.total <= 0 || booking.paidAmount + 0.005 < booking.total) {
        return res.status(409).json({ message: 'A receipt can only be issued when the appointment is fully paid' });
      }

      await ensureLoyaltyTables();
      const loyaltyLedgerResult = await bqLoyaltyValuesGet('LoyaltyLedger!A:J');
      const loyaltyMembersResult = await bqLoyaltyValuesGet('LoyaltyMembers!A:J');
      const loyaltyRows = (loyaltyLedgerResult.data.values || []).slice(1);
      const loyaltyMember = (loyaltyMembersResult.data.values || []).slice(1)
        .some((loyaltyRow) => normalizeLoyaltyEmail(loyaltyRow[0]) === normalizeLoyaltyEmail(booking.email));
      const linkedRedemptions = loyaltyRows
        .map((loyaltyRow, index) => ({ row: loyaltyRow, rowNumber: index + 2 }))
        .filter(({ row: loyaltyRow }) =>
          loyaltyRow[3] === 'REDEEM' &&
          normalizeLoyaltyEmail(loyaltyRow[1]) === normalizeLoyaltyEmail(booking.email) &&
          String(loyaltyRow[2] || '') === bookingId,
        );
      if (linkedRedemptions.length > 1) {
        return res.status(409).json({ message: 'Multiple loyalty redemptions are linked to this booking. Resolve the ledger entries before issuing a receipt.' });
      }
      const redemption = linkedRedemptions[0]?.row;
      if (packageUsage && (redemption || Number(row[22]) > 0 || Number(row[23]) > 0)) return res.status(409).json({ message: 'Package usage cannot be combined with loyalty or membership receipt discounts.' });
      const loyaltyDiscount = Number(redemption?.[5]) || 0;
      const pointsRedeemed = Math.abs(Number(redemption?.[4]) || 0);
      const membershipType = String(row[21] || '').toLowerCase();
      const savedMembershipDiscountPercent = Number(row[22]);
      const membershipDiscountPercent = Number.isFinite(savedMembershipDiscountPercent) ? savedMembershipDiscountPercent : 0;
      const savedMembershipDiscountAmount = Number(row[23]);
      const membershipDiscountAmount = Number.isFinite(savedMembershipDiscountAmount) ? Math.max(0, savedMembershipDiscountAmount) : 0;
      const pointsBalance = loyaltyRows
        .filter((loyaltyRow) => normalizeLoyaltyEmail(loyaltyRow[1]) === normalizeLoyaltyEmail(booking.email))
        .reduce((sum, loyaltyRow) => sum + (Number(loyaltyRow[4]) || 0), 0);
      const businessProfile = await getBusinessProfile(sheets);
      const isTaxExempt = /registered massage therapy|\brmt\b|acupuncture/i.test(booking.serviceName);
      const discountedSubtotal = packageUsage ? packageUsage.allocatedSubtotal : Math.round((isTaxExempt ? booking.total : booking.total / 1.13) * 100) / 100;
      if (loyaltyDiscount > discountedSubtotal + 0.005) {
        return res.status(409).json({ message: 'The loyalty redemption exceeds this receipt subtotal. Adjust the redemption before issuing this receipt.' });
      }
      const subtotal = Math.round((discountedSubtotal + membershipDiscountAmount) * 100) / 100;
      const receiptSubtotal = Math.round((discountedSubtotal - loyaltyDiscount) * 100) / 100;
      const tax = packageUsage ? packageUsage.allocatedTax : isTaxExempt ? 0 : Math.round(receiptSubtotal * 0.13 * 100) / 100;
      const receipt = {
        number: row[18] || `MTT-${new Date().getFullYear()}-${String(Math.floor(100000 + Math.random() * 900000))}`,
        issuedAt: row[19] || new Date().toISOString(),
        subtotal,
        tax,
        taxLabel: isTaxExempt ? 'HST exempt' : 'HST (13%)',
        total: Math.round((receiptSubtotal + tax) * 100) / 100,
        membershipDiscountAmount,
        membershipDiscountPercent,
        membershipDiscountLabel: membershipType === 'platinum'
          ? 'Platinum membership discount'
          : membershipType === 'silver'
            ? 'Silver corporate discount'
            : 'Membership discount',
        loyaltyDiscount,
        pointsRedeemed,
        pointsBalance,
        loyaltyMember,
        packageUsage,
      };
      await bqUpdateBookingFields(bigquery, bookingId, {
        receiptNumber: receipt.number,
        receiptIssuedAt: receipt.issuedAt,
        receiptEmailStatus: row[20] || 'pending',
      }, { notes: row[14], total: booking.total, paid: booking.paidAmount, receipt: row[18] });
      for (const { rowNumber } of linkedRedemptions) {
        await bqLoyaltyValuesUpdate(`LoyaltyLedger!J${rowNumber}`, [[receipt.number]]);
      }

      if (row[20] !== 'sent') {
        try {
          await sendReceiptEmail(createGmailApi(), booking, receipt, businessProfile);
        } catch (error) {
          await bqUpdateBookingFields(bigquery, bookingId, { receiptEmailStatus: 'failed' });
          throw new Error(`Receipt ${receipt.number} was created but could not be emailed: ${error.message}`);
        }
        await bqUpdateBookingFields(bigquery, bookingId, { receiptEmailStatus: 'sent' });
      }
      return res.status(200).json({
        receipt,
        booking,
        businessProfile,
        emailed: true,
        alreadyIssued: row[20] === 'sent',
      });
    }

    if (req.method === 'POST' && req.query?.view === 'appointment-note') {
      const bookingId = String(req.body?.bookingId || '').trim();
      const note = String(req.body?.note || '').trim();
      if (!bookingId || bookingId.length > 100) {
        return res.status(400).json({ message: 'A valid booking ID is required' });
      }
      if (!note || note.length > 2000) {
        return res.status(400).json({ message: 'Enter a note of no more than 2,000 characters.' });
      }
      const ownerSession = getOwnerSession(req);
      await ensureAppointmentNotesSheet(sheets);
      const savedNote = {
        noteId: crypto.randomUUID(),
        bookingId,
        note,
        createdBy: ownerSession?.name || ownerSession?.email || 'Owner',
        createdAt: new Date().toISOString(),
      };
      await sheets.spreadsheets.values.append({
        spreadsheetId: PATIENT_HISTORY_SPREADSHEET_ID,
        range: 'AppointmentNotes!A:E',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[savedNote.noteId, savedNote.bookingId, savedNote.note, savedNote.createdBy, savedNote.createdAt]],
        },
      });
      return res.status(201).json({ note: savedNote });
    }

    if (req.method === 'POST' && req.query?.view === 'delete-booking') {
      const bookingId = String(req.body?.bookingId || '').trim();
      if (!bookingId || bookingId.length > 100) {
        return res.status(400).json({ message: 'A valid booking ID is required' });
      }
      const bigquery = getBigQueryClient();
      const result = await bqFetchBookingRows(bigquery);
      const rows = result.data.values || [];
      const hasHeader = rows[0]?.[0] === 'Booking ID';
      const startIndex = hasHeader ? 1 : 0;
      const rowIndex = rows.findIndex((row, index) => index >= startIndex && String(row[0] || '') === bookingId);
      if (rowIndex < 0) return res.status(404).json({ message: 'Booking was not found' });

      const row = rows[rowIndex];
      const calendarId = row[15] || PRIMARY_CALENDAR_ID;
      const calendarEventId = row[16] || '';
      let calendarDeleted = false;
      if (readPackageUsage(row[14])) return res.status(409).json({ message: 'A package-linked visit cannot be deleted; its deduction must remain auditable.' });
      let calendarError = '';
      if (calendarEventId) {
        try {
          await calendarApi.events.delete({ calendarId, eventId: calendarEventId });
          calendarDeleted = true;
        } catch (error) {
          calendarError = error.message || 'The linked calendar event could not be removed.';
          console.error('Delete booking calendar cleanup error:', calendarError);
        }
      }
      await bqDeleteBookingRow(bigquery, bookingId);
      const removedContacts = await syncMarketingContactsWithDatabase(sheets, bigquery);
      return res.status(200).json({
        deleted: true,
        bookingId,
        calendarDeleted,
        calendarError,
        removedContacts,
      });
    }

    if (req.method === 'POST' && req.query?.view === 'delete-patient-history') {
      const bookingId = String(req.body?.bookingId || '').trim();
      const createdAt = String(req.body?.createdAt || '').trim();
      if (!bookingId || bookingId.length > 100) {
        return res.status(400).json({ message: 'A valid booking ID is required' });
      }
      const bigquery = getBigQueryClient();
      const deletedCount = await bqDeletePatientHistory(bigquery, sheets, bookingId, createdAt);
      if (!deletedCount) return res.status(404).json({ message: 'Patient history record was not found' });

      const removedContacts = await syncMarketingContactsWithDatabase(sheets, bigquery);
      return res.status(200).json({ deleted: true, bookingId, removedContacts });
    }

    if (req.method === 'POST' && req.query?.view === 'cancel-booking') {
      const bookingId = String(req.body?.bookingId || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!bookingId || bookingId.length > 100 || !email) {
        return res.status(400).json({ message: 'A booking reference and the email used at booking are required.' });
      }
      const bigquery = getBigQueryClient();
      const result = await bqFetchBookingRows(bigquery);
      const rows = result.data.values || [];
      const hasHeader = rows[0]?.[0] === 'Booking ID';
      const startIndex = hasHeader ? 1 : 0;
      const rowIndex = rows.findIndex((row, index) =>
        index >= startIndex &&
        String(row[0] || '') === bookingId &&
        String(row[3] || '').trim().toLowerCase() === email,
      );
      if (rowIndex < 0) {
        return res.status(404).json({ message: 'We could not find a booking with that reference and email.' });
      }
      const row = rows[rowIndex];
      if (row[24] === 'Cancelled') {
        return res.status(409).json({ message: 'This booking has already been cancelled.' });
      }
      const paidAmount = Number(row[10]) || 0;
      if (readPackageUsage(row[14])) return res.status(409).json({ message: 'A completed package-linked visit cannot be cancelled or refunded as a new payment.' });
      const { hoursUntil, eligible: refundEligible } = computeBookingRefundEligibility(row[7], row[8]);

      let refundIssued = false;
      let refundAmount = 0;
      let statusNotes = '';
      if (refundEligible && paidAmount > 0) {
        let squarePaymentIds = [];
        try {
          const completedPayments = await bqFindCompletedSquarePaymentsByBookingId(bigquery, bookingId);
          squarePaymentIds = completedPayments.map((paymentRow) => ({ paymentId: paymentRow.squarePaymentId, amount: paymentRow.amount }));
        } catch (error) {
          console.error('Cancel booking Square lookup error:', error.message || error);
        }
        if (squarePaymentIds.length) {
          try {
            for (const { paymentId, amount } of squarePaymentIds) {
              await squareRefundPayment(paymentId, Math.round(amount * 100), `Booking ${bookingId} cancelled more than 24 hours before appointment`);
              refundAmount += amount;
            }
            refundIssued = true;
            statusNotes = `Cancelled ${new Date().toISOString()} — $${refundAmount.toFixed(2)} refunded automatically to the original Square payment method.`;
          } catch (error) {
            statusNotes = `Cancelled ${new Date().toISOString()} — a refund of $${paidAmount.toFixed(2)} is owed but the automatic Square refund failed (${error.message || 'unknown error'}). Please refund manually.`;
          }
        } else {
          statusNotes = `Cancelled ${new Date().toISOString()} — a refund of $${paidAmount.toFixed(2)} is owed (paid via ${row[9] || 'unspecified method'}). Please process this refund manually.`;
        }
      } else if (paidAmount > 0) {
        statusNotes = `Cancelled ${new Date().toISOString()} — no refund issued (cancelled within 24 hours of the appointment).`;
      } else {
        statusNotes = `Cancelled ${new Date().toISOString()} — no payment was on file.`;
      }

      await bqUpdateBookingFields(bigquery, bookingId, { status: 'Cancelled', statusNotes });

      const calendarId = row[15] || PRIMARY_CALENDAR_ID;
      const calendarEventId = row[16] || '';
      if (calendarEventId) {
        try {
          await calendarApi.events.delete({ calendarId, eventId: calendarEventId });
        } catch (error) {
          console.error('Cancel booking calendar cleanup error:', error.message || error);
        }
      }

      let emailSent = false;
      try {
        const businessProfile = await getBusinessProfile(sheets);
        await sendFormattedLoyaltyEmail(createGmailApi(), {
          email: row[3],
          name: row[1] || '',
          subject: `Your ${businessProfile.businessName} appointment was cancelled`,
          businessName: businessProfile.businessName,
          heading: 'Appointment cancelled',
          intro: `Your appointment has been cancelled as requested.`,
          details: [
            { label: 'Booking reference', value: bookingId },
            { label: 'Service', value: row[5] || '' },
            { label: 'Original date & time', value: `${row[7]} at ${row[8]}` },
          ],
          note: statusNotes,
        });
        emailSent = true;
      } catch (error) {
        console.error('Cancel booking confirmation email error:', error.message || error);
      }

      return res.status(200).json({
        cancelled: true,
        bookingId,
        hoursUntilAppointment: hoursUntil,
        refundEligible,
        refundIssued,
        refundAmount,
        statusNotes,
        emailSent,
      });
    }

    if (req.method === 'POST' && req.query?.view === 'reschedule-booking') {
      const bookingId = String(req.body?.bookingId || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const newDate = String(req.body?.date || '').trim();
      const newTime = String(req.body?.time || '').trim();
      if (!bookingId || bookingId.length > 100 || !email) {
        return res.status(400).json({ message: 'A booking reference and the email used at booking are required.' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(newTime)) {
        return res.status(400).json({ message: 'Choose a valid new date and time.' });
      }
      const bigquery = getBigQueryClient();
      const result = await bqFetchBookingRows(bigquery);
      const rows = result.data.values || [];
      const hasHeader = rows[0]?.[0] === 'Booking ID';
      const startIndex = hasHeader ? 1 : 0;
      const rowIndex = rows.findIndex((row, index) =>
        index >= startIndex &&
        String(row[0] || '') === bookingId &&
        String(row[3] || '').trim().toLowerCase() === email,
      );
      if (rowIndex < 0) {
        return res.status(404).json({ message: 'We could not find a booking with that reference and email.' });
      }
      const row = rows[rowIndex];
      if (row[24] === 'Cancelled') {
        return res.status(409).json({ message: 'This booking has already been cancelled and cannot be rescheduled.' });
      }
      if (readPackageUsage(row[14])) return res.status(409).json({ message: 'A completed package-linked visit cannot be rescheduled.' });
      const { eligible: wasWithinPolicyWindow } = computeBookingRefundEligibility(row[7], row[8]);
      let newStartDateTime;
      try {
        newStartDateTime = parseBookingDateTime(newDate, newTime);
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
      const durationMinutes = Number(row[12]) || 60;
      const newEndDateTime = addMinutes(newStartDateTime, durationMinutes);
      const calendarId = row[15] || PRIMARY_CALENDAR_ID;
      const calendarEventId = row[16] || '';
      const originalDate = row[7] || '';
      const originalTime = row[8] || '';
      if (calendarEventId) {
        try {
          await calendarApi.events.patch({
            calendarId,
            eventId: calendarEventId,
            requestBody: {
              start: { dateTime: newStartDateTime, timeZone: CALENDAR_TIME_ZONE },
              end: { dateTime: newEndDateTime, timeZone: CALENDAR_TIME_ZONE },
            },
          });
        } catch (error) {
          console.error('Reschedule booking calendar update error:', error.message || error);
          return res.status(502).json({ message: 'The new time could not be saved to Google Calendar. Please try again or contact the clinic.' });
        }
      }
      const statusNotes = `Rescheduled ${new Date().toISOString()} from ${originalDate} ${originalTime} to ${newDate} ${newTime} — no refund, per cancellation/reschedule policy.`;
      await bqUpdateBookingFields(bigquery, bookingId, { date: newDate, time: newTime, statusNotes });

      let emailSent = false;
      try {
        const businessProfile = await getBusinessProfile(sheets);
        await sendFormattedLoyaltyEmail(createGmailApi(), {
          email: row[3],
          name: row[1] || '',
          subject: `Your ${businessProfile.businessName} appointment was rescheduled`,
          businessName: businessProfile.businessName,
          heading: 'Appointment rescheduled',
          intro: 'Your appointment has been moved to a new date and time.',
          details: [
            { label: 'Booking reference', value: bookingId },
            { label: 'Service', value: row[5] || '' },
            { label: 'Previous date & time', value: `${originalDate} at ${originalTime}` },
            { label: 'New date & time', value: `${newDate} at ${newTime}` },
          ],
          note: 'Rescheduling does not issue a refund of any prior payment; your existing payment carries over to the new date.',
        });
        emailSent = true;
      } catch (error) {
        console.error('Reschedule booking confirmation email error:', error.message || error);
      }

      return res.status(200).json({
        rescheduled: true,
        bookingId,
        date: newDate,
        time: newTime,
        wasWithinPolicyWindow,
        emailSent,
      });
    }

    if (req.method === 'POST' && req.query?.view === 'reassign-therapist') {
      const bookingId = String(req.body?.bookingId || '').trim();
      const therapistName = String(req.body?.therapistName || '').trim();
      if (!bookingId || bookingId.length > 100) {
        return res.status(400).json({ message: 'A booking reference is required.' });
      }
      if (!therapistName || therapistName.length > 200) {
        return res.status(400).json({ message: 'Choose a therapist to assign.' });
      }
      const bigquery = getBigQueryClient();
      const result = await bqFetchBookingRows(bigquery);
      const rows = result.data.values || [];
      const startIndex = rows[0]?.[0] === 'Booking ID' ? 1 : 0;
      const row = rows.find((candidate, index) => index >= startIndex && String(candidate[0] || '') === bookingId);
      if (!row) return res.status(404).json({ message: 'Booking was not found.' });
      if (row[24] === 'Cancelled') {
        return res.status(409).json({ message: 'This booking is cancelled, so its therapist cannot be changed.' });
      }
      const previousTherapist = row[6] || '';
      if (previousTherapist === therapistName) {
        return res.status(400).json({ message: `${therapistName} is already assigned to this appointment.` });
      }
      const date = row[7] || '';
      const time = row[8] || '';
      let startDateTime;
      try {
        startDateTime = parseBookingDateTime(date, time);
      } catch (error) {
        return res.status(400).json({ message: 'This booking has no valid date and time, so it cannot be reassigned.' });
      }
      const durationMinutes = Number(row[12]) || 60;
      const endDateTime = addMinutes(startDateTime, durationMinutes);
      const startInstant = `${startDateTime}-04:00`;
      const endInstant = `${endDateTime}-04:00`;
      // "Any Available" is a placeholder rather than a real person, so it is never
      // treated as busy and never checked against time off.
      const assignedNames = therapistName.split(',').map((name) => name.trim()).filter(Boolean);
      const realNames = assignedNames.filter((name) => name !== 'Any Available');
      const calendarId = row[15] || PRIMARY_CALENDAR_ID;
      const calendarEventId = row[16] || '';

      if (realNames.length) {
        const unavailabilityBlocks = await getUnavailabilityBlocks(sheets);
        const blockedName = realNames.find((name) => unavailabilityBlocks.some((block) =>
          block.scope === 'therapist' &&
          block.therapistName === name &&
          blockOverlapsWindow(block, date, startInstant, endInstant),
        ));
        if (blockedName) {
          return res.status(409).json({ message: `${blockedName} has time off during this appointment. Choose another therapist.` });
        }
        try {
          const dayEvents = await calendarApi.events.list({
            calendarId,
            timeMin: `${date}T00:00:00Z`,
            timeMax: `${date}T23:59:59Z`,
            singleEvents: true,
          });
          // The booking's own event must be ignored or the therapist would always
          // look busy against the appointment being reassigned.
          const busyNames = new Set((dayEvents.data.items || [])
            .filter((event) => event.id !== calendarEventId)
            .filter((event) => {
              const eventStart = event.start?.dateTime || event.start?.date || '';
              const eventEnd = event.end?.dateTime || event.end?.date || '';
              return eventStart && eventEnd && hasTimeOverlap(startInstant, endInstant, eventStart, eventEnd);
            })
            .flatMap((event) => getTherapistFromDescription(event.description).split(',').map((name) => name.trim()).filter(Boolean)));
          const busyName = realNames.find((name) => busyNames.has(name));
          if (busyName) {
            return res.status(409).json({ message: `${busyName} already has another appointment at this time. Choose another therapist.` });
          }
        } catch (error) {
          console.error('Reassign therapist availability lookup error:', error.message || error);
          return res.status(502).json({ message: 'Therapist availability could not be checked right now. Please try again.' });
        }
      }

      let calendarUpdated = false;
      if (calendarEventId) {
        try {
          const existing = await calendarApi.events.get({ calendarId, eventId: calendarEventId });
          const description = String(existing.data.description || '');
          const nextDescription = /^Therapist:\s*.*$/m.test(description)
            ? description.replace(/^Therapist:\s*.*$/m, `Therapist: ${therapistName}`)
            : `${description}${description ? '\n' : ''}Therapist: ${therapistName}`;
          await calendarApi.events.patch({
            calendarId,
            eventId: calendarEventId,
            requestBody: { description: nextDescription },
          });
          calendarUpdated = true;
        } catch (error) {
          console.error('Reassign therapist calendar update error:', error.message || error);
          return res.status(502).json({ message: 'The new therapist could not be saved to Google Calendar. Please try again.' });
        }
      }

      const statusNotes = `Therapist reassigned ${new Date().toISOString()} from ${previousTherapist || 'Unassigned'} to ${therapistName}.`;
      await bqUpdateBookingFields(bigquery, bookingId, { therapistName, statusNotes });

      return res.status(200).json({
        reassigned: true,
        bookingId,
        therapistName,
        previousTherapist,
        calendarUpdated,
      });
    }

    if (req.method === 'POST' && req.query?.view === 'business-profile') {
      const profile = validateBusinessProfile(req.body?.profile);
      await ensureBusinessProfileSheet(sheets);
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: 'BusinessProfile!A2:I2',
        valueInputOption: 'RAW',
        requestBody: { values: [BUSINESS_PROFILE_FIELDS.map((field) => profile[field])] },
      });
      return res.status(200).json({ profile });
    }

    const payload = req.body;
    const subtotal = Number(payload.subtotalAmount);
    const taxRate = Number(payload.taxRate);
    if (!Number.isFinite(subtotal) || subtotal <= 0 || subtotal > 100000 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
      return res.status(400).json({ message: 'The service subtotal and tax rate are invalid.' });
    }
    const loyaltySettings = await getLoyaltySettings();
    const memberBenefit = loyaltySettings.enabled ? await getMemberBenefit(sheets, payload.email, loyaltySettings) : null;
    const serviceSubtotal = payload.serviceSubtotalAmount === undefined ? null : Number(payload.serviceSubtotalAmount);
    const hotStoneSubtotal = payload.hotStoneSubtotalAmount === undefined ? null : Number(payload.hotStoneSubtotalAmount);
    const platinumSurcharge = payload.platinumSurchargeAmount === undefined ? null : Number(payload.platinumSurchargeAmount);
    const hasPriceBreakdown = serviceSubtotal !== null || hotStoneSubtotal !== null || platinumSurcharge !== null;
    if (hasPriceBreakdown && (
      !Number.isFinite(serviceSubtotal) || serviceSubtotal < 0 ||
      !Number.isFinite(hotStoneSubtotal) || hotStoneSubtotal < 0 ||
      !Number.isFinite(platinumSurcharge) || platinumSurcharge < 0 ||
      Math.abs(serviceSubtotal + hotStoneSubtotal + platinumSurcharge - subtotal) > 0.01
    )) {
      return res.status(400).json({ message: 'The service and add-on price breakdown is invalid.' });
    }
    const isHotStoneAddon = String(payload.serviceName || '').toLowerCase().includes('hot stone add-on');
    let discountAmount;
    let discountBase = subtotal;
    if (hasPriceBreakdown) {
      const serviceDiscount = Math.round(serviceSubtotal * (memberBenefit?.discountPercent || 0)) / 100;
      const hotStoneDiscount = hotStoneSubtotal > 0
        ? memberBenefit?.type === 'gold' && memberBenefit.freeHotStoneAvailable
          ? hotStoneSubtotal
          : memberBenefit?.type === 'platinum'
            ? Math.min(hotStoneSubtotal, Number(memberBenefit.hotStoneDiscount) || 0)
            : Math.round(hotStoneSubtotal * (memberBenefit?.discountPercent || 0)) / 100
        : 0;
      discountAmount = serviceDiscount + hotStoneDiscount;
      discountBase = serviceSubtotal + hotStoneSubtotal;
    } else {
      discountAmount = isHotStoneAddon && memberBenefit?.type === 'gold' && memberBenefit.freeHotStoneAvailable
        ? subtotal
        : isHotStoneAddon && memberBenefit?.type === 'platinum'
          ? Math.min(subtotal, Number(memberBenefit.hotStoneDiscount) || 0)
          : Math.round(subtotal * (memberBenefit?.discountPercent || 0)) / 100;
    }
    const discountPercent = discountBase > 0 ? discountAmount * 100 / discountBase : 0;
    if (payload.expectedDiscountPercent !== undefined && Number(payload.expectedDiscountPercent) !== discountPercent) {
      return res.status(409).json({ message: 'Membership eligibility changed. Please check your email again before submitting the booking.' });
    }
    const discountedSubtotal = subtotal - discountAmount;
    const taxAmount = Math.round(discountedSubtotal * taxRate * 100) / 100;
    const finalTotal = Math.round((discountedSubtotal + taxAmount) * 100) / 100;
    payload.membershipType = memberBenefit?.type || '';
    payload.membershipDiscountPercent = discountPercent;
    payload.membershipDiscountAmount = discountAmount.toFixed(2);
    payload.totalAmount = finalTotal.toFixed(2);
    if (payload.paymentOption === 'full') payload.paidAmount = finalTotal.toFixed(2);
    let patientHistory = payload.patientHistory || {};
    if (patientHistory.reuseExisting) {
      patientHistory = await findExistingPatientHistory(getBigQueryClient(), sheets, payload);
      if (!patientHistory) {
        return res.status(409).json({
          message: 'No existing patient history was found for this email or phone number. Please complete the health history form.',
        });
      }
    }
    const isCoupleService = /couple/i.test(payload.serviceName || '');
    const requestedTherapist1 = payload.therapistName || 'Any Available';
    const requestedTherapist2 = isCoupleService ? (payload.therapistName2 || 'Any Available') : '';
    if (isCoupleService && requestedTherapist1 !== 'Any Available' && requestedTherapist1 === requestedTherapist2) {
      return res.status(400).json({ message: 'Please select two different therapists for a couple session, or choose Any Available.' });
    }
    const calendarId = PRIMARY_CALENDAR_ID;
    const startDateTime = parseBookingDateTime(payload.date, payload.time);
    const durationMinutes = Number(payload.durationMinutes) || 60;
    const endDateTime = addMinutes(startDateTime, durationMinutes);
    const startInstant = `${startDateTime}-04:00`;
    const endInstant = `${endDateTime}-04:00`;

    const unavailabilityBlocks = await getUnavailabilityBlocks(sheets);
    const overlappingBlocks = unavailabilityBlocks.filter((block) => blockOverlapsWindow(block, payload.date, startInstant, endInstant));
    const businessBlock = overlappingBlocks.find((block) =>
      block.scope === 'business' && (!block.branchName || block.branchName === payload.branchName),
    );
    if (businessBlock) {
      return res.status(409).json({
        message: `This time is not available for booking${businessBlock.reason ? ` (${businessBlock.reason})` : ''}. Please choose another time.`,
      });
    }
    const blockedTherapistNames = new Set(
      overlappingBlocks.filter((block) => block.scope === 'therapist').map((block) => block.therapistName),
    );

    const dayEvents = await calendarApi.events.list({
      calendarId,
      timeMin: `${payload.date}T00:00:00Z`,
      timeMax: `${payload.date}T23:59:59Z`,
      singleEvents: true,
    });
    const busyTherapists = new Set([
      ...blockedTherapistNames,
      ...(dayEvents.data.items || [])
        .filter((event) => {
          const eventStart = event.start?.dateTime || event.start?.date || '';
          const eventEnd = event.end?.dateTime || event.end?.date || '';
          return eventStart && eventEnd && hasTimeOverlap(startInstant, endInstant, eventStart, eventEnd);
        })
        .flatMap((event) => getTherapistFromDescription(event.description).split(',').map((name) => name.trim()).filter(Boolean)),
    ]);
    const candidates = Array.isArray(payload.therapistCandidates) ? payload.therapistCandidates : [];
    const availableCandidates = candidates.filter((name) => !busyTherapists.has(name));
    const assignedNames = [];
    const remainingCandidates = [...availableCandidates];
    const assignTherapist = (requested) => {
      if (requested !== 'Any Available' && !busyTherapists.has(requested) && !assignedNames.includes(requested)) {
        assignedNames.push(requested);
        const idx = remainingCandidates.indexOf(requested);
        if (idx !== -1) remainingCandidates.splice(idx, 1);
        return requested;
      }
      const idx = remainingCandidates.findIndex((name) => !assignedNames.includes(name));
      if (idx === -1) return requested === 'Any Available' ? 'Any Available' : '';
      const picked = remainingCandidates[idx];
      assignedNames.push(picked);
      remainingCandidates.splice(idx, 1);
      return picked;
    };
    const therapistName1 = assignTherapist(requestedTherapist1);
    const therapistName2 = isCoupleService ? assignTherapist(requestedTherapist2) : '';
    if (!therapistName1 || (isCoupleService && !therapistName2)) {
      return res.status(409).json({
        message: isCoupleService
          ? 'Not enough therapists are available for this couple session at the selected time.'
          : 'The selected therapist is busy and no other therapist is available for this time.',
      });
    }
    const therapistName = therapistName2 ? `${therapistName1}, ${therapistName2}` : therapistName1;

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
          memberBenefit ? `Membership benefit: ${memberBenefit.type} · ${discountPercent}% off ($${payload.membershipDiscountAmount})` : '',
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
      '',
      '',
      '',
      memberBenefit?.type || '',
      discountPercent,
      payload.membershipDiscountAmount,
    ];

    await bqInsertBookingRow(getBigQueryClient(), rowValues);

    const hasLoyaltyEnrollmentRequest = payload.loyaltyOptIn === true || payload.platinumEnrollment === true;
    let loyaltyEnrollmentSaved = !hasLoyaltyEnrollmentRequest;
    let loyaltyEnrollmentError = '';
    let loyaltyEnrollmentEmailSent = true;
    let loyaltyEnrollmentEmailError = '';
    let loyaltyCompanyEmailNotified = false;
    if (hasLoyaltyEnrollmentRequest) {
      try {
        const loyaltySettings = await getLoyaltySettings();
        if (!loyaltySettings.enabled) throw new Error('The loyalty program is currently paused.');
        const enrollment = await enrollLoyaltyMember(sheets, payload);
        loyaltyEnrollmentSaved = true;
        if (enrollment.created || payload.platinumEnrollment === true) {
          try {
            await sendMembershipEmail(createGmailApi(), {
              email: payload.email,
              name: payload.customerName,
              membershipType: enrollment.membershipType,
              organization: payload.companyName || '',
              companyId: payload.companyId || '',
              companyContactEmail: enrollment.companyContactEmail || '',
              hoursBalance: enrollment.hoursBalance,
              paidThrough: '',
            }, loyaltySettings, await getBusinessProfile(sheets), 'welcome', enrollment.companyContactEmail || '');
            loyaltyCompanyEmailNotified = Boolean(
              enrollment.companyContactEmail &&
              normalizeLoyaltyEmail(enrollment.companyContactEmail) !== normalizeLoyaltyEmail(payload.email),
            );
          } catch (error) {
            loyaltyEnrollmentEmailSent = false;
            loyaltyEnrollmentEmailError = error.message || 'Loyalty membership email could not be sent.';
            console.error('Booking loyalty enrollment email error:', loyaltyEnrollmentEmailError);
          }
        }
      } catch (error) {
        loyaltyEnrollmentError = error.message || 'Loyalty enrollment could not be saved';
        console.error('Loyalty enrollment spreadsheet error:', error);
      }
    }

    let marketingConsentSaved = !payload.marketingOptIn;
    let marketingConsentError = '';
    if (payload.marketingOptIn === true) {
      try {
        await recordMarketingConsent(sheets, payload);
        marketingConsentSaved = true;
      } catch (error) {
        marketingConsentError = error.message || 'Marketing consent could not be saved';
        console.error('Marketing consent spreadsheet error:', error);
      }
    }

    let patientHistorySaved = false;
    let patientHistoryError = '';
    try {
      const history = patientHistory;
      await bqAppendPatientHistory(getBigQueryClient(), sheets, [
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
      ]);
      patientHistorySaved = true;
    } catch (error) {
      patientHistoryError = error.message || 'Patient history could not be saved';
      console.error('Patient history BigQuery error:', error);
    }

    let emailSent = false;
    let emailError = '';
    try {
      await sendGmailConfirmation(createGmailApi(), { ...payload, manageUrl: getManageBookingUrl(req, payload.id) });
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
      paidAmount: payload.paidAmount,
      totalAmount: payload.totalAmount,
      membershipType: payload.membershipType,
      membershipDiscountPercent: payload.membershipDiscountPercent,
      membershipDiscountAmount: payload.membershipDiscountAmount,
      therapistName,
      patientHistorySaved,
      patientHistoryError,
      loyaltyEnrollmentSaved,
      loyaltyEnrollmentError,
      loyaltyEnrollmentEmailSent,
      loyaltyEnrollmentEmailError,
      loyaltyCompanyEmailNotified,
      marketingConsentSaved,
      marketingConsentError,
    });
  } catch (error) {
    console.error('Google Sheets API Error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal Server Error' });
  }
}
