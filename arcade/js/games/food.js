// DINER DASH — 50s diner rush. Grab food from the counter, deliver to tables.
// Serve every item on a table's order to complete it. Most tables served in 75s wins.
// Solo: the clock drains — every serve adds time, RUSH orders add a lot. Keep up!
import { TAU, clamp, lerp, mulberry32 } from '../util.js';
import { drawDiverTop } from '../character.js?v=29';

const T_LIMIT = 75, SOLO_START = 40;
const ACC = 330, DRAG = 3.1, VMAX = 118, PRr = 4.4;   // virtual stage 100 x 100
const MENU = [['burger', '🍔'], ['fries', '🍟'], ['shake', '🥤'], ['dog', '🌭']];
// stations live in the four CORNERS (deliberate dead-ends — no drive-by pickups);
// tables cluster mid-floor with wide aisles between them
const TABLES = [[50, 30], [26, 55], [74, 55], [50, 80], [50, 55]];
const STATIONS = [[12, 14], [88, 14], [12, 90], [88, 90]];
const TRASH = [8, 52];

export default {
  id: 'food', name: 'Diner Dash', icon: '🍔',
  desc: '50s diner rush. Grab orders, serve tables, fast.',
  howto: {
    goal: 'Tables order food — walk to the counter to GRAB an item, walk to the table to SERVE it. Complete every item on an order to serve the table. Most tables served in 75s wins. Solo: the clock drains — each serve buys time, gold RUSH orders buy a lot!',
    touch: 'Tilt / drag to scoot around the diner',
    keys: 'P1: WASD · P2: arrow keys',
    tip: 'You carry ONE item — touching a counter swaps it. Wrong item in hand? Dump it in the TRASH can on the left wall (the red-striped one).',
  },
  create(ctx) { return new FoodGame(ctx); }
};

function botTimeline(seed, skill) {
  const rng = mulberry32(seed);
  const evs = []; let t = 6 + rng() * 3;
  while (t < T_LIMIT) { evs.push({ t }); t += 6.2 + rng() * 4.5 - skill * 2.4; }
  return evs;
}
const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

class FoodGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.practice = !!ctx.practice;
    this.online = !!ctx.net && !this.practice;
    this.solo = ctx.players.length === 1 && !this.practice;
    const locals = ctx.players.filter(p => p.local && !p.bot);
    this.queue = this.practice ? [locals[0]] : [...locals];
    this.remotes = this.online ? ctx.players.filter(p => !p.local && !p.bot) : [];
    this.remoteLive = {};
    this.results = [];
    this.bots = (this.practice ? [] : ctx.players.filter(p => p.bot)).map(b => {
      const bh = hashSeed(b.id);
      return { p: b, evs: botTimeline((ctx.seed ^ bh) >>> 0, 0.3 + (bh % 100) / 200), n: 0, i: 0 };
    });
    if (ctx.onNet) ctx.onNet((t, p) => { if (t === 'g' && p.k === 'sc') this.remoteLive[p.id] = p; });
    this.pops = [];
    this.state = 'ready'; this.stateT = 0; this.tt = 0;
    this.nextRunner();
    if (this.practice) this.startRun();
  }
  nextRunner() {
    this.runner = this.queue.shift() || null;
    if (!this.runner) { this.state = 'wait'; this.stateT = 0; return; }
    this.state = 'ready'; this.stateT = 0;
  }
  startRun() {
    this.rng = mulberry32(this.ctx.seed);
    this.px = 50; this.py = 88; this.vx = 0; this.vy = 0;
    this.carry = null; this.served = 0; this.runT = 0;
    this.clock = this.solo ? SOLO_START : T_LIMIT;
    this.orders = [];               // {ti (table idx), items:[menuIdx], got:[bool], rush}
    this.orderAcc = 2.5;            // first order lands fast
    for (const b of this.bots) { b.n = 0; b.i = 0; }
    this.state = 'run'; this.stateT = 0;
  }
  pop(txt, x, y, col, size) { this.pops.push({ txt, x, y, t: 0, dur: 0.9, col: col || '#ffd23f', size: size || 18 }); }
  freeTables() { return TABLES.map((_, i) => i).filter(i => !this.orders.some(o => o.ti === i)); }
  newOrder() {
    const free = this.freeTables();
    if (!free.length) return;
    const ti = free[Math.floor(this.rng() * free.length)];
    // orders get bigger the longer the run goes — the solo difficulty ramp
    const t = this.runT, roll = this.rng();
    const p1 = clamp(0.45 - t / 150, 0, 0.45), p3 = clamp((t - 60) / 120, 0, 0.75);
    const n = roll < p3 ? 3 : roll < p3 + p1 ? 1 : 2;
    const items = [];
    for (let i = 0; i < n; i++) items.push(Math.floor(this.rng() * MENU.length));
    const rush = this.solo && this.rng() < 0.22;
    this.orders.push({ ti, items, got: items.map(() => false), rush });
    this.ctx.audio.sfx.ui();
  }
  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    if (this.state === 'ready') {
      const inp = this.ctx.input(this.runner.slot, rdt);
      if ((inp.act || (this.online && this.stateT > 3)) && this.stateT > 0.5) this.startRun();
      return;
    }
    if (this.state === 'wait') {
      let allDone = true;
      for (const r of this.remotes) { const s = this.remoteLive[r.id]; if (!s || !s.done) allDone = false; }
      if (!this.online || allDone || this.stateT > 12) {
        for (const r of this.remotes) {
          const s = this.remoteLive[r.id];
          this.results.push({ id: r.id, score: s ? s.n : 0, label: (s ? s.n : 0) + ' tables', name: r.name, color: r.color });
        }
        for (const bt of this.bots)
          this.results.push({ id: bt.p.id, score: bt.n, label: bt.n + ' tables', name: bt.p.name, color: bt.p.color });
        this.ctx.end(this.results);
      }
      return;
    }
    // ---- run ----
    this.runT += rdt;
    // solo: the clock drains faster the longer you survive — nobody outruns the rush forever
    if (!this.practice) this.clock -= rdt * (this.solo ? 1 + Math.max(0, this.runT - 45) / 90 : 1);
    // orders trickle in; keep 2-3 active
    this.orderAcc += rdt;
    const want = this.orders.length < 2 ? 2.5 : 5.5;
    if (this.orderAcc > want && this.orders.length < 3) { this.orderAcc = 0; this.newOrder(); }
    // movement
    const inp = this.ctx.input(this.runner.slot, rdt);
    this.vx += inp.x * ACC * rdt; this.vy += inp.y * ACC * rdt;
    const dr = Math.exp(-DRAG * rdt); this.vx *= dr; this.vy *= dr;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > VMAX) { this.vx *= VMAX / sp; this.vy *= VMAX / sp; }
    this.px = clamp(this.px + this.vx * rdt, PRr, 100 - PRr);
    this.py = clamp(this.py + this.vy * rdt, PRr + 8, 100 - PRr);   // sign strip up top
    this.grabCd = (this.grabCd || 0) - rdt;
    // bounce off tables (solid)
    for (const [tx, ty] of TABLES) {
      const dx = this.px - tx, dy = this.py - ty, d = Math.hypot(dx, dy), min = PRr + 7.2;
      if (d < min && d > 0.01) {
        this.px = tx + dx / d * min; this.py = ty + dy / d * min;
        const vr = (this.vx * dx + this.vy * dy) / d;
        if (vr < 0) { this.vx -= vr * dx / d * 1.4; this.vy -= vr * dy / d * 1.4; }
      }
    }
    // stations: grab / swap (short cooldown so brushing a corner can't swap your hands)
    if (this.grabCd <= 0) for (let si = 0; si < STATIONS.length; si++) {
      const [sx2, sy2] = STATIONS[si];
      if (Math.hypot(this.px - sx2, this.py - sy2) < PRr + 6.5) {
        if (this.carry !== si) {
          this.carry = si; this.grabCd = 0.7;
          this.ctx.audio.sfx.grab();
          this.pop(MENU[si][1], sx2, sy2 - 9, '#ffeccf', 22);
        }
      }
    }
    // trash — tighter radius than before (accidental dumps felt random), loud feedback
    this.trashFx = Math.max(0, (this.trashFx || 0) - rdt * 2);
    if (this.carry !== null && Math.hypot(this.px - TRASH[0], this.py - TRASH[1]) < PRr + 2) {
      this.pop('🗑️ TRASHED ' + MENU[this.carry][1] + '!', TRASH[0] + 14, TRASH[1] - 8, '#ff5f5f', 22);
      this.carry = null; this.trashFx = 1;
      this.ctx.audio.sfx.wall();
    }
    // deliver
    if (this.carry !== null) {
      for (const o of this.orders) {
        const [tx, ty] = TABLES[o.ti];
        if (Math.hypot(this.px - tx, this.py - ty) < PRr + 8.6) {
          const need = o.items.findIndex((it, i) => it === this.carry && !o.got[i]);
          if (need >= 0) {
            o.got[need] = true; this.carry = null;
            this.ctx.audio.sfx.coin(4);
            if (o.got.every(v => v)) {
              this.served++;
              this.orders.splice(this.orders.indexOf(o), 1);
              const bonus = o.rush ? 7 : 3;
              if (this.solo) { this.clock = Math.min(70, this.clock + bonus); this.pop('SERVED! +' + bonus + 's', tx, ty - 12, o.rush ? '#ffd23f' : '#7dff6a', 22); }
              else this.pop('SERVED!', tx, ty - 12, '#7dff6a', 22);
              this.ctx.audio.sfx.pow();
            } else this.pop('✓', tx, ty - 10, '#7dff6a', 20);
          }
          break;
        }
      }
    }
    for (const bt of this.bots)
      while (bt.i < bt.evs.length && bt.evs[bt.i].t <= this.runT) { bt.n++; bt.i++; }
    this.ctx.audio.setMusicIntensity(0.4 + Math.min(0.4, this.served * 0.04) + (this.solo && this.clock < 10 ? 0.2 : 0));
    if (this.online) {
      this._nAcc = (this._nAcc || 0) + rdt;
      if (this._nAcc > 0.5) { this._nAcc = 0; this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.served, done: false }); }
    }
    if (!this.practice && this.clock <= 0) {
      this.results.push({
        id: this.runner.id, score: this.served,
        label: this.solo ? this.served + ' tables · ' + Math.round(this.runT) + 's' : this.served + ' tables',
        name: this.runner.name, color: this.runner.color,
      });
      if (this.online) this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.served, done: true });
      this.nextRunner();
    }
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    // stage mapping (keep square-ish, centered)
    const S = Math.min(W / 100, H / 108);
    const ox = (W - S * 100) / 2, oy = (H - S * 100) / 2 + S * 4;
    const mx = v => ox + v * S, my = v => oy + v * S;
    // 50s diner: checkerboard floor everywhere
    g.fillStyle = '#141116'; g.fillRect(0, 0, W, H);
    const tile = S * 8.4;
    for (let r = 0; r < Math.ceil(H / tile) + 1; r++) for (let c = 0; c < Math.ceil(W / tile) + 1; c++) {
      g.fillStyle = (r + c) % 2 ? '#e8e2d8' : '#c73a4a';
      g.fillRect(c * tile, r * tile, tile, tile);
    }
    g.fillStyle = 'rgba(20,17,22,0.3)'; g.fillRect(0, 0, W, H);
    // neon sign strip
    g.fillStyle = 'rgba(20,17,22,0.85)'; g.fillRect(0, 0, W, my(9));
    g.font = '900 ' + Math.round(S * 6.5) + 'px "Segoe UI",system-ui';
    g.textAlign = 'center';
    g.fillStyle = '#3ad0e0';
    g.fillText('✦ FOOD FLASH DINER ✦', W / 2, my(6));
    // corner kitchen stations: chrome pads you enter on purpose
    for (let si = 0; si < STATIONS.length; si++) {
      const [sx2, sy2] = STATIONS[si];
      const cg = g.createRadialGradient(mx(sx2), my(sy2), 2, mx(sx2), my(sy2), S * 9);
      cg.addColorStop(0, '#e8ecf0'); cg.addColorStop(1, '#9aa6b2');
      g.fillStyle = cg; g.strokeStyle = '#14100a'; g.lineWidth = 3;
      g.beginPath(); g.arc(mx(sx2), my(sy2), S * 8, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = '#c73a4a'; g.lineWidth = 2;
      g.beginPath(); g.arc(mx(sx2), my(sy2), S * 6.4, 0, TAU); g.stroke();
      g.font = Math.round(S * 7.5) + 'px serif'; g.textBaseline = 'middle'; g.fillStyle = '#000';
      g.fillText(MENU[si][1], mx(sx2), my(sy2) + 1);
      g.textBaseline = 'alphabetic';
    }
    // trash — unmissable: red-striped can + TRASH label + pulsing danger ring while carrying
    const tX = mx(TRASH[0]), tY = my(TRASH[1]);
    if (this.carry !== null) {   // show the exact dump zone BEFORE you wander into it
      const pulse = 0.5 + 0.5 * Math.sin(this.tt * 6);
      g.strokeStyle = 'rgba(255,70,60,' + (0.4 + 0.4 * pulse).toFixed(2) + ')';
      g.lineWidth = 2.5; g.setLineDash([S * 1.6, S * 1.3]);
      g.beginPath(); g.arc(tX, tY, S * (PRr + 2), 0, TAU); g.stroke();
      g.setLineDash([]);
    }
    const flash = this.trashFx || 0;
    g.fillStyle = flash > 0 ? '#a33a30' : '#6e2f28'; g.strokeStyle = '#14100a'; g.lineWidth = 3;
    g.beginPath(); g.arc(tX, tY, S * 5.5 * (1 + flash * 0.15), 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = '#ffd23f'; g.lineWidth = S * 0.9;   // hazard stripes
    for (const a of [-0.6, 0.2, 1.0]) {
      g.beginPath(); g.arc(tX, tY, S * 4.2, a, a + 0.55); g.stroke();
    }
    g.font = Math.round(S * 6) + 'px serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText('🗑️', tX, tY + 1);
    g.textBaseline = 'alphabetic';
    g.font = '900 ' + Math.round(S * 3.4) + 'px system-ui';
    g.lineWidth = 3; g.strokeStyle = 'rgba(10,8,4,0.9)';
    g.strokeText('TRASH', tX, tY + S * 8.6);
    g.fillStyle = '#ff5f5f'; g.fillText('TRASH', tX, tY + S * 8.6);
    // tables + orders
    for (let ti = 0; ti < TABLES.length; ti++) {
      const [tx, ty] = TABLES[ti];
      g.fillStyle = '#c73a4a'; g.strokeStyle = '#14100a'; g.lineWidth = 3.5;
      g.beginPath(); g.arc(mx(tx), my(ty), S * 7.2, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#f2ece2';
      g.beginPath(); g.arc(mx(tx), my(ty), S * 5.2, 0, TAU); g.fill();
      const o = this.orders && this.orders.find(q => q.ti === ti);
      if (o) {
        // order bubble
        const bw = S * (7 + o.items.length * 7), bh = S * 10;
        const bx = mx(tx) - bw / 2, by = my(ty) - S * 16.5;
        g.fillStyle = o.rush ? '#ffd23f' : '#ffffff';
        g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(bx + 6, by); g.arcTo(bx + bw, by, bx + bw, by + bh, 6);
        g.arcTo(bx + bw, by + bh, bx, by + bh, 6); g.arcTo(bx, by + bh, bx, by, 6);
        g.arcTo(bx, by, bx + bw, by, 6); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(mx(tx) - S * 2, by + bh); g.lineTo(mx(tx), by + bh + S * 2.5); g.lineTo(mx(tx) + S * 2, by + bh); g.closePath();
        g.fillStyle = o.rush ? '#ffd23f' : '#ffffff'; g.fill();
        g.font = Math.round(S * 6.4) + 'px serif'; g.textBaseline = 'middle';
        o.items.forEach((it, i) => {
          const ix = bx + S * 7 * (i + 0.5) + S * 3.5 * 0;
          g.globalAlpha = o.got[i] ? 0.32 : 1;
          g.fillText(MENU[it][1], bx + S * (3.5 + i * 7) + S * 3.5, by + bh / 2);
          if (o.got[i]) {
            g.globalAlpha = 1; g.fillStyle = '#3a9d5c'; g.font = '900 ' + Math.round(S * 5) + 'px system-ui';
            g.fillText('✓', bx + S * (3.5 + i * 7) + S * 3.5, by + bh / 2);
            g.font = Math.round(S * 6.4) + 'px serif'; g.fillStyle = '#000';
          }
        });
        g.globalAlpha = 1; g.textBaseline = 'alphabetic';
        if (o.rush) {
          g.font = '900 ' + Math.round(S * 3.6) + 'px system-ui';
          g.fillStyle = '#a8523a'; g.fillText('RUSH!', mx(tx), by - S * 1.2);
        }
      }
    }
    // screens overlay
    if (this.state === 'ready' || this.state === 'wait') {
      g.fillStyle = 'rgba(6,7,13,0.6)'; g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      if (this.state === 'ready' && this.runner) {
        g.fillStyle = this.runner.color; g.font = '900 34px system-ui';
        g.fillText(this.runner.name, W / 2, H * 0.4);
        g.fillStyle = '#ffeccf'; g.font = '800 20px system-ui';
        g.fillText('GET READY — tap / SPACE', W / 2, H * 0.4 + 40);
        if (this.results.length) {
          g.font = '700 15px system-ui'; g.fillStyle = '#93a0bd';
          g.fillText('so far: ' + this.results.map(r => r.name + ' ' + r.score).join(' · '), W / 2, H * 0.4 + 80);
        }
      } else if (this.state === 'wait') {
        g.fillStyle = '#ffeccf'; g.font = '800 22px system-ui';
        g.fillText(this.online ? 'waiting for the other cooks…' : 'tallying…', W / 2, H * 0.45);
      }
      return;
    }
    // player: the diver in a paper server hat
    const px2 = mx(this.px), py2 = my(this.py), pr2 = S * PRr * 1.15;
    const spd = Math.hypot(this.vx, this.vy) / VMAX;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(px2, py2 + pr2 * 0.8, pr2 * 0.9, pr2 * 0.4, 0, 0, TAU); g.fill();
    drawDiverTop(g, {
      x: px2, y: py2, r: pr2, color: this.runner.color, t: this.tt, cos: this.runner.cosmetics, ward: this.runner.ward, skin: this.runner.skin,
      vx: this.vx, vy: this.vy, speedNorm: spd,
      rot: clamp(this.vx / VMAX, -1, 1) * 0.18, hat: 'paper',
    });
    // carried item floats above head
    if (this.carry !== null) {
      g.font = Math.round(S * 7.5) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(MENU[this.carry][1], px2, py2 - pr2 * 2.1 + Math.sin(this.tt * 5) * 2);
      g.textBaseline = 'alphabetic';
    }
    // HUD
    g.textAlign = 'left'; g.font = '800 18px system-ui'; g.fillStyle = '#ffeccf';
    g.fillText('🍽️ ' + this.served, 14, 30);
    g.textAlign = 'center'; g.font = '900 26px system-ui';
    if (this.practice) { g.fillStyle = '#3ad0e0'; g.fillText('PRACTICE', W / 2, my(14)); }
    else {
      const low = this.clock < 8;
      g.fillStyle = low ? '#ff5f5f' : '#14100a';
      g.fillText(Math.ceil(this.clock) + '', W / 2, my(14));
    }
    if (!this.solo && !this.practice) {
      g.textAlign = 'right'; g.font = '700 13px system-ui';
      let yy = 30;
      for (const bt of this.bots) { g.fillStyle = bt.p.color; g.fillText(bt.p.name + ' ' + bt.n, W - 14, yy); yy += 17; }
      for (const r of this.remotes) { const sc = this.remoteLive[r.id]; g.fillStyle = r.color; g.fillText(r.name + ' ' + (sc ? sc.n : 0), W - 14, yy); yy += 17; }
    }
    g.textAlign = 'center';
    for (const p of this.pops) {
      const f = 1 - p.t / p.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + p.size + 'px system-ui';
      g.lineWidth = 4; g.strokeStyle = 'rgba(10,8,4,0.85)';
      g.strokeText(p.txt, mx(p.x), my(p.y) - p.t * 40);
      g.fillStyle = p.col; g.fillText(p.txt, mx(p.x), my(p.y) - p.t * 40);
    }
    g.globalAlpha = 1;
  }
  dispose() { }
}
