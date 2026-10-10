import assert from 'node:assert/strict';
import test from 'node:test';
import { applySavedTherapistAliases, planTherapistRename, readTherapistAliases, renameTherapistBookingBatch, renameTherapistLabel, saveTherapistAlias } from '../lib/therapist-rename.js';
import { prepareWixBookings } from '../lib/wix-bookings.js';

const therapists = [{ id: 1, name: 'Tanya', active: true }, { id: 2, name: 'Inactive', active: false }];
const row = (id, name) => {
  const values = Array(31).fill('');
  values[0] = id; values[6] = name; values[25] = 'Existing history';
  return values;
};
test('therapist label replacement respects complete names, regex punctuation and couple partners', () => {
  assert.equal(renameTherapistLabel(' Old ', 'Old', 'Tanya'), 'Tanya');
  assert.equal(renameTherapistLabel('OLD, Second', 'Old', 'Tanya'), 'Tanya, Second');
  assert.equal(renameTherapistLabel('Second, Old', 'Old', 'Tanya'), 'Second, Tanya');
  assert.equal(renameTherapistLabel('Older', 'Old', 'Tanya'), 'Older');
  assert.equal(renameTherapistLabel('Dr. Old (RMT), Second', 'Dr. Old (RMT)', 'Tanya'), 'Tanya, Second');
  assert.equal(renameTherapistLabel('Michael T., RMT', 'Michael T., RMT', 'Tanya'), 'Tanya');
});
test('merge plan rejects separate login accounts, stale destinations, alias chains and duplicate couple assignments', () => {
  const plan = (...args) => planTherapistRename([row('B1', 'Old')], therapists, [], [], 'Old', 1, ...args);
  assert.equal(plan().bookings.length, 1);
  assert.throws(() => planTherapistRename([], therapists, [{ name: ' old ' }], [], 'Old', 1), /separate therapist login/);
  assert.throws(() => planTherapistRename([], therapists, [], [], 'Old', 2), /active existing/);
  assert.throws(() => planTherapistRename([], therapists, [], [], 'Tanya', 1), /different/);
  assert.throws(() => planTherapistRename([], therapists, [], [], 'Any Available', 1), /real historical/);
  assert.throws(() => planTherapistRename([row('B2', 'Old, Tanya')], therapists, [], [], 'Old', 1), /already includes/);
  assert.throws(() => planTherapistRename([], therapists, [], [{ sourceName: 'Tanya', targetName: 'Another' }], 'Old', 1), /Chained/);
  assert.throws(() => planTherapistRename([], therapists, [], [{ sourceName: 'Old', targetName: 'Other', targetId: 1 }], 'Old', 1), /different therapist/);
});
test('five-record batches update only therapist labels and appended audit history while preserving receipts and original Wix fields', async () => {
  const rows = Array.from({ length: 7 }, (_, index) => {
    const values = row(`WIX-${index}`, 'Old');
    values[10] = 113; values[11] = 113; values[14] = '{"sourceFields":{"Staff name":"Old"}}';
    values[18] = 'ISSUED';
    return values;
  });
  const original = structuredClone(rows);
  const options = {
    calendar: {}, primaryCalendarId: 'primary',
    updateBooking: async (values, fields) => { values[6] = fields.therapistName; values[25] = fields.statusNotes; },
    now: () => '2026-10-10T00:00:00Z',
  };
  let result = await renameTherapistBookingBatch(planTherapistRename(rows, therapists, [], [], 'Old', 1), options);
  assert.deepEqual(result, { updated: 5, remaining: 2 });
  result = await renameTherapistBookingBatch(planTherapistRename(rows, therapists, [], [], 'Old', 1), options);
  assert.deepEqual(result, { updated: 2, remaining: 0 });
  assert.deepEqual(await renameTherapistBookingBatch(planTherapistRename(rows, therapists, [], [], 'Old', 1), options), { updated: 0, remaining: 0 });
  rows.forEach((values, index) => {
    assert.equal(values[6], 'Tanya');
    assert.match(values[25], /^Existing history\nTherapist name merged/);
    assert.equal(values[14], original[index][14]);
    assert.equal(values[18], original[index][18]);
    assert.equal(values[10], 113);
  });
});
test('Calendar failures prevent booking writes; lost database writes are retryable without duplicate Calendar events', async () => {
  const values = row('B1', 'Old'); values[15] = 'calendar'; values[16] = 'event';
  let writes = 0, failCalendar = true, failDatabase = true;
  let description = 'Therapist: Old\nUnrelated data';
  const options = {
    primaryCalendarId: 'primary',
    calendar: { events: {
      get: async () => ({ data: { description, etag: '"v1"' } }),
      patch: async (request, transport) => {
        assert.equal(request.eventId, 'event');
        assert.equal(request.sendUpdates, 'none');
        assert.equal(transport.headers['If-Match'], '"v1"');
        if (failCalendar) throw new Error('Calendar denied');
        description = request.requestBody.description;
      },
    } },
    updateBooking: async (values, fields) => {
      writes++;
      if (failDatabase) throw new Error('Concurrent booking change');
      values[6] = fields.therapistName;
    },
  };
  const plan = () => planTherapistRename([values], therapists, [], [], 'Old', 1);
  await assert.rejects(renameTherapistBookingBatch(plan(), options), /Calendar denied/);
  assert.equal(writes, 0);
  failCalendar = false;
  await assert.rejects(renameTherapistBookingBatch(plan(), options), /Concurrent booking change/);
  assert.equal(values[6], 'Old');
  assert.equal(description, 'Therapist: Tanya\nUnrelated data');
  failDatabase = false;
  await renameTherapistBookingBatch(plan(), options);
  assert.equal(values[6], 'Tanya');
});
test('deleted Calendar events do not block historical correction or recreate cancelled appointments', async () => {
  for (const status of ['cancelled', 404, 410]) {
    const values = row('cancelled-booking', 'Old'); values[16] = 'deleted-event';
    const result = await renameTherapistBookingBatch(planTherapistRename([values], therapists, [], [], 'Old', 1), {
      calendar: { events: {
        async get() {
          if (status === 'cancelled') return { data: { status } };
          throw Object.assign(new Error('Deleted'), { response: { status } });
        },
        async patch() { assert.fail('Deleted events must not be patched'); },
      } },
      updateBooking: async (values, fields) => {
        assert.equal(fields.therapistName, 'Tanya');
        assert.match(fields.statusNotes, /Linked Calendar event was deleted; it was not recreated/);
      },
    });
    assert.equal(result.updated, 1);
  }
});
test('alias persistence rechecks concurrent changes and rejects conflicting or chained stored mappings', async () => {
  const header = ['Historical Name', 'Therapist ID', 'Current Name', 'Created By', 'Created At'];
  let rows = [header, ['Old', 1, 'Tanya']];
  let appends = 0;
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { title: 'TherapistAliases' } }] } }),
    values: {
      get: async () => ({ data: { values: rows } }),
      append: async () => { appends++; },
    },
  } };
  const plan = planTherapistRename([], therapists, [], [], 'Old', 1);
  await saveTherapistAlias(sheets, 'sheet', plan, 'owner');
  assert.equal(appends, 0, 'An already saved same-person alias is reused');
  rows = [header, ['Old', 3, 'Other']];
  await assert.rejects(saveTherapistAlias(sheets, 'sheet', plan, 'owner'), /different therapist/);
  assert.equal(appends, 0);
  rows = [header, ['Old', 1, 'Tanya'], ['OLD', 3, 'Other']];
  await assert.rejects(readTherapistAliases(sheets, 'sheet'), /conflict/);
  rows = [header, ['Old', 1, 'Tanya'], ['Tanya', 3, 'Other']];
  await assert.rejects(readTherapistAliases(sheets, 'sheet'), /chain/);
});
test('saved aliases apply after stable Wix IDs, preserving original source fields and existing therapist mappings', () => {
  const headers = ['Session date', 'Start time', 'Registration date', 'Booking contact name', 'Booking contact email', 'Booking contact phone', 'Client address', 'Spots filled', 'Duration', 'Service name', 'Service type', 'Staff name', 'Booking status', 'Attendance status', 'Payment status'];
  const csv = `${headers.join(',')}\n2099-01-01,10:00,2026-10-01,Client,client@example.com,,,1,60m,Massage,Appointment,Old,Confirmed,Not specified,Paid`;
  const prepared = prepareWixBookings(csv);
  const mapped = applySavedTherapistAliases(prepared, [{ sourceName: 'Old', targetId: 1, targetName: 'Tanya' }], therapists);
  assert.equal(mapped.bookings[0].booking_id, prepared.bookings[0].booking_id);
  assert.equal(mapped.bookings[0].therapist_name, 'Tanya');
  assert.equal(mapped.bookings[0].intake_notes, prepared.bookings[0].intake_notes);
  assert.throws(() => applySavedTherapistAliases(prepared, [{ sourceName: 'Old', targetId: 1, targetName: 'Stale' }], therapists), /destination changed/);
});
