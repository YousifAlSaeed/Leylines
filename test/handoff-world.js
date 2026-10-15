// A pretend world for testing Crossroads online (client/js/duo.js) end to end: each player's game runs the real
// duo.js in its own sandbox, on a fake PeerJS network (a matchmaking server, peer-to-peer lines with a delay) and a
// virtual clock, so a test can close a game, cut its connection, split the network or lose a message, and fast-forward.
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = ['data.js', 'engine.js', 'ai.js', 'duo-engine.js', 'duo-handoff.js', 'duo.js']
  .map((f) => [f, fs.readFileSync(new URL(`../client/js/${f}`, import.meta.url), 'utf8')]);
export const LAT = 40; // ms a message takes on a line, or to the matchmaking server
const EXPIRE = 3000; // ms before the server says nobody has an id you're calling
const SERVER_TIMEOUT = 60000; // ms before the server lets go of the id of a game it can't hear any more

const prng = (seed) => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// the rest of the game (other files, the page) as little stand-ins
const STUBS = `
function playerName(){return __dev.name}
function myUser(){return __dev.user}
function myAv(){return null}
const netUser=u=>typeof u==='string'&&/^[A-Za-z0-9_]{3,20}$/.test(u)?u:'';
const netAv=v=>Number.isInteger(v)?v:null;
const cleanName=s=>String(s==null?'':s).trim().slice(0,16);
const peerId=code=>'ninefold-tt-'+code.toLowerCase();
function newCode(){return 'ABCDE'}
function loadPeerJS(){return Promise.resolve()}
function netClose(){}
function openOnline(){}
function onPanels(){}
function onStatus(h){__dev.status=h}
function validDeck(ids){return Array.isArray(ids)&&ids.length===5}
function inviteLink(c){return c}
const NET={role:null};
const INV={sent:new Map(),at:new Map(),code:''};
function invCancel(){__dev.cancelled++;INV.sent.clear();INV.code=''}
function invPop(){}
function invPopRefresh(){}
const frKey=s=>String(s).toLowerCase();
const frName=k=>k;
function toast(m){__dev.toasts.push(m)}
function sfx(){}
function modal(html,btns){__dev.modals.push({html,btns:btns||[]});return{querySelector:()=>null}}
function closeModal(){}
const esc=s=>String(s);
function banner(){return Promise.resolve()}
function ruleBanner(){return Promise.resolve()}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function keepAwake(){}
function cardHTML(){return ''}
function cardLabel(){return ''}
function ghostSweep(){}
function otherPointer(){return false}
const UI=1;
function show(id){__dev.screen=id;if(id==='menu'&&DUO.role)duoQuit()}
function renderHero(){}
const fmtLeft=s=>String(s);
const SAVE={lastDeck:null};
function save(){}
function collPool(){return []}
function deckable(){return 5}
function ensureMinimum(){}
function preDeck(){return []}
function randomDeck(){return aiDeck('normal')}
function openDeck(o){setTimeout(()=>o.onDone(aiDeck('normal')),200)}
function ruleSvg(){return ''}
function duoRevOk(){return false}
function duoRevPlace(){}
function duoRevClear(){}
let G=null;
`;
// a page element that takes anything and has nothing on screen
const hole = () => new Proxy(function () {}, {
  get(t, k) {
    if (k === 'classList') return { contains: () => false, add() {}, remove() {}, toggle() {} };
    if (k === 'style') return { setProperty() {} };
    if (k === 'then' || typeof k === 'symbol') return undefined;
    return hole();
  },
  set: () => true,
  apply: () => hole(),
});

