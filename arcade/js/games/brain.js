// BIG BRAIN — mental-math answer pads. Steer onto the pad with the right answer;
// correct = instant next question. Multiplayer: simple math, most correct in 75s.
// Solo: difficulty (and points) scale as you answer; 3 strikes and you're out.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';

const T_LIMIT = 75, Q_TIME = 10;
const ACC = 330, DRAG = 3.1, VMAX = 118, PRr = 4.6;   // virtual stage units (100 x 62)
const PADCOL = ['#4d9de0', '#e04040', '#3a9d5c', '#9d5cd0'];

export default {
  id: 'brain', name: 'Big Brain', icon: '🧠',
  desc: 'Mental math. Steer to the right answer. Fast.',
  howto: {
    goal: 'A question appears — steer onto the pad with the CORRECT answer. Right answer = next question instantly. Most correct in 75s wins. (Solo: questions get harder as you go, 3 strikes and you\'re out.)',
    touch: 'Tilt / drag to glide between the answer pads',
    keys: 'P1: WASD · P2: arrow keys',
    tip: 'Wrong pads stun you for a beat — commit when you\'re sure, momentum carries you.',
  },
  create(ctx) { return new BrainGame(ctx); }
};

/* ---------- question generator (seeded; same list for everyone) ---------- */
function genQ(rng, level) {
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  let q, ans;
  const L = clamp(level, 1, 8);
  if (L === 1) { const a = ri(2, 9), b = ri(2, 9); if (rng() < 0.5) { q = a + ' + ' + b; ans = a + b; } else { const hi = Math.max(a, b), lo = Math.min(a, b); q = hi + ' − ' + lo; ans = hi - lo; } }
  else if (L === 2) { const a = ri(11, 49), b = ri(11, 49); if (rng() < 0.5) { q = a + ' + ' + b; ans = a + b; } else { const hi = Math.max(a, b), lo = Math.min(a, b); q = hi + ' − ' + lo; ans = hi - lo; } }
  else if (L === 3) { const a = ri(3, 9), b = ri(3, 9); q = a + ' × ' + b; ans = a * b; }
  else if (L === 4) { const b = ri(3, 9), c = ri(3, 9); const a = b * c; q = a + ' ÷ ' + b; ans = c; }
  else if (L === 5) { const a = ri(12, 29), b = ri(3, 9); q = a + ' × ' + b; ans = a * b; }
  else if (L === 6) { const a = ri(2, 9), b = ri(2, 9), c = ri(2, 9); q = a + ' + ' + b + ' × ' + c; ans = a + b * c; }
  else if (L === 7) { const p = [10, 20, 25, 50][ri(0, 3)], n = ri(2, 20) * (p === 25 ? 4 : p === 50 ? 2 : 10); q = p + '% of ' + n; ans = n * p / 100; }
  else { const a = ri(11, 19); q = a + '²'; ans = a * a; }
  // distractors: near-misses that look plausible
  const set = new Set([ans]);
  const near = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10, ans + 5, ans - 5,
    Math.round(ans * 1.1), Math.round(ans * 0.9), ans + 20, ans - 20];
  const opts = [ans];
  let gi = 0;
  while (opts.length < 4) {
    let v = near[gi % near.length] + (gi >= near.length ? ri(-9, 9) : 0);
    gi++;
    if (v === undefined) v = ans + ri(1, 9);
    if (v < 0 || set.has(v)) continue;
    set.add(v); opts.push(v);
  }
  // shuffle placement
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { q, ans, opts };
}

