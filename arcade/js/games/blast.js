// BOTTLE BLASTERS — farm skeet shoot. Cans fly like clay pigeons; tap/click to blast.
// MP: same seeded can stream for everyone, spawn rate ramps up, most points in 75s.
// Solo: countdown clock — green CLOCK cans add +5s. Survive on luck and aim.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';

const T_LIMIT = 75, SOLO_START = 30, FIRE_CD = 0.22;

export default {
  id: 'blast', name: 'Bottle Blasters', icon: '🥫',
  desc: 'Farm skeet shoot. Tap to blast the flying cans.',
  howto: {
    goal: 'Cans fly up like clay pigeons — TAP them to blast them! Gold cans are worth 3. Multiplayer: most points in 75s (it gets frantic). Solo: the clock is always draining — shoot the green CLOCK cans for +4s and see how long you last.',
    touch: 'TAP where you want to shoot',
    keys: 'CLICK to shoot',
    tip: 'Your shotgun needs a beat between shots — lead the cans, don\'t spray.',
  },
  create(ctx) { return new BlastGame(ctx); }
};

function botTimeline(seed, skill, solo) {
  // bots shoot the same seeded stream: replay spawns, hit with p(skill)
  const rng = mulberry32(seed);
  const evs = []; let t = 0.8;
  while (t < T_LIMIT) {
    const ramp = 1 + (t / T_LIMIT) * 1.6;
    t += (0.95 / ramp) * (0.7 + rng() * 0.6);
    const gold = rng() < 0.18;
    if (rng() < 0.55 + skill * 0.3) evs.push({ t: t + 0.9 + rng() * 0.9, pts: gold ? 3 : 1 });
  }
  return evs;
}
const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

