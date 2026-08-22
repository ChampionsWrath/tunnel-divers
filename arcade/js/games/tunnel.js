// TUNNEL DIVERS (minigame cut) — 75s depth race on a shared seed.
// Hot-seat: players dive the same tunnel in turns, earlier runs replay as ghosts.
// Online: everyone dives at once, live positions rendered as named ghosts.
// Bots: pre-simulated headless with a simple avoid-and-center pilot.
import { TAU, HPI, clamp, lerp, hlerp, mulberry32, mixHex } from '../util.js';

const CFG = { FOCAL: 320, TR: 320, PR: 18, REND: 3000, CHUNK: 600, FALL0: 380, FACC: 8, FMAX: 1400, LIVES: 3, IFR: 1.2, LACC: 2900, LDRAG: 3.2, LMAX: 760 };
const TR = CFG.TR, RINGSP = 75, DT = 1 / 120, T_LIMIT = 75;
const PUCOL = { shield: '#59d9ff', magnet: '#ff6fae', laser: '#7dff6a', tiny: '#d5b3ff' };
const PUEMO = { shield: '🛡️', magnet: '🧲', laser: '🔫', tiny: '🤏' };
const PUDUR = { magnet: 8, laser: 4, tiny: 8 };
const ZONES = [
  { name: '', until: 2500, h: 30, s: 42, l: 40, bg: ['#22160b', '#0b0704'], pal: { rock: '#8a5a2b', gate: '#c98b45', bar: '#a8773c', pillar: '#96683a', crawl: '#7a5230', block: '#9c6a34', pend: '#b3823f', blade: '#c96b3a' } },
  { name: 'STONE', until: 7000, h: 218, s: 14, l: 44, bg: ['#171a21', '#08090d'], pal: { rock: '#7d8494', gate: '#98a3b8', bar: '#8a93a6', pillar: '#6fc7b4', crawl: '#a08ab8', block: '#75808f', pend: '#8fa0c0', blade: '#aab6cc' } },
  { name: 'OCEAN', until: 12500, h: 196, s: 62, l: 46, bg: ['#06283d', '#02101c'], pal: { rock: '#3e7d8f', gate: '#ff7e6b', bar: '#3fa796', pillar: '#2fa3a3', crawl: '#57b8d8', block: '#3a8ca8', pend: '#e08bd0', blade: '#66c7c0' } },
  { name: 'THE CORE', until: 19000, h: 16, s: 78, l: 50, bg: ['#2a0f06', '#120503'], pal: { rock: '#5c3a2e', gate: '#ff7a2f', bar: '#8a5a3a', pillar: '#c9502a', crawl: '#ff9b45', block: '#7a4530', pend: '#ff5d3a', blade: '#ffb03a' } },
  { name: 'THE BEYOND', until: Infinity, h: 278, s: 70, l: 56, bg: ['#1a0630', '#070212'], pal: { rock: '#7a5fae', gate: '#b96fe0', bar: '#8a6fd0', pillar: '#5fd0c9', crawl: '#e06fd0', block: '#9a5fd0', pend: '#ff6fae', blade: '#8fd0ff' } }];
const zoneIdx = d => { for (let i = 0; i < ZONES.length; i++) if (d < ZONES[i].until) return i; return 4; };
const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };
const ramp = d => Math.min(1, d / 2500);
const curX = d => (Math.sin(d * 7e-4) * 90 + Math.sin(d * 13e-4) * 55) * ramp(d);
const curY = d => (Math.cos(d * 9e-4) * 70 + Math.sin(d * 11e-4) * 40) * ramp(d);

