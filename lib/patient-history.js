export const HISTORY_CONDITION_FIELDS = [
  'heart', 'bloodPressure', 'diabetes', 'cancer', 'headaches', 'boneJoint',
  'brokenBones', 'osteoporosis', 'allergies', 'surgeries', 'numbness',
  'skinSensitivity', 'pregnant', 'medications',
];

export function emptyPatientHistory() {
  return {
    pressure: 'Medium', focusAreas: '', injuries: '', agreeTerms: false,
    dateOfBirth: '', gender: '', address: '', city: '', postalCode: '', heardAbout: '',
    conditions: Object.fromEntries(HISTORY_CONDITION_FIELDS.map((field) => [field, ''])),
    details: '', painAreas: '', bodyAreas: [], signature: '',
    signatureDate: new Date().toISOString().slice(0, 10),
    consent: false, reuseExisting: false, historyMode: 'new',
    preCollectionConsent: false, consentTimestamp: '',
  };
}

export function validatePatientHistory(history) {
  if (!history || typeof history !== 'object' || Array.isArray(history)) {
    throw new Error('Complete the medical history form or choose to skip it until before treatment.');
  }
  if (history.preCollectionConsent !== true || history.consent !== true
      || typeof history.signature !== 'string' || !history.signature.trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(history.signatureDate || '')
      || !Number.isFinite(Date.parse(history.consentTimestamp || ''))) {
    throw new Error('Medical history requires consent, a typed signature, signature date, and consent timestamp.');
  }
  if (!['Light', 'Medium', 'Firm'].includes(history.pressure)) {
    throw new Error('Choose Light, Medium, or Firm pressure.');
  }
  for (const field of HISTORY_CONDITION_FIELDS) {
    if (!['', 'Yes', 'No'].includes(history.conditions?.[field] ?? '')) {
      throw new Error('Medical history answers must be Yes or No.');
    }
  }
  return history;
}

export function patientHistoryValues(booking, history, now = new Date().toISOString()) {
  return [
    booking.id, now, booking.customerName, history.dateOfBirth || '', history.gender || '',
    booking.phone, booking.email, history.address || '', history.city || '', history.postalCode || '',
    history.heardAbout || '',
    ...HISTORY_CONDITION_FIELDS.map((field) => history.conditions?.[field] || ''),
    history.details || '', history.painAreas || '',
    Array.isArray(history.bodyAreas) ? history.bodyAreas.join(', ') : history.bodyAreas || '',
    history.pressure || '', history.consent ? 'Yes' : 'No', history.signature || '',
    history.signatureDate || '', history.preCollectionConsent ? 'Yes' : 'No',
    history.consentTimestamp || '',
  ];
}
