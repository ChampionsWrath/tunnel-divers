// BIG BRAIN — mental math. TAP/CLICK the box with the correct answer.
// Correct = instant next question. Multiplayer: simple math, most correct in 75s.
// Solo: difficulty (and points) scale as you answer; 3 strikes and you're out.
import { clamp, mulberry32 } from '../util.js';

const T_LIMIT = 75, Q_TIME = 10;
const PADCOL = ['#4d9de0', '#e04040', '#3a9d5c', '#9d5cd0'];

export default {
  id: 'brain', name: 'Big Brain', icon: '🧠',
  desc: 'Mental math. Tap the right answer. Fast.',
  howto: {
    goal: 'A question appears — TAP the box with the CORRECT answer. Right answer = next question instantly. Most correct in 75s wins. (Solo: questions get harder as you go, 3 strikes and you\'re out.)',
    touch: 'TAP the answer box',
    keys: 'CLICK the answer box',
    tip: 'Wrong answers stun you for a beat — think first, then commit.',
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
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { q, ans, opts };
}

/* one player's quiz run */
class Board {
  constructor(seed, solo) {
    this.rng = mulberry32(seed);
    this.solo = solo;
    this.level = 1; this.correct = 0; this.wrong = 0; this.score = 0;
    this.qT = 0; this.armT = 0.35; this.stunT = 0; this.flash = 0; this.flashCol = '';
    this.flashCell = -1; this.out = false; this.streak = 0;
    this.next();
  }
  next() {
    const lvl = this.solo ? Math.min(8, 1 + Math.floor(this.correct / 2)) : [1, 1, 2, 2, 3][Math.floor(this.rng() * 5)];
    this.level = lvl;
    this.cur = genQ(this.rng, lvl);
    this.qT = 0; this.armT = 0.35;
  }
  answer(idx, sfx) {   // idx: which box was tapped
    if (this.out || this.armT > 0 || this.stunT > 0) return;
    if (this.cur.opts[idx] === this.cur.ans) {
      this.correct++; this.streak++;
      this.score += this.solo ? this.level : 1;
      this.flash = 0.3; this.flashCol = '#3a9d5c'; this.flashCell = idx;
      if (sfx) sfx.coin(Math.min(12, this.streak * 2));
      this.next();
    } else {
      this.wrong++; this.streak = 0;
      this.stunT = 0.8; this.flash = 0.4; this.flashCol = '#e04040'; this.flashCell = idx;
      if (sfx) sfx.hit();
      if (this.solo && this.wrong >= 3) this.out = true;
    }
  }
  step(dt, sfx) {
    if (this.out) return;
    this.qT += dt; this.armT -= dt; this.stunT -= dt; this.flash -= dt;
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
    this.tt = 0;
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
    this.clicks = [];
    this._pd = e => { this.clicks.push([e.clientX, e.clientY]); };
    ctx.cv.addEventListener('pointerdown', this._pd);
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
    this.runT = 0; this.clicks.length = 0;
    for (const b of this.bots) { b.n = 0; b.i = 0; }
    this.state = 'run'; this.stateT = 0;
  }
  // the whole area below the header, split into 4 even boxes
  cells() {
    const { W, H } = this.ctx.dim;
    const gy = H * 0.24, gap = Math.min(W, H) * 0.015;
    const cw = (W - gap * 3) / 2, ch = (H - gy - gap * 3) / 2;
    const out = [];
    for (let i = 0; i < 4; i++) {
      const cx2 = i % 2, cy2 = Math.floor(i / 2);
      out.push({ x: gap + cx2 * (cw + gap), y: gy + gap + cy2 * (ch + gap), w: cw, h: ch });
    }
    return out;
  }
  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
    if (this.state === 'ready') {
      const inp = this.ctx.input(this.runner.slot, rdt);
      const tapped = this.clicks.length > 0; this.clicks.length = 0;
      if ((inp.act || tapped || (this.online && this.stateT > 3)) && this.stateT > 0.5) this.startRun();
    } else if (this.state === 'run') {
      const b = this.board;
      this.runT += rdt;
      b.step(rdt, this.ctx.audio.sfx);
      // taps → answers
      if (this.clicks.length) {
        const cs = this.cells();
        for (const [px, py] of this.clicks) {
          for (let i = 0; i < 4; i++) {
            const c = cs[i];
            if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) {
              b.answer(i, this.ctx.audio.sfx); break;
            }
          }
        }
        this.clicks.length = 0;
      }
      for (const bt of this.bots)
        while (bt.i < bt.evs.length && bt.evs[bt.i].t <= this.runT) { if (bt.evs[bt.i].ok) bt.n++; bt.i++; }
      this.ctx.audio.setMusicIntensity(0.45 + Math.min(0.4, b.streak * 0.06));
      if (this.online) {
        this._nAcc = (this._nAcc || 0) + rdt;
        if (this._nAcc > 0.5) {
          this._nAcc = 0;
          this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: b.correct, done: false });
        }
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
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#1c2b24'); grd.addColorStop(1, '#0e1712');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    if (this.state === 'ready' || !this.board) {
      g.textAlign = 'center'; g.fillStyle = this.runner ? this.runner.color : '#ffd23f';
      g.font = '900 34px system-ui';
      if (this.runner) {
        g.fillText(this.runner.name, W / 2, H * 0.4);
        g.fillStyle = '#ffeccf'; g.font = '800 20px system-ui';
        g.fillText('GET READY — tap anywhere', W / 2, H * 0.4 + 40);
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
    // header: question, per-question timer, stats
    g.textAlign = 'center';
    g.font = '900 ' + Math.round(Math.min(56, W * 0.12)) + 'px "Segoe UI",system-ui';
    g.fillStyle = b.stunT > 0 ? '#e04040' : '#ffeccf';
    g.fillText(b.cur.q + ' = ?', W / 2, H * 0.115);
    const tw = Math.min(320, W * 0.64), tf = clamp(1 - b.qT / Q_TIME, 0, 1);
    g.fillStyle = 'rgba(20,26,40,0.7)'; g.fillRect(W / 2 - tw / 2, H * 0.145, tw, 8);
    g.fillStyle = tf < 0.3 ? '#ff5f5f' : '#ffd23f';
    g.fillRect(W / 2 - tw / 2, H * 0.145, tw * tf, 8);
    g.font = '800 16px system-ui'; g.textAlign = 'left'; g.fillStyle = '#ffd23f';
    if (this.practice) g.fillText('PRACTICE', 14, 28);
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
    if (!this.solo && !this.practice) {
      g.textAlign = 'right'; g.font = '700 13px system-ui';
      let yy = 52;
      for (const bt of this.bots) { g.fillStyle = bt.p.color; g.fillText(bt.p.name + ' ' + bt.n, W - 14, yy); yy += 17; }
      for (const r of this.remotes) { const s = this.remoteLive[r.id]; g.fillStyle = r.color; g.fillText(r.name + ' ' + (s ? s.n : 0), W - 14, yy); yy += 17; }
    }
    // 4 even answer boxes filling the play area
    const cs = this.cells(), dim = b.armT > 0 || b.stunT > 0;
    for (let i = 0; i < 4; i++) {
      const c = cs[i], r = Math.min(c.w, c.h) * 0.09;
      const flashing = b.flash > 0 && b.flashCell === i;
      g.globalAlpha = dim && !flashing ? 0.55 : 1;
      g.fillStyle = flashing ? b.flashCol : PADCOL[i];
      g.beginPath();
      g.moveTo(c.x + r, c.y); g.arcTo(c.x + c.w, c.y, c.x + c.w, c.y + c.h, r);
      g.arcTo(c.x + c.w, c.y + c.h, c.x, c.y + c.h, r); g.arcTo(c.x, c.y + c.h, c.x, c.y, r);
      g.arcTo(c.x, c.y, c.x + c.w, c.y, r); g.closePath();
      g.fill();
      g.lineWidth = 5; g.strokeStyle = '#14100a'; g.stroke();
      g.fillStyle = '#fff';
      g.font = '900 ' + Math.round(Math.min(c.h * 0.42, c.w * 0.3)) + 'px system-ui';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(b.cur.opts[i], c.x + c.w / 2, c.y + c.h / 2);
      g.textBaseline = 'alphabetic';
    }
    g.globalAlpha = 1;
    if (b.stunT > 0) {
      g.textAlign = 'center'; g.font = '900 ' + Math.round(34 + b.stunT * 10) + 'px system-ui';
      g.fillText('💫', W / 2, H * 0.21);
    }
    if (b.flash > 0 && b.flashCol === '#3a9d5c') {
      g.globalAlpha = b.flash * 2; g.strokeStyle = '#3a9d5c'; g.lineWidth = 10;
      g.strokeRect(5, 5, W - 10, H - 10); g.globalAlpha = 1;
    }
  }
  dispose() { this.ctx.cv.removeEventListener('pointerdown', this._pd); }
}
