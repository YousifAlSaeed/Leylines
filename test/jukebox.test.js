// The jukebox (client/js/music.js): which song each place plays, how a stored choice is cleaned up, and the songs' files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { describe, test } from 'node:test';

// music.js runs in the page after helpers.js; here it gets just enough of a page to load
function load(save = {}) {
  const fetched = [];
  const ctx = vm.createContext({
    SAVE: { musicVol: 70, musicMute: false, ...save },
    fetch: (url) => { fetched.push(url); return new Promise(() => {}); },
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, getElementById: () => null, hidden: false },
    AC: null, console,
  });
  vm.runInContext(fs.readFileSync(new URL('../client/js/music.js', import.meta.url), 'utf8'), ctx, { filename: 'music.js' });
  const g = vm.runInContext('({TRACKS,JB_PLACES,JB_DEF,jbNorm,jbTrack,jb,isTrack})', ctx);
  return { ...g, fetched, ctx };
}
const plain = (o) => JSON.parse(JSON.stringify(o));

describe('the songs', () => {
  const { TRACKS } = load();
  test('every song has a file in the game', () => {
    for (const [id, t] of Object.entries(TRACKS)) {
      const f = new URL('../client/' + t.src, import.meta.url);
      assert.ok(fs.existsSync(f), `${id}: ${t.src} is missing`);
      assert.ok(fs.statSync(f).size > 100_000, `${id}: ${t.src} looks empty`);
    }
  });
  test('the seven songs, with Discovery being the original theme', () => {
    assert.deepEqual(Object.keys(TRACKS).sort(), ['afterglow', 'crossroads', 'discovery', 'ley-lines', 'market', 'open-sky', 'sudden-death']);
    assert.equal(TRACKS.discovery.src, 'audio/theme.mp3');
    assert.equal(TRACKS.discovery.name, 'Discovery');
  });
  test('each new song knows its loop length, and only Discovery uses its own loop point', () => {
    for (const [id, t] of Object.entries(TRACKS)) {
      if (id === 'discovery') assert.ok(t.loopAt > 160 && !t.len);
      else assert.ok(t.len > 50 && t.len < 120 && !t.loopAt, id);
    }
  });
  test('every song file is in the folder, and no draft sits next to them', () => {
    const files = fs.readdirSync(new URL('../client/audio/music/', import.meta.url)).sort();
    assert.deepEqual(files, Object.values(TRACKS).filter((t) => t.src.startsWith('audio/music/')).map((t) => t.src.slice(12)).sort());
  });
});

describe('the default jukebox', () => {
  const { jbNorm, jbTrack } = load();
  const j = jbNorm(undefined);
  test('Discovery for the main menu, and a song for each place', () => {
    assert.deepEqual(plain(j), { one: false, main: 'discovery', leaders: 'afterglow', coll: 'open-sky', market: 'market', crossroads: 'crossroads', sd: 'sudden-death' });
  });
  test('each place plays its song', () => {
    assert.equal(jbTrack(j, 'main'), 'discovery');
    assert.equal(jbTrack(j, 'leaders'), 'afterglow');
    assert.equal(jbTrack(j, 'coll'), 'open-sky');
    assert.equal(jbTrack(j, 'market'), 'market');
    assert.equal(jbTrack(j, 'crossroads'), 'crossroads');
    assert.equal(jbTrack(j, 'sd', 'main'), 'sudden-death');
    assert.equal(jbTrack(j, 'sd', 'crossroads'), 'sudden-death');
  });
  test('a place the jukebox doesn\'t know plays the main menu\'s song', () => {
    assert.equal(jbTrack(j, 'nowhere'), 'discovery');
  });
});

