// Sends email through Resend (https://resend.com) when RESEND_API_KEY is set.
// Without it, emails are printed to the console when running locally, and
// dropped on Render, so reset links never end up in the hosted logs.
import { config } from '../config.js';

export async function sendMail({ to, subject, text, html }) {
  if (!config.resendKey) {
    if (process.env.RENDER) console.warn('RESEND_API_KEY is not set: an email was not sent');
    else console.log(`\n[mail] to ${to}: ${subject}\n${text}\n`);
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.mailFrom, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Resend answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
