export type CalendarSync = {
  synced: number;
  pending: number | null;
  errors: { bookingId: string; message: string }[];
  stopped?: boolean;
};
export function runWixCalendarSync(
  requestBatch: (excludedIds?: string[]) => Promise<CalendarSync>,
  onProgress: (progress: { synced: number; pending: number | null }) => void | Promise<void>,
  initial?: CalendarSync,
): Promise<{ synced: number; pending: number }>;
