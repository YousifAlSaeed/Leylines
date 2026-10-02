// Emails are stored encrypted (AES-256-GCM) with EMAIL_KEY, so a leaked copy of
// the database alone doesn't reveal them. Without EMAIL_KEY (local SQLite) they
// stay plain text. Stored form: "enc1:<iv>.<tag>.<ciphertext>", each base64url.
import crypto from 'node:crypto';
import { config } from '../config.js';

const PREFIX = 'enc1:';
// any long random string works as EMAIL_KEY; hashing it gives the 32-byte key
const key = config.emailKey ? crypto.createHash('sha256').update('leylines-email:' + config.emailKey).digest() : null;
export const emailKeySet = !!key;
const macKey = crypto.createHash('sha256').update('leylines-email-hash:' + (config.emailKey || 'local')).digest();

// the same email always gives the same hash, which is what accounts are looked up by
export const emailHash = (email) => email ? crypto.createHmac('sha256', macKey).update(String(email).trim().toLowerCase()).digest('hex') : null;

export function sealEmail(email) {
  if (!email || !key) return email || null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(email, 'utf8'), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

// the readable email, or null when it can't be read (no key, or a different key)
export function openEmail(stored) {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;
  if (!key) return null;
  try {
    const [iv, tag, ct] = stored.slice(PREFIX.length).split('.').map((s) => Buffer.from(s, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// encrypts emails saved before EMAIL_KEY was set and fills in missing email hashes; returns how many it encrypted
export async function upgradeStoredEmails(db) {
  let sealed = 0;
  for (const r of await db.all('SELECT id, email, email_hash FROM users WHERE email IS NOT NULL')) {
    const plain = openEmail(r.email);
    if (!plain) continue;
    const email = key && !r.email.startsWith(PREFIX) ? sealEmail(plain) : r.email, hash = emailHash(plain);
    if (email === r.email && hash === r.email_hash) continue;
    await db.run('UPDATE users SET email = $e, email_hash = $h WHERE id = $u AND email = $old', { $e: email, $h: hash, $u: r.id, $old: r.email });
    if (email !== r.email) sealed++;
  }
  return sealed;
}
