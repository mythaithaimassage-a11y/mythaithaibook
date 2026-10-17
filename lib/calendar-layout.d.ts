type CalendarEvent = {
  id: string;
  localTime: string;
  start?: string | { dateTime?: string; date?: string };
  end?: string | { dateTime?: string; date?: string };
  booking?: { calendarStart?: string; calendarEnd?: string; durationMinutes?: number };
};
export const CALENDAR_SLOT_HEIGHT: number;
export function calendarEventRange(event: CalendarEvent): { start: number; end: number };
export function calendarEventStyle(event: CalendarEvent, columnEvents?: CalendarEvent[]): { top: number; height: number; left: string; width: string; right: string };
