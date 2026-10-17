export const CALENDAR_SLOT_HEIGHT = 40;

export function calendarEventRange(event) {
  const [hour, minute] = String(event.localTime || '').split(':').map(Number);
  const start = hour * 60 + minute;
  const startInstant = Date.parse(typeof event.start === 'string' ? event.start : event.start?.dateTime || event.start?.date || event.booking?.calendarStart || '');
  const endInstant = Date.parse(typeof event.end === 'string' ? event.end : event.end?.dateTime || event.end?.date || event.booking?.calendarEnd || '');
  const duration = Number.isFinite(startInstant) && Number.isFinite(endInstant)
    ? (endInstant - startInstant) / 60000 : Number(event.booking?.durationMinutes);
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Appointment ${event.id} has an invalid start or end time.`);
  }
  return { start, end: start + duration };
}

export function calendarEventStyle(event, columnEvents = [event]) {
  const { start, end } = calendarEventRange(event);
  const ordered = columnEvents.map((item) => ({ event: item, ...calendarEventRange(item) }))
    .sort((left, right) => left.start - right.start || right.end - left.end || String(left.event.id).localeCompare(String(right.event.id)));
  let group = [];
  let groupEnd = -Infinity;
  for (const item of ordered) {
    if (item.start >= groupEnd) {
      if (group.some((entry) => entry.event === event)) break;
      group = [];
      groupEnd = -Infinity;
    }
    group.push(item);
    groupEnd = Math.max(groupEnd, item.end);
  }
  const laneEnds = [];
  let eventLane = 0;
  for (const item of group) {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= item.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    if (item.event === event) eventLane = lane;
  }
  const lanes = Math.max(1, laneEnds.length);
  return {
    top: (start % 15) / 15 * CALENDAR_SLOT_HEIGHT + 2,
    height: (end - start) / 15 * CALENDAR_SLOT_HEIGHT - 4,
    left: `calc(${eventLane * 100 / lanes}% + 4px)`,
    width: `calc(${100 / lanes}% - 8px)`,
    right: 'auto',
  };
}
