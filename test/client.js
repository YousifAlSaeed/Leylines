// Loads the browser game's rule files (plain scripts that share globals) into a
// sandbox, the same way the page does, and hands back what the tests need.
import fs from 'node:fs';
import vm from 'node:vm';

const FILES = ['data.js', 'engine.js', 'ai.js'];
const NAMES = ['CARDS', 'RULES', 'SERIES', 'boOf', 'NB', 'newState', 'cloneS', 'isFull', 'score', 'play',
  'genElements', 'chaosPick', 'seriesDone', 'mulberry32', 'shuffle', 'genMoves', 'aiChoose', 'TUT', 'TUT_PACK', 'PACKS'];

export function loadGame() {
  const ctx = vm.createContext({ performance, console });
  for (const f of FILES) vm.runInContext(fs.readFileSync(new URL(`../client/js/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
  // top-level const/function declarations live in the sandbox's shared scope; collect them
  return vm.runInContext(`({${NAMES.join(',')}})`, ctx);
}