/* one player's board run */
class Board {
  constructor(seed, solo) {
    this.rng = mulberry32(seed);
    this.solo = solo;
    this.level = 1; this.correct = 0; this.wrong = 0; this.score = 0;
    this.px = 50; this.py = 44; this.vx = 0; this.vy = 0;
    this.qT = 0; this.armT = 0.5; this.stunT = 0; this.flash = 0; this.flashCol = '';
    this.out = false; this.streak = 0;
    this.next();
  }
  next() {
    const lvl = this.solo ? Math.min(8, 1 + Math.floor(this.correct / 2)) : [1, 1, 2, 2, 3][Math.floor(this.rng() * 5)];
    this.level = lvl;
    this.cur = genQ(this.rng, lvl);
    this.qT = 0; this.armT = 0.45;
    this.mustExit = true;   // stand clear of all pads before answers re-arm
  }
  pads() {  // 4 pads in the corners of the 100x62 stage
    return [[20, 18], [80, 18], [20, 50], [80, 50]].map((p, i) => ({ x: p[0], y: p[1], v: this.cur.opts[i], col: PADCOL[i] }));
  }
  step(dt, inp, sfx) {
    if (this.out) return;
    this.qT += dt; this.armT -= dt; this.stunT -= dt; this.flash -= dt;
    if (this.stunT <= 0) {
      this.vx += inp.x * ACC * dt; this.vy += inp.y * ACC * dt;
    }
    const dr = Math.exp(-DRAG * dt); this.vx *= dr; this.vy *= dr;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > VMAX) { this.vx *= VMAX / sp; this.vy *= VMAX / sp; }
    this.px = clamp(this.px + this.vx * dt, PRr, 100 - PRr);
    this.py = clamp(this.py + this.vy * dt, PRr, 62 - PRr);
    if (this.px <= PRr || this.px >= 100 - PRr) this.vx *= -0.4;
    if (this.py <= PRr || this.py >= 62 - PRr) this.vy *= -0.4;
    // pad contact — only once the player has stepped clear since the last answer
    if (this.armT <= 0 && this.stunT <= 0) {
      let onPad = null;
      for (const pad of this.pads())
        if (Math.hypot(this.px - pad.x, this.py - pad.y) < PRr + 8.2) { onPad = pad; break; }
      if (this.mustExit) { if (!onPad) this.mustExit = false; }
      else if (onPad) {
        const pad = onPad; {
          if (pad.v === this.cur.ans) {
            this.correct++; this.streak++;
            this.score += this.solo ? this.level : 1;
            this.flash = 0.35; this.flashCol = '#3a9d5c';
            if (sfx) sfx.coin(Math.min(12, this.streak * 2));
            this.next();
          } else {
            this.wrong++; this.streak = 0;
            this.stunT = 0.75; this.flash = 0.35; this.flashCol = '#e04040';
            this.vx = (50 - this.px) * 3; this.vy = (31 - this.py) * 3;  // bounced toward center
            if (sfx) sfx.hit();
            if (this.solo && this.wrong >= 3) this.out = true;
          }
        }
      }
    }
    // timeout: skip (solo: counts as a strike)
    if (this.qT >= Q_TIME) {
      if (this.solo) { this.wrong++; this.streak = 0; if (sfx) sfx.wall(); if (this.wrong >= 3) { this.out = true; return; } }
      this.next();
    }
  }
}

/* bot: precomputed answer timeline */
function botTimeline(seed, skill) {
  const rng = mulberry32(seed);
  const evs = []; let t = 1.5 + rng() * 2;
  while (t < T_LIMIT) {
    const ok = rng() < 0.72 + skill * 0.2;
    evs.push({ t, ok });
    t += (ok ? 0 : 0.9) + 2.0 + rng() * 2.6 - skill * 0.9;
  }
  return evs;
}
const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

class BrainGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.practice = !!ctx.practice;
    this.tt = 0; this.pops = [];
    this.online = !!ctx.net && !this.practice;
    const locals = ctx.players.filter(p => p.local && !p.bot);
    this.solo = !this.practice && ctx.players.length === 1;
    this.queue = this.practice ? [locals[0]] : [...locals];
    this.remotes = this.online ? ctx.players.filter(p => !p.local && !p.bot) : [];
    this.remoteLive = {};
    this.results = [];
    this.bots = (this.practice ? [] : ctx.players.filter(p => p.bot)).map(b => {
      const bh = hashSeed(b.id);
      return { p: b, evs: botTimeline((ctx.seed ^ bh) >>> 0, 0.3 + (bh % 100) / 200), n: 0, i: 0 };
    });
    if (ctx.onNet) ctx.onNet((t, p) => { if (t === 'g' && p.k === 'sc') this.remoteLive[p.id] = p; });
    this.state = 'ready'; this.stateT = 0;
    this.nextRunner();
    if (this.practice) this.startRun();
  }
  nextRunner() {
    this.runner = this.queue.shift() || null;
    if (!this.runner) { this.state = 'wait'; this.stateT = 0; return; }
    this.state = 'ready'; this.stateT = 0;
  }
  startRun() {
    this.board = new Board(this.ctx.seed, this.solo && !this.practice);
    this.runT = 0;
    for (const b of this.bots) { b.n = 0; b.i = 0; }
    this.state = 'run'; this.stateT = 0;
  }
  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    if (this.state === 'ready') {
      const inp = this.ctx.input(this.runner.slot, rdt);
      if ((inp.act || (this.online && this.stateT > 3)) && this.stateT > 0.5) this.startRun();
    } else if (this.state === 'run') {
      const b = this.board;
      this.runT += rdt;
      const inp = this.ctx.input(this.runner.slot, rdt);
      b.step(rdt, inp, this.ctx.audio.sfx);
      for (const bt of this.bots)
        while (bt.i < bt.evs.length && bt.evs[bt.i].t <= this.runT) { if (bt.evs[bt.i].ok) bt.n++; bt.i++; }
      this.ctx.audio.setMusicIntensity(0.45 + Math.min(0.4, b.streak * 0.06));
      if (this.online) {
        this._nAcc = (this._nAcc || 0) + rdt;
        if (this._nAcc > 0.5) { this._nAcc = 0;
          this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: b.correct, done: false }); }
      }
      const timeUp = !this.practice && this.runT >= T_LIMIT;
      if (timeUp || (b.out && !this.practice)) {
        const score = this.solo ? b.score : b.correct;
        this.results.push({
          id: this.runner.id, score,
          label: this.solo ? (b.out ? '3 strikes · lvl ' + b.level : 'lvl ' + b.level) : b.correct + ' correct',
          name: this.runner.name, color: this.runner.color,
        });
        if (this.online) this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: b.correct, done: true });
        this.nextRunner();
      }
    } else if (this.state === 'wait') {
      let allDone = true;
      for (const r of this.remotes) { const s = this.remoteLive[r.id]; if (!s || !s.done) allDone = false; }
      if (!this.online || allDone || this.stateT > 12) {
        for (const r of this.remotes) {
          const s = this.remoteLive[r.id];
          this.results.push({ id: r.id, score: s ? s.n : 0, label: (s ? s.n : 0) + ' correct', name: r.name, color: r.color });
        }
        for (const bt of this.bots)
          this.results.push({ id: bt.p.id, score: bt.n, label: bt.n + ' correct', name: bt.p.name, color: bt.p.color });
        this.ctx.end(this.results);
      }
    }
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    // chalkboard backdrop
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#1c2b24'); grd.addColorStop(1, '#0e1712');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,236,207,0.06)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, H * i / 6); g.lineTo(W, H * i / 6); g.stroke(); }
    if (this.state === 'ready' || !this.board) {
      g.textAlign = 'center'; g.fillStyle = this.runner ? this.runner.color : '#ffd23f';
      g.font = '900 34px system-ui';
      if (this.runner) {
        g.fillText(this.runner.name, W / 2, H * 0.4);
        g.fillStyle = '#ffeccf'; g.font = '800 20px system-ui';
        g.fillText('GET READY — tap / SPACE', W / 2, H * 0.4 + 40);
        if (this.results.length) {
          g.font = '700 15px system-ui'; g.fillStyle = '#93a0bd';
          g.fillText('so far: ' + this.results.map(r => r.name + ' ' + r.score).join(' · '), W / 2, H * 0.4 + 80);
        }
      }
      return;
    }
    if (this.state === 'wait') {
      g.textAlign = 'center'; g.fillStyle = '#ffeccf'; g.font = '800 22px system-ui';
      g.fillText(this.online ? 'waiting for the other brains…' : 'tallying…', W / 2, H * 0.45);
      return;
    }
    const b = this.board;
    // stage mapping: virtual 100x62 → screen rect
    const sx = W * 0.05, sy = H * 0.34, sw = W * 0.9, sh = H * 0.58;
    const mx = v => sx + v / 100 * sw, my = v => sy + v / 62 * sh;
    const pr = Math.min(sw / 100, sh / 62) * PRr;
    // question header
    g.textAlign = 'center';
    g.font = '900 ' + Math.round(Math.min(52, W * 0.11)) + 'px "Segoe UI",system-ui';
    g.fillStyle = b.flash > 0 ? b.flashCol : '#ffeccf';
    g.fillText(b.cur.q + ' = ?', W / 2, H * 0.14);
    // per-question timer bar
    const tw = Math.min(300, W * 0.6), tf = clamp(1 - b.qT / Q_TIME, 0, 1);
    g.fillStyle = 'rgba(20,26,40,0.7)'; g.fillRect(W / 2 - tw / 2, H * 0.17, tw, 8);
    g.fillStyle = tf < 0.3 ? '#ff5f5f' : '#ffd23f';
    g.fillRect(W / 2 - tw / 2, H * 0.17, tw * tf, 8);
    // stats row
    g.font = '800 16px system-ui'; g.textAlign = 'left'; g.fillStyle = '#ffd23f';
    if (this.practice) { g.fillText('PRACTICE', 14, 28); }
    else if (this.solo) {
      g.fillText('SCORE ' + b.score + '  ·  LVL ' + b.level, 14, 28);
      g.fillStyle = '#ff5f5f'; g.fillText('✗'.repeat(b.wrong) + '·'.repeat(Math.max(0, 3 - b.wrong)), 14, 50);
    } else g.fillText('✓ ' + b.correct, 14, 28);
    if (!this.practice) {
      g.textAlign = 'right'; g.font = '900 22px system-ui';
      const tl = Math.max(0, T_LIMIT - this.runT);
      g.fillStyle = tl < 10 ? '#ff5f5f' : '#ffeccf';
      g.fillText(Math.ceil(tl) + '', W - 14, 30);
    }
    // live rival scores (multiplayer)
    if (!this.solo && !this.practice) {
      g.textAlign = 'right'; g.font = '700 13px system-ui';
      let yy = 54;
      for (const bt of this.bots) { g.fillStyle = bt.p.color; g.fillText(bt.p.name + ' ' + bt.n, W - 14, yy); yy += 18; }
      for (const r of this.remotes) { const s = this.remoteLive[r.id]; g.fillStyle = r.color; g.fillText(r.name + ' ' + (s ? s.n : 0), W - 14, yy); yy += 18; }
    }
    // stage frame
    g.strokeStyle = 'rgba(255,236,207,0.25)'; g.lineWidth = 3;
    g.strokeRect(sx, sy, sw, sh);
    // pads
    for (const pad of b.pads()) {
      const px = mx(pad.x), py = my(pad.y), rr2 = pr + Math.min(sw, sh) * 0.052;
      g.fillStyle = pad.col; g.globalAlpha = (b.armT > 0 || b.mustExit) ? 0.45 : 0.92;
      g.beginPath(); g.arc(px, py, rr2, 0, TAU); g.fill();
      g.globalAlpha = 1;
      g.lineWidth = 4; g.strokeStyle = '#14100a'; g.stroke();
      g.fillStyle = '#fff'; g.font = '900 ' + Math.round(rr2 * 0.62) + 'px system-ui';
      g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(pad.v, px, py + 1);
      g.textBaseline = 'alphabetic';
    }
    // player
    const px = mx(b.px), py = my(b.py);
    const stunned = b.stunT > 0;
    g.save(); g.translate(px, py);
    if (stunned) g.rotate(Math.sin(this.tt * 30) * 0.2);
    g.fillStyle = this.runner.color; g.strokeStyle = '#14100a'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, pr * 1.05, 0, TAU); g.fill(); g.stroke();
    const fx = b.vx / VMAX * 4, fy = b.vy / VMAX * 4;
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(-5 + fx, -3 + fy, 4.5, 0, TAU); g.fill();
    g.beginPath(); g.arc(5 + fx, -3 + fy, 4.5, 0, TAU); g.fill();
    g.fillStyle = '#14100a';
    g.beginPath(); g.arc(-5 + fx * 1.3, -3 + fy * 1.3, 2.2, 0, TAU); g.fill();
    g.beginPath(); g.arc(5 + fx * 1.3, -3 + fy * 1.3, 2.2, 0, TAU); g.fill();
    if (stunned) { g.font = '900 14px system-ui'; g.textAlign = 'center'; g.fillText('💫', 0, -pr - 8); }
    g.restore();
    // flash edge
    if (b.flash > 0) {
      g.globalAlpha = b.flash * 1.6; g.strokeStyle = b.flashCol; g.lineWidth = 10;
      g.strokeRect(5, 5, W - 10, H - 10); g.globalAlpha = 1;
    }
  }
  dispose() { }
}
