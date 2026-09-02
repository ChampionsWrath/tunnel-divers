// RING TOSS — the boardwalk booth, and the ONLY place the Giant Novelty
// Glasses ever come from (see the 🎯 space in board.js). Two timed taps per
// ring: sweep the AIM marker across the lane, then stop the POWER scale to set
// how far down the lane it flies. The harder you throw the further you reach —
// and the wider your throw scatters, so the 5-point golden bottle at the back
// is a real gamble. Six rings each, highest total takes the prize.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';
import { drawDiverBack, skinTone } from '../character.js?v=42';

const RINGS = 6;             // throws per player
const TIME_CAP = 95;         // hard stop so nobody stalls the board
// bottle rows: [depth 0=near .. 1=far, points, count]
const ROWS = [[0.20, 1, 5], [0.45, 2, 4], [0.70, 3, 3]];
const GOLD = { d: 0.92, pts: 5 };
// how far a throw scatters — long throws are less accurate, which is the whole
// tension of the power scale
const scatter = pw => 0.012 + pw * pw * 0.085;

export default {
  id: 'ringtoss', name: 'Ring Toss', icon: '🎯',
  desc: 'Two taps a throw: aim, then the power scale. Land rings on bottles.',
  howto: {
    goal: 'Six rings each. TAP once to lock your AIM as the marker sweeps across, then TAP again to stop the POWER SCALE — power is how far down the lane the ring flies. Back bottles pay more (1 · 2 · 3 pts, gold = 5) but a hard throw scatters wider. Highest total wins!',
    touch: 'TAP to lock AIM · TAP again to stop the POWER scale',
    keys: 'SPACE / CLICK to lock AIM, again for POWER',
    tip: 'A ringed bottle is spent — going deep is the only way to a big score, but half power is where the rings actually land.',
  },
  create(ctx) { return new RingTossGame(ctx); }
};

const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

class RingTossGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.practice = !!ctx.practice;
    this.online = !!ctx.net && !this.practice;
    this.host = !this.online || ctx.net.isHost;
    this.rng = mulberry32(ctx.seed);
    const src = this.practice ? ctx.players.map(p => (p.local ? p : { ...p, bot: true })) : ctx.players;
    this.ps = src.map((p, i) => {
      const bh = hashSeed(p.id);
      return {
        id: p.id, name: p.name, color: p.color, skin: p.skin, ward: p.ward, cos: p.cosmetics,
        local: p.local, slot: p.slot, bot: !!p.bot, isFill: !!p.isFill,
        score: 0, left: RINGS, done: false, lane: i,
        skill: 0.55 + (bh % 100) / 260,     // bots: 0.55 .. 0.93 timing accuracy
        // each player throws at their OWN rack, so nobody steals your bottles
        bottles: this.buildRack(),
        phase: 'aim', meter: 0, dir: 1, aim: 0.5, power: 0,
        ring: null, popT: 0, popTxt: '',
      };
    });
    this.me = this.ps.find(p => p.local && !p.bot) || null;
    this.tt = 0; this.runT = 0;
    this.pops = []; this.shake = 0;
    this.state = 'run'; this.stateT = 0;
    this.ended = false;
    this.netAcc = 0;
    if (ctx.onNet) ctx.onNet((t, p) => this.onNet(t, p));
    this._pd = () => this.tap(this.me);
    ctx.cv.addEventListener('pointerdown', this._pd);
    this.pop('🎯 SIX RINGS EACH!', '#ffd23f', 28);
  }
  buildRack() {
    const b = [];
    for (const [d, pts, n] of ROWS)
      for (let i = 0; i < n; i++) b.push({ x: (i + 0.5) / n, d, pts, ringed: false });
    b.push({ x: 0.5, d: GOLD.d, pts: GOLD.pts, ringed: false, gold: true });
    return b;
  }
  pop(txt, col, size) { this.pops.push({ txt, col: col || '#ffeccf', t: 0, dur: 1.1, size: size || 20 }); }
  alive() { return this.ps.filter(p => !p.done); }
  // the meter sweeps faster as the round goes on — late rings are tenser
  sweep() { return 1.15 + Math.min(0.85, this.runT * 0.012); }

  onNet(t, p) {
    if (t !== 'g') return;
    if (p.k === 'sc') {
      const q = this.ps.find(z => z.id === p.id);
      if (q && !(q.local && !q.bot)) { q.score = p.n; q.left = p.l; q.done = !!p.d; }
    } else if (p.k === 'res') {
      if (this.ended) return;
      this.ended = true; this.state = 'done';
      this.ctx.end(p.rows);
    }
  }

  /* one tap = one decision: lock the aim, then stop the power scale */
  tap(p) {
    if (!p || p.done || p.ring || this.state !== 'run') return;
    if (p.phase === 'aim') {
      p.aim = p.meter; p.phase = 'power'; p.meter = 0; p.dir = 1;
      if (p === this.me) this.ctx.audio.sfx.ui();
    } else if (p.phase === 'power') {
      p.power = p.meter;
      this.throwRing(p);
    }
  }
  throwRing(p) {
    const sc = scatter(p.power);
    // the scatter is symmetric and seeded per throw, so replays match
    const jx = (this.rng() - 0.5) * 2 * sc, jd = (this.rng() - 0.5) * 2 * sc * 0.8;
    p.ring = {
      t: 0, dur: 0.52,
      fromX: 0.5, toX: clamp(p.aim + jx, 0.02, 0.98),
      toD: clamp(p.power * 0.98 + jd, 0, 1.02),
    };
    p.phase = 'fly';
    if (p === this.me) this.ctx.audio.sfx.whoosh ? this.ctx.audio.sfx.whoosh() : this.ctx.audio.sfx.ui();
  }
  landRing(p) {
    const r = p.ring;
    let best = null, bestD = 9;
    for (const b of p.bottles) {
      if (b.ringed) continue;
      const dd = Math.hypot((b.x - r.toX) * 1.15, (b.d - r.toD) * 1.9);
      if (dd < bestD) { bestD = dd; best = b; }
    }
    const hit = best && bestD < 0.085;
    if (hit) {
      best.ringed = true;
      p.score += best.pts;
      p.popTxt = '+' + best.pts; p.popT = 0.9;
      if (p === this.me) {
        this.ctx.audio.sfx.coin(Math.min(12, best.pts * 3));
        if (best.gold) { this.ctx.audio.sfx.pow(); this.pop('🏅 GOLDEN BOTTLE! +5', '#ffd23f', 26); }
      }
    } else {
      p.popTxt = 'miss'; p.popT = 0.7;
      if (p === this.me) this.ctx.audio.sfx.wall();
    }
    p.ring = null; p.left--;
    p.phase = 'aim'; p.meter = 0; p.dir = 1;
    if (p.left <= 0) {
      p.done = true;
      if (p === this.me) this.pop('🎯 ' + p.name + ' finished on ' + p.score, p.color, 22);
    }
    // a rack picked clean early still deserves the remaining rings — refill it
    if (p.bottles.every(b => b.ringed)) p.bottles = this.buildRack();
  }

  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
    this.shake *= Math.exp(-6 * rdt);
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    if (this.state === 'done') return;
    this.runT += rdt;
    const sw = this.sweep();
    for (const p of this.ps) {
      if (p.popT > 0) p.popT -= rdt;
      if (p.done) continue;
      if (p.ring) {                                   // ring in flight
        p.ring.t += rdt;
        if (p.ring.t >= p.ring.dur) this.landRing(p);
        continue;
      }
      // the meter ping-pongs; aim sweeps across, power climbs and falls
      p.meter += p.dir * rdt * sw * (p.phase === 'power' ? 1.25 : 1);
      if (p.meter > 1) { p.meter = 1; p.dir = -1; }
      if (p.meter < 0) { p.meter = 0; p.dir = 1; }
      if (p.bot) {                                    // bots aim at a chosen bottle
        if (!p.target || p.target.ringed) {
          const open = p.bottles.filter(b => !b.ringed);
          // greedier bots reach for the back rows
          open.sort((a, b) => (b.pts - a.pts) * (p.skill > 0.75 ? 1 : -1));
          p.target = open[Math.min(open.length - 1, Math.floor(this.rng() * 2))] || open[0];
        }
        const want = p.phase === 'aim' ? p.target.x : p.target.d;
        const tol = 0.10 * (1.15 - p.skill);
        if (Math.abs(p.meter - want) < tol) this.tap(p);
      }
    }
    // my input: taps arrive through the canvas listener, keys through the stick
    if (this.me && !this.me.done) {
      const inp = this.ctx.input(this.me.slot, rdt);
      if (inp.act) this.tap(this.me);
    }
    if (this.online) {
      this.netAcc += rdt;
      if (this.netAcc > 0.4) {
        this.netAcc = 0;
        const m = this.ps.find(q => q.local && !q.bot);
        if (m) this.ctx.net.send('g', { k: 'sc', id: m.id, n: m.score, l: m.left, d: m.done });
      }
    }
    // finish: everyone out of rings, or the clock
    const over = this.ps.every(p => p.done) || this.runT > TIME_CAP;
    if (over && !this.ended) {
      if (this.host) {
        this.ended = true; this.state = 'done';
        const rows = [...this.ps].sort((a, b) => b.score - a.score)
          .map((p, i) => ({ playerId: p.id, rank: i + 1, score: p.score }));
        if (this.online) this.ctx.net.send('g', { k: 'res', rows });
        this.ctx.end(rows);
      } else if (this.runT > TIME_CAP + 4) {          // host went quiet — settle locally
        this.ended = true; this.state = 'done';
        this.ctx.end([...this.ps].sort((a, b) => b.score - a.score)
          .map((p, i) => ({ playerId: p.id, rank: i + 1, score: p.score })));
      }
    }
  }

  /* ---------------- render ---------------- */
  // lane geometry: d = 0 at the counter (bottom), 1 at the back wall (top)
  laneBox(W, H) {
    const top = H * 0.215, bot = H * 0.66;
    return { top, bot, cx: W / 2, wNear: W * 0.86, wFar: W * 0.34 };
  }
  px(L, x, d) { return L.cx + (x - 0.5) * lerp(L.wNear, L.wFar, d); }
  py(L, d) { return lerp(L.bot, L.top, d); }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim, S = Math.min(W, H) / 420;
    const L = this.laneBox(W, H);
    g.save();
    if (this.shake > 0.2) g.translate((this.rng() - 0.5) * this.shake, (this.rng() - 0.5) * this.shake);
    // ---- night booth ----
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1a1030'); sky.addColorStop(0.45, '#3a1c3e'); sky.addColorStop(1, '#160e1c');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // striped awning
    const awH = Math.max(34, H * 0.062);
    for (let i = 0; i * 34 < W + 34; i++) {
      g.fillStyle = i % 2 ? '#e8e2d4' : '#c0392b';
      g.beginPath(); g.moveTo(i * 34, 0); g.lineTo(i * 34 + 34, 0);
      g.lineTo(i * 34 + 34, awH - 10); g.lineTo(i * 34 + 17, awH); g.lineTo(i * 34, awH - 10);
      g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, awH - 5, W, 6);
    // string bulbs under the awning
    for (let i = 0; i * 40 < W; i++) {
      const bx2 = i * 40 + 20, on = 0.55 + 0.45 * Math.sin(this.tt * 3 + i);
      g.fillStyle = 'rgba(255,214,120,' + on.toFixed(2) + ')';
      g.beginPath(); g.arc(bx2, awH + 7, 3.4, 0, TAU); g.fill();
    }
    // back wall + the felt lane running away from the counter
    g.fillStyle = '#241634'; g.fillRect(0, awH, W, L.top - awH);
    // the prize hanging on the back wall — what everyone is actually throwing for
    const pbY = (awH + L.top) / 2, pbW = Math.min(W * 0.5, 250), pbH = Math.min(72, (L.top - awH) * 0.62);
    g.fillStyle = 'rgba(10,8,22,0.75)';
    g.strokeStyle = '#ffd23f'; g.lineWidth = 2.5;
    g.beginPath();
    g.roundRect ? g.roundRect(W / 2 - pbW / 2, pbY - pbH / 2, pbW, pbH, 10)
      : g.rect(W / 2 - pbW / 2, pbY - pbH / 2, pbW, pbH);
    g.fill(); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = Math.round(pbH * 0.42) + 'px serif';
    g.fillText('👓', W / 2 - pbW * 0.29, pbY + Math.sin(this.tt * 2) * 2);
    g.font = '900 ' + Math.round(Math.min(15, pbW * 0.075)) + 'px system-ui';
    g.fillStyle = '#ffd23f'; g.fillText('GRAND PRIZE', W / 2 + pbW * 0.1, pbY - pbH * 0.16);
    g.font = '700 ' + Math.round(Math.min(11, pbW * 0.056)) + 'px system-ui';
    g.fillStyle = '#ffeccf'; g.fillText('Giant Novelty Glasses', W / 2 + pbW * 0.1, pbY + pbH * 0.18);
    g.textBaseline = 'alphabetic';
    const felt = g.createLinearGradient(0, L.top, 0, L.bot);
    felt.addColorStop(0, '#1d5a3a'); felt.addColorStop(1, '#2f8a54');
    g.fillStyle = felt;
    g.beginPath();
    g.moveTo(this.px(L, 0, 1), L.top); g.lineTo(this.px(L, 1, 1), L.top);
    g.lineTo(this.px(L, 1, 0), L.bot); g.lineTo(this.px(L, 0, 0), L.bot);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2;
    for (const [d] of ROWS) {                       // row guides
      g.beginPath(); g.moveTo(this.px(L, 0, d), this.py(L, d));
      g.lineTo(this.px(L, 1, d), this.py(L, d)); g.stroke();
    }
    // ---- the rack: bottles receding up the lane ----
    const mine = this.me || this.ps[0];
    if (mine) for (const b of [...mine.bottles].sort((a, b2) => a.d - b2.d)) {
      const bx2 = this.px(L, b.x, b.d), by2 = this.py(L, b.d);
      const s = S * lerp(1.15, 0.62, b.d);
      // shadow
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.ellipse(bx2, by2 + 2 * s, 9 * s, 3.2 * s, 0, 0, TAU); g.fill();
      // body
      const body = b.gold ? '#e8b53a' : b.pts === 3 ? '#8ad6ff' : b.pts === 2 ? '#a8e06a' : '#d9e2ea';
      g.fillStyle = b.ringed ? 'rgba(90,100,110,0.6)' : body;
      g.strokeStyle = '#14100a'; g.lineWidth = 1.8 * s;
      g.beginPath();
      g.moveTo(bx2 - 7 * s, by2);
      g.lineTo(bx2 - 7 * s, by2 - 14 * s);
      g.quadraticCurveTo(bx2 - 6.5 * s, by2 - 20 * s, bx2 - 2.6 * s, by2 - 23 * s);
      g.lineTo(bx2 - 2.6 * s, by2 - 30 * s);
      g.lineTo(bx2 + 2.6 * s, by2 - 30 * s);
      g.lineTo(bx2 + 2.6 * s, by2 - 23 * s);
      g.quadraticCurveTo(bx2 + 6.5 * s, by2 - 20 * s, bx2 + 7 * s, by2 - 14 * s);
      g.lineTo(bx2 + 7 * s, by2); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(bx2 - 4.6 * s, by2 - 18 * s, 2 * s, 12 * s);
      // point value on the shoulder
      g.fillStyle = b.ringed ? '#5d666f' : '#14100a';
      g.font = '900 ' + Math.round(8 * s) + 'px system-ui';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(b.pts, bx2, by2 - 8 * s);
      g.textBaseline = 'alphabetic';
      if (b.ringed) {                               // the ring you already landed
        g.strokeStyle = '#ffd23f'; g.lineWidth = 3 * s;
        g.beginPath(); g.ellipse(bx2, by2 - 22 * s, 8 * s, 3 * s, 0, 0, TAU); g.stroke();
      }
    }
    // ---- your ring in flight ----
    if (mine && mine.ring) {
      const r = mine.ring, f = clamp(r.t / r.dur, 0, 1);
      const rx = lerp(this.px(L, r.fromX, 0), this.px(L, r.toX, r.toD), f);
      const ry = lerp(L.bot + 26 * S, this.py(L, r.toD) - 22 * S, f) - Math.sin(f * Math.PI) * H * 0.16;
      const rs = S * lerp(1.2, 0.7, f);
      g.strokeStyle = '#ffd23f'; g.lineWidth = 3.4 * rs;
      g.beginPath(); g.ellipse(rx, ry, 10 * rs, 4.4 * rs, 0, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.2 * rs;
      g.beginPath(); g.ellipse(rx, ry, 10 * rs, 4.4 * rs, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    }
    // ---- the counter and your thrower, seen from behind ----
    const cy = L.bot + 4;
    g.fillStyle = '#5b3a22'; g.fillRect(0, cy, W, H - cy);
    g.fillStyle = '#754c2c'; g.fillRect(0, cy, W, 14);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, cy + 14); g.lineTo(W, cy + 14); g.stroke();
    if (mine) {
      const wind = mine.phase === 'fly' ? 1 : 0;
      drawDiverBack(g, {
        x: W / 2, y: cy + 76 * S, scale: 1.95 * S, color: mine.color, skin: mine.skin,
        t: this.tt, crouch: mine.phase === 'power' ? 0.35 : wind ? 0 : 0.12,
      });
    }
    // ---- HUD: the two scales ----
    if (this.me && !this.me.done && this.state === 'run') {
      const p = this.me;
      // AIM: a marker sweeping across the lane, drawn ON the felt where it means something
      if (p.phase === 'aim' || p.phase === 'power') {
        const ax = this.px(L, p.phase === 'aim' ? p.meter : p.aim, 0.5);
        g.strokeStyle = p.phase === 'aim' ? '#ffd23f' : 'rgba(255,210,63,0.45)';
        g.lineWidth = 2.5; g.setLineDash([6, 6]);
        g.beginPath(); g.moveTo(this.px(L, p.phase === 'aim' ? p.meter : p.aim, 0), L.bot);
        g.lineTo(ax, L.top); g.stroke(); g.setLineDash([]);
        g.fillStyle = p.phase === 'aim' ? '#ffd23f' : 'rgba(255,210,63,0.5)';
        const mx = this.px(L, p.phase === 'aim' ? p.meter : p.aim, 0);
        g.beginPath(); g.moveTo(mx, L.bot + 8); g.lineTo(mx - 8, L.bot + 22); g.lineTo(mx + 8, L.bot + 22);
        g.closePath(); g.fill();
      }
      // POWER SCALE: a bar up the side, with the reach it buys marked on the lane
      const barX = W - 42, barY = L.top, barH = L.bot - L.top;
      g.fillStyle = 'rgba(10,8,18,0.7)'; g.fillRect(barX, barY, 26, barH);
      g.strokeStyle = '#14100a'; g.lineWidth = 3; g.strokeRect(barX, barY, 26, barH);
      for (const [d, pts] of [...ROWS, [GOLD.d, GOLD.pts]]) {   // which rung each row sits at
        const yy = barY + barH * (1 - d);
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(barX, yy); g.lineTo(barX + 26, yy); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '800 9px system-ui'; g.textAlign = 'right';
        g.fillText(pts + 'pt', barX - 4, yy + 3);
      }
      const lvl = p.phase === 'power' ? p.meter : p.power;
      const pg = g.createLinearGradient(0, barY + barH, 0, barY);
      pg.addColorStop(0, '#7dff6a'); pg.addColorStop(0.55, '#ffd23f'); pg.addColorStop(1, '#ff5f5f');
      g.fillStyle = pg;
      g.fillRect(barX + 3, barY + barH * (1 - lvl), 20, barH * lvl);
      if (p.phase === 'power') {
        // where that power reaches, and how wide it might scatter
        const d = clamp(p.meter * 0.98, 0, 1), sc = scatter(p.meter);
        const ly = this.py(L, d);
        g.strokeStyle = 'rgba(255,95,95,0.85)'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(this.px(L, clamp(p.aim - sc, 0, 1), d), ly);
        g.lineTo(this.px(L, clamp(p.aim + sc, 0, 1), d), ly); g.stroke();
        g.fillStyle = 'rgba(255,95,95,0.16)';
        g.beginPath();
        g.moveTo(this.px(L, p.aim, 0), L.bot);
        g.lineTo(this.px(L, clamp(p.aim - sc, 0, 1), d), ly);
        g.lineTo(this.px(L, clamp(p.aim + sc, 0, 1), d), ly);
        g.closePath(); g.fill();
      }
      g.textAlign = 'center';
      g.font = '900 ' + Math.round(15 * Math.min(1.4, S)) + 'px system-ui';
      g.fillStyle = '#ffeccf';
      g.fillText(p.phase === 'aim' ? 'TAP TO LOCK AIM' : p.phase === 'power' ? 'TAP TO STOP THE POWER' : '…',
        W / 2, H - 16 - (this.ctx.dim.safeBottom || 0));
    }
    // ---- scoreboard (below the awning, never behind it) ----
    const sbY = Math.max(awH + 16, (this.ctx.dim.safeTop || 0) + 16);
    g.textAlign = 'left'; g.font = '800 13px system-ui';
    this.ps.forEach((p, i) => {
      const yy = sbY + i * 17;
      g.fillStyle = 'rgba(10,8,18,0.75)'; g.fillRect(6, yy - 11, 132, 15);
      g.fillStyle = p.done ? 'rgba(150,160,180,0.85)' : p.color;
      g.fillText(p.name + '  ' + p.score + 'pt' + (p.done ? '  ✓' : '  ·  ' + p.left + '◯'), 10, yy);
    });
    g.textAlign = 'right'; g.font = '800 12px system-ui'; g.fillStyle = '#ffd23f';
    g.fillText('👓 WINNER TAKES THE GLASSES', W - 10, sbY);
    // floating +points by the thrower
    if (mine && mine.popT > 0) {
      g.textAlign = 'center';
      g.globalAlpha = clamp(mine.popT * 1.6, 0, 1);
      g.font = '900 ' + Math.round(26 * S) + 'px system-ui';
      g.fillStyle = mine.popTxt === 'miss' ? '#ff8a8a' : '#7dff6a';
      g.fillText(mine.popTxt, W / 2, L.bot - 10 - (0.9 - mine.popT) * 40);
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
    g.restore();
  }
  dispose() { this.ctx.cv.removeEventListener('pointerdown', this._pd); }
}
