// HOME RUN HEROES — batter's-POV slugging (MLB The Show camera, Flick Home Run soul).
// The pitch comes AT you; HOLD to charge, RELEASE at the plate. Great contact at
// full charge doesn't just clear the wall — it leaves the stadium, the sky, Earth.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';
import { drawDiverBack } from '../character.js';

const PITCHES = 10;

export default {
  id: 'homerun', name: 'Home Run Heroes', icon: '⚾',
  desc: 'Batter\'s-eye view. Charge, time it, leave the planet.',
  howto: {
    goal: PITCHES + ' pitches, batter\'s-eye view. HOLD to charge your swing, RELEASE right as the ball reaches the plate. Total distance wins — perfect contact at full charge can leave the stadium… and the atmosphere.',
    touch: 'HOLD a finger to charge · RELEASE to swing',
    keys: 'P1: hold SPACE · P2: hold ENTER',
    tip: 'Power means nothing if you whiff the timing — watch the ball grow, not the meter.',
  },
  create(ctx) { return new HomerunGame(ctx); }
};

function botTimeline(seed, skill) {
  const rng = mulberry32(seed);
  const evs = []; let t = 3;
  for (let i = 0; i < PITCHES; i++) {
    const q = Math.max(0, Math.min(1, skill + (rng() - 0.5) * 0.6));
    const whiff = rng() > 0.55 + skill * 0.4;
    let d = whiff ? 0 : Math.round(20 + q * 95);
    if (!whiff && rng() < 0.12) d = Math.round(d * (2 + rng() * 2.5));   // bots moonshot too
    evs.push({ t, d });
    t += 3.8 + rng() * 1.4;
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
    this.pops = []; this.stars = [];
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
    this.charge = 0; this.swingT = -9; this.lastDist = 0;
    this.flight = null; this.spaceFx = 0;
    this.prevHold = true;
    for (const b of this.bots) { b.n = 0; b.i = 0; }
    this.newPitch();
    this.state = 'run'; this.stateT = 0;
  }
  newPitch() {
    this.pitchNo++;
    this.phase = 'windup'; this.phaseT = 0;
    this.charge = 0; this.swung = false;
    this.travelT = 1.0 + this.rng() * 0.6;
    this.windupT = 0.7 + this.rng() * 0.5;
    this.pitchDrift = (this.rng() - 0.5) * 0.12;   // slight left/right movement
  }
  pop(txt, x, y, col, size, dur) { this.pops.push({ txt, x, y, t: 0, dur: dur || 1.1, col: col || '#ffd23f', size: size || 24 }); }

  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    this.spaceFx = Math.max(0, this.spaceFx - rdt * 0.5);
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
    if (this.phase === 'windup') {
      if (hold) this.charge = Math.min(1, this.charge + rdt / 1.1);
      if (this.phaseT >= this.windupT) { this.phase = 'throw'; this.phaseT = 0; }
    } else if (this.phase === 'throw') {
      const f = this.phaseT / this.travelT;
      if (hold) this.charge = Math.min(1, this.charge + rdt / 1.1);
      if (released && !this.swung) {
        this.swung = true; this.swingT = this.tt;
        const err = Math.abs(f - 1);
        const q = Math.max(0, 1 - err / 0.13);
        if (q <= 0.1) {
          this.pop('WHIFF!', 50, 55, '#ff5f5f', 30);
          this.ctx.audio.sfx.whoosh();
          this.afterPitch(0);
        } else {
          // Flick Home Run rules: great contact stacks multipliers into orbit
          let dist = (18 + this.charge * (0.35 + 0.65 * q) * 105) * (0.92 + this.rng() * 0.16);
          let tier = 0;
          if (q > 0.85 && this.charge > 0.88) { dist *= 1.7 + this.rng() * 1.3; tier = 1; }
          if (q > 0.96 && this.charge > 0.97) { dist *= 2.6 + this.rng() * 3.4; tier = 2; }
          dist = Math.round(Math.min(9999, dist));
          if (dist > 800) tier = 2; else if (dist > 130) tier = Math.max(tier, 1);
          const tag = q > 0.9 ? 'PERFECT!' : q > 0.65 ? 'GREAT!' : q > 0.35 ? 'GOOD' : 'CLIPPED';
          this.pop(tag, 50, 52, q > 0.9 ? '#ffd23f' : q > 0.65 ? '#7dff6a' : '#ffeccf', 30);
          this.ctx.audio.sfx.thud(1);
          this.flight = { t: 0, dist, tier, dur: 1.1 + Math.min(1.6, dist / 700), shown: 0 };
          this.phase = 'flight'; this.phaseT = 0;
        }
      } else if (f >= 1.12 && !this.swung) {
        this.pop(hold ? 'HELD ON…' : 'TAKEN', 50, 55, '#93a0bd', 24);
        this.ctx.audio.sfx.wall();
        this.afterPitch(0);
      }
    } else if (this.phase === 'flight') {
      const fl = this.flight;
      fl.t += rdt;
      fl.shown = Math.round(fl.dist * clamp(fl.t / (fl.dur * 0.85), 0, 1));
      // milestone stingers as the counter climbs
      if (!fl.m1 && fl.shown > 120) { fl.m1 = true; this.ctx.audio.sfx.pow(); this.pop('HOME RUN!', 50, 40, '#7dff6a', 30); }
      if (!fl.m2 && fl.shown > 300) { fl.m2 = true; this.ctx.audio.sfx.win(); this.pop('OUT OF THE PARK!!', 50, 34, '#ffd23f', 32); }
      if (!fl.m3 && fl.shown > 800) { fl.m3 = true; this.spaceFx = 1; this.ctx.audio.sfx.zone(); this.pop('🚀 INTO SPACE!!!', 50, 28, '#8fd0ff', 34, 1.6); }
      if (fl.t >= fl.dur) { const d = fl.dist; this.flight = null; this.afterPitch(d); }
    } else if (this.phase === 'between') {
      if (this.phaseT > 0.9) {
        if (this.pitchNo >= PITCHES && !this.practice) this.finishRunner();
        else this.newPitch();
      }
    }
    for (const bt of this.bots)
      while (bt.i < bt.evs.length && bt.evs[bt.i].t <= this.runT) { bt.n += bt.evs[bt.i].d; bt.i++; }
    this.ctx.audio.setMusicIntensity(0.4 + this.charge * 0.3 + (this.phase === 'flight' ? 0.2 : 0));
    if (this.online) {
      this._nAcc = (this._nAcc || 0) + rdt;
      if (this._nAcc > 0.5) { this._nAcc = 0; this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.score, done: false }); }
    }
  }
  afterPitch(dist) {
    this.score += dist; this.lastDist = dist;
    this.phase = 'between'; this.phaseT = 0;
  }
  finishRunner() {
    this.results.push({ id: this.runner.id, score: this.score, label: this.score + 'm', name: this.runner.name, color: this.runner.color });
    if (this.online) this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.score, done: true });
    this.nextRunner();
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim, s = Math.min(W, H) / 700;
    const VX = W / 2, VY = H * 0.34;                      // vanishing point / center field
    const space = this.spaceFx;
    // ---- sky (day → space during a moonshot) ----
    const sky = g.createLinearGradient(0, 0, 0, VY + H * 0.08);
    if (space > 0.01) {
      sky.addColorStop(0, '#05060f'); sky.addColorStop(1, '#1a2440');
    } else { sky.addColorStop(0, '#4d86c9'); sky.addColorStop(1, '#a8cdec'); }
    g.fillStyle = sky; g.fillRect(0, 0, W, VY + H * 0.08);
    if (space > 0.01) {
      g.fillStyle = 'rgba(255,255,255,' + (0.8 * space) + ')';
      for (let i = 0; i < 40; i++) {
        const fr = Math.sin(i * 127.1) * 43758.5453, f2 = fr - Math.floor(fr);
        const fr2 = Math.sin(i * 311.7) * 12543.2, f3 = fr2 - Math.floor(fr2);
        g.fillRect(f2 * W, f3 * VY, 2, 2);
      }
    }
    // ---- upper deck / stands: tiered bands wrapping the outfield ----
    const standTop = VY - H * 0.16;
    for (let tier = 0; tier < 3; tier++) {
      const y0 = standTop + tier * H * 0.055, hh = H * 0.05;
      g.fillStyle = ['#3d4759', '#4a5568', '#57627a'][tier];
      g.beginPath();
      g.moveTo(0, y0 + hh * 1.6); g.quadraticCurveTo(W / 2, y0 - hh * 0.6, W, y0 + hh * 1.6);
      g.lineTo(W, y0 + hh * 2.6); g.quadraticCurveTo(W / 2, y0 + hh * 0.4, 0, y0 + hh * 2.6);
      g.closePath(); g.fill();
      // crowd dots
      for (let i = 0; i < 40; i++) {
        const fr = Math.sin((i + tier * 50) * 127.1) * 43758.5453, f2 = fr - Math.floor(fr);
        const cx2 = f2 * W;
        const arc = Math.sin(f2 * Math.PI) * hh * 0.6;
        g.fillStyle = ['#c9a97a', '#e07326', '#9ad3ff', '#e08bd0', '#7dff6a'][(i + tier) % 5];
        g.beginPath(); g.arc(cx2, y0 + hh * 2 - arc, 2.2 * s, 0, TAU); g.fill();
      }
    }
    // ---- jumbotron ----
    const jw = Math.min(W * 0.34, 240 * s * 1.6), jh = jw * 0.5;
    const jx = W * 0.72 - jw / 2, jy = standTop - jh * 0.72;
    g.fillStyle = '#14100a'; g.fillRect(jx - 4, jy - 4, jw + 8, jh + 8);
    g.fillStyle = '#0a1a12'; g.fillRect(jx, jy, jw, jh);
    g.textAlign = 'center';
    g.fillStyle = '#7dff6a'; g.font = '900 ' + Math.round(jh * 0.26) + 'px ui-monospace,monospace';
    g.fillText(this.practice ? 'PRACTICE' : 'PITCH ' + Math.min(this.pitchNo, PITCHES) + '/' + PITCHES, jx + jw / 2, jy + jh * 0.32);
    g.fillStyle = '#ffd23f'; g.font = '900 ' + Math.round(jh * 0.34) + 'px ui-monospace,monospace';
    const jval = this.phase === 'flight' && this.flight ? this.flight.shown + 'm' :
      this.lastDist ? this.lastDist + 'm' : 'TOTAL ' + this.score + 'm';
    g.fillText(jval, jx + jw / 2, jy + jh * 0.72);
    g.fillStyle = '#57627a'; g.fillRect(jx + jw / 2 - 3, jy + jh, 6, standTop - jy - jh + 10);
    // ---- light towers ----
    for (const lx of [0.08, 0.92]) {
      g.fillStyle = '#2c3646';
      g.fillRect(W * lx - 3 * s, standTop - H * 0.1, 6 * s, H * 0.16);
      g.fillStyle = space > 0.01 ? '#ffeccf' : '#fff8dc';
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.arc(W * lx + (i - 1.5) * 9 * s, standTop - H * 0.1, 3.4 * s, 0, TAU); g.fill();
      }
    }
    // ---- outfield wall ----
    const wallY = VY + H * 0.015;
    g.fillStyle = '#1d4ed8';
    g.beginPath();
    g.moveTo(0, wallY + 20 * s); g.quadraticCurveTo(W / 2, wallY - 14 * s, W, wallY + 20 * s);
    g.lineTo(W, wallY + 34 * s); g.quadraticCurveTo(W / 2, wallY, 0, wallY + 34 * s);
    g.closePath(); g.fill();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 3 * s;
    g.beginPath(); g.moveTo(0, wallY + 20 * s); g.quadraticCurveTo(W / 2, wallY - 14 * s, W, wallY + 20 * s); g.stroke();
    // ---- field: grass with converging mow stripes ----
    const fg = g.createLinearGradient(0, wallY, 0, H);
    fg.addColorStop(0, '#4f9e46'); fg.addColorStop(1, '#2c6e28');
    g.fillStyle = fg; g.fillRect(0, wallY + 22 * s, W, H);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = -4; i <= 4; i += 2) {
      g.beginPath();
      g.moveTo(VX + i * W * 0.055, wallY + 22 * s);
      g.lineTo(VX + i * W * 0.19, H);
      g.lineTo(VX + (i + 1) * W * 0.19, H);
      g.lineTo(VX + (i + 1) * W * 0.055, wallY + 22 * s);
      g.closePath(); g.fill();
    }
    // infield dirt arc + mound
    g.fillStyle = '#b08652';
    g.beginPath(); g.ellipse(VX, H * 0.62, W * 0.34, H * 0.13, 0, 0, TAU); g.fill();
    g.fillStyle = '#4f9e46';
    g.beginPath(); g.ellipse(VX, H * 0.645, W * 0.22, H * 0.075, 0, 0, TAU); g.fill();
    const moundY = H * 0.545;
    g.fillStyle = '#c09763';
    g.beginPath(); g.ellipse(VX, moundY, 34 * s, 10 * s, 0, 0, TAU); g.fill();
    // home plate area
    const plateY = H * 0.9;
    g.fillStyle = '#b08652';
    g.beginPath(); g.ellipse(VX, plateY, 120 * s, 34 * s, 0, 0, TAU); g.fill();
    g.fillStyle = '#f2ece2';
    g.save(); g.translate(VX, plateY - 2 * s); g.scale(1, 0.5); g.rotate(Math.PI / 4);
    g.fillRect(-11 * s, -11 * s, 22 * s, 22 * s); g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2.5 * s;
    g.strokeRect(VX - 74 * s, plateY - 26 * s, 46 * s, 46 * s);
    g.strokeRect(VX + 28 * s, plateY - 26 * s, 46 * s, 46 * s);
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
    // ---- pitcher on the mound (tiny, facing us) ----
    const wind = this.phase === 'windup' ? Math.sin(this.phaseT / this.windupT * Math.PI) : 0;
    g.fillStyle = '#e0e4e8'; g.strokeStyle = '#14100a'; g.lineWidth = 2;
    g.beginPath(); g.arc(VX, moundY - 22 * s, 8 * s, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#c0392b';
    g.beginPath(); g.arc(VX, moundY - 27 * s, 4.5 * s, Math.PI, TAU); g.fill();
    g.lineCap = 'round'; g.lineWidth = 3.5 * s; g.strokeStyle = '#e0e4e8';
    g.beginPath(); g.moveTo(VX, moundY - 16 * s);
    g.lineTo(VX + 8 * s, moundY - 12 * s - wind * 16 * s); g.stroke();
    // ---- the pitch: ball flies AT the camera ----
    if (this.phase === 'throw' && !this.swung) {
      const f = Math.min(1.12, this.phaseT / this.travelT);
      const bx = VX + this.pitchDrift * W * f;
      const by = lerp(moundY - 20 * s, plateY - 46 * s, Math.pow(f, 1.25));
      const br = lerp(3.5, 20, Math.pow(f, 1.6)) * s;
      g.fillStyle = '#f2ece2'; g.strokeStyle = '#c0392b'; g.lineWidth = Math.max(1.5, br * 0.14);
      g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill();
      g.beginPath(); g.arc(bx, by, br * 0.72, -0.6, 1.2); g.stroke();
      g.beginPath(); g.arc(bx, by, br * 0.72, Math.PI - 0.6, Math.PI + 1.2); g.stroke();
    }
    // ---- the hit: ball rockets away toward (past) the wall ----
    if (this.phase === 'flight' && this.flight) {
      const fl = this.flight, f = clamp(fl.t / fl.dur, 0, 1);
      const arcX = VX + (this.rngSeen || 0);
      const bx = lerp(VX - 20 * s, VX + W * 0.06, f);
      const rise = fl.tier >= 2 ? H * 0.32 : fl.tier === 1 ? H * 0.22 : H * 0.12;
      const by = lerp(plateY - 60 * s, VY - rise, Math.pow(f, 0.7));
      const br = lerp(16, fl.tier >= 2 ? 1.2 : 2.2, Math.pow(f, 0.8)) * s;
      // streak trail
      g.strokeStyle = fl.tier >= 2 ? 'rgba(143,208,255,0.7)' : fl.tier === 1 ? 'rgba(255,210,63,0.6)' : 'rgba(255,255,255,0.45)';
      g.lineWidth = br * 0.9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(lerp(VX - 20 * s, bx, 0.75), lerp(plateY - 60 * s, by, 0.72)); g.lineTo(bx, by); g.stroke();
      g.fillStyle = '#f2ece2';
      g.beginPath(); g.arc(bx, by, Math.max(1, br), 0, TAU); g.fill();
    }
    // ---- the batter: our diver, from behind, bottom-left box ----
    const swingAge = this.tt - this.swingT;
    const batAngle = swingAge < 0.16 ? lerp(-2.3, 1.1, swingAge / 0.16) :
      (this.phase === 'windup' || this.phase === 'throw') ? -2.1 - this.charge * 0.45 + Math.sin(this.tt * 10) * this.charge * 0.05 : -1.9;
    drawDiverBack(g, {
      x: VX - 52 * s, y: plateY - 34 * s, scale: 2.1 * s, color: this.runner.color,
      t: this.tt, pose: 'bat', batAngle, crouch: this.charge * 0.4,
    });
    // ---- power meter + hint ----
    const mw = Math.min(240, W * 0.5);
    g.fillStyle = 'rgba(20,26,40,0.75)'; g.fillRect(W / 2 - mw / 2, H - 40, mw, 15);
    g.fillStyle = this.charge > 0.85 ? '#ff5f5f' : this.charge > 0.5 ? '#ffd23f' : '#7dff6a';
    g.fillRect(W / 2 - mw / 2, H - 40, mw * this.charge, 15);
    g.strokeStyle = '#ffeccf'; g.lineWidth = 2; g.strokeRect(W / 2 - mw / 2, H - 40, mw, 15);
    g.textAlign = 'center'; g.font = '700 12px system-ui'; g.fillStyle = '#ffeccf';
    g.fillText('HOLD = CHARGE · RELEASE = SWING', W / 2, H - 48);
    // ---- HUD ----
    g.textAlign = 'left'; g.font = '800 18px system-ui';
    g.fillStyle = '#14100a';
    g.fillText('⚾ ' + this.score + 'm', 14, 30);
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
