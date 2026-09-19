import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const payload = req.body;
    const rowValues = [
      payload.id,
      payload.customerName,
      payload.phone,
      payload.email,
      payload.branchName,
      payload.serviceName,
      payload.therapistName,
      payload.date,
      payload.time,
      payload.paymentOption,
      payload.paidAmount,
      payload.totalAmount,
      new Date().toISOString(),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Sheet1!A:M',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowValues],
      },
    });

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Google Sheets API Error:', error);
    return res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
}
