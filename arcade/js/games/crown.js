// CROWN STEAL — top-down shrinking arena. Grab the crown, hold it, get bodied.
// Momentum movement + dash bumps; bots fill to 4. Most crown-time in 75s wins.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';

const T_LIMIT = 75, ACC = 2300, DRAG = 3.0, VMAX = 640, DASH_CD = 1.2, PR = 22;

export default {
  id: 'crown', name: 'Crown Steal', icon: '👑',
  desc: 'Shrinking arena. Hold the crown longest. Shove accordingly.',
  create(ctx) { return new CrownGame(ctx); }
};

class CrownGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = mulberry32(ctx.seed);
    this.t = 0; this.shake = 0; this.pops = [];
    const n = Math.max(4, ctx.players.length);
    this.ps = [];
    for (let i = 0; i < n; i++) {
      const base = ctx.players[i];
      const a = i / n * TAU + 0.7;
      this.ps.push({
        id: base ? base.id : 'bot' + i,
        name: base ? base.name : ['CHAD', 'BLINKY', 'MOOSE', 'GARY'][i % 4],
        color: base ? base.color : ['#ffb84d', '#66e0c9', '#d5b3ff', '#ff8a5c'][i % 4],
        local: base ? base.local : false, slot: base ? base.slot : -1,
        bot: base ? !!base.bot : true, isFill: !base,
        x: Math.cos(a) * 0.3, y: Math.sin(a) * 0.3,  // arena-space (unit circle-ish)
        vx: 0, vy: 0, crownT: 0, dashCd: 0, outT: 0, fx: 1, fy: 0,
        wob: this.rng() * TAU,
      });
    }
    this.crown = { holder: null, x: 0, y: 0, vx: 0, vy: 0, cd: 0 };
    this.banner('GRAB THE CROWN!', '#ffd23f', 1.6);
    if (ctx.net) ctx.net.onMsg = (t, p, from) => this.onNet(t, p, from);
    this.netAcc = 0;
  }
  banner(txt, col, dur) { this.pops.push({ txt, col, t: 0, dur, big: true }); }
  pop(txt, x, y, col) { this.pops.push({ txt, x, y, col: col || '#ffeccf', t: 0, dur: 0.8 }); }
  arenaR() { return lerp(1, 0.52, clamp(this.t / T_LIMIT, 0, 1)); } // arena-space radius

  onNet(t, p, from) {
    if (t !== 'g') return;
    if (p.k === 'pos') {
      const q = this.ps.find(z => z.id === p.id);
      if (q && !q.local) { q.nx = p.x; q.ny = p.y; q.vx = p.vx; q.vy = p.vy; }
    } else if (p.k === 'crown' && !this.ctx.net.isHost) {
      this.crown.holder = p.h; this.crown.x = p.x; this.crown.y = p.y;
      const q = this.ps.find(z => z.id === p.h); if (q) q.crownT = p.ht;
    } else if (p.k === 'dash') {
      const q = this.ps.find(z => z.id === p.id);
      if (q && !q.local) this.doDash(q);
    }
  }

  update(dt) {
    this.t += dt; this.shake *= Math.exp(-7 * dt);
    for (let i = this.pops.length; i--;) { this.pops[i].t += dt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    const R = this.arenaR(), online = !!this.ctx.net, host = !online || this.ctx.net.isHost;
    for (const p of this.ps) {
      p.dashCd -= dt; p.wob += dt * 9;
      if (p.outT > 0) {  // fell out — respawning
        p.outT -= dt;
        if (p.outT <= 0) { const a = this.rng() * TAU; p.x = Math.cos(a) * R * 0.8; p.y = Math.sin(a) * R * 0.8; p.vx = p.vy = 0; }
        continue;
      }
      if (p.local && !p.bot) {
        const inp = this.ctx.input(p.slot, dt);
        p.vx += inp.x * ACC * dt; p.vy += inp.y * ACC * dt;
        if (inp.act && p.dashCd <= 0) { this.doDash(p); if (online) this.ctx.net.send('g', { k: 'dash', id: p.id }); }
      } else if (p.bot && (host || !p.isFill)) {
        this.botThink(p, dt, R);
      } else if (online && !p.local) {
        // remote-controlled: glide toward last reported state
        if (p.nx != null) { p.x = lerp(p.x, p.nx, Math.min(1, dt * 10)); p.y = lerp(p.y, p.ny, Math.min(1, dt * 10)); }
        p.x += p.vx * dt / 600; p.y += p.vy * dt / 600;
        continue;
      }
      const dr = Math.exp(-DRAG * dt); p.vx *= dr; p.vy *= dr;
      const sp = Math.hypot(p.vx, p.vy), lim = VMAX * (this.crown.holder === p.id ? 0.78 : 1);
      if (sp > lim) { p.vx *= lim / sp; p.vy *= lim / sp; }
      if (sp > 30) { p.fx = p.vx / sp; p.fy = p.vy / sp; }
      p.x += p.vx * dt / 600; p.y += p.vy * dt / 600;   // 600 = arena scale
      // out of arena?
      const d = Math.hypot(p.x, p.y);
      if (d > R + 0.06) {
        p.outT = 1.6; this.ctx.audio.sfx.whoosh(); this.shakeUp(6);
        this.pop('AAAA!', p.x, p.y, p.color);
        if (this.crown.holder === p.id) this.dropCrown(p, 0.5);
      }
    }
    // player-player bumps
    for (let i = 0; i < this.ps.length; i++) for (let j = i + 1; j < this.ps.length; j++) {
      const a = this.ps[i], b = this.ps[j];
      if (a.outT > 0 || b.outT > 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy), min = PR * 2 / 600;
      if (dd < min && dd > 0.0001) {
        const nx = dx / dd, ny = dy / dd, push = (min - dd) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy, rel = rvx * nx + rvy * ny;
        if (rel < 0) {
          const imp = -rel * 0.9;
          a.vx -= nx * imp / 2; a.vy -= ny * imp / 2; b.vx += nx * imp / 2; b.vy += ny * imp / 2;
          if (-rel > 500) {  // a real hit
            this.ctx.audio.sfx.thud(0.8); this.shakeUp(5);
            const holder = this.crown.holder;
            if (host && (holder === a.id || holder === b.id)) {
              const vic = holder === a.id ? a : b;
              this.dropCrown(vic, 1);
              this.pop('CROWN LOOSE!', vic.x, vic.y - 0.06, '#ffd23f');
            }
          }
        }
      }
    }
    // crown
    if (host) {
      const c = this.crown; c.cd -= dt;
      if (c.holder) {
        const h = this.ps.find(p => p.id === c.holder);
        if (h) { c.x = h.x; c.y = h.y; h.crownT += dt; }
      } else {
        c.vx *= Math.exp(-2 * dt); c.vy *= Math.exp(-2 * dt);
        c.x += c.vx * dt; c.y += c.vy * dt;
        const d = Math.hypot(c.x, c.y); if (d > this.arenaR() * 0.95) { c.x *= 0.95 * this.arenaR() / d; c.y *= 0.95 * this.arenaR() / d; }
        if (c.cd <= 0) for (const p of this.ps) {
          if (p.outT > 0) continue;
          if (Math.hypot(p.x - c.x, p.y - c.y) < (PR + 16) / 600) {
            c.holder = p.id; this.ctx.audio.sfx.grab();
            this.pop('👑 ' + p.name + '!', p.x, p.y - 0.07, p.color); break;
          }
        }
      }
      if (this.ctx.net) {
        this.netAcc += dt;
        if (this.netAcc > 0.09) {
          this.netAcc = 0;
          const h = this.ps.find(p => p.id === c.holder);
          this.ctx.net.send('g', { k: 'crown', h: c.holder, x: c.x, y: c.y, ht: h ? h.crownT : 0 });
          // host owns the fill bots — everyone else just renders them
          for (const p of this.ps) if (p.isFill)
            this.ctx.net.send('g', { k: 'pos', id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy });
        }
      }
    }
    // broadcast own position
    if (this.ctx.net) {
      this._pAcc = (this._pAcc || 0) + dt;
      if (this._pAcc > 0.08) {
        this._pAcc = 0;
        const me = this.ps.find(p => p.local && !p.bot);
        if (me) this.ctx.net.send('g', { k: 'pos', id: me.id, x: me.x, y: me.y, vx: me.vx, vy: me.vy });
      }
    }
    this.ctx.audio.setMusicIntensity(0.5 + (1 - this.arenaR()) * 0.6 + (this.crown.holder ? 0.1 : 0));
    if (this.t >= T_LIMIT) this.finish();
  }
  doDash(p) {
    p.dashCd = DASH_CD;
    p.vx += p.fx * 900; p.vy += p.fy * 900;
    this.ctx.audio.sfx.dash();
  }
  dropCrown(vic, boost) {
    const c = this.crown;
    c.holder = null; c.cd = 0.35;
    const a = this.rng() * TAU;
    c.x = vic.x; c.y = vic.y;
    c.vx = Math.cos(a) * 0.5 * boost; c.vy = Math.sin(a) * 0.5 * boost;
  }
  botThink(p, dt, R) {
    const c = this.crown;
    let tx, ty;
    if (c.holder === p.id) {           // run away, stay inside
      let fx = 0, fy = 0;
      for (const q of this.ps) if (q !== p && q.outT <= 0) {
        const d = Math.hypot(p.x - q.x, p.y - q.y) + 0.01;
        fx += (p.x - q.x) / d / d; fy += (p.y - q.y) / d / d;
      }
      const cd = Math.hypot(p.x, p.y);
      tx = p.x + fx * 0.05 - p.x * (cd > R * 0.7 ? 0.4 : 0);
      ty = p.y + fy * 0.05 - p.y * (cd > R * 0.7 ? 0.4 : 0);
    } else if (c.holder) {             // chase the holder
      const h = this.ps.find(q => q.id === c.holder);
      tx = h ? h.x : 0; ty = h ? h.y : 0;
      if (h && p.dashCd <= 0 && Math.hypot(p.x - h.x, p.y - h.y) < 0.16) this.doDash(p);
    } else { tx = c.x; ty = c.y; }     // free crown — go get it
    const dx = tx - p.x + Math.sin(p.wob) * 0.03, dy = ty - p.y + Math.cos(p.wob * 1.3) * 0.03;
    const d = Math.hypot(dx, dy) || 1;
    p.vx += dx / d * ACC * 0.85 * dt; p.vy += dy / d * ACC * 0.85 * dt;
  }
  shakeUp(v) { this.shake = Math.max(this.shake, v); }
  finish() {
    if (this.done) return; this.done = true;
    const order = [...this.ps].sort((a, b) => b.crownT - a.crownT);
    this.ctx.end(order.filter(p => !p.isFill || true).map(p => ({
      id: p.id, score: Math.round(p.crownT * 10) / 10, label: p.crownT.toFixed(1) + 's',
      name: p.name, color: p.color, isFill: p.isFill,
    })));
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    const S = Math.min(W, H) * 0.46, cx = W / 2, cy = H / 2 + 10;
    const grd = g.createRadialGradient(cx, cy, 20, cx, cy, Math.max(W, H) * 0.7);
    grd.addColorStop(0, '#241a38'); grd.addColorStop(1, '#0b0714');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.save();
    if (this.shake > 0.3) g.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    const R = this.arenaR() * S;
    // the void below
    g.fillStyle = '#050308';
    g.beginPath(); g.arc(cx, cy, R + 26, 0, TAU); g.fill();
    // platform
    const danger = this.t > T_LIMIT - 15;
    g.fillStyle = danger && Math.floor(this.t * 4) % 2 ? '#4a2438' : '#2c3a52';
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    g.strokeStyle = '#5a7096'; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    for (let i = 0; i < 8; i++) {  // floor marks
      g.strokeStyle = 'rgba(90,112,150,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, R * (i + 1) / 9, 0, TAU); g.stroke();
    }
    // crown on ground
    const c = this.crown;
    if (!c.holder) this.drawCrown(g, cx + c.x * S, cy + c.y * S - 8 - Math.sin(this.t * 4) * 4, 1.15);
    // players
    const sorted = [...this.ps].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      if (p.outT > 0) continue;
      const px = cx + p.x * S, py = cy + p.y * S;
      const sp = Math.hypot(p.vx, p.vy) / VMAX;
      // shadow
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath(); g.ellipse(px, py + PR * 0.72, PR * 0.9, PR * 0.4, 0, 0, TAU); g.fill();
      // body: squash with speed, wobble limbs
      g.save(); g.translate(px, py);
      g.rotate(Math.atan2(p.fy, p.fx) * 0.15 * sp);
      g.lineCap = 'round'; g.strokeStyle = p.color; g.lineWidth = 6;
      for (let l = 0; l < 4; l++) {
        const a = l * HALF + Math.sin(p.wob + l) * 0.4 * (0.3 + sp);
        g.beginPath(); g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * PR * 1.15, Math.sin(a) * PR * 1.15); g.stroke();
      }
      g.fillStyle = p.color; g.strokeStyle = '#14100a'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, PR * (1 + sp * 0.08), 0, TAU); g.fill(); g.stroke();
      // face looks toward motion
      const ex = p.fx * 5, ey = p.fy * 5;
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(-6 + ex, -3 + ey, 5, 0, TAU); g.fill();
      g.beginPath(); g.arc(6 + ex, -3 + ey, 5, 0, TAU); g.fill();
      g.fillStyle = '#14100a';
      g.beginPath(); g.arc(-6 + ex * 1.4, -3 + ey * 1.4, 2.4, 0, TAU); g.fill();
      g.beginPath(); g.arc(6 + ex * 1.4, -3 + ey * 1.4, 2.4, 0, TAU); g.fill();
      g.beginPath(); g.arc(0, 6, 3 + sp * 3, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
      if (c.holder === p.id) this.drawCrown(g, 0, -PR - 12, 1);
      g.restore();
      // name
      g.font = '800 12px system-ui'; g.textAlign = 'center';
      g.fillStyle = 'rgba(10,8,4,0.7)'; g.fillText(p.name, px + 1, py - PR - (c.holder === p.id ? 30 : 12) + 1);
      g.fillStyle = p.color; g.fillText(p.name, px, py - PR - (c.holder === p.id ? 30 : 12));
      // dash ready pip
      if (p.local && !p.bot) {
        g.fillStyle = p.dashCd <= 0 ? '#7dff6a' : 'rgba(147,160,189,0.5)';
        g.beginPath(); g.arc(px, py + PR + 10, 4, 0, TAU); g.fill();
      }
    }
    g.restore();
    // HUD: timer + crown-time bars
    g.textAlign = 'center'; g.font = '900 26px system-ui';
    const tl = Math.max(0, T_LIMIT - this.t);
    g.fillStyle = tl < 10 ? '#ff5f5f' : '#ffeccf';
    g.fillText(Math.ceil(tl) + '', W / 2, 36);
    const bw = Math.min(130, W / this.ps.length - 16);
    this.ps.forEach((p, i) => {
      const x = W / 2 + (i - (this.ps.length - 1) / 2) * (bw + 12) - bw / 2, y = H - 34;
      g.fillStyle = 'rgba(20,26,40,0.7)'; g.fillRect(x, y, bw, 8);
      g.fillStyle = p.color; g.fillRect(x, y, bw * clamp(p.crownT / 30, 0, 1), 8);
      g.font = '700 11px system-ui'; g.textAlign = 'left';
      g.fillStyle = p.color; g.fillText(p.name + ' ' + p.crownT.toFixed(1) + 's', x, y - 5);
    });
    // pops
    g.textAlign = 'center';
    const S2 = Math.min(W, H) * 0.46;
    for (const p of this.pops) {
      const f = 1 - p.t / p.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + (p.big ? 30 : 16) + 'px system-ui';
      const x = p.x != null ? W / 2 + p.x * S2 : W / 2;
      const y = (p.y != null ? H / 2 + 10 + p.y * S2 : H * 0.28) - p.t * 45;
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
const HALF = Math.PI / 2;
