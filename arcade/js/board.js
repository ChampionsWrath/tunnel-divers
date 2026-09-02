// THE CHAOTIC BOARDWALK — the master board-game wrapper for the minigame roster.
// Node-graph NETWORK (37 nodes: promenade + 2 midways + shore shortcut + pier cut,
// 4 forks, 2 warp-cannon pairs), dice movement, coins/items/cosmetics,
// squash steals, shops, piñatas, mascot gambles — and a minigame every turn.
// FinalScore = coins + Σ cosmetic values. Turn-based → clean event sync online.
import { TAU, clamp, lerp, mulberry32 } from './util.js';
import { drawDiverTop, drawDiverStand } from './character.js?v=36';

function lightCol(hex, f) {   // mix toward white by f
  try {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.round(v + (255 - v) * f);
    return 'rgb(' + c(n >> 16 & 255) + ',' + c(n >> 8 & 255) + ',' + c(n & 255) + ')';
  } catch (e) { return hex; }
}
function shadeCol(hex, f) {
  try {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.round(clamp(v * f, 0, 255));
    return 'rgb(' + c(n >> 16 & 255) + ',' + c(n >> 8 & 255) + ',' + c(n & 255) + ')';
  } catch (e) { return hex; }
}

/* ---------------- economy registry ---------------- */
export const ITEMS = {
  tripped: { name: 'Tripped and Fell', icon: '🤸', cost: 5, desc: 'Next turn: move exactly 4. Land on someone → knock them back 2.' },
  drunk: { name: 'Drunk Stumble', icon: '🍺', cost: 3, desc: 'Next turn: FATE picks where you land. Chaos.' },
  shield: { name: 'Cardboard Shield', icon: '🛡️', cost: 6, desc: 'Passive: blocks the next steal or mascot launch.' },
  loaded: { name: 'Loaded Dice', icon: '🎯', cost: 7, desc: 'Next roll: YOU pick the number (1-6). One use.' },
  mystery: { name: 'Mystery Box', icon: '🎁', cost: 25, desc: 'Pops open on the spot: a random cosmetic, guaranteed!', instant: true },
};
export const COSMETICS = [
  { id: 'prop', name: 'Propeller Hat', icon: '🧢', tier: 'common', value: 10 },
  { id: 'shoes', name: 'Squeaky Shoes', icon: '👟', tier: 'common', value: 10 },
  { id: 'nose', name: 'Clown Nose', icon: '🔴', tier: 'common', value: 10 },
  { id: 'duck', name: 'Inflatable Duck Suit', icon: '🦆', tier: 'rare', value: 25 },
  { id: 'cape', name: 'Neon Cape', icon: '🦸', tier: 'rare', value: 25 },
  { id: 'burger', name: 'Burger Mask', icon: '🍔', tier: 'rare', value: 25 },
  { id: 'crown', name: 'Golden Textured Crown', icon: '👑', tier: 'legendary', value: 60 },
  { id: 'boots', name: 'Mech Boots', icon: '🦿', tier: 'legendary', value: 60 },
];
const cosmetic = id => COSMETICS.find(c => c.id === id);
const REWARDS = [15, 10, 6, 3, 1];
const DYNAMIC = { tunnel: s => clamp(Math.round(2 + s / 400), 2, 18), food: s => clamp(Math.round(2 + s * 0.6), 2, 18) };

/* ---------------- the boardwalk blueprint: a NETWORK, not a circle ----------------
   Outer promenade + two midway paths cutting through the park + a shore shortcut +
   a pier cut — FOUR forks, and two pairs of WARP CANNONS (🌀) that blast you to the
   matching cannon across the park. Nodes sit ≥10 world units apart (tiles span ~6.6
   x 6.2 units on screen) so spaces never overlap. Virtual space ~108 x 72. */
function buildMap() {
  //            [type,      x,   y ]
  const SPEC = [
    ['start', 8, 64],    // 0  bottom-left — GO
    ['blue', 18, 66],    // 1
    ['warpA', 28, 64],   // 2  🌀 cannon ↔ 16
    ['fork', 38, 67],    // 3  ⑂ bottom fork: promenade on, or up the midway
    ['blue', 48, 64],    // 4
    ['red', 58, 67],     // 5
    ['pinata', 68, 64],  // 6
    ['blue', 78, 66],    // 7  (merge: pier cut lands here)
    ['red', 88, 63],     // 8
    ['blue', 97, 56],    // 9
    ['fork', 101, 46],   // 10 ⑂ pier fork: up the coast, or cut inland
    ['red', 98, 36],     // 11
    ['warpB', 102, 26],  // 12 🌀 cannon ↔ 24
    ['pinata', 96, 16],  // 13
    ['blue', 86, 10],    // 14
    ['fork', 76, 13],    // 15 ⑂ top fork: promenade on, or down the midway
    ['warpA', 66, 9],    // 16 🌀 cannon ↔ 2
    ['mascot', 56, 12],  // 17
    ['blue', 46, 9],     // 18
    ['red', 36, 12],     // 19 (merge: left midway tops out here)
    ['blue', 26, 9],     // 20
    ['shop', 16, 13],    // 21
    ['blue', 7, 22],     // 22
    ['fork', 4, 32],     // 23 ⑂ shore fork: down the coast, or the shore shortcut
    ['warpB', 8, 42],    // 24 🌀 cannon ↔ 12
    ['blue', 5, 52],     // 25 → back to GO
    // left midway (up through the park):  3 → 26..29 → 19
    ['mascot', 36, 56],  // 26
    ['pinata', 40, 46],  // 27
    ['blue', 35, 36],    // 28 (merge: shore shortcut lands here)
    ['red', 39, 26],     // 29
    // right midway (down through the park):  15 → 30..33 → 7
    ['carousel', 78, 24],// 30  🎠 the merry-go-round (bet + rhythm showdown)
    ['shop', 74, 34],    // 31
    ['red', 79, 44],     // 32
    ['blue', 75, 54],    // 33 (merge: pier cut lands here)
    // shore shortcut:  23 → 34..35 → 28
    ['pinata', 14, 34],  // 34
    ['blue', 24, 32],    // 35
    // pier cut:  10 → 36 → 33
    ['red', 90, 50],     // 36
  ];
  const EDGES = [
    [0, 1], [1, 2], [2, 3], [3, 4], [3, 26], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9],
    [9, 10], [10, 11], [10, 36], [11, 12], [12, 13], [13, 14], [14, 15], [15, 16], [15, 30],
    [16, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 24], [23, 34],
    [24, 25], [25, 0],
    [26, 27], [27, 28], [28, 29], [29, 19],
    [30, 31], [31, 32], [32, 33], [33, 7],
    [34, 35], [35, 28],
    [36, 33],
  ];
  const nodes = SPEC.map(([type, x, y], id) => ({ id, type, x, y, next: [] }));
  for (const [a, b] of EDGES) nodes[a].next.push(b);
  // warp cannon pairing: land on one, get BLASTED to its twin
  const WARPS = { 2: 16, 16: 2, 12: 24, 24: 12 };
  for (const id in WARPS) { nodes[id].type = nodes[id].type.slice(0, 4) === 'warp' ? 'warp' : nodes[id].type; nodes[id].warpTo = WARPS[id]; }
  // reverse edges for backward movement
  for (const n of nodes) n.prev = [];
  for (const n of nodes) for (const nx of n.next) nodes[nx].prev.push(n.id);
  return nodes;
}
const HP = Math.PI / 2;
const frac = v => { const s = Math.sin(v) * 43758.5453; return s - Math.floor(s); };
const NODE_STYLE = {
  start: ['#ffd23f', '🏁'], blue: ['#4d9de0', '+3'], red: ['#e04040', '-3'], fork: ['#93a0bd', '⑂'],
  shop: ['#a1e887', '🛒'], pinata: ['#e08bd0', '🪅'], mascot: ['#ffb84d', '🎭'],
  warp: ['#59d9ff', '🌀'],
  carousel: ['#e08bd0', '🎠'],
};
const BET_WHEEL = [5, 10, 15, 20, 25, 30];   // the wheel's coin wedges
const PREV_COLS = ['#ffd23f', '#59d9ff', '#e08bd0'];   // branch-choice colors: button ↔ path ↔ pin

/* ================================================================ */
export function createBoard(ctx) { return new Board(ctx); }

class Board {
  constructor(ctx) {
    this.ctx = ctx;                       // {cv,g,dim,players,seed,net,onNet,input,audio,end,launchMinigame,maxTurns}
    this.rng = mulberry32(ctx.seed);
    this.map = buildMap();
    this.maxTurns = ctx.maxTurns || 20;
    this.turn = 1; this.playerIdx = 0;
    this.players = ctx.players.map((p, i) => ({
      id: p.id, name: p.name, color: p.color, skin: p.skin, ward: p.ward, local: p.local, slot: p.slot, bot: !!p.bot,
      node: 0, coins: 15, items: [], cosmetics: [], shield: false, pending: null,
      ax: this.map[0].x, ay: this.map[0].y,   // animated position
    }));
    this.state = 'splash'; this.stateT = 0;
    this.tt = 0; this.pops = []; this.banner = null; this.bannerT = 0;
    this.moveQ = []; this.moveT = 0; this.stepFrom = null; this.overlay = null;
    this.botT = 0; this.dice = null; this.paused = false;
    this.clicks = [];
    // free-look zoom: pinch on touch, ctrl/⌘+click or wheel on desktop.
    // userZoom multiplies the state's target zoom; 1 = default framing.
    this.userZoom = 1; this._pts = new Map(); this._pinch0 = null;
    this._pd = e => {
      this._pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (this._pts.size === 2) {
        const [a, b] = [...this._pts.values()];
        this._pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.userZoom };
        return;                                   // two fingers = gesture, not a tap
      }
      if (e.ctrlKey || e.metaKey) {               // desktop: ctrl+click zooms out a notch
        this.userZoom = this.userZoom > 0.6 ? 0.45 : 1;
        return;
      }
      if (this._pts.size === 1) this.clicks.push([e.clientX, e.clientY]);
    };
    this._pm = e => {
      if (!this._pts.has(e.pointerId)) return;
      this._pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (this._pts.size === 2 && this._pinch0) {
        const [a, b] = [...this._pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        this.userZoom = clamp(this._pinch0.z * (d / Math.max(1, this._pinch0.d)), 0.32, 1.9);
      }
    };
    this._pu = e => { this._pts.delete(e.pointerId); if (this._pts.size < 2) this._pinch0 = null; };
    this._wh = e => {
      e.preventDefault();
      this.userZoom = clamp(this.userZoom * (e.deltaY > 0 ? 0.9 : 1.11), 0.32, 1.9);
    };
    ctx.cv.addEventListener('pointerdown', this._pd);
    ctx.cv.addEventListener('pointermove', this._pm);
    ctx.cv.addEventListener('pointerup', this._pu);
    ctx.cv.addEventListener('pointercancel', this._pu);
    ctx.cv.addEventListener('wheel', this._wh, { passive: false });
    if (ctx.onNet) ctx.onNet((t, p) => { if (t === 'bd') this.queueAct(p); });
    this.isNetHost = !ctx.net || ctx.net.isHost;
    this.rq = [];   // remote acts wait here until the local state machine can accept them
    this.mapView = false;
    this.dust = []; this.squashT = 0; this.confetti = []; this._confettiKey = null;
    this.tut = 0;   // optional how-to cards; the board is PAUSED while one is up
    // camera seeded here so the very first frames render even while paused
    this.camX = 54; this.camY = 37;
    this.zoom = Math.min(ctx.dim.W / 120, (ctx.dim.H * 0.68) / 80) || 10;
    this.decor = this.buildDecor();
    this.showBanner('🎪 THE CHAOTIC BOARDWALK 🎪', '#ffd23f', 2.2);
  }
  // carnival props scattered around the routes (world-anchored, depth-sorted)
  buildDecor() {
    const d = [];
    const put = (kind, x, y, s) => d.push({ kind, x, y, s: s || 1 });
    // in the POCKETS between paths (the map is a network now — no big open middle)
    put('tent', 20, 50, 1.2);      // between shore, shortcut and bottom row
    put('tent', 56, 24, 1);        // upper-middle pocket
    put('carousel', 56, 48, 1.1);  // big central-lower pocket
    put('balloons', 24, 20, 0.9);  // upper-left pocket
    put('popcorn', 88, 32, 0.95);  // between right midway and the pier
    put('cotton', 50, 37, 0.9);    // mid-park nook
    put('balloons', 60, 58, 0.9);
    // around the outside
    put('tent', 110, 44, 0.9); put('balloons', -3, 26, 0.9); put('cotton', 108, 58, 0.9);
    put('lamp', 22, 4, 1); put('lamp', 66, 3, 1); put('lamp', -2, 12, 1); put('lamp', 108, 10, 1);
    put('lamp', -2, 60, 1); put('lamp', 46, 72, 1); put('lamp', 94, 70, 1);
    return d;
  }
  cur() { return this.players[this.playerIdx]; }
  score(p) { return p.coins + p.cosmetics.reduce((a, c) => a + cosmetic(c).value, 0); }
  myTurn() { const p = this.cur(); return p.local && !p.bot; }
  authority() { // who resolves the current player's choices: their client, or net-host for bots
    const p = this.cur();
    if (p.bot) return this.isNetHost;
    return p.local;
  }
  pop(txt, col, size) { this.pops.push({ txt, col: col || '#ffd23f', t: 0, dur: 1.3, size: size || 22 }); }
  showBanner(txt, col, dur) { this.banner = { txt, col: col || '#ffd23f' }; this.bannerT = dur || 1.5; }

