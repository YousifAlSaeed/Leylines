// Loads the browser game's rule files (plain scripts that share globals) into a
// sandbox, the same way the page does, and hands back what the tests need.
import fs from 'node:fs';
import vm from 'node:vm';

const FILES = ['data.js', 'engine.js', 'ai.js', 'duo-engine.js'];
const NAMES = ['CARDS', 'RULES', 'SERIES', 'boOf', 'NB', 'newState', 'cloneS', 'isFull', 'score', 'play',
  'genElements', 'chaosPick', 'threePick', 'sweepOn', 'rulesOn', 'TRADES', 'winBackNext', 'winBackHand', 'seriesDone', 'mulberry32', 'shuffle', 'genMoves', 'aiChoose', 'TUT', 'TUT_PACK', 'PACKS',
  'duoTeam', 'DNB', 'DUO_LINES', 'duoNew', 'duoPlay', 'duoScore', 'duoFull', 'duoElements', 'duoChoose', 'duoMoves', 'duoView', 'duoCpuDeck', 'STAND_IN', 'duoSide', 'duoTurnAt', 'duoPts', 'duoPlaces', 'duoRevAt'];

export function loadGame() {
  const ctx = vm.createContext({ performance, console });
  for (const f of FILES) vm.runInContext(fs.readFileSync(new URL(`../client/js/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
  // top-level const/function declarations live in the sandbox's shared scope; collect them
  return vm.runInContext(`({${NAMES.join(',')}})`, ctx);
}
