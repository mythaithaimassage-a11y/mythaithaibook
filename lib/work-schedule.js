const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const DEFAULT_THERAPIST_START = '10:00';
export const DEFAULT_THERAPIST_END = '20:00';

export function validMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) return false;
  const [year, monthNumber] = month.split('-').map(Number);
  return year >= 2000 && year <= 2100 && monthNumber >= 1 && monthNumber <= 12;
}

export function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function minutesOfDay(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function weekdayKeyForDate(date) {
  if (!validDate(date)) return null;
  return WEEKDAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

export function isTherapistScheduledAtBranch(therapist, branchId, date) {
  const targetBranchId = Number(branchId);
  const dayKey = weekdayKeyForDate(date);
  if (!dayKey || !Number.isFinite(targetBranchId)) return false;
  const scheduledBranch = therapist?.schedule?.[dayKey];
  if (scheduledBranch !== undefined && scheduledBranch !== null && scheduledBranch !== '') {
    return Number(scheduledBranch) === targetBranchId;
  }
  const hasAnySchedule = WEEKDAY_KEYS.some((key) => {
    const value = therapist?.schedule?.[key];
    return value !== undefined && value !== null && value !== '';
  });
  if (hasAnySchedule) return false;
  return (therapist?.branches || []).some((id) => Number(id) === targetBranchId);
}

export function defaultTherapistShift(therapist, branchId, date) {
  return isTherapistScheduledAtBranch(therapist, branchId, date)
    ? { therapistId: therapist.id, branchId: Number(branchId), date, isWorking: true, startTime: DEFAULT_THERAPIST_START, endTime: DEFAULT_THERAPIST_END, showToPublic: true, isOverride: false }
    : { therapistId: therapist.id, branchId: Number(branchId), date, isWorking: false, startTime: '', endTime: '', showToPublic: true, isOverride: false };
}

export function shiftCoversAppointment(shift, date, startTime, durationMinutes) {
  const start = minutesOfDay(startTime);
  const shiftStart = minutesOfDay(shift?.startTime);
  const shiftEnd = minutesOfDay(shift?.endTime);
  const duration = Number(durationMinutes);
  return Boolean(shift?.isWorking && shift.date === date && start !== null && shiftStart !== null &&
    shiftEnd !== null && Number.isInteger(duration) && duration > 0 && start >= shiftStart && start + duration <= shiftEnd);
}

export function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}
