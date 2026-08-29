// RUSH HOUR — first-person behind the wheel, three lanes at sunset.
// Traffic comes AT you; swipe to change lanes, survive the longest. Obstacles
// ramp up and sometimes block two lanes at once. Your hands turn the wheel.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';
import { skinTone } from '../character.js?v=31';

const LANES = 3, MAX_T = 120;                 // nobody outruns rush hour forever
const OUTLINE = '#14100a';
const CAR_COLS = ['#4d9de0', '#3a9d5c', '#9d5cd0', '#e08bd0', '#57534e', '#e04040'];

export default {
  id: 'rush', name: 'Rush Hour', icon: '🚗',
  desc: 'Behind the wheel. Swipe lanes, dodge traffic, survive.',
  howto: {
    goal: 'Three lanes of oncoming traffic — SWIPE to change lanes and dodge everything. Traffic gets thicker and faster, and trucks block TWO lanes at once. Longest survival wins. There is always a way through.',
    touch: 'SWIPE left / right to change lanes (tilt works too)',
    keys: 'P1: A/D or ◀ ▶ · P2: arrow keys',
    tip: 'Watch the far lanes — the gap moves one lane at a time, so never get cornered against the wall.',
  },
  create(ctx) { return new RushGame(ctx); }
};

const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };
// bots "drive" off-screen: survival time from skill, same ramp nobody escapes
function botTime(seed, skill) {
  const rng = mulberry32(seed);
  return Math.min(MAX_T, Math.round((14 + skill * 38 + rng() * 26) * 10) / 10);
}

