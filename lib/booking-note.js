export function validateBookingNote(note = '') {
  if (typeof note !== 'string' || note.length > 2000) {
    throw Object.assign(new Error('Enter an internal booking note of no more than 2,000 characters.'), { statusCode: 400 });
  }
  return note.trim();
}
