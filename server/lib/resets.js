// Forgotten passwords: a random token goes in an emailed link, only its SHA-256
// is stored. A link works once, for 30 minutes, and an account gets at most a
// few emails an hour so nobody can flood someone's inbox.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { emailHash, openEmail } from './emailCrypto.js';
import { sendMail } from './mailer.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const MIN = 60 * 1000;
const TTL = 30 * MIN;
const PER_HOUR = 3;
const iso = (ms) => new Date(ms).toISOString();

// a new link token, or null when the account already got PER_HOUR in the last hour
async function createReset(db, userId) {
  const { n } = await db.get('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = $u AND created_at > $t',
    { $u: userId, $t: iso(Date.now() - 60 * MIN) });
  if (Number(n) >= PER_HOUR) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  await db.run('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES ($h, $u, $c, $e)',
    { $h: sha256(token), $u: userId, $c: iso(Date.now()), $e: iso(Date.now() + TTL) });
  return token;
}

// the account a link belongs to, or null; every link for that account stops working
export async function useReset(db, token) {
  if (typeof token !== 'string' || !token) return null;
  const row = await db.get('SELECT user_id FROM password_resets WHERE token_hash = $h AND expires_at > $now',
    { $h: sha256(token), $now: iso(Date.now()) });
  if (!row) return null;
  await db.run('DELETE FROM password_resets WHERE user_id = $u', { $u: row.user_id });
  return row.user_id;
}

// old rows are kept for an hour after they expire, because they count towards PER_HOUR
export async function purgeExpiredResets(db) {
  await db.run('DELETE FROM password_resets WHERE expires_at < $t', { $t: iso(Date.now() - 60 * MIN) });
}

function resetEmail(accounts) {
  const one = accounts.length === 1;
  const lines = accounts.map((a) => one ? a.link : `@${a.username}: ${a.link}`).join('\n\n');
  const text = `Hi,\n\nSomeone asked to reset the password for ${one ? `your Leylines account @${accounts[0].username}` : 'these Leylines accounts'}. `
    + `Open ${one ? 'this link' : 'a link'} to choose a new password:\n\n${lines}\n\n`
    + `Each link works once, for 30 minutes. If you didn't ask for this, ignore this email: your password stays the same.\n\nLeylines`;
  const button = (a) => `<p style="margin:18px 0"><a href="${a.link}" style="background:#8b6cff;color:#fff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:600">`
    + `Reset password${one ? '' : ` for @${a.username}`}</a></p>`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1d1b2e;max-width:480px">`
    + `<p>Hi,</p><p>Someone asked to reset the password for ${one ? `your Leylines account <b>@${accounts[0].username}</b>` : 'these Leylines accounts'}.</p>`
    + accounts.map(button).join('')
    + `<p style="color:#6b6880;font-size:13px">Each link works once, for 30 minutes. If you didn't ask for this, ignore this email: your password stays the same.</p></div>`;
  return { subject: 'Reset your Leylines password', text, html };
}

// who = a username or an email; sends one email per address, listing every account on it
export async function sendResetEmails(db, who) {
  const users = who.includes('@')
    ? await db.all('SELECT * FROM users WHERE email_hash = $h', { $h: emailHash(who) })
    : await db.all('SELECT * FROM users WHERE lower(username) = lower($u)', { $u: who });
  const byEmail = new Map();
  for (const u of users) {
    const email = openEmail(u.email);
    if (!email) continue;
    const token = await createReset(db, u.id);
    if (!token) continue;
    if (!byEmail.has(email)) byEmail.set(email, []);
    // the token sits after #, so it never reaches a server log or another site
    byEmail.get(email).push({ username: u.username, link: `${config.appUrl}/#reset=${token}` });
  }
  for (const [to, accounts] of byEmail) await sendMail({ to, ...resetEmail(accounts) });
}
