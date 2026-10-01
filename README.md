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

### Branch-specific deposit collection

Each branch row in the owner **Branches** editor has a **Collect deposit /
payment online for this branch** checkbox, stored in column H
(`Collects Deposit`) of the `Branches` sheet. Branches default to collecting a
deposit, so existing rows are unchanged.

When the checkbox is cleared, the booking portal hides the payment options for
that branch, skips the Square panel on the confirmation step, and confirms the
appointment with the full amount due at the clinic.

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
