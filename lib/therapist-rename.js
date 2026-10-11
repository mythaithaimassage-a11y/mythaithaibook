const fail = (message) => Object.assign(new Error(message), { statusCode: 409 });
const normalized = (name) => String(name || '').trim().toLowerCase();
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function renameTherapistLabel(label, sourceName, targetName) {
  const text = String(label || '');
  if (normalized(text) === normalized(sourceName)) return targetName;
  return text.replace(new RegExp(`(^|,\\s*)${escaped(sourceName)}(?=\\s*,|$)`, 'gi'), (_, prefix) => `${prefix}${targetName}`);
}

export function planTherapistRename(rows, therapists, accounts, mappings, sourceName, targetId) {
  if (typeof sourceName !== 'string' || !sourceName.trim() || sourceName.length > 150 || /[\r\n]/.test(sourceName) ||
      /^(any available|unknown|unassigned)$/i.test(sourceName.trim())) throw fail('Choose a real historical therapist name (up to 150 characters).');
  sourceName = sourceName.trim();
  const target = therapists.find((therapist) => String(therapist.id) === String(targetId) && therapist.active !== false);
  if (!target || !target.name || /[\r\n]/.test(target.name) || normalized(target.name) === normalized(sourceName)) {
    throw fail('Choose a different active existing therapist.');
  }
  if (accounts.some((account) => normalized(account.name) === normalized(sourceName))) {
    throw fail('The historical name belongs to a separate therapist login. Review its account and treatment-note ownership manually before merging.');
  }
  if (mappings.some((mapping) => normalized(mapping.sourceName) === normalized(target.name) ||
      normalized(mapping.targetName) === normalized(sourceName))) throw fail('Chained therapist aliases require manual review before merging.');
  const existing = mappings.find((mapping) => normalized(mapping.sourceName) === normalized(sourceName));
  if (existing && (String(existing.targetId) !== String(target.id) || existing.targetName !== target.name)) {
    throw fail('This historical name already maps to a different therapist. Review the saved mapping before continuing.');
  }
  const bookings = rows.filter((row) => row[0] && row[0] !== 'Booking ID').flatMap((row) => {
    const therapistName = renameTherapistLabel(row[6], sourceName, target.name);
    if (therapistName === row[6]) return [];
    if (normalized(row[6]) !== normalized(sourceName) && renameTherapistLabel(row[6], target.name, '') !== row[6]) {
      throw fail(`Booking ${row[0]} already includes the destination therapist. Review this couple assignment manually.`);
    }
    return [{ row, therapistName }];
  });
  return { sourceName, target, existing, bookings };
}

export async function renameTherapistBookingBatch(plan, { calendar, primaryCalendarId, updateBooking, now = () => new Date().toISOString() }) {
  let updated = 0;
  for (const { row, therapistName } of plan.bookings.slice(0, 5)) {
    let deletedEvent = false;
    if (row[16]) {
      const calendarId = row[15] || primaryCalendarId;
      let existing;
      try {
        existing = await calendar.events.get({ calendarId, eventId: row[16] }, { timeout: 10000, retry: false });
      } catch (error) {
        if (![404, 410].includes(Number(error?.response?.status || error?.code))) throw error;
        deletedEvent = true;
      }
      deletedEvent ||= existing?.data.status === 'cancelled';
      if (!deletedEvent) {
        const description = String(existing.data.description || '');
        const changed = /^Therapist:\s*.*$/m.test(description)
          ? description.replace(/^Therapist:\s*.*$/m, `Therapist: ${therapistName}`)
          : `${description}${description ? '\n' : ''}Therapist: ${therapistName}`;
        if (changed !== description) await calendar.events.patch({
          calendarId, eventId: row[16], sendUpdates: 'none',
          requestBody: { description: changed },
        }, { timeout: 10000, retry: false, headers: { 'If-Match': existing.data.etag } });
      }
    }
    await updateBooking(row, {
      therapistName,
      statusNotes: `${row[25] || ''}${row[25] ? '\n' : ''}Therapist name merged ${now()}: ${plan.sourceName} -> ${plan.target.name}.${deletedEvent ? ' Linked Calendar event was deleted; it was not recreated.' : ''}`,
    });
    updated += 1;
  }
  return { updated, remaining: plan.bookings.length - updated };
}

export function applySavedTherapistAliases(prepared, mappings, therapists) {
  return {
    ...prepared,
    bookings: prepared.bookings.map((booking) => {
      let therapistName = booking.therapist_name;
      for (const mapping of mappings) {
        const target = therapists.find((therapist) => String(therapist.id) === String(mapping.targetId));
        if (!target || target.name !== mapping.targetName) throw fail('A saved therapist alias destination changed. Review therapist mappings before importing.');
        therapistName = renameTherapistLabel(therapistName, mapping.sourceName, target.name);
      }
      return { ...booking, therapist_name: therapistName };
    }),
  };
}

export function parseTherapistAliases(rows) {
  if (JSON.stringify(rows[0]) !== JSON.stringify(['Historical Name', 'Therapist ID', 'Current Name', 'Created By', 'Created At'])) {
    throw new Error('TherapistAliases sheet has an unexpected header format.');
  }
  const mappings = rows.slice(1).filter((row) => row[0]).map((row) => ({ sourceName: row[0], targetId: row[1], targetName: row[2] }));
  for (const mapping of mappings) {
    if (!mapping.targetId || !mapping.targetName || normalized(mapping.sourceName) === normalized(mapping.targetName) ||
        mappings.some((other) => normalized(other.sourceName) === normalized(mapping.targetName) ||
          (normalized(other.sourceName) === normalized(mapping.sourceName) &&
            (String(other.targetId) !== String(mapping.targetId) || other.targetName !== mapping.targetName)))) {
      throw fail('Saved therapist aliases conflict or form a chain. Review the TherapistAliases sheet before continuing.');
    }
  }
  return mappings;
}

export async function readTherapistAliases(sheets, spreadsheetId) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const sheet = (metadata.data.sheets || []).find((item) => item.properties?.title === 'TherapistAliases');
  if (!sheet) return [];
  const result = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'TherapistAliases!A:E' });
  return parseTherapistAliases(result.data.values || []);
}

export async function saveTherapistAlias(sheets, spreadsheetId, plan, ownerEmail) {
  const existing = (await readTherapistAliases(sheets, spreadsheetId)).find((mapping) => normalized(mapping.sourceName) === normalized(plan.sourceName));
  if (existing) {
    if (String(existing.targetId) !== String(plan.target.id) || existing.targetName !== plan.target.name) {
      throw fail('This historical name already maps to a different therapist. Review the saved mapping before continuing.');
    }
    return;
  }
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  if (!(metadata.data.sheets || []).some((item) => item.properties?.title === 'TherapistAliases')) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: 'TherapistAliases' } } }] } });
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: 'TherapistAliases!A1:E1', valueInputOption: 'RAW',
      requestBody: { values: [['Historical Name', 'Therapist ID', 'Current Name', 'Created By', 'Created At']] },
    });
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: 'TherapistAliases!A:E', valueInputOption: 'RAW',
    requestBody: { values: [[plan.sourceName, plan.target.id, plan.target.name, ownerEmail, new Date().toISOString()]] },
  });
  await readTherapistAliases(sheets, spreadsheetId);
}
