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
Sheets. Configure these Vercel environment variables before using it:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SPREADSHEET_ID`