/* ---------------- world sim (one diver's run) ---------------- */
class TunnelWorld {
  constructor(seed, events, god) {
    this.seed = seed >>> 0 || 1; this.ev = events || {}; this.god = !!god;
    this.hz = []; this.pk = []; this.nextChunk = 0; this.lastPattern = ''; this.chainAng = null;
    this.CURC = ZONES[0].pal; this.GML = 1; this.zone = 0; this.curZone = 0;
    this.d = 0; this.pd = 0; this.t = 0; this.fall = CFG.FALL0;
    this.px = 0; this.py = 0; this.vx = 0; this.vy = 0;
    this.camX = 0; this.camY = -70; this.roll = 0; this.focal = CFG.FOCAL;
    this.lives = CFG.LIVES; this.coins = 0; this.bonus = 0; this.ifr = 0; this.shield = false;
    this.pow = { magnet: 0, laser: 0, tiny: 0 };
    this.combo = 0; this.comboT = 0; this.nearCd = 0; this.wallCd = 0; this.zapCd = 0;
    this.done = false; this.track = []; this.recAcc = 0; this.cullT = 0;
    this.HX = 0; this.HY = 0;
    this.ensure();
  }
  score() { return Math.floor(this.d / 10) + this.coins * 5 + this.bonus; }
  hazXY(h, t) {
    if (h.m === 1) { const a = h.a0 + h.om * t; this.HX = Math.cos(a) * h.rad; this.HY = Math.sin(a) * h.rad; }
    else if (h.m === 2) { this.HX = Math.sin(t * h.om + h.ph) * h.amp; this.HY = h.y; }
    else if (h.m === 4) {
      const ext = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * h.om + h.ph));
      const rr = TR - 28 - (h.si + 0.6) * h.step * ext;
      const a = h.a + Math.sin(t * h.om * 1.6 + h.si * 0.7 + h.ph) * 0.09 * h.si;
      this.HX = Math.cos(a) * rr; this.HY = Math.sin(a) * rr;
    } else if (h.m === 5) {
      const f = ((t / h.per) + h.ph) % 1; let jet = 0;
      if (f < 0.45) { const g = f / 0.45; jet = Math.min(1, g * 3) * (1 - Math.max(0, (g - 0.78) / 0.22)); }
      h.cf = f; h.act = jet > 0.25;
      const rr = TR - 20 - (h.si + 0.5) * h.step * jet;
      this.HX = Math.cos(h.a) * rr; this.HY = Math.sin(h.a) * rr;
    } else { this.HX = h.x; this.HY = h.y; }
  }
  addH(d, x, y, r, col, ex) { const h = { d, x, y, r, col, m: 0 }; if (ex) Object.assign(h, ex); this.hz.push(h); }
  ring(d, rad, dr, n, gapA, gapW, om, col) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, da = Math.atan2(Math.sin(a - gapA), Math.cos(a - gapA));
      if (Math.abs(da) < gapW) continue;
      if (om) this.addH(d, 0, 0, dr, col, { m: 1, rad, a0: a, om });
      else this.addH(d, Math.cos(a) * rad, Math.sin(a) * rad, dr, col);
    }
  }
  coinLine(d0, d1, pts) {
    const n = Math.max(3, Math.round((d1 - d0) / 55));
    for (let i = 0; i <= n; i++) {
      const f = i / n, s = f * (pts.length - 1);
      const j = Math.min(pts.length - 2, Math.floor(s)), u = s - j;
      this.pk.push({ d: d0 + f * (d1 - d0), x: lerp(pts[j].x, pts[j + 1].x, u), y: lerp(pts[j].y, pts[j + 1].y, u), r: 12, k: 0 });
    }
  }
  addPow(d, x, y, r) {
    const v = r(); const k = v < 0.3 ? 'shield' : v < 0.6 ? 'magnet' : v < 0.8 ? 'laser' : 'tiny';
    this.pk.push({ d, x, y, r: 17, k });
  }
  genChunk(i) {
    const d0 = 900 + i * CFG.CHUNK, r = mulberry32((this.seed ^ ((i + 1) * 0x9E3779B9)) >>> 0);
    const m = d0 / 10, tier = m <= 600 ? 1 : Math.min(5, 2 + Math.floor((m - 600) / 700));
    const I = 0.5 + tier * 0.15;
    this.zone = zoneIdx(d0); this.CURC = ZONES[this.zone].pal;
    const v = Math.sqrt(CFG.FALL0 * CFG.FALL0 + 16 * d0);
    this.GML = 1 + 0.45 * clamp((v - CFG.FALL0) / (CFG.FMAX - CFG.FALL0), 0, 1);
    const C = this.CURC, GML = this.GML, self = this;
    const P = {
      gate() { const ga = self.chainAng === null ? r() * TAU : self.chainAng + (r() - 0.5) * 1.6; self.chainAng = ga; self.ring(d0 + 320, TR * 0.63, 38, 12, ga, (1.05 - 0.12 * I) * GML, 0, C.gate); if (r() < 0.85) self.coinLine(d0 + 40, d0 + 560, [{ x: 0, y: 0 }, { x: Math.cos(ga) * TR * 0.56, y: Math.sin(ga) * TR * 0.56 }, { x: Math.cos(ga) * TR * 0.36, y: Math.sin(ga) * TR * 0.36 }]); },
      rotgate() { self.chainAng = null; const om = (0.55 + 0.3 * I) * (r() < 0.5 ? -1 : 1); self.ring(d0 + 200, TR * 0.62, 38, 12, r() * TAU, 1.15 * GML, om, C.gate); self.ring(d0 + 460, TR * 0.62, 38, 12, r() * TAU, 1.15 * GML, -om, C.gate); },
      bars() { self.chainAng = null; const ys = [-TR * 0.36, TR * 0.33, -TR * 0.29], pts = [{ x: 0, y: 0 }]; let pg = 0; for (let j = 0; j < 3; j++) { const y = ys[j] + r() * 40 - 20, gx = clamp(pg + (r() * 2 - 1) * 170, -TR * 0.5, TR * 0.5); pg = gx; for (let x = -TR * 0.92; x <= TR * 0.92; x += 66) { if (Math.abs(x - gx) < 85 * GML) continue; if (Math.hypot(x, y) > TR - 15) continue; self.addH(d0 + 140 + j * 160, x, y, 38, C.bar); } pts.push({ x: gx, y }); } if (r() < 0.85) self.coinLine(d0 + 60, d0 + 560, pts); },
      debris() { self.chainAng = null; const n = 8 + Math.floor(I * 5); for (let i2 = 0; i2 < n; i2++) { const a = r() * TAU, rr = Math.sqrt(r()) * TR * 0.75; self.addH(d0 + 60 + r() * 500, Math.cos(a) * rr, Math.sin(a) * rr, 18 + r() * 26, C.rock, { j: r() * TAU }); } },
      pillars() { self.chainAng = null; const pts = [{ x: 0, y: 0 }]; for (let j = 0; j < 4; j++) { const sx = (j % 2 ? 1 : -1) * (TR * 0.27 + r() * TR * 0.34); for (let y = -TR * 0.8; y <= TR * 0.8; y += 72) { if (Math.hypot(sx, y) > TR - 15) continue; self.addH(d0 + 90 + j * 140, sx, y, 38, C.pillar); } pts.push({ x: -sx * 0.7, y: 0 }); } if (r() < 0.85) self.coinLine(d0 + 40, d0 + 560, pts); },
      crawl() { self.chainAng = null; for (let j = 0; j < 4; j++) self.ring(d0 + 90 + j * 130, TR * 0.83, 34, 15, 0, -1, 0, C.crawl); if (r() < 0.8) self.coinLine(d0 + 60, d0 + 540, [{ x: 0, y: 0 }, { x: 0, y: 0 }]); },
      throat() { self.chainAng = null; const rads = [0.79, 0.65, 0.54, 0.65, 0.79]; for (let j = 0; j < 5; j++) self.ring(d0 + 80 + j * 110, TR * rads[j], 30, 14, 0, -1, 0, C.rock); if (r() < 0.8) self.coinLine(d0 + 60, d0 + 540, [{ x: 0, y: 0 }, { x: 0, y: 0 }]); },
      checker() { const pts = [{ x: 0, y: 0 }]; let open = self.chainAng === null ? Math.floor(r() * 4) : Math.round(self.chainAng / HPI - 0.5) & 3; for (let j = 0; j < 3; j++) { let q0 = Math.floor(r() * 4); if (q0 === open || (q0 + 2) % 4 === open) q0 = (q0 + 1) % 4; const d = d0 + 120 + j * 170; for (const q of [q0, (q0 + 2) % 4]) for (let k = 0; k < 4; k++) { const a = q * HPI + (k + 0.5) * HPI / 4, rr = TR * 0.36 + k * TR * 0.16; self.addH(d, Math.cos(a) * rr, Math.sin(a) * rr, 50, C.block); } open = (q0 + 1) % 4; const oa = open * HPI + HPI / 2; pts.push({ x: Math.cos(oa) * TR * 0.5, y: Math.sin(oa) * TR * 0.5 }); } self.chainAng = open * HPI + HPI / 2; if (r() < 0.7) self.coinLine(d0 + 50, d0 + 560, pts); },
      fan() { self.chainAng = null; const nb = I > 0.95 ? 3 : 2, om = (0.9 + 0.5 * I) * (r() < 0.5 ? -1 : 1), a0 = r() * TAU; self.addH(d0 + 300, 0, 0, 50, C.blade); for (let b = 0; b < nb; b++) { const ba = a0 + b / nb * TAU; for (let s = 1; s <= 4; s++) self.addH(d0 + 300, 0, 0, 34, C.blade, { m: 1, rad: s * TR * 0.165, a0: ba, om }); } for (let i2 = 0; i2 < 8; i2++) { const a = i2 / 8 * TAU; self.pk.push({ d: d0 + 110, x: Math.cos(a) * TR * 0.45, y: Math.sin(a) * TR * 0.45, r: 12, k: 0 }); } },
      pend() { self.chainAng = null; const sp = self.zone === 2 ? 'jelly' : self.zone === 4 ? 'eye' : undefined; const col = self.zone === 4 ? '#f0eefc' : C.pend; for (let j = 0; j < 3; j++) self.addH(d0 + 130 + j * 170, 0, (r() * 2 - 1) * TR * 0.27, 56, col, { m: 2, amp: TR * 0.55, om: 1.4 + 0.5 * I, ph: r() * TAU, sp }); },
      octo() { self.chainAng = null; const n = 2 + (I > 0.8 ? 1 : 0), base = r() * TAU; for (let ti = 0; ti < n; ti++) { const a = base + ti * (TAU / n) + (r() - 0.5) * 0.5, d = d0 + 150 + ti * 150 + r() * 60, om = 1.1 + r() * 0.6, ph = r() * TAU, step = TR * 0.078; for (let k = 0; k < 6; k++) self.addH(d, 0, 0, 34 - 2.2 * k, '#b95fa5', { m: 4, a, om, ph, si: k, step, sp: 'tent' }); } },
      spout() { self.chainAng = null; const n = 2 + (I > 0.9 ? 1 : 0), base = r() * TAU; for (let vi = 0; vi < n; vi++) { const a = base + vi * (TAU / n) + (r() - 0.5) * 0.4, d = d0 + 140 + vi * 160 + r() * 50, per = 2.4 - 0.5 * I, ph = r(), step = TR * 0.11; for (let k = 0; k < 5; k++) self.addH(d, 0, 0, 30 - 2 * k, '#ff7a2f', { m: 5, a, per, ph, si: k, step, sp: 'spout' }); } },
      wisp() { self.chainAng = null; for (let i2 = 0; i2 < 9; i2++) self.addH(d0 + 80 + r() * 460, 0, 0, 26, C.blade, { m: 1, rad: TR * (0.25 + r() * 0.45), a0: r() * TAU, om: (0.5 + r() * 0.8) * (r() < 0.5 ? -1 : 1) }); },
      rest() { const a0 = r() * TAU; for (let i2 = 0; i2 <= 15; i2++) { const f = i2 / 15, a = a0 + f * 6.5; self.pk.push({ d: d0 + 40 + f * 500, x: Math.cos(a) * TR * 0.36, y: Math.sin(a) * TR * 0.36, r: 12, k: 0 }); } if (r() < 0.55) self.addPow(d0 + 565, 0, 0, r); },
    };
    if (i % 5 === 4) { P.rest(); this.lastPattern = 'rest'; this.chainAng = null; return; }
    const POOL = [['gate', 1], ['bars', 1], ['debris', 1], ['pillars', 2], ['crawl', 2], ['throat', 2], ['rotgate', 3], ['checker', 3], ['fan', 4], ['pend', 4]];
    const EXTRA = { 2: [['octo', 5]], 3: [['spout', 5]], 4: [['wisp', 4]] };
    let pool = POOL.filter(p => p[1] <= tier && p[0] !== this.lastPattern)
      .concat((EXTRA[this.zone] || []).filter(p => p[0] !== this.lastPattern));
    if (i < 2) pool = POOL.filter(p => p[1] === 1 && p[0] !== this.lastPattern);
    let tw = 0; for (const p of pool) tw += p[1];
    let vv = r() * tw, pick = pool[0];
    for (const p of pool) { vv -= p[1]; if (vv <= 0) { pick = p; break; } }
    P[pick[0]](); this.lastPattern = pick[0];
    if (r() < 0.15) this.addPow(d0 + 565, (r() * 2 - 1) * 60, (r() * 2 - 1) * 60, r);
  }
  ensure() { while (900 + this.nextChunk * CFG.CHUNK < this.d + CFG.REND + CFG.CHUNK) this.genChunk(this.nextChunk++); }
  cull() {
    for (let i = this.hz.length; i--;) if (this.hz[i].d < this.d - 150) this.hz.splice(i, 1);
    for (let i = this.pk.length; i--;) if (this.pk[i].d < this.d - 150 || this.pk[i].got) this.pk.splice(i, 1);
  }
  step(dt, inp) {   // inp: {x,y in [-1,1], dive:boolean}
    if (this.done) return;
    this.t += dt;
    this.vx += inp.x * CFG.LACC * dt; this.vy += inp.y * CFG.LACC * dt;
    const dr = Math.exp(-CFG.LDRAG * dt); this.vx *= dr; this.vy *= dr;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > CFG.LMAX) { this.vx *= CFG.LMAX / sp; this.vy *= CFG.LMAX / sp; }
    this.px += this.vx * dt; this.py += this.vy * dt;
    const pr = CFG.PR * (this.pow.tiny > 0 ? 0.5 : 1);
    const rad = Math.hypot(this.px, this.py), lim = TR - pr;
    if (rad > lim) {
      const nx = this.px / rad, ny = this.py / rad;
      this.px = nx * lim; this.py = ny * lim;
      const vr = this.vx * nx + this.vy * ny;
      if (vr > 0) {
        this.vx -= vr * nx * 1.7; this.vy -= vr * ny * 1.7;
        if (vr > 120 && this.wallCd <= 0) { this.wallCd = 0.25; if (this.ev.wall) this.ev.wall(); }
      }
    }
    const base = Math.min(CFG.FMAX, CFG.FALL0 + CFG.FACC * this.t);
    this.fall = base * (inp.dive ? 1.45 : 1);
    this.pd = this.d; this.d += this.fall * dt;
    this.ifr -= dt; this.nearCd -= dt; this.wallCd -= dt; this.zapCd -= dt;
    for (const k in this.pow) if (this.pow[k] > 0) this.pow[k] -= dt;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    const zi = zoneIdx(this.d);
    if (zi !== this.curZone) { this.curZone = zi; this.bonus += 100; if (this.ev.zone) this.ev.zone(ZONES[zi]); }
    this.ensure();
    if ((this.cullT += dt) > 1) { this.cullT = 0; this.cull(); }
    if (this.pow.laser > 0) {
      for (let i = this.hz.length; i--;) {
        const h = this.hz[i], z = h.d - this.d;
        if (z < 20 || z > 900) continue;
        this.hazXY(h, this.t);
        if (Math.hypot(this.HX - this.px, this.HY - this.py) < 62 + h.r * 0.6) {
          this.hz.splice(i, 1); this.bonus += 5;
          if (this.zapCd <= 0) { this.zapCd = 0.07; if (this.ev.zap) this.ev.zap(); }
        }
      }
    }
    for (let i = 0; i < this.pk.length; i++) {
      const p = this.pk[i]; if (p.got) continue;
      if (this.pow.magnet > 0 && p.k === 0) {
        const z = p.d - this.d;
        if (z > 0 && z < 420) { p.x += (this.px - p.x) * Math.min(1, dt * 6); p.y += (this.py - p.y) * Math.min(1, dt * 6); }
      }
      if (p.d <= this.pd || p.d > this.d) continue;
      if (Math.hypot(p.x - this.px, p.y - this.py) < p.r + pr + 14) {
        p.got = true;
        if (p.k === 0) { this.coins++; this.combo++; this.comboT = 1.2; if (this.ev.coin) this.ev.coin(this.combo); }
        else { if (p.k === 'shield') this.shield = true; else this.pow[p.k] = PUDUR[p.k]; if (this.ev.pow) this.ev.pow(p.k); }
      }
    }
    if (this.ifr <= 0) {
      for (let i = 0; i < this.hz.length; i++) {
        const h = this.hz[i];
        if (h.d <= this.pd || h.d > this.d) continue;
        this.hazXY(h, this.t);
        if (h.m === 5 && !h.act) continue;
        const dx = this.HX - this.px, dy = this.HY - this.py, dd = Math.hypot(dx, dy), rr = h.r + pr;
        if (dd < rr - 6) {
          if (this.shield) { this.shield = false; this.ifr = 0.9; if (this.ev.shieldPop) this.ev.shieldPop(); }
          else {
            if (!this.god) this.lives--;
            this.ifr = CFG.IFR;
            const n = dd || 1; this.vx = -dx / n * 430; this.vy = -dy / n * 430;
            if (this.ev.hit) this.ev.hit();
            if (this.lives <= 0) { this.done = true; if (this.ev.dead) this.ev.dead(); }
          }
          break;
        } else if (dd < rr + 30 && this.nearCd <= 0) {
          this.nearCd = 0.6; this.bonus += 50; if (this.ev.near) this.ev.near();
        }
      }
    }
    this.recAcc += dt;
    if (this.recAcc >= 0.05 && this.track.length < 8000) {
      this.recAcc = 0;
      this.track.push(Math.round(this.t * 100) / 100, Math.round(this.d), Math.round(this.px), Math.round(this.py));
    }
    const ct = Math.min(1, dt * 8);
    this.camX += (curX(this.d) + this.px * 0.25 - this.camX) * ct;
    this.camY += (curY(this.d) + this.py * 0.25 - 70 - this.camY) * ct;
    this.roll += (clamp(-this.vx * 0.0004, -0.07, 0.07) - this.roll) * Math.min(1, dt * 6);
    this.focal += (CFG.FOCAL + 40 * clamp((this.fall - CFG.FALL0) / (CFG.FMAX - CFG.FALL0), 0, 1) - this.focal) * Math.min(1, dt * 3);
    if (this.t >= T_LIMIT && !this.god) this.done = true;
  }
}