  /* -------- every mutation flows through act() so online mirrors cleanly --------
     Each broadcast carries a per-sender sequence number; receivers drop repeats.
     Both transports (direct WebRTC and the nostr relay fallback) can deliver the
     same act, and applying a 'dest' twice restarted a walk mid-stride — which is
     how one phone ended up walking forever while the mover's looked normal. */
  netSend(a, d) {
    if (!this.ctx.net) return;
    this._seq = (this._seq || 0) + 1;
    this.ctx.net.send('bd', { a, d, n: this._seq, s: this.ctx.net.selfId || 'me' });
  }
  act(a, d) {
    this.applyAct({ a, d }, false);
    this.netSend(a, d);
  }
  /* Remote acts must NEVER be dropped — a lagging client (throttled rAF, backgrounded
     phone, latency spike) receives the mover's acts "early", while its own state machine
     is still animating the previous phase. Acts queue here and apply once the local
     machine reaches the state each act belongs to; a lost act = permanent desync. */
  queueAct(msg) {
    if (msg.s && msg.n) {                       // drop duplicates from either transport
      this._seen = this._seen || {};
      if (this._seen[msg.s] >= msg.n) return;
      this._seen[msg.s] = msg.n;
    }
    if (msg.a === 'rw') { this.applyAct(msg, true); return; }  // board may be stashed (mid-minigame) — update() isn't running
    if (msg.a === 'sync') {
      // NEVER apply immediately: a board that is paused (tutorial) or stashed
      // (mid-minigame) legitimately lags the host, and instant application
      // made it snap-loop "resyncing" over and over. Keep only the LATEST
      // snapshot; update() processes it when the board is actually live.
      this._pendingSync = msg.d;
      return;
    }
    this.rq.push({ msg, t: 0 });
  }
  canApply(a) {
    switch (a) {
      case 'roll': case 'skipItem': case 'playItem': return this.state === 'menu';
      case 'branch': return this.state === 'branch';
      case 'dest': return this.state === 'pickDest';
      case 'buy': case 'shopDone': case 'mbox': return !!this.overlay && this.overlay.kind === 'shop';
      case 'mascot': return !!this.overlay && this.overlay.kind === 'mascot';
      case 'pinata2': return !!this.overlay && this.overlay.kind === 'pinata';
      case 'steal': return this.state === 'action';
      case 'mg': return this.state === 'mgIntro';
      default: return true;
    }
  }
  drainQueue(rdt) {
    while (this.rq.length) {
      const q = this.rq[0]; q.t += rdt;
      // failsafe: a gating bug must degrade to a glitch, not a permanent hang
      if (!this.canApply(q.msg.a) && q.t < 6) break;
      this.rq.shift();
      this.applyAct(q.msg, true);
    }
  }
  applyAct(msg, remote) {
    const { a, d } = msg;
    switch (a) {
      case 'skipItem': this.enterRoll(); break;
      case 'playItem': this.doPlayItem(d.idx); break;
      case 'roll': this.doRoll(d.v, d.dir); break;
      case 'branch': this.doBranch(d.n); break;
      case 'dest': this.doDest(d.path); break;
      case 'mbox': {
        const p = this.cur(), c = cosmetic(d.c);
        p.cosmetics.push(d.c);
        this.pop('🎁 ' + c.icon + ' ' + c.name + ' (+' + c.value + 'pts)!', '#ffd23f', 24);
        this.ctx.audio.sfx.win();
        break;
      }
      case 'buy': this.doBuy(d.item); break;
      case 'shopDone': this.closeShop(); break;
      case 'mascot': this.doMascot(d.bet, d.win); break;
      case 'steal': this.doSteal(d.victim, d.ci); break;
      case 'pinata2': this.applyPinata(d.c); break;
      case 'wheel': this.doWheel(d.bet); break;
      case 'cpay': this.doCarouselPayout(d.winner, d.bet); break;
      case 'mg': if (remote) this.launchMg(d.gid, d.seed, true); break;
      case 'rw': if (remote) this.applyRewards(d.list, d.rows); break;
      case 'sync': if (remote) this.applySync(d); break;
    }
  }

  /* ---------------- phase flow ---------------- */
  startTurnPlayer() {
    const p = this.cur();
    this.showBanner('TURN ' + this.turn + '/' + this.maxTurns + ' — ' + p.name, p.color, 1.4);
    this.state = 'menu'; this.stateT = 0; this.botT = 1.2 + this.rng() * 0.8;
    this.dice = null; this.mapView = false;
  }
  enterRoll() { this.state = 'menu'; this.stateT = 0; this.botT = 0.9 + this.rng() * 0.8; this.dice = null; }
  doPlayItem(idx) {
    const p = this.cur();
    const it = p.items.splice(idx, 1)[0];
    if (it === 'shield') { p.shield = true; this.pop(p.name + ' raises a 🛡️ Cardboard Shield!'); }
    else { p.pending = it; this.pop(p.name + ' plays ' + ITEMS[it].icon + ' ' + ITEMS[it].name + '!'); }
    this.ctx.audio.sfx.pow();
    this.overlay = null;
    this.state = 'menu'; this.stateT = 0;
  }
  doRoll(v, dir) {
    const p = this.cur();
    if (p.pending === 'loaded') p.pending = null;   // the pick IS the roll
    this.dice = { v, t: 0, settled: false };
    this.state = 'dicing'; this.stateT = 0;
    this.rollDir = dir;   // 1 forward, -1 backward (drunk stumble)
    this.ctx.audio.sfx.drop();
  }
  beginMove(steps, dir) {
    this.moveQ = []; this.moveDir = dir;
    this.state = 'move'; this.moveSteps = Math.min(steps, 12); this.moveT = 0;
    this.moveStart = this.tt;
    this.advanceStep();
  }
  /* FREE MOVEMENT: every destination exactly N steps away, any direction,
     via non-backtracking walks over the board graph (both edge directions) */
  computeDests(startNode, steps) {
    const found = new Map();   // end nodeId -> the path that reaches it
    const walk = (cur, from, left, path) => {
      if (left === 0) { if (!found.has(cur)) found.set(cur, [...path]); return; }
      const nbs = new Set([...this.map[cur].next, ...this.map[cur].prev]);
      for (const nb of nbs) {
        if (nb === from) continue;             // no mid-walk U-turns
        path.push(nb); walk(nb, cur, left - 1, path); path.pop();
      }
    };
    walk(startNode, -1, steps, []);
    return [...found.entries()].map(([end, path]) => ({ end, path })).sort((a, b) => a.end - b.end);
  }
  enterPickDest(steps, forcedRandom) {
    this.destOptions = this.computeDests(this.cur().node, steps);
    this.forcedRandom = !!forcedRandom;        // drunk stumble: fate chooses
    this.state = 'pickDest'; this.stateT = 0; this.botT = 1.4 + this.rng();
  }
  doDest(path) {
    this.destOptions = null;
    const safe = (path || []).filter(n => this.map[n]).slice(0, 12);
    this.forcedPath = [...safe];
    this.moveDir = 1; this.state = 'move'; this.moveSteps = safe.length; this.moveT = 0;
    this.moveStart = this.tt;
    if (!safe.length) { this.landOn(); return; }
    this.advanceStep();
  }
  advanceStep() {
    const p = this.cur();
    if (this.moveSteps <= 0) { this.forcedPath = null; this.landOn(); return; }
    if (this.forcedPath && this.forcedPath.length) { this.stepTo(this.forcedPath.shift()); return; }
    const node = this.map[p.node];
    const opts = this.moveDir > 0 ? node.next : node.prev;
    if (this.moveDir > 0 && opts.length > 1) {
      // FORK: the mover chooses — precompute where each choice actually LANDS
      // with the steps left (stopping early if another fork would interrupt)
      this.state = 'branch'; this.stateT = 0; this.branchOpts = opts; this.botT = 1 + this.rng();
      this.branchPreviews = opts.map(nid => {
        const path = [nid]; let cur = nid, rem = this.moveSteps - 1, unsure = false;
        while (rem > 0) {
          const nx = this.map[cur].next;
          if (nx.length > 1) { unsure = true; break; }   // you'd choose again there
          if (!nx.length) break;
          cur = nx[0]; path.push(cur); rem--;
        }
        return { opt: nid, land: cur, path, unsure };
      });
      return;
    }
    // deterministic pick: rng streams diverge across clients (authority-only draws),
    // so any path choice every client computes independently must not consult rng
    const nxt = opts.length ? opts[0] : p.node;
    this.stepTo(nxt);
  }
  stepTo(nid) {
    const p = this.cur();
    this.stepFrom = { x: p.ax, y: p.ay };
    p.node = nid; this.moveSteps--; this.moveT = 0;
    this.state = 'stepping';
    this.ctx.audio.sfx.thud(0.25);
  }
  doBranch(nid) { this.stepTo(nid); }
  afterStep() {
    const p = this.cur(), node = this.map[p.node];
    // passing a shop pauses the walk
    if (node.type === 'shop' && this.moveDir > 0) { this.openShop(true); return; }
    if (this.moveSteps <= 0) this.landOn();
    else this.advanceStep();
  }
  landOn() {
    const p = this.cur(), node = this.map[p.node];
    // SQUASH: landing on an occupied node
    const victim = this.players.find(q => q !== p && q.node === p.node);
    if (victim) {
      if (p.pending === 'trippedLand') {   // Tripped & Fell: knockback instead of steal
        this.pop('💥 ' + victim.name + ' knocked back 2!');
        this.forceBack(victim, 2);
        this.ctx.audio.sfx.crash();
      } else if (this.authority()) {
        if (victim.shield) { this.act('steal', { victim: victim.id, ci: -1 }); }
        else if (victim.cosmetics.length) {
          const ci = Math.floor(this.rng() * victim.cosmetics.length);
          this.act('steal', { victim: victim.id, ci });
        } else this.pop('💥 SPLAT! (' + victim.name + ' had nothing to steal)');
      }
    }
    p.pending = null;
    this.state = 'action'; this.stateT = 0;
    this.nodeAction(node);
  }
  doSteal(victimId, ci) {
    const p = this.cur(), victim = this.players.find(q => q.id === victimId);
    if (!victim) return;
    if (ci < 0 || victim.shield) {
      victim.shield = false;
      this.pop('🛡️ ' + victim.name + "'s shield blocks the steal!", '#59d9ff');
      this.ctx.audio.sfx.shield();
      return;
    }
    const c = victim.cosmetics.splice(ci, 1)[0];
    p.cosmetics.push(c);
    this.pop('💥 SPLAT! Stole ' + cosmetic(c).icon + ' ' + cosmetic(c).name + '!', '#ff5f5f', 24);
    this.ctx.audio.sfx.crash();
  }
  forceBack(p, n) {
    for (let i = 0; i < n; i++) {
      const prev = this.map[p.node].prev;
      if (prev.length) p.node = prev[0];   // deterministic: runs on every client, rng streams differ
    }
    p.ax = this.map[p.node].x; p.ay = this.map[p.node].y;
  }
  nodeAction(node) {
    const p = this.cur();
    switch (node.type) {
      case 'blue': case 'start': case 'fork':
        if (node.type === 'blue') { p.coins += 3; this.pop('+3 🪙', '#4d9de0'); this.ctx.audio.sfx.coin(4); }
        this.endPlayerTurn(0.9); break;
      case 'red':
        p.coins = Math.max(0, p.coins - 3);
        this.pop('-3 🪙', '#e04040'); this.ctx.audio.sfx.wall();
        this.endPlayerTurn(0.9); break;
      case 'shop': this.openShop(false); break;
      case 'pinata': {
        if (this.authority()) {
          const roll = this.rng();
          const pool = roll < 0.6 ? 'common' : roll < 0.92 ? 'rare' : 'legendary';
          const opts = COSMETICS.filter(c => c.tier === pool);
          const c = opts[Math.floor(this.rng() * opts.length)];
          this.act('pinataDrop', { c: c.id });   // routed through applyAct default? no — handle inline:
        }
        this.overlay = { kind: 'pinata', t: 0 };
        break;
      }
      case 'mascot':
        if (p.coins < 5) { this.pop('🎭 The mascot wants 5 🪙 you don\'t have…', '#93a0bd'); this.endPlayerTurn(1); }
        else { this.overlay = { kind: 'mascot', t: 0 }; this.botT = 1.2 + this.rng(); }
        break;
      case 'carousel': {
        // spin for the stake, then EVERYONE rides — winner takes the pot
        this.overlay = { kind: 'wheel', t: 0, spin: 0, picked: null };
        this.botT = 1.1 + this.rng();
        this.ctx.audio.sfx.ui();
        break;
      }
      case 'warp': {
        // human cannonball! blast off to the twin cannon across the park.
        // fully deterministic (fixed pairs) — every client animates the same.
        this.warpFrom = { x: p.ax, y: p.ay };
        this.warpTarget = node.warpTo;
        this.state = 'warping'; this.stateT = 0;
        this.pop('🌀 CANNON TIME!', '#59d9ff', 26);
        this.ctx.audio.sfx.boom(); this.ctx.audio.sfx.whoosh();
        break;
      }
      default: this.endPlayerTurn(0.8);
    }
  }
  /* -------- 🎠 MERRY-GO-ROUND: wheel → ride → pot -------- */
  doWheel(bet) {
    this.carouselBet = bet;
    if (this.overlay && this.overlay.kind === 'wheel') { this.overlay.picked = bet; this.overlay.t = 0; }
    this.ctx.audio.sfx.win();
  }
  startCarousel() {
    this.overlay = null;
    this.pendingMg = { gid: 'carousel', seed: (this.ctx.seed ^ (this.turn * 5471) ^ (this.playerIdx * 97)) >>> 0 };
    this.mgLaunched = false;
    this.carouselPending = true;      // results route to the pot, not the usual rewards
    this.state = 'mgIntro'; this.stateT = 0;
  }
  doCarouselPayout(winnerId, bet) {
    const win = this.players.find(p => p.id === winnerId);
    let pot = 0;
    for (const p of this.players) {
      if (!win || p.id === winnerId) continue;
      const take = Math.min(bet, p.coins);   // can't take what they don't have
      p.coins -= take; pot += take;
    }
    if (win) {
      win.coins += pot;
      this.showBanner('🎠 ' + win.name + ' TAKES ' + pot + '🪙!', win.color, 2.4);
      this.pop('🎠 ' + win.name + ' wins the ride! +' + pot + '🪙', '#ffd23f', 24);
      this.ctx.audio.sfx.win();
    }
    this.carouselBet = null; this.carouselPending = false;
    this.endPlayerTurn(1.4);
  }
  // piñata resolution comes through act stream for sync
  applyPinata(cid) {
    const p = this.cur(), c = cosmetic(cid);
    p.cosmetics.push(cid);
    if (this.overlay && this.overlay.kind === 'pinata') this.overlay.reveal = cid;
    else this._pendReveal = cid;   // overlay not open yet — hand it over when it is
    this.pop('🪅 ' + c.icon + ' ' + c.name + ' (+' + c.value + 'pts)!', c.tier === 'legendary' ? '#ffd23f' : '#e08bd0', 24);
    this.ctx.audio.sfx.win();
  }
  doMascot(bet, win) {
    const p = this.cur();
    this.overlay = null;
    if (!bet) { this.pop(p.name + ' walks away from the mascot.'); this.endPlayerTurn(0.9); return; }
    p.coins -= 5;
    if (win) {
      const pool = this.rng() < 0.7 ? 'rare' : 'legendary';
      const opts = COSMETICS.filter(c => c.tier === pool);
      const c = opts[Math.floor(this.rng() * opts.length)];
      p.cosmetics.push(c.id);
      this.pop('🎭 WIN! ' + c.icon + ' ' + c.name + '!', '#ffd23f', 26);
      this.ctx.audio.sfx.win();
    } else {
      if (p.shield) { p.shield = false; this.pop('🎭 LOSE — but the 🛡️ shield blocks the launch!', '#59d9ff'); this.ctx.audio.sfx.shield(); }
      else { this.pop('🎭 LAUNCHED 3 BACK!', '#ff5f5f', 24); this.forceBack(p, 3); this.ctx.audio.sfx.crash(); }
    }
    this.endPlayerTurn(1.2);
  }
  openShop(passing) {
    this.overlay = { kind: 'shop', t: 0, passing };
    this.botT = 1 + this.rng();
    this.ctx.audio.sfx.ui();
  }
  doBuy(item) {
    const p = this.cur(), def = ITEMS[item];
    if (def.instant) {                          // Mystery Box: pops open right here
      if (p.coins < def.cost) return;
      p.coins -= def.cost;
      this.ctx.audio.sfx.coin(6);
      if (this.authority()) {                   // buyer's client draws the prize
        const c = COSMETICS[Math.floor(this.rng() * COSMETICS.length)];
        this.act('mbox', { c: c.id });
      }
      return;
    }
    if (p.coins < def.cost || p.items.length >= 3) return;
    p.coins -= def.cost; p.items.push(item);
    this.pop(def.icon + ' ' + def.name + ' bought!', '#a1e887');
    this.ctx.audio.sfx.coin(6);
  }
  closeShop() {
    const passing = this.overlay && this.overlay.passing;
    this.overlay = null;
    if (passing) { if (this.moveSteps <= 0) this.landOn(); else this.advanceStep(); }
    else this.endPlayerTurn(0.8);
  }
  endPlayerTurn(delay) {
    this.state = 'turnEnd'; this.stateT = -(delay || 0.8);
  }
  nextPlayerOrMinigame() {
    this.playerIdx++;
    if (this.playerIdx < this.players.length) { this.startTurnPlayer(); return; }
    // MINIGAME PHASE
    this.playerIdx = 0;                       // rotation done; keep cur() valid
    this.state = 'mgIntro'; this.stateT = 0;
    if (this.isNetHost) {
      // shuffled deck: NO minigame repeats until every game has been played
      if (!this.mgDeck || !this.mgDeck.length) {
        this.mgDeck = [...this.ctx.gameIds];
        for (let i = this.mgDeck.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [this.mgDeck[i], this.mgDeck[j]] = [this.mgDeck[j], this.mgDeck[i]];
        }
      }
      const gid = this.mgDeck.pop();
      const seed = (this.ctx.seed ^ (this.turn * 7919)) >>> 0;
      this.pendingMg = { gid, seed };
      this.netSend('mg', { gid, seed });
    }
  }
  launchMg(gid, seed, remote) { this.pendingMg = { gid, seed }; if (this.state !== 'mgIntro') { this.state = 'mgIntro'; this.stateT = 0; } }

