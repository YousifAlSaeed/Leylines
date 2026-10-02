// Emails are stored encrypted (AES-256-GCM) with EMAIL_KEY, so a leaked copy of
// the database alone doesn't reveal them. Without EMAIL_KEY (local SQLite) they
// stay plain text. Stored form: "enc1:<iv>.<tag>.<ciphertext>", each base64url.
import crypto from 'node:crypto';
import { config } from '../config.js';

const PREFIX = 'enc1:';
// any long random string works as EMAIL_KEY; hashing it gives the 32-byte key
const key = config.emailKey ? crypto.createHash('sha256').update('leylines-email:' + config.emailKey).digest() : null;
export const emailKeySet = !!key;

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

// encrypts any emails saved before EMAIL_KEY was set; returns how many
export async function sealStoredEmails(db) {
  if (!key) return 0;
  const rows = await db.all("SELECT id, email FROM users WHERE email IS NOT NULL AND email NOT LIKE 'enc1:%'");
  for (const r of rows)
    await db.run('UPDATE users SET email = $e WHERE id = $u AND email = $old', { $e: sealEmail(r.email), $u: r.id, $old: r.email });
  return rows.length;
}
