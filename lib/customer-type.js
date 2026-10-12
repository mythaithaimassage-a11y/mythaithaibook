function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizedPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

export function customerTypeForBooking(booking, existingBookings) {
  const email = normalizedEmail(booking.email);
  const phone = normalizedPhone(booking.phone);
  if (!email && !phone) return null;

  const returning = existingBookings.some((existing) =>
    existing.id !== booking.id && (
      (email && normalizedEmail(existing.email) === email) ||
      (phone && normalizedPhone(existing.phone) === phone)
    )
  );
  return returning ? 'returning' : 'new';
}
