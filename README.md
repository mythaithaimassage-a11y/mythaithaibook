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

Share the Google Sheet with the service account email as an Editor. Enable the
Google Sheets API and Google Calendar API in the Google Cloud project. The
service account creates calendars named `<Therapist> - MY THAI THAI` and shares
the primary calendar with `GOOGLE_PRIMARY_CALENDAR_ID`.

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
which reads `Sheet1!A:R`. Existing sheets may include the header row from the
schema, but the API also works when bookings are already present without a
header row.

The admin dashboard includes a live Google Calendar tab with date and branch
filters, a native embedded Google Calendar view for
`mythaithaimassage@gmail.com`, and a filtered appointment list. Owner access
uses server-side password verification. Set `OWNER_ADMIN_PASSWORD` and
`OWNER_ADMIN_SESSION_SECRET` in Vercel before deploying the owner dashboard
changes. Use a unique password of at least 16 characters and generate the
session secret with `openssl rand -hex 32`. The owner sign-in creates an
HTTP-only, same-site session that expires after eight hours. Owner-only
booking reads, calendar, patient-history, and business-profile endpoints
require this session; public customer booking submissions remain unchanged.

The owner dashboard includes a **Business profile** section for editing the
business name, optional legal name, description, email, phone, website, location,
and optional GST/HST registration number for receipts. Profile values are saved
to a `BusinessProfile` tab in `GOOGLE_SPREADSHEET_ID`, which the API creates
automatically, and load for owners across devices. Existing six-field profiles
are migrated automatically when the owner profile is next loaded. The service
account must have Editor access to that spreadsheet.

**Sales & reports** summarizes sales, collected payments, outstanding balances,
appointments, tax estimates, and top services for a selectable date range.
**Email marketing** currently saves campaign drafts in the browser only; it
does not send campaigns. Configure an opt-in subscriber list and unsubscribe
handling before enabling promotional delivery.

In the owner **Booking Calendar**, open a linked appointment to review its
patient and payment details. If payment was received outside the booking flow,
check **Paid already** to record the full appointment total as paid in Google
Sheets. A receipt can be issued and emailed only when the booking sheet records
full payment and a valid patient email. Receipt number, issue time, and email
status are recorded in columns S-U of `Sheet1`. Receipt delivery uses the
configured Gmail OAuth sender and the saved business profile. RMT/acupuncture
services are treated as HST-exempt; other services use the Ontario 13%
tax-inclusive rate for the receipt breakdown.

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
form. Each completed form is appended to the `PatientHistory` tab in
`PATIENT_HISTORY_SPREADSHEET_ID` and is linked to the booking ID. The API
creates the `PatientHistory` tab automatically if it is missing. The service
account must have Editor access to this spreadsheet.

Create this header row in `PatientHistory`:

```text
Booking ID,Created At,Patient Name,Date of Birth,Gender,Phone,Email,Address,City,Postal Code,How Heard About Us,Heart Condition,Blood Pressure,Diabetes,Cancer,Headaches or Migraines,Bone or Joint Disorder,Broken Bones or Implants,Osteoporosis or Arthritis,Allergies to Oil,Surgeries,Numbness or Loss of Sensation,Skin Sensitivity or Easy Bruising,Pregnant or Recently Gave Birth,Medications or Supplements,Additional Health Details,Pain or Discomfort Areas,Body Areas,Preferred Pressure,Consent,Typed Signature,Signature Date,Pre-collection Consent,Consent Timestamp
```

Patient health information is sensitive. Restrict spreadsheet access to
authorized clinic staff, enable strong account security, and follow applicable
privacy and health-information retention requirements.

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
`pending` and cannot sign in until an administrator changes that row's status
to `approved`. The API creates this tab automatically. After approval, the
therapist can sign in with the username and password chosen during
registration. Only authorized administrators should approve accounts.
