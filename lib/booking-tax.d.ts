export const HST_RATE: number;
export function isTaxExemptService(serviceName: string | undefined | null): boolean;
export function isCashPayment(paymentOption: string | undefined | null): boolean;
export function bookingTaxTreatment(serviceName: string | undefined | null, paymentOption: string | undefined | null): { taxable: boolean; label: string };
export function preTaxSubtotal(total: number, serviceName: string | undefined | null, paymentOption: string | undefined | null): number;
export function taxOn(subtotal: number, serviceName: string | undefined | null, paymentOption: string | undefined | null): number;
