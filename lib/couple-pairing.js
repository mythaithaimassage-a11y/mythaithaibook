// Couple massage pairing links two separate single bookings that are served
// together, so staff can pair walk-ins and separately booked partners.
export const COUPLE_PAIR_WINDOW_MINUTES = 60;

const CANCELLED_STATUSES = ['Cancelled', 'No Show'];

export function coupleTimeMinutes(time) {
  const match = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)?$/i.exec(String(time || '').trim());
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

function branchKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function isCoupleCandidate(booking, candidate, windowMinutes = COUPLE_PAIR_WINDOW_MINUTES) {
  if (!booking?.id || !candidate?.id || booking.id === candidate.id) return false;
  if (CANCELLED_STATUSES.includes(String(booking.status || ''))) return false;
  if (CANCELLED_STATUSES.includes(String(candidate.status || ''))) return false;
  if (branchKey(booking.branchName) !== branchKey(candidate.branchName)) return false;
  if (String(booking.date || '') !== String(candidate.date || '')) return false;
  const partnerId = String(candidate.couplePartnerBookingId || '');
  if (partnerId && partnerId !== booking.id) return false;
  const start = coupleTimeMinutes(booking.time);
  const candidateStart = coupleTimeMinutes(candidate.time);
  if (start === null || candidateStart === null) return false;
  return Math.abs(start - candidateStart) <= windowMinutes;
}

export function couplePairCandidates(booking, bookings, windowMinutes = COUPLE_PAIR_WINDOW_MINUTES) {
  return (bookings || [])
    .filter((candidate) => isCoupleCandidate(booking, candidate, windowMinutes))
    .sort((a, b) => (coupleTimeMinutes(a.time) ?? 0) - (coupleTimeMinutes(b.time) ?? 0)
      || String(a.customerName || '').localeCompare(String(b.customerName || '')));
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
