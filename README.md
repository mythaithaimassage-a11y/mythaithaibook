# mythaithaibook

MY THAI THAI booking platform built with Vite, React, TypeScript, and Tailwind CSS.

## Local development

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Vercel deployment

Vercel can detect this Vite project automatically. Use `npm run build` as the
build command and deploy the generated Vite application from the repository
root.

The optional `/api/booking` serverless function writes bookings to Google
Sheets and creates or reuses a separate Google Calendar for each therapist.
Configure these Vercel environment variables before using it:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_CALENDAR_OWNER_EMAIL` (defaults to `mythaithaimassage@gmail.com`)
- `GOOGLE_PRIMARY_CALENDAR_ID` (defaults to `mythaithaimassage@gmail.com`)
- `GOOGLE_CALENDAR_TIME_ZONE` (defaults to `America/Toronto`)
- `GOOGLE_GMAIL_SENDER_EMAIL` (Gmail mailbox used for booking confirmations)
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `PATIENT_HISTORY_SPREADSHEET_ID` (defaults to the dedicated patient-history
  spreadsheet configured for this project)
- `OWNER_ADMIN_PASSWORD` (strong password for the owner dashboard)
- `OWNER_ADMIN_SESSION_SECRET` (long random secret used to sign owner sessions)
- `THERAPIST_SESSION_SECRET` (long random secret used to sign HTTP-only
  therapist sessions)
- `THERAPIST_ACCOUNTS` (JSON array of therapist accounts with scrypt password
  hashes; see below)
- `BIGQUERY_PROJECT_ID` (or `GOOGLE_CLOUD_PROJECT`; the Google Cloud project ID
  that hosts the booking-records BigQuery dataset, e.g.
  `my-thai-thai-booking-system`)
- `BIGQUERY_DATASET` (optional; defaults to `booking_system`)
- `BIGQUERY_BOOKINGS_TABLE` (optional; defaults to `bookings`)
- `BIGQUERY_SQUARE_PAYMENTS_TABLE` (optional; defaults to `square_payments`)
- `BIGQUERY_CAMPAIGN_LOG_TABLE` (optional; defaults to `campaign_log`)
- `BIGQUERY_CAMPAIGN_RECIPIENTS_TABLE` (optional; defaults to `campaign_recipients`)
- `BIGQUERY_LOYALTY_SETTINGS_TABLE` (optional; defaults to `loyalty_settings`)
- `BIGQUERY_LOYALTY_MEMBERS_TABLE` (optional; defaults to `loyalty_members`)
- `BIGQUERY_LOYALTY_LEDGER_TABLE` (optional; defaults to `loyalty_ledger`)
- `BIGQUERY_LOYALTY_COMPANIES_TABLE` (optional; defaults to `loyalty_companies`)
- `BIGQUERY_LOCATION` (optional; defaults to `US`)
- `BIGQUERY_WIX_CONTACTS_TABLE` (optional; defaults to `wix_contacts`; must not
  point to any existing booking, patient-history, payment, campaign or loyalty table)
- `BIGQUERY_PACKAGES_TABLE` (optional; defaults to `session_packages`; a
  separate owner-verified four-session package tracking table)
- `GOOGLE_PLACES_API_KEY` / `GOOGLE_PLACE_ID` (optional; enables the Google
  Reviews section — requires the **Places API (New)** enabled on the project,
  not the legacy Places API)

Share the Google Sheet with the service account email as an Editor. Enable the
Google Sheets API and Google Calendar API in the Google Cloud project. The
service account creates calendars named `<Therapist> - MY THAI THAI` and shares
the primary calendar with `GOOGLE_PRIMARY_CALENDAR_ID`.

## Booking records in BigQuery

Booking records (customer name, service, therapist, date/time, payment,
receipt, cancellation status, etc.), Square payment link/checkout records, and
targeted email campaign logs are stored in typed **BigQuery** tables rather
than Google Sheets tabs. The **loyalty program** (settings, members, ledger,
and companies) and **patient history** are stored in BigQuery as well — see
"Loyalty program tables in BigQuery" and "Patient history" below. Other data
sets used by this app (branches, services, therapists, marketing contacts, and
availability blocks) remain in Google Sheets.

Enable the **BigQuery API** in the same Google Cloud project used for Sheets
and Calendar, and grant the existing service account
(`GOOGLE_SERVICE_ACCOUNT_EMAIL`) these IAM roles on that project:

- `BigQuery Data Editor` (create/read/write the dataset and tables)
- `BigQuery Job User` (run queries)

Set `BIGQUERY_PROJECT_ID` (or reuse `GOOGLE_CLOUD_PROJECT` if already set) to
the Google Cloud project ID, e.g. `my-thai-thai-booking-system`. The dataset
(`BIGQUERY_DATASET`, default `booking_system`) and tables
(`BIGQUERY_BOOKINGS_TABLE`, default `bookings`; `BIGQUERY_SQUARE_PAYMENTS_TABLE`,
default `square_payments`; `BIGQUERY_CAMPAIGN_LOG_TABLE`/`BIGQUERY_CAMPAIGN_RECIPIENTS_TABLE`,
default `campaign_log`/`campaign_recipients`; and the four
`BIGQUERY_LOYALTY_*_TABLE` loyalty tables) are **created automatically** on
first use — no manual DDL is required. Patient history uses
`BIGQUERY_PATIENT_HISTORY_TABLE` (default `patient_history`). If your project
is on **BigQuery
Sandbox** (no billing account linked), link a billing account first: Sandbox
datasets/tables auto-expire after 60 days of inactivity and have tighter
query/DML quotas.

Note: all timestamp columns (`date`, `time`, `created_at`,
`receipt_issued_at`, etc.) are stored as plain `STRING` columns (not BigQuery
`DATE`/`TIMESTAMP` types) on purpose, so the existing date/time parsing and
formatting code in `api/booking.js` keeps working unchanged without adapting
to the BigQuery client library's temporal wrapper objects. Square payment
records are looked up and updated by `order_id` (the identifier Square's
webhook payload provides) and are separately queried by `booking_id` for the
refund lookup used during self-service cancellation.

## Clearing past booking history

In the owner dashboard, open **Schedule & Bookings → Clear past bookings**.
Preview the database counts, then type **CLEAR PAST BOOKINGS** to permanently
delete appointments whose scheduled end time is at or before the preview cutoff
in `GOOGLE_CALENDAR_TIME_ZONE` (default `America/Toronto`). This applies across
all branches, including historical Wix imports. Future and ongoing appointments,
and rows with invalid dates/times or nonpositive/missing durations, are kept.

This explicitly deletes paid and package-linked booking rows too, including
their stored payment details and issued receipt metadata. **No archive or new
permanent table is created**, and the existing bookings schema is unchanged.
Deleted receipts cannot be viewed or reissued from the dashboard. Separate
Square payment records, package balances/usage history, loyalty ledgers, contacts,
patient history, and Google Calendar events are left untouched. Package usage
and loyalty history can therefore retain references to deleted booking IDs.
Booking-based revenue and visit reports no longer include cleared rows.
Reimporting a Wix CSV can recreate deleted bookings, so reconcile existing
package/loyalty usage before doing so.

Both endpoints are owner-only, same-origin POST requests:
`view=booking-history-preview` returns counts and a signed, ten-minute preview
token; `view=clear-booking-history` requires that token and
`confirmation: "CLEAR PAST BOOKINGS"`. A transaction verifies the complete
candidate-row fingerprint before deleting. Changes to candidates require a new
preview, and appointments that end after the preview are not silently added to
the deletion. Database errors are reported; no live deletion happens merely by
opening or previewing this control.

## Historical Wix contact import

Sign in to the owner dashboard and open **Manage → Wix contacts import**.
Choose the **contacts CSV exported by Wix**, review the preview and skipped-row
warnings, then select **Import contacts**. The import supports UTF-8/BOM CSV,
quoted commas, escaped quotes and multiline fields. Each file may contain up
to 10,000 contact rows and be no larger than 3 MiB. Split larger exports into
smaller files, retaining the original header in each file.

Contacts are stored in a **separate BigQuery table**, `wix_contacts` in the
configured booking dataset (override with `BIGQUERY_WIX_CONTACTS_TABLE`).
It is created automatically using the existing BigQuery credentials and IAM
permissions. **No existing table schema is altered, and no existing bookings,
patient forms, payments, loyalty balances or campaign records are updated.**
If the destination has an incompatible schema, the import fails rather than
changing it. The original CSV is not committed to this repository.

The archive maps these Wix fields:

| Wix export | BigQuery columns |
| --- | --- |
| First Name / Last Name | `first_name`, `last_name`, combined `name` |
| Email 1–N / Phone 1–N | First valid `email` / `phone`, all values in `emails_json` / `phones_json` |
| Address N - fields | `addresses_json` (preserves each address's type, street, region, postal code and country when supplied) |
| Labels | `labels` |
| Created At (UTC+0) | `wix_created_at` (ISO UTC string) |
| Email / SMS subscriber status | `email_subscriber_status`, `sms_subscriber_status` (historical values only) |
| Last Activity / Last Activity Date (UTC+0) | `last_activity`, `last_activity_at` |
| Source / Language / Linked Locations | `source`, `language`, `linked_locations` |
| Every original column, including unmapped fields | `source_fields_json` |
| Import metadata | Deterministic `contact_id`, `imported_at` |

All archive columns are `STRING`; structured collections are serialized as
JSON. The import strips Wix's leading apostrophe from phone numbers for the
normalized phone fields while retaining the original value in source fields.
Unrecognized dates remain in source fields with a warning; no activity date
is interpreted as an actual appointment.

Identity uses the first valid email (case-insensitive), falling back to the
first valid phone's digits when no valid email exists. Rows with neither are
skipped. Duplicate identities within one CSV retain the first occurrence.
Re-importing the same identity skips the existing archive record instead of
overwriting it. Phone-only records that later gain an email have a different
identity; shared phone numbers without email collapse to one contact.
The preview shows up to five contacts and twenty warnings. Import results
report newly inserted, already existing, invalid and duplicate row counts.
Expanded BigQuery parameters are split into batches below 8 MiB to stay within
BigQuery's request limits. Each batch is atomic, but the entire file is not:
if a later batch fails or a request times out, some contacts may already have
been saved. Refresh the list and re-import the same CSV to finish; completed
records are skipped. Failures are reported explicitly, including confirmed
insert counts when available.
Use the searchable, paginated contact list to verify the imported records.

**No emails are sent and no marketing consent or loyalty membership is
created.** Wix's subscription status is retained for reference, not treated as
a new opt-in. Contacts stay in this archive, separate from the booking-derived
loyalty directory and campaign audiences.

The owner-authenticated API exposes:

- `POST /api/booking?view=wix-contacts-import` with
  `{ "csv": "<CSV text>", "preview": true }` to validate without writing.
- The same POST without `preview: true` to insert new archive records using a
  parameterized, insert-only BigQuery `MERGE` batches.
- `GET /api/booking?view=wix-contacts&search=<text>&offset=0` to read contacts
  (50 per page). Import requests require the same-origin owner session.

Local regression tests: `node --test tests/wix-contacts.test.js`.

## Historical Wix booking import (existing table only)

Open **Manage → Wix bookings import** in the owner dashboard, select the Wix
**bookings** CSV, map each Wix service/duration to a current catalogue service,
optionally map Wix staff names to current therapists, select
**Preview mapped prices & therapists**, and confirm historical payment and the
reviewed prices. Then select **Import paid bookings**.
These exports are assigned to **Mississauga Central**, as requested. The
destination is the **existing** `BIGQUERY_BOOKINGS_TABLE` (default `bookings`)
in the configured dataset. The import verifies that this table exists and
matches the existing booking column types. It does **not** create a table or
dataset or alter schemas. Existing payments/receipts are protected. Missing or incompatible
tables cause an explicit error before any bookings are written.

| Wix booking export | Existing booking columns |
| --- | --- |
| Booking contact name / email / phone | `customer_name`, `email`, `phone` |
| Session date / Start time | `date` (`YYYY-MM-DD`), `time` (`hh:mm AM/PM`) |
| Duration (`1h, 30m`, etc.) | `duration_minutes` (`INT64`) |
| Service name / Staff name | Owner-selected catalogue `service_name` for receipt tax classification; original `therapist_name`; original Wix names retained in notes |
| Registration date | `created_at` (date only; no invented timestamp) |
| Booking / Attendance status | `status`; original statuses in `status_notes` |
| Payment status | Owner-confirmed paid `payment_option`; original Wix status in notes |
| Reviewed current catalogue price | Tax-inclusive `total` and equal `paid_amount` (fully paid) |
| Client address, spots, service type, all form questions/answers, and original columns | JSON in `intake_notes` |
| Branch | `branch_name` = `Mississauga Central`; `branch_address` blank (client address is not the clinic's address) |

**Therapist mapping:** the preview lists each distinct Wix staff name with its
booking count (including a blank-name group). Choose an active current therapist
or **Keep original Wix name**, useful for former staff. Multiple Wix aliases may
map to one therapist. The mapped name is stored in the existing `therapist_name`
column; the original Wix `Staff name` and mapping provenance stay in
`intake_notes`. Changing a mapping invalidates the reviewed preview and payment
confirmation. The backend rejects missing/inactive targets, duplicate/unknown
source names and renamed therapists rather than silently falling back.
Booking IDs and duplicate detection still use the original Wix staff name, so
mapping two aliases to one person cannot merge distinct exported bookings.
Mappings apply to newly inserted records only; re-import does not reassign
existing bookings (including zero-amount records). Use existing booking
reassignment controls for records already imported. Mapping itself does not
create staff accounts or notifications; imported events use the stored names.

Sessions are sorted by date and 24-hour start time. Generated IDs use
`WIX-YYYYMMDD-HHMM-<appointment hash>`, not row numbers, so reordering or splitting
the CSV does not change them. Identity combines branch, session date/time,
email (falling back to phone or name), service, staff and duration. Different
staff at the same time remain separate bookings. Identical appointment
identities keep the first CSV row. Changing identity fields creates a
different ID. Unchanged identities skip records with existing amounts or
receipt data. Re-importing the same CSV can fill previous zero-amount Wix records
only when total/paid amounts are both zero and receipt number, issue date and
email status are empty. Updates are limited to service, payment option,
amounts and pricing notes; other booking fields remain unchanged.
Without an original Wix booking ID, duplicate
identical appointments cannot be distinguished and imported appointments
cannot automatically be matched to existing non-Wix booking IDs.

The export's session times are clinic-local (`GOOGLE_CALENDAR_TIME_ZONE`,
default `America/Toronto`), not UTC. Only session dates through the clinic's
current date are accepted; future dates are reported/skipped. Confirmed rows
with unspecified attendance stay **Confirmed**, not assumed attended because
their date is in the past. Cancelled rows become **Cancelled**, explicit
attended rows **Completed**, and explicit no-shows **No Show**. Unsupported
booking statuses and invalid session dates/times/durations are reported and
skipped. Missing names are allowed when a valid email or phone identifies the
client. Invalid email/phone/registration fields are blanked with warnings,
while original values remain in notes. Rows without any name, valid email or
valid phone are skipped.

**Payment amounts are unavailable in this export.** The owner has chosen to use
reviewed **current catalogue prices**, not verified historical charges. An
initial preview has zero placeholders until all price mappings are reviewed.
Each group must map to an active service of the same duration and a positive
price. A fixed **120-minute Thai Traditional Massage** import option is also
available at **$185 + 13% HST = $209.05**, even if the current catalogue has no
120-minute service. This option is import-only and does not modify the live
booking catalogue.

Catalogue subtotal plus rounded tax becomes both `total` and
`paid_amount`; a “spots filled” value does not multiply the booking price.
When a mapped service is named `Package: ... x 4 Sessions`, a historical
booking is a **single visit**, priced at **one quarter** of the four-session
subtotal, not the full package price. For example, $360 + tax becomes
$90 + $11.70 = $101.70 per 60-minute visit; $540 + tax becomes
$135 + $17.55 = $152.55 per 90-minute visit. An import never invents a package
purchase or remaining balance. Historical package visits require an
owner-verified package linkage before issuing their receipt.
There is no automatic ambiguous service matching. The backend verifies the
reviewed service name, price and tax rate against the current catalogue and
rejects stale mappings rather than silently charging different amounts.
Pricing provenance and original Wix data are kept in existing note columns.

Services must use receipt-supported taxes (13% for regular massage; 0% for
services named RMT, registered massage therapy or acupuncture). A mismatched
catalogue tax classification is rejected. The mapped catalogue service name
ensures the existing receipt flow applies the matching tax calculation.
These prices also affect reports: they are owner-approved reconstructed values,
not original Wix revenue. Prices that differ from actual charges should not
be used for receipts without correction.

After import, open **Events & bookings**, choose a booking, and select
**Issue & email receipt**. A valid email and positive fully paid total are
still required; there is no bypass of those checks. Receipts are issued on
demand, not emailed in bulk during import. No patient consent records or
memberships are created, and no customer is charged. Existing
receipt fields remain empty until issuance, and discounts stay zero.
Imported Wix bookings remain excluded from retroactive loyalty awards and
current prepaid-hour consumption.

Wix imports now automatically sync eligible stored Wix bookings to the same
primary Google Calendar as live bookings (`GOOGLE_PRIMARY_CALENDAR_ID`). The
service account needs Editor access to that calendar and the Calendar API must
be enabled. Original or owner-mapped therapist names appear in event descriptions.
Cancelled/no-show bookings are not added. No attendees, email invitations, or
reminders are created. Times use `GOOGLE_CALENDAR_TIME_ZONE`.

The import starts a batch of up to 500 pending bookings, with at most five
Calendar writes in flight and one guarded BigQuery transaction per batch
(rather than a database transaction per booking). Calendar writes have a
10-second request timeout; batches stop starting new writes after 180 seconds.
The booking function has a 300-second deployment limit, leaving time for
in-flight writes and database linking. The deployment must support this limit.
Slow batches may return fewer than 500 synced bookings; the owner UI continues
with the remaining bookings automatically.
Temporary network timeouts, connection failures, rate limits and retryable
Google server errors receive up to two automatic retries with exponential
backoff and jitter. Retries respect `Retry-After` (up to 10 seconds) and the
batch time budget. A timed-out insert is recovered using the same stable event
ID and ownership checks, even if Google created the event before timing out.
Permission failures are not retried. Persistent failures stop new work and are
reported explicitly; successful events are linked before the batch returns.
Invalid individual bookings are reported without blocking other valid bookings;
the current run excludes failed IDs from later batches, but retrying a new run
checks them again. Remaining counts exclude these reported failures.
The owner UI
continues batches via owner-only, same-origin POST `view=wix-calendar-sync`.
Keep the page open until complete. **Sync existing Wix bookings to Calendar**
backfills older imports or resumes interrupted/failed syncs without a new CSV.
The owner **Live Google Calendar** tab also provides **Sync Wix bookings**,
using the same resumable flow. It shows progress and refreshes the dashboard's
calendar and booking list during sync (at most once every 10 seconds), as well
as after completion or partial failure. The visible calendar tab also reloads
every 15 seconds and when returning to the tab, without overlapping poll requests.
Calendar reads follow all event pages so busy days do not silently lose appointments.
Sync applies to
all pending Wix dates/branches, not just the selected calendar filters. Select
the historical appointment date to see its events in the day view.
The dashboard sends both the selected branch name and address: imported Wix
events use `Mississauga Central` as their location without a street address.
Calendar filtering matches stored booking branch names as well as event/booking
addresses, so synced imports remain visible when that branch is selected.
The same branch-name matching applies to branch-specific business availability
blocks. Date and therapist filters still apply independently.
Progress and errors are explicit; an import can save database rows even when
Calendar permissions or quotas prevent syncing. Fix the reported error and retry.
Stable Calendar event IDs and ownership checks recover an event created before
its database link was saved without duplicating it. Existing linked events are
skipped; the existing booking schema is unchanged. This backfill does not reassign
therapists on existing rows or repair events deleted manually from Calendar.
Retained Wix Calendar events are not automatically recreated as new bookings
after database history is cleared. They remain visible in Google Calendar itself.

Limits are the same as contact imports: 3 MiB CSV / 10,000 rows per file,
up to 20 warnings and 5 chronological preview rows, with bounded BigQuery
`MERGE` batches (insert new IDs; update only untouched zero-amount Wix IDs).
Failures after a completed batch may leave partial
data; check **Events & bookings** and retry the same CSV safely. Original
export details live only in existing note columns, not a new archive table.

API: `POST /api/booking?view=wix-bookings-import` with
`{ "csv": "<CSV text>", "preview": true }` validates without writing.
For a priced preview, add `priceMappings`, an array of
`{ key, serviceId, serviceName, price, taxRate }`, using `priceGroups[].key`
from the initial preview. To import, omit `preview: true` and supply all
`priceMappings` plus `confirmPaid: true`. Both require owner authentication;
POSTs require the same origin. No additional environment variables are required.
Optionally include `therapistMappings` in both reviewed preview and import:
`[{ "sourceName": "<Wix staff name>", "therapistId": 7, "therapistName": "<current name>" }]`.
Unmapped names are kept unchanged. `therapistGroups` and
`mappedTherapistBookings` in the response describe the mapping coverage.

Regression tests:
`node --test tests/wix-contacts.test.js tests/wix-bookings.test.js tests/wix-paid-receipts.test.js tests/packages.test.js`.

## Four-session prepaid package tracking

Open **Grow → Package tracking** in the owner dashboard. This is separate
from loyalty points and corporate prepaid hours; no existing booking or
loyalty schema is changed. The authorized new BigQuery table
`session_packages` is created on first use in the existing dataset (override
with `BIGQUERY_PACKAGES_TABLE`). Existing IAM permissions cover it. The table
contains the customer's email/name, package duration/price/tax, unique
purchase reference/date, verified starting balance, remaining sessions,
revision, and JSON usage history.

1. **Register a verified purchase.** Enter the actual full four-session price
   before tax, purchase date, session duration, and a unique purchase
   reference. Confirm that payment and the starting balance have been
   verified. Start with four sessions for a new purchase or the verified
   remaining number (0-4) for an existing package.
2. **Find the customer/package** by name, email, package name or purchase
   reference. Multiple genuine purchases use different purchase references.
   Registering the same reference again never resets or replenishes a balance;
   conflicting registrations fail explicitly.
3. **Link a completed booking** with the same email and duration. Confirm
   that it belongs to the package and has not already been deducted from the
   registered starting balance. One session is deducted, and the booking is
   covered by the allocated prepaid session value. There is no new charge.
4. **Issue the receipt** through the existing booking controls. The receipt
   email (text/HTML), dashboard receipt, and printed receipt include package
   name/reference, one deducted session, remaining balance **after that visit**,
   allocated value, and **$0 new payment collected**. Reissuing a receipt does
   not deduct another session; older receipt balances remain snapshots.

If a verified remaining balance already includes old visits, **do not deduct
those visits again**. To track those visits for receipts, verify/register the
balance before the visits being linked, then link them chronologically. The
Wix CSV cannot establish purchases, the number of packages bought, or the
remaining balance on its own. Existing historical package records accidentally
priced at the full package amount can be corrected by linking their verified
package **before** receipt issuance; issued receipts are never rewritten.

Deductions use a single BigQuery transaction that updates both the package
balance/history and booking. Revision/snapshot guards reject stale concurrent
updates; refresh/retry after conflicts. The same booking cannot be linked
twice or to another package, and an exhausted package cannot cover a fifth
session. Full-package cents (subtotal and tax) are allocated across four
sessions without rounding away or creating money.

Only confirmed/completed bookings whose treatment time has passed qualify.
Future visits, cancelled/no-show visits, customer/duration mismatches,
pre-purchase visits, existing receipts, and existing loyalty/membership
benefit use are rejected. Non-Wix bookings with a recorded payment must be
reconciled before using a package; reconstructed historical Wix payments may
be replaced by the package allocation. Linked visits cannot be deleted,
cancelled/refunded, rescheduled, or have their amounts/contact details changed
through the normal booking controls. This keeps the usage record and receipts
auditable. There is no automatic cancellation credit or package refund flow;
such corrections need reconciliation, not deletion of the audit history.

Package purchase registration itself is an owner verification operation, not
a payment collection, automatic email, or purchase receipt. Visit receipts
document use of prepayment; they must not be counted as additional cash
collections on top of the original package purchase.

Owner-only API routes:

- `GET /api/booking?view=packages&search=<text>&offset=0` (50 packages/page).
- `POST /api/booking?view=package-register` with `email`, `customerName`,
  `packageName`, `purchaseReference`, `purchaseDate`, `durationMinutes`,
  `remainingSessions`, full-package `subtotal`, `taxRate` (0 or 0.13), and
  `confirmed: true`.
- `POST /api/booking?view=package-redeem` with `packageId` and `bookingId`.

POSTs require the same-origin owner session. Table names cannot target existing
booking, loyalty, payment, patient, contact or campaign tables.

## Loyalty program tables in BigQuery

The loyalty settings, members, ledger, and company registrations live in the
same BigQuery dataset, in `loyalty_settings`, `loyalty_members`,
`loyalty_ledger`, and `loyalty_companies` (override with the
`BIGQUERY_LOYALTY_*_TABLE` variables). The column layout mirrors the previous
`LoyaltySettings`/`LoyaltyMembers`/`LoyaltyLedger`/`LoyaltyCompanies`
spreadsheet tabs one-for-one, with snake_case column names and an extra
`row_index` column that preserves the original row ordering. As with bookings,
every column is a `STRING` so the existing parsing and formatting code keeps
working unchanged.

**Existing spreadsheet data is migrated automatically.** The first time each
loyalty table is created, the API copies whatever the matching tab in
`GOOGLE_SPREADSHEET_ID` already contains into BigQuery. A missing tab or an
empty spreadsheet is not an error — the program simply starts out empty. The
migration is also available on demand: signed-in owners can `POST
/api/booking?view=loyalty-migrate`, which imports any loyalty table that is
still empty and returns the number of rows copied per table. The original
spreadsheet tabs are left untouched as a backup; the app no longer reads or
writes them.

This migration only affects **new** bookings/payments going forward — no
historical data was migrated. Older records remain archived in the original
`Sheet1` and `SquarePayments` tabs of the Google Sheet for reference, but the
app no longer reads from or writes to those tabs.

Booking confirmation emails are sent through Gmail API using OAuth authorization
granted by the sender mailbox owner. This works with a regular Gmail mailbox;
Workspace Domain-Wide Delegation and service-account impersonation are not
used. Enable Gmail API and configure an OAuth consent screen and OAuth client
in the Google Cloud project. Authorize the sender mailbox for this scope:

```text
https://www.googleapis.com/auth/gmail.send
```

Create an OAuth client ID and secret in the Google Cloud project. For a
one-time refresh token setup with OAuth Playground, add
`https://developers.google.com/oauthplayground` as an authorized redirect URI
for the OAuth client. In OAuth Playground settings, enable **Use your own OAuth
credentials**, enter that client ID and secret, authorize the Gmail send scope
as the sender mailbox, then exchange the authorization code for tokens. Store
the returned refresh token, client ID, and client secret only in Vercel
Environment Variables. Set `GOOGLE_GMAIL_SENDER_EMAIL` to the same mailbox
that granted consent, then redeploy.

