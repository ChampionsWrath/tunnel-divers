// HOME RUN HEROES — 10 pitches. HOLD to charge your swing, RELEASE as the ball
// crosses the plate. Charge = power, timing = contact. Total distance wins.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';

const PITCHES = 10;

export default {
  id: 'homerun', name: 'Home Run Heroes', icon: '⚾',
  desc: 'Charge your swing, time the release, mash dingers.',
  howto: {
    goal: PITCHES + ' pitches. HOLD to charge your swing (power!), RELEASE right as the ball crosses the plate (contact!). Total distance across all pitches wins.',
    touch: 'HOLD a finger to charge · RELEASE to swing',
    keys: 'P1: hold SPACE · P2: hold ENTER',
    tip: 'A full charge means nothing if you whiff the timing — watch the ball, not the meter.',
  },
  create(ctx) { return new HomerunGame(ctx); }
};

function botTimeline(seed, skill) {
  const rng = mulberry32(seed);
  const evs = []; let t = 3;
  for (let i = 0; i < PITCHES; i++) {
    const q = Math.max(0, Math.min(1, skill + (rng() - 0.5) * 0.6));
    const whiff = rng() > 0.55 + skill * 0.4;
    evs.push({ t, d: whiff ? 0 : Math.round(25 + q * 115) });
    t += 3.4 + rng() * 1.2;
  }
  return evs;
}
const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

class HomerunGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.practice = !!ctx.practice;
    this.online = !!ctx.net && !this.practice;
    const locals = ctx.players.filter(p => p.local && !p.bot);
    this.queue = this.practice ? [locals[0]] : [...locals];
    this.remotes = this.online ? ctx.players.filter(p => !p.local && !p.bot) : [];
    this.remoteLive = {};
    this.results = [];
    this.bots = (this.practice ? [] : ctx.players.filter(p => p.bot)).map(b => {
      const bh = hashSeed(b.id);
      return { p: b, evs: botTimeline((ctx.seed ^ bh) >>> 0, 0.35 + (bh % 100) / 220), n: 0, i: 0 };
    });
    if (ctx.onNet) ctx.onNet((t, p) => { if (t === 'g' && p.k === 'sc') this.remoteLive[p.id] = p; });
    this.pops = [];
    this.state = 'ready'; this.stateT = 0; this.tt = 0;
    this.prevHold = false;
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
    this.score = 0; this.pitchNo = 0; this.runT = 0;
    this.phase = 'windup'; this.phaseT = 0;   // windup → throw → (result) → windup…
    this.charge = 0; this.swingT = -9; this.swingQ = 0;
    this.flight = null;                       // hit-ball animation
    this.prevHold = true;                     // require a fresh press
    for (const b of this.bots) { b.n = 0; b.i = 0; }
    this.newPitch();
    this.state = 'run'; this.stateT = 0;
  }
  newPitch() {
    this.pitchNo++;
    this.phase = 'windup'; this.phaseT = 0;
    this.charge = 0; this.swung = false;
    this.travelT = 1.05 + this.rng() * 0.55;   // slower or faster pitch
    this.windupT = 0.7 + this.rng() * 0.5;
  }
  pop(txt, x, y, col, size) { this.pops.push({ txt, x, y, t: 0, dur: 1.0, col: col || '#ffd23f', size: size || 22 }); }

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
          this.results.push({ id: r.id, score: s ? s.n : 0, label: (s ? s.n : 0) + 'm', name: r.name, color: r.color });
        }
        for (const bt of this.bots)
          this.results.push({ id: bt.p.id, score: bt.n, label: bt.n + 'm', name: bt.p.name, color: bt.p.color });
        this.ctx.end(this.results);
      }
      return;
    }
    // ---- run ----
    this.runT += rdt; this.phaseT += rdt;
    const inp = this.ctx.input(this.runner.slot, rdt);
    const hold = inp.hold, released = this.prevHold && !hold;
    this.prevHold = hold;
    if (this.flight) {
      this.flight.t += rdt;
      if (this.flight.t > 1.15) this.flight = null;
    }
    if (this.phase === 'windup') {
      if (hold) this.charge = Math.min(1, this.charge + rdt / 1.1);
      if (this.phaseT >= this.windupT) { this.phase = 'throw'; this.phaseT = 0; }
    } else if (this.phase === 'throw') {
      const f = this.phaseT / this.travelT;          // 0 at mound → 1 at plate
      if (hold) this.charge = Math.min(1, this.charge + rdt / 1.1);
      if (released && !this.swung) {
        this.swung = true; this.swingT = this.tt;
        // contact quality: how close the ball is to the plate at release
        const err = Math.abs(f - 1);
        const q = Math.max(0, 1 - err / 0.13);
        this.swingQ = q;
        if (q <= 0.1) {
          this.pop('WHIFF!', 30, 40, '#ff5f5f', 26);
          this.ctx.audio.sfx.whoosh();
          this.afterPitch(0);
        } else {
          const dist = Math.round((22 + this.charge * (0.35 + 0.65 * q) * 118) * (0.92 + this.rng() * 0.16));
          const tag = q > 0.9 ? 'PERFECT!' : q > 0.65 ? 'GREAT!' : q > 0.35 ? 'GOOD' : 'CLIPPED';
          this.pop(tag + '  ' + dist + 'm', 34, 34, q > 0.9 ? '#ffd23f' : q > 0.65 ? '#7dff6a' : '#ffeccf', 26);
          this.ctx.audio.sfx.thud(1); if (q > 0.9) this.ctx.audio.sfx.win();
          this.flight = { t: 0, dist, q };
          this.afterPitch(dist);
        }
      } else if (f >= 1.12 && !this.swung) {
        this.pop(hold ? 'HELD ON…' : 'TAKEN', 30, 40, '#93a0bd', 22);
        this.ctx.audio.sfx.wall();
        this.afterPitch(0);
      }
    } else if (this.phase === 'between') {
      if (this.phaseT > 0.9) {
        if (this.pitchNo >= PITCHES && !this.practice) this.finishRunner();
        else this.newPitch();
      }
    }
    for (const bt of this.bots)
      while (bt.i < bt.evs.length && bt.evs[bt.i].t <= this.runT) { bt.n += bt.evs[bt.i].d; bt.i++; }
    this.ctx.audio.setMusicIntensity(0.4 + this.charge * 0.35);
    if (this.online) {
      this._nAcc = (this._nAcc || 0) + rdt;
      if (this._nAcc > 0.5) { this._nAcc = 0; this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.score, done: false }); }
    }
  }
  afterPitch(dist) {
    this.score += dist;
    this.phase = 'between'; this.phaseT = 0;
  }
  finishRunner() {
    this.results.push({ id: this.runner.id, score: this.score, label: this.score + 'm', name: this.runner.name, color: this.runner.color });
    if (this.online) this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.score, done: true });
    this.nextRunner();
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim, s = Math.min(W, H) / 700;
    // stands + sky
    const sky = g.createLinearGradient(0, 0, 0, H * 0.45);
    sky.addColorStop(0, '#25314d'); sky.addColorStop(1, '#4d6491');
    g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.45);
    // crowd dots
    for (let i = 0; i < 60; i++) {
      const fr = Math.sin(i * 127.1) * 43758.5453, f2 = fr - Math.floor(fr);
      const fr2 = Math.sin(i * 311.7) * 12543.2, f3 = fr2 - Math.floor(fr2);
      g.fillStyle = ['#c9a97a', '#e07326', '#9ad3ff', '#e08bd0'][i % 4];
      g.beginPath(); g.arc(f2 * W, H * (0.08 + f3 * 0.3), 3 * s, 0, TAU); g.fill();
    }
    // lights
    g.fillStyle = '#ffeccf';
    for (const lx of [0.15, 0.85]) {
      g.fillRect(W * lx - 2 * s, H * 0.02, 4 * s, H * 0.1);
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(W * lx + (i - 1) * 12 * s, H * 0.02 + 6 * s, 4 * s, 0, TAU); g.fill(); }
    }
    // field
    const fg = g.createLinearGradient(0, H * 0.45, 0, H);
    fg.addColorStop(0, '#4f9e46'); fg.addColorStop(1, '#2f6e2a');
    g.fillStyle = fg; g.fillRect(0, H * 0.45, W, H);
    // mow stripes
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 5; i++) g.fillRect(0, H * (0.47 + i * 0.11), W, H * 0.055);
    // dirt: mound (right) + plate circle (left)
    const plateX = W * 0.24, groundY = H * 0.78, moundX = W * 0.82;
    g.fillStyle = '#b08652';
    g.beginPath(); g.ellipse(moundX, groundY, 52 * s, 16 * s, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(plateX, groundY + 8 * s, 62 * s, 18 * s, 0, 0, TAU); g.fill();
    g.fillStyle = '#f2ece2'; g.fillRect(plateX + 16 * s, groundY + 2 * s, 12 * s, 8 * s);
    if (this.state === 'ready' || this.state === 'wait') {
      g.fillStyle = 'rgba(6,7,13,0.55)'; g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      if (this.state === 'ready' && this.runner) {
        g.fillStyle = this.runner.color; g.font = '900 34px system-ui';
        g.fillText(this.runner.name, W / 2, H * 0.4);
        g.fillStyle = '#ffeccf'; g.font = '800 20px system-ui';
        g.fillText('GET READY — tap / SPACE', W / 2, H * 0.4 + 40);
        if (this.results.length) {
          g.font = '700 15px system-ui'; g.fillStyle = '#93a0bd';
          g.fillText('so far: ' + this.results.map(r => r.name + ' ' + r.score + 'm').join(' · '), W / 2, H * 0.4 + 80);
        }
      } else if (this.state === 'wait') {
        g.fillStyle = '#ffeccf'; g.font = '800 22px system-ui';
        g.fillText(this.online ? 'waiting for the other sluggers…' : 'tallying…', W / 2, H * 0.45);
      }
      return;
    }
    // pitcher (simple thrower)
    const wind = this.phase === 'windup' ? Math.sin(this.phaseT / this.windupT * Math.PI) : 0;
    g.fillStyle = '#e0e4e8'; g.strokeStyle = '#14100a'; g.lineWidth = 3;
    g.beginPath(); g.arc(moundX, groundY - 34 * s, 15 * s, 0, TAU); g.fill(); g.stroke();
    g.lineCap = 'round'; g.lineWidth = 5 * s; g.strokeStyle = '#e0e4e8';
    g.beginPath(); g.moveTo(moundX, groundY - 26 * s);
    g.lineTo(moundX - 14 * s, groundY - 12 * s + wind * -20 * s); g.stroke();
    // ball in flight (pitch)
    if (this.phase === 'throw' && !this.swung) {
      const f = Math.min(1.12, this.phaseT / this.travelT);
      const bx = lerp(moundX - 16 * s, plateX + 10 * s, f);
      const by = groundY - 40 * s - Math.sin(f * Math.PI) * 55 * s;
      g.fillStyle = '#f2ece2'; g.strokeStyle = '#c0392b'; g.lineWidth = 2;
      g.beginPath(); g.arc(bx, by, 8 * s, 0, TAU); g.fill(); g.stroke();
    }
    // hit ball flying out
    if (this.flight) {
      const f = this.flight.t / 1.15;
      const bx = lerp(plateX, W * 1.05, f);
      const by = groundY - 40 * s - Math.sin(Math.min(1, f * 1.1) * Math.PI) * (90 + this.flight.q * 130) * s;
      g.fillStyle = '#f2ece2'; g.strokeStyle = '#c0392b'; g.lineWidth = 2;
      g.beginPath(); g.arc(bx, by, 7 * s, 0, TAU); g.fill(); g.stroke();
    }
    // batter (the diver, with a bat)
    const bx2 = plateX - 14 * s, by2 = groundY - 30 * s;
    const swingAge = this.tt - this.swingT;
    const batAng = swingAge < 0.18 ? lerp(-2.2, 0.9, swingAge / 0.18) : (this.charge > 0 && this.phase !== 'between' ? -2.2 - this.charge * 0.35 : -1.9);
    g.fillStyle = this.runner.color; g.strokeStyle = '#14100a'; g.lineWidth = 3;
    g.beginPath(); g.arc(bx2, by2, 16 * s, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#ffd9b3';
    g.beginPath(); g.arc(bx2 + 5 * s, by2 - 12 * s, 9 * s, 0, TAU); g.fill(); g.stroke();
    g.save(); g.translate(bx2 + 8 * s, by2 - 6 * s); g.rotate(batAng);
    g.fillStyle = '#c9a06a'; g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
    g.fillRect(-3 * s, -46 * s, 6 * s, 46 * s); g.strokeRect(-3 * s, -46 * s, 6 * s, 46 * s);
    g.restore();
    // power meter
    const mw = Math.min(240, W * 0.5);
    g.fillStyle = 'rgba(20,26,40,0.75)'; g.fillRect(W / 2 - mw / 2, H - 44, mw, 16);
    const pc = this.charge;
    g.fillStyle = pc > 0.85 ? '#ff5f5f' : pc > 0.5 ? '#ffd23f' : '#7dff6a';
    g.fillRect(W / 2 - mw / 2, H - 44, mw * pc, 16);
    g.strokeStyle = '#ffeccf'; g.lineWidth = 2; g.strokeRect(W / 2 - mw / 2, H - 44, mw, 16);
    g.textAlign = 'center'; g.font = '700 12px system-ui'; g.fillStyle = '#ffeccf';
    g.fillText('HOLD = CHARGE · RELEASE = SWING', W / 2, H - 52);
    // HUD
    g.textAlign = 'left'; g.font = '800 18px system-ui'; g.fillStyle = '#ffeccf';
    g.fillText('⚾ ' + this.score + 'm', 14, 30);
    g.fillText(this.practice ? 'PRACTICE' : 'PITCH ' + Math.min(this.pitchNo, PITCHES) + '/' + PITCHES, 14, 54);
    if (!this.practice && (this.bots.length || this.remotes.length)) {
      g.textAlign = 'right'; g.font = '700 13px system-ui';
      let yy = 30;
      for (const bt of this.bots) { g.fillStyle = bt.p.color; g.fillText(bt.p.name + ' ' + bt.n + 'm', W - 14, yy); yy += 17; }
      for (const r of this.remotes) { const sc = this.remoteLive[r.id]; g.fillStyle = r.color; g.fillText(r.name + ' ' + (sc ? sc.n : 0) + 'm', W - 14, yy); yy += 17; }
    }
    g.textAlign = 'center';
    for (const p of this.pops) {
      const f = 1 - p.t / p.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + p.size + 'px system-ui';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      g.strokeText(p.txt, W * p.x / 100, H * p.y / 100 - p.t * 40);
      g.fillStyle = p.col; g.fillText(p.txt, W * p.x / 100, H * p.y / 100 - p.t * 40);
    }
    g.globalAlpha = 1;
  }
  dispose() { }
}