class BlastGame {
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
    this.clicks = []; this.aim = null;
    this._pd = e => { this.clicks.push([e.clientX, e.clientY]); this.aim = [e.clientX, e.clientY]; };
    this._pm = e => { this.aim = [e.clientX, e.clientY]; };
    ctx.cv.addEventListener('pointerdown', this._pd);
    ctx.cv.addEventListener('pointermove', this._pm);
    this.pops = []; this.shards = []; this.flashes = [];
    this.cans = []; this.score = 0; this.combo = 0; this.clock = 0;  // render-safe before startRun
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
    this.cans = []; this.score = 0; this.hits = 0; this.combo = 0; this.comboT = 0;
    this.runT = 0; this.spawnAcc = 0.5; this.fireCd = 0;
    this.clock = this.solo ? SOLO_START : T_LIMIT;
    this.clicks.length = 0;
    for (const b of this.bots) { b.n = 0; b.i = 0; }
    this.state = 'run'; this.stateT = 0;
  }
  pop(txt, x, y, col, size) { this.pops.push({ txt, x, y, t: 0, dur: 0.8, col: col || '#ffd23f', size: size || 20 }); }

  spawn(forceType) {
    const { W, H } = this.ctx.dim, s = Math.min(W, H) / 700;
    const side = this.rng() < 0.5 ? -1 : 1;
    const x = W / 2 + side * (W * 0.2 + this.rng() * W * 0.3);
    let type = forceType || (this.rng() < 0.18 ? 'gold' : 'can');
    const speed = type === 'gold' ? 1.25 : 1;
    this.cans.push({
      x, y: H * 0.86,
      vx: -side * (60 + this.rng() * 120) * s * speed,
      vy: -(520 + this.rng() * 260) * s * speed,
      r: (type === 'gold' ? 17 : 21) * s, type,
      rot: this.rng() * TAU, vr: (this.rng() - 0.5) * 8,
    });
  }
  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    for (let i = this.shards.length; i--;) { const sh = this.shards[i]; sh.t += rdt; if (sh.t > sh.dur) this.shards.splice(i, 1); }
    for (let i = this.flashes.length; i--;) { this.flashes[i].t += rdt; if (this.flashes[i].t > 0.25) this.flashes.splice(i, 1); }
    if (this.state === 'ready') {
      const inp = this.ctx.input(this.runner.slot, rdt);
      const tapped = this.clicks.length > 0; this.clicks.length = 0;
      if ((inp.act || tapped || (this.online && this.stateT > 3)) && this.stateT > 0.5) this.startRun();
      return;
    }
    if (this.state === 'wait') {
      let allDone = true;
      for (const r of this.remotes) { const s = this.remoteLive[r.id]; if (!s || !s.done) allDone = false; }
      if (!this.online || allDone || this.stateT > 12) {
        for (const r of this.remotes) {
          const s = this.remoteLive[r.id];
          this.results.push({ id: r.id, score: s ? s.n : 0, label: (s ? s.n : 0) + ' pts', name: r.name, color: r.color });
        }
        for (const bt of this.bots)
          this.results.push({ id: bt.p.id, score: bt.n, label: bt.n + ' pts', name: bt.p.name, color: bt.p.color });
        this.ctx.end(this.results);
      }
      return;
    }
    // ---- run ----
    const { W, H } = this.ctx.dim, s = Math.min(W, H) / 700;
    this.runT += rdt; this.fireCd -= rdt;
    if (this.comboT > 0) { this.comboT -= rdt; if (this.comboT <= 0) this.combo = 0; }
    if (!this.practice) this.clock -= rdt;
    // spawn ramp: MP ramps with the round clock; solo ramps slowly with survival
    const ramp = this.practice ? 1 :
      this.solo ? 1 + Math.min(1.4, this.runT / 60) : 1 + (this.runT / T_LIMIT) * 1.6;
    this.spawnAcc += rdt * 0.95 * ramp;
    while (this.spawnAcc > 1) { this.spawnAcc -= 1; this.spawn(); }
    // solo lifeline: clock cans arrive on their own luck-varied timer,
    // NOT with the ramp — sustaining forever takes a lucky streak
    if (this.solo && !this.practice) {
      this.clockAcc = (this.clockAcc ?? 3) - rdt;
      if (this.clockAcc <= 0) { this.clockAcc = 5.5 + this.rng() * 5; this.spawn('clock'); }
    }
    for (let i = this.cans.length; i--;) {
      const c = this.cans[i];
      c.vy += 620 * s * rdt; c.x += c.vx * rdt; c.y += c.vy * rdt; c.rot += c.vr * rdt;
      if (c.y > H + 60) this.cans.splice(i, 1);
    }
    // shots
    if (this.clicks.length) {
      for (const [px, py] of this.clicks) {
        if (this.fireCd > 0) continue;
        this.fireCd = FIRE_CD;
        this.flashes.push({ x: px, y: py, t: 0 });
        this.ctx.audio.sfx.zap();
        let hit = -1, best = 1e9;
        for (let i = 0; i < this.cans.length; i++) {
          const c = this.cans[i], d = Math.hypot(c.x - px, c.y - py);
          if (d < c.r + 20 * s && d < best) { best = d; hit = i; }
        }
        if (hit >= 0) {
          const c = this.cans.splice(hit, 1)[0];
          this.hits++;
          for (let k = 0; k < 8; k++) {
            const a = Math.random() * TAU, sp2 = 80 + Math.random() * 240;
            this.shards.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2 - 120, t: 0, dur: 0.5, col: c.type === 'gold' ? '#ffd23f' : c.type === 'clock' ? '#7dff6a' : '#b8c4cc' });
          }
          if (c.type === 'clock') {
            this.clock = Math.min(90, this.clock + 4);
            this.pop('+4s!', c.x, c.y, '#7dff6a', 24);
            this.ctx.audio.sfx.pow();
          } else {
            const pts = c.type === 'gold' ? 3 : 1;
            this.combo++; this.comboT = 1.6;
            this.score += pts;
            this.pop('+' + pts + (this.combo > 2 ? '  x' + this.combo : ''), c.x, c.y, c.type === 'gold' ? '#ffd23f' : '#ffeccf', 20);
            this.ctx.audio.sfx.coin(Math.min(12, this.combo * 2));
            if (this.solo) this.score += 0; // solo score is hits-based points too
          }
        }
      }
      this.clicks.length = 0;
    }
    for (const bt of this.bots)
      while (bt.i < bt.evs.length && bt.evs[bt.i].t <= this.runT) { bt.n += bt.evs[bt.i].pts; bt.i++; }
    this.ctx.audio.setMusicIntensity(0.4 + Math.min(0.45, (this.solo ? (30 - Math.min(30, this.clock)) / 40 : this.runT / T_LIMIT * 0.5)));
    if (this.online) {
      this._nAcc = (this._nAcc || 0) + rdt;
      if (this._nAcc > 0.5) { this._nAcc = 0; this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.score, done: false }); }
    }
    if (!this.practice && this.clock <= 0) {
      this.results.push({
        id: this.runner.id, score: this.score,
        label: this.solo ? Math.round(this.runT) + 's survived' : this.score + ' pts',
        name: this.runner.name, color: this.runner.color,
      });
      if (this.online) this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.score, done: true });
      this.nextRunner();
    }
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim, s = Math.min(W, H) / 700;
    // sky → horizon
    const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
    sky.addColorStop(0, '#6db3e8'); sky.addColorStop(0.75, '#cfe8f7'); sky.addColorStop(1, '#f7e3b9');
    g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.62);
    // sun + clouds
    g.fillStyle = 'rgba(255,244,200,0.95)';
    g.beginPath(); g.arc(W * 0.82, H * 0.12, 34 * s, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 3; i++) {
      const cx2 = ((i * 0.37 + this.tt * 0.004) % 1.2 - 0.1) * W, cy2 = H * (0.08 + i * 0.06);
      g.beginPath(); g.ellipse(cx2, cy2, 60 * s, 16 * s, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(cx2 + 34 * s, cy2 - 9 * s, 38 * s, 13 * s, 0, 0, TAU); g.fill();
    }
    // distant hills + barn silhouette
    g.fillStyle = '#7fa85c';
    g.beginPath(); g.moveTo(0, H * 0.62);
    for (let x = 0; x <= W; x += W / 8) g.lineTo(x, H * 0.62 - Math.sin(x * 0.011 + 2) * 18 * s - 8 * s);
    g.lineTo(W, H * 0.62); g.closePath(); g.fill();
    g.fillStyle = '#a8523a';
    g.fillRect(W * 0.08, H * 0.545, 60 * s, 42 * s);
    g.beginPath(); g.moveTo(W * 0.08 - 6 * s, H * 0.545); g.lineTo(W * 0.08 + 30 * s, H * 0.505);
    g.lineTo(W * 0.08 + 66 * s, H * 0.545); g.closePath(); g.fill();
    // grass
    const gr = g.createLinearGradient(0, H * 0.62, 0, H);
    gr.addColorStop(0, '#67a84f'); gr.addColorStop(1, '#3c7c34');
    g.fillStyle = gr; g.fillRect(0, H * 0.62, W, H);
    g.strokeStyle = '#2f6428'; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const fr = Math.sin(i * 127.1) * 43758.5453, f2 = fr - Math.floor(fr);
      const tx = f2 * W, ty = H * (0.66 + (i % 5) * 0.05), ts2 = (4 + (i % 3) * 3) * s;
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - ts2 * 0.4, ty - ts2); g.stroke();
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + ts2 * 0.5, ty - ts2 * 1.2); g.stroke();
    }
    // cans (behind the fence)
    for (const c of this.cans) this.drawCan(g, c, s);
    // fence (foreground)
    const fy = H * 0.86;
    g.fillStyle = '#8a5a2b'; g.strokeStyle = '#5f3d1c'; g.lineWidth = 2;
    for (let x = W * 0.04; x < W; x += W * 0.135) {
      g.fillRect(x, fy - 26 * s, 10 * s, H - fy + 26 * s); g.strokeRect(x, fy - 26 * s, 10 * s, H - fy + 26 * s);
    }
    g.fillRect(0, fy - 18 * s, W, 9 * s); g.strokeRect(0, fy - 18 * s, W, 9 * s);
    g.fillRect(0, fy + 8 * s, W, 9 * s); g.strokeRect(0, fy + 8 * s, W, 9 * s);
    // shards / muzzle rings / pops
    for (const sh of this.shards) {
      const f = 1 - sh.t / sh.dur;
      g.globalAlpha = f; g.fillStyle = sh.col;
      g.beginPath(); g.arc(sh.x + sh.vx * sh.t, sh.y + sh.vy * sh.t + 300 * sh.t * sh.t, 3 * s * f + 1, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    for (const fl of this.flashes) {
      const f = fl.t / 0.25;
      g.globalAlpha = 1 - f; g.strokeStyle = '#ffeccf'; g.lineWidth = 3;
      g.beginPath(); g.arc(fl.x, fl.y, 8 + f * 26 * s, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
    // crosshair
    if (this.aim && this.state === 'run') {
      const [ax, ay] = this.aim;
      g.strokeStyle = 'rgba(255,236,207,0.9)'; g.lineWidth = 2;
      g.beginPath(); g.arc(ax, ay, 14 * s, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(ax - 20 * s, ay); g.lineTo(ax - 8 * s, ay); g.stroke();
      g.beginPath(); g.moveTo(ax + 8 * s, ay); g.lineTo(ax + 20 * s, ay); g.stroke();
      g.beginPath(); g.moveTo(ax, ay - 20 * s); g.lineTo(ax, ay - 8 * s); g.stroke();
      g.beginPath(); g.moveTo(ax, ay + 8 * s); g.lineTo(ax, ay + 20 * s); g.stroke();
    }
    // screens
    if (this.state === 'ready' || this.state === 'wait') {
      g.fillStyle = 'rgba(6,7,13,0.55)'; g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      if (this.state === 'ready' && this.runner) {
        g.fillStyle = this.runner.color; g.font = '900 34px system-ui';
        g.fillText(this.runner.name, W / 2, H * 0.4);
        g.fillStyle = '#ffeccf'; g.font = '800 20px system-ui';
        g.fillText('GET READY — tap anywhere', W / 2, H * 0.4 + 40);
        if (this.results.length) {
          g.font = '700 15px system-ui'; g.fillStyle = '#93a0bd';
          g.fillText('so far: ' + this.results.map(r => r.name + ' ' + r.score).join(' · '), W / 2, H * 0.4 + 80);
        }
      } else if (this.state === 'wait') {
        g.fillStyle = '#ffeccf'; g.font = '800 22px system-ui';
        g.fillText(this.online ? 'waiting for the other blasters…' : 'tallying…', W / 2, H * 0.45);
      }
      return;
    }
    // HUD
    g.textAlign = 'left'; g.font = '800 18px system-ui'; g.fillStyle = '#14100a';
    g.fillText('🥫 ' + this.score, 14, 30);
    if (this.combo > 2) { g.fillStyle = '#a8523a'; g.fillText('x' + this.combo + ' combo', 14, 54); }
    g.textAlign = 'center'; g.font = '900 26px system-ui';
    if (this.practice) { g.fillStyle = '#2f6428'; g.fillText('PRACTICE', W / 2, 36); }
    else {
      const low = this.clock < 8;
      g.fillStyle = low ? '#c0392b' : '#14100a';
      g.fillText(Math.ceil(this.clock) + '', W / 2, 36);
      if (this.solo) { g.font = '700 12px system-ui'; g.fillStyle = '#14100a'; g.fillText('shoot 🕐 cans for +5s', W / 2, 54); }
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
      g.strokeText(p.txt, p.x, p.y - p.t * 50);
      g.fillStyle = p.col; g.fillText(p.txt, p.x, p.y - p.t * 50);
    }
    g.globalAlpha = 1;
  }
  drawCan(g, c, s) {
    g.save(); g.translate(c.x, c.y); g.rotate(c.rot);
    const w = c.r * 1.5, h = c.r * 2.1;
    if (c.type === 'gold') {
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#8a6a10';
    } else if (c.type === 'clock') {
      g.fillStyle = '#7dff6a'; g.strokeStyle = '#2f6428';
    } else { g.fillStyle = '#c9d4dc'; g.strokeStyle = '#5a666e'; }
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-w / 2, -h / 2 + 3); g.arcTo(w / 2, -h / 2, w / 2, h / 2, 4);
    g.arcTo(w / 2, h / 2, -w / 2, h / 2, 4); g.arcTo(-w / 2, h / 2, -w / 2, -h / 2, 4);
    g.arcTo(-w / 2, -h / 2, w / 2, -h / 2, 4); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(-w / 2 + 2, -h / 2 + 2, w * 0.22, h - 4);
    if (c.type === 'clock') {
      g.font = '900 ' + Math.round(c.r * 1.1) + 'px system-ui';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#14100a'; g.fillText('🕐', 0, 0);
      g.textBaseline = 'alphabetic';
    } else {
      g.fillStyle = c.type === 'gold' ? '#8a6a10' : '#5a666e';
      g.fillRect(-w / 2, -2, w, 4);
    }
    g.restore();
  }
  dispose() {
    this.ctx.cv.removeEventListener('pointerdown', this._pd);
    this.ctx.cv.removeEventListener('pointermove', this._pm);
  }
}
