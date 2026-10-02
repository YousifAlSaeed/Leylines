// The server: accounts, encrypted emails, password resets and security headers.
// Runs against a fresh in-memory database; reset emails are caught from the console.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// settings are read when the server modules load, so set them first
Object.assign(process.env, { EMAIL_KEY: 'test-email-key-0123456789abcdefghij', APP_URL: 'https://game.test' });
delete process.env.RESEND_API_KEY;
delete process.env.RENDER;
const { openSqlite } = await import('../server/db/sqlite.js');
const { createApp } = await import('../server/app.js');
const { upgradeStoredEmails } = await import('../server/lib/emailCrypto.js');

let db, server, base;
before(async () => {
  db = await openSqlite(null);
  server = createApp({ db, clientDir: fileURLToPath(new URL('../client', import.meta.url)) }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function api(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(base + '/api' + path, {
    method, body: body && JSON.stringify(body),
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json(), headers: r.headers };
}
const signup = (username, email) => api('/auth/signup', { method: 'POST', body: { username, password: `${username}-pass-1`, email } });
// the emails the server "sent" (printed to the console when RESEND_API_KEY isn't set)
async function catchMail(fn) {
  const out = [], log = console.log;
  console.log = (...a) => out.push(a.join(' '));
  try { await fn(); await new Promise((r) => setTimeout(r, 200)); } finally { console.log = log; }
  return out.join('\n');
}
const linkFor = (mail, username) => new RegExp(`(?:@${username}: )?https://game\\.test/#reset=([\\w-]+)`).exec(mail)?.[1];

describe('accounts', () => {
  test('sign up, then sign in with the same password', async () => {
    assert.equal((await signup('ana', 'Ana@Example.com')).status, 201);
    const ok = await api('/auth/login', { method: 'POST', body: { username: 'ANA', password: 'ana-pass-1' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.username, 'ana');
  });
  test('a wrong password and an unknown user get the same answer', async () => {
    const wrong = await api('/auth/login', { method: 'POST', body: { username: 'ana', password: 'nope-nope-1' } });
    const ghost = await api('/auth/login', { method: 'POST', body: { username: 'ghost', password: 'nope-nope-1' } });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, ghost.body);
  });
  test('passwords and sign-in tokens are only stored hashed', async () => {
    const { body } = await signup('bea');
    const u = await db.get("SELECT password_hash FROM users WHERE username = 'bea'");
    assert.match(u.password_hash, /^scrypt\$/);
    assert.ok(!u.password_hash.includes('bea-pass-1'));
    assert.equal(await db.get('SELECT 1 FROM sessions WHERE token_hash = $t', { $t: body.token }), undefined);
  });
});

describe('emails stay private', () => {
  test('emails are stored encrypted, but you see your own', async () => {
    const { body } = await signup('cat', 'cat@example.com');
    assert.equal(body.user.email, 'cat@example.com');
    const row = await db.get("SELECT email FROM users WHERE username = 'cat'");
    assert.match(row.email, /^enc1:/);
    assert.ok(!row.email.includes('cat@example.com'));
    assert.equal((await api('/me', { token: body.token })).body.user.email, 'cat@example.com');
  });
  test('a public profile never includes the email', async () => {
    const p = await api('/users/cat');
    assert.equal(p.status, 200);
    assert.ok(!JSON.stringify(p.body).includes('@example.com'));
    assert.equal(p.body.email, undefined);
  });
  test('signing up with a used email works, so nobody can test who has an account', async () => {
    const r = await signup('dan', 'CAT@example.com');
    assert.equal(r.status, 201);
  });
  test('emails saved before the key existed get encrypted on start', async () => {
    await db.run("INSERT INTO users (username, display_name, email, password_hash) VALUES ('old', 'old', 'old@example.com', 'x')");
    assert.equal(await upgradeStoredEmails(db), 1);
    const row = await db.get("SELECT email, email_hash FROM users WHERE username = 'old'");
    assert.match(row.email, /^enc1:/);
    assert.ok(row.email_hash);
  });
});

describe('forgot password', () => {
  test('the answer is the same for real and unknown accounts', async () => {
    let real;
    await catchMail(async () => { real = await api('/auth/forgot', { method: 'POST', body: { who: 'ana' } }); });
    const fake = await api('/auth/forgot', { method: 'POST', body: { who: 'nobody@nowhere.test' } });
    assert.equal(real.status, 202);
    assert.deepEqual(real.body, fake.body);
  });
  test('a link resets the password once, signs out other devices and signs this one in', async () => {
    const { body: { token: oldToken } } = await signup('eve', 'eve@example.com');
    const mail = await catchMail(() => api('/auth/forgot', { method: 'POST', body: { who: 'EVE@example.com' } }));
    const link = linkFor(mail, 'eve');
    assert.ok(link, 'no reset email for eve');
    assert.ok(mail.includes('to eve@example.com'));

    const r = await api('/auth/reset', { method: 'POST', body: { token: link, password: 'eve-new-pass-1' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.username, 'eve');
    assert.equal((await api('/me', { token: oldToken })).status, 401, 'old device still signed in');
    assert.equal((await api('/auth/login', { method: 'POST', body: { username: 'eve', password: 'eve-pass-1' } })).status, 401);
    assert.equal((await api('/auth/login', { method: 'POST', body: { username: 'eve', password: 'eve-new-pass-1' } })).status, 200);
    const again = await api('/auth/reset', { method: 'POST', body: { token: link, password: 'eve-other-pass' } });
    assert.equal(again.status, 400, 'a link worked twice');
  });
  test('one email lists every account that shares the address', async () => {
    const mail = await catchMail(() => api('/auth/forgot', { method: 'POST', body: { who: 'cat@example.com' } }));
    assert.ok(linkFor(mail, 'cat') && linkFor(mail, 'dan'));
    assert.equal(mail.match(/\[mail\]/g).length, 1);
  });
  test('made-up links and short passwords are refused', async () => {
    assert.equal((await api('/auth/reset', { method: 'POST', body: { token: 'made-up-token-0123456789', password: 'long-enough-1' } })).status, 400);
    assert.equal((await api('/auth/reset', { method: 'POST', body: { token: 'x', password: 'short' } })).status, 400);
  });
});

describe('security headers', () => {
  test('pages and the API forbid framing and limit where scripts come from', async () => {
    for (const path of ['/', '/api/health']) {
      const r = await fetch(base + path);
      assert.equal(r.status, 200, path);
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.match(r.headers.get('content-security-policy'), /script-src 'self' https:\/\/unpkg\.com/);
    }
  });
});