If the OAuth consent screen remains in **Testing**, Google refresh tokens for
Gmail scopes expire after seven days; publish/configure the OAuth app for
ongoing use and complete any Google verification Google requires for the
configured audience and scopes. Without valid OAuth credentials and consent,
Sheets and Calendar booking writes can still succeed while confirmation email
delivery fails. The Calendar event does not invite attendees.

### Recovering from Gmail `invalid_grant`

This error means Google rejected the Gmail OAuth refresh token. It may have
expired or been revoked, or it may belong to a different OAuth client.
Changing Calendar credentials or retrying the booking will not repair Gmail
authorization.

1. Check the OAuth app's publishing status in Google Cloud. If an external app
   is in **Testing**, configure it for ongoing use before generating the
   replacement token; otherwise Gmail refresh tokens expire after seven days.
2. Reauthorize the mailbox specified by `GOOGLE_GMAIL_SENDER_EMAIL` for
   `https://www.googleapis.com/auth/gmail.send` using the OAuth Playground
   procedure above. Enable **Use your own OAuth credentials** and use the exact
   client ID and secret configured as `GOOGLE_OAUTH_CLIENT_ID` and
   `GOOGLE_OAUTH_CLIENT_SECRET`. Request offline access and consent to obtain
   a new refresh token.