  /* -------- the spec hook: minigame results → coins → next turn -------- */
  onMinigameComplete(resultsArray, gameId) {
    // the carousel isn't a normal round — its winner collects the ante pot
    if (gameId === 'carousel' && this.carouselPending) {
      this.mgLaunched = false; this.pendingMg = null;
      const bet = this.carouselBet || 10;
      if (this.authority()) {
        const first = resultsArray.find(r => r.rank === 1) ||
          [...resultsArray].sort((a, b) => b.score - a.score)[0];
        this.act('cpay', { winner: first ? first.playerId : null, bet });
      }
      return;
    }
    if (this.isNetHost) {
      const list = {};
      const dyn = DYNAMIC[gameId];
      for (const r of resultsArray) {
        const p = this.players.find(q => q.id === r.playerId);
        if (!p) continue;
        list[r.playerId] = dyn ? dyn(r.score) : (REWARDS[r.rank - 1] || 1);
      }
      const rows = resultsArray.filter(r => this.players.some(q => q.id === r.playerId));
      this.applyRewards(list, rows);
      this.netSend('rw', { list, rows });
    }
    // non-hosts wait for the 'rw' event (already handled in applyAct)
  }
  applyRewards(list, rows) {
    this.rewardRows = rows.map(r => ({ ...r, coins: list[r.playerId] || 0 }));
    for (const pid in list) {
      const p = this.players.find(q => q.id === pid);
      if (p) p.coins += list[pid];
    }
    this.state = 'reward'; this.stateT = 0;
    this.ctx.audio.sfx.win();
  }
  finishGame() {
    const rows = this.players
      .map(p => ({
        id: p.id, score: this.score(p),
        label: p.coins + '🪙 + ' + p.cosmetics.reduce((a, c) => a + cosmetic(c).value, 0) + '⭐',
        name: p.name, color: p.color,
      }))
      .sort((a, b) => b.score - a.score);
    this.ctx.end(rows);
  }

  /* -------- turn-state safety net --------
     The board is act-mirrored, but any single dropped/mistimed act would
     otherwise strand one phone on the wrong player forever ("waiting on you"
     vs "waiting on her"). The net-host publishes whose turn it actually is a
     few times a second; a client that disagrees for ~3s snaps to it. */
  syncPayload() {
    return {
      turn: this.turn, playerIdx: this.playerIdx,
      ps: this.players.map(p => ({
        id: p.id, node: p.node, coins: p.coins,
        cos: [...p.cosmetics], items: [...p.items], shield: !!p.shield,
      })),
    };
  }
  applySync(d) {
    const agree = d.turn === this.turn && d.playerIdx === this.playerIdx;
    if (agree) { this._syncBad = 0; return; }
    this._syncBad = (this._syncBad || 0) + 1;
    // A local animation gets a couple of beats to resolve on its own — but it
    // does NOT get to veto forever: a walk that never ends is exactly the case
    // that stranded one phone while the mover's looked fine.
    const busy = ['stepping', 'move', 'warping', 'dicing'].includes(this.state);
    if (this._syncBad < (busy ? 4 : 2)) return;
    this._syncBad = 0;
    this.turn = d.turn; this.playerIdx = d.playerIdx;
    for (const row of d.ps) {
      const p = this.players.find(q => q.id === row.id);
      if (!p) continue;
      p.node = row.node; p.coins = row.coins;
      p.cosmetics = [...row.cos]; p.items = [...row.items]; p.shield = row.shield;
      p.ax = this.map[p.node].x; p.ay = this.map[p.node].y;
    }
    this.overlay = null; this.destOptions = null; this.forcedPath = null; this.dice = null;
    this.rq.length = 0;   // queued acts are superseded by this snapshot
    this.pop('… resyncing', '#93a0bd');
    this.startTurnPlayer();
  }

