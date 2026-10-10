export const BOOKING_DEPOSIT_AMOUNT = 10;
export const AVAILABLE_TIMES = Array.from({ length: 37 }, (_, index) => {
  const minutes = 10 * 60 + index * 15;
  const hour = Math.floor(minutes / 60);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
});
export const BUSINESS_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const invalidHours = (message) => Object.assign(new Error(message), { statusCode: 400 });
const clockMinutes = (value) => {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};
export function defaultBusinessHours() {
  return Object.fromEntries(BUSINESS_WEEKDAYS.map((day) => [day, { closed: false, open: '10:00', close: '20:00' }]));
}
export function validateBusinessHours(hours) {
  if (hours === undefined) return defaultBusinessHours();
  if (!hours || typeof hours !== 'object' || Array.isArray(hours) ||
      Object.keys(hours).length !== 7 || BUSINESS_WEEKDAYS.some((day) => !Object.hasOwn(hours, day))) {
    throw invalidHours('Set business hours for all seven days.');
  }
  return Object.fromEntries(BUSINESS_WEEKDAYS.map((day) => {
    const entry = hours[day];
    const open = clockMinutes(entry?.open), close = clockMinutes(entry?.close);
    if (typeof entry?.closed !== 'boolean' || !Number.isFinite(open) || !Number.isFinite(close) ||
        open % 15 || close % 15 || close <= open) {
      throw invalidHours('Choose valid opening and closing times in 15-minute intervals, with closing after opening.');
    }
    return [day, { closed: entry.closed, open: entry.open, close: entry.close }];
  }));
}
export function businessHoursForDate(branch, date) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw invalidHours('Choose a valid appointment date.');
  }
  const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][parsed.getUTCDay()];
  return validateBusinessHours(branch?.businessHours)[day];
}
export function appointmentTimeMinutes(time) {
  const match = /^(0[1-9]|1[0-2]):([0-5]\d) (AM|PM)$/.exec(time);
  if (!match || Number(match[2]) % 15) throw invalidHours('Choose a valid appointment time in 15-minute intervals.');
  return Number(match[1]) % 12 * 60 + Number(match[2]) + (match[3] === 'PM' ? 720 : 0);
}
export function appointmentTimeLabel(minutes) {
  const hour = Math.floor(minutes / 60);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}
export function branchAppointmentTimes(branch, date, duration = 60) {
  const hours = businessHoursForDate(branch, date);
  if (!Number.isInteger(duration) || duration <= 0 || duration > 1440) throw invalidHours('Choose a service with a valid duration.');
  if (hours.closed) return [];
  const open = clockMinutes(hours.open), close = clockMinutes(hours.close);
  const lastStart = Math.min(close - 60, close - duration);
  return Array.from({ length: Math.max(0, Math.floor((lastStart - open) / 15) + 1) }, (_, index) => appointmentTimeLabel(open + index * 15));
}

export function branchPaymentOptions(branch) {
  const legacyOnline = branch?.collectsDeposit !== false;
  return {
    clinic: branch?.allowClinicPayment ?? !legacyOnline,
    deposit: branch?.allowDepositPayment ?? legacyOnline,
    full: branch?.allowFullPayment ?? legacyOnline,
  };
}

export function validateBranchPaymentOptions(branch) {
  const options = branchPaymentOptions(branch);
  if (Object.values(options).some((value) => typeof value !== 'boolean')) {
    throw new Error('Branch payment options must be enabled or disabled.');
  }
  if (!Object.values(options).some(Boolean)) {
    throw new Error(`Enable at least one payment option for ${branch?.name || 'each branch'}.`);
  }
  return options;
}

export function bookingCategories(services) {
  return ['All', ...new Set(services
    .filter((service) => service.active !== false && !/hot stone add-?on/i.test(service.name || ''))
    .map((service) => String(service.category || '').trim())
    .filter(Boolean))];
}

export function validateAppointmentTime(time, branch, date, duration = 60) {
  if (date !== undefined) {
    appointmentTimeMinutes(time);
    if (!branchAppointmentTimes(branch, date, duration).includes(time)) {
      throw invalidHours('Choose a time during branch business hours. Appointments must start at least one hour before closing and finish by closing.');
    }
  } else if (!AVAILABLE_TIMES.includes(time)) {
    throw new Error('Choose an appointment time from 10:00 AM to 07:00 PM in 15-minute intervals.');
  }
}
