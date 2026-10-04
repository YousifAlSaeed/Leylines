// The version number must be the same everywhere it's written (see CLAUDE.md).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('version matches in version.js, package.json, package-lock.json and CHANGELOG.md', () => {
  const js = read('client/js/version.js').match(/const VERSION='(\d+\.\d+\.\d+)'/)?.[1];
  assert.ok(js, 'client/js/version.js has a VERSION like 1.2.3');
  assert.equal(JSON.parse(read('package.json')).version, js, 'package.json');
  assert.equal(JSON.parse(read('package-lock.json')).version, js, 'package-lock.json (run npm install --package-lock-only)');
  assert.equal(read('CHANGELOG.md').match(/^## (\S+)/m)?.[1], js, 'top heading of CHANGELOG.md');
});