class Conn {
  constructor(w, owner, peer, metadata) {
    Object.assign(this, { w, owner, peer, open: false, closed: false, h: {}, other: null });
    this.metadata = metadata == null ? undefined : JSON.parse(JSON.stringify(metadata));
  }
  on(e, f) { (this.h[e] ||= []).push(f); return this; }
  emit(e, ...a) { if (!this.owner.dev.dead) for (const f of this.h[e] || []) this.w.safe(f, ...a); }
  send(m) {
    if (!this.open) { this.emit('error', new Error('not open')); return; }
    const data = JSON.parse(JSON.stringify(m)), to = this.other, w = this.w, from = this.owner.dev;
    w.later(null, () => {
      if (!to || !to.open || w.blocked(from, to.owner.dev)) return;
      if (w.drop && w.drop(from, to.owner.dev, data)) return;
      w.log.push({ at: w.now, from: from.name, to: to.owner.dev.name, m: data });
      to.emit('data', data);
    }, LAT);
  }
  // like PeerJS: 'close' fires at once on this end (only if it was open), and reaches the other end a moment later
  close() {
    const was = this.open;
    this.open = false; this.closed = true; this.owner.conns.delete(this);
    if (was) this.emit('close');
    const o = this.other;
    if (was && o) this.w.later(null, () => { if (!this.w.blocked(this.owner.dev, o.owner.dev)) o.gone(); }, LAT);
  }
  gone() { if (!this.open) return; this.open = false; this.closed = true; this.owner.conns.delete(this); this.emit('close'); }
}

function peerClass(w, dev) {
  return class Peer {
    constructor(id) {
      Object.assign(this, { dev, h: {}, open: false, destroyed: false, disconnected: false, everOpen: false, conns: new Set(), id: null });
      this.want = id || `p${++w.pids}`;
      dev.peers.add(this);
      w.later(null, () => w.register(this), LAT);
    }
    on(e, f) { (this.h[e] ||= []).push(f); return this; }
    emit(e, ...a) { if (!dev.dead) for (const f of this.h[e] || []) w.safe(f, ...a); }
    connect(id, o = {}) {
      if (this.disconnected || !this.open) { this.emit('error', { type: 'disconnected', message: 'Cannot connect to new Peer after disconnecting from server.' }); return undefined; }
      return w.connect(this, id, o.metadata);
    }
    reconnect() {
      if (this.destroyed) throw new Error('This peer cannot reconnect to the server. It has already been destroyed.');
      if (!this.disconnected) return;
      this.disconnected = false;
      w.later(null, () => w.register(this, true), LAT);
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true; this.open = false;
      for (const c of [...this.conns]) c.close();
      if (w.ids.get(this.id) === this) w.ids.delete(this.id);
      this.emit('close');
    }
    fail(type, message) {
      this.emit('error', { type, message });
      if (!this.everOpen) this.destroy();
      else { this.open = false; this.disconnected = true; this.emit('disconnected', this.id); }
    }
  };
}

