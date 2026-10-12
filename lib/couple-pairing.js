const CANCELLED_STATUSES = ['Cancelled', 'No Show'];

export function coupleTimeMinutes(time) {
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?(?:\.\d+)?\s*(AM|PM)?$/i.exec(String(time || '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3] ? match[3].toUpperCase() : '';
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return (hour % 12) * 60 + minutes + (meridiem === 'PM' ? 720 : 0);
  }
  if (hour > 23) return null;
  return hour * 60 + minutes;
}

export function normalizeBranchIdentifier(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text.includes('mississauga') || text.includes('sherwoodtowne')) return 'mississauga';
  if (text.includes('oakville') || text.includes('lakeshore')) return 'oakville';
  if (text.includes('bloor') || text.includes('toronto west')) return 'toronto-west';
  if (text.includes('yorkville')) return 'yorkville';
  return text;
}

export function branchesMatch(branchA, branchB) {
  const keyA = normalizeBranchIdentifier(branchA);
  const keyB = normalizeBranchIdentifier(branchB);
  if (!keyA || !keyB) return true;
  return keyA === keyB;
}

export function parseDurationMinutes(duration, serviceName) {
  const parsed = Number(duration);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 1440) return parsed;
  const serviceMatch = /(?:^|\D)(\d{2,3})\s*min/i.exec(String(serviceName || ''));
  if (serviceMatch) {
    const mins = Number(serviceMatch[1]);
    if (mins > 0 && mins <= 1440) return mins;
  }
  return 60;
}

export function parseTimeRange(timeRange) {
  if (!timeRange || typeof timeRange !== 'string') return null;
  const parts = timeRange.split(/\s*[-–—]\s*/);
  if (parts.length !== 2) return null;
  const start = coupleTimeMinutes(parts[0]);
  const end = coupleTimeMinutes(parts[1]);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

export function appointmentRangeFromCalendar(calendarStart, calendarEnd) {
  if (!calendarStart || !calendarEnd) return null;
  try {
    const startDate = new Date(calendarStart);
    const endDate = new Date(calendarEnd);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
      return null;
    }
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto',
      hour12: false,
      hour: 'numeric',
      minute: 'numeric',
    });
    const startParts = formatter.format(startDate).split(':').map(Number);
    const endParts = formatter.format(endDate).split(':').map(Number);
    const start = startParts[0] * 60 + startParts[1];
    let end = endParts[0] * 60 + endParts[1];
    if (end < start) end += 1440;
    return { start, end };
  } catch {
    return null;
  }
}

export function bookingTimeRangeMinutes(booking) {
  if (!booking) return null;
  if (booking.timeRange) {
    const range = parseTimeRange(booking.timeRange);
    if (range) return range;
  }
  if (booking.calendarStart && booking.calendarEnd) {
    const range = appointmentRangeFromCalendar(booking.calendarStart, booking.calendarEnd);
    if (range) return range;
  }
  const start = coupleTimeMinutes(booking.time);
  if (start !== null) {
    const duration = parseDurationMinutes(booking.durationMinutes, booking.serviceName);
    return { start, end: start + duration };
  }
  return null;
}

export function isCoupleCandidate(booking, candidate) {
  if (!booking?.id || !candidate?.id || booking.id === candidate.id) return false;
  if (CANCELLED_STATUSES.includes(String(booking.status || ''))) return false;
  if (CANCELLED_STATUSES.includes(String(candidate.status || ''))) return false;
  if (!branchesMatch(booking.branchName, candidate.branchName)) return false;
  if (booking.date && candidate.date && String(booking.date) !== String(candidate.date)) return false;
  const partnerId = String(candidate.couplePartnerBookingId || '');
  if (partnerId && partnerId !== booking.id) return false;

  const bookingRange = bookingTimeRangeMinutes(booking);
  const candidateRange = bookingTimeRangeMinutes(candidate);

  return Boolean(bookingRange && candidateRange &&
    bookingRange.start === candidateRange.start && bookingRange.end === candidateRange.end);
}

export function couplePairCandidates(booking, bookings) {
  return (bookings || [])
    .filter((candidate) => isCoupleCandidate(booking, candidate))
    .sort((a, b) => String(a.customerName || '').localeCompare(String(b.customerName || '')));
}

// A calendar entry counts as a couple massage when it was booked as a couple
// service or when staff linked it to a partner appointment.
export function isCoupleAppointment(event) {
  if (!event) return false;
  return Boolean(event.isCouple) || Boolean(String(event.booking?.couplePartnerBookingId || '').trim());
}

export function isUnpairedCoupleAppointment(event) {
  return Boolean(event?.isCouple) && !String(event.booking?.couplePartnerBookingId || '').trim();
}

export function filterCoupleCalendarEvents(events, filter) {
  if (filter === 'couple') return (events || []).filter(isCoupleAppointment);
  if (filter === 'unpaired') return (events || []).filter(isUnpairedCoupleAppointment);
  return events || [];
}
