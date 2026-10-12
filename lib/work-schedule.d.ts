export type TherapistWorkShift = {
  therapistId: number | string;
  branchId: number;
  date: string;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  showToPublic: boolean;
  isOverride: boolean;
};

export const DEFAULT_THERAPIST_START: string;
export const DEFAULT_THERAPIST_END: string;
export function validMonth(month: string): boolean;
export function validDate(date: string): boolean;
export function minutesOfDay(value: string): number | null;
export function weekdayKeyForDate(date: string): string | null;
export function isTherapistScheduledAtBranch(therapist: { id: number | string; schedule?: Record<string, number | null>; branches?: number[] }, branchId: number | string, date: string): boolean;
export function defaultTherapistWorkingHours(therapist: { workingHours?: Record<string, { startTime: string; endTime: string }> }, date: string): { startTime: string; endTime: string };
export function defaultTherapistShift(therapist: { id: number | string; schedule?: Record<string, number | null>; branches?: number[]; workingHours?: Record<string, { startTime: string; endTime: string }> }, branchId: number | string, date: string): TherapistWorkShift;
export function shiftCoversAppointment(shift: TherapistWorkShift, date: string, startTime: string, durationMinutes: number): boolean;
export function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean;
