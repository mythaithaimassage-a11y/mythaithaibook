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
- `RESEND_FROM_EMAIL`

Share the Google Sheet with the service account email as an Editor. Enable the
Google Sheets API and Google Calendar API in the Google Cloud project. The
service account creates calendars named `<Therapist> - MY THAI THAI` and shares
the primary calendar with `GOOGLE_PRIMARY_CALENDAR_ID`.

Confirmation emails are sent through Resend. Create a Resend API key and
verify the sender address or domain in Resend. Set `RESEND_FROM_EMAIL` to the
verified sender address. The Calendar event does not invite attendees because
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

Store the service-account values only in Vercel Environment Variables. Do not
commit the JSON key or paste its private key into source control.