/* bot pilot: hug the tunnel center, dodge hazards — imperfectly (skill 0..1) */
function botInput(w, r, skill) {
  // periodic lapses: every few seconds the bot stops paying attention briefly
  const lapse = Math.sin(w.t * 0.9 + skill * 40) > 0.86 - skill * 0.25;
  let ax = -w.px * 0.004, ay = -w.py * 0.004;
  let bd = 1e9, bx = 0, by = 0;
  if (!lapse) {
    const react = 60 + (1 - skill) * 140;   // worse bots see hazards later
    for (const h of w.hz) {
      const z = h.d - w.d;
      if (z < react || z > 420) continue;
      w.hazXY(h, w.t + z / Math.max(1, w.fall));
      const dx = w.HX - w.px, dy = w.HY - w.py, dd = Math.hypot(dx, dy);
      if (dd < h.r + 90 && z < bd) { bd = z; bx = dx; by = dy; }
    }
  }
  if (bd < 1e9) { const n = Math.hypot(bx, by) || 1; ax -= bx / n * (0.5 + skill * 0.7); ay -= by / n * (0.5 + skill * 0.7); }
  ax += (r() - 0.5) * 0.5; ay += (r() - 0.5) * 0.5;
  const l = Math.hypot(ax, ay); if (l > 1) { ax /= l; ay /= l; }
  return { x: ax, y: ay, dive: false };
}