  /* ---------------- update ---------------- */
  update(rdt) {
    if (!this.players.length) return;   // pathological empty board — never crashloop
    // TUTORIAL = a real pause. Nothing rolls, moves, or advances while a card
    // is up; remote acts stay queued (they replay in order on dismiss), so the
    // board is exactly where you left it and still in sync.
    if (this.tut != null) {
      this.tt += rdt;
      const hit = this.hitButton(this.clicks);
      if (hit) {
        this.ctx.audio.sfx.ui();
        if (hit.id === 'tutN') { this.tut++; if (this.tut >= 4) this.tut = null; }
        else if (hit.id === 'tutS') this.tut = null;
      }
      this.clicks.length = 0;
      return;
    }
    this.tt += rdt; this.stateT += rdt; this.bannerT -= rdt;
    this.drainQueue(rdt);
    if (this._pendingSync) { const d0 = this._pendingSync; this._pendingSync = null; this.applySync(d0); }
    // host heartbeat: whose turn it really is (see applySync)
    if (this.isNetHost && this.ctx.net) {
      this._syncAcc = (this._syncAcc || 0) + rdt;
      if (this._syncAcc > 1.5) {
        this._syncAcc = 0;
        this.netSend('sync', this.syncPayload());
      }
    }
    // Mario Party camera: locked to whoever's turn it is; splash shows the whole park
    const { W, H } = this.ctx.dim;
    const Zfit = Math.min(W / 120, (H * 0.68) / 80), Zgame = Math.min(W, H) / 34;
    const wide = this.state === 'splash' || this.state === 'end' || this.mapView;
    // pinch / ctrl-click / wheel scales the framing; below ~0.8 we drift toward
    // the whole-park view so zooming out always shows you more of the board
    const uz = this.userZoom || 1;
    const zoomT = clamp((wide ? Zfit : Zgame) * uz, Zfit * 0.55, Zgame * 2);
    if (!isFinite(this.zoom)) { this.zoom = Zfit; this.camX = 54; this.camY = 37; }
    this.zoom += (zoomT - this.zoom) * Math.min(1, rdt * 2.2);
    const wideF = wide ? 1 : clamp((1 - uz) / 0.35, 0, 1);   // pan toward park center as you zoom out
    const me = this.cur();
    const foc = {
      ax: lerp(me.ax, 54, wideF), ay: lerp(me.ay, 37, wideF),
    };
    this.camX += (foc.ax - this.camX) * Math.min(1, rdt * 4);
    this.camY += (foc.ay - this.camY) * Math.min(1, rdt * 4);
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    this.squashT = Math.max(0, this.squashT - rdt);
    for (let i = this.dust.length; i--;) { this.dust[i].t += rdt; if (this.dust[i].t > this.dust[i].dur) this.dust.splice(i, 1); }
    for (let i = this.confetti.length; i--;) {
      const c = this.confetti[i];
      c.t += rdt; c.y += c.vy * rdt; c.x += Math.sin(c.t * c.wig + c.ph) * 26 * rdt; c.rot += c.vr * rdt;
      if (c.y > this.ctx.dim.H + 20) this.confetti.splice(i, 1);
    }
    // reward = celebration: rain confetti once per reward phase
    if (this.state === 'reward') {
      const key = this.turn + ':' + this.playerIdx;
      if (this._confettiKey !== key) {
        this._confettiKey = key;
        const { W } = this.ctx.dim;
        for (let k = 0; k < 70; k++) this.confetti.push({
          x: frac(k * 12.9) * W, y: -20 - frac(k * 5.3) * 160, vy: 90 + frac(k * 31.7) * 130,
          rot: frac(k * 3.1) * TAU, vr: (frac(k * 8.3) - 0.5) * 9, wig: 2 + frac(k * 4.7) * 3, ph: k, t: 0,
          col: ['#ffd23f', '#e04040', '#4d9de0', '#7dff6a', '#e08bd0'][k % 5], s: 3 + frac(k * 6.1) * 4,
        });
      }
    }
    if (this.overlay) this.overlay.t += rdt;
    this.ctx.audio.setMusicIntensity(0.3 + (this.state === 'dicing' || this.state === 'stepping' ? 0.15 : 0));
    const p = this.cur ? this.cur() : null;
    const auth = this.authority();
    const clicks = this.clicks; // consumed per state below
    // MAP toggle works in ANY state (a corner button is always on screen)
    if (this.tut == null && clicks.length) {
      const mh = this.hitButton(clicks);
      if (mh && mh.id === 'mapAny') {
        this.mapView = !this.mapView; this.ctx.audio.sfx.ui();
        clicks.length = 0;
      }
    }
    const inp = this.myTurn() ? this.ctx.input(p.slot, rdt) : { act: false };
    // overlays (shop/mascot/piñata) pause whatever else is happening — including
    // mid-movement shop stops — and must resolve before the walk continues
    if (this.overlay) { this.handleOverlay(rdt, p, auth, clicks); this.clicks.length = 0; return; }
    switch (this.state) {
      case 'splash': if (this.stateT > 2.2) this.startTurnPlayer(); break;
      case 'menu': {
        if (p.bot && auth && (this.botT -= rdt) <= 0) {
          // bots: maybe arm an item, then roll
          if (p.items.length && !p.pending && this.rng() < 0.5) {
            this.act('playItem', { idx: Math.floor(this.rng() * p.items.length) });
            this.botT = 0.7 + this.rng() * 0.5;
          } else this.rollNow();
          break;
        }
        if (this.myTurn()) {
          const hit = this.hitButton(clicks);
          if (hit) {
            if (hit.id === 'roll' && !this.mapView) this.rollNow();
            else if (hit.id === 'items') { this.overlay = { kind: 'items', t: 0 }; this.ctx.audio.sfx.ui(); }
            else if (hit.id === 'map') { this.mapView = !this.mapView; this.ctx.audio.sfx.ui(); }
          } else if (inp.act && !this.mapView) this.rollNow();
        }
        break;
      }
      case 'preroll': if (this.stateT > 0.4) this.enterRoll(); break;
      case 'dicing': {
        this.dice.t += rdt;
        if (this.dice.t > 1.0 && !this.dice.settled) {
          this.dice.settled = true;
          this.ctx.audio.sfx.pow();
          const pnd = this.cur().pending;
          let steps = this.dice.v, dir = 1;
          if (pnd === 'tripped') { steps = 4; this.cur().pending = 'trippedLand'; this.pop('🤸 Flat 4!', '#ffb84d'); }
          else if (pnd === 'drunk') {
            dir = -1; this.cur().pending = null;   // fate picks the destination
            this.pop('🍺 ' + this.dice.v + ' — fate decides where you land!', '#ff5f5f');
          } else this.pop('🎲 ' + this.dice.v + '!', '#ffeccf', 32);
          this.pendingMove = { steps, dir };   // hold here — let everyone SEE the roll
        }
        if (this.dice.settled && this.dice.t > 2.15) {
          const m = this.pendingMove; this.pendingMove = null;
          this.enterPickDest(m.steps, m.dir < 0);   // pick where to land (drunk = fate)
        }
        break;
      }
      case 'pickDest': {
        const opts = this.destOptions || [];
        if (!opts.length) { this.endPlayerTurn(0.5); break; }
        if (auth && (this.forcedRandom || p.bot)) {
          if (this.forcedRandom && this.stateT < 1.2) break;   // let the chaos land dramatically
          if (p.bot && !this.forcedRandom && (this.botT -= rdt) > 0) break;
          const pick = opts[Math.floor(this.rng() * opts.length)];
          this.act('dest', { path: pick.path });
          break;
        }
        if (this.myTurn() && !this.forcedRandom && clicks.length) {
          let done2 = false;
          for (const [cx2, cy2] of clicks) {
            for (const o of opts) {
              const [nx, ny] = this.nodeXY(o.end);
              if (Math.hypot(cx2 - nx, cy2 - ny) < (this.zoom || 10) * 4.5) {
                this.act('dest', { path: o.path }); done2 = true; break;
              }
            }
            if (done2) break;
          }
        }
        break;
      }
      case 'branch': {
        if (p.bot && auth && (this.botT -= rdt) <= 0) {
          this.act('branch', { n: this.branchOpts[Math.floor(this.rng() * this.branchOpts.length)] });
          break;
        }
        if (this.myTurn() && clicks.length) {
          const hit = this.hitButton(clicks);
          if (hit && hit.id.startsWith('br')) { this.act('branch', { n: +hit.id.slice(2) }); break; }
          // tapping the LANDING pin also picks that route
          let picked = false;
          for (const [cx2, cy2] of clicks) {
            for (const pv of (this.branchPreviews || [])) {
              const [lx, ly] = this.nodeXY(pv.land);
              if (Math.hypot(cx2 - lx, cy2 - ly) < (this.zoom || 10) * 4.5) {
                this.act('branch', { n: pv.opt }); picked = true; break;
              }
            }
            if (picked) break;
          }
          if (picked) break;
          for (const [cx2, cy2] of clicks) {
            for (const nid of this.branchOpts) {
              const [nx, ny] = this.nodeXY(nid);
              if (Math.hypot(cx2 - nx, cy2 - ny) < (this.zoom || 10) * 4.5) { this.act('branch', { n: nid }); break; }
            }
          }
        }
        break;
      }
      case 'stepping': {
        // watchdog: a walk can never outlive a sane duration (12 steps ≈ 4s)
        if (this.moveStart != null && this.tt - this.moveStart > 9) {
          this.moveSteps = 0; this.forcedPath = null; this.landOn(); break;
        }
        this.moveT += rdt;
        const p2 = this.cur(), tn = this.map[p2.node];
        const f = Math.min(1, this.moveT / 0.34);
        p2.ax = lerp(this.stepFrom.x, tn.x, f);
        p2.ay = lerp(this.stepFrom.y, tn.y, f) - Math.sin(f * Math.PI) * 3;
        if (f >= 1) {
          p2.ax = tn.x; p2.ay = tn.y;
          // goofy landing: squash-and-stretch + a puff of boardwalk dust
          this.squashT = 0.2;
          for (let k = 0; k < 5; k++)
            this.dust.push({ x: tn.x, y: tn.y, ox: (k / 4 - 0.5) * 2, t: 0, dur: 0.4 + frac(k * 3.7) * 0.2, s: 0.7 + frac(k * 9.1) * 0.6 });
          this.afterStep();
        }
        break;
      }
      case 'warping': {
        // soaring arc between the paired cannons — big air, tiny dignity
        const p2 = this.cur(), tn = this.map[this.warpTarget];
        const f = Math.min(1, this.stateT / 1.1);
        p2.ax = lerp(this.warpFrom.x, tn.x, f);
        p2.ay = lerp(this.warpFrom.y, tn.y, f) - Math.sin(f * Math.PI) * 17;
        if (f >= 1) {
          p2.node = this.warpTarget; p2.ax = tn.x; p2.ay = tn.y;
          this.squashT = 0.2;
          for (let k = 0; k < 7; k++)
            this.dust.push({ x: tn.x, y: tn.y, ox: (k / 6 - 0.5) * 2.4, t: 0, dur: 0.45 + frac(k * 3.7) * 0.2, s: 0.8 + frac(k * 9.1) * 0.7 });
          this.pop('🌀 WARPED!', '#59d9ff');
          this.ctx.audio.sfx.thud(1);
          this.endPlayerTurn(0.8);
        }
        break;
      }
      case 'action': break;   // node effects run instantly or via overlays
      case 'turnEnd': if (this.stateT > 0) this.nextPlayerOrMinigame(); break;
      case 'mgIntro': {
        if (this.stateT > 1.6 && this.pendingMg && !this.mgLaunched) {
          this.mgLaunched = true;
          const { gid, seed } = this.pendingMg;
          this.ctx.launchMinigame(gid, seed);
        }
        break;
      }
      case 'reward': {
        if (this.stateT > 4.5) {   // let the podium land
          this.mgLaunched = false; this.pendingMg = null;
          this.turn++;
          this.playerIdx = 0;
          if (this.turn > this.maxTurns) { this.state = 'end'; this.stateT = 0; }
          else this.startTurnPlayer();
        }
        break;
      }
      case 'end': if (this.stateT > 3) this.finishGame(); break;
    }
    // pinata2 act needs routing (added late to applyAct):
    this.clicks.length = 0;
  }
  rollNow() {
    const p = this.cur();
    if (p.pending === 'loaded') {              // Loaded Dice: pick your number
      if (p.bot) { this.act('roll', { v: 6 }); return; }
      this.overlay = { kind: 'pickroll', t: 0 }; this.ctx.audio.sfx.ui(); return;
    }
    const v = 1 + Math.floor(this.rng() * 6);
    this.act('roll', { v });
  }
  handleOverlay(rdt, p, auth, clicks) {
    const o = this.overlay;
    if (o.kind === 'pickroll') {               // Loaded Dice: choose 1-6
      if (this.myTurn()) {
        const hit = this.hitButton(clicks);
        if (hit && hit.id.startsWith('pv')) {
          this.overlay = null;
          this.act('roll', { v: +hit.id.slice(2) });
        }
      } else this.overlay = null;
      return;
    }
    if (o.kind === 'wheel') {
      o.spin += rdt * (o.picked == null ? 7 : 0.6);
      if (o.picked == null) {
        // spin: the lander taps to stop it (bots stop on their own)
        const stop = (p.bot && auth && (this.botT -= rdt) <= 0) ||
          (this.myTurn() && (this.hitButton(clicks) || clicks.length));
        if (stop && auth) {
          const bet = BET_WHEEL[Math.floor(this.rng() * BET_WHEEL.length)];
          this.act('wheel', { bet });
        }
      } else if (o.t > 1.9) {
        this.startCarousel();          // everyone to the horses
      }
      return;
    }
    if (o.kind === 'items') {
      if (this.myTurn()) {
        const hit = this.hitButton(clicks);
        if (hit) {
          if (hit.id === 'cancel') { this.overlay = null; this.ctx.audio.sfx.ui(); }
          else if (hit.id.startsWith('use')) this.act('playItem', { idx: +hit.id.slice(3) });
        }
      } else this.overlay = null;
      return;
    }
    if (o.kind === 'pinata') {
      if (auth && !o.dropped && o.t > 0.7) {
        o.dropped = true;
        const roll = this.rng();
        const pool = roll < 0.6 ? 'common' : roll < 0.92 ? 'rare' : 'legendary';
        const opts = COSMETICS.filter(c => c.tier === pool);
        const c = opts[Math.floor(this.rng() * opts.length)];
        this.act('pinata2', { c: c.id });
      }
      // a reveal that arrived BEFORE this overlay existed still lands here
      if (!o.reveal && this._pendReveal) { o.reveal = this._pendReveal; this._pendReveal = null; }
      if (o.reveal && o.t > 2.2) { this.overlay = null; this.endPlayerTurn(0.4); }
      else if (o.t > 8) { this.overlay = null; this.endPlayerTurn(0.3); }   // watchdog: never strand a turn
    } else if (o.kind === 'mascot') {
      if (p.bot && auth && (this.botT -= rdt) <= 0) {
        const bet = p.coins >= 8 && this.rng() < 0.55;
        this.act('mascot', { bet, win: this.rng() < 0.5 });
      } else if (this.myTurn()) {
        const hit = this.hitButton(clicks);
        if (hit && auth) {
          if (hit.id === 'bet') this.act('mascot', { bet: true, win: this.rng() < 0.5 });
          else if (hit.id === 'nobet') this.act('mascot', { bet: false, win: false });
        }
      }
    } else if (o.kind === 'shop') {
      if (p.bot && auth && (this.botT -= rdt) <= 0) {
        this.botT = 0.8 + this.rng() * 0.5;
        const wants = Object.keys(ITEMS).filter(k => p.coins >= ITEMS[k].cost && (ITEMS[k].instant || p.items.length < 3));
        if (wants.length && this.rng() < 0.55) this.act('buy', { item: wants[Math.floor(this.rng() * wants.length)] });
        else this.act('shopDone', {});
      } else if (this.myTurn()) {
        const hit = this.hitButton(clicks);
        if (hit) {
          if (hit.id === 'close') this.act('shopDone', {});
          else if (hit.id.startsWith('buy')) this.act('buy', { item: hit.id.slice(3) });
        }
      }
    }
  }
  hitButton(clicks) {
    if (!clicks.length || !this.buttons) return null;
    for (const [cx2, cy2] of clicks)
      for (const b of this.buttons)
        if (cx2 >= b.x && cx2 <= b.x + b.w && cy2 >= b.y && cy2 <= b.y + b.h) return b;
    return null;
  }
  proj(x, y) {
    const { W, H } = this.ctx.dim, Z = this.zoom || 10;
    return [W / 2 + (x - this.camX) * Z, H * 0.42 + (y - this.camY) * Z * 0.62];
  }
  nodeXY(nid) {
    const n = this.map[nid];
    return this.proj(n.x, n.y);
  }

