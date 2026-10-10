export const HST_RATE = 0.13;

const round = (value) => Math.round(value * 100) / 100;

export function isTaxExemptService(serviceName) {
  return /registered massage therapy|\brmt\b|acupuncture/i.test(String(serviceName || ''));
}

export function isCashPayment(paymentOption) {
  return /^\s*cash\b/i.test(String(paymentOption || ''));
}

// Cash payments are not charged HST; card and other payment methods are.
export function bookingTaxTreatment(serviceName, paymentOption) {
  if (isTaxExemptService(serviceName)) return { taxable: false, label: 'HST exempt' };
  if (isCashPayment(paymentOption)) return { taxable: false, label: 'No HST (cash payment)' };
  return { taxable: true, label: 'HST (13%)' };
}

export function preTaxSubtotal(total, serviceName, paymentOption) {
  return round(bookingTaxTreatment(serviceName, paymentOption).taxable ? total / (1 + HST_RATE) : total);
}

export function taxOn(subtotal, serviceName, paymentOption) {
  return bookingTaxTreatment(serviceName, paymentOption).taxable ? round(subtotal * HST_RATE) : 0;
}
