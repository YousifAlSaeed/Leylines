// Shared rules for account fields.
export const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// same rules as cleanName() in client/js/online.js
export const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

export const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.display_name, createdAt: u.created_at });

// returns an error message, or null when the sign-up fields are fine
export function checkSignup({ username, password, email }) {
  if (typeof username !== 'string' || !USERNAME.test(username)) return 'Usernames are 3 to 20 letters, numbers or underscores.';
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return 'Passwords need at least 8 characters.';
  if (email != null && email !== '' && (typeof email !== 'string' || email.length > 254 || !EMAIL.test(email))) return 'That email address doesn\'t look right.';
  return null;
}

// a save is the client's SAVE object; keep it a plain object of a sane size
export function checkSave(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Save data must be an object.';
  if (JSON.stringify(data).length > 64 * 1024) return 'Save data is too large.';
  return null;
}