3. Replace `GOOGLE_OAUTH_REFRESH_TOKEN` in the Vercel environment serving the
   failing deployment, then redeploy so the application loads the new token.
   Keep all tokens and client secrets out of source code and support messages.
4. Verify email delivery after redeploying. An already-saved booking remains
   saved, but its failed confirmation email is not automatically resent.
   Do not submit the same booking again just to retry email; contact the
   customer separately about that appointment.

Booking confirmation emails report this authorization failure with recovery
guidance. Other email errors retain their original messages.

### Public booking and separate staff entry points

The home page `/` is the public booking view and does not show owner-dashboard
or therapist-login tabs. Staff access their existing authenticated views using
these direct URLs on the same deployment:

- Owner dashboard: `/owner`
- Therapist sign-in: `/therapist`

Both paths are explicitly rewritten to the app by Vercel and start on their
respective sign-in views. Staff entry points retain the platform view switcher,
including the owner's walk-in/phone booking workflow. Opening `/` in a separate
tab always presents public booking, even when a staff session exists.
Medical-history, manage-booking, company-portal, and payment-return links at
the home page continue to work.

Staff URLs have `X-Robots-Tag: noindex, nofollow` headers to discourage indexing.
They are not secret URLs, separate private deployments, or network restrictions:
the login pages remain publicly reachable. Server-side owner and therapist
authentication still controls access to protected records. No new environment
variables are needed.