export class World {
  constructor(seed = 1) {
    Object.assign(this, { now: 1e6, q: [], seq: 0, pids: 0, errors: [], ids: new Map(), devs: [], seed, drop: null, log: [], blocks: new Set() });
  }
  // ---- the clock ----
  later(dev, fn, ms, every) { const t = { id: ++this.seq, at: this.now + Math.max(0, +ms || 0), fn, every, dev }; this.q.push(t); return t.id; }
  cancel(id) { const i = this.q.findIndex((t) => t.id === id); if (i >= 0) this.q.splice(i, 1); }
  safe(fn, ...a) { try { fn(...a); } catch (e) { this.errors.push(e); } }
  async run(ms, each) {
    const end = this.now + ms;
    let tick = this.now;
    for (;;) {
      await new Promise((r) => setImmediate(r)); // promise callbacks first: they may set timers
      let k = -1;
      for (let i = 0; i < this.q.length; i++) { const t = this.q[i]; if (k < 0 || t.at < this.q[k].at || t.at === this.q[k].at && t.id < this.q[k].id) k = i; }
      if (k < 0 || this.q[k].at > end) break;
      const t = this.q[k];
      if (each && t.at >= tick + 250) { tick = t.at; this.now = t.at; each(); continue; }
      this.now = t.at;
      if (t.every && !(t.dev && t.dev.dead)) t.at += t.every; else this.q.splice(k, 1);
      if (t.dev && t.dev.dead) continue;
      this.safe(t.fn);
    }
    this.now = end;
    if (each) each();
    await new Promise((r) => setImmediate(r));
  }
  // ---- the matchmaking server and the lines ----
  register(peer, again) {
    if (peer.destroyed || peer.dev.dead) return;
    if (this.cutOff(peer.dev)) { peer.fail('network', 'Lost connection to server.'); return; }
    const id = again ? peer.id : peer.want, holder = this.ids.get(id);
    if (holder && holder !== peer) { peer.fail('unavailable-id', `ID "${id}" is taken`); return; }
    this.ids.set(id, peer);
    Object.assign(peer, { id, open: true, disconnected: false, everOpen: true });
    peer.emit('open', id);
  }
  connect(from, toId, metadata) {
    const a = new Conn(this, from, toId, metadata);
    from.conns.add(a);
    this.later(null, () => {
      if (a.closed || from.destroyed || from.dev.dead || this.cutOff(from.dev)) return;
      const to = this.ids.get(toId);
      if (!to) { this.later(null, () => { if (!a.closed && !from.destroyed) from.emit('error', { type: 'peer-unavailable', message: `Could not connect to peer ${toId}` }); }, EXPIRE); return; }
      // a game the server still lists but that can't hear: the call goes nowhere
      if (to.destroyed || to.dev.dead || this.blocked(from.dev, to.dev) || !to.open) return;
      const b = new Conn(this, to, from.id, metadata);
      to.conns.add(b); a.other = b; b.other = a;
      this.safe(() => to.emit('connection', b));
      this.later(null, () => {
        if (a.closed || b.closed || this.blocked(from.dev, to.dev) || from.dev.dead || to.dev.dead) return;
        a.open = b.open = true;
        b.emit('open'); a.emit('open');
      }, LAT);
    }, LAT);
    return a;
  }
  // no messages between two games: one of them is cut off from everything, or the two are split apart
  blocked(x, y) { return x.cut || y.cut || x.dead || y.dead || this.blocks.has(`${x.name}|${y.name}`) || this.blocks.has(`${y.name}|${x.name}`); }
  cutOff(d) { return d.cut || d.dead; }
  linesOf(d) { const out = []; for (const e of this.devs) for (const p of e.peers) for (const c of p.conns) if (c.owner.dev === d || c.other && c.other.owner.dev === d) out.push(c); return out; }
  // the game's tab closes: everyone on a line to it hears at once, and the server lets go of its ids
  kill(d) {
    d.dead = true;
    for (const p of d.peers) {
      for (const c of [...p.conns]) { const o = c.other; c.open = false; c.closed = true; if (o) this.later(null, () => o.gone(), LAT); }
      p.conns.clear();
      if (this.ids.get(p.id) === p) this.ids.delete(p.id);
      p.destroyed = true; p.open = false;
    }
  }
  // the game's connection drops without a word: its line to the server goes after a few seconds, the server lets go of
  // its ids after a minute, and its peer-to-peer lines fail after 30 s (each end finds out by itself)
  cut(d) {
    d.cut = true;
    const n = d.cuts = (d.cuts || 0) + 1, still = () => d.cut && d.cuts === n; // (this cut, not a later one)
    this.later(null, () => { if (still()) for (const p of d.peers) if (p.open) { p.open = false; p.disconnected = true; p.emit('disconnected', p.id); } }, 5000);
    this.later(null, () => { if (still()) for (const p of d.peers) if (this.ids.get(p.id) === p) this.ids.delete(p.id); }, SERVER_TIMEOUT);
    this.later(null, () => { if (still()) for (const c of this.linesOf(d)) { c.gone(); if (c.other) c.other.gone(); } }, 30000);
  }
  uncut(d) {
    d.cut = false;
    // a line whose other end closed while this one couldn't hear closes on the first try
    for (const c of this.linesOf(d)) if (c.open && c.other && !c.other.open) this.later(null, () => c.gone(), LAT);
  }
  // two games can't reach each other (each still reaches everyone else); their line fails after 30 s
  split(x, y) {
    this.blocks.add(`${x.name}|${y.name}`);
    const n = this.splits = (this.splits || 0) + 1, key = `${x.name}|${y.name}`;
    (this.splitN ||= {})[key] = n;
    this.later(null, () => { if (this.blocked(x, y) && this.splitN[key] === n) for (const c of this.linesOf(x)) if (c.other && c.other.owner.dev === y) { c.gone(); c.other.gone(); } }, 30000);
  }
  join(x, y) { this.blocks.delete(`${x.name}|${y.name}`); this.blocks.delete(`${y.name}|${x.name}`); }
  // ---- a player's game ----
  device(name, { ls = new Map(), ss = new Map(), pc = false, user = '' } = {}) {
    const w = this, dev = { name, user, cut: false, dead: false, peers: new Set(), toasts: [], modals: [], screen: 'menu', status: '', cancelled: 0, ls, ss, on: {} };
    const store = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } });
    const ctx = vm.createContext({
      console, crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, performance,
      setTimeout: (f, ms) => w.later(dev, f, ms), clearTimeout: (id) => w.cancel(id),
      setInterval: (f, ms) => w.later(dev, f, ms, Math.max(1, +ms || 1)), clearInterval: (id) => w.cancel(id),
      localStorage: store(ls), sessionStorage: store(ss),
      window: { addEventListener: (t, f) => { dev.on[t] = f; } },
      addEventListener: (t, f) => { dev.on[t] = f; },
      document: { addEventListener: (t, f) => { dev.on[t] = f; }, hidden: false, body: { classList: { contains: (c) => c === 'pc' && pc } }, querySelectorAll: () => [] },
      Peer: peerClass(w, dev), $: () => hole(), $$: () => [],
      __w: w, __dev: dev, __rand: prng(this.seed * 977 + this.devs.length * 31 + 7),
    });
    vm.runInContext('Date.now=()=>__w.now;Math.random=__rand;', ctx);
    vm.runInContext(STUBS, ctx, { filename: 'stubs.js' });
    for (const [f, src] of SRC) vm.runInContext(src, ctx, { filename: f });
    // the room and match screens draw nothing here
    vm.runInContext('duoRoomRender=function(){};', ctx);
    dev.x = (code) => vm.runInContext(code, ctx);
    // press a button on the last popup
    dev.click = (label) => {
      const m = dev.modals[dev.modals.length - 1], b = m && m.btns.find((x) => x.label === label);
      if (!b) throw new Error(`${name}: no "${label}" button (last popup: ${m ? m.html : 'none'})`);
      b.fn && b.fn();
    };
    this.devs.push(dev);
    return dev;
  }
}

