// HOME RUN HEROES — batter's-POV slugging (MLB The Show camera, Flick Home Run soul).
// The pitch comes AT you; HOLD to charge, RELEASE at the plate. Great contact at
// full charge doesn't just clear the wall — it leaves the stadium, the sky, Earth.
import { TAU, clamp, lerp, mulberry32, mixHex } from '../util.js';
import { drawBatter } from '../character.js?v=38';

const PITCHES = 10;
const FL_INTRO = 0.55, FL_HOLD = 0.65;   // batter-POV departure, then rest-at-distance hold

export default {
  id: 'homerun', name: 'Home Run Heroes', icon: '⚾',
  desc: 'Batter\'s-eye view. Charge, time it, leave the planet.',
  howto: {
    goal: PITCHES + ' pitches, batter\'s-eye view. HOLD to charge your swing, RELEASE right as the ball reaches the plate. Total distance wins — perfect contact at full charge can leave the stadium… and the atmosphere.',
    touch: 'HOLD a finger to charge · RELEASE to swing',
    keys: 'P1: hold SPACE · P2: hold ENTER',
    tip: 'The ball flies into the glowing ring at the plate — RELEASE the moment it fills the ring. Green ring = swing now!',
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
    this.travelT = 1.15 + this.rng() * 0.6;
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
        const q = Math.max(0, 1 - err / 0.18);   // forgiving window — the ring cue makes it learnable
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
          // side-chase camera: the ball flies OUT horizontally; scenery passes by
          const deco = { clouds: [], waves: [], birdsM: dist > 420 ? 380 + this.rng() * 100 : 0, aliens: [] };
          for (let m = 60; m < dist + 240; m += 14 + this.rng() * 10) deco.waves.push({ m, w: 0.05 + this.rng() * 0.06 });
          for (let m = 150; m < dist + 200; m += 55 + this.rng() * 45) deco.clouds.push({ m, yf: 0.08 + this.rng() * 0.3, s: 0.7 + this.rng() * 0.8 });
          if (dist > 900) deco.aliens.push(860 + this.rng() * 140);
          if (dist > 1700) deco.aliens.push(1450 + this.rng() * 300);
          this.flight = {
            t: 0, dist, tier, dur: 1.4 + Math.min(3, dist / 320), shown: 0, deco,
            boatM: 140 + this.rng() * 90, splashed: false, rot: 0, prevShown: 0,
          };
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
      // stage A (batter POV, ball departs) → stage B (ball-centered chase).
      // Distance eases OUT: the world and the ball's spin decelerate together.
      const u = clamp((fl.t - FL_INTRO) / fl.dur, 0, 1);
      const ease = 1 - Math.pow(1 - u, 3);
      fl.shown = Math.round(fl.dist * ease);
      fl.rot += (fl.shown - fl.prevShown) * 0.055;   // spin ∝ ground speed
      fl.prevShown = fl.shown;
      // milestone stingers as the counter climbs
      if (!fl.m1 && fl.shown > 120) { fl.m1 = true; this.ctx.audio.sfx.pow(); this.pop('HOME RUN!', 50, 40, '#7dff6a', 30); }
      if (!fl.m2 && fl.shown > 300) { fl.m2 = true; this.ctx.audio.sfx.win(); this.pop('OUT OF THE PARK!!', 50, 34, '#ffd23f', 32); }
      if (!fl.m3 && fl.shown > 800) { fl.m3 = true; this.spaceFx = 1; this.ctx.audio.sfx.zone(); this.pop('🚀 INTO SPACE!!!', 50, 28, '#8fd0ff', 34, 1.6); }
      if (fl.t >= FL_INTRO + fl.dur + FL_HOLD) { const d = fl.dist; this.flight = null; this.afterPitch(d); }
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

  /* side-chase cam: the ball tears away HORIZONTALLY — out of the park, across
     the ocean, up through the clouds, and (on a moonshot) clean out of the sky */
  renderFlight(g, W, H, s) {
    const fl = this.flight, shown = fl.shown, t = fl.t;
    const u = clamp((t - FL_INTRO) / fl.dur, 0, 1);      // eased world progress lives in update()
    const resting = u >= 1;
    const ppm = W / 230;                                 // px per meter of scenery
    const bx = W / 2, ballCY = H * 0.45;                 // the ball IS the center of the world
    const xOf = m => bx + (m - shown) * ppm;
    // arc height: normal hits rise then settle to the water; moonshots keep climbing
    const peak = fl.tier >= 2 ? H * 0.6 : fl.tier === 1 ? H * 0.4 : H * 0.24;
    let hPx;
    if (fl.tier >= 2) hPx = peak * Math.pow(u, 0.55);
    else hPx = Math.max(0, peak * Math.sin(Math.PI * Math.min(1, u * 1.04)));
    // the WORLD moves; the ball doesn't: sea line sits below by the ball's altitude
    const seaY = ballCY + 30 * s + hPx;
    // sky: day → space as the ball climbs
    const spaceF = clamp((hPx - H * 0.35) / (H * 0.3), 0, 1) * (fl.tier >= 2 ? 1 : 0.25);
    const grd = g.createLinearGradient(0, 0, 0, seaY);
    grd.addColorStop(0, mixHex('#4d86c9', '#04050e', spaceF));
    grd.addColorStop(1, mixHex('#a8cdec', '#1a2440', spaceF));
    g.fillStyle = grd; g.fillRect(0, 0, W, Math.min(H, seaY));
    if (spaceF > 0.25) {
      g.fillStyle = 'rgba(255,255,255,' + (0.85 * spaceF) + ')';
      for (let i = 0; i < 46; i++) {
        const fr = Math.sin(i * 127.1) * 43758.5453, f2 = fr - Math.floor(fr);
        const fr2 = Math.sin(i * 311.7) * 12543.2, f3 = fr2 - Math.floor(fr2);
        g.fillRect(((f2 * W * 2 - shown * 0.15) % W + W) % W, f3 * seaY * 0.9, 2, 2);
      }
    }
    // the OCEAN — a real horizontal water surface the ball flies over
    if (seaY < H + 60) {
      const og = g.createLinearGradient(0, seaY, 0, H + 80);
      og.addColorStop(0, '#3f8fd4'); og.addColorStop(1, '#123a6e');
      g.fillStyle = og; g.fillRect(0, seaY, W, H - seaY + 80);
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2.5 * s; g.lineCap = 'round';
      for (const wv of fl.deco.waves) {
        const x = xOf(wv.m);
        if (x < -40 || x > W + 40) continue;
        const y = seaY + 10 * s + ((wv.m * 37) % 40) / 40 * (H - seaY) * 0.5;
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + wv.w * W * 0.5, y - 5 * s, x + wv.w * W, y); g.stroke();
      }
    }
    // the stadium sliding away behind (at m≈0-110)
    const sx0 = xOf(-30);
    if (xOf(130) > -60) {
      // bowl of stands
      g.fillStyle = '#57627a';
      g.beginPath();
      g.moveTo(xOf(-40), seaY);
      g.quadraticCurveTo(xOf(20), seaY - 190 * s, xOf(95), seaY - 34 * s);
      g.lineTo(xOf(95), seaY); g.closePath(); g.fill();
      g.fillStyle = '#3d4759';
      g.beginPath();
      g.moveTo(xOf(-40), seaY - 30 * s);
      g.quadraticCurveTo(xOf(15), seaY - 215 * s, xOf(80), seaY - 90 * s);
      g.lineTo(xOf(70), seaY - 40 * s);
      g.quadraticCurveTo(xOf(15), seaY - 170 * s, xOf(-40), seaY - 6 * s);
      g.closePath(); g.fill();
      // crowd specks on the bowl
      for (let i = 0; i < 26; i++) {
        const fr = Math.sin(i * 127.1) * 43758.5453, f2 = fr - Math.floor(fr);
        g.fillStyle = ['#c9a97a', '#e07326', '#9ad3ff', '#e08bd0'][i % 4];
        g.beginPath(); g.arc(xOf(-30 + f2 * 100), seaY - (40 + Math.sin(f2 * Math.PI) * 130) * s, 2.2 * s, 0, TAU); g.fill();
      }
      // outfield WALL at ~110m — the thing you clear
      g.fillStyle = '#1d4ed8';
      g.fillRect(xOf(108), seaY - 52 * s, 10 * s, 52 * s);
      g.strokeStyle = '#ffd23f'; g.lineWidth = 3 * s;
      g.beginPath(); g.moveTo(xOf(108), seaY - 52 * s); g.lineTo(xOf(108) + 10 * s, seaY - 52 * s); g.stroke();
      // light tower
      g.fillStyle = '#2c3646'; g.fillRect(xOf(15), seaY - 250 * s, 5 * s, 90 * s);
      g.fillStyle = '#fff8dc';
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(xOf(15) + (i - 1) * 9 * s + 2 * s, seaY - 250 * s, 3.2 * s, 0, TAU); g.fill(); }
    }
    // the boat, bobbing on the water as it passes
    {
      const x = xOf(fl.boatM);
      if (x > -80 && x < W + 80) {
        const by2 = seaY + 8 * s + Math.sin(t * 2.2) * 3 * s;
        g.fillStyle = '#8a5a2b';
        g.beginPath(); g.moveTo(x - 26 * s, by2); g.lineTo(x + 26 * s, by2);
        g.lineTo(x + 16 * s, by2 + 13 * s); g.lineTo(x - 16 * s, by2 + 13 * s); g.closePath(); g.fill();
        g.strokeStyle = '#5f3d1c'; g.lineWidth = 2.5 * s;
        g.beginPath(); g.moveTo(x, by2); g.lineTo(x, by2 - 30 * s); g.stroke();
        g.fillStyle = '#f2ece2';
        g.beginPath(); g.moveTo(x, by2 - 30 * s); g.lineTo(x + 20 * s, by2 - 9 * s); g.lineTo(x, by2 - 9 * s); g.closePath(); g.fill();
      }
    }
    // clouds drifting past in the sky band
    for (const cl of fl.deco.clouds) {
      const x = xOf(cl.m) * 1;
      if (x < -80 || x > W + 80) continue;
      const y = cl.yf * seaY;
      g.fillStyle = 'rgba(255,255,255,' + (0.85 - spaceF * 0.5) + ')';
      g.beginPath(); g.ellipse(x, y, 52 * s * cl.s, 15 * s * cl.s, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(x + 30 * s * cl.s, y - 9 * s * cl.s, 32 * s * cl.s, 12 * s * cl.s, 0, 0, TAU); g.fill();
    }
    // birds flap past mid-sky
    if (fl.deco.birdsM) {
      const x = xOf(fl.deco.birdsM);
      if (x > -60 && x < W + 60) {
        const y = seaY * 0.32;
        g.strokeStyle = '#14100a'; g.lineWidth = 2.5 * s;
        for (let i = 0; i < 5; i++) {
          const bx3 = x + i * 22 * s, by3 = y + Math.abs(i - 2) * 9 * s;
          const flap = Math.sin(t * 9 + i) * 5 * s;
          g.beginPath(); g.moveTo(bx3 - 8 * s, by3 - flap); g.lineTo(bx3, by3); g.lineTo(bx3 + 8 * s, by3 - flap); g.stroke();
        }
      }
    }
    // alien saucers hovering up high
    for (const am of fl.deco.aliens) {
      const x = xOf(am);
      if (x < -80 || x > W + 80) continue;
      const y = seaY * 0.16 + Math.sin(t * 3) * 6 * s, r = 30 * s;
      g.fillStyle = 'rgba(125,255,106,0.25)';
      g.beginPath(); g.ellipse(x, y + r * 0.9, r * 1.4, r * 0.5, 0, 0, TAU); g.fill();
      g.fillStyle = '#9aa6b2'; g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(x, y, r, r * 0.34, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#8fd0ff';
      g.beginPath(); g.arc(x, y - r * 0.22, r * 0.4, Math.PI, TAU); g.fill(); g.stroke();
      g.fillStyle = '#ffd23f';
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(x + i * r * 0.5, y + r * 0.16, 3 * s, 0, TAU); g.fill(); }
    }
    // the BALL — dead-center, SPINNING; spin and world-speed die down together
    const speed = 1 - u;                                    // eased progress derivative ~ this
    const landed = resting && fl.tier < 2;
    if (landed && !fl.splashed) { fl.splashed = true; this.ctx.audio.sfx.thud(0.6); }
    const drawY = landed ? seaY - 6 * s : ballCY;
    // motion streaks while the world is still rushing by
    if (speed > 0.05 && !resting) {
      g.strokeStyle = fl.tier >= 2 ? 'rgba(143,208,255,' + (0.7 * speed) + ')' : 'rgba(255,255,255,' + (0.55 * speed) + ')';
      g.lineWidth = 5 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(bx - 20 * s, drawY + 4 * s); g.lineTo(bx - (40 + 110 * speed) * s, drawY + 14 * s); g.stroke();
      g.beginPath(); g.moveTo(bx - 18 * s, drawY - 8 * s); g.lineTo(bx - (30 + 80 * speed) * s, drawY - 14 * s); g.stroke();
    }
    // resting ripples on the water
    if (landed) {
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2 * s;
      const rp = (t - FL_INTRO - fl.dur) / FL_HOLD;
      for (let i = 0; i < 2; i++) {
        const rr2 = (12 + rp * 40 + i * 16) * s;
        g.globalAlpha = Math.max(0, 0.7 - rp - i * 0.25);
        g.beginPath(); g.ellipse(bx, seaY, rr2, rr2 * 0.3, 0, 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
    }
    // the big spinning ball (rotation integrated from distance in update)
    g.save(); g.translate(bx, drawY); g.rotate(fl.rot);
    const br = (landed ? 11 : 15) * s;
    g.fillStyle = '#f2ece2'; g.strokeStyle = '#c0392b'; g.lineWidth = Math.max(2, br * 0.16);
    g.beginPath(); g.arc(0, 0, br, 0, TAU); g.fill();
    g.beginPath(); g.arc(0, 0, br * 0.7, -0.6, 1.2); g.stroke();
    g.beginPath(); g.arc(0, 0, br * 0.7, Math.PI - 0.6, Math.PI + 1.2); g.stroke();
    g.strokeStyle = '#14100a'; g.lineWidth = Math.max(1.2, br * 0.08);
    g.beginPath(); g.arc(0, 0, br, 0, TAU); g.stroke();
    g.restore();
    // live distance counter
    g.textAlign = 'center';
    g.font = '900 ' + Math.round(44 * s + 14) + 'px ui-monospace,monospace';
    g.lineWidth = 6; g.strokeStyle = 'rgba(10,8,4,0.9)';
    g.strokeText(shown + 'm', W / 2, H * 0.13);
    g.fillStyle = fl.tier >= 2 ? '#8fd0ff' : fl.tier === 1 ? '#ffd23f' : '#ffeccf';
    g.fillText(shown + 'm', W / 2, H * 0.13);
  }
  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim, s = Math.min(W, H) / 700;
    // stage B of a flight: ball-centered chase cam. Stage A falls through to the
    // normal batter POV so contact keeps its context before the camera leaves.
    if (this.state === 'run' && this.phase === 'flight' && this.flight && this.flight.t >= FL_INTRO) {
      this.renderFlight(g, W, H, s);
      this.drawPops(g, W, H);
      return;
    }
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
    // ---- the SWING ZONE: a ring at the plate the pitch flies into.
    //      The ball fills the ring exactly at the perfect swing moment. ----
    const ringX = VX + this.pitchDrift * W, ringY = plateY - 46 * s, ringR = 22 * s;
    if (this.phase === 'windup' || this.phase === 'throw') {
      const f = this.phase === 'throw' ? this.phaseT / this.travelT : 0;
      const inWindow = this.phase === 'throw' && Math.abs(f - 1) < 0.18;
      g.lineWidth = inWindow ? 5 * s : 3 * s;
      g.strokeStyle = inWindow ? '#7dff6a' : 'rgba(255,236,207,0.55)';
      if (inWindow) { g.globalAlpha = 0.75 + Math.sin(this.tt * 30) * 0.25; }
      g.beginPath(); g.arc(ringX, ringY, ringR, 0, TAU); g.stroke();
      g.globalAlpha = 0.25;
      g.beginPath(); g.arc(ringX, ringY, ringR * 0.72, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }
    // ---- the pitch: ball flies AT the camera, into the ring ----
    if (this.phase === 'throw' && !this.swung) {
      const f = Math.min(1.12, this.phaseT / this.travelT);
      const bx = lerp(VX, ringX, f);
      const by = lerp(moundY - 20 * s, ringY, Math.pow(f, 1.25));
      const br = lerp(3.5, ringR / s * 0.92, Math.pow(f, 1.45)) * s;
      g.fillStyle = '#f2ece2'; g.strokeStyle = '#c0392b'; g.lineWidth = Math.max(1.5, br * 0.14);
      g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill();
      g.beginPath(); g.arc(bx, by, br * 0.72, -0.6, 1.2); g.stroke();
      g.beginPath(); g.arc(bx, by, br * 0.72, Math.PI - 0.6, Math.PI + 1.2); g.stroke();
    }
    // ---- flight stage A: from the batter's eyes, the ball rockets away
    //      toward center field, shrinking into the sky ----
    if (this.phase === 'flight' && this.flight && this.flight.t < FL_INTRO) {
      const f = this.flight.t / FL_INTRO;
      const bx2 = lerp(VX + this.pitchDrift * W, VX + W * 0.04, f);
      const by2 = lerp(plateY - 46 * s, VY - H * (0.06 + this.flight.tier * 0.05), Math.pow(f, 0.8));
      const br2 = lerp(20, 4, Math.pow(f, 0.7)) * s;
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = br2 * 0.8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(lerp(VX, bx2, 0.6), lerp(plateY - 46 * s, by2, 0.55)); g.lineTo(bx2, by2); g.stroke();
      g.fillStyle = '#f2ece2'; g.strokeStyle = '#c0392b'; g.lineWidth = Math.max(1.2, br2 * 0.16);
      g.beginPath(); g.arc(bx2, by2, br2, 0, TAU); g.fill(); g.stroke();
    }
    // ---- the batter: sideways in the box, real cut ----
    const swingAge = this.tt - this.swingT;
    const swing = swingAge >= 0 && swingAge < 0.3 ? swingAge / 0.3 : null;
    drawBatter(g, {
      x: VX - 58 * s, y: plateY - 36 * s, scale: 2.2 * s, color: this.runner.color, skin: this.runner.skin, ward: this.runner.ward,
      t: this.tt, charge: (this.phase === 'windup' || this.phase === 'throw') ? this.charge : 0,
      swing,
    });
    // swoosh arc at the moment of contact
    if (swing != null && swing > 0.25 && swing < 0.75) {
      g.globalAlpha = 1 - Math.abs(swing - 0.5) * 3;
      g.strokeStyle = '#fff'; g.lineWidth = 5 * s; g.lineCap = 'round';
      g.beginPath(); g.arc(VX - 50 * s, plateY - 46 * s, 52 * s, -0.9, 0.7); g.stroke();
      g.globalAlpha = 1;
    }
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
    this.drawPops(g, W, H);
  }
  drawPops(g, W, H) {
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
