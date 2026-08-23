// THE CHAOTIC BOARDWALK — the master board-game wrapper for the minigame roster.
// Node-graph map (35 nodes, loop + 2 forks), dice movement, coins/items/cosmetics,
// squash steals, shops, piñatas, mascot gambles — and a minigame every turn.
// FinalScore = coins + Σ cosmetic values. Turn-based → clean event sync online.
import { TAU, clamp, lerp, mulberry32 } from './util.js';
import { drawDiverTop, drawDiverStand } from './character.js?v=13';

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
  drunk: { name: 'Drunk Stumble', icon: '🍺', cost: 3, desc: 'Next turn: odd roll = forward, even roll = BACKWARD.' },
  shield: { name: 'Cardboard Shield', icon: '🛡️', cost: 6, desc: 'Passive: blocks the next steal or mascot launch.' },
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

/* ---------------- the 35-node boardwalk blueprint ---------------- */
function buildMap() {
  const nodes = [];
  const add = (id, type, x, y, next) => nodes[id] = { id, type, x, y, next };
  // main loop: 28 nodes on a rounded circuit (virtual space 100 x 62)
  const CX = 50, CY = 33, RX = 42, RY = 24;
  const mainType = i => ({
    0: 'start', 3: 'pinata', 5: 'fork', 8: 'shop', 12: 'mascot', 14: 'pinata', 17: 'fork', 21: 'shop', 25: 'red',
  })[i] || (i % 3 === 2 ? 'red' : 'blue');
  for (let i = 0; i < 28; i++) {
    const a = -HP + (i / 28) * TAU;
    add(i, mainType(i), CX + Math.cos(a) * RX, CY + Math.sin(a) * RY * 1.04, [(i + 1) % 28]);
  }
  // branch A: shortcut off node 5, rejoins at 10 (3 nodes, spicy)
  nodes[5].next = [6, 28];
  add(28, 'red', lerp(nodes[5].x, nodes[10].x, 0.3) - 6, lerp(nodes[5].y, nodes[10].y, 0.3) - 7, [29]);
  add(29, 'mascot', lerp(nodes[5].x, nodes[10].x, 0.55) - 7, lerp(nodes[5].y, nodes[10].y, 0.55) - 8, [30]);
  add(30, 'blue', lerp(nodes[5].x, nodes[10].x, 0.8) - 5, lerp(nodes[5].y, nodes[10].y, 0.8) - 6, [10]);
  // branch B: scenic detour off node 17, rejoins at 23 (4 nodes, piñata bait)
  nodes[17].next = [18, 31];
  add(31, 'blue', lerp(nodes[17].x, nodes[23].x, 0.22) + 7, lerp(nodes[17].y, nodes[23].y, 0.22) + 8, [32]);
  add(32, 'pinata', lerp(nodes[17].x, nodes[23].x, 0.45) + 9, lerp(nodes[17].y, nodes[23].y, 0.45) + 9, [33]);
  add(33, 'red', lerp(nodes[17].x, nodes[23].x, 0.68) + 8, lerp(nodes[17].y, nodes[23].y, 0.68) + 8, [34]);
  add(34, 'blue', lerp(nodes[17].x, nodes[23].x, 0.88) + 5, lerp(nodes[17].y, nodes[23].y, 0.88) + 6, [23]);
  // reverse edges for backward movement
  for (const n of nodes) n.prev = [];
  for (const n of nodes) for (const nx of n.next) nodes[nx].prev.push(n.id);
  return nodes;
}
const HP = Math.PI / 2;
const NODE_STYLE = {
  start: ['#ffd23f', '🏁'], blue: ['#4d9de0', '+3'], red: ['#e04040', '-3'], fork: ['#93a0bd', '⑂'],
  shop: ['#a1e887', '🛒'], pinata: ['#e08bd0', '🪅'], mascot: ['#ffb84d', '🎭'],
};

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
      id: p.id, name: p.name, color: p.color, local: p.local, slot: p.slot, bot: !!p.bot,
      node: 0, coins: 15, items: [], cosmetics: [], shield: false, pending: null,
      ax: this.map[0].x, ay: this.map[0].y,   // animated position
    }));
    this.state = 'splash'; this.stateT = 0;
    this.tt = 0; this.pops = []; this.banner = null; this.bannerT = 0;
    this.moveQ = []; this.moveT = 0; this.stepFrom = null; this.overlay = null;
    this.botT = 0; this.dice = null; this.paused = false;
    this.clicks = [];
    this._pd = e => { this.clicks.push([e.clientX, e.clientY]); };
    ctx.cv.addEventListener('pointerdown', this._pd);
    if (ctx.onNet) ctx.onNet((t, p) => { if (t === 'bd') this.applyAct(p, true); });
    this.isNetHost = !ctx.net || ctx.net.isHost;
    this.showBanner('🎪 THE CHAOTIC BOARDWALK 🎪', '#ffd23f', 2.2);
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

  /* -------- every mutation flows through act() so online mirrors cleanly -------- */
  act(a, d) {
    this.applyAct({ a, d }, false);
    if (this.ctx.net) this.ctx.net.send('bd', { a, d });
  }
  applyAct(msg, remote) {
    const { a, d } = msg;
    if (remote && this.authority() && a !== 'mg' && a !== 'rw' && a !== 'sync') return; // ignore echoes of my own authority
    switch (a) {
      case 'skipItem': this.enterRoll(); break;
      case 'playItem': this.doPlayItem(d.idx); break;
      case 'roll': this.doRoll(d.v, d.dir); break;
      case 'branch': this.doBranch(d.n); break;
      case 'buy': this.doBuy(d.item); break;
      case 'shopDone': this.closeShop(); break;
      case 'mascot': this.doMascot(d.bet, d.win); break;
      case 'steal': this.doSteal(d.victim, d.ci); break;
      case 'mg': if (remote) this.launchMg(d.gid, d.seed, true); break;
      case 'rw': if (remote) this.applyRewards(d.list, d.rows); break;
    }
  }

  /* ---------------- phase flow ---------------- */
  startTurnPlayer() {
    const p = this.cur();
    this.showBanner('TURN ' + this.turn + '/' + this.maxTurns + ' — ' + p.name, p.color, 1.4);
    this.state = 'item'; this.stateT = 0; this.botT = 1.2 + this.rng() * 0.8;
    if (!p.items.length || p.pending) { this.state = 'preroll'; }
  }
  enterRoll() { this.state = 'roll'; this.stateT = 0; this.botT = 0.9 + this.rng() * 0.8; this.dice = null; }
  doPlayItem(idx) {
    const p = this.cur();
    const it = p.items.splice(idx, 1)[0];
    if (it === 'shield') { p.shield = true; this.pop(p.name + ' raises a 🛡️ Cardboard Shield!'); }
    else { p.pending = it; this.pop(p.name + ' plays ' + ITEMS[it].icon + ' ' + ITEMS[it].name + '!'); }
    this.ctx.audio.sfx.pow();
    this.enterRoll();
  }
  doRoll(v, dir) {
    const p = this.cur();
    this.dice = { v, t: 0, settled: false };
    this.state = 'dicing'; this.stateT = 0;
    this.rollDir = dir;   // 1 forward, -1 backward (drunk stumble)
    this.ctx.audio.sfx.drop();
  }
  beginMove(steps, dir) {
    this.moveQ = []; this.moveDir = dir;
    this.state = 'move'; this.moveSteps = steps; this.moveT = 0;
    this.advanceStep();
  }
  advanceStep() {
    const p = this.cur();
    if (this.moveSteps <= 0) { this.landOn(); return; }
    const node = this.map[p.node];
    const opts = this.moveDir > 0 ? node.next : node.prev;
    if (this.moveDir > 0 && opts.length > 1) {
      // FORK: the mover chooses
      this.state = 'branch'; this.stateT = 0; this.branchOpts = opts; this.botT = 1 + this.rng();
      return;
    }
    const nxt = opts.length ? opts[Math.floor(this.rng() * opts.length)] : p.node;
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
      if (prev.length) p.node = prev[Math.floor(this.rng() * prev.length)];
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
      default: this.endPlayerTurn(0.8);
    }
  }
  // piñata resolution comes through act stream for sync
  applyPinata(cid) {
    const p = this.cur(), c = cosmetic(cid);
    p.cosmetics.push(cid);
    if (this.overlay && this.overlay.kind === 'pinata') this.overlay.reveal = cid;
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
      const ids = this.ctx.gameIds;
      const gid = ids[Math.floor(this.rng() * ids.length)];
      const seed = (this.ctx.seed ^ (this.turn * 7919)) >>> 0;
      this.pendingMg = { gid, seed };
      if (this.ctx.net) this.ctx.net.send('bd', { a: 'mg', d: { gid, seed } });
    }
  }
  launchMg(gid, seed, remote) { this.pendingMg = { gid, seed }; if (this.state !== 'mgIntro') { this.state = 'mgIntro'; this.stateT = 0; } }

  /* -------- the spec hook: minigame results → coins → next turn -------- */
  onMinigameComplete(resultsArray, gameId) {
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
      if (this.ctx.net) this.ctx.net.send('bd', { a: 'rw', d: { list, rows } });
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

  /* ---------------- update ---------------- */
  update(rdt) {
    this.tt += rdt; this.stateT += rdt; this.bannerT -= rdt;
    // Mario Party camera: locked to whoever's turn it is; splash shows the whole park
    const { W, H } = this.ctx.dim;
    const Zfit = Math.min(W / 112, (H * 0.72) / 70), Zgame = Math.min(W, H) / 26;
    const zoomT = this.state === 'splash' || this.state === 'end' ? Zfit : Zgame;
    if (this.zoom === undefined) { this.zoom = Zfit; this.camX = 50; this.camY = 33; }
    this.zoom += (zoomT - this.zoom) * Math.min(1, rdt * 2.2);
    const foc = this.state === 'splash' || this.state === 'end' ? { ax: 50, ay: 33 } : this.cur();
    this.camX += (foc.ax - this.camX) * Math.min(1, rdt * 4);
    this.camY += (foc.ay - this.camY) * Math.min(1, rdt * 4);
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    if (this.overlay) this.overlay.t += rdt;
    this.ctx.audio.setMusicIntensity(0.3 + (this.state === 'dicing' || this.state === 'stepping' ? 0.15 : 0));
    const p = this.cur ? this.cur() : null;
    const auth = this.authority();
    const clicks = this.clicks; // consumed per state below
    const inp = this.myTurn() ? this.ctx.input(p.slot, rdt) : { act: false };
    // overlays (shop/mascot/piñata) pause whatever else is happening — including
    // mid-movement shop stops — and must resolve before the walk continues
    if (this.overlay) { this.handleOverlay(rdt, p, auth, clicks); this.clicks.length = 0; return; }
    switch (this.state) {
      case 'splash': if (this.stateT > 2.2) this.startTurnPlayer(); break;
      case 'item': {
        if (p.bot && auth && (this.botT -= rdt) <= 0) {
          // bots: shield early, movement items when mid-pack
          const pick = p.items.findIndex(() => this.rng() < 0.5);
          if (pick >= 0) this.act('playItem', { idx: pick }); else this.act('skipItem', {});
          break;
        }
        if (this.myTurn()) {
          const hit = this.hitButton(clicks);
          if (hit != null) {
            if (hit.id === 'skip') this.act('skipItem', {});
            else if (hit.id.startsWith('item')) this.act('playItem', { idx: +hit.id.slice(4) });
          } else if (inp.act) this.act('skipItem', {});
        }
        break;
      }
      case 'preroll': if (this.stateT > 0.4) this.enterRoll(); break;
      case 'roll': {
        if (p.bot && auth && (this.botT -= rdt) <= 0) { this.rollNow(); break; }
        if (this.myTurn()) {
          const hit = this.hitButton(clicks);
          if ((hit && hit.id === 'roll') || inp.act) this.rollNow();
        }
        break;
      }
      case 'dicing': {
        this.dice.t += rdt;
        if (this.dice.t > 1.0 && !this.dice.settled) {
          this.dice.settled = true;
          const pnd = this.cur().pending;
          let steps = this.dice.v, dir = 1;
          if (pnd === 'tripped') { steps = 4; this.cur().pending = 'trippedLand'; this.pop('🤸 Flat 4!', '#ffb84d'); }
          else if (pnd === 'drunk') {
            dir = (this.dice.v % 2 === 1) ? 1 : -1; this.cur().pending = null;
            this.pop(dir > 0 ? '🍺 Odd — forward!' : '🍺 Even — BACKWARD!', dir > 0 ? '#7dff6a' : '#ff5f5f');
          }
          this.beginMove(steps, dir);
        }
        break;
      }
      case 'branch': {
        if (p.bot && auth && (this.botT -= rdt) <= 0) {
          this.act('branch', { n: this.branchOpts[Math.floor(this.rng() * this.branchOpts.length)] });
          break;
        }
        if (this.myTurn() && clicks.length) {
          for (const [cx2, cy2] of clicks) {
            for (const nid of this.branchOpts) {
              const [nx, ny] = this.nodeXY(nid);
              if (Math.hypot(cx2 - nx, cy2 - ny) < this.S * 5) { this.act('branch', { n: nid }); break; }
            }
          }
        }
        break;
      }
      case 'stepping': {
        this.moveT += rdt;
        const p2 = this.cur(), tn = this.map[p2.node];
        const f = Math.min(1, this.moveT / 0.34);
        p2.ax = lerp(this.stepFrom.x, tn.x, f);
        p2.ay = lerp(this.stepFrom.y, tn.y, f) - Math.sin(f * Math.PI) * 3;
        if (f >= 1) { p2.ax = tn.x; p2.ay = tn.y; this.afterStep(); }
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
        if (this.stateT > 3) {
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
    const v = 1 + Math.floor(this.rng() * 6);
    this.act('roll', { v });
  }
  handleOverlay(rdt, p, auth, clicks) {
    const o = this.overlay;
    if (o.kind === 'pinata') {
      if (auth && !o.dropped && o.t > 0.7) {
        o.dropped = true;
        const roll = this.rng();
        const pool = roll < 0.6 ? 'common' : roll < 0.92 ? 'rare' : 'legendary';
        const opts = COSMETICS.filter(c => c.tier === pool);
        const c = opts[Math.floor(this.rng() * opts.length)];
        this.act('pinata2', { c: c.id });
      }
      if (o.reveal && o.t > 2.2) { this.overlay = null; this.endPlayerTurn(0.4); }
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
        const wants = Object.keys(ITEMS).filter(k => p.coins >= ITEMS[k].cost && p.items.length < 3);
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
    // dusk sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a1a3e'); sky.addColorStop(0.4, '#8a3a5e'); sky.addColorStop(0.58, '#d4744a'); sky.addColorStop(0.72, '#3a2418'); sky.addColorStop(1, '#171019');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // sun + sea shimmer (slow parallax)
    const sunX = W * 0.72 - (this.camX - 50) * Z * 0.12;
    g.fillStyle = 'rgba(255,210,63,0.85)';
    g.beginPath(); g.arc(sunX, H * 0.34, Z * 2.2, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,210,120,0.22)'; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(sunX - Z * 5, H * (0.4 + i * 0.012)); g.lineTo(sunX + Z * 5, H * (0.4 + i * 0.012)); g.stroke(); }
    // ferris wheel — anchored in the world with depth parallax
    const fx2 = W / 2 + (-16 - this.camX) * Z * 0.4, fy2 = H * 0.28 - (this.camY - 33) * Z * 0.15, fr = Z * 4.6;
    g.strokeStyle = 'rgba(20,16,25,0.8)'; g.lineWidth = 3;
    g.beginPath(); g.arc(fx2, fy2, fr, 0, TAU); g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = this.tt * 0.15 + i / 8 * TAU;
      g.beginPath(); g.moveTo(fx2, fy2); g.lineTo(fx2 + Math.cos(a) * fr, fy2 + Math.sin(a) * fr); g.stroke();
      g.fillStyle = ['#e04040', '#4d9de0', '#ffd23f', '#3a9d5c'][i % 4];
      g.beginPath(); g.arc(fx2 + Math.cos(a) * fr, fy2 + Math.sin(a) * fr, Z * 0.35, 0, TAU); g.fill();
    }
    g.beginPath(); g.moveTo(fx2 - fr * 0.7, fy2 + fr * 1.4); g.lineTo(fx2, fy2); g.lineTo(fx2 + fr * 0.7, fy2 + fr * 1.4); g.stroke();
    // pier planks scrolling under the world
    g.strokeStyle = 'rgba(90,64,40,0.45)'; g.lineWidth = Math.max(1.5, Z * 0.12);
    const y0w = this.camY - 46, y1w = this.camY + 46;
    for (let wy = Math.floor(y0w / 3.2) * 3.2; wy < y1w; wy += 3.2) {
      const [, py2] = this.proj(0, wy);
      if (py2 < -10 || py2 > H + 10) continue;
      g.beginPath(); g.moveTo(0, py2); g.lineTo(W, py2); g.stroke();
    }
    // path planks between tiles
    g.lineCap = 'round';
    for (const n of this.map) for (const nx of n.next) {
      const m2 = this.map[nx];
      const [ax2, ay2] = this.proj(n.x, n.y), [bx2, by2] = this.proj(m2.x, m2.y);
      if (Math.max(ax2, bx2) < -80 || Math.min(ax2, bx2) > W + 80) continue;
      g.strokeStyle = '#4a3320'; g.lineWidth = Z * 1.7;
      g.beginPath(); g.moveTo(ax2, ay2 + Z * 0.5); g.lineTo(bx2, by2 + Z * 0.5); g.stroke();
      g.strokeStyle = '#6b4a2b'; g.lineWidth = Z * 1.3;
      g.beginPath(); g.moveTo(ax2, ay2); g.lineTo(bx2, by2); g.stroke();
    }
    // depth-sorted world: chunky tiles + standing divers
    const items = [];
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
      else this.drawStanding(g, it.p, it.i, it.px, it.py, Z);
    }
    // dice above the active player's head
    if ((this.state === 'roll' || this.state === 'dicing') && this.cur()) {
      const p = this.cur();
      const [px2, py2] = this.proj(p.ax, p.ay);
      const ds = Z * 2.2, dy2 = py2 - Z * 9 + Math.sin(this.tt * 3) * Z * 0.3;
      const shown = this.state === 'dicing' && this.dice
        ? (this.dice.settled ? this.dice.v : 1 + Math.floor(this.tt * 17 % 6))
        : 1 + Math.floor(this.tt * 5 % 6);
      g.save(); g.translate(px2, dy2);
      if (!(this.dice && this.dice.settled)) g.rotate(Math.sin(this.tt * 14) * 0.25);
      g.fillStyle = '#f2ece2'; g.strokeStyle = '#14100a'; g.lineWidth = 3;
      g.fillRect(-ds / 2, -ds / 2, ds, ds); g.strokeRect(-ds / 2, -ds / 2, ds, ds);
      g.fillStyle = '#14100a'; g.font = '900 ' + Math.round(ds * 0.62) + 'px system-ui';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(shown, 0, 1); g.textBaseline = 'alphabetic';
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
  }
  drawTile(g, n, px, py, Z) {
    const [col, icon] = NODE_STYLE[n.type];
    const isBranchOpt = this.state === 'branch' && this.branchOpts.includes(n.id);
    const tw = Z * (isBranchOpt ? 7.4 + Math.sin(this.tt * 6) * 0.3 : 6.6);
    const th = tw * 0.58, dpt = Z * 1.25, r = tw * 0.16;
    const rr2 = (x, y, w, h) => {
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r); g.closePath();
    };
    // extruded side
    g.fillStyle = shadeCol(col, 0.5);
    rr2(px - tw / 2, py - th / 2 + dpt, tw, th); g.fill();
    // top face
    g.fillStyle = col; g.strokeStyle = isBranchOpt ? '#ffd23f' : '#14100a'; g.lineWidth = isBranchOpt ? 4 : 3;
    rr2(px - tw / 2, py - th / 2, tw, th); g.fill(); g.stroke();
    // soft top sheen
    g.fillStyle = 'rgba(255,255,255,0.14)';
    rr2(px - tw / 2 + 3, py - th / 2 + 3, tw - 6, th * 0.34); g.fill();
    // icon
    g.fillStyle = '#14100a';
    g.font = '900 ' + Math.round(Z * (icon.length > 1 ? 1.7 : 2.2)) + 'px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(icon, px, py + 1);
    g.textBaseline = 'alphabetic';
  }
  drawStanding(g, p, i, px, py, Z) {
    // shared tiles: fan the divers out a little
    const mates = this.players.filter(q => q.node === p.node);
    const k = mates.indexOf(p);
    const ox2 = mates.length > 1 ? (k - (mates.length - 1) / 2) * Z * 2.4 : 0;
    const active = this.playerIdx === i && this.state !== 'splash' && this.state !== 'end';
    const sc = Z * 0.105 * (active ? 1.18 : 1);
    // ground shadow
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath(); g.ellipse(px + ox2, py + Z * 0.4, Z * 1.7 * (active ? 1.15 : 1), Z * 0.55, 0, 0, TAU); g.fill();
    drawDiverStand(g, {
      x: px + ox2, y: py - 28 * sc + Z * 0.2, scale: sc, color: p.color,
      t: this.tt + i * 1.7, cos: p.cosmetics,
      mood: this.state === 'reward' ? 'cheer' : 'idle',
    });
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
    // name floats over non-active players so you know who's who
    if (!active && this.zoom > Math.min(this.ctx.dim.W, this.ctx.dim.H) / 40) {
      g.font = '800 ' + Math.round(Z * 1.1) + 'px system-ui'; g.textAlign = 'center';
      g.fillStyle = 'rgba(10,8,4,0.7)'; g.fillText(p.name, px + ox2 + 1, py - Z * 6.6 + 1);
      g.fillStyle = p.color; g.fillText(p.name, px + ox2, py - Z * 6.7);
    }
  }
  drawChips(g, W, H) {
    // Mario-style player chips along the top: avatar + coins + star value + rank
    const n = this.players.length, cw = Math.min(96, (W - 12) / n - 6), ch = 46;
    const ranked = [...this.players].sort((a, b) => this.score(b) - this.score(a));
    this.players.forEach((p, i) => {
      const x = 6 + i * (cw + 6), y = 8;
      const active = this.playerIdx === i && this.state !== 'splash';
      g.fillStyle = active ? 'rgba(42,36,16,0.94)' : 'rgba(16,22,36,0.85)';
      g.strokeStyle = active ? p.color : '#2a3450'; g.lineWidth = 2.5;
      const r = 10;
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + cw, y, x + cw, y + ch, r);
      g.arcTo(x + cw, y + ch, x, y + ch, r); g.arcTo(x, y + ch, x, y, r);
      g.arcTo(x, y, x + cw, y, r); g.closePath(); g.fill(); g.stroke();
      // mini avatar with their cosmetics
      drawDiverTop(g, { x: x + 15, y: y + ch / 2, r: 10, color: p.color, t: this.tt + i, speedNorm: 0, cos: p.cosmetics });
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
    g.fillText('TURN ' + Math.min(this.turn, this.maxTurns) + '/' + this.maxTurns, W - 8, H - 10);
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
    const cy = H * 0.79;
    g.textAlign = 'center';
    if (this.state === 'item') {
      if (mine) {
        p.items.forEach((it, i) => this.addButton(g, 'item' + i, ITEMS[it].icon + ' ' + ITEMS[it].name, W / 2 - 150 + i * 105, cy - 26, 100, 34));
        this.addButton(g, 'skip', 'SKIP ▶', W / 2 + 170 - 60, cy - 26, 90, 34);
        g.font = '700 12px system-ui'; g.fillStyle = '#93a0bd';
        g.fillText('ITEM PHASE — play a card or skip', W / 2, cy - 34);
      } else { g.font = '800 15px system-ui'; g.fillStyle = p.color; g.fillText(p.name + ' is thinking…', W / 2, cy); }
    } else if (this.state === 'roll') {
      if (mine) this.addButton(g, 'roll', '🎲 ROLL', W / 2 - 70, cy - 30, 140, 44);
      else { g.font = '800 15px system-ui'; g.fillStyle = p.color; g.fillText(p.name + ' is rolling…', W / 2, cy); }
    } else if (this.state === 'branch') {
      g.font = '900 17px system-ui'; g.fillStyle = '#ffd23f';
      g.fillText(mine ? '⑂ FORK! Tap a glowing path' : p.name + ' picks a path…', W / 2, cy);
    } else if (this.state === 'mgIntro') {
      g.font = '900 22px system-ui'; g.fillStyle = '#ffd23f';
      g.fillText('🎲 MINIGAME TIME!', W / 2, cy);
    } else if (this.state === 'reward' && this.rewardRows) {
      g.fillStyle = 'rgba(10,8,16,0.85)'; g.fillRect(W * 0.1, H * 0.2, W * 0.8, H * 0.5);
      g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.strokeRect(W * 0.1, H * 0.2, W * 0.8, H * 0.5);
      g.font = '900 20px system-ui'; g.fillStyle = '#ffd23f';
      g.fillText('MINIGAME REWARDS', W / 2, H * 0.26);
      g.font = '800 16px system-ui';
      this.rewardRows.slice(0, 5).forEach((r, i) => {
        const p2 = this.players.find(q => q.id === r.playerId);
        if (!p2) return;
        g.fillStyle = p2.color;
        g.fillText((['🥇', '🥈', '🥉', '4.', '5.'][r.rank - 1] || '') + ' ' + p2.name + '  +' + r.coins + '🪙', W / 2, H * 0.32 + i * 26);
      });
    } else if (this.state === 'end') {
      g.font = '900 26px system-ui'; g.fillStyle = '#ffd23f';
      g.fillText('🏁 FINAL SCORES…', W / 2, H * 0.45);
    }
  }
  drawOverlay(g, W, H) {
    const o = this.overlay, p = this.cur(), mine = this.myTurn();
    const bw = Math.min(360, W * 0.88), bx = W / 2 - bw / 2, by = H * 0.2;
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
  dispose() { this.ctx.cv.removeEventListener('pointerdown', this._pd); }
}

/* route the late-added acts */
const _apply = Board.prototype.applyAct;
Board.prototype.applyAct = function (msg, remote) {
  if (msg.a === 'pinata2') { this.applyPinata(msg.d.c); return; }
  _apply.call(this, msg, remote);
};
