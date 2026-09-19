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
- `GOOGLE_CALENDAR_TIME_ZONE` (defaults to `America/Toronto`)

Share the Google Sheet with the service account email as an Editor. Enable the
Google Sheets API and Google Calendar API in the Google Cloud project. The
service account creates calendars named `<Therapist> - MY THAI THAI` and shares
each calendar with `GOOGLE_CALENDAR_OWNER_EMAIL`.

Store the service-account values only in Vercel Environment Variables. Do not
commit the JSON key or paste its private key into source control.
