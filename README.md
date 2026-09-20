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
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (defaults to `bookings@mythaithaimassage.com`)
- `PATIENT_HISTORY_SPREADSHEET_ID` (defaults to the dedicated patient-history
  spreadsheet configured for this project)
- `THERAPIST_SESSION_SECRET` (long random secret used to sign HTTP-only
  therapist sessions)
- `THERAPIST_ACCOUNTS` (JSON array of therapist accounts with scrypt password
  hashes; see below)

Share the Google Sheet with the service account email as an Editor. Enable the
Google Sheets API and Google Calendar API in the Google Cloud project. The
service account creates calendars named `<Therapist> - MY THAI THAI` and shares
the primary calendar with `GOOGLE_PRIMARY_CALENDAR_ID`.

Confirmation emails are sent through Resend. Create a Resend API key and
verify the sending domain in Resend before using a `mythaithaimassage.com`
sender:

1. In Resend, open **Domains**, add `mythaithaimassage.com`, and copy the DNS
   records Resend provides.
2. Add those records at the DNS provider for `mythaithaimassage.com`. Keep the
   exact hostnames and values shown by Resend; do not substitute records from
   another domain.
3. Wait for Resend to show the domain as **Verified**.
4. Set `RESEND_FROM_EMAIL` to an address on that verified domain, for example
   `bookings@mythaithaimassage.com`, in the Vercel environment used by the
   deployed site, then redeploy.

The `from` domain must be verified in the same Resend account as
`RESEND_API_KEY`. A `403` response saying that
`mythaithaimassage.com` is not verified means the booking can still be saved
to Google Sheets and Calendar, but Resend will reject the confirmation email
until the DNS verification is complete. The Calendar event does not invite attendees because
standard Google service accounts cannot invite external attendees without
Google Workspace Domain-Wide Delegation.

The Admin Dashboard schedule loads live booking rows from `GET /api/booking`,
which reads `Sheet1!A:R`. Existing sheets may include the header row from the
schema, but the API also works when bookings are already present without a
header row.

The admin dashboard includes a live Google Calendar tab with date and branch
filters, a native embedded Google Calendar view for
`mythaithaimassage@gmail.com`, and a filtered appointment list. Admin access is currently gated in the browser with the temporary
password `mythai`. This is a UI gate, not production-grade authentication;
replace it with server-side authentication before exposing the dashboard
publicly.

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
