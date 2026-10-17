export interface AppointmentAlertBooking {
  id: string;
  customerName: string;
  phone: string;
  email: string;
  hasEmail: boolean;
  branchName: string;
  serviceName: string;
  therapistName: string;
  date: string;
  time: string;
  durationMinutes: number;
  status: string;
  statusNotes: string;
  confirmedOnTime: boolean;
  reminderSent: boolean;
  isUpcoming: boolean;
  eligible: boolean;
}

export interface AppointmentAlertStats {
  total: number;
  upcoming: number;
  confirmed: number;
  remindersSent: number;
  cancelled: number;
  missingEmail: number;
}

export interface AppointmentAlertAudienceResult {
  todayDate: string;
  candidates: AppointmentAlertBooking[];
  stats: AppointmentAlertStats;
}

export interface AppointmentReminderEmailOptions {
  booking: {
    id: string;
    customerName?: string;
    email: string;
    phone?: string;
    serviceName?: string;
    therapistName?: string;
    date: string;
    time: string;
    branchName?: string;
  };
  confirmUrl: string;
  manageUrl: string;
  businessProfile?: {
    businessName?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  senderEmail?: string;
}

export const CONFIRMED_ON_TIME_TAG: string;
export function escapeHtml(value: unknown): string;
export function isConfirmedOnTime(statusNotes: unknown): boolean;
export function isReminderSent(statusNotes: unknown): boolean;
export function buildConfirmedOnTimeNotes(existingNotes: unknown, timestampIso?: string): string;
export function buildReminderSentNotes(existingNotes: unknown, timestampIso?: string): string;
export function isValidEmail(email: unknown): boolean;
export function collectAppointmentAlertCandidates(
  bookingRows: unknown[][],
  options?: {
    todayDate?: string;
    allowedBranches?: Set<string> | null;
    nowTimeMinutes?: number | null;
  }
): AppointmentAlertAudienceResult;
export function formatAppointmentReminderEmail(
  options: AppointmentReminderEmailOptions
): {
  subject: string;
  text: string;
  html: string;
  raw: string;
};