/* ---------------- minigame wrapper ---------------- */
export default {
  id: 'tunnel', name: 'Tunnel Divers', icon: '🕳️',
  desc: '75 seconds. Same tunnel. Deepest diver wins.',
  howto: {
    goal: 'Fall down the tunnel for 75 seconds — dodge everything, grab coins. Depth + coins = score. 3 hits and your run ends early.',
    touch: 'Tilt / drag to steer · hold a finger = dive faster',
    keys: 'WASD / arrows to steer · hold SPACE = dive faster',
    tip: 'Skimming close past hazards pays +50. Everyone gets the SAME tunnel — watch the ghosts.',
  },
  create(ctx) { return new TunnelGame(ctx); }
};

class TunnelGame {
  constructor(ctx) {
    this.ctx = ctx; this.pops = []; this.shake = 0; this.hitFlash = 0;
    this.results = []; this.ghosts = [];   // {name,col,track,gi}
    this.acc = 0; this.tt = 0;
    this.practice = !!ctx.practice;
    this.online = !!ctx.net && !this.practice;
    this.rng = mulberry32(ctx.seed ^ 0xBEEF);
    const locals = ctx.players.filter(p => p.local && !p.bot);
    const bots = this.practice ? [] : ctx.players.filter(p => p.bot);
    this.queue = this.practice ? [locals[0]] : [...locals];   // hot-seat order
    this.remotes = this.online ? ctx.players.filter(p => !p.local && !p.bot) : [];
    this.remoteLive = {};                  // id -> {d,x,y,score,done}
    // pre-sim bots to ghost tracks + scores
    for (const b of bots) {
      const bh = hashSeed(b.id);
      const w = new TunnelWorld(ctx.seed), br = mulberry32((ctx.seed ^ bh) >>> 0);
      const skill = 0.45 + (bh % 100) / 250;   // 0.45–0.85, stable per bot
      while (!w.done) w.step(DT, botInput(w, br, skill));
      this.results.push({ id: b.id, score: w.score(), label: Math.floor(w.d / 10) + 'm', name: b.name, color: b.color });
      this.ghosts.push({ name: b.name, col: b.color, track: w.track, gi: 0 });
    }
    if (ctx.onNet) ctx.onNet((t, p) => {
      if (t === 'g' && p.k === 'pos') this.remoteLive[p.id] = p;
    });
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
    const evs = {
      coin: n => this.ctx.audio.sfx.coin(n),
      hit: () => { this.ctx.audio.sfx.hit(); this.shake = 14; this.hitFlash = 1; },
      near: () => { this.ctx.audio.sfx.near(); this.pop('CLOSE! +50', '#8fd0ff'); },
      pow: k => { this.ctx.audio.sfx.pow(); this.pop(PUEMO[k] + ' ' + k.toUpperCase() + '!', PUCOL[k]); },
      shieldPop: () => { this.ctx.audio.sfx.shield(); this.pop('SHIELD!', '#59d9ff'); },
      dead: () => this.ctx.audio.sfx.death(),
      zone: z => { this.ctx.audio.sfx.zone(); this.pop('· ' + z.name + ' ·', 'hsl(' + z.h + ' ' + z.s + '% 70%)', true); },
      wall: () => this.ctx.audio.sfx.wall(),
      zap: () => this.ctx.audio.sfx.zap(),
    };
    this.world = new TunnelWorld(this.ctx.seed, evs, this.practice);
    for (const g of this.ghosts) g.gi = 0;
    this.state = 'run'; this.stateT = 0;
  }
  pop(txt, col, big) { this.pops.push({ txt, col: col || '#ffd23f', t: 0, dur: big ? 1.6 : 0.9, big }); }

  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
    this.shake *= Math.exp(-7 * rdt);
    this.hitFlash = Math.max(0, this.hitFlash - rdt * 2.2);
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    if (this.state === 'ready') {
      const inp = this.ctx.input(this.runner.slot, rdt);
      if ((inp.act || this.stateT > (this.online ? 3 : 9990)) && this.stateT > 0.5) this.startRun();
    } else if (this.state === 'run') {
      const w = this.world;
      this.acc += rdt;
      let n = 0;
      while (this.acc >= DT && n < 10) {
        const inp = this.ctx.input(this.runner.slot, DT);
        w.step(DT, { x: inp.x, y: inp.y, dive: inp.hold });
        this.acc -= DT; n++;
      }
      if (n >= 10) this.acc = 0;
      this.ctx.audio.setMusicIntensity(0.55 + w.curZone * 0.1);
      if (this.online) {
        this._nAcc = (this._nAcc || 0) + rdt;
        if (this._nAcc > 0.1) {
          this._nAcc = 0;
          this.ctx.net.send('g', { k: 'pos', id: this.runner.id, d: w.d, x: w.px, y: w.py, score: w.score(), done: w.done });
        }
      }
      if (w.done) {
        this.results.push({
          id: this.runner.id, score: w.score(), label: Math.floor(w.d / 10) + 'm',
          name: this.runner.name, color: this.runner.color
        });
        this.ghosts.push({ name: this.runner.name, col: this.runner.color, track: w.track, gi: 0 });
        this.nextRunner();
      }
    } else if (this.state === 'wait') {
      // hot-seat: done. online: give remotes a moment to report final scores
      let allDone = true;
      for (const r of this.remotes) { const s = this.remoteLive[r.id]; if (!s || !s.done) allDone = false; }
      if (!this.online || allDone || this.stateT > 12) {
        for (const r of this.remotes) {
          const s = this.remoteLive[r.id];
          this.results.push({ id: r.id, score: s ? s.score : 0, label: s ? Math.floor(s.d / 10) + 'm' : 'dnf', name: r.name, color: r.color });
        }
        this.ctx.end(this.results);
      }
    }
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    const CX = W / 2, CY = H * 0.46, V = Math.min(W, H) / 700;
    const w = this.world;
    if (this.state === 'ready' || !w) {
      g.fillStyle = '#0b0704'; g.fillRect(0, 0, W, H);
      g.textAlign = 'center'; g.fillStyle = this.runner ? this.runner.color : '#ffd23f';
      g.font = '900 34px system-ui';
      if (this.runner) {
        g.fillText(this.runner.name, CX, H * 0.4);
        g.fillStyle = '#ffeccf'; g.font = '800 20px system-ui';
        g.fillText('GET READY — tap / SPACE to dive', CX, H * 0.4 + 40);
        if (this.results.length) {
          g.font = '700 15px system-ui'; g.fillStyle = '#93a0bd';
          g.fillText('scores so far: ' + this.results.map(r => r.name + ' ' + r.score).join(' · '), CX, H * 0.4 + 80);
        }
      }
      return;
    }
    if (this.state === 'wait') {
      g.fillStyle = '#0b0704'; g.fillRect(0, 0, W, H);
      g.textAlign = 'center'; g.fillStyle = '#ffeccf'; g.font = '800 22px system-ui';
      g.fillText(this.online ? 'waiting for other divers…' : 'tallying…', CX, H * 0.45);
      return;
    }
    const d = w.d, cX = w.camX, cY = w.camY, foc = w.focal, st = w.t;
    const zi = zoneIdx(d), zn = ZONES[zi];
    const start = zi ? ZONES[zi - 1].until : 0, zf = clamp((d - start) / 800, 0, 1);
    const bg0 = zi > 0 && zf < 1 ? mixHex(ZONES[zi - 1].bg[0], zn.bg[0], zf) : zn.bg[0];
    const bg1 = zi > 0 && zf < 1 ? mixHex(ZONES[zi - 1].bg[1], zn.bg[1], zf) : zn.bg[1];
    const bgg = g.createRadialGradient(CX, CY, 10, CX, CY, Math.min(W, H) * 0.85);
    bgg.addColorStop(0, bg0); bgg.addColorStop(1, bg1);
    g.fillStyle = bgg; g.fillRect(0, 0, W, H);
    g.save();
    if (this.shake > 0.2) g.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    g.translate(CX, CY); g.rotate(w.roll); g.translate(-CX, -CY);
    const items = [];
    const first = Math.floor(d / RINGSP) * RINGSP + RINGSP;
    for (let k = 0; k < 40; k++) { const rd = first + k * RINGSP, z = rd - d; if (z >= 1 && z <= CFG.REND) items.push({ z, ty: 0, rd }); }
    for (const h of w.hz) { const z = h.d - d; if (z >= 1 && z <= CFG.REND) items.push({ z, ty: 1, o: h }); }
    for (const p of w.pk) { if (p.got) continue; const z = p.d - d; if (z >= 1 && z <= CFG.REND) items.push({ z, ty: 2, o: p }); }
    // ghosts: replay tracks by time
    for (const gh of this.ghosts) {
      const tr = gh.track;
      if (st >= tr[tr.length - 4]) continue;
      while (gh.gi + 7 < tr.length && tr[gh.gi + 4] <= st) gh.gi += 4;
      if (gh.gi + 7 < tr.length) {
        const t0 = tr[gh.gi], t1 = tr[gh.gi + 4], f = t1 > t0 ? clamp((st - t0) / (t1 - t0), 0, 1) : 0;
        const gd = lerp(tr[gh.gi + 1], tr[gh.gi + 5], f), z = gd - d;
        if (z > -80 && z < CFG.REND)
          items.push({ z: Math.max(z, 2), ty: 3, gx: lerp(tr[gh.gi + 2], tr[gh.gi + 6], f), gy: lerp(tr[gh.gi + 3], tr[gh.gi + 7], f), gd, name: gh.name, col: gh.col });
      }
    }
    // live remote divers
    for (const r of this.remotes) {
      const s = this.remoteLive[r.id];
      if (!s || s.done) continue;
      const z = s.d - d;
      if (z > -80 && z < CFG.REND) items.push({ z: Math.max(z, 2), ty: 3, gx: s.x, gy: s.y, gd: s.d, name: r.name, col: r.color });
    }
    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      const z = it.z, s = foc / (z + foc);
      if (it.ty === 0) {
        const rd = it.rd, rx = CX + (curX(rd) - cX) * s * V, ry = CY + (curY(rd) - cY) * s * V, rad2 = TR * s * V;
        let h = zn.h, s2 = zn.s, l = zn.l;
        if (zi === 4) h = (278 + rd * 0.02) % 360;
        if (rd < 900) { const gr = rd / 900; h = hlerp(95, h, gr); s2 = lerp(50, s2, gr); l = lerp(32, l, gr); }
        const big = Math.round(rd / RINGSP) % 8 === 0, a0 = rd * 0.0012;
        g.globalAlpha = Math.pow(1 - z / CFG.REND, 1.5) * (big ? 0.95 : 0.55);
        g.strokeStyle = 'hsl(' + h.toFixed(0) + ' ' + s2.toFixed(0) + '% ' + (l + (big ? 14 : 0)).toFixed(0) + '%)';
        g.lineWidth = Math.max(0.6, (big ? 5 : 3) * s * V);
        g.beginPath();
        const ca = Math.cos(a0), sa = Math.sin(a0);
        for (let j = 0; j < 12; j++) {
          const ux = Math.cos(j / 12 * TAU) * ca - Math.sin(j / 12 * TAU) * sa;
          const uy = Math.cos(j / 12 * TAU) * sa + Math.sin(j / 12 * TAU) * ca;
          if (j === 0) g.moveTo(rx + ux * rad2, ry + uy * rad2); else g.lineTo(rx + ux * rad2, ry + uy * rad2);
        }
        g.closePath(); g.stroke();
      } else if (it.ty === 1) {
        const h = it.o; w.hazXY(h, st);
        const wx = w.HX + curX(h.d), wy = w.HY + curY(h.d);
        const sx = CX + (wx - cX) * s * V, sy = CY + (wy - cY) * s * V, ra = h.r * s * V;
        if (ra < 0.7) continue;
        g.globalAlpha = clamp(1.25 - z / CFG.REND * 1.25, 0, 1);
        if (h.sp === 'spout' && !h.act) {
          if (h.si === 0) {
            const warn = h.cf > 0.82 ? (h.cf - 0.82) / 0.18 : 0;
            g.fillStyle = 'rgba(255,122,47,' + (0.35 + warn * 0.55) + ')';
            g.beginPath(); g.arc(sx, sy, ra * (0.8 + warn * 1.6), 0, TAU); g.fill();
          }
          continue;
        }
        g.fillStyle = h.col; g.beginPath();
        if (h.j !== undefined) {
          for (let j = 0; j < 8; j++) {
            const a = j / 8 * TAU, rv = ra * (0.82 + 0.22 * Math.sin(h.j + j * 2.1));
            const xx = sx + Math.cos(a) * rv, yy = sy + Math.sin(a) * rv;
            if (j === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
          }
          g.closePath();
        } else g.arc(sx, sy, ra, 0, TAU);
        g.fill();
        g.lineWidth = Math.max(1, 3 * s * V); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.stroke();
        if (h.sp === 'spout') { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(sx, sy, ra * 0.5, 0, TAU); g.fill(); }
        else if (h.sp === 'tent') { g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.arc(sx, sy, ra * 0.32, 0, TAU); g.fill(); }
        else if (h.sp === 'eye' && ra > 4) {
          const px2 = CX + ((w.px + curX(d)) - cX) * V, py2 = CY + ((w.py + curY(d)) - cY) * V;
          const ddx = px2 - sx, ddy = py2 - sy, dn = Math.hypot(ddx, ddy) || 1;
          g.fillStyle = '#7a2bd0'; g.beginPath(); g.arc(sx + ddx / dn * ra * 0.3, sy + ddy / dn * ra * 0.3, ra * 0.42, 0, TAU); g.fill();
          g.fillStyle = '#14060a'; g.beginPath(); g.arc(sx + ddx / dn * ra * 0.38, sy + ddy / dn * ra * 0.38, ra * 0.2, 0, TAU); g.fill();
        } else if (ra > 4) {
          g.fillStyle = 'rgba(255,255,255,0.14)';
          g.beginPath(); g.arc(sx - ra * 0.28, sy - ra * 0.28, ra * 0.45, 0, TAU); g.fill();
        }
      } else if (it.ty === 2) {
        const p = it.o, wx = p.x + curX(p.d), wy = p.y + curY(p.d);
        const sx = CX + (wx - cX) * s * V, sy = CY + (wy - cY) * s * V, ra = p.r * s * V;
        if (ra < 0.6) continue;
        g.globalAlpha = clamp(1.25 - z / CFG.REND * 1.25, 0, 1);
        if (p.k === 0) {
          const sq = Math.max(0.15, Math.abs(Math.cos(st * 5 + p.d * 0.013)));
          g.fillStyle = '#ffd23f'; g.beginPath();
          g.ellipse(sx, sy, ra * sq, ra, 0, 0, TAU); g.fill();
          g.lineWidth = Math.max(1, 2.2 * s * V); g.strokeStyle = '#a87914'; g.stroke();
        } else {
          const bob = Math.sin(st * 3 + p.d) * 5 * s * V;
          g.fillStyle = PUCOL[p.k]; g.beginPath();
          g.arc(sx, sy + bob, ra * 1.35, 0, TAU); g.fill();
          g.lineWidth = Math.max(1, 3 * s * V); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke();
          if (ra > 3) { g.font = Math.round(ra * 1.6) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(PUEMO[p.k], sx, sy + bob); }
        }
      } else {
        const wx = it.gx + curX(it.gd), wy = it.gy + curY(it.gd);
        const sx = CX + (wx - cX) * s * V, sy = CY + (wy - cY) * s * V;
        g.globalAlpha = 0.4; g.strokeStyle = it.col; g.fillStyle = it.col;
        g.lineWidth = Math.max(1, 4 * s * V); g.lineCap = 'round';
        const R2 = 14 * s * V;
        g.beginPath(); g.arc(sx, sy, R2 * 0.6, 0, TAU); g.fill();
        for (let j = 0; j < 4; j++) {
          const a = j * HPI + HPI / 2 + Math.sin(st * 10 + j) * 0.3;
          g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a) * R2 * 1.6, sy + Math.sin(a) * R2 * 1.6); g.stroke();
        }
        if (z < 700) { g.globalAlpha = 0.6; g.font = '700 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(it.name, sx, sy - R2 * 2); }
      }
    }
    g.globalAlpha = 1;
    // player diver
    const sx = CX + ((w.px + curX(d)) - cX) * V, sy = CY + ((w.py + curY(d)) - cY) * V;
    if (w.pow.laser > 0) {
      const pulse = 0.8 + Math.sin(st * 40) * 0.2;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(125,255,106,0.22)'; g.lineWidth = 15 * V * pulse;
      g.beginPath(); g.moveTo(sx, sy - 8 * V); g.lineTo(CX, CY); g.stroke();
      g.strokeStyle = '#c9ffb0'; g.lineWidth = 4 * V * pulse;
      g.beginPath(); g.moveTo(sx, sy - 8 * V); g.lineTo(CX, CY); g.stroke();
    }
    const blink = w.ifr > 0 && Math.floor(st * 14) % 2 === 1;
    g.globalAlpha = blink ? 0.35 : 1;
    const panic = clamp(w.fall / CFG.FMAX, 0, 1), ph = st * 13;
    const lean = clamp(w.vx * 0.0007, -0.55, 0.55);
    const sc = V * 1.15 * (w.pow.tiny > 0 ? 0.75 : 1);
    g.save(); g.translate(sx, sy); g.rotate(lean); g.scale(sc, sc);
    g.lineCap = 'round';
    g.strokeStyle = '#2b6cb0'; g.lineWidth = 6;
    for (const s2 of [-1, 1]) { g.beginPath(); g.moveTo(s2 * 6, 10); g.lineTo(s2 * (11 + Math.sin(ph + s2) * 5 * (0.5 + panic)), 26 + Math.cos(ph * 1.1 + s2) * 4); g.stroke(); }
    g.strokeStyle = this.runner.color; g.lineWidth = 6;
    for (const s2 of [-1, 1]) { g.beginPath(); g.moveTo(s2 * 10, -2); g.lineTo(s2 * (21 + Math.sin(ph * 1.3 + s2 * 2) * 7 * (0.5 + panic)), 4 - 10 * panic + Math.cos(ph * 1.2 + s2) * 5); g.stroke(); }
    g.fillStyle = this.runner.color; g.strokeStyle = '#14100a'; g.lineWidth = 3;
    g.beginPath(); g.roundRect ? g.roundRect(-11, -6, 22, 20, 8) : g.rect(-11, -6, 22, 20); g.fill(); g.stroke();
    g.fillStyle = '#ffd9b3'; g.beginPath(); g.arc(0, -16, 10.5, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#2d3436'; g.fillRect(-9, -22, 18, 7);
    g.fillStyle = '#9ad3ff';
    g.beginPath(); g.arc(-4, -18.5, 2.6, 0, TAU); g.fill();
    g.beginPath(); g.arc(4, -18.5, 2.6, 0, TAU); g.fill();
    g.fillStyle = '#7a3b2e'; g.beginPath(); g.arc(0, -10.5, 1.5 + 4.5 * panic, 0, TAU); g.fill();
    g.restore();
    g.globalAlpha = 1;
    if (w.shield) {
      g.strokeStyle = '#59d9ff'; g.lineWidth = 3 * V;
      g.globalAlpha = 0.7 + Math.sin(st * 6) * 0.25;
      g.beginPath(); g.arc(sx, sy, 30 * V, 0, TAU); g.stroke(); g.globalAlpha = 1;
    }
    g.restore();
    if (this.hitFlash > 0) { g.fillStyle = 'rgba(255,45,25,' + (this.hitFlash * 0.3).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
    // HUD
    g.textAlign = 'left'; g.font = '800 18px system-ui'; g.fillStyle = '#ffd23f';
    g.fillText(Math.floor(d / 10) + 'm', 14, 30);
    g.fillStyle = '#ffeccf'; g.fillText('🪙 ' + w.coins, 14, 54);
    g.fillText('🧡'.repeat(Math.max(0, w.lives)), 14, 78);
    g.textAlign = 'center'; g.font = '900 24px system-ui';
    if (this.practice) { g.fillStyle = '#7dff6a'; g.fillText('PRACTICE', W / 2, 32); }
    else {
      const tl = Math.max(0, T_LIMIT - w.t);
      g.fillStyle = tl < 10 ? '#ff5f5f' : '#ffeccf';
      g.fillText(Math.ceil(tl) + '', W / 2, 32);
    }
    // pops
    for (const p of this.pops) {
      const f = 1 - p.t / p.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + (p.big ? 30 : 20) + 'px system-ui';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      const y = H * 0.3 - p.t * 45;
      g.strokeText(p.txt, W / 2, y);
      g.fillStyle = p.col; g.fillText(p.txt, W / 2, y);
    }
    g.globalAlpha = 1;
  }
  dispose() { }
}