// ---- helpers for the tests ----
const MOVE = `(()=>{const S=DUO.snap;if(!S||S.phase!=='play'||!duoMyTurn())return 0;
  const st=S.st,hi=st.f>=0?st.f:0,cell=st.b.findIndex(x=>x<0);if(cell<0)return 0;duoMove(hi,cell);return 1})()`;
// play: the games in \`auto\` make a move whenever it's their turn
export const autoplay = (w, auto) => () => { for (const d of auto) if (!d.dead && !d.cut) w.safe(() => d.x(MOVE)); };

export const NAMES = ['Hana', 'Ivo', 'Juno', 'Kit'];
// a room: the first player hosts, the others join; empty seats get CPUs, the rules are set and everyone's ready
export async function room(w, { humans = 4, rules = {}, pcs = [] } = {}) {
  const all = NAMES.slice(0, humans).map((n, i) => w.device(n, { pc: pcs.includes(i) }));
  all[0].x('duoHost()');
  await w.run(400);
  for (const d of all.slice(1)) { d.x(`duoJoin('ABCDE')`); await w.run(400); }
  await w.run(600);
  all[0].x(`DUO.rules={...DUO.rules,...${JSON.stringify(rules)}};[0,1,2,3].forEach(i=>{if(DUO.seats[i].kind==='open')duoSetSeat(i,'normal')})`);
  for (const d of all.slice(1)) d.x(`duoSend({t:'ready',on:true})`);
  await w.run(400);
  return all;
}
export async function start(w, all) { all[0].x('duoStart()'); await w.run(1500); }
export const role = (d) => d.x('DUO.role');
export const seatOf = (d) => d.x('DUO.snap&&DUO.snap.you');
export const hosts = (w) => w.devs.filter((d) => !d.dead && role(d) === 'host');
export const moves = (d) => d.x('DUO.snap&&DUO.snap.st?DUO.snap.st.n:-1');