describe('choices', () => {
  const { jbNorm, jbTrack } = load();
  test('Ley Lines can be the main menu\'s song, and places following it change with it', () => {
    const j = jbNorm({ main: 'ley-lines', coll: 'main' });
    assert.equal(jbTrack(j, 'main'), 'ley-lines');
    assert.equal(jbTrack(j, 'coll'), 'ley-lines');
    assert.equal(jbTrack(j, 'leaders'), 'afterglow');
  });
  test('one song everywhere: every place, Sudden Death too, plays the main menu\'s song', () => {
    const j = jbNorm({ one: true, main: 'open-sky' });
    for (const p of ['main', 'leaders', 'coll', 'market', 'crossroads', 'sd']) assert.equal(jbTrack(j, p, 'crossroads'), 'open-sky', p);
  });
  test('Sudden Death can keep the music of where it happens', () => {
    const j = jbNorm({ sd: 'keep', crossroads: 'afterglow' });
    assert.equal(jbTrack(j, 'sd', 'main'), 'discovery');
    assert.equal(jbTrack(j, 'sd', 'crossroads'), 'afterglow');
  });
  test('Sudden Death can follow the main menu, or play any song', () => {
    assert.equal(jbTrack(jbNorm({ sd: 'main', main: 'market' }), 'sd', 'crossroads'), 'market');
    assert.equal(jbTrack(jbNorm({ sd: 'ley-lines' }), 'sd'), 'ley-lines');
  });
  test('the songs can be moved round: any song in any place', () => {
    const j = jbNorm({ main: 'afterglow', leaders: 'discovery', coll: 'sudden-death', market: 'open-sky', crossroads: 'ley-lines', sd: 'market' });
    assert.deepEqual(['main', 'leaders', 'coll', 'market', 'crossroads', 'sd'].map((p) => jbTrack(j, p)),
      ['afterglow', 'discovery', 'sudden-death', 'open-sky', 'ley-lines', 'market']);
  });
});

describe('a stored jukebox is cleaned up', () => {
  const { jbNorm, JB_DEF } = load();
  const def = plain(JB_DEF);
  test('anything that isn\'t a plain object gives the defaults', () => {
    for (const v of [null, 5, 'x', [], true]) assert.deepEqual(plain(jbNorm(v)), def, String(v));
  });
  test('unknown songs go back to the defaults; known ones stay', () => {
    assert.deepEqual(plain(jbNorm({ main: 'nope', leaders: 'market', coll: 42 })), { ...def, leaders: 'market' });
  });
  test('names of built-in object properties are not songs', () => {
    assert.deepEqual(plain(jbNorm({ main: 'constructor', leaders: '__proto__', coll: 'toString', sd: 'hasOwnProperty' })), def);
  });
  test('the main menu can\'t follow itself or keep; only Sudden Death can keep', () => {
    assert.equal(jbNorm({ main: 'main' }).main, 'discovery');
    assert.equal(jbNorm({ main: 'keep' }).main, 'discovery');
    assert.equal(jbNorm({ leaders: 'keep' }).leaders, 'afterglow');
    assert.equal(jbNorm({ sd: 'keep' }).sd, 'keep');
    assert.equal(jbNorm({ coll: 'main' }).coll, 'main');
  });
  test('one song everywhere is only on when it is true', () => {
    assert.equal(jbNorm({ one: 'yes' }).one, false);
    assert.equal(jbNorm({ one: 1 }).one, false);
    assert.equal(jbNorm({ one: true }).one, true);
  });
  test('extra keys are dropped', () => {
    assert.deepEqual(Object.keys(jbNorm({ extra: 1, main: 'market' })).sort(), Object.keys(def).sort());
  });
});

describe('loading', () => {
  test('the main menu\'s song starts downloading as the game opens', () => {
    assert.deepEqual(load().fetched, ['audio/theme.mp3']);
    assert.deepEqual(load({ jb: { main: 'ley-lines' } }).fetched, ['audio/music/ley-lines.mp3']);
  });
  test('with one song everywhere the main menu\'s song is the one downloaded', () => {
    assert.deepEqual(load({ jb: { one: true, main: 'afterglow' } }).fetched, ['audio/music/afterglow.mp3']);
  });
});
