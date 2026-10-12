export type CoupleBooking = {
  id?: string;
  customerName?: string;
  branchName?: string;
  date?: string;
  time?: string;
  durationMinutes?: number;
  status?: string;
  serviceName?: string;
  therapistName?: string;
  couplePartnerBookingId?: string;
};

export function coupleTimeMinutes(time: string): number | null;
export function isCoupleCandidate(booking: CoupleBooking, candidate: CoupleBooking): boolean;
export function couplePairCandidates(booking: CoupleBooking, bookings: CoupleBooking[]): CoupleBooking[];