  /* ---------------- render: Mario Party camera, chunky 3D tiles ---------------- */
  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    const Z = this.zoom || 10;
    // the world has a horizon: sky above, ocean strip, then the boardwalk GROUND.
    // Horizon is world-anchored (above the top of the park) so panning feels real.
    const [, horizonY] = this.proj(0, -14);
    const skyBot = Math.max(40, Math.min(H, horizonY));
    const sky = g.createLinearGradient(0, 0, 0, skyBot);
    sky.addColorStop(0, '#1c1234'); sky.addColorStop(0.35, '#552a56');
    sky.addColorStop(0.7, '#a84462'); sky.addColorStop(1, '#f08a52');
    g.fillStyle = sky; g.fillRect(0, 0, W, skyBot);
    // early stars up top
    for (let i = 0; i < 14; i++) {
      const fr = frac(i * 91.7), f3 = frac(i * 37.3);
      const tw2 = 0.35 + 0.65 * Math.abs(Math.sin(this.tt * (0.7 + f3) + i));
      g.fillStyle = 'rgba(255,240,220,' + (0.5 * tw2 * Math.max(0, 1 - f3 * 1.7)).toFixed(2) + ')';
      g.fillRect(fr * W, f3 * skyBot * 0.7, 2, 2);
    }
    // sun: layered glow sitting on the horizon
    const sunX = W * 0.7 - (this.camX - 50) * Z * 0.12, sunY = skyBot - Z * 1.2;
    for (const [rr3, aa] of [[Z * 6.5, 0.12], [Z * 4.2, 0.2], [Z * 2.6, 0.55]]) {
      g.fillStyle = 'rgba(255,205,110,' + aa + ')';
      g.beginPath(); g.arc(sunX, sunY, rr3, 0, TAU); g.fill();
    }
    g.fillStyle = '#ffe08a';
    g.beginPath(); g.arc(sunX, sunY, Z * 2.2, 0, TAU); g.fill();
    // drifting clouds (parallax, wrap)
    for (let i = 0; i < 4; i++) {
      const cy2 = skyBot * (0.22 + frac(i * 53.1) * 0.5);
      const cx2 = ((frac(i * 17.7) * (W + 260) + this.tt * (4 + i * 2) - this.camX * Z * 0.05) % (W + 260)) - 130;
      const cs = Z * (1.1 + frac(i * 7.9));
      g.fillStyle = 'rgba(255,190,170,' + (0.18 + 0.08 * (i % 2)) + ')';
      g.beginPath();
      g.ellipse(cx2, cy2, cs * 3, cs * 0.9, 0, 0, TAU);
      g.ellipse(cx2 - cs * 1.8, cy2 + cs * 0.3, cs * 1.7, cs * 0.65, 0, 0, TAU);
      g.ellipse(cx2 + cs * 2, cy2 + cs * 0.25, cs * 1.9, cs * 0.7, 0, 0, TAU);
      g.fill();
    }
    // distant ferris wheel silhouette, turning slowly on the horizon
    const fwX = W * 0.22 - (this.camX - 50) * Z * 0.15, fwR = Z * 4.2, fwY = skyBot - fwR - Z * 0.4;
    g.strokeStyle = 'rgba(40,22,52,0.85)'; g.lineWidth = Math.max(1.5, Z * 0.14);
    g.beginPath(); g.arc(fwX, fwY, fwR, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(fwX - fwR * 0.7, skyBot); g.lineTo(fwX, fwY); g.lineTo(fwX + fwR * 0.7, skyBot); g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = this.tt * 0.12 + i / 8 * TAU;
      const gx2 = fwX + Math.cos(a) * fwR, gy2 = fwY + Math.sin(a) * fwR;
      g.beginPath(); g.moveTo(fwX, fwY); g.lineTo(gx2, gy2); g.stroke();
      g.fillStyle = ['#ffd23f', '#e04040', '#4d9de0', '#e08bd0'][i % 4];
      g.beginPath(); g.arc(gx2, gy2 + Z * 0.3, Math.max(1.5, Z * 0.28), 0, TAU); g.fill();
    }
    // seagulls
    g.strokeStyle = 'rgba(30,20,40,0.7)'; g.lineWidth = Math.max(1.2, Z * 0.1); g.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const gx2 = ((this.tt * (14 + i * 6) + i * 300) % (W + 120)) - 60;
      const gy2 = skyBot * (0.3 + i * 0.22) + Math.sin(this.tt * 2 + i * 3) * 6;
      const fl = Math.sin(this.tt * 7 + i * 2) * Z * 0.35;
      g.beginPath(); g.moveTo(gx2 - Z * 0.55, gy2 + fl); g.quadraticCurveTo(gx2, gy2 - Z * 0.25, gx2 + Z * 0.02, gy2);
      g.quadraticCurveTo(gx2 + Z * 0.06, gy2 - Z * 0.25, gx2 + Z * 0.6, gy2 + fl); g.stroke();
    }
    // ocean strip: deep gradient + animated swells + sun glitter + foam shoreline
    const [, oceanBot] = this.proj(0, -8);
    const og = g.createLinearGradient(0, skyBot, 0, Math.max(skyBot + 1, oceanBot));
    og.addColorStop(0, '#e0825a'); og.addColorStop(0.25, '#5a7cb8'); og.addColorStop(1, '#1d3a6e');
    g.fillStyle = og; g.fillRect(0, skyBot, W, Math.max(0, oceanBot - skyBot));
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 5; i++) {
      const wy = -13.4 + i * 1.25, [, py2] = this.proj(0, wy);
      if (py2 <= skyBot || py2 >= oceanBot) continue;
      g.lineWidth = Math.max(1, Z * (0.06 + i * 0.02));
      g.beginPath();
      for (let x = 0; x <= W; x += 14)
        g[x ? 'lineTo' : 'moveTo'](x, py2 + Math.sin(x * 0.05 + this.tt * (1.2 + i * 0.3) + i * 9) * Z * 0.14);
      g.stroke();
    }
    // sun glitter path on the water
    for (let i = 0; i < 12; i++) {
      const fy = frac(i * 61.3), py2 = lerp(skyBot + 2, oceanBot - 2, fy);
      const px2 = sunX + (frac(i * 23.9) - 0.5) * Z * (2 + fy * 5);
      g.fillStyle = 'rgba(255,220,140,' + (0.5 * Math.abs(Math.sin(this.tt * 2.4 + i * 2.4))).toFixed(2) + ')';
      g.fillRect(px2, py2, Math.max(2, Z * 0.5), Math.max(1, Z * 0.08));
    }
    // foam where the surf meets the boardwalk
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = Math.max(1.6, Z * 0.16);
    g.beginPath();
    for (let x = 0; x <= W; x += 10)
      g[x ? 'lineTo' : 'moveTo'](x, oceanBot + Math.sin(x * 0.07 + this.tt * 1.6) * Z * 0.18);
    g.stroke();
    // THE GROUND: sandy fairground from the shore down, wooden deck under the park
    const gg = g.createLinearGradient(0, oceanBot, 0, H);
    gg.addColorStop(0, '#e8c188'); gg.addColorStop(0.35, '#cd9f62'); gg.addColorStop(1, '#8a6238');
    g.fillStyle = gg; g.fillRect(0, Math.max(0, oceanBot), W, H);
    // deck planks: long seams + alternating tone bands + staggered joints + nails
    for (let wy = Math.floor((this.camY - 50) / 3.2) * 3.2, row = 0; wy < this.camY + 50; wy += 3.2, row++) {
      const [, py2] = this.proj(0, wy);
      const [, py3] = this.proj(0, wy + 3.2);
      if (py3 < oceanBot || py2 > H + 10) continue;
      if ((Math.floor(wy / 3.2) % 2 + 2) % 2 === 0) {   // subtle alternating plank tone
        g.fillStyle = 'rgba(90,60,30,0.08)';
        g.fillRect(0, Math.max(py2, oceanBot), W, Math.max(0, Math.min(py3, H) - Math.max(py2, oceanBot)));
      }
      g.strokeStyle = 'rgba(90,64,40,0.4)'; g.lineWidth = Math.max(1.2, Z * 0.1);
      g.beginPath(); g.moveTo(0, py2); g.lineTo(W, py2); g.stroke();
      // staggered vertical joints with nail heads
      const off = ((Math.floor(wy / 3.2) % 2 + 2) % 2) * 5.5;
      for (let wx = Math.floor((this.camX - 60) / 11) * 11 + off; wx < this.camX + 60; wx += 11) {
        const [jx] = this.proj(wx, wy);
        if (jx < -5 || jx > W + 5 || py2 < oceanBot) continue;
        g.beginPath(); g.moveTo(jx, py2); g.lineTo(jx, Math.min(py3, H)); g.stroke();
        g.fillStyle = 'rgba(60,42,26,0.5)';
        g.beginPath(); g.arc(jx + Z * 0.35, py2 + Z * 0.5, Math.max(1, Z * 0.07), 0, TAU); g.fill();
      }
    }
    // scattered sand speckles + confetti litter (deterministic)
    for (let i = 0; i < 40; i++) {
      const fr = Math.sin(i * 127.1) * 43758.5453, f2 = fr - Math.floor(fr);
      const fr2 = Math.sin(i * 311.7) * 12543.2, f3 = fr2 - Math.floor(fr2);
      const [sx2, sy2] = this.proj(f2 * 130 - 15, f3 * 90 - 12);
      if (sx2 < -10 || sx2 > W + 10 || sy2 < oceanBot || sy2 > H) continue;
      g.fillStyle = i % 5 === 0 ? ['#e04040', '#4d9de0', '#ffd23f'][i % 3] : 'rgba(120,86,48,0.4)';
      g.fillRect(sx2, sy2, Math.max(1.6, Z * 0.16), Math.max(1.6, Z * 0.16));
    }
    // the WALKWAY: a wide continuous path ribbon the tiles sit on
    g.lineCap = 'round'; g.lineJoin = 'round';
    const edges = [];
    for (const n of this.map) for (const nx of n.next) {
      const m2 = this.map[nx];
      const [ax2, ay2] = this.proj(n.x, n.y), [bx2, by2] = this.proj(m2.x, m2.y);
      if (Math.max(ax2, bx2) < -120 || Math.min(ax2, bx2) > W + 120) continue;
      edges.push([ax2, ay2, bx2, by2]);
    }
    for (const pass of [[Z * 8.6, '#4c3420'], [Z * 7.9, '#6b4a2b'], [Z * 7.1, '#8a6238'], [Z * 6.4, '#a3784a']]) {
      g.strokeStyle = pass[1]; g.lineWidth = pass[0];
      for (const [ax2, ay2, bx2, by2] of edges) {
        g.beginPath(); g.moveTo(ax2, ay2); g.lineTo(bx2, by2); g.stroke();
      }
    }
    // Mario-Party-style guide dots down the middle of the path
    g.fillStyle = 'rgba(255,236,190,0.8)';
    for (const [ax2, ay2, bx2, by2] of edges) {
      for (const f of [0.33, 0.66]) {
        g.beginPath(); g.arc(lerp(ax2, bx2, f), lerp(ay2, by2, f), Math.max(1.6, Z * 0.28), 0, TAU); g.fill();
      }
    }
    // string lights draped along the top of the loop — with warm glow halos
    for (let seg = 0; seg < 4; seg++) {
      const x0 = 8 + seg * 24, x1 = x0 + 24;
      const [ax2, ay2] = this.proj(x0, -2), [bx2, by2] = this.proj(x1, -2);
      if (Math.max(ax2, bx2) < -60 || Math.min(ax2, bx2) > W + 60) continue;
      g.strokeStyle = 'rgba(20,16,10,0.6)'; g.lineWidth = Math.max(1.2, Z * 0.09);
      g.beginPath(); g.moveTo(ax2, ay2); g.quadraticCurveTo((ax2 + bx2) / 2, ay2 + Z * 2.2, bx2, by2); g.stroke();
      for (let b = 1; b < 6; b++) {
        const f = b / 6, lx = lerp(ax2, bx2, f), ly = ay2 + Math.sin(f * Math.PI) * Z * 1.6;
        const col = ['#ffd23f', '#e04040', '#4d9de0', '#7dff6a', '#e08bd0'][b % 5];
        const tw2 = 0.75 + 0.25 * Math.sin(this.tt * 3 + seg * 5 + b * 2);
        g.globalAlpha = 0.35 * tw2;
        g.fillStyle = col;
        g.beginPath(); g.arc(lx, ly, Math.max(3, Z * 0.6), 0, TAU); g.fill();
        g.globalAlpha = 1;
        g.beginPath(); g.arc(lx, ly, Math.max(1.6, Z * 0.24), 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.beginPath(); g.arc(lx - Z * 0.06, ly - Z * 0.06, Math.max(0.7, Z * 0.08), 0, TAU); g.fill();
      }
    }
    // landing dust poofs (goofy physics!)
    for (const d of this.dust) {
      const [dx2, dy2] = this.proj(d.x, d.y);
      const f = d.t / d.dur;
      g.globalAlpha = (1 - f) * 0.55;
      g.fillStyle = '#e8d5b0';
      g.beginPath(); g.arc(dx2 + d.ox * Z * (0.5 + f * 1.6), dy2 - f * Z * 1.1, Z * (0.35 + f * 0.75) * d.s, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    // depth-sorted world: decor + chunky tiles + standing divers
    const items = [];
    for (const dc of this.decor) {
      const [px2, py2] = this.proj(dc.x, dc.y);
      if (px2 < -160 || px2 > W + 160 || py2 < -160 || py2 > H + 160) continue;
      items.push({ py: py2 - 0.2, kind: 'decor', dc, px: px2 });
    }
    for (const n of this.map) {
      const [px2, py2] = this.proj(n.x, n.y);
      if (px2 < -120 || px2 > W + 120 || py2 < -120 || py2 > H + 140) continue;
      items.push({ py: py2, kind: 'tile', n, px: px2 });
    }
    this.players.forEach((p, i) => {
      const [px2, py2] = this.proj(p.ax, p.ay);
      if (px2 < -120 || px2 > W + 120) return;
      items.push({ py: py2 + 0.1 + i * 0.01, kind: 'player', p, i, px: px2 });
    });
    items.sort((a, b) => a.py - b.py);
    for (const it of items) {
      if (it.kind === 'tile') this.drawTile(g, it.n, it.px, it.py, Z);
      else if (it.kind === 'decor') this.drawDecor(g, it.dc, it.px, it.py, Z);
      else this.drawStanding(g, it.p, it.i, it.px, it.py, Z);
    }
    // DESTINATION PICKER: every space exactly N steps away, tap to go
    if (this.state === 'pickDest' && this.destOptions) {
      const p0 = this.cur();
      const [sx0, sy0] = this.proj(p0.ax, p0.ay);
      this.destOptions.forEach((o, i) => {
        const [lx, ly] = this.nodeXY(o.end);
        const col = this.forcedRandom ? '#ff5f5f' : '#ffd23f';
        // faint route thread so you can see HOW you'd get there
        g.strokeStyle = col; g.globalAlpha = 0.22; g.lineWidth = Math.max(1.5, Z * 0.22);
        g.setLineDash([Z * 0.6, Z * 0.6]);
        g.beginPath(); g.moveTo(sx0, sy0);
        for (const nid of o.path) { const [nx2, ny2] = this.nodeXY(nid); g.lineTo(nx2, ny2); }
        g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
        // pulsing landing ring + bobbing marker
        const ph = this.tt * 4.5 + i * 0.9;
        g.globalAlpha = 0.6 + 0.3 * Math.sin(ph);
        g.strokeStyle = col; g.lineWidth = 3.5;
        g.beginPath(); g.ellipse(lx, ly + Z * 0.3, Z * 4.2, Z * 2.6, 0, 0, TAU); g.stroke();
        g.globalAlpha = 1;
        const bob2 = Math.sin(ph) * Z * 0.3, py3 = ly - Z * 5.6 + bob2;
        g.fillStyle = col; g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(lx, ly - Z * 2.2 + bob2);
        g.lineTo(lx - Z * 1.0, py3 + Z * 1.1); g.lineTo(lx + Z * 1.0, py3 + Z * 1.1);
        g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.arc(lx, py3, Z * 1.7, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = '#14100a'; g.font = '900 ' + Math.round(Z * 1.5) + 'px system-ui';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(NODE_STYLE[this.map[o.end].type][1], lx, py3 + 1);
        g.textBaseline = 'alphabetic';
      });
    }
    // FORK PREVIEW: per choice, trace the route and pin where you'd LAND
    if (this.state === 'branch' && this.branchPreviews) {
      const p0 = this.cur();
      this.branchPreviews.forEach((pv, i) => {
        const col = PREV_COLS[i % PREV_COLS.length];
        // dashed route line from the diver through the path
        g.strokeStyle = col; g.lineWidth = Math.max(2.5, Z * 0.45);
        g.globalAlpha = 0.75; g.setLineDash([Z * 0.9, Z * 0.7]);
        g.lineDashOffset = -this.tt * Z * 2;   // marching ants toward the landing
        g.beginPath();
        const [sx0, sy0] = this.proj(p0.ax, p0.ay);
        g.moveTo(sx0, sy0);
        for (const nid of pv.path) { const [nx2, ny2] = this.nodeXY(nid); g.lineTo(nx2, ny2); }
        g.stroke();
        g.setLineDash([]); g.globalAlpha = 1;
        // pulsing ring on the landing tile
        const [lx, ly] = this.nodeXY(pv.land);
        g.globalAlpha = 0.55 + 0.3 * Math.sin(this.tt * 5 + i * 2);
        g.strokeStyle = col; g.lineWidth = 3.5;
        g.beginPath(); g.ellipse(lx, ly + Z * 0.3, Z * 4.2, Z * 2.6, 0, 0, TAU); g.stroke();
        g.globalAlpha = 1;
        // bobbing pin above it: the landing space's icon (⑂ = another choice there)
        const bob2 = Math.sin(this.tt * 5 + i * 2) * Z * 0.3;
        const py3 = ly - Z * 6 + bob2;
        g.fillStyle = col; g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(lx, ly - Z * 2.2 + bob2);
        g.lineTo(lx - Z * 1.1, py3 + Z * 1.2); g.lineTo(lx + Z * 1.1, py3 + Z * 1.2);
        g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.arc(lx, py3, Z * 1.8, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = '#14100a';
        g.font = '900 ' + Math.round(Z * 1.6) + 'px system-ui';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(pv.unsure ? '⑂' : NODE_STYLE[this.map[pv.land].type][1], lx, py3 + 1);
        g.textBaseline = 'alphabetic';
      });
    }
    // dice above the active player's head
    if ((this.state === 'menu' || this.state === 'dicing') && this.cur() && !this.mapView) {
      const p = this.cur();
      const [px2, py2] = this.proj(p.ax, p.ay);
      const ds = Z * 3, dy2 = py2 - Z * 11 + Math.sin(this.tt * 3) * Z * 0.3;
      const settled = this.dice && this.dice.settled;
      const shown = this.state === 'dicing' && this.dice
        ? (settled ? this.dice.v : 1 + Math.floor(this.tt * 17 % 6)) : 0;
      // settled: POP big and STAY big for the reveal beat, so the number reads
      const popIn = settled ? 1.4 + Math.max(0, 0.45 - (this.dice.t - 1.0)) * 1.3 : 1;
      g.save(); g.translate(px2, dy2); g.scale(popIn, popIn);
      if (!settled) g.rotate(Math.sin(this.tt * 14) * 0.3);
      // pseudo-3D block: top + right faces behind the front face
      const d3 = ds * 0.28;
      g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
      g.fillStyle = '#d9d2c4';   // top face
      g.beginPath(); g.moveTo(-ds / 2, -ds / 2); g.lineTo(-ds / 2 + d3, -ds / 2 - d3);
      g.lineTo(ds / 2 + d3, -ds / 2 - d3); g.lineTo(ds / 2, -ds / 2); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#b8b0a0';   // right face
      g.beginPath(); g.moveTo(ds / 2, -ds / 2); g.lineTo(ds / 2 + d3, -ds / 2 - d3);
      g.lineTo(ds / 2 + d3, ds / 2 - d3); g.lineTo(ds / 2, ds / 2); g.closePath(); g.fill(); g.stroke();
      // front face
      const fg = g.createLinearGradient(-ds / 2, -ds / 2, ds / 2, ds / 2);
      fg.addColorStop(0, '#fffdf6'); fg.addColorStop(1, '#e8e0d0');
      g.fillStyle = fg;
      const dr = ds * 0.18;
      g.beginPath();
      g.moveTo(-ds / 2 + dr, -ds / 2); g.arcTo(ds / 2, -ds / 2, ds / 2, ds / 2, dr);
      g.arcTo(ds / 2, ds / 2, -ds / 2, ds / 2, dr); g.arcTo(-ds / 2, ds / 2, -ds / 2, -ds / 2, dr);
      g.arcTo(-ds / 2, -ds / 2, ds / 2, -ds / 2, dr); g.closePath(); g.fill(); g.stroke();
      if (shown) {                       // classic pips
        g.fillStyle = '#c0392b';
        const pp = ds * 0.24, pipR = ds * 0.09;
        const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
        for (const [qx, qy] of P[shown]) { g.beginPath(); g.arc(qx * pp, qy * pp, pipR, 0, TAU); g.fill(); }
      } else {                           // pre-roll: glowing '?'
        g.fillStyle = '#c0392b'; g.font = '900 ' + Math.round(ds * 0.62) + 'px system-ui';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.globalAlpha = 0.7 + 0.3 * Math.sin(this.tt * 5);
        g.fillText('?', 0, 1); g.globalAlpha = 1; g.textBaseline = 'alphabetic';
      }
      g.restore();
    }
    // ---------- HUD ----------
    this.buttons = [];
    this.drawChips(g, W, H);
    this.drawPhaseUI(g, W, H);
    if (this.overlay) this.drawOverlay(g, W, H);
    // banner + pops
    if (this.bannerT > 0 && this.banner) {
      g.globalAlpha = Math.min(1, this.bannerT * 2);
      g.font = '900 ' + Math.round(Math.min(30, W * 0.062)) + 'px system-ui'; g.textAlign = 'center';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      g.strokeText(this.banner.txt, W / 2, H * 0.1);
      g.fillStyle = this.banner.col; g.fillText(this.banner.txt, W / 2, H * 0.1);
      g.globalAlpha = 1;
    }
    g.textAlign = 'center';
    for (const q of this.pops) {
      const f = 1 - q.t / q.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + q.size + 'px system-ui';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      g.strokeText(q.txt, W / 2, H * 0.3 - q.t * 40);
      g.fillStyle = q.col; g.fillText(q.txt, W / 2, H * 0.3 - q.t * 40);
    }
    g.globalAlpha = 1;
    // celebration confetti (reward phase) rains over everything
    for (const c of this.confetti) {
      g.save(); g.translate(c.x, c.y); g.rotate(c.rot);
      g.fillStyle = c.col;
      g.fillRect(-c.s / 2, -c.s / 3, c.s, c.s * 0.66);
      g.restore();
    }
    if (this.tut != null) this.drawTutorial(g, W, H);
  }
  drawTutorial(g, W, H) {
    const CARDS = [
      ['🎪 WELCOME TO THE BOARDWALK!', [
        'Richest diver after ' + this.maxTurns + ' turns WINS.',
        'Score = coins 🪙 + cosmetics ⭐',
      ]],
      ['🎲 ON YOUR TURN', [
        'ROLL, then TAP any glowing space',
        'exactly that many steps away —',
        'forward, back, any route you like!',
        '🔵 +3 · 🔴 −3 · 🛒 shop · 🪅 cosmetics',
        '🌀 cannons BLAST you across the park',
      ]],
      ['🕹️ MINIGAME EVERY ROUND', [
        'After everyone moves, a minigame!',
        'Placements pay coins. You get a',
        'practice arena first — then 3·2·1.',
      ]],
      ['😈 BE RUDE', [
        'Land on a rival to SQUASH them',
        'and STEAL a cosmetic. Item cards',
        'trip, stumble, and shield. Have fun!',
      ]],
    ];
    const [title, lines] = CARDS[this.tut];
    g.fillStyle = 'rgba(6,7,13,0.74)'; g.fillRect(0, 0, W, H);
    const cw = Math.min(W * 0.88, 360), lh = 24;
    const chh = 96 + lines.length * lh + 54;
    const cx2 = (W - cw) / 2, cy2 = (H - chh) / 2 - H * 0.04;
    g.fillStyle = '#101624'; g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
    const r = 16;
    g.beginPath();
    g.moveTo(cx2 + r, cy2); g.arcTo(cx2 + cw, cy2, cx2 + cw, cy2 + chh, r);
    g.arcTo(cx2 + cw, cy2 + chh, cx2, cy2 + chh, r); g.arcTo(cx2, cy2 + chh, cx2, cy2, r);
    g.arcTo(cx2, cy2, cx2 + cw, cy2, r); g.closePath(); g.fill(); g.stroke();
    g.textAlign = 'center';
    g.font = '900 ' + Math.min(21, cw * 0.058) + 'px system-ui';
    g.fillStyle = '#ffd23f'; g.fillText(title, W / 2, cy2 + 36);
    g.font = '700 15px system-ui'; g.fillStyle = '#ffeccf';
    lines.forEach((ln, i) => g.fillText(ln, W / 2, cy2 + 68 + i * lh));
    // progress dots
    for (let d = 0; d < CARDS.length; d++) {
      g.fillStyle = d === this.tut ? '#ffd23f' : '#3a4562';
      g.beginPath(); g.arc(W / 2 - 27 + d * 18, cy2 + chh - 66, 4.5, 0, TAU); g.fill();
    }
    const last = this.tut === CARDS.length - 1;
    this.addButton(g, 'tutN', last ? "LET'S GO!" : 'NEXT ▶', cx2 + cw / 2 - 74, cy2 + chh - 52, 148, 40);
    if (!last) this.addButton(g, 'tutS', 'SKIP', cx2 + cw - 74, cy2 + chh + 12, 66, 32, false);
  }
  drawDecor(g, dc, px, py, Z) {
    const s = Z * 0.9 * dc.s;
    g.lineCap = 'round';
    // grounding shadow so props sit ON the boardwalk instead of floating
    const shW = { tent: 3.4, carousel: 3.4, popcorn: 2.3, cotton: 2.3, balloons: 0.9, lamp: 0.7 }[dc.kind] || 1.5;
    g.fillStyle = 'rgba(30,18,8,0.28)';
    g.beginPath(); g.ellipse(px, py + s * 0.35, s * shW, s * shW * 0.3, 0, 0, TAU); g.fill();
    if (dc.kind === 'tent') {
      // striped carnival tent
      g.fillStyle = '#c94a4a'; g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
      g.fillRect(px - s * 3, py - s * 2.2, s * 6, s * 2.2); g.strokeRect(px - s * 3, py - s * 2.2, s * 6, s * 2.2);
      g.beginPath(); g.moveTo(px - s * 3.6, py - s * 2.2); g.lineTo(px, py - s * 5.2); g.lineTo(px + s * 3.6, py - s * 2.2);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#f2ece2';
      for (let i = -1; i <= 1; i += 1) {
        g.beginPath(); g.moveTo(px + i * s * 1.6 - s * 0.5, py - s * 2.25);
        g.lineTo(px + i * s * 0.35, py - s * 4.6); g.lineTo(px + i * s * 1.6 + s * 0.5, py - s * 2.25);
        g.closePath(); g.fill();
      }
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.arc(px, py - s * 5.3, s * 0.45, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#3a2418'; g.fillRect(px - s * 0.8, py - s * 1.7, s * 1.6, s * 1.7);
    } else if (dc.kind === 'balloons') {
      g.strokeStyle = 'rgba(20,16,10,0.6)'; g.lineWidth = 1.5;
      const cols = ['#e04040', '#4d9de0', '#ffd23f'];
      for (let i = 0; i < 3; i++) {
        const bx2 = px + (i - 1) * s * 1.1, by2 = py - s * 3.4 - (i % 2) * s * 0.8 + Math.sin(this.tt * 1.5 + i) * s * 0.3;
        g.beginPath(); g.moveTo(px, py); g.lineTo(bx2, by2 + s * 0.9); g.stroke();
        g.fillStyle = cols[i];
        g.beginPath(); g.ellipse(bx2, by2, s * 0.8, s, 0, 0, TAU); g.fill(); g.stroke();
      }
    } else if (dc.kind === 'popcorn' || dc.kind === 'cotton') {
      // little snack stall
      const roofA = dc.kind === 'popcorn' ? '#e04040' : '#e08bd0';
      g.fillStyle = '#f2ece2'; g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
      g.fillRect(px - s * 2, py - s * 2.4, s * 4, s * 2.4); g.strokeRect(px - s * 2, py - s * 2.4, s * 4, s * 2.4);
      g.fillStyle = roofA;
      for (let i = 0; i < 4; i++) if (i % 2 === 0) g.fillRect(px - s * 2.3 + i * s * 1.15, py - s * 3.2, s * 1.15, s * 0.85);
      g.strokeRect(px - s * 2.3, py - s * 3.2, s * 4.6, s * 0.85);
      g.font = Math.round(s * 1.6) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(dc.kind === 'popcorn' ? '🍿' : '🍭', px, py - s * 1.2);
      g.textBaseline = 'alphabetic';
    } else if (dc.kind === 'carousel') {
      g.fillStyle = '#4d9de0'; g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(px, py, s * 3.2, s * 1.15, 0, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = '#ffd23f'; g.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = this.tt * 0.5 + i / 5 * TAU;
        const hx = px + Math.cos(a) * s * 2.3, hy = py + Math.sin(a) * s * 0.8;
        g.beginPath(); g.moveTo(hx, hy - s * 2.4); g.lineTo(hx, hy); g.stroke();
        g.font = Math.round(s * 1.2) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('🐴', hx, hy - s * 0.6); g.textBaseline = 'alphabetic';
      }
      g.fillStyle = '#e04040'; g.strokeStyle = '#14100a';
      g.beginPath(); g.moveTo(px - s * 3.4, py - s * 2.6); g.lineTo(px, py - s * 4.6); g.lineTo(px + s * 3.4, py - s * 2.6);
      g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = '#14100a'; g.beginPath(); g.moveTo(px, py - s * 4.6); g.lineTo(px, py); g.stroke();
    } else if (dc.kind === 'lamp') {
      g.strokeStyle = '#2c3646'; g.lineWidth = Math.max(2, s * 0.35);
      g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - s * 4.4); g.stroke();
      const glow = g.createRadialGradient(px, py - s * 4.8, 1, px, py - s * 4.8, s * 1.8);
      glow.addColorStop(0, 'rgba(255,236,180,0.9)'); glow.addColorStop(1, 'rgba(255,236,180,0)');
      g.fillStyle = glow;
      g.beginPath(); g.arc(px, py - s * 4.8, s * 1.8, 0, TAU); g.fill();
      g.fillStyle = '#ffeccf'; g.strokeStyle = '#14100a'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(px, py - s * 4.8, s * 0.55, 0, TAU); g.fill(); g.stroke();
    }
  }
  drawTile(g, n, px, py, Z) {
    const [col, icon] = NODE_STYLE[n.type];
    const isBranchOpt = this.state === 'branch' && this.branchOpts.includes(n.id);
    const cur = this.cur();
    const isHere = cur && cur.node === n.id && this.state !== 'splash';
    const tw = Z * (isBranchOpt ? 7.4 + Math.sin(this.tt * 6) * 0.3 : 6.6);
    const th = tw * 0.58, dpt = Z * 1.25, r = tw * 0.2;
    const rr2 = (x, y, w, h) => {
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r); g.closePath();
    };
    // ambient occlusion on the boardwalk
    g.fillStyle = 'rgba(30,18,8,0.3)';
    g.beginPath(); g.ellipse(px, py + dpt + th * 0.32, tw * 0.56, th * 0.42, 0, 0, TAU); g.fill();
    // extruded side: gradient so the block reads as candy-thick
    const sg = g.createLinearGradient(px, py + th / 2, px, py + th / 2 + dpt);
    sg.addColorStop(0, shadeCol(col, 0.62)); sg.addColorStop(1, shadeCol(col, 0.38));
    g.fillStyle = sg; g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
    rr2(px - tw / 2, py - th / 2 + dpt, tw, th); g.fill(); g.stroke();
    // top face: sunset-lit gradient
    const tg = g.createLinearGradient(px - tw / 2, py - th / 2, px + tw / 3, py + th / 2);
    tg.addColorStop(0, lightCol(col, 0.28)); tg.addColorStop(0.55, col); tg.addColorStop(1, shadeCol(col, 0.82));
    g.fillStyle = tg;
    g.strokeStyle = isBranchOpt ? '#ffd23f' : '#14100a'; g.lineWidth = isBranchOpt ? 4 : 3;
    rr2(px - tw / 2, py - th / 2, tw, th); g.fill(); g.stroke();
    // active-player halo pulse under the walker's tile
    if (isHere && !isBranchOpt) {
      g.globalAlpha = 0.35 + 0.2 * Math.sin(this.tt * 5);
      g.strokeStyle = '#fff'; g.lineWidth = 2.5;
      rr2(px - tw / 2 + 3, py - th / 2 + 3, tw - 6, th - 6); g.stroke();
      g.globalAlpha = 1;
    }
    // white icon plate — the Mario Party read
    const pw2 = tw * 0.52, ph2 = th * 0.66, pr = ph2 * 0.4;
    g.fillStyle = 'rgba(255,252,244,0.94)'; g.strokeStyle = shadeCol(col, 0.6); g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px - pw2 / 2 + pr, py - ph2 / 2);
    g.arcTo(px + pw2 / 2, py - ph2 / 2, px + pw2 / 2, py + ph2 / 2, pr);
    g.arcTo(px + pw2 / 2, py + ph2 / 2, px - pw2 / 2, py + ph2 / 2, pr);
    g.arcTo(px - pw2 / 2, py + ph2 / 2, px - pw2 / 2, py - ph2 / 2, pr);
    g.arcTo(px - pw2 / 2, py - ph2 / 2, px + pw2 / 2, py - ph2 / 2, pr); g.closePath();
    g.fill(); g.stroke();
    // icon
    g.fillStyle = icon === '+3' ? '#1d6fb8' : icon === '-3' ? '#b82424' : '#14100a';
    g.font = '900 ' + Math.round(Z * (icon.length > 1 ? 1.55 : 2)) + 'px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(icon, px, py + 1);
    g.textBaseline = 'alphabetic';
    // glossy specular sweep across the top edge
    g.globalAlpha = 0.22;
    g.fillStyle = '#fff';
    rr2(px - tw / 2 + 3, py - th / 2 + 2.5, tw - 6, th * 0.26); g.fill();
    g.globalAlpha = 1;
  }
  drawStanding(g, p, i, px, py, Z) {
    // shared tiles: fan the divers out a little
    const mates = this.players.filter(q => q.node === p.node);
    const k = mates.indexOf(p);
    const ox2 = mates.length > 1 ? (k - (mates.length - 1) / 2) * Z * 2.4 : 0;
    const active = this.playerIdx === i && this.state !== 'splash' && this.state !== 'end';
    const sc = Z * 0.105 * (active ? 1.18 : 1);
    const isMover = active && p === this.cur();
    // mid-hop: shadow shrinks under the airborne diver (goofy physics sells the jump)
    const hopping = isMover && this.state === 'stepping';
    const hopF = hopping ? Math.sin(Math.min(1, this.moveT / 0.34) * Math.PI) : 0;
    g.fillStyle = 'rgba(0,0,0,' + (0.4 - hopF * 0.22).toFixed(2) + ')';
    const shw = Z * 1.7 * (active ? 1.15 : 1) * (1 - hopF * 0.45);
    g.beginPath(); g.ellipse(px + ox2, py + Z * 0.4 + (hopping ? hopF * Z * 1.85 : 0), shw, shw * 0.32, 0, 0, TAU); g.fill();
    // landing squash-and-stretch
    const sq = isMover && this.squashT > 0 ? Math.sin((this.squashT / 0.2) * Math.PI) * 0.28 : 0;
    g.save();
    if (sq > 0) {
      g.translate(px + ox2, py + Z * 0.5);
      g.scale(1 + sq, 1 - sq * 0.8);
      g.translate(-(px + ox2), -(py + Z * 0.5));
    }
    drawDiverStand(g, {
      x: px + ox2, y: py - 28 * sc + Z * 0.2, scale: sc, color: p.color, skin: p.skin, ward: p.ward,
      t: this.tt + i * 1.7, cos: p.cosmetics,
      mood: this.state === 'reward' ? 'cheer' : 'idle',
    });
    g.restore();
    if (p.shield) {
      g.strokeStyle = '#59d9ff'; g.lineWidth = 2.5; g.globalAlpha = 0.8;
      g.beginPath(); g.arc(px + ox2, py - Z * 2.6, Z * 3.6, 0, TAU); g.stroke(); g.globalAlpha = 1;
    }
    if (active) {
      const bob2 = Math.sin(this.tt * 4) * Z * 0.25;
      g.fillStyle = p.color; g.strokeStyle = '#14100a'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px + ox2, py - Z * 7.4 + bob2); g.lineTo(px + ox2 - Z * 0.9, py - Z * 8.6 + bob2);
      g.lineTo(px + ox2 + Z * 0.9, py - Z * 8.6 + bob2); g.closePath(); g.fill(); g.stroke();
    }
    // name floats over non-active players — stacked when they share a tile
    if (!active && this.zoom > Math.min(this.ctx.dim.W, this.ctx.dim.H) / 44) {
      const ny2 = py - Z * 6.7 - k * Z * 1.4;
      g.font = '800 ' + Math.round(Z * 1.1) + 'px system-ui'; g.textAlign = 'center';
      g.fillStyle = 'rgba(10,8,4,0.7)'; g.fillText(p.name, px + ox2 + 1, ny2 + 1);
      g.fillStyle = p.color; g.fillText(p.name, px + ox2, ny2);
    }
  }
  drawChips(g, W, H) {
    // Mario-style player chips along the top — pushed below the phone's status bar
    const safeTop = (this.ctx.dim.safeTop || 0) + 8;
    const n = this.players.length, cw = Math.min(96, (W - 12) / n - 6), ch = 46;
    const ranked = [...this.players].sort((a, b) => this.score(b) - this.score(a));
    this.players.forEach((p, i) => {
      const x = 6 + i * (cw + 6), y = safeTop;
      const active = this.playerIdx === i && this.state !== 'splash';
      const r = 10;
      const chipPath = () => {
        g.beginPath();
        g.moveTo(x + r, y); g.arcTo(x + cw, y, x + cw, y + ch, r);
        g.arcTo(x + cw, y + ch, x, y + ch, r); g.arcTo(x, y + ch, x, y, r);
        g.arcTo(x, y, x + cw, y, r); g.closePath();
      };
      // drop shadow, gradient panel, glowing border for the active player
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.moveTo(x + r, y + 3); g.arcTo(x + cw, y + 3, x + cw, y + ch + 3, r);
      g.arcTo(x + cw, y + ch + 3, x, y + ch + 3, r); g.arcTo(x, y + ch + 3, x, y + 3, r);
      g.arcTo(x, y + 3, x + cw, y + 3, r); g.closePath(); g.fill();
      const pg2 = g.createLinearGradient(x, y, x, y + ch);
      if (active) { pg2.addColorStop(0, 'rgba(64,52,20,0.96)'); pg2.addColorStop(1, 'rgba(38,30,12,0.96)'); }
      else { pg2.addColorStop(0, 'rgba(28,36,58,0.88)'); pg2.addColorStop(1, 'rgba(12,16,30,0.88)'); }
      g.fillStyle = pg2;
      g.strokeStyle = active ? p.color : '#2a3450';
      g.lineWidth = active ? 2.5 + Math.sin(this.tt * 5) * 0.7 : 2.5;
      chipPath(); g.fill(); g.stroke();
      // mini avatar with their cosmetics
      drawDiverTop(g, { x: x + 15, y: y + ch / 2, r: 10, color: p.color, t: this.tt + i, speedNorm: 0, cos: p.cosmetics, ward: p.ward, skin: p.skin });
      g.textAlign = 'left'; g.font = '800 11px system-ui';
      g.fillStyle = '#ffd23f'; g.fillText('🪙' + p.coins, x + 29, y + 18);
      const cosVal = p.cosmetics.reduce((a, c) => a + cosmetic(c).value, 0);
      g.fillStyle = '#ffeccf'; g.fillText('⭐' + cosVal + (p.shield ? '🛡' : ''), x + 29, y + 32);
      g.fillStyle = '#93a0bd'; g.font = '700 9.5px system-ui';
      g.fillText(p.items.map(it => ITEMS[it].icon).join('') || '·', x + 29, y + 43);
      // rank badge
      const rank = ranked.indexOf(p);
      g.textAlign = 'right'; g.font = '900 11px system-ui';
      g.fillStyle = ['#ffd23f', '#c9d4dc', '#c9803a', '#93a0bd'][rank] || '#93a0bd';
      g.fillText(['1st', '2nd', '3rd', '4th'][rank] || (rank + 1) + 'th', x + cw - 5, y + 15);
    });
    g.textAlign = 'right'; g.font = '800 13px system-ui'; g.fillStyle = '#ffeccf';
    g.fillText('TURN ' + Math.min(this.turn, this.maxTurns) + '/' + this.maxTurns,
      W - 8, H - 10 - (this.ctx.dim.safeBottom || 0));
  }
  addButton(g, id, label, x, y, w, h, active) {
    this.buttons.push({ id, x, y, w, h });
    g.fillStyle = active === false ? '#3a3450' : '#ffd23f';
    g.strokeStyle = '#14100a'; g.lineWidth = 3;
    const r = 12;
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = active === false ? '#93a0bd' : '#14100a';
    g.font = '900 ' + Math.min(17, w * 0.11) + 'px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, x + w / 2, y + h / 2);
    g.textBaseline = 'alphabetic';
  }
  drawPhaseUI(g, W, H) {
    const p = this.cur(), mine = this.myTurn();
    const cy = H * 0.82 - (this.ctx.dim.safeBottom || 0);
    g.textAlign = 'center';
    // always-available map + zoom controls (any state, any player's turn)
    {
      const sy = (this.ctx.dim.safeTop || 0) + 62;
      this.addButton(g, 'mapAny', this.mapView ? '✕' : '🗺️', W - 52, sy, 42, 38, !this.mapView);
      g.font = '700 9px system-ui'; g.fillStyle = 'rgba(255,236,207,0.6)'; g.textAlign = 'center';
      g.fillText('pinch', W - 31, sy + 50);
      g.fillText('to zoom', W - 31, sy + 60);
      if ((this.userZoom || 1) !== 1) {
        g.font = '800 11px system-ui'; g.fillStyle = '#ffd23f';
        g.fillText(Math.round((this.userZoom || 1) * 100) + '%', W - 31, sy + 74);
      }
    }
    if (this.state === 'pickDest' && mine && !this.forcedRandom) {
      g.font = '900 17px system-ui'; g.fillStyle = '#ffd23f';
      g.fillText('🎲 ' + (this.destOptions ? this.destOptions.length : 0) + ' SPACES IN RANGE — tap one!', W / 2, cy);
      g.font = '700 12px system-ui'; g.fillStyle = '#93a0bd';
      g.fillText('any direction · pinch to see more of the board', W / 2, cy + 20);
    } else if (this.state === 'pickDest' && this.forcedRandom) {
      g.font = '900 17px system-ui'; g.fillStyle = '#ff5f5f';
      g.fillText('🍺 FATE IS CHOOSING…', W / 2, cy);
    } else if (this.state === 'pickDest') {
      g.font = '800 15px system-ui'; g.fillStyle = p.color;
      g.fillText(p.name + ' is picking a space…', W / 2, cy);
    }
    if (this.state === 'menu') {
      if (mine) {
        if (this.mapView) {
          this.addButton(g, 'map', '✕ CLOSE MAP', W / 2 - 85, cy - 30, 170, 44);
        } else {
          const hasItems = p.items.length > 0 && !p.pending;
          const bw = 108, gap = 8;
          const total = bw * (hasItems ? 3 : 2) + gap * (hasItems ? 2 : 1);
          let x = W / 2 - total / 2;
          this.addButton(g, 'roll', '🎲 ROLL', x, cy - 30, bw, 46); x += bw + gap;
          if (hasItems) { this.addButton(g, 'items', '🃏 ITEMS (' + p.items.length + ')', x, cy - 30, bw, 46); x += bw + gap; }
          this.addButton(g, 'map', '🗺️ MAP', x, cy - 30, bw, 46);
          if (p.pending) {
            g.font = '700 12px system-ui'; g.fillStyle = '#ffb84d';
            g.fillText(ITEMS[p.pending] ? ITEMS[p.pending].icon + ' ' + ITEMS[p.pending].name + ' armed!' : '', W / 2, cy - 40);
          }
        }
      } else { g.font = '800 15px system-ui'; g.fillStyle = p.color; g.fillText(p.name + ' is thinking…', W / 2, cy); }
    } else if (this.state === 'branch') {
      g.font = '900 17px system-ui'; g.fillStyle = '#ffd23f';
      g.fillText(mine ? '⑂ FORK! Pick a path' : p.name + ' picks a path…', W / 2, cy - 46);
      if (mine) {
        const me2 = this.cur();
        const [mx2] = this.proj(me2.ax, me2.ay);
        const opts = [...this.branchOpts].sort((a, b) => this.nodeXY(a)[0] - this.nodeXY(b)[0]);
        const bw = Math.min(150, W * 0.42);
        opts.forEach((nid, i) => {
          const [nx2] = this.nodeXY(nid);
          const dir = nx2 < mx2 ? '⬅' : '➡';
          // label with where you'd LAND, color-matched to the pin on the board
          const pv = (this.branchPreviews || []).find(q => q.opt === nid);
          const pi = this.branchPreviews ? this.branchPreviews.indexOf(pv) : i;
          const icon = pv ? (pv.unsure ? '⑂?' : NODE_STYLE[this.map[pv.land].type][1]) : NODE_STYLE[this.map[nid].type][1];
          const x = W / 2 - bw - 8 + i * (bw + 16);
          this.addButton(g, 'br' + nid, dir + '  land: ' + icon, x, cy - 30, bw, 44);
          g.fillStyle = PREV_COLS[pi % PREV_COLS.length];   // matching color chip
          g.strokeStyle = '#14100a'; g.lineWidth = 2;
          g.beginPath(); g.arc(x + 16, cy - 8, 7, 0, TAU); g.fill(); g.stroke();
        });
      }
    } else if (this.state === 'mgIntro') {
      g.font = '900 22px system-ui'; g.fillStyle = '#ffd23f';
      g.fillText('🎲 MINIGAME TIME!', W / 2, cy);
    } else if (this.state === 'reward' && this.rewardRows) {
      this.drawPodium(g, W, H);
    } else if (this.state === 'end') {
      g.font = '900 26px system-ui'; g.fillStyle = '#ffd23f';
      g.fillText('🏁 FINAL SCORES…', W / 2, H * 0.45);
    }
  }
  /* post-minigame PODIUM: a full-screen 2x2 — winner spotlit and jumping,
     losers shadowed and frowning, dead last sheds a single tear */
  drawPodium(g, W, H) {
    const rows = [...this.rewardRows].sort((a, b) => a.rank - b.rank);
    const safeTop = (this.ctx.dim.safeTop || 0);
    const gridY = safeTop + 60, gridH = H - gridY - 116 - (this.ctx.dim.safeBottom || 0);
    const cw = W / 2, chh = gridH / 2;
    g.fillStyle = 'rgba(8,9,18,0.94)'; g.fillRect(0, 0, W, H);
    g.font = '900 ' + Math.min(24, W * 0.055) + 'px system-ui'; g.textAlign = 'center';
    g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
    g.strokeText('🏆 MINIGAME RESULTS', W / 2, safeTop + 40);
    g.fillStyle = '#ffd23f'; g.fillText('🏆 MINIGAME RESULTS', W / 2, safeTop + 40);
    const lastRank = rows[rows.length - 1] && rows[rows.length - 1].rank;
    rows.slice(0, 4).forEach((r, i) => {
      const p2 = this.players.find(q => q.id === r.playerId);
      if (!p2) return;
      const cx2 = (i % 2) * cw + cw / 2;
      const cy2 = gridY + Math.floor(i / 2) * chh + chh / 2;
      const win = r.rank === 1, worst = r.rank === lastRank && rows.length > 1 && !win;
      // cell backdrop
      g.fillStyle = win ? 'rgba(52,42,14,0.9)' : 'rgba(16,20,34,0.9)';
      g.strokeStyle = win ? '#ffd23f' : '#2a3450'; g.lineWidth = win ? 3.5 : 2;
      const pad2 = 8;
      g.beginPath(); g.roundRect ? g.roundRect((i % 2) * cw + pad2, gridY + Math.floor(i / 2) * chh + pad2, cw - pad2 * 2, chh - pad2 * 2, 14)
        : g.rect((i % 2) * cw + pad2, gridY + Math.floor(i / 2) * chh + pad2, cw - pad2 * 2, chh - pad2 * 2);
      g.fill(); g.stroke();
      const sc2 = Math.min(cw, chh) / 78;
      if (win) {
        // spotlight cone + glow
        const lg2 = g.createRadialGradient(cx2, cy2 - chh * 0.1, 6, cx2, cy2, Math.min(cw, chh) * 0.62);
        lg2.addColorStop(0, 'rgba(255,236,160,0.5)'); lg2.addColorStop(1, 'rgba(255,236,160,0)');
        g.fillStyle = lg2;
        g.beginPath(); g.arc(cx2, cy2, Math.min(cw, chh) * 0.62, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,236,160,0.14)';
        g.beginPath(); g.moveTo(cx2 - cw * 0.34, gridY + Math.floor(i / 2) * chh + 10);
        g.lineTo(cx2 + cw * 0.34, gridY + Math.floor(i / 2) * chh + 10);
        g.lineTo(cx2 + cw * 0.2, cy2 + chh * 0.34); g.lineTo(cx2 - cw * 0.2, cy2 + chh * 0.34);
        g.closePath(); g.fill();
      }
      const jump = win ? -Math.abs(Math.sin(this.tt * 6)) * chh * 0.12 : 0;
      drawDiverStand(g, {
        x: cx2, y: cy2 - 10 * sc2 + jump, scale: sc2,
        color: p2.color, skin: p2.skin, ward: p2.ward, cos: p2.cosmetics,
        t: this.tt + i, mood: win ? 'cheer' : 'sad', tear: worst,
      });
      if (!win) {   // losers sit in shadow
        g.fillStyle = 'rgba(6,7,13,0.42)';
        g.fillRect((i % 2) * cw + pad2, gridY + Math.floor(i / 2) * chh + pad2, cw - pad2 * 2, chh - pad2 * 2);
      }
      // rank ribbon + name
      g.textAlign = 'center';
      g.font = '900 ' + Math.round(15 * Math.min(1.2, sc2)) + 'px system-ui';
      const medal = ['🥇', '🥈', '🥉', '4th'][r.rank - 1] || r.rank + 'th';
      g.fillStyle = win ? '#ffd23f' : '#93a0bd';
      g.fillText(medal + ' ' + p2.name, cx2, cy2 + chh * 0.36);
      g.fillStyle = win ? '#7dff6a' : '#ffeccf';
      g.fillText('+' + r.coins + ' 🪙', cx2, cy2 + chh * 0.36 + 20);
    });
    // scoreboard strip along the bottom
    const sy = gridY + gridH + 12;
    g.fillStyle = 'rgba(16,22,36,0.92)'; g.strokeStyle = '#2a3450'; g.lineWidth = 2;
    g.fillRect(W * 0.06, sy, W * 0.88, 88); g.strokeRect(W * 0.06, sy, W * 0.88, 88);
    g.font = '800 12px system-ui'; g.fillStyle = '#93a0bd';
    g.fillText('STANDINGS (coins + cosmetics)', W / 2, sy + 18);
    const ranked = [...this.players].sort((a, b) => this.score(b) - this.score(a));
    g.font = '800 13px system-ui';
    ranked.forEach((p2, i) => {
      g.fillStyle = p2.color;
      g.fillText((i + 1) + '. ' + p2.name + ' — ' + this.score(p2) + '★', W / 2, sy + 38 + i * 16);
    });
  }
  drawOverlay(g, W, H) {
    const o = this.overlay, p = this.cur(), mine = this.myTurn();
    const bw = Math.min(360, W * 0.88), bx = W / 2 - bw / 2, by = H * 0.2;
    if (o.kind === 'wheel') {
      const cx2 = W / 2, cy2 = H * 0.42, R = Math.min(W * 0.34, H * 0.2);
      g.fillStyle = 'rgba(6,7,13,0.82)'; g.fillRect(0, 0, W, H);
      g.font = '900 21px system-ui'; g.textAlign = 'center'; g.fillStyle = '#ffd23f';
      g.fillText('🎠 MERRY-GO-ROUND!', cx2, cy2 - R - 42);
      g.font = '700 13px system-ui'; g.fillStyle = '#ffeccf';
      g.fillText(o.picked == null ? (mine ? 'TAP to stop the wheel — that\'s the stake' : p.name + ' is spinning…')
        : 'EVERY rider antes ' + o.picked + '🪙 — winner takes it all!', cx2, cy2 - R - 20);
      // the wheel
      g.save(); g.translate(cx2, cy2); g.rotate(o.spin);
      BET_WHEEL.forEach((v, i) => {
        const a0 = i / BET_WHEEL.length * TAU, a1 = (i + 1) / BET_WHEEL.length * TAU;
        g.fillStyle = ['#e04040', '#4d9de0', '#3a9d5c', '#ffd23f', '#e08bd0', '#ffb84d'][i % 6];
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a1); g.closePath(); g.fill();
        g.strokeStyle = '#14100a'; g.lineWidth = 2.5; g.stroke();
        g.save(); g.rotate((a0 + a1) / 2); g.translate(R * 0.64, 0); g.rotate(Math.PI / 2);
        g.fillStyle = '#14100a'; g.font = '900 ' + Math.round(R * 0.22) + 'px system-ui';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(v + '', 0, 0); g.textBaseline = 'alphabetic';
        g.restore();
      });
      g.restore();
      g.fillStyle = '#f2ece2'; g.strokeStyle = '#14100a'; g.lineWidth = 3;
      g.beginPath(); g.arc(cx2, cy2, R * 0.17, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#ffd23f';                          // pointer
      g.beginPath(); g.moveTo(cx2, cy2 - R - 14); g.lineTo(cx2 - 12, cy2 - R + 8);
      g.lineTo(cx2 + 12, cy2 - R + 8); g.closePath(); g.fill(); g.stroke();
      if (o.picked != null) {
        g.font = '900 ' + Math.round(34) + 'px system-ui'; g.textAlign = 'center';
        g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
        g.strokeText(o.picked + ' 🪙 EACH!', cx2, cy2 + R + 52);
        g.fillStyle = '#7dff6a'; g.fillText(o.picked + ' 🪙 EACH!', cx2, cy2 + R + 52);
      }
      return;
    }
    if (o.kind === 'pickroll') {
      const bh = 150;
      g.fillStyle = 'rgba(10,8,16,0.92)'; g.fillRect(bx, by, bw, bh);
      g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.strokeRect(bx, by, bw, bh);
      g.font = '900 20px system-ui'; g.fillStyle = '#ffd23f'; g.textAlign = 'center';
      g.fillText('🎯 LOADED DICE — pick your roll', W / 2, by + 30);
      const cell = Math.min(52, (bw - 40) / 6);
      for (let v = 1; v <= 6; v++) {
        const x = W / 2 - cell * 3 + (v - 1) * cell + 3;
        this.addButton(g, 'pv' + v, '' + v, x, by + 54, cell - 6, 56);
      }
      return;
    }
    if (o.kind === 'items') {
      const bh = 84 + p.items.length * 58;
      g.fillStyle = 'rgba(10,8,16,0.92)'; g.fillRect(bx, by, bw, bh);
      g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.strokeRect(bx, by, bw, bh);
      g.font = '900 20px system-ui'; g.fillStyle = '#ffd23f'; g.textAlign = 'center';
      g.fillText('🃏 YOUR CARDS', W / 2, by + 28);
      let yy = by + 44;
      p.items.forEach((it, i) => {
        const def = ITEMS[it];
        this.addButton(g, 'use' + i, def.icon + ' USE', bx + 12, yy, 92, 34);
        g.textAlign = 'left'; g.font = '800 13px system-ui'; g.fillStyle = '#ffeccf';
        g.fillText(def.name, bx + 114, yy + 13);
        g.font = '700 10.5px system-ui'; g.fillStyle = '#93a0bd';
        this.wrap(g, def.desc, bx + 114, yy + 26, bw - 126, 12);
        yy += 58;
      });
      this.addButton(g, 'cancel', 'BACK', W / 2 - 60, by + bh - 42, 120, 34);
      return;
    }
    if (o.kind === 'shop') {
      const bh = H * 0.46;
      g.fillStyle = 'rgba(10,8,16,0.92)'; g.fillRect(bx, by, bw, bh);
      g.strokeStyle = '#a1e887'; g.lineWidth = 3; g.strokeRect(bx, by, bw, bh);
      g.font = '900 20px system-ui'; g.fillStyle = '#a1e887'; g.textAlign = 'center';
      g.fillText('🛒 BOARDWALK SHOP', W / 2, by + 30);
      g.font = '700 12px system-ui'; g.fillStyle = '#93a0bd';
      g.fillText(p.name + ' · ' + p.coins + '🪙 · ' + p.items.length + '/3 cards', W / 2, by + 48);
      let yy = by + 66;
      for (const k in ITEMS) {
        const it = ITEMS[k], can = p.coins >= it.cost && p.items.length < 3;
        if (mine) this.addButton(g, 'buy' + k, it.icon + ' ' + it.cost + '🪙', bx + 12, yy, 92, 34, can);
        g.textAlign = 'left'; g.font = '800 13px system-ui'; g.fillStyle = '#ffeccf';
        g.fillText(it.name, bx + 114, yy + 14);
        g.font = '700 10.5px system-ui'; g.fillStyle = '#93a0bd';
        this.wrap(g, it.desc, bx + 114, yy + 27, bw - 126, 12);
        yy += 58;
      }
      if (mine) this.addButton(g, 'close', o.passing ? 'KEEP MOVING ▶' : 'DONE ▶', W / 2 - 80, by + bh - 44, 160, 36);
      else { g.textAlign = 'center'; g.font = '800 13px system-ui'; g.fillStyle = p.color; g.fillText(p.name + ' is shopping…', W / 2, by + bh - 24); }
    } else if (o.kind === 'mascot') {
      const bh = H * 0.3;
      g.fillStyle = 'rgba(10,8,16,0.92)'; g.fillRect(bx, by, bw, bh);
      g.strokeStyle = '#ffb84d'; g.lineWidth = 3; g.strokeRect(bx, by, bw, bh);
      g.textAlign = 'center';
      g.font = Math.round(H * 0.06) + 'px serif';
      g.fillText('🎭', W / 2, by + H * 0.075);
      g.font = '900 17px system-ui'; g.fillStyle = '#ffb84d';
      g.fillText('THE MASCOT WANTS TO GAMBLE', W / 2, by + H * 0.115);
      g.font = '700 12.5px system-ui'; g.fillStyle = '#ffeccf';
      g.fillText('Bet 5🪙 — 50/50 for a fancy cosmetic…', W / 2, by + H * 0.15);
      g.fillText('…or get LAUNCHED 3 spaces back!', W / 2, by + H * 0.175);
      if (mine) {
        this.addButton(g, 'bet', '🎲 BET 5🪙', bx + 20, by + bh - 48, (bw - 56) / 2, 38);
        this.addButton(g, 'nobet', 'NO THANKS', bx + 36 + (bw - 56) / 2, by + bh - 48, (bw - 56) / 2, 38);
      } else { g.font = '800 13px system-ui'; g.fillStyle = p.color; g.fillText(p.name + ' is deciding…', W / 2, by + bh - 24); }
    } else if (o.kind === 'pinata') {
      g.textAlign = 'center';
      const shake = o.reveal ? 0 : Math.sin(o.t * 30) * 8;
      g.font = Math.round(H * 0.09) + 'px serif';
      g.fillText('🪅', W / 2 + shake, H * 0.35);
      if (o.reveal) {
        const c = cosmetic(o.reveal);
        g.font = Math.round(H * 0.07) + 'px serif';
        g.fillText(c.icon, W / 2, H * 0.45);
        g.font = '900 18px system-ui';
        g.fillStyle = c.tier === 'legendary' ? '#ffd23f' : c.tier === 'rare' ? '#e08bd0' : '#ffeccf';
        g.fillText(c.name + '  (+' + c.value + 'pts)', W / 2, H * 0.5);
      }
    }
  }
  wrap(g, txt, x, y, maxW, lh) {
    const words = txt.split(' ');
    let line = '', yy = y;
    for (const w of words) {
      if (g.measureText(line + ' ' + w).width > maxW) { g.fillText(line, x, yy); line = w; yy += lh; }
      else line += (line ? ' ' : '') + w;
    }
    if (line) g.fillText(line, x, yy);
  }
  dispose() {
    const cv = this.ctx.cv;
    cv.removeEventListener('pointerdown', this._pd);
    cv.removeEventListener('pointermove', this._pm);
    cv.removeEventListener('pointerup', this._pu);
    cv.removeEventListener('pointercancel', this._pu);
    cv.removeEventListener('wheel', this._wh);
  }
}

