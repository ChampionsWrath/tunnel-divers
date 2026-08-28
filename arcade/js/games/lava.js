// FLOOR IS LAVA — a stone platform over lava, tiled in four colors.
// "GET TO GREEN!" — scramble (and shove) onto the safe color before everything
// else sinks. Safe tiles get scarcer every round. Last diver standing wins.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';
import { drawDiverTop } from '../character.js?v=25';

const COLS = 5, ROWS = 4, MAX_ROUNDS = 14;
const ACC = 2300, DRAG = 3.0, VMAX = 620, DASH_CD = 1.2, PR = 20;
const TCOLS = [['#e04040', 'RED'], ['#4d9de0', 'BLUE'], ['#3a9d5c', 'GREEN'], ['#ffd23f', 'YELLOW']];
const SHAPE_GLYPH = ['●', '▲', '■'], SHAPE_NAME = ['CIRCLE', 'TRIANGLE', 'SQUARE'];
/* difficulty ladder — each phase teaches one thing before the next lands:
   r1-5 color only · r6-7 shape only (shapes appear on tiles) · r8-9 color+shape
   r10 number only (numbers appear) · r11 color+number · r12+ color+shape+number */
function specFor(r) {
  if (r <= 5) return ['col'];
  if (r <= 7) return ['shape'];
  if (r <= 9) return ['col', 'shape'];
  if (r === 10) return ['num'];
  if (r === 11) return ['col', 'num'];
  return ['col', 'shape', 'num'];
}

export default {
  id: 'lava', name: 'Floor is Lava', icon: '🌋',
  desc: 'Scramble to the safe color before the floor sinks.',
  howto: {
    goal: 'The floor calls a SAFE target — get both feet on a matching tile before the rest sinks into lava! Early rounds call a COLOR… then SHAPES appear (round 6), then NUMBERS (round 10), and late rounds call combos like "GREEN ▲ 3". Safe tiles get rarer every round. Last diver standing wins.',
    touch: 'Tilt / drag to run · TAP = DASH (shove!)',
    keys: 'P1: WASD + SPACE dash · P2: arrows + ENTER',
    tip: 'Read the WHOLE call — late rounds need the right color AND shape AND number. A well-timed DASH off the buzzer is legal and encouraged.',
  },
  create(ctx) { return new LavaGame(ctx); }
};

const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

class LavaGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.practice = !!ctx.practice;
    this.rng = mulberry32(ctx.seed);
    const src = this.practice ? ctx.players.map(p => (p.local ? p : { ...p, bot: true })) : ctx.players;
    const n = Math.max(4, src.length);
    this.ps = [];
    for (let i = 0; i < n; i++) {
      const base = src[i], bh = hashSeed(base ? base.id : 'f' + i);
      this.ps.push({
        id: base ? base.id : 'fill' + i,
        name: base ? base.name : ['CHAD', 'BLINKY', 'MOOSE', 'GARY'][i % 4],
        color: base ? base.color : ['#ffb84d', '#66e0c9', '#d5b3ff', '#ff8a5c'][i % 4],
        local: base ? base.local : false, slot: base ? base.slot : -1,
        bot: base ? !!base.bot : true, isFill: !base, cos: base && base.cosmetics, ward: base && base.ward, skin: base && base.skin,
        x: 0.2 + (i % 2) * 0.6, y: 0.3 + Math.floor(i / 2) * 0.4,   // grid-space 0..1
        vx: 0, vy: 0, alive: true, dashCd: 0, dashT: 0, fx: 1, fy: 0,
        wob: this.rng() * TAU, skill: 0.4 + (bh % 100) / 200, react: 0, target: null,
      });
    }
    this.round = 0; this.elim = [];
    this.pops = []; this.tt = 0; this.shake = 0;
    this.phase = 'show'; this.phaseT = 0;
    this.newRound();
  }
  matches(t) {
    const s = this.spec;
    if (s.keys.includes('col') && t.col !== s.col) return false;
    if (s.keys.includes('shape') && t.shape !== s.shape) return false;
    if (s.keys.includes('num') && t.num !== s.num) return false;
    return true;
  }
  targetLabel() {
    const s = this.spec, parts = [];
    if (s.keys.includes('col')) parts.push(TCOLS[s.col][1]);
    if (s.keys.includes('shape')) parts.push(SHAPE_GLYPH[s.shape] + (s.keys.length === 1 ? ' ' + SHAPE_NAME[s.shape] : ''));
    if (s.keys.includes('num')) parts.push((s.keys.length === 1 ? 'NUMBER ' : '') + (s.num + 1));
    return parts.join(' ');
  }
  newRound() {
    this.round++;
    const r = this.round;
    this.showShapes = r >= 6; this.showNums = r >= 10;
    const keys = specFor(r);
    this.spec = {
      keys,
      col: Math.floor(this.rng() * 4),
      shape: Math.floor(this.rng() * 3),
      num: Math.floor(this.rng() * 3),
    };
    const total = COLS * ROWS;
    const safeCount = this.practice ? 6 : Math.max(1, 6 - Math.floor(r / 2));
    const idx = Array.from({ length: total }, (_, i) => i);
    for (let i = total - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    this.tiles = new Array(total);
    idx.forEach((ti, k) => {
      const t = {
        col: Math.floor(this.rng() * 4),
        shape: this.showShapes ? Math.floor(this.rng() * 3) : null,
        num: this.showNums ? Math.floor(this.rng() * 3) : null,
        sink: 0,
      };
      if (k < safeCount) {          // force a full match on the safe tiles
        for (const key of keys) t[key] = this.spec[key];
      } else if (this.matches(t)) { // everything else must fail on at least one target attr
        const key = keys[Math.floor(this.rng() * keys.length)];
        const mod = key === 'col' ? 4 : 3;
        t[key] = (t[key] + 1 + Math.floor(this.rng() * (mod - 1))) % mod;
      }
      this.tiles[ti] = t;
    });
    // fair timing: more attributes to scan = more time; extra grace the first
    // round each new mechanic appears; still tightens a little every round
    const base = [0, 3.4, 4.3, 5.2][keys.length];
    this.showT = Math.max(1.8, base - r * 0.12 + ([6, 8, 10, 11, 12].includes(r) ? 0.7 : 0));
    this.phase = 'show'; this.phaseT = 0;
    this.ctx.audio.sfx.zone();
    const popCol = keys.includes('col') ? TCOLS[this.spec.col][0] : '#ffeccf';
    this.pops.push({ txt: 'GET TO ' + this.targetLabel() + '!', col: popCol, t: 0, dur: 1.4, big: true });
    // bots pick a target safe tile (with reaction lag + occasional blunder);
    // multi-attribute rounds slow everyone's reaction — bots included, to stay fair
    for (const p of this.ps) if (p.bot && p.alive) {
      p.react = 0.3 + (1 - p.skill) * 0.9 + this.rng() * 0.4 + (keys.length - 1) * 0.45;
      const safes = this.tiles.map((t, i) => this.matches(t) ? i : -1).filter(i => i >= 0);
      const blunder = this.rng() > 0.82 + p.skill * 0.15;
      const pool = blunder ? this.tiles.map((_, i) => i) : safes;
      p.target = pool[Math.floor(this.rng() * pool.length)];
    }
  }
  tileCenter(i) { return [(i % COLS + 0.5) / COLS, (Math.floor(i / COLS) + 0.5) / ROWS]; }
  tileAt(x, y) {
    const cx2 = Math.floor(x * COLS), cy2 = Math.floor(y * ROWS);
    if (cx2 < 0 || cx2 >= COLS || cy2 < 0 || cy2 >= ROWS) return -1;
    return cy2 * COLS + cx2;
  }
  pop(txt, col) { this.pops.push({ txt, col: col || '#ffeccf', t: 0, dur: 1, big: false }); }

  update(rdt) {
    this.tt += rdt; this.phaseT += rdt;
    this.shake *= Math.exp(-7 * rdt);
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    // movement (always, in every phase)
    for (const p of this.ps) {
      if (!p.alive) continue;
      p.dashCd -= rdt; p.dashT -= rdt; p.wob += rdt * 9;
      if (p.local && !p.bot) {
        const inp = this.ctx.input(p.slot, rdt);
        p.vx += inp.x * ACC * rdt; p.vy += inp.y * ACC * rdt;
        if (inp.act && p.dashCd <= 0) this.doDash(p);
      } else if (p.bot) {
        p.react -= rdt;
        if (p.react <= 0 && p.target != null) {
          const [tx, ty] = this.tileCenter(p.target);
          const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
          p.vx += dx / d * ACC * 0.9 * rdt; p.vy += dy / d * ACC * 0.9 * rdt;
          // shove anyone contesting the tile near the deadline
          if (this.phase === 'show' && this.showT - this.phaseT < 0.8 && p.dashCd <= 0 && d < 0.12) {
            for (const q of this.ps) if (q !== p && q.alive && Math.hypot(q.x - p.x, q.y - p.y) < 0.11) { this.doDash(p); break; }
          }
        }
      }
      const dr2 = Math.exp(-DRAG * rdt); p.vx *= dr2; p.vy *= dr2;
      const sp = Math.hypot(p.vx, p.vy), lim = VMAX * (p.dashT > 0 ? 2 : 1);
      if (sp > lim) { p.vx *= lim / sp; p.vy *= lim / sp; }
      if (sp > 30) { p.fx = p.vx / sp; p.fy = p.vy / sp; }
      p.x = clamp(p.x + p.vx * rdt / 900, 0.03, 0.97);
      p.y = clamp(p.y + p.vy * rdt / 900, 0.04, 0.96);
    }
    // bumps
    for (let i = 0; i < this.ps.length; i++) for (let j = i + 1; j < this.ps.length; j++) {
      const a = this.ps[i], b = this.ps[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy), min = 0.075;
      if (dd < min && dd > 0.0001) {
        const nx = dx / dd, ny = dy / dd, push = (min - dd) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy, rel = rvx * nx + rvy * ny;
        if (rel < 0) {
          const imp = -rel * 0.95;
          a.vx -= nx * imp / 2; a.vy -= ny * imp / 2; b.vx += nx * imp / 2; b.vy += ny * imp / 2;
          if (-rel > 400) { this.ctx.audio.sfx.thud(0.7); this.shake = Math.max(this.shake, 4); }
        }
      }
    }
    // phase machine
    if (this.phase === 'show') {
      if (this.phaseT >= this.showT) { this.phase = 'sink'; this.phaseT = 0; this.ctx.audio.sfx.boom(); this.shake = 8; }
    } else if (this.phase === 'sink') {
      const f = Math.min(1, this.phaseT / 0.8);
      for (const t of this.tiles) if (!this.matches(t)) t.sink = f;
      if (this.phaseT > 0.55 && !this.judged) {
        this.judged = true;
        for (const p of this.ps) {
          if (!p.alive) continue;
          const ti = this.tileAt(p.x, p.y);
          if (ti < 0 || !this.matches(this.tiles[ti])) {
            if (this.practice) { p.x = 0.5; p.y = 0.5; p.vx = p.vy = 0; this.pop('SPLASH! (practice — back you go)', '#ff8a5c'); }
            else {
              p.alive = false; this.elim.push(p);
              this.ctx.audio.sfx.death();
              this.pop(p.name + ' fell in!', p.color);
            }
          }
        }
      }
      if (this.phaseT > 1.15) {
        this.judged = false;
        for (const t of this.tiles) t.sink = 0;
        const alive = this.ps.filter(p => p.alive);
        if (!this.practice && (alive.length <= 1 || this.round >= MAX_ROUNDS)) this.finish();
        else this.newRound();
      }
    }
    this.ctx.audio.setMusicIntensity(0.45 + Math.min(0.4, this.round * 0.04));
  }
  doDash(p) {
    p.dashCd = p.bot ? DASH_CD * 1.6 : DASH_CD; p.dashT = 0.3;
    p.vx += p.fx * 1100; p.vy += p.fy * 1100;
    this.ctx.audio.sfx.dash();
  }
  finish() {
    if (this.done) return; this.done = true;
    const alive = this.ps.filter(p => p.alive);
    const order = [...alive, ...[...this.elim].reverse()];
    this.ctx.end(order.map((p, i) => ({
      id: p.id, score: p.alive ? order.length : order.length - i,
      label: p.alive ? 'survived ' + this.round + ' rounds' : 'melted',
      name: p.name, color: p.color, isFill: p.isFill,
    })));
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    // lava world
    const lg = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.8);
    lg.addColorStop(0, '#ff7a2f'); lg.addColorStop(0.4, '#c93a12'); lg.addColorStop(1, '#3d0f04');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + this.tt * 0.1 * (i % 2 ? 1 : -1);
      g.globalAlpha = 0.3 + 0.2 * Math.sin(this.tt * 1.5 + i);
      g.fillStyle = '#ffb03a';
      g.beginPath(); g.arc(W / 2 + Math.cos(a) * W * 0.42, H / 2 + Math.sin(a) * H * 0.42, 12 + (i % 3) * 6, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    g.save();
    if (this.shake > 0.3) g.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    // platform bounds
    const pw = Math.min(W * 0.92, H * 0.92 * (COLS / ROWS)), ph = pw * (ROWS / COLS);
    const px0 = (W - pw) / 2, py0 = (H - ph) / 2 + H * 0.02;
    const mx = v => px0 + v * pw, my = v => py0 + v * ph;
    // tiles
    const tw = pw / COLS, th = ph / ROWS;
    const urgent = this.phase === 'show' && this.showT - this.phaseT < 1;
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i], cx2 = px0 + (i % COLS) * tw, cy2 = py0 + Math.floor(i / COLS) * th;
      const sinkF = t.sink;
      const sc = 1 - sinkF * 0.28, dark = sinkF * 0.75;
      const ww = (tw - 5) * sc, hh = (th - 5) * sc;
      const ox2 = cx2 + (tw - ww) / 2, oy2 = cy2 + (th - hh) / 2 + sinkF * 14;
      g.globalAlpha = 1 - sinkF * 0.85;
      g.fillStyle = '#57534e';
      g.fillRect(ox2, oy2 + 5, ww, hh);
      const base = TCOLS[t.col][0];
      g.fillStyle = dark > 0 ? shadeHex(base, 1 - dark) : base;
      g.fillRect(ox2, oy2, ww, hh - 4);
      g.lineWidth = 3; g.strokeStyle = '#14100a'; g.strokeRect(ox2, oy2, ww, hh - 4);
      // shape + number badges (the whole point after round 5)
      if (t.shape != null) {
        const scx = ox2 + ww / 2, scy = oy2 + (hh - 4) / 2, sr = Math.min(ww, hh) * 0.26;
        g.fillStyle = 'rgba(255,255,255,0.92)'; g.strokeStyle = '#14100a'; g.lineWidth = 2.5;
        g.beginPath();
        if (t.shape === 0) g.arc(scx, scy, sr, 0, TAU);
        else if (t.shape === 1) { g.moveTo(scx, scy - sr * 1.1); g.lineTo(scx + sr, scy + sr * 0.75); g.lineTo(scx - sr, scy + sr * 0.75); g.closePath(); }
        else g.rect(scx - sr * 0.88, scy - sr * 0.88, sr * 1.76, sr * 1.76);
        g.fill(); g.stroke();
        if (t.num != null) {
          g.fillStyle = '#14100a'; g.font = '900 ' + Math.round(sr * 1.15) + 'px system-ui';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('' + (t.num + 1), scx, scy + (t.shape === 1 ? sr * 0.22 : 0));
          g.textBaseline = 'alphabetic';
        }
      }
      // cracks warn on doomed tiles as the timer runs out
      if (urgent && !this.matches(t) && Math.floor(this.tt * 6) % 2 === 0) {
        g.strokeStyle = 'rgba(20,16,10,0.65)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ox2 + ww * 0.25, oy2 + hh * 0.2);
        g.lineTo(ox2 + ww * 0.45, oy2 + hh * 0.5); g.lineTo(ox2 + ww * 0.3, oy2 + hh * 0.78); g.stroke();
      }
      g.globalAlpha = 1;
    }
    // players
    const sorted = [...this.ps].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      if (!p.alive) continue;
      const sx = mx(p.x), sy = my(p.y);
      const sp = Math.hypot(p.vx, p.vy) / VMAX;
      if (p.dashT > 0) {
        g.globalAlpha = p.dashT * 2.4;
        g.strokeStyle = p.color; g.lineWidth = 9; g.lineCap = 'round';
        g.beginPath(); g.moveTo(sx - p.fx * 40, sy - p.fy * 40); g.lineTo(sx - p.fx * 10, sy - p.fy * 10); g.stroke();
        g.globalAlpha = 1;
      }
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(sx, sy + PR * 0.7, PR * 0.85, PR * 0.35, 0, 0, TAU); g.fill();
      drawDiverTop(g, {
        x: sx, y: sy, r: PR, color: p.color, t: this.tt + p.wob, cos: p.cos, ward: p.ward, skin: p.skin,
        vx: p.vx, vy: p.vy, speedNorm: sp,
      });
      g.font = '800 12px system-ui'; g.textAlign = 'center';
      g.fillStyle = p.color; g.fillText(p.name, sx, sy - PR - 10);
      if (p.local && !p.bot) {
        g.fillStyle = p.dashCd <= 0 ? '#7dff6a' : 'rgba(147,160,189,0.5)';
        g.beginPath(); g.arc(sx, sy + PR + 9, 4, 0, TAU); g.fill();
      }
    }
    g.restore();
    // HUD: safe color + countdown
    g.textAlign = 'center';
    if (this.phase === 'show') {
      const tl = Math.max(0, this.showT - this.phaseT);
      g.font = '900 30px system-ui';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      const msg = this.targetLabel() + ' · ' + tl.toFixed(1);
      g.strokeText(msg, W / 2, 42);
      g.fillStyle = this.spec.keys.includes('col') ? TCOLS[this.spec.col][0] : '#ffeccf';
      g.fillText(msg, W / 2, 42);
    }
    g.font = '800 14px system-ui'; g.fillStyle = '#ffeccf'; g.textAlign = 'left';
    g.fillText(this.practice ? 'PRACTICE' : 'ROUND ' + this.round, 12, 24);
    for (const p of this.pops) {
      const f = 1 - p.t / p.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + (p.big ? 32 : 18) + 'px system-ui'; g.textAlign = 'center';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      g.strokeText(p.txt, W / 2, H * 0.24 - p.t * 40);
      g.fillStyle = p.col; g.fillText(p.txt, W / 2, H * 0.24 - p.t * 40);
    }
    g.globalAlpha = 1;
  }
  dispose() { }
}
function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.round(clamp(v * f, 0, 255));
  return 'rgb(' + c(n >> 16 & 255) + ',' + c(n >> 8 & 255) + ',' + c(n & 255) + ')';
}