class RushGame {
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
      return { p: b, t: botTime((ctx.seed ^ bh) >>> 0, 0.35 + (bh % 100) / 200) };
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
    this.runT = 0;
    this.lane = 1; this.camL = 1;             // start center
    this.wheel = 0; this.steerHeld = 0;
    this.obs = [];                            // {lane, span, z, kind, col}
    this.gap = 1;                             // the guaranteed-open lane walks ±1
    this.spawnAcc = 1.2;
    this.scroll = 0; this.shake = 0; this.nearFx = 0;
    this.crashT = -1;
    this.state = 'run'; this.stateT = 0;
    this.ctx.audio.sfx.zone();
  }
  pop(txt, col, big) { this.pops.push({ txt, col: col || '#ffeccf', t: 0, dur: 1.1, big: !!big }); }
  // difficulty curves — "more frequent over time", speed too
  speedAt(t) { return 0.55 + Math.min(0.75, t * 0.011); }        // road z/sec
  gapAt(t) { return Math.max(0.5, 1.55 - t * 0.018); }           // sec between waves
  twoWideP(t) { return t < 12 ? 0 : Math.min(0.4, (t - 12) * 0.02); }

  spawnWave() {
    const t = this.runT;
    // the open lane random-walks so the way through is always reachable
    const moves = [this.gap];
    if (this.gap > 0) moves.push(this.gap - 1);
    if (this.gap < LANES - 1) moves.push(this.gap + 1);
    this.gap = moves[Math.floor(this.rng() * moves.length)];
    const closed = [0, 1, 2].filter(l => l !== this.gap);
    if (this.rng() < this.twoWideP(t) && Math.abs(closed[0] - closed[1]) === 1) {
      // a truck straddling both closed lanes
      this.obs.push({ lane: Math.min(closed[0], closed[1]), span: 2, z: 1, kind: 'truck', col: '#8a95a5' });
    } else {
      const one = closed[Math.floor(this.rng() * 2)];
      const kind = this.rng() < 0.22 ? 'cone' : 'car';
      this.obs.push({ lane: one, span: 1, z: 1, kind, col: CAR_COLS[Math.floor(this.rng() * CAR_COLS.length)] });
      // second single-lane blocker sometimes, on the other closed lane
      if (this.rng() < Math.min(0.55, t * 0.02)) {
        const other = closed.find(l => l !== one);
        this.obs.push({ lane: other, span: 1, z: 1.18, kind: this.rng() < 0.3 ? 'cone' : 'car', col: CAR_COLS[Math.floor(this.rng() * CAR_COLS.length)] });
      }
    }
  }
  shiftLane(dir) {
    const nl = clamp(this.lane + dir, 0, LANES - 1);
    if (nl === this.lane) return;
    this.lane = nl;
    this.ctx.audio.sfx.dash();
  }

  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
    this.shake *= Math.exp(-6 * rdt);
    this.nearFx = Math.max(0, this.nearFx - rdt * 2);
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
          this.results.push({ id: r.id, score: s ? s.n : 0, label: (s ? s.n : 0) + 's', name: r.name, color: r.color });
        }
        for (const bt of this.bots)
          this.results.push({ id: bt.p.id, score: bt.t, label: bt.t + 's', name: bt.p.name, color: bt.p.color });
        this.ctx.end(this.results);
      }
      return;
    }
    // ---- crashed: short wreck beat, then next runner (practice: dust off) ----
    if (this.crashT >= 0) {
      this.crashT += rdt;
      if (this.crashT > 1.4) {
        if (this.practice) {
          this.obs = []; this.crashT = -1; this.gap = 1; this.spawnAcc = 1;
          this.pop('practice — back on the road!', '#7dff6a');
        } else {
          const t = Math.round(this.runT * 10) / 10;
          this.results.push({ id: this.runner.id, score: t, label: t + 's', name: this.runner.name, color: this.runner.color });
          if (this.online) this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: t, done: true });
          this.nextRunner();
        }
      }
      return;
    }
    // ---- driving ----
    this.runT += rdt;
    const spd = this.speedAt(this.runT);
    this.scroll = (this.scroll + spd * rdt * 1.6) % 1;
    // swipe / tilt / keys → lane change with hysteresis (one shift per flick)
    const inp = this.ctx.input(this.runner.slot, rdt);
    if (!this.steerHeld && Math.abs(inp.x) > 0.45) { this.steerHeld = Math.sign(inp.x); this.shiftLane(this.steerHeld); }
    if (Math.abs(inp.x) < 0.22) this.steerHeld = 0;
    // camera glides to the lane; the wheel turns to match the swipe
    const prevCam = this.camL;
    this.camL += (this.lane - this.camL) * Math.min(1, rdt * 7);
    const turning = (this.camL - prevCam) / Math.max(rdt, 0.0001);
    this.wheel += (clamp(turning * 0.22, -1.15, 1.15) - this.wheel) * Math.min(1, rdt * 10);
    // spawn waves
    this.spawnAcc += rdt;
    if (this.spawnAcc >= this.gapAt(this.runT)) { this.spawnAcc = 0; this.spawnWave(); }
    // advance obstacles
    for (let i = this.obs.length; i--;) {
      const o = this.obs[i];
      const was = o.z;
      o.z -= spd * rdt;
      if (o.z <= 0.06 && was > 0.06) {
        // it reaches the windshield: hit or near-miss
        const inPath = this.lane >= o.lane && this.lane < o.lane + o.span;
        if (inPath) {
          this.crashT = 0; this.shake = 14;
          this.ctx.audio.sfx.crash(); this.ctx.audio.sfx.death();
          this.pop('CRASH! ' + (Math.round(this.runT * 10) / 10) + 's', '#ff5f5f', true);
        } else if (Math.abs((o.lane + (o.span - 1) / 2) - this.lane) < 1.6) {
          this.nearFx = 1; this.ctx.audio.sfx.whoosh();
        }
      }
      if (o.z <= -0.15) this.obs.splice(i, 1);
    }
    if (this.runT >= MAX_T && this.crashT < 0) {
      this.crashT = 0; this.pop('MAX RUSH! ' + MAX_T + 's', '#ffd23f', true);
    }
    this.ctx.audio.setMusicIntensity(0.45 + Math.min(0.45, this.runT * 0.006));
    if (this.online) {
      this._nAcc = (this._nAcc || 0) + rdt;
      if (this._nAcc > 0.5) { this._nAcc = 0; this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: Math.round(this.runT * 10) / 10, done: false }); }
    }
  }

  /* ---------------- render ---------------- */
  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    const hy = H * 0.42;                       // horizon
    const dashTop = H * 0.78;                  // dashboard starts here
    g.save();
    if (this.shake > 0.4) g.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake * 0.6);
    // sunset sky
    const sky = g.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, '#2b1f4d'); sky.addColorStop(0.55, '#c94f6d'); sky.addColorStop(1, '#ff9d5c');
    g.fillStyle = sky; g.fillRect(0, 0, W, hy + 2);
    g.fillStyle = '#ffd76a';
    g.beginPath(); g.arc(W / 2, hy - H * 0.015, H * 0.05, Math.PI, TAU); g.fill();
    // city silhouette
    g.fillStyle = '#3a2350';
    const bseed = mulberry32(99);
    for (let x = 0; x < W; x += W / 22) {
      const bh = (0.35 + bseed() * 0.65) * H * 0.07;
      g.fillRect(x, hy - bh, W / 26, bh);
    }
    // ground + road
    g.fillStyle = '#5a4a52'; g.fillRect(0, hy, W, dashTop - hy + 4);
    const halfW = z => lerp(W * 0.85, W * 0.012, Math.pow(clamp(z, 0, 1), 0.62));
    const yAt = z => lerp(dashTop + H * 0.05, hy, Math.pow(clamp(z, 0, 1), 0.62));
    const laneX = (lf, z) => W / 2 + (lf - this.camL) * halfW(z) * 0.62;
    // asphalt
    g.fillStyle = '#3c3a42';
    g.beginPath();
    g.moveTo(laneX(-0.62, 0), yAt(0)); g.lineTo(laneX(-0.62, 1), yAt(1));
    g.lineTo(laneX(2.62, 1), yAt(1)); g.lineTo(laneX(2.62, 0), yAt(0));
    g.closePath(); g.fill();
    // edge lines
    g.strokeStyle = '#ffeccf'; g.lineWidth = 3;
    for (const e of [-0.58, 2.58]) {
      g.beginPath(); g.moveTo(laneX(e, 0), yAt(0)); g.lineTo(laneX(e, 1), yAt(1)); g.stroke();
    }
    // dashed lane dividers, animated toward the camera
    g.strokeStyle = '#ffd23f';
    for (const b of [0.5, 1.5]) {
      for (let m = 0; m < 9; m++) {
        const z0 = ((m / 9 + (1 - this.scroll)) % 1);
        const z1 = z0 + 0.045;
        if (z1 > 1) continue;
        g.lineWidth = lerp(7, 1, Math.pow(z0, 0.62));
        g.beginPath(); g.moveTo(laneX(b, z0), yAt(z0)); g.lineTo(laneX(b, z1), yAt(z1)); g.stroke();
      }
    }
    // obstacles, far to near
    const obs = [...this.obs].sort((a, b) => b.z - a.z);
    for (const o of obs) {
      if (o.z > 1 || o.z < 0.02) continue;
      const zc = clamp(o.z, 0.02, 1);
      const cx = laneX(o.lane + (o.span - 1) / 2, zc), cy = yAt(zc);
      const wUnit = halfW(zc) * 0.62;
      const ww = wUnit * (o.span === 2 ? 1.72 : 0.78);
      this.drawObstacle(g, o, cx, cy, ww);
    }
    // near-miss whoosh vignette
    if (this.nearFx > 0) {
      g.globalAlpha = this.nearFx * 0.25;
      g.fillStyle = '#fff'; g.fillRect(0, hy, W, dashTop - hy);
      g.globalAlpha = 1;
    }
    // crash flash
    if (this.crashT >= 0 && this.crashT < 0.35) {
      g.globalAlpha = 1 - this.crashT / 0.35;
      g.fillStyle = '#ff5f5f'; g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    this.drawDash(g, W, H, dashTop);
    g.restore();
    // HUD
    g.textAlign = 'center';
    if (this.state === 'run' || this.crashT >= 0) {
      g.font = '900 30px system-ui';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      const msg = (Math.round(this.runT * 10) / 10).toFixed(1) + 's';
      g.strokeText(msg, W / 2, 44);
      g.fillStyle = '#ffeccf'; g.fillText(msg, W / 2, 44);
    }
    if (this.state === 'ready' && this.runner) {
      g.font = '900 26px system-ui'; g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      const m1 = this.runner.name + ' — TAP TO DRIVE';
      g.strokeText(m1, W / 2, H * 0.32);
      g.fillStyle = this.runner.color; g.fillText(m1, W / 2, H * 0.32);
    }
    if (this.state === 'wait') {
      g.font = '800 20px system-ui'; g.fillStyle = '#ffeccf';
      g.fillText(this.online ? 'waiting for the other drivers…' : '…', W / 2, H * 0.32);
    }
    g.font = '800 14px system-ui'; g.fillStyle = '#ffeccf'; g.textAlign = 'left';
    g.fillText(this.practice ? 'PRACTICE' : (this.runner ? this.runner.name : ''), 12, 24);
    for (const p of this.pops) {
      const f = 1 - p.t / p.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + (p.big ? 32 : 18) + 'px system-ui'; g.textAlign = 'center';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      g.strokeText(p.txt, W / 2, H * 0.26 - p.t * 40);
      g.fillStyle = p.col; g.fillText(p.txt, W / 2, H * 0.26 - p.t * 40);
    }
    g.globalAlpha = 1;
  }
  drawObstacle(g, o, cx, cy, ww) {
    g.strokeStyle = OUTLINE; g.lineWidth = Math.max(1.5, ww * 0.045);
    if (o.kind === 'cone') {
      const h = ww * 0.9;
      g.fillStyle = '#ff7a2f';
      g.beginPath(); g.moveTo(cx, cy - h); g.lineTo(cx + ww * 0.42, cy); g.lineTo(cx - ww * 0.42, cy);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.fillRect(cx - ww * 0.26, cy - h * 0.5, ww * 0.52, h * 0.16);
      return;
    }
    const hh = o.kind === 'truck' ? ww * 0.62 : ww * 0.52;
    // tires
    g.fillStyle = '#1c1a20';
    g.fillRect(cx - ww * 0.46, cy - hh * 0.16, ww * 0.16, hh * 0.22);
    g.fillRect(cx + ww * 0.30, cy - hh * 0.16, ww * 0.16, hh * 0.22);
    // body
    g.fillStyle = o.kind === 'truck' ? o.col : o.col;
    rr(g, cx - ww * 0.44, cy - hh, ww * 0.88, hh, ww * 0.08); g.fill(); g.stroke();
    if (o.kind === 'truck') {   // container back doors
      g.strokeStyle = 'rgba(20,16,10,0.5)'; g.lineWidth = Math.max(1, ww * 0.02);
      g.beginPath(); g.moveTo(cx, cy - hh * 0.95); g.lineTo(cx, cy - hh * 0.08); g.stroke();
      g.strokeStyle = OUTLINE;
    } else {                    // rear window
      g.fillStyle = '#26323c';
      rr(g, cx - ww * 0.3, cy - hh * 0.92, ww * 0.6, hh * 0.3, ww * 0.05); g.fill();
    }
    // taillights — glowing, this is what you read at distance
    g.fillStyle = '#ff3830';
    g.fillRect(cx - ww * 0.4, cy - hh * 0.42, ww * 0.14, hh * 0.14);
    g.fillRect(cx + ww * 0.26, cy - hh * 0.42, ww * 0.14, hh * 0.14);
  }
  drawDash(g, W, H, dashTop) {
    // dashboard body
    const grd = g.createLinearGradient(0, dashTop, 0, H);
    grd.addColorStop(0, '#241f2b'); grd.addColorStop(1, '#141118');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, H); g.lineTo(0, dashTop + H * 0.04);
    g.quadraticCurveTo(W / 2, dashTop - H * 0.03, W, dashTop + H * 0.04);
    g.lineTo(W, H); g.closePath(); g.fill();
    g.strokeStyle = OUTLINE; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, dashTop + H * 0.04);
    g.quadraticCurveTo(W / 2, dashTop - H * 0.03, W, dashTop + H * 0.04); g.stroke();
    // steering wheel (bottom-center, partially off-screen) turning with the swipe
    const wx = W / 2, wy = H + H * 0.06, wr = Math.min(W, H) * 0.30;
    const ang = this.wheel * 0.9;
    g.save(); g.translate(wx, wy); g.rotate(ang);
    g.strokeStyle = '#0e0c12'; g.lineWidth = wr * 0.16;
    g.beginPath(); g.arc(0, 0, wr, 0, TAU); g.stroke();
    g.strokeStyle = '#2e2936'; g.lineWidth = wr * 0.11;
    g.beginPath(); g.arc(0, 0, wr, 0, TAU); g.stroke();
    // spokes + hub
    g.strokeStyle = '#0e0c12'; g.lineWidth = wr * 0.09;
    for (const a of [-0.42, Math.PI + 0.42, Math.PI - 0.42, 0.42]) {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * wr * 0.92, Math.sin(a) * wr * 0.92); g.stroke();
    }
    g.fillStyle = '#1c1822';
    g.beginPath(); g.arc(0, 0, wr * 0.2, 0, TAU); g.fill();
    // HANDS at 9 and 3 — the runner's skin tone, gripping, turning with the wheel
    const skin = skinTone(this.runner && this.runner.skin != null ? this.runner.skin : 35);
    for (const s of [-1, 1]) {
      const hxp = s * wr, hyp = 0;
      g.fillStyle = skin; g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(hxp, hyp, wr * 0.13, wr * 0.185, s * 0.25, 0, TAU); g.fill(); g.stroke();
      // knuckles
      g.fillStyle = 'rgba(20,16,10,0.18)';
      for (let k = -1; k <= 1; k++) {
        g.beginPath(); g.arc(hxp + s * wr * 0.045, hyp + k * wr * 0.075, wr * 0.028, 0, TAU); g.fill();
      }
    }
    g.restore();
    // forearms from the bottom corners to the hands (unrotated space, they follow)
    const skin2 = skinTone(this.runner && this.runner.skin != null ? this.runner.skin : 35);
    g.strokeStyle = skin2; g.lineWidth = wr * 0.14; g.lineCap = 'round';
    for (const s of [-1, 1]) {
      const hx2 = wx + Math.cos(ang) * s * wr, hy2 = wy + Math.sin(ang) * s * wr;
      g.beginPath(); g.moveTo(wx + s * W * 0.32, H + 8); g.lineTo(hx2, hy2); g.stroke();
    }
    // sleeve cuffs in the runner's color
    if (this.runner) {
      g.strokeStyle = this.runner.color; g.lineWidth = wr * 0.15;
      for (const s of [-1, 1]) {
        const hx2 = wx + Math.cos(ang) * s * wr, hy2 = wy + Math.sin(ang) * s * wr;
        const bx = wx + s * W * 0.32, by = H + 8;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(lerp(bx, hx2, 0.3), lerp(by, hy2, 0.3)); g.stroke();
      }
    }
  }
  dispose() { }
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r); g.closePath();
}
