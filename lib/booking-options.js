export const BOOKING_DEPOSIT_AMOUNT = 10;
export const AVAILABLE_TIMES = Array.from({ length: 37 }, (_, index) => {
  const minutes = 10 * 60 + index * 15;
  const hour = Math.floor(minutes / 60);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
});

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

export function validateAppointmentTime(time) {
  if (!AVAILABLE_TIMES.includes(time)) {
    throw new Error('Choose an appointment time from 10:00 AM to 07:00 PM in 15-minute intervals.');
  }
}
