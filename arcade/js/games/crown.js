// CROWN STEAL — walled arena, momentum + dash bumps. Hold the crown longest.
// Walls are bouncy barriers; a knocked crown rockets off and ricochets — chase it.
// Holder is slower but heavier (knockback-resistant). Bots fill to 4.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';
import { drawDiverTop } from '../character.js?v=39';

const T_LIMIT = 75, ACC = 2300, DRAG = 3.0, VMAX = 640, DASH_CD = 1.2, PR = 22;
const HALF = Math.PI / 2;

export default {
  id: 'crown', name: 'Crown Carriers', icon: '👑',
  desc: 'A stone tower over lava. Hold the crown longest.',
  howto: {
    goal: 'Hold the crown as long as you can — most crown-time in 75s wins. The tower crumbles smaller as time runs out.',
    touch: 'Tilt / drag to move · TAP anywhere = DASH',
    keys: 'P1: WASD + SPACE to dash · P2: arrows + ENTER',
    tip: 'DASH to dodge, cut off, or BONK the carrier loose. Fresh carriers glow gold — they\'re protected for a moment, so run while you shine!',
  },
  create(ctx) { return new CrownGame(ctx); }
};

class CrownGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.practice = !!ctx.practice;
    this.rng = mulberry32(ctx.seed);
    this.t = 0; this.shake = 0; this.pops = [];
    const src = this.practice
      ? ctx.players.map(p => (p.local ? p : { ...p, bot: true }))
      : ctx.players;
    const n = Math.max(4, src.length);
    this.ps = [];
    for (let i = 0; i < n; i++) {
      const base = src[i];
      const a = i / n * TAU + 0.7;
      this.ps.push({
        id: base ? base.id : 'bot' + i,
        name: base ? base.name : ['CHAD', 'BLINKY', 'MOOSE', 'GARY'][i % 4],
        color: base ? base.color : ['#ffb84d', '#66e0c9', '#d5b3ff', '#ff8a5c'][i % 4],
        local: base ? base.local : false, slot: base ? base.slot : -1,
        bot: base ? !!base.bot : true, isFill: !base, cos: base && base.cosmetics, ward: base && base.ward, skin: base && base.skin,
        x: Math.cos(a) * 0.55, y: Math.sin(a) * 0.55,
        vx: 0, vy: 0, crownT: 0, dashCd: 0, dashT: 0, fx: 1, fy: 0,
        wob: this.rng() * TAU, squash: 0, role: i % 3, grabT: 0,
      });
    }
    this.crown = { holder: null, x: 0, y: 0, vx: 0, vy: 0, cd: 0 };
    this.banner(this.practice ? 'PRACTICE — TRY A DASH!' : 'CARRY THE CROWN!', '#ffd23f', 1.8);
    if (ctx.onNet) ctx.onNet((t, p, from) => this.onNet(t, p, from));
    this.netAcc = 0;
  }
  banner(txt, col, dur) { this.pops.push({ txt, col, t: 0, dur, big: true }); }
  pop(txt, x, y, col) { this.pops.push({ txt, x, y, col: col || '#ffeccf', t: 0, dur: 0.8 }); }
  // wider start, gentler shrink; practice never shrinks
  arenaR() { return this.practice ? 1 : lerp(1, 0.62, clamp(this.t / T_LIMIT, 0, 1)); }

  onNet(t, p, from) {
    if (t !== 'g') return;
    if (p.k === 'pos') {
      const q = this.ps.find(z => z.id === p.id);
      if (q && !q.local) { q.nx = p.x; q.ny = p.y; q.vx = p.vx; q.vy = p.vy; }
    } else if (p.k === 'crown' && this.ctx.net && !this.ctx.net.isHost) {
      this.crown.holder = p.h; this.crown.x = p.x; this.crown.y = p.y;
      this.crown.vx = p.vx; this.crown.vy = p.vy;
      const q = this.ps.find(z => z.id === p.h); if (q) { q.crownT = p.ht; q.grabT = p.im || 0; }
    } else if (p.k === 'dash') {
      const q = this.ps.find(z => z.id === p.id);
      if (q && !q.local) this.doDash(q);
    }
  }

  update(dt) {
    this.t += dt; this.shake *= Math.exp(-7 * dt);
    for (let i = this.pops.length; i--;) { this.pops[i].t += dt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    const R = this.arenaR(), online = !!this.ctx.net && !this.practice, host = !online || this.ctx.net.isHost;
    const wallR = R - PR / 600;
    for (const p of this.ps) {
      p.dashCd -= dt; p.dashT -= dt; p.grabT -= dt; p.wob += dt * 9; p.squash *= Math.exp(-8 * dt);
      if (p.local && !p.bot) {
        const inp = this.ctx.input(p.slot, dt);
        p.vx += inp.x * ACC * dt; p.vy += inp.y * ACC * dt;
        if (inp.act && p.dashCd <= 0) { this.doDash(p); if (online) this.ctx.net.send('g', { k: 'dash', id: p.id }); }
      } else if (p.bot && (host || !p.isFill)) {
        this.botThink(p, dt, R);
      } else if (online && !p.local) {
        if (p.nx != null) { p.x = lerp(p.x, p.nx, Math.min(1, dt * 10)); p.y = lerp(p.y, p.ny, Math.min(1, dt * 10)); }
        p.x += p.vx * dt / 600; p.y += p.vy * dt / 600;
        continue;
      }
      const dr = Math.exp(-DRAG * dt); p.vx *= dr; p.vy *= dr;
      // dash breaks the speed limit — a real burst for dodging or closing gaps
      const sp = Math.hypot(p.vx, p.vy),
        lim = VMAX * (this.crown.holder === p.id ? 0.78 : 1) * (p.dashT > 0 ? 2.1 : 1);
      if (sp > lim) { p.vx *= lim / sp; p.vy *= lim / sp; }
      if (sp > 30) { p.fx = p.vx / sp; p.fy = p.vy / sp; }
      p.x += p.vx * dt / 600; p.y += p.vy * dt / 600;
      // bouncy wall — no falling out, just a satisfying boing
      const d = Math.hypot(p.x, p.y);
      if (d > wallR) {
        const nx = p.x / d, ny = p.y / d;
        p.x = nx * wallR; p.y = ny * wallR;
        const vr = p.vx * nx + p.vy * ny;
        if (vr > 0) {
          p.vx -= vr * nx * 1.75; p.vy -= vr * ny * 1.75;
          if (vr > 260) { this.ctx.audio.sfx.thud(0.5); p.squash = Math.min(1, vr / 900); this.shakeUp(3); }
        }
      }
    }
    // player-player bumps
    for (let i = 0; i < this.ps.length; i++) for (let j = i + 1; j < this.ps.length; j++) {
      const a = this.ps[i], b = this.ps[j];
      const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy), min = PR * 2 / 600;
      if (dd < min && dd > 0.0001) {
        const nx = dx / dd, ny = dy / dd, push = (min - dd) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy, rel = rvx * nx + rvy * ny;
        if (rel < 0) {
          const imp = -rel * 0.95;
          // crown holder is heavier: takes less knockback
          const aw = this.crown.holder === a.id ? 0.45 : 1;
          const bw = this.crown.holder === b.id ? 0.45 : 1;
          a.vx -= nx * imp / 2 * aw; a.vy -= ny * imp / 2 * aw;
          b.vx += nx * imp / 2 * bw; b.vy += ny * imp / 2 * bw;
          const dashHit = a.dashT > 0 || b.dashT > 0;
          // a dash touch pops the crown loose — unless the carrier's grab shield is up
          if (-rel > (dashHit ? 60 : 560)) {
            this.ctx.audio.sfx.thud(0.85); this.shakeUp(5);
            a.squash = 0.5; b.squash = 0.5;
            const holder = this.crown.holder;
            if (host && (holder === a.id || holder === b.id)) {
              const vic = holder === a.id ? a : b, atk = holder === a.id ? b : a;
              if (vic.grabT > 0) {
                // shield bounce: the would-be thief gets flung
                const bn = Math.hypot(atk.x - vic.x, atk.y - vic.y) || 1;
                atk.vx += (atk.x - vic.x) / bn * 780; atk.vy += (atk.y - vic.y) / bn * 780;
                atk.squash = 0.7;
                this.ctx.audio.sfx.shield();
                this.pop('🛡 PROTECTED!', vic.x, vic.y - 0.07, '#ffd23f');
              } else {
                this.launchCrown(vic);
                this.pop('CROWN LOOSE!', vic.x, vic.y - 0.06, '#ffd23f');
              }
            } else if (dashHit) this.pop('BONK!', (a.x + b.x) / 2, (a.y + b.y) / 2 - 0.04, '#ffeccf');
          }
        }
      }
    }
    // crown physics + pickup (host authority online)
    const c = this.crown; c.cd -= dt;
    if (host) {
      if (c.holder) {
        const h = this.ps.find(p => p.id === c.holder);
        if (h) { c.x = h.x; c.y = h.y; if (!this.practice) h.crownT += dt; }
      } else {
        c.vx *= Math.exp(-0.9 * dt); c.vy *= Math.exp(-0.9 * dt);
        c.x += c.vx * dt; c.y += c.vy * dt;
        // crown ricochets off the wall
        const d = Math.hypot(c.x, c.y), cr = R - 0.035;
        if (d > cr) {
          const nx = c.x / d, ny = c.y / d;
          c.x = nx * cr; c.y = ny * cr;
          const vr = c.vx * nx + c.vy * ny;
          if (vr > 0) { c.vx -= vr * nx * 1.85; c.vy -= vr * ny * 1.85; this.ctx.audio.sfx.wall(); }
        }
        if (c.cd <= 0) for (const p of this.ps) {
          if (Math.hypot(p.x - c.x, p.y - c.y) < (PR + 16) / 600) {
            c.holder = p.id; c.vx = c.vy = 0; p.grabT = 2.5;  // grab shield
            this.ctx.audio.sfx.grab();
            this.pop('👑 ' + p.name + '!', p.x, p.y - 0.07, p.color); break;
          }
        }
      }
      if (online) {
        this.netAcc += dt;
        if (this.netAcc > 0.09) {
          this.netAcc = 0;
          const h = this.ps.find(p => p.id === c.holder);
          this.ctx.net.send('g', { k: 'crown', h: c.holder, x: c.x, y: c.y, vx: c.vx, vy: c.vy, ht: h ? h.crownT : 0, im: h ? h.grabT : 0 });
          for (const p of this.ps) if (p.isFill)
            this.ctx.net.send('g', { k: 'pos', id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy });
        }
      }
    }
    if (online) {
      this._pAcc = (this._pAcc || 0) + dt;
      if (this._pAcc > 0.08) {
        this._pAcc = 0;
        const me = this.ps.find(p => p.local && !p.bot);
        if (me) this.ctx.net.send('g', { k: 'pos', id: me.id, x: me.x, y: me.y, vx: me.vx, vy: me.vy });
      }
    }
    this.ctx.audio.setMusicIntensity(0.5 + (1 - this.arenaR()) * 0.7 + (this.crown.holder ? 0.1 : 0));
    if (!this.practice && this.t >= T_LIMIT) this.finish();
  }
  doDash(p) {
    p.dashCd = p.bot ? DASH_CD * 1.8 : DASH_CD;   // bots lunge less often than humans
    p.dashT = 0.35;
    p.vx += p.fx * 1150; p.vy += p.fy * 1150;
    this.ctx.audio.sfx.dash();
  }
  launchCrown(vic) {
    const c = this.crown;
    c.holder = null; c.cd = 0.55;
    const a = this.rng() * TAU;                 // deliberately unrelated to the hit — go chase it
    const sp = 1.3 + this.rng() * 0.7;
    c.x = vic.x; c.y = vic.y;
    c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp;
  }
  botThink(p, dt, R) {
    const c = this.crown;
    let tx, ty;
    if (c.holder === p.id) {
      // carrier: run from the nearest threat, stay on the tower, panic-dash away
      let fx = 0, fy = 0, nearest = 1e9;
      for (const q of this.ps) if (q !== p) {
        const d = Math.hypot(p.x - q.x, p.y - q.y) + 0.01;
        nearest = Math.min(nearest, d);
        fx += (p.x - q.x) / d / d; fy += (p.y - q.y) / d / d;
      }
      const cd = Math.hypot(p.x, p.y);
      tx = p.x + fx * 0.05 - p.x * (cd > R * 0.72 ? 0.5 : 0);
      ty = p.y + fy * 0.05 - p.y * (cd > R * 0.72 ? 0.5 : 0);
      if (nearest < 0.15 && p.dashCd <= 0) this.doDash(p);
    } else if (c.holder) {
      const h = this.ps.find(q => q.id === c.holder);
      if (h) {
        const dist = Math.hypot(p.x - h.x, p.y - h.y);
        const lead = clamp(dist * 0.9, 0.12, 0.65);          // seconds of prediction
        const hx = h.vx / 600, hy = h.vy / 600;              // holder velocity, arena units/s
        if (p.role === 0) {                                   // INTERCEPTOR: aim where they'll be
          tx = h.x + hx * lead; ty = h.y + hy * lead;
        } else if (p.role === 1) {                            // FLANKER: swing wide to cut the arc
          const n = Math.hypot(hx, hy) || 0.001;
          const side = Math.sin(this.t * 0.6 + p.wob) > 0 ? 1 : -1;
          tx = h.x + hx * lead * 1.7 + (-hy / n) * 0.28 * side;
          ty = h.y + hy * lead * 1.7 + (hx / n) * 0.28 * side;
        } else {                                              // AMBUSHER: lurk mid-tower, pounce
          if (dist > 0.42) { tx = h.x * 0.35; ty = h.y * 0.35; }
          else { tx = h.x + hx * 0.2; ty = h.y + hy * 0.2; }
        }
        // lunge-dash whenever the carrier is in range and we're facing the intercept —
        // this is how bots close the last gap a pursuit curve never closes
        if (p.dashCd <= 0 && dist < 0.34 && h.grabT <= 0.3) {  // don't waste lunges on a shield
          const ang = Math.atan2(ty - p.y, tx - p.x), face = Math.atan2(p.fy, p.fx);
          const dA = Math.abs(Math.atan2(Math.sin(ang - face), Math.cos(ang - face)));
          if (dA < 0.7) this.doDash(p);
        }
      } else { tx = 0; ty = 0; }
      // spread out: don't share a lane with other chasers
      for (const q of this.ps) if (q !== p && q.bot && c.holder !== q.id) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < 0.12 && d > 0.001) { tx += (p.x - q.x) / d * 0.1; ty += (p.y - q.y) / d * 0.1; }
      }
    } else { tx = c.x + c.vx * 0.25; ty = c.y + c.vy * 0.25; }
    const dx = tx - p.x + Math.sin(p.wob) * 0.03, dy = ty - p.y + Math.cos(p.wob * 1.3) * 0.03;
    const d = Math.hypot(dx, dy) || 1;
    const eff = c.holder && c.holder !== p.id ? 0.95 : 0.85;   // chasers hustle
    p.vx += dx / d * ACC * eff * dt; p.vy += dy / d * ACC * eff * dt;
  }
  shakeUp(v) { this.shake = Math.max(this.shake, v); }
  finish() {
    if (this.done) return; this.done = true;
    const order = [...this.ps].sort((a, b) => b.crownT - a.crownT);
    this.ctx.end(order.map(p => ({
      id: p.id, score: Math.round(p.crownT * 10) / 10, label: p.crownT.toFixed(1) + 's',
      name: p.name, color: p.color, isFill: p.isFill,
    })));
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    const S = Math.min(W, H) * 0.5 - 10, cx = W / 2, cy = H / 2 + 8;
    const R = this.arenaR() * S;
    // LAVA fills the world outside the tower — bright at the tower's edge
    const lg = g.createRadialGradient(cx, cy, R, cx, cy, Math.max(W, H) * 0.8);
    lg.addColorStop(0, '#ff7a2f'); lg.addColorStop(0.25, '#c93a12');
    lg.addColorStop(1, '#3d0f04');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    // slow lava blobs drifting around the tower
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU + this.t * (0.07 + (i % 3) * 0.03) * (i % 2 ? 1 : -1);
      const rr = R + 34 + Math.sin(this.t * 0.8 + i * 2.1) * 14 + (i % 3) * 26;
      g.globalAlpha = 0.35 + 0.2 * Math.sin(this.t * 1.7 + i);
      g.fillStyle = '#ffb03a';
      g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 10 + (i % 4) * 5, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    g.save();
    if (this.shake > 0.3) g.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    // stone parapet rim with crenellations
    const danger = !this.practice && this.t > T_LIMIT - 15;
    g.fillStyle = '#3d3935';
    g.beginPath(); g.arc(cx, cy, R + 16, 0, TAU); g.fill();
    g.fillStyle = danger && Math.floor(this.t * 4) % 2 ? '#7a4038' : '#57534e';
    g.beginPath(); g.arc(cx, cy, R + 12, 0, TAU); g.fill();
    for (let i = 0; i < 24; i++) {   // battlements
      const a = i / 24 * TAU;
      g.save(); g.translate(cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12));
      g.rotate(a);
      g.fillStyle = '#6e6a63'; g.fillRect(-3, -7, 9, 14);
      g.restore();
    }
    // stone floor: ring courses of offset brick seams
    g.fillStyle = '#6b655e';
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(40,36,32,0.5)'; g.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const rr = R * i / 6;
      g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
      const segs = 5 + i * 3, off = (i % 2) * 0.5;
      for (let j2 = 0; j2 < segs; j2++) {
        const a = (j2 + off) / segs * TAU;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        g.lineTo(cx + Math.cos(a) * R * (i + 1) / 6, cy + Math.sin(a) * R * (i + 1) / 6);
        g.stroke();
      }
    }
    // center crest
    g.strokeStyle = 'rgba(255,210,63,0.25)'; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, R / 6, 0, TAU); g.stroke();
    // warm glow bleeding onto the stone from the lava
    const eg = g.createRadialGradient(cx, cy, R * 0.55, cx, cy, R + 4);
    eg.addColorStop(0, 'rgba(255,122,47,0)'); eg.addColorStop(1, 'rgba(255,122,47,0.22)');
    g.fillStyle = eg;
    g.beginPath(); g.arc(cx, cy, R + 4, 0, TAU); g.fill();
    // crown on the loose
    const c = this.crown;
    if (!c.holder) this.drawCrown(g, cx + c.x * S, cy + c.y * S - 8 - Math.sin(this.t * 4) * 4, 1.25);
    // players
    const sorted = [...this.ps].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      const px = cx + p.x * S, py = cy + p.y * S;
      const sp = Math.hypot(p.vx, p.vy) / VMAX;
      // dash trail
      if (p.dashT > 0) {
        g.globalAlpha = p.dashT * 2;
        g.strokeStyle = p.color; g.lineWidth = 10; g.lineCap = 'round';
        g.beginPath(); g.moveTo(px - p.fx * 46, py - p.fy * 46); g.lineTo(px - p.fx * 12, py - p.fy * 12); g.stroke();
        g.globalAlpha = 1;
      }
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath(); g.ellipse(px, py + PR * 0.72, PR * 0.9, PR * 0.4, 0, 0, TAU); g.fill();
      drawDiverTop(g, {
        x: px, y: py, r: PR, color: p.color, t: p.wob / 9, cos: p.cos, ward: p.ward, skin: p.skin,
        vx: p.vx, vy: p.vy, speedNorm: sp, squash: p.squash,
        rot: Math.atan2(p.fy, p.fx) * 0.15 * sp,
      });
      if (c.holder === p.id) {
        this.drawCrown(g, px, py - PR - 12, 1);
        if (p.grabT > 0) {   // golden grab shield, fading out
          g.globalAlpha = Math.min(1, p.grabT) * (0.65 + Math.sin(this.t * 9) * 0.25);
          g.strokeStyle = '#ffd23f'; g.lineWidth = 4;
          g.beginPath(); g.arc(px, py, PR + 9, 0, TAU); g.stroke();
          g.globalAlpha = 1;
        }
      }
      g.font = '800 12px system-ui'; g.textAlign = 'center';
      g.fillStyle = 'rgba(10,8,4,0.7)'; g.fillText(p.name, px + 1, py - PR - (c.holder === p.id ? 30 : 12) + 1);
      g.fillStyle = p.color; g.fillText(p.name, px, py - PR - (c.holder === p.id ? 30 : 12));
      if (p.local && !p.bot) {
        g.fillStyle = p.dashCd <= 0 ? '#7dff6a' : 'rgba(147,160,189,0.5)';
        g.beginPath(); g.arc(px, py + PR + 10, 4, 0, TAU); g.fill();
      }
    }
    g.restore();
    // HUD
    g.textAlign = 'center'; g.font = '900 26px system-ui';
    if (this.practice) { g.fillStyle = '#7dff6a'; g.fillText('PRACTICE', W / 2, 36); }
    else {
      const tl = Math.max(0, T_LIMIT - this.t);
      g.fillStyle = tl < 10 ? '#ff5f5f' : '#ffeccf';
      g.fillText(Math.ceil(tl) + '', W / 2, 36);
    }
    if (this.t < 10) {
      g.font = '700 13px system-ui'; g.fillStyle = '#93a0bd';
      g.fillText(('ontouchstart' in window) ? 'TAP = DASH' : 'SPACE = DASH', W / 2, 58);
    }
    if (!this.practice) {
      const bw = Math.min(130, W / this.ps.length - 16);
      this.ps.forEach((p, i) => {
        const x = W / 2 + (i - (this.ps.length - 1) / 2) * (bw + 12) - bw / 2, y = H - 34;
        g.fillStyle = 'rgba(20,26,40,0.7)'; g.fillRect(x, y, bw, 8);
        g.fillStyle = p.color; g.fillRect(x, y, bw * clamp(p.crownT / 30, 0, 1), 8);
        g.font = '700 11px system-ui'; g.textAlign = 'left';
        g.fillStyle = p.color; g.fillText(p.name + ' ' + p.crownT.toFixed(1) + 's', x, y - 5);
      });
    }
    g.textAlign = 'center';
    const S2 = Math.min(W, H) * 0.5 - 10;
    for (const p of this.pops) {
      const f = 1 - p.t / p.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + (p.big ? 30 : 16) + 'px system-ui';
      const x = p.x != null ? W / 2 + p.x * S2 : W / 2;
      const y = (p.y != null ? H / 2 + 8 + p.y * S2 : H * 0.28) - p.t * 45;
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)'; g.strokeText(p.txt, x, y);
      g.fillStyle = p.col; g.fillText(p.txt, x, y);
    }
    g.globalAlpha = 1;
  }
  drawCrown(g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = '#ffd23f'; g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-11, 5); g.lineTo(-11, -6); g.lineTo(-5.5, -1); g.lineTo(0, -9);
    g.lineTo(5.5, -1); g.lineTo(11, -6); g.lineTo(11, 5); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
  dispose() { }
}
