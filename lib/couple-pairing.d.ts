export type CoupleBooking = {
  id?: string;
  customerName?: string;
  branchName?: string;
  date?: string;
  time?: string;
  timeRange?: string;
  durationMinutes?: number;
  calendarStart?: string;
  calendarEnd?: string;
  status?: string;
  serviceName?: string;
  therapistName?: string;
  couplePartnerBookingId?: string;
};

export function coupleTimeMinutes(time: string): number | null;
export function branchesMatch(branchA?: string, branchB?: string): boolean;
export function normalizeBranchIdentifier(value?: string): string;
export function bookingTimeRangeMinutes(booking?: CoupleBooking): { start: number; end: number } | null;
export function isCoupleCandidate(booking: CoupleBooking, candidate: CoupleBooking): boolean;
export function couplePairCandidates(booking: CoupleBooking, bookings: CoupleBooking[]): CoupleBooking[];
