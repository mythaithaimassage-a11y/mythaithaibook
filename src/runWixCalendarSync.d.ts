export type CalendarSync = {
  synced: number;
  pending: number | null;
  errors: { bookingId: string; message: string }[];
};
export function runWixCalendarSync(
  requestBatch: () => Promise<CalendarSync>,
  onProgress: (progress: { synced: number; pending: number | null }) => void,
  initial?: CalendarSync,
): Promise<{ synced: number; pending: number }>;
