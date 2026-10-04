// Remakes client/images/og-image.jpg, the picture chat apps show for a shared link,
// by taking a screenshot of tools/og-image.html in headless Chrome or Edge (it saves a JPEG
// because of the .jpg name). After changing it, bump ?v= on og:image in client/index.html
// so chat apps fetch the new one.
// Run from anywhere: node tools/og-image.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const page = pathToFileURL(fileURLToPath(new URL('og-image.html', import.meta.url))).href;
const out = fileURLToPath(new URL('../client/images/og-image.jpg', import.meta.url));
const browsers = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = browsers.find((b) => fs.existsSync(b));
if (!browser) throw new Error('No Chrome or Edge found. Set CHROME to its path.');

execFileSync(browser, ['--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1200,630', '--virtual-time-budget=8000', `--screenshot=${out}`, page], { stdio: 'inherit' });
console.log(`Saved ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
