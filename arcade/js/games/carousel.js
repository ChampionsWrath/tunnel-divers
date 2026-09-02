// MERRY-GO-ROUND — the board's gambling minigame (reachable ONLY from a 🎠
// space). Everyone rides a horse on a carousel that keeps speeding up; arrows
// scroll into the hit line and you tap the matching zone to stay on. Nail a
// streak and your diver starts showing off — handstands on the horse. Miss
// and you're thrown into the sawdust. Last rider standing takes the pot.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';
import { drawDiverStand, skinTone } from '../character.js?v=35';

const DIRS = ['left', 'up', 'down', 'right'];
const ARROW = { left: '◀', up: '▲', down: '▼', right: '▶' };
const DIR_COL = { left: '#e08bd0', up: '#7dff6a', down: '#59d9ff', right: '#ffd23f' };
// the note highway lives BELOW the ride: arrows fall from under the carousel
// down to a hit line sitting just above the tap zones
const SPAWN_Y = 0.52;
const MISS_GRACE = 0.055;    // |t| window (in note-travel units) that counts as a hit

export default {
  id: 'carousel', name: 'Merry-Go-Round', icon: '🎠',
  desc: 'Ride the carousel, hit the beats, be the last one on.',
  howto: {
    goal: 'Everyone rides the carousel. Arrows scroll up into the glowing line — TAP the matching zone right as they land. The ride keeps speeding up! Miss twice and you fall off. Last rider standing wins the whole pot.',
    touch: 'Tap the ◀ ▲ ▼ ▶ zone at the bottom that matches the arrow',
    keys: 'Arrow keys / WASD',
    tip: 'Chain hits for a STREAK — your diver starts doing tricks, and a trick run makes the next miss forgivable.',
  },
  create(ctx) { return new CarouselGame(ctx); }
};

const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

class CarouselGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.practice = !!ctx.practice;
    this.online = !!ctx.net && !this.practice;
    this.host = !this.online || ctx.net.isHost;
    this.rng = mulberry32(ctx.seed);
    const src = this.practice ? ctx.players.map(p => (p.local ? p : { ...p, bot: true })) : ctx.players;
    this.ps = src.map((p, i) => {
      const bh = hashSeed(p.id);
      return {
        id: p.id, name: p.name, color: p.color, skin: p.skin, ward: p.ward, cos: p.cosmetics,
        local: p.local, slot: p.slot, bot: !!p.bot, isFill: !!p.isFill,
        alive: true, hits: 0, streak: 0, best: 0, misses: 0, trick: 0, trickT: 0,
        fell: 0, wob: this.rng() * TAU,
        skill: 0.62 + (bh % 100) / 340,      // bots: 0.62 .. 0.91 hit rate
        seat: i,
      };
    });
    this.me = this.ps.find(p => p.local && !p.bot) || null;
    this.notes = [];          // {dir, t (0 at spawn → 1 at hit line), id}
    this.noteId = 0;
    this.spawnAcc = 0;
    this.spin = 0;            // carousel rotation
    this.tt = 0; this.runT = 0;
    this.pops = []; this.shake = 0; this.flash = 0;
    this.zoneFx = { left: 0, up: 0, down: 0, right: 0 };
    this.state = 'run'; this.stateT = 0;
    this.ended = false;
    if (ctx.onNet) ctx.onNet((t, p) => this.onNet(t, p));
    this.netAcc = 0;
    this._pd = e => this.onPointer(e.clientX, e.clientY);
    ctx.cv.addEventListener('pointerdown', this._pd);
    this.pop('🎠 HOLD ON!', '#ffd23f', 30);
  }
  pop(txt, col, size) { this.pops.push({ txt, col: col || '#ffeccf', t: 0, dur: 1.1, size: size || 20 }); }
  // difficulty: the ride accelerates the whole time
  speed() { return this.practice ? 0.62 : 0.62 + Math.min(1.5, this.runT * 0.035); }
  spawnGap() { return this.practice ? 0.85 : Math.max(0.26, 0.85 - this.runT * 0.016); }
  alive() { return this.ps.filter(p => p.alive); }

  onNet(t, p) {
    if (t !== 'g') return;
    if (p.k === 'st') {                      // a rider's live state
      const q = this.ps.find(z => z.id === p.id);
      if (q && !(q.local && !q.bot)) { q.hits = p.h; q.streak = p.s; q.trick = p.tr; }
    } else if (p.k === 'fall') {
      const q = this.ps.find(z => z.id === p.id);
      if (q && q.alive) this.knockOff(q, false);
    } else if (p.k === 'res') {
      if (this.ended) return;
      this.ended = true; this.state = 'done';
      this.ctx.end(p.rows);
    }
  }
  knockOff(p, broadcast) {
    if (!p.alive) return;
    p.alive = false; p.fell = this.runT; p.streak = 0; p.trick = 0;
    this.ctx.audio.sfx.crash();
    this.shake = 9;
    this.pop(p.name + ' hit the sawdust!', p.color, 22);
    if (broadcast && this.online) this.ctx.net.send('g', { k: 'fall', id: p.id });
  }
  judge(p, dir) {
    // find the closest note to the hit line
    let best = null, bestD = 9;
    for (const n of this.notes) {
      if (n.dead) continue;
      const d = Math.abs(1 - n.t);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best && bestD < MISS_GRACE * 3 && best.dir === dir) {
      best.dead = true;
      p.hits++; p.streak++; p.best = Math.max(p.best, p.streak);
      this.zoneFx[dir] = 1;
      if (p === this.me) { this.flash = 0.35; this.ctx.audio.sfx.coin(Math.min(12, p.streak)); }
      // a hot streak starts the showing-off
      if (p.streak >= 4) { p.trick = 1 + Math.floor((p.streak - 4) / 4) % 3; p.trickT = 1.2; }
      return true;
    }
    // wrong zone / nothing there
    this.miss(p, true);
    return false;
  }
  miss(p, broadcastFall) {
    if (!p.alive) return;
    if (p.trick > 0 && p.streak >= 6) {     // a trick run buys one save
      p.streak = 0; p.trick = 0;
      if (p === this.me) this.ctx.audio.sfx.wall();
      this.pop(p.name + ' wobbles!', p.color, 18);
      return;
    }
    p.streak = 0; p.trick = 0; p.misses++;
    if (p === this.me) this.ctx.audio.sfx.wall();
    if (p.misses >= 2) this.knockOff(p, broadcastFall && (p.local && !p.bot || (p.bot && this.host)));
  }

  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
    this.shake *= Math.exp(-6 * rdt);
    this.flash = Math.max(0, this.flash - rdt * 3);
    for (const k in this.zoneFx) this.zoneFx[k] = Math.max(0, this.zoneFx[k] - rdt * 3);
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    for (const p of this.ps) { p.wob += rdt * 6; p.trickT -= rdt; if (p.trickT <= 0) p.trick = 0; }
    if (this.state === 'done') return;
    this.runT += rdt;
    this.spin += rdt * this.speed() * 1.6;

    // spawn notes (host-authoritative online so everyone reads the same chart)
    this.spawnAcc += rdt;
    if (this.spawnAcc >= this.spawnGap()) {
      this.spawnAcc = 0;
      const dir = DIRS[Math.floor(this.rng() * 4)];
      this.notes.push({ dir, t: 0, id: ++this.noteId });
      if (this.runT > 22 && this.rng() < 0.25) {   // late-game doubles
        const d2 = DIRS[Math.floor(this.rng() * 4)];
        if (d2 !== dir) this.notes.push({ dir: d2, t: -0.16, id: ++this.noteId });
      }
    }
    // advance notes; anything that sails past the line is a miss for whoever
    // hasn't hit it (your own rider + host-run bots)
    const sp = this.speed();
    for (let i = this.notes.length; i--;) {
      const n = this.notes[i];
      n.t += rdt * sp * 0.62;
      if (!n.dead && n.t > 1 + MISS_GRACE * 3) {
        n.dead = true; n.missed = true;
        if (this.me && this.me.alive) this.miss(this.me, true);
      }
      if (n.t > 1.5) this.notes.splice(i, 1);
    }
    // my input
    if (this.me && this.me.alive) {
      const inp = this.ctx.input(this.me.slot, rdt);
      const taps = this.readTaps(inp);
      for (const d of taps) this.judge(this.me, d);
    }
    // bots ride on their own skill (host authority online)
    if (!this.online || this.host) {
      for (const p of this.ps) {
        if (!p.bot || !p.alive) continue;
        p.botAcc = (p.botAcc || 0) + rdt;
        const beat = this.spawnGap();
        if (p.botAcc >= beat) {
          p.botAcc = 0;
          // skill degrades as the ride speeds up — everyone falls eventually
          const chance = clamp(p.skill - Math.max(0, this.runT - 10) * 0.017, 0.12, 0.97);
          if (this.rng() < chance) {
            p.hits++; p.streak++; p.best = Math.max(p.best, p.streak);
            if (p.streak >= 4) { p.trick = 1 + Math.floor((p.streak - 4) / 4) % 3; p.trickT = 1.2; }
          } else this.miss(p, true);
        }
      }
    }
    // stream my rider + host bots
    if (this.online) {
      this.netAcc += rdt;
      if (this.netAcc > 0.25) {
        this.netAcc = 0;
        if (this.me) this.ctx.net.send('g', { k: 'st', id: this.me.id, h: this.me.hits, s: this.me.streak, tr: this.me.trick });
        if (this.host) for (const p of this.ps) if (p.bot)
          this.ctx.net.send('g', { k: 'st', id: p.id, h: p.hits, s: p.streak, tr: p.trick });
      }
    }
    this.ctx.audio.setMusicIntensity(0.5 + Math.min(0.5, this.runT * 0.012));

    if (this.practice) return;               // practice never ends on its own
    const alive = this.alive();
    if (alive.length <= 1 || this.runT > 95) this.finish();
  }
  readTaps(inp) {
    // touch zones come through as canvas taps; keys arrive via the shared stick
    const out = [];
    if (this._pendTaps && this._pendTaps.length) { out.push(...this._pendTaps); this._pendTaps.length = 0; }
    // directional input edge-detection from the shared stick
    const th = 0.55;
    const dir = Math.abs(inp.x) > Math.abs(inp.y)
      ? (inp.x > th ? 'right' : inp.x < -th ? 'left' : null)
      : (inp.y > th ? 'down' : inp.y < -th ? 'up' : null);
    if (dir && dir !== this._lastDir) out.push(dir);
    if (!dir || dir !== this._lastDir) this._lastDir = dir;
    return out;
  }
  tapZone(dir) { (this._pendTaps = this._pendTaps || []).push(dir); }

  finish() {
    if (this.done) return; this.done = true;
    const alive = this.alive();
    const order = [...alive.sort((a, b) => b.hits - a.hits),
    ...[...this.ps].filter(p => !p.alive).sort((a, b) => b.fell - a.fell)];
    const rows = order.map((p, i) => ({
      id: p.id, score: order.length - i,
      label: p.alive ? '🎠 still riding — ' + p.hits + ' hits' : 'fell at ' + p.fell.toFixed(0) + 's',
      name: p.name, color: p.color, isFill: p.isFill,
      carouselWin: i === 0,
    }));
    if (this.online && !this.host) { this._rowsLocal = rows; this._resWait = 0; return; }
    if (this.ended) return; this.ended = true; this.state = 'done';
    if (this.online) this.ctx.net.send('g', { k: 'res', rows });
    this.ctx.end(rows);
  }

  /* ---------------- render ---------------- */
  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    const S = Math.min(W, H) / 700;
    g.save();
    if (this.shake > 0.3) g.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake * 0.6);
    // ---- tent interior ----
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a1a3e'); bg.addColorStop(0.55, '#5a2f52'); bg.addColorStop(1, '#c2703f');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // striped canopy
    const cx = W / 2, topY = H * 0.045;
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? '#e04040' : '#f2ece2';
      g.beginPath(); g.moveTo(cx, topY - H * 0.05);
      g.arc(cx, topY + H * 0.12, W * 0.72, Math.PI + i * (Math.PI / 14), Math.PI + (i + 1) * (Math.PI / 14));
      g.closePath(); g.fill();
    }
    g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, topY + H * 0.12, W * 0.72, Math.PI, TAU); g.stroke();
    // center pole
    g.fillStyle = '#c9a06a'; g.fillRect(cx - W * 0.02, topY + H * 0.08, W * 0.04, H * 0.3);
    // ---- the ride: riders on horses around an ellipse ----
    const ringY = H * 0.34, rx = W * 0.36, ry = H * 0.075;
    g.strokeStyle = 'rgba(255,210,110,0.35)'; g.lineWidth = 6;
    g.beginPath(); g.ellipse(cx, ringY, rx, ry, 0, 0, TAU); g.stroke();
    const riders = this.ps.map((p, i) => {
      const a = this.spin + (i / this.ps.length) * TAU;
      return { p, a, x: cx + Math.cos(a) * rx, y: ringY + Math.sin(a) * ry, depth: Math.sin(a) };
    }).sort((a, b) => a.depth - b.depth);
    for (const r of riders) {
      const p = r.p;
      const sc = S * (1.5 + r.depth * 0.35);
      const bobY = Math.sin(this.spin * 3 + r.p.seat * 1.7) * 8 * S;   // horses rise and fall
      const y = r.y + bobY;
      // brass pole
      g.strokeStyle = '#ffd23f'; g.lineWidth = 3 * sc / S * 0.6;
      g.beginPath(); g.moveTo(r.x, y - 62 * sc); g.lineTo(r.x, y + 26 * sc); g.stroke();
      // horse
      this.drawHorse(g, r.x, y, sc, p.color);
      if (p.alive) {
        drawDiverStand(g, {
          x: r.x, y: y - 34 * sc, scale: sc * 0.52,
          color: p.color, skin: p.skin, ward: p.ward, cos: p.cos,
          t: this.tt + p.seat, mood: p.streak >= 4 ? 'cheer' : 'idle',
          trick: p.trick,
        });
        // trick flourish
        if (p.trick) {
          g.fillStyle = '#ffd23f'; g.font = '900 ' + Math.round(11 * sc) + 'px system-ui';
          g.textAlign = 'center';
          g.fillText(['', '🤸', '🙌', '🌟'][p.trick] || '🤸', r.x + 22 * sc, y - 44 * sc);
        }
      } else {
        // fallen: a sad heap beside the ride
        g.globalAlpha = 0.5;
        drawDiverStand(g, {
          x: r.x, y: y + 18 * sc, scale: sc * 0.42,
          color: p.color, skin: p.skin, ward: p.ward, cos: p.cos,
          t: this.tt, mood: 'sad', tear: true,
        });
        g.globalAlpha = 1;
      }
      g.font = '800 ' + Math.round(9 * sc) + 'px system-ui'; g.textAlign = 'center';
      g.fillStyle = p.alive ? p.color : '#6b7488';
      g.fillText(p.name + (p.alive ? '' : ' 💥'), r.x, y + 38 * sc);
      if (p.alive && p.streak > 2) {
        g.fillStyle = '#ffd23f'; g.font = '900 ' + Math.round(9 * sc) + 'px system-ui';
        g.fillText('x' + p.streak, r.x, y + 50 * sc);
      }
    }
    g.restore();
    // ---- note highway (below the ride, above the buttons) ----
    const zoneH = H * 0.115, zoneY = H - zoneH - (this.ctx.dim.safeBottom || 0);
    const lineY = zoneY - 26;
    const zw = W / 4;
    // lane guides
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * zw, H * SPAWN_Y); g.lineTo(i * zw, lineY); g.stroke(); }
    // hit line
    g.globalAlpha = 0.9;
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, lineY); g.lineTo(W, lineY); g.stroke();
    g.globalAlpha = 1;
    g.font = '800 11px system-ui'; g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('TAP WHEN IT CROSSES', 8, lineY - 8);
    // notes fall from under the ride → down to the line
    for (const n of this.notes) {
      if (n.dead && !n.missed) continue;
      const y = lerp(H * SPAWN_Y, lineY, clamp(n.t, 0, 1.4));
      const x = zw * (DIRS.indexOf(n.dir) + 0.5);
      const near = 1 - Math.min(1, Math.abs(1 - n.t) * 5);
      g.globalAlpha = n.dead ? 0.25 : 1;
      g.fillStyle = DIR_COL[n.dir];
      g.beginPath(); g.arc(x, y, 22 * S + near * 5 * S, 0, TAU); g.fill();
      g.strokeStyle = '#14100a'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#14100a'; g.font = '900 ' + Math.round(26 * S) + 'px system-ui';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ARROW[n.dir], x, y + 1);
      g.textBaseline = 'alphabetic'; g.globalAlpha = 1;
    }
    // ---- tap zones ----
    DIRS.forEach((d, i) => {
      const x = i * zw, fx = this.zoneFx[d];
      g.fillStyle = fx > 0 ? 'rgba(255,236,160,' + (0.15 + fx * 0.5).toFixed(2) + ')' : 'rgba(16,22,36,0.72)';
      g.fillRect(x + 3, zoneY, zw - 6, zoneH);
      g.strokeStyle = DIR_COL[d]; g.lineWidth = fx > 0 ? 4 : 2.5;
      g.strokeRect(x + 3, zoneY, zw - 6, zoneH);
      g.fillStyle = DIR_COL[d]; g.font = '900 ' + Math.round(30 * S) + 'px system-ui';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ARROW[d], x + zw / 2, zoneY + zoneH / 2);
      g.textBaseline = 'alphabetic';
    });
    this._zoneRect = { y: zoneY, h: zoneH, zw };
    // ---- HUD ----
    if (this.flash > 0) {
      g.globalAlpha = this.flash * 0.4; g.fillStyle = '#ffd23f';
      g.fillRect(0, lineY - 30, W, 60); g.globalAlpha = 1;
    }
    g.textAlign = 'center';
    g.font = '900 ' + Math.round(21 * Math.min(1.4, S * 1.2)) + 'px system-ui';
    g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
    const ridersLeft = this.alive().length;
    const msg = this.practice ? 'PRACTICE — feel the beat!'
      : ridersLeft <= 1 ? '🎠 LAST ONE RIDING!' : ridersLeft + ' STILL ON · SPEED ' + this.speed().toFixed(1) + 'x';
    const top = (this.ctx.dim.safeTop || 0) + 30;
    g.strokeText(msg, W / 2, top); g.fillStyle = '#ffd23f'; g.fillText(msg, W / 2, top);
    if (this.me) {
      g.font = '800 13px system-ui';
      const s2 = 'YOU: ' + this.me.hits + ' hits' + (this.me.alive ? ' · ' + (2 - this.me.misses) + ' lives' : ' · OFF');
      g.strokeText(s2, W / 2, top + 22); g.fillStyle = this.me.alive ? '#ffeccf' : '#ff8a8a';
      g.fillText(s2, W / 2, top + 22);
    }
    for (const q of this.pops) {
      const f = 1 - q.t / q.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + q.size + 'px system-ui';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      g.strokeText(q.txt, W / 2, H * 0.42 - q.t * 30);
      g.fillStyle = q.col; g.fillText(q.txt, W / 2, H * 0.42 - q.t * 30);
    }
    g.globalAlpha = 1;
    // waiting on the host's placements
    if (this._rowsLocal) {
      this._resWait += 1 / 60;
      if (this._resWait > 4 && !this.ended) {
        this.ended = true; this.state = 'done';
        const r = this._rowsLocal; this._rowsLocal = null; this.ctx.end(r);
      }
    }
  }
  drawHorse(g, x, y, sc, col) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    g.strokeStyle = '#14100a'; g.lineWidth = 2;
    g.fillStyle = '#f2ece2';
    // body
    g.beginPath(); g.ellipse(0, 0, 20, 11, 0, 0, TAU); g.fill(); g.stroke();
    // neck + head
    g.beginPath();
    g.moveTo(11, -5); g.quadraticCurveTo(21, -14, 19, -22);
    g.lineTo(26, -23); g.quadraticCurveTo(28, -14, 22, -6);
    g.closePath(); g.fill(); g.stroke();
    // mane + tail in the rider's color
    g.fillStyle = col;
    g.beginPath(); g.moveTo(14, -12); g.quadraticCurveTo(10, -20, 16, -24);
    g.quadraticCurveTo(20, -18, 20, -10); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-19, -3); g.quadraticCurveTo(-30, -2, -27, 9);
    g.quadraticCurveTo(-22, 3, -17, 5); g.closePath(); g.fill();
    // legs (galloping)
    g.strokeStyle = '#dfd6c6'; g.lineWidth = 3.4; g.lineCap = 'round';
    const gal = Math.sin(this.spin * 4 + x) * 4;
    g.beginPath(); g.moveTo(-10, 8); g.lineTo(-13 - gal, 20); g.stroke();
    g.beginPath(); g.moveTo(-6, 9); g.lineTo(-3 + gal, 21); g.stroke();
    g.beginPath(); g.moveTo(9, 8); g.lineTo(12 + gal, 20); g.stroke();
    g.beginPath(); g.moveTo(13, 7); g.lineTo(16 - gal, 19); g.stroke();
    // saddle
    g.fillStyle = '#8a4a2b'; g.strokeStyle = '#14100a'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(-2, -8, 8, 4, 0, 0, TAU); g.fill(); g.stroke();
    // eye
    g.fillStyle = '#14100a';
    g.beginPath(); g.arc(22, -18, 1.4, 0, TAU); g.fill();
    g.restore();
  }
  // canvas taps land in the bottom zones
  onPointer(x, y) {
    const z = this._zoneRect;
    if (!z || y < z.y) return false;
    const i = clamp(Math.floor(x / z.zw), 0, 3);
    this.tapZone(DIRS[i]);
    return true;
  }
  dispose() { this.ctx.cv.removeEventListener('pointerdown', this._pd); }
}
