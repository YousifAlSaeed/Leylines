// Shared rules for account fields.
import { config } from '../config.js';
import { openEmail } from './emailCrypto.js';

export const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// same rules as cleanName() in client/js/online.js
export const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

export const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.display_name, createdAt: u.created_at });
// what the signed-in player sees about themselves; dev = listed in DEV_USERS
export const privateUser = (u) => ({ ...publicUser(u), email: openEmail(u.email), dev: config.devUsers.includes(u.username.toLowerCase()) });

export const checkEmail = (email) => typeof email === 'string' && email.length <= 254 && EMAIL.test(email);
export const checkPassword = (pw) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 200;

// The public part of a save, shown on someone's shared profile. Only these
// fields leave the server, each forced into a safe shape.
const CARD_COUNT = 55;
const nat = (v, max = 1e9) => (Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
export const cardId = (v) => Number.isInteger(v) && v >= 0 && v < CARD_COUNT;
const results = (v) => (Array.isArray(v) ? v : []).filter((r) => r === 'w' || r === 'l' || r === 'd').slice(-10);
export function publicProfile(save) {
  const s = save && typeof save === 'object' ? save : {};
  const st = s.stats && typeof s.stats === 'object' ? s.stats : {};
  const av = s.avatar && typeof s.avatar === 'object' ? s.avatar : null;
  return {
    xp: nat(s.xp),
    stats: Object.fromEntries(['w', 'l', 'd', 'ow', 'ol', 'od'].map((k) => [k, nat(st[k])])),
    streak: nat(s.streak), best: nat(s.best),
    // online matches only
    ostreak: nat(s.ostreak), obest: nat(s.obest),
    // players they spared instead of taking cards
    spares: nat(s.spares),
    beat: Number.isInteger(s.beat) && s.beat >= 0 && s.beat <= 2 ? s.beat : -1,
    recent: results(s.recent), orecent: results(s.orecent),
    badges: Object.fromEntries(Object.entries(s.badges && typeof s.badges === 'object' ? s.badges : {})
      .filter(([k, v]) => /^[a-z0-9]{1,16}$/.test(k) && typeof v === 'string').slice(0, 50).map(([k, v]) => [k, v.slice(0, 24)])),
    showcase: (Array.isArray(s.showcase) ? s.showcase : []).filter(cardId).slice(0, 3),
    seen: (Array.isArray(s.seen) ? s.seen : []).filter(cardId),
    avatar: av && cardId(av.c) ? { c: av.c, r: nat(av.r, 5) } : null,
  };
}

// A save's match history (client/js/history.js) as others may see it: null when
// the player hid it, otherwise each entry rebuilt from checked fields only.
const RULE_KEYS = ['open', 'same', 'sameWall', 'plus', 'combo', 'elemental', 'suddenDeath', 'random', 'chaos'];
const TRADE_KEYS = ['none', 'one', 'diff', 'all', 'sweep'];
const cards = (v, n = 5) => (Array.isArray(v) ? v.filter(cardId).slice(0, n) : []);
export function publicHistory(save) {
  const s = save && typeof save === 'object' ? save : {};
  if (s.hideHist) return null;
  return (Array.isArray(s.history) ? s.history : []).slice(-30).filter((h) => h && typeof h === 'object').map((h) => {
    const e = {
      t: Number.isFinite(h.t) ? h.t : 0, m: h.m === 'online' ? 'online' : 'ai', bo: [3, 5].includes(h.bo) ? h.bo : 1,
      r: ['w', 'l', 'd'].includes(h.r) ? h.r : 'd',
      log: (Array.isArray(h.log) ? h.log : []).slice(-5).filter((m) => Array.isArray(m)).map((m) => [nat(m[0], 10), nat(m[1], 10)]),
      me: cards(h.me), op: cards(h.op), ru: (Array.isArray(h.ru) ? h.ru : []).filter((k) => RULE_KEYS.includes(k)),
      tm: nat(h.tm, 90), tr: TRADE_KEYS.includes(h.tr) ? h.tr : 'none', xp: nat(h.xp, 10000),
    };
    if (e.m === 'ai') {
      e.d = ['easy', 'normal', 'hard'].includes(h.d) ? h.d : 'normal';
      if (['duel', 'gauntlet'].includes(h.dk)) e.dk = h.dk; // a Daily challenge match (client/js/daily.js)
    } else {
      e.n = cleanName(h.n) || 'Player';
      if (typeof h.u === 'string' && USERNAME.test(h.u)) e.u = h.u;
      if (cardId(h.av)) e.av = h.av;
    }
    if (cards(h.won).length) e.won = cards(h.won);
    if (cards(h.lost).length) e.lost = cards(h.lost);
    if (h.sw) e.sw = 1;
    if (h.sd) e.sd = 1;
    if (['you', 'them', 'early'].includes(h.q)) e.q = h.q;
    return e;
  });
}

// returns an error message, or null when the sign-up fields are fine
export function checkSignup({ username, password, email }) {
  if (typeof username !== 'string' || !USERNAME.test(username)) return 'Usernames are 3 to 20 letters, numbers or underscores.';
  if (!checkPassword(password)) return 'Passwords need at least 8 characters.';
  if (email != null && email !== '' && !checkEmail(email)) return 'That email address doesn\'t look right.';
  return null;
}

// a save is the client's SAVE object; keep it a plain object of a sane size
export function checkSave(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Save data must be an object.';
  if (JSON.stringify(data).length > 64 * 1024) return 'Save data is too large.';
  return null;
}
