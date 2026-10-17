export function validateBookingContact({ email: emailValue, phone: phoneValue, contact: contactValue }) {
  const contact = String(contactValue || '').trim();
  const isEmail = contact.includes('@');
  const email = emailValue === undefined ? (isEmail ? contact.toLowerCase() : '') : String(emailValue).trim().toLowerCase();
  const phone = phoneValue === undefined ? (isEmail ? '' : contact) : String(phoneValue).trim();
  const invalid = (message) => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  if (!email && !phone) invalid('Enter at least one email address or phone number.');
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    invalid('Enter a valid email address.');
  }
  if (phone && (phone.length > 40 || !/^\+?[\d\s().-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15)) {
    invalid('Enter a valid phone number (7 to 15 digits).');
  }
  if (contactValue !== undefined && (isEmail ? email !== contact.toLowerCase() : phone !== contact)) {
    invalid('Enter valid customer contact details matching the email or phone number.');
  }
  return { email, phone };
}