The Admin Dashboard schedule loads live booking rows from `GET /api/booking`,
which reads from the BigQuery `bookings` table (see "Booking records in
BigQuery" below).

The admin dashboard includes a live Google Calendar tab with date and branch
filters, a native embedded Google Calendar view for
`mythaithaimassage@gmail.com`, and a filtered appointment list. Owner access
uses server-side password verification. Set `OWNER_ADMIN_PASSWORD` and
`OWNER_ADMIN_SESSION_SECRET` in Vercel before deploying the owner dashboard
changes. Use a unique password of at least 16 characters and generate the
session secret with `openssl rand -hex 32`. The owner sign-in creates an
HTTP-only, same-site session that expires after eight hours. Owner-only
booking reads, calendar, patient-history, business-profile, and loyalty
management endpoints require this session; public customer booking submissions
remain unchanged.

The owner dashboard's **Google Ads** section provides read-only campaign
reporting for a selected date range, with campaign search, status filters, and
sorting. To enable live data, configure these additional server-side Vercel
environment variables:

- `GOOGLE_ADS_DEVELOPER_TOKEN` (developer token approved for the account's API
  access level)
- `GOOGLE_ADS_CUSTOMER_ID` (10-digit Ads customer ID; hyphens are optional)
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (optional; 10-digit manager customer ID when
  accessing the Ads customer through a manager account)
- `GOOGLE_ADS_API_VERSION` (optional; defaults to `v25`)

The Ads OAuth refresh token must be issued to the configured OAuth client with
the `https://www.googleapis.com/auth/adwords` scope. Enable the Google Ads API
for the associated Google Cloud project and use credentials that have access to
the Ads customer. The Ads OAuth client and token are separate from the booking
confirmation Gmail OAuth credentials. Keep all Ads credentials in Vercel
Environment Variables; the browser only receives campaign metrics. The report
automatically paginates campaign results and reads the account currency from
Google Ads.

## Square online payments

Every online booking must be paid through Square's hosted checkout, and there
are exactly two payment options: pay a flat **$10 now** to confirm the slot and
settle the balance at the clinic, or pay the **full amount online** in advance.
Once a Square payment completes, the
paid amount is written back to the booking automatically and, if the loyalty
program is enabled, the payer is auto-enrolled as a Standard rewards member
(if not already a member) so no separate loyalty sign-up step is required.

To enable Square payments, add these server-side Vercel Environment Variables:

- `SQUARE_ACCESS_TOKEN` (personal access token or OAuth access token for your
  Square account/application)
- `SQUARE_LOCATION_ID` (the Square location that payments should be attributed
  to)
- `SQUARE_ENVIRONMENT` (optional; `production` by default, set to `sandbox`
  while testing with a Square sandbox account)
- `SQUARE_WEBHOOK_SIGNATURE_KEY` (the signature key shown for the webhook
  subscription in the Square Developer Dashboard)
- `SQUARE_WEBHOOK_NOTIFICATION_URL` (optional; only needed if the auto-detected
  `https://<your-domain>/api/booking?view=square-webhook` URL does not match
  the notification URL registered with Square)

Setup steps:

1. In the [Square Developer Dashboard](https://developer.squareup.com/apps),
   create (or open) an application and copy an access token and a location ID
   into the Vercel environment variables above.
2. Under that application's **Webhooks** settings, add a subscription pointed
   at `https://<your-domain>/api/booking?view=square-webhook`, subscribed to
   the `payment.updated` and `payment.created` events, then copy the generated
   signature key into `SQUARE_WEBHOOK_SIGNATURE_KEY`.
3. Redeploy so the new environment variables take effect. The customer booking
   flow will automatically show a "Pay with Square" button on the confirmation
   step for both payment options ($10 deposit or full prepayment) whenever
   Square is configured.

If Square is not configured, the payment button is hidden and bookings are
recorded with the selected payment option so staff can collect and mark the
payment manually.

## Therapist and business availability blocks

The owner dashboard has an **Availability** tab (under **Manage**) for
blocking off time so it can't be booked:

- **Business-wide closures** — block a time window for every therapist,
  optionally scoped to one branch (e.g. a holiday closure or an all-staff
  training session).
- **Single-therapist blocks** — block a time window for one named therapist
  only (e.g. a lunch break or a day off), leaving other therapists bookable.

Therapists can also self-manage their own blocks from a **My availability**
panel in the therapist portal, without needing owner access.

Blocks are enforced automatically:

- New booking submissions that overlap a **business-wide** block are rejected
  with a 409 error (the block's reason, if set, is shown to the customer).
- New booking submissions that overlap a **therapist-specific** block skip
  that therapist during automatic assignment (falling back to another
  available therapist, or rejecting the booking if none are free), the same
  way an existing calendar conflict is handled.
- The owner **Booking Calendar** tab shows blocks inline in the hourly grid
  and in a summary banner for the selected day.
- The therapist dashboard's calendar/agenda reflects the therapist's own
  blocks automatically.

Blocks are stored in a new `Unavailability` tab in the Google Sheet (created
automatically on first use, following the same pattern as `Branches` and
`Services`) — this is low-volume configuration data, so it intentionally stays
in Sheets rather than moving to BigQuery.

## Google Reviews

The owner dashboard has a **Google Reviews** section (under **Grow**) that
shows your Google Business Profile's average rating, total rating count, and
most recent reviews, along with a quick link to view all reviews on Google.

### Asking past customers for a review

The **Ask for a review** button in that section opens a picker listing every
customer who has actually attended an appointment — a booking whose end time
has already passed in the clinic's timezone and that was not cancelled, within
the last 730 days — deduplicated by email and showing
their most recent visit. Selecting customers and pressing **Send** emails each
one a short message with a button linking to your Google review form.

- An appointment counts as attended as soon as its end time passes, so a
  customer who was treated earlier the same day can be asked immediately.
- Rows with a missing or unrecognised time fall back to counting as attended
  once their date is before today, so migrated historical bookings still work.
- Customers who have unsubscribed from marketing emails are listed but cannot
  be selected.
- Every send is logged to a `ReviewRequests` tab in the Google Sheet (created
  automatically), so customers asked within the last 180 days are shown as
  already asked and are not pre-selected. They can still be selected manually.
- Up to 50 customers can be emailed at a time.
- Sending uses the same Gmail OAuth mailbox and business-profile requirements
  as email campaigns; if those are not configured the button explains what is
  missing.

This uses the [Places API (New) — Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details)
with an API key, so it does not require the more restrictive Google Business
Profile API / OAuth setup. **Enable "Places API (New)"** in
[Google Cloud Console](https://console.cloud.google.com/apis/library/places-backend.googleapis.com)
for your project — the older, legacy "Places API" is not used and will not
work here (Google now rejects `maps.googleapis.com/maps/api/place/details`
calls for projects that only have the new API enabled, returning "You're
calling a legacy API, which is not enabled for your project"). To enable this
section, add these server-side Vercel Environment Variables:

- `GOOGLE_PLACES_API_KEY` (an API key with the **Places API** enabled in
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials);
  restrict it to the Places API for security)
- `GOOGLE_PLACE_ID` (your business's Google Place ID — look it up with the
  [Place ID Finder](https://developers.google.com/maps/documentation/places/web-service/place-id))

Redeploy after adding these. Reviews are cached for 10 minutes per server
instance to stay within Places API quotas; use **Refresh** in the dashboard to
force a check sooner. If these variables are not set, the section shows setup
instructions instead of an error. Note the Places API only returns up to 5 of
the most relevant/recent reviews — for the full list, use the **View on
Google** link.

The owner dashboard's **Loyalty program** section lets the owner configure the
Standard, Gold, and Platinum plans, point earning and redemption, first-session
bonus, monthly Gold Hot Stone allowance, and Platinum top-up price, hours, and
discounts. Defaults are 10 points per $1 actually paid (1,000 per $100), 5x
points on the first single-session purchase, and 10,000 points for $10 off.
Gold defaults to $39/month, 10% off services, 1.5x points, and one free Hot
Stone add-on per month. Platinum defaults to a $1,500 top-up for 50 prepaid
hours, 30% off services, and $10 off a Hot Stone add-on. Gold and Platinum
discounts are checked during online booking. Platinum members receive the
configured service discount while they have prepaid hours remaining; completed
visits deduct their duration from the company's shared balance, including the
remaining fraction of an hour on a final visit. Platinum hours do not make a
booking free. Customers can separately opt into Standard Rewards while booking;
this consent is independent of marketing email consent.

Settings, members, and the transaction ledger are stored in the BigQuery
`loyalty_settings`, `loyalty_members`, and `loyalty_ledger` tables, which the
API creates automatically and seeds from the old spreadsheet tabs on first use
(see "Loyalty program tables in BigQuery" above). The owner can search recent
booking customers by name, email, or phone when enrolling them. Platinum
employees are associated with a company name and optional company ID; the
enrolled work email is their booking identifier. At booking, an employee can
request Platinum with their company name and employee/company ID. Staff records
the company's registration/contact email during onboarding; claim emails go to
the employee and copy that registered contact. For subsequent employees, the
stored contact is reused for the matching company. A claim is pending: the
clinic must verify eligibility and record payment before prepaid hours or
Platinum booking benefits are activated. Staff can onboard the employee from
the searchable customer directory and, when payment is confirmed, select
**Payment confirmed** to add the initial top-up hours in the same action.

Platinum prepaid hours are **pooled per company**: every employee enrolled
under the same company name shares one prepaid-hour balance, and only the
company's designated **primary owner/contact** can pay for a top-up — this
prevents any individual employee from independently topping up their own
account. The primary contact is set with the **Primary owner/contact**
checkbox when onboarding a Platinum member (only one can be active per company
at a time; checking it for a new person automatically un-marks the previous
one), or afterward with the **Make primary contact** button in the
**Members & balances** table. Attempting to record a top-up for a non-primary
employee — from either the owner dashboard or the standalone top-up
endpoint — is rejected with a message naming the current primary contact, if
one exists.

After a member's appointment treatment time has passed, staff can confirm an
eligible visit from the dashboard. Standard/Gold point awards are based on the
amount actually paid, and Platinum visits covered by prepaid hours deduct the
session duration from the company's shared balance, while paying the Platinum
service discount rate. A completed, fully paid single
session receives the first-session multiplier when it is the customer's first
qualifying visit. Gold free Hot Stone add-ons and visit records are limited by
the configured monthly allowance. Booking IDs are recorded so point awards,
prepaid-hour use, or a free add-on cannot be recorded twice. Staff can redeem
points against a fully paid booking before its receipt is issued. Receipts show
any membership or group-benefit discount already applied at booking, then any
points redemption; tax is calculated on the discounted amount, and the receipt
number is saved on the loyalty ledger entry. The customer gets a redemption
email with the points balance and a receipt email with the receipt number,
discounts, points redeemed, and updated points balance. Loyalty receipt
discounts cannot be attached after a receipt has already been issued. Branded
loyalty emails share the same responsive format and include membership details,
points or prepaid-hour balances, and redemption or top-up confirmations.
Platinum top-ups are recorded only after the owner confirms payment and the
target employee is the company's primary contact; the added hours go into the
company's shared balance and the updated balance is emailed to that employee.

From the **Members & balances** table, the owner can remove a single member
(any plan) with the **Remove member** button, which deletes their row from
`LoyaltyMembers` and emails them a removal notice (copying the company contact
if one is on file). For Platinum or Legacy Silver employees, a **Remove
company** button removes every employee enrolled under that same company name
in one action and emails each removed employee, copying the company contact.
Removal does not alter past receipts or ledger history; it only ends the
member's active benefits and points/hours balance going forward.

The **Recent rewards activity** panel has a **Reset ledger** button for manually
clearing recorded loyalty history. Choose **One member** and pick them from the
list to delete just their ledger entries, or **Entire ledger** to delete every
entry for every member. Wiping the whole ledger requires typing `CLEAR LEDGER`
to confirm. Clearing deletes rows from `LoyaltyLedger` only: point balances and
Platinum prepaid hours reset to zero, but members keep their enrolment,
membership plan and paid-through date, and past receipts are unaffected.
Because it is a permanent delete, there is no undo.

Each Platinum company also gets a self-service **Company portal**: a private,
token-based link (no login required) that the registered company contact can
use to see how many employees are enrolled, each employee's role (primary
contact or regular employee) and personal hours used, the one shared
prepaid-hour balance remaining, recent top-up and usage activity across the
whole company, a form to sign up a single new employee (who starts at 0 usage
and draws from the shared balance once the primary contact tops it up), and an
**Upload employee list (Excel/CSV)** button for bulk onboarding. The bulk
upload accepts `.xlsx`, `.xls`, or `.csv` files with Name (or First Name/Last
Name) and Email columns (Phone is optional and column headers are matched
case-insensitively), parses them client-side, and onboards every valid,
not-already-enrolled row in a single request — skipping and reporting any rows
that are missing details or already enrolled. The link is created and emailed
automatically the first time a Platinum employee is enrolled or claims
Platinum with a company contact email on file; the owner can also copy/
re-share it any time from the **Members & balances** table with the **Copy
portal link** button. Portal access, the token, and each company's
registration details are stored in the BigQuery `loyalty_companies` table
(auto-created alongside the other loyalty tables).

### Employee self-registration link

So the primary contact does not have to onboard every colleague by hand, each
Platinum company also gets a **separate, restricted employee signup link**
(`?joinToken=…`) with its own token, stored in the `Join Token` column of
`loyalty_companies`. Companies enrolled before this existed are backfilled with
a join token automatically the next time their portal or portal link is opened.

The primary contact copies it from the **Let employees sign themselves up**
panel inside their company portal (the owner can also copy it from the
**Members & balances** table with **Copy employee signup link**) and forwards it
to the whole team. Opening it shows only the company name, the Platinum
benefits, and a name/email/phone form — it deliberately exposes **no** employee
roster, hours balance, top-up history, or bulk upload, and it cannot be used to
open the admin company portal. This matters because the admin
`?companyToken=…` link must *not* be forwarded to employees: it would reveal
every colleague's contact details and usage.

Employees who sign up this way are enrolled exactly as if the primary contact
had added them: organization, company ID, and contact email are forced from the
token record (so the link can never enrol someone under a different company),
they are never marked as the primary contact, duplicate emails are rejected,
and the usual Platinum welcome email is sent. Whenever an employee's completed visit
deducts prepaid hours from the shared balance, the registered company contact
is automatically emailed who used their benefit, the service, hours used, and
the company's remaining shared balance, in addition to the employee's own
balance email. Removing a member or an entire company (see above) also removes
the matching `LoyaltyCompanies` row so a deleted company's portal link stops
working.

The owner dashboard includes a **Business profile** section for editing the
business name, optional legal name, description, email, phone, website, location,
and optional GST/HST registration number for receipts. Profile values are saved
to a `BusinessProfile` tab in `GOOGLE_SPREADSHEET_ID`, which the API creates
automatically, and load for owners across devices. Existing six-field profiles
are migrated automatically when the owner profile is next loaded. The service
account must have Editor access to that spreadsheet.

**Sales & reports** summarizes sales, collected payments, outstanding balances,
appointments, tax estimates, and top services for a selectable date range.
**Email marketing** includes an audience assistant, campaign previews,
browser-local drafts, and Gmail campaign delivery to a maximum of 50 active,
opted-in contacts per send. The Vercel function allows up to 60 seconds for a
campaign batch. The assistant matches historical booking dates, branches, and
services; historical bookings do not prove attendance.

The audience can be built two ways. **Describe with Gemini** turns a free-text
description ("gold members who come every Wednesday at Oakville Downtown") into
structured filters; only the description itself and the list of branch, service,
and membership names is sent to Gemini — never customer names, email addresses,
patient data, or booking rows. When `GEMINI_API_KEY` is not configured, or when
the Gemini request fails, the original offline keyword matcher is used instead.
**Manual filters** builds the same audience from membership tier, branch,
service, weekday (optionally regulars only), recent-visit window, and a
most-recent-customer cap, entirely on your own data with no AI involved. The
choices offered come from `GET /api/booking?view=campaign-audience-options`,
which returns the branches, services, and membership tiers that actually occur
in your records.

The audience is always rebuilt from the live database at preview time **and**
again at send time. Any marketing contact whose customer and patient records
have all been deleted — through Delete booking, Delete patient history, or
Loyalty remove member — is removed from the marketing list and therefore cannot
receive a campaign. Those deletion endpoints run the same sync immediately and
report the removed addresses in their responses. An optional Gemini 3.8
Flash writing assistant uses Google's Interactions API to generate an editable
subject, preview, and message from the owner's campaign goal and aggregate
audience description. It never receives customer names, email addresses, or
booking rows, and it never sends generated copy automatically; generation
requests are not stored by the provider. Customers are added only after
checking the separate optional marketing consent box in the booking form.
Existing booking or treatment-consent records are not imported as marketing
consent. Campaigns include the business mailing address and unsubscribe links;
unsubscribed contacts are excluded from future sends. Configure the Gmail OAuth
sender as `mythaithaimassage@gmail.com` with the existing `gmail.send` scope,
and enter the full business mailing address in Business profile before sending.
To enable AI copy generation, create a Gemini API key in
[Google AI Studio](https://aistudio.google.com/app/apikey), add it to Vercel as
the server-side environment variable `GEMINI_API_KEY` for the production
environment, and redeploy. Keep this key private; do not put it in frontend
code or commit it to the repository. Google AI Studio/Gemini API usage may be
subject to Google's quotas, terms, and charges.
The API creates a `MarketingContacts` tab in `GOOGLE_SPREADSHEET_ID` for consent
status and unsubscribe tokens. Restrict access to this tab to authorized staff.
For example, ask for customers with at least two past Wednesday bookings at a
named branch, or the most recently active customers at a branch in the last 30
days. Audience rules use recorded booking dates and do not infer appointment
attendance.

Every campaign send is logged with a unique campaign ID to the
`campaign_log`/`campaign_recipients` BigQuery tables (subject, preview,
message, campaign goal, resolved audience description, and per-recipient send
status), auto-created the same way as the bookings/Square-payments tables
above. A **Campaign history** list in the Email marketing tab shows recent
sends (date, subject, audience, sent/failed counts) pulled from BigQuery for
future reference/audit — this is a delivery log only; it does not affect
future audience matching, which is always resolved live from Sheets/BigQuery
at send time.

## Daily therapist hours & branch audit PDF reports

The **Sales & reports** tab has a **Daily reports** panel with a date picker
and two one-click PDF downloads, generated entirely in the browser from
already-loaded booking data (no extra API calls):

- **Therapist hours (PDF)** — for the selected day, one row per therapist with
  appointment count and total hours served (`duration_minutes` summed and
  converted to hours), across all branches. Cancelled bookings are excluded.
- **Branch audit (PDF)** — for the selected day, grouped by branch: a
  per-therapist hours summary followed by a full appointment-level detail
  table (time, therapist, service, duration, status) for audit purposes.

Both reports default to today (in `America/Toronto`, matching the calendar
time zone) and can be filtered by branch using the existing branch selector.

In the owner **Booking Calendar**, open a linked appointment to review its
patient and payment details. If payment was received outside the booking flow,
check **Paid already** to record the full appointment total as paid in Google
Sheets. A receipt can be issued and emailed only when the booking sheet records
full payment and a valid patient email. Receipt number, issue time, and email
status are recorded in columns S-U of `Sheet1`. Receipt delivery uses the
configured Gmail OAuth sender and the saved business profile. RMT/acupuncture
services are treated as HST-exempt; other services use the Ontario 13%
tax-inclusive rate for the receipt breakdown.

### Customer self-service cancel/reschedule and the 24-hour policy

Cancellation and reschedule status are recorded in columns Y (`Status`) and Z
(`StatusNotes`) of `Sheet1`. Customers can manage an existing booking from the
"Manage an existing booking" link on the booking portal by entering their
booking reference (`MTT-XXXXXX`) and the email used at booking:

- **Cancel ≥ 24 hours before the appointment**: any payment made is
  automatically refunded through Square when the booking was paid via Square
  Checkout (looked up from the `square_payments` BigQuery table); cash/e-transfer/in-clinic
  payments are flagged in `StatusNotes` as "refund owed — manual" for staff to
  process.
- **Cancel < 24 hours before the appointment**: no refund is issued.
- **Reschedule**: always allowed (as long as the booking isn't already
  cancelled) and never issues a refund, regardless of the 24-hour window. Only
  the date/time and the linked Google Calendar event are updated; branch,
  service, and therapist stay the same.

Cancelling deletes the linked Google Calendar event (if any) and sends a
confirmation email; rescheduling updates the Google Calendar event's start/end
time and sends a confirmation email noting no refund was issued. The owner
**Booking Calendar** shows a "Cancelled" badge on cancelled appointments and a
couple-massage icon on any booking whose service name contains "Couple".

Calendar events created outside the booking flow (for example, an appointment
typed directly into Google Calendar for a walk-in) are automatically linked to
`Sheet1` when the owner calendar view is loaded. The app creates a booking row
from the event details (and from structured fields in the event description
when available), so staff can immediately track payment and continue to receipt
issuing. If required details such as patient email or appointment total are
missing, the appointment panel shows a short "Save details" form to complete
only those missing fields.

### Cancellation policy and manage link in the confirmation email

Every booking confirmation email (text and HTML parts) carries a **Cancellation
policy** block and a **Cancel or reschedule this appointment** button. The
button points at `https://<host>/?manage=1&ref=MTT-XXXXXX`, which opens the
booking portal directly on the manage-booking form with the reference already
filled in; the customer still confirms with the email address used at booking.

When the booking has an online payment attached, the policy paragraph names the
exact amount ("This appointment includes a $10.00 online payment…") so the
refund window is unambiguous. Bookings with no online payment get the generic
wording instead. Step 4 of the booking flow shows the matching policy text
before the customer submits.

### Public privacy policy and terms

The booking footer links to public, login-free `/privacy-policy` and
`/terms-of-service` pages. The medical-history consent panel and booking review
also link to these pages in a new tab so customers do not lose their form.
Content is maintained in `public/privacy-policy.html` and
`public/terms-of-service.html`, with shared styling in `public/legal.css`.
Vite copies these files into `dist`; explicit Vercel rewrites serve the clean
URLs without running the booking API or requiring JavaScript.

For the current production hostname, the Google OAuth Branding URLs are:

- Home page: `https://mythaithaibook.vercel.app/`
- Privacy policy: `https://mythaithaibook.vercel.app/privacy-policy`
- Terms of service: `https://mythaithaibook.vercel.app/terms-of-service`

Confirm these URLs load publicly after deployment before using them in Google
Cloud. Publishing these documents does not publish or verify the Google OAuth
app. Google may also require verified ownership of an authorized domain; use
an owned custom domain if the shared `vercel.app` domain cannot be verified.

These documents are initial policy drafts based on the implemented webapp.
The operator must review them for actual business practices and applicable
privacy, health-record, retention, and consumer obligations before adoption.
Update the content and revision dates when practices change. They are not a
legal-compliance certification.

### Branch-specific payment choices

Each branch row in the owner **Branches** editor has three independent toggles:
**Pay at clinic (no deposit)**, **$10 deposit**, and **Pay in full online**.
Enable at least one. Customers see only enabled options, and the API checks the
selected option against the branch's saved settings. The deposit is $10 (or the
appointment total if lower), not the service catalogue's legacy deposit field.
Pay-at-clinic bookings skip Square checkout.

These settings are stored in columns I-K of the `Branches` sheet: `Allow Clinic
Payment`, `Allow Deposit Payment`, and `Allow Full Payment`. Legacy rows with
blank values preserve their column H (`Collects Deposit`) behavior: online
collection enables deposit and full payment; opting out enables clinic payment
only. Saving branches writes the new columns and headers.

### Booking hours, catalogue, and medical history

Booking and rescheduling offer starts from **10:00 AM to 7:00 PM**, in 15-minute
intervals. The API enforces the same start times. Previously saved appointments
are not moved.

Customer service categories come from active catalogue entries rather than a
hard-coded list. RMT services remain bookable when active; the RMT Healthcare
category appears only if active services use that category. Hot Stone add-ons
remain a separate checkbox rather than a standalone appointment.

New medical-history forms offer **Light**, **Medium**, and **Firm** pressure.
Previously recorded Extra Firm preferences remain readable. The rotatable body
map uses connected anatomical contours and warmer shading, while retaining
front/back/side views, body types, keyboard-accessible area selection, and
read-only patient summaries.

Customers can choose **Skip medical history for now** during booking. This
does not record medical consent or create an empty history row. They must
complete their history before treatment. The separate **Medical history only**
entry point requires an existing booking reference and matching booking email;
it submits the same medical form without creating another appointment,
Calendar event, payment, or confirmation email. Cancelled and no-show bookings
cannot receive a new submission. The API validates consent and signature, and
uses the saved booking's identity rather than client-supplied patient details.

### Walk-in bookings without payment

Opening the booking flow from **New Walk-in / Phone Booking** in the owner
dashboard marks the session as a staff booking. Step 4 then shows a
**Staff: skip payment and confirm the booking** checkbox, which sets the online
deposit to `$0`, suppresses the Square checkout, and records the booking with
payment option `clinic`.

### Hot Stone add-on and Platinum surcharge

The Hot Stone add-on is no longer listed as a bookable service. It appears as a
checkbox under the service grid, adds its price and duration to the
appointment, and is appended to the service name on the booking record and
calendar event.

Membership pricing is applied to the service and the add-on separately:

- **Platinum** — the plan discount on the service, `hotStoneDiscount` off the
  add-on, plus a **Platinum Hot Stone
  surcharge** added only when the add-on is selected. The surcharge amount is
  configured in **Loyalty settings → Platinum Hot Stone surcharge ($)** and
  defaults to `$5`.
- **Gold** — the plan discount on the service; the add-on is free when the
  member's monthly free Hot Stone allowance is still available.
- **Silver / regular** — the plan discount applies to both.

### Automatic membership eligibility prompt

When a customer finishes typing their email on step 3, the portal calls
`GET /api/booking?view=loyalty-eligibility` and, if a paid membership is found,
shows a banner ("You have an eligible Platinum plan — 30% discount") listing the
benefits. The same response drives the pricing above, so the discount, add-on
pricing, and surcharge on the step 4 summary always match the banner.

Employees enrol themselves through the company Platinum portal link
(`?companyToken=…`) that the primary contact copies from the loyalty members
table; see the loyalty program section above.

### Medical history select-all

The medical conditions grid on step 3 has **Select all → No / Clear** controls;
customers answer **Yes** individually for each applicable condition.

### Reassigning an appointment to a different therapist

The appointment panel in the owner **Booking Calendar** includes a "Change
therapist…" picker (`POST /api/booking?view=reassign-therapist`, owner-only).
Selecting a therapist and pressing **Assign** validates the move before
anything is written:

- The booking must exist and must not be cancelled, and the chosen therapist
  must differ from the one already assigned.
- The therapist must not have a time-off block overlapping the appointment
  window, and must not have another calendar appointment overlapping it. The
  booking's *own* calendar event is excluded from this check, so reassigning
  never conflicts with itself.
- `Any Available` is always allowed, since it is a placeholder rather than a
  person. Couple services store two comma-separated names and each real name is
  checked independently.

On success the linked Google Calendar event description is patched so its
`Therapist:` line matches — the customer-facing availability check reads
therapists from calendar descriptions, so this keeps future availability
lookups correct. Only after the calendar update succeeds is column G
(`Therapist`) rewritten, and column Z (`StatusNotes`) gains an audit line
recording the timestamp, the previous therapist, and the new one. No email is
sent for a reassignment.

For new bookings to be written to the primary calendar, share that calendar
with the service-account email as an Editor. For the embedded native calendar
view to display appointments, share the calendar with the admin users or
publish it according to Google Calendar's sharing settings. The embedded
visual view is not filtered by the dashboard's therapist selector; the
appointment list below it is.

The primary calendar ID must be the calendar owner's actual calendar ID. For
the Gmail account in this project, leave `GOOGLE_PRIMARY_CALENDAR_ID` unset or
set it to `mythaithaimassage@gmail.com`. In Google Calendar, open the primary
calendar's **Settings and sharing**, add the service-account email, and grant
**Make changes to events** permission. Without that permission, bookings
cannot be written to the primary calendar.

Store the service-account values only in Vercel Environment Variables. Do not
commit the JSON key or paste its private key into source control.

### Patient history

The booking form includes the health-history fields from the clinic's paper
form. Each completed form is linked to its booking and stored in the
`patient_history` BigQuery table (configurable with
`BIGQUERY_PATIENT_HISTORY_TABLE`). The table is created automatically. On
first use, existing rows in the legacy `PatientHistory` tab in
`PATIENT_HISTORY_SPREADSHEET_ID` are copied into BigQuery without deleting the
spreadsheet data; repeated migration attempts do not duplicate records. The
service account needs access to the legacy spreadsheet for this initial copy,
as well as the BigQuery roles described above. The spreadsheet remains a
backup after migration; new submissions and all application reads and deletes
use BigQuery.

The legacy spreadsheet tab uses this header row:

```text
Booking ID,Created At,Patient Name,Date of Birth,Gender,Phone,Email,Address,City,Postal Code,How Heard About Us,Heart Condition,Blood Pressure,Diabetes,Cancer,Headaches or Migraines,Bone or Joint Disorder,Broken Bones or Implants,Osteoporosis or Arthritis,Allergies to Oil,Surgeries,Numbness or Loss of Sensation,Skin Sensitivity or Easy Bruising,Pregnant or Recently Gave Birth,Medications or Supplements,Additional Health Details,Pain or Discomfort Areas,Body Areas,Preferred Pressure,Consent,Typed Signature,Signature Date,Pre-collection Consent,Consent Timestamp
```

Patient health information is sensitive. Restrict BigQuery and legacy
spreadsheet access to authorized clinic staff, enable strong account security,
and follow applicable privacy and health-information retention requirements.

### Therapist access

Therapists sign in through the **Therapist Login** portal. The server creates
an HTTP-only, eight-hour signed session and only returns appointments assigned
to the signed-in therapist. The therapist view shows a limited safety glimpse
such as pressure, affected body areas, allergies, reported-condition count,
pain areas, and additional safety details; it does not expose the full patient
history, contact details, or signature.

Generate a password hash locally with:

```bash
node -e "const c=require('crypto');const p=process.argv[1],s=c.randomBytes(16).toString('hex');console.log('scrypt$'+s+'$'+c.scryptSync(p,s,64).toString('hex'))" "replace-with-a-strong-password"
```

Set Vercel environment variables similar to:

```text
THERAPIST_SESSION_SECRET=<at least 32 random characters>
THERAPIST_ACCOUNTS=[{"id":"kanya-s","username":"kanya","name":"Kanya S.","passwordHash":"scrypt$..."}]
```

Use a separate account for each therapist, keep these values only in Vercel
Environment Variables, and redeploy after changing them.

Therapist self-registration is available from the **Therapist Login** screen.
New registrations are written to the `TherapistAccounts` tab with status
`pending` and cannot sign in until the owner approves them from the
**Therapist approvals** tab in the owner dashboard (the sidebar shows a badge
with the number of pending sign-ups). From that tab the owner can approve or
reject pending requests and revoke access for approved therapists. The API
creates the tab in the spreadsheet automatically. After approval, the
therapist can sign in with the username and password chosen during
registration. Only authorized administrators should approve accounts.
