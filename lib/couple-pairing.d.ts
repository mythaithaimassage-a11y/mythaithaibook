export type CoupleBooking = {
  id?: string;
  customerName?: string;
  branchName?: string;
  date?: string;
  time?: string;
  status?: string;
  serviceName?: string;
  therapistName?: string;
  couplePartnerBookingId?: string;
};

export const COUPLE_PAIR_WINDOW_MINUTES: number;
export function coupleTimeMinutes(time: string): number | null;
export function isCoupleCandidate(booking: CoupleBooking, candidate: CoupleBooking, windowMinutes?: number): boolean;
export function couplePairCandidates(booking: CoupleBooking, bookings: CoupleBooking[], windowMinutes?: number): CoupleBooking[];
