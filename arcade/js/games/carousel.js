// MERRY-GO-ROUND — the board's gambling minigame (reachable ONLY from a 🎠
// space). Everyone rides a horse on a carousel that keeps speeding up; arrows
// scroll down into a coloured target band and you tap the matching button
// while one is inside it — past the band is a red run-out, and an arrow that
// reaches the red has already been missed. Nail a
// streak and your diver starts showing off — handstands on the horse. Miss
// and you're thrown into the sawdust. Last rider standing takes the pot.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';
import { drawDiverStand, skinTone } from '../character.js?v=42';

const DIRS = ['left', 'up', 'down', 'right'];
const ARROW = { left: '◀', up: '▲', down: '▼', right: '▶' };
const DIR_COL = { left: '#e08bd0', up: '#7dff6a', down: '#59d9ff', right: '#ffd23f' };
// the note highway lives BELOW the ride: arrows fall from under the carousel
// down to a hit line sitting just above the tap zones
const SPAWN_Y = 0.52;
const MISS_GRACE = 0.055;    // |t| window (in note-travel units) that counts as a hit
const rgba = (hex, a) => 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' +
  parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + a + ')';

export default {
  id: 'carousel', name: 'Merry-Go-Round', icon: '🎠',
  desc: 'Ride the carousel, hit the beats, be the last one on.',
  howto: {
    goal: 'Everyone rides the carousel. Arrows scroll down into the COLORED BAND — that band is the target: tap the matching button while an arrow is inside it. Once an arrow hits the RED it is already gone. The ride keeps speeding up! Miss twice and you fall off. Last rider standing wins the whole pot.',
    touch: 'Tap the ◀ ▲ ▼ ▶ button while its arrow is in the colored band (red = too late)',
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
    // ================= THE CAROUSEL =================
    const cx = W / 2;
    const canopyY = H * 0.178;                 // underside of the canopy rim
    const ringY = H * 0.365, rx = W * 0.35, ry = H * 0.058;
    const platY = ringY + H * 0.05;            // platform sits under the horses

    // --- fairground interior: tent above, sawdust floor below ---
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#160d28'); bg.addColorStop(0.3, '#40204a');
    bg.addColorStop(0.52, '#7d3a4e'); bg.addColorStop(0.62, '#8a5a34'); bg.addColorStop(1, '#4a2f18');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // warm glow pooling around the ride
    const gl = g.createRadialGradient(cx, ringY, 10, cx, ringY, W * 0.85);
    gl.addColorStop(0, 'rgba(255,190,110,0.3)'); gl.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = gl; g.fillRect(0, 0, W, H * 0.66);
    // distant fairground bulbs strung across the tent
    g.strokeStyle = 'rgba(255,220,150,0.18)'; g.lineWidth = 1.5;
    for (const yy of [H * 0.055, H * 0.085]) {
      g.beginPath();
      for (let x = 0; x <= W; x += 12) g[x ? 'lineTo' : 'moveTo'](x, yy + Math.sin(x * 0.02) * 5);
      g.stroke();
      for (let x = 14; x < W; x += 46) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.tt * 3 + x));
        g.fillStyle = 'rgba(255,230,170,' + (tw * 0.5).toFixed(2) + ')';
        g.beginPath(); g.arc(x, yy + Math.sin(x * 0.02) * 5 + 3, 2.4 * S, 0, TAU); g.fill();
      }
    }

    // --- platform (rotating deck) ---
    const pr = rx * 1.16, pry = ry * 1.5;
    g.fillStyle = '#5e3a22';                   // deck edge / skirt
    g.beginPath(); g.ellipse(cx, platY + H * 0.028, pr, pry, 0, 0, TAU); g.fill();
    g.fillStyle = '#8a5a34';
    g.beginPath(); g.ellipse(cx, platY, pr, pry, 0, 0, TAU); g.fill();
    g.save();                                  // radial planks turn with the ride
    g.beginPath(); g.ellipse(cx, platY, pr, pry, 0, 0, TAU); g.clip();
    g.strokeStyle = 'rgba(60,34,16,0.45)'; g.lineWidth = 1.5;
    for (let i = 0; i < 24; i++) {
      const a = this.spin * 0.6 + i / 24 * TAU;
      g.beginPath(); g.moveTo(cx, platY);
      g.lineTo(cx + Math.cos(a) * pr, platY + Math.sin(a) * pry); g.stroke();
    }
    g.restore();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(cx, platY, pr, pry, 0, 0, TAU); g.stroke();
    // rim lights around the deck
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * TAU, lx = cx + Math.cos(a) * pr, ly = platY + Math.sin(a) * pry;
      const tw = 0.55 + 0.45 * Math.sin(this.tt * 5 + i);
      g.fillStyle = 'rgba(255,236,160,' + tw.toFixed(2) + ')';
      g.beginPath(); g.arc(lx, ly, 2.6 * S, 0, TAU); g.fill();
    }

    // --- riders sorted back-to-front ---
    const riders = this.ps.map((p, i) => {
      const a = this.spin + (i / this.ps.length) * TAU;
      return { p, a, x: cx + Math.cos(a) * rx, y: ringY + Math.sin(a) * ry, depth: Math.sin(a) };
    }).sort((a, b) => a.depth - b.depth);
    const drawRider = (r) => {
      const p = r.p;
      const sc = S * (1.85 + r.depth * 0.5);           // near riders are bigger
      const bobY = Math.sin(this.spin * 2.4 + p.seat * 1.7) * 10 * S;
      const y = r.y + bobY;
      const faceRight = Math.cos(r.a) >= 0 ? 1 : -1;   // horses face the way they travel
      const dim = 0.55 + 0.45 * ((r.depth + 1) / 2);   // far side sits in shadow
      // twisted brass pole, canopy → deck
      const poleTop = canopyY + H * 0.01;
      const poleBot = platY + Math.sin(r.a) * pry * 0.6;
      const pg = g.createLinearGradient(r.x - 3 * sc, 0, r.x + 3 * sc, 0);
      pg.addColorStop(0, '#8a6a1e'); pg.addColorStop(0.4, '#ffe9a0');
      pg.addColorStop(0.6, '#ffd23f'); pg.addColorStop(1, '#8a6a1e');
      g.strokeStyle = pg; g.lineWidth = 3.4 * sc;
      g.beginPath(); g.moveTo(r.x, poleTop); g.lineTo(r.x, poleBot); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1 * sc;   // helical glint
      g.beginPath();
      for (let k = 0; k <= 16; k++) {
        const f = k / 16, yy = lerp(poleTop, poleBot, f);
        const xx = r.x + Math.sin(f * 22 + this.spin * 2) * 1.6 * sc;
        g[k ? 'lineTo' : 'moveTo'](xx, yy);
      }
      g.stroke();
      g.globalAlpha = dim;
      this.drawHorse(g, r.x, y, sc, p.color, faceRight, p.seat);
      g.globalAlpha = 1;
      if (p.alive) {
        drawDiverStand(g, {
          x: r.x - 1 * sc, y: y - 30 * sc, scale: sc * 0.5,
          color: p.color, skin: p.skin, ward: p.ward, cos: p.cos,
          t: this.tt + p.seat, mood: p.streak >= 4 ? 'cheer' : 'idle',
          trick: p.trick,
        });
        if (p.trick) {
          g.fillStyle = '#ffd23f'; g.font = '900 ' + Math.round(11 * sc) + 'px system-ui';
          g.textAlign = 'center';
          g.fillText(['', '🤸', '🙌', '🌟'][p.trick] || '🤸', r.x + 24 * sc, y - 40 * sc);
        }
      } else {
        g.globalAlpha = 0.45;
        drawDiverStand(g, {
          x: r.x, y: y + 26 * sc, scale: sc * 0.4,
          color: p.color, skin: p.skin, ward: p.ward, cos: p.cos,
          t: this.tt, mood: 'sad', tear: true,
        });
        g.globalAlpha = 1;
      }
      g.font = '800 ' + Math.round(9.5 * sc) + 'px system-ui'; g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = 'rgba(10,8,4,0.75)';
      const nm = p.name + (p.alive ? '' : ' 💥');
      g.strokeText(nm, r.x, y + 40 * sc);
      g.fillStyle = p.alive ? p.color : '#6b7488';
      g.fillText(nm, r.x, y + 40 * sc);
      if (p.alive && p.streak > 2) {
        g.font = '900 ' + Math.round(9.5 * sc) + 'px system-ui';
        g.strokeText('x' + p.streak, r.x, y + 52 * sc);
        g.fillStyle = '#ffd23f'; g.fillText('x' + p.streak, r.x, y + 52 * sc);
      }
    };
    for (const r of riders) if (r.depth < 0) drawRider(r);     // far side first

    // --- mirrored center column ---
    const colW = W * 0.052;
    const cg = g.createLinearGradient(cx - colW, 0, cx + colW, 0);
    cg.addColorStop(0, '#6b4a2b'); cg.addColorStop(0.35, '#f2ece2');
    cg.addColorStop(0.6, '#d9c9a8'); cg.addColorStop(1, '#6b4a2b');
    g.fillStyle = cg;
    g.fillRect(cx - colW, canopyY, colW * 2, platY - canopyY);
    g.strokeStyle = '#ffd23f'; g.lineWidth = 2.5;
    g.strokeRect(cx - colW, canopyY, colW * 2, platY - canopyY);
    for (let i = 0; i < 3; i++) {   // mirror panels
      const py2 = canopyY + (platY - canopyY) * (0.12 + i * 0.3);
      g.fillStyle = 'rgba(180,220,255,0.35)';
      g.fillRect(cx - colW * 0.6, py2, colW * 1.2, (platY - canopyY) * 0.2);
      g.strokeStyle = '#ffd23f'; g.lineWidth = 1.5;
      g.strokeRect(cx - colW * 0.6, py2, colW * 1.2, (platY - canopyY) * 0.2);
    }
    for (const r of riders) if (r.depth >= 0) drawRider(r);    // near side over the column

    // --- canopy (drawn last: it caps the whole ride) ---
    const canR = W * 0.48, domeH = H * 0.105, canTop = canopyY - domeH;
    g.save();
    g.beginPath(); g.ellipse(cx, canopyY, canR, domeH, 0, Math.PI, TAU); g.closePath(); g.clip();
    const SEG = 14;
    for (let i = 0; i < SEG; i++) {            // candy stripes fanning from the crown
      g.fillStyle = i % 2 ? '#d63a3a' : '#f7f0e4';
      const x0 = cx - canR + (2 * canR) * (i / SEG), x1 = cx - canR + (2 * canR) * ((i + 1) / SEG);
      g.beginPath();
      g.moveTo(cx, canTop - domeH * 0.35);     // apex above the dome → true fan
      g.lineTo(x0, canopyY + 2); g.lineTo(x1, canopyY + 2);
      g.closePath(); g.fill();
    }
    // dome shading so the canopy reads round, not flat
    const dsh = g.createLinearGradient(0, canTop, 0, canopyY);
    dsh.addColorStop(0, 'rgba(255,255,255,0.25)'); dsh.addColorStop(0.5, 'rgba(0,0,0,0)');
    dsh.addColorStop(1, 'rgba(60,20,30,0.4)');
    g.fillStyle = dsh; g.fillRect(cx - canR, canTop, canR * 2, domeH + 4);
    g.restore();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 2.5;   // dome edge
    g.beginPath(); g.ellipse(cx, canopyY, canR, domeH, 0, Math.PI, TAU); g.stroke();
    // scalloped valance hanging from the rim
    g.fillStyle = '#c02f2f';
    const scal = 12;
    g.beginPath(); g.moveTo(cx - canR, canopyY);
    for (let i = 0; i < scal; i++) {
      const x0 = cx - canR + (2 * canR) * (i / scal), x1 = cx - canR + (2 * canR) * ((i + 1) / scal);
      g.quadraticCurveTo((x0 + x1) / 2, canopyY + H * 0.028, x1, canopyY);
    }
    g.lineTo(cx + canR, canopyY - H * 0.012); g.lineTo(cx - canR, canopyY - H * 0.012);
    g.closePath(); g.fill();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - canR, canopyY); g.lineTo(cx + canR, canopyY); g.stroke();
    // bulbs along the rim
    for (let i = 0; i <= 18; i++) {
      const lx = cx - canR + (2 * canR) * (i / 18);
      const tw = 0.5 + 0.5 * Math.sin(this.tt * 6 + i * 0.7);
      g.fillStyle = 'rgba(255,240,180,' + (0.35 + tw * 0.45).toFixed(2) + ')';
      g.beginPath(); g.arc(lx, canopyY + 2 * S, 4.5 * S, 0, TAU); g.fill();
      g.fillStyle = '#fff8dc';
      g.beginPath(); g.arc(lx, canopyY + 2 * S, 2.2 * S, 0, TAU); g.fill();
    }
    // crown finial + pennant
    g.fillStyle = '#ffd23f'; g.strokeStyle = '#14100a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, canTop - 16 * S);
    g.lineTo(cx + 10 * S, canTop + 2); g.lineTo(cx - 10 * S, canTop + 2);
    g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(cx, canTop - 20 * S, 5 * S, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, canTop - 24 * S); g.lineTo(cx, canTop - 40 * S); g.stroke();
    g.fillStyle = '#e04040';
    g.beginPath(); g.moveTo(cx, canTop - 40 * S);
    g.lineTo(cx + 16 * S + Math.sin(this.tt * 3) * 3 * S, canTop - 35 * S);
    g.lineTo(cx, canTop - 30 * S); g.closePath(); g.fill();
    g.restore();
    // ---- note highway (below the ride, above the buttons) ----
    // The geometry is worked BACKWARDS from the buttons so that the entire
    // scoring window is visible above them: arrow lands in the coloured band =
    // hit, arrow reaches the red = already gone. Nothing is ever judged once
    // it's over a button, so the buttons never read as targets.
    const zoneH = H * 0.115, zoneY = H - zoneH - (this.ctx.dim.safeBottom || 0);
    const zw = W / 4;
    const WIN = MISS_GRACE * 3;          // the exact ± window judge() uses
    const LATE_H = Math.max(22, H * 0.032);  // red run-out beneath the band
    const top = H * SPAWN_Y;
    const bandBot = zoneY - LATE_H;      // t = 1 + WIN lands exactly here
    const lineY = (bandBot + top * WIN) / (1 + WIN);   // t = 1
    const bandTop = top + (1 - WIN) * (lineY - top);   // t = 1 - WIN
    const yAt = t => lerp(top, lineY, t);
    // darkened track so the arrows pop against the fairground
    const trk = g.createLinearGradient(0, top - 20, 0, bandTop);
    trk.addColorStop(0, 'rgba(8,6,16,0)'); trk.addColorStop(0.18, 'rgba(8,6,16,0.72)');
    trk.addColorStop(1, 'rgba(8,6,16,0.82)');
    g.fillStyle = trk; g.fillRect(0, top - 20, W, bandTop - (top - 20));
    // lane guides
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * zw, top); g.lineTo(i * zw, bandTop); g.stroke(); }
    // how close each lane is to its moment — the band lights up as an arrow enters
    const hot = { left: 0, up: 0, down: 0, right: 0 };
    for (const n of this.notes) {
      if (n.dead) continue;
      const k = 1 - Math.min(1, Math.abs(1 - n.t) / WIN);
      if (k > hot[n.dir]) hot[n.dir] = k;
    }
    // ---- THE TARGET BAND: tap while the arrow is in this colour ----
    DIRS.forEach((d, i) => {
      const x = i * zw + 3, w = zw - 6, h2 = bandBot - bandTop, k = hot[d];
      const bg = g.createLinearGradient(0, bandTop, 0, bandBot);
      bg.addColorStop(0, rgba(DIR_COL[d], 0.10 + k * 0.18));
      bg.addColorStop(0.5, rgba(DIR_COL[d], 0.34 + k * 0.42));
      bg.addColorStop(1, rgba(DIR_COL[d], 0.10 + k * 0.18));
      g.fillStyle = bg; g.fillRect(x, bandTop, w, h2);
      g.strokeStyle = rgba(DIR_COL[d], 0.55 + k * 0.45); g.lineWidth = k > 0.2 ? 3 : 1.5;
      g.strokeRect(x + 0.5, bandTop + 0.5, w - 1, h2 - 1);
    });
    // ---- THE RED: past this and it's already a miss ----
    const late = g.createLinearGradient(0, bandBot, 0, zoneY);
    late.addColorStop(0, 'rgba(255,52,52,0.55)'); late.addColorStop(1, 'rgba(255,52,52,0.10)');
    g.fillStyle = late; g.fillRect(0, bandBot, W, zoneY - bandBot);
    g.strokeStyle = '#ff4d4d'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, bandBot); g.lineTo(W, bandBot); g.stroke();
    // white line marks the top of the window — arrows are live the moment they cross it
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, bandTop); g.lineTo(W, bandTop); g.stroke();
    g.setLineDash([5, 6]); g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, lineY); g.lineTo(W, lineY); g.stroke();
    g.setLineDash([]);
    g.font = '800 11px system-ui'; g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText('TAP IN THE COLOR', 8, bandTop - 7);
    g.fillStyle = 'rgba(255,140,140,0.95)'; g.textAlign = 'right';
    g.fillText('TOO LATE', W - 8, Math.min(zoneY - 5, bandBot + 14));
    // notes fall from under the ride → through the band → into the red
    for (const n of this.notes) {
      if (n.dead && !n.missed) continue;
      const y = yAt(clamp(n.t, 0, 1 + WIN * 1.55));
      const x = zw * (DIRS.indexOf(n.dir) + 0.5);
      const near = 1 - Math.min(1, Math.abs(1 - n.t) / WIN);
      g.globalAlpha = n.dead ? 0.25 : 1;
      g.fillStyle = n.missed ? '#8a3030' : DIR_COL[n.dir];
      g.beginPath(); g.arc(x, y, 22 * S + near * 5 * S, 0, TAU); g.fill();
      g.strokeStyle = n.missed ? '#ff4d4d' : '#14100a'; g.lineWidth = 3; g.stroke();
      g.fillStyle = n.missed ? '#ffdcdc' : '#14100a'; g.font = '900 ' + Math.round(26 * S) + 'px system-ui';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ARROW[n.dir], x, y + 1);
      g.textBaseline = 'alphabetic'; g.globalAlpha = 1;
    }
    // ---- tap zones: buttons you press, NOT places the arrows are heading ----
    DIRS.forEach((d, i) => {
      const x = i * zw, fx = this.zoneFx[d];
      g.fillStyle = fx > 0 ? 'rgba(255,236,160,' + (0.15 + fx * 0.5).toFixed(2) + ')' : 'rgba(16,22,36,0.85)';
      g.fillRect(x + 3, zoneY, zw - 6, zoneH);
      g.strokeStyle = fx > 0 ? DIR_COL[d] : 'rgba(255,255,255,0.22)';
      g.lineWidth = fx > 0 ? 4 : 1.5;
      g.strokeRect(x + 3, zoneY, zw - 6, zoneH);
      g.fillStyle = fx > 0 ? DIR_COL[d] : rgba(DIR_COL[d], 0.62);
      g.font = '900 ' + Math.round(30 * S) + 'px system-ui';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ARROW[d], x + zw / 2, zoneY + zoneH * 0.44);
      g.font = '800 9px system-ui'; g.fillStyle = 'rgba(255,255,255,0.42)';
      g.fillText('TAP', x + zw / 2, zoneY + zoneH * 0.82);
      g.textBaseline = 'alphabetic';
    });
    this._zoneRect = { y: zoneY, h: zoneH, zw };
    // ---- HUD ----
    if (this.flash > 0) {
      g.globalAlpha = this.flash * 0.4; g.fillStyle = '#ffd23f';
      g.fillRect(0, lineY - 30, W, 60); g.globalAlpha = 1;
    }
    // status tucked into the dark corners either side of the dome — never over the ride
    const ridersLeft = this.alive().length;
    const hudY = (this.ctx.dim.safeTop || 0) + 26;
    g.lineWidth = 4; g.strokeStyle = 'rgba(10,8,4,0.9)';
    g.font = '900 14px system-ui'; g.textAlign = 'left';
    const left = this.practice ? 'PRACTICE' : ridersLeft + ' ON';
    g.strokeText(left, 10, hudY); g.fillStyle = '#ffd23f'; g.fillText(left, 10, hudY);
    g.font = '800 12px system-ui';
    const spd = this.speed().toFixed(1) + 'x';
    g.strokeText(spd, 10, hudY + 16); g.fillStyle = '#ffeccf'; g.fillText(spd, 10, hudY + 16);
    if (this.me) {
      g.textAlign = 'right';
      g.font = '900 14px system-ui';
      const hearts = this.me.alive ? '♥'.repeat(Math.max(0, 2 - this.me.misses)) : 'OFF';
      g.strokeText(hearts, W - 10, hudY); g.fillStyle = this.me.alive ? '#ff8a8a' : '#6b7488';
      g.fillText(hearts, W - 10, hudY);
      g.font = '800 12px system-ui';
      const hs = this.me.hits + ' hits';
      g.strokeText(hs, W - 10, hudY + 16); g.fillStyle = '#ffeccf'; g.fillText(hs, W - 10, hudY + 16);
    }
    // the big call-out only when it matters
    if (ridersLeft <= 1 && !this.practice) {
      g.textAlign = 'center'; g.font = '900 ' + Math.round(20 * Math.min(1.4, S * 1.2)) + 'px system-ui';
      g.strokeText('🎠 LAST ONE RIDING!', W / 2, H * SPAWN_Y - 14);
      g.fillStyle = '#ffd23f'; g.fillText('🎠 LAST ONE RIDING!', W / 2, H * SPAWN_Y - 14);
    }
    g.textAlign = 'center';
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
  /* A proper carousel horse: arched neck, carved mane, prancing legs, ornate
     saddle and bridle. Drawn facing +x, mirrored by `dir` for the far side. */
  drawHorse(g, x, y, sc, col, dir, seat) {
    const gal = Math.sin(this.spin * 2.6 + seat * 1.4);   // prance cycle
    g.save(); g.translate(x, y); g.scale(sc * (dir || 1), sc);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const OUT = '#2b2018';
    // ---------- tail (behind everything) ----------
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(-18, -6);
    g.quadraticCurveTo(-33, -12, -34, 2);
    g.quadraticCurveTo(-35, 14, -26, 20);
    g.quadraticCurveTo(-27, 8, -20, 2);
    g.closePath(); g.fill();
    g.strokeStyle = OUT; g.lineWidth = 1.6; g.stroke();
    // ---------- far legs (darker, behind the body) ----------
    const legFar = '#cfc3ae';
    g.strokeStyle = legFar; g.lineWidth = 4.2;
    // far foreleg: tucked up
    g.beginPath(); g.moveTo(9, 3);
    g.quadraticCurveTo(17 + gal * 2, 8, 13 + gal * 3, 15); g.stroke();
    // far hind leg: extended back
    g.beginPath(); g.moveTo(-11, 3);
    g.quadraticCurveTo(-19 - gal * 2, 10, -22 - gal * 3, 19); g.stroke();
    // ---------- body ----------
    const bodyG = g.createLinearGradient(0, -12, 0, 12);
    bodyG.addColorStop(0, '#ffffff'); bodyG.addColorStop(0.55, '#f4ece0'); bodyG.addColorStop(1, '#d9cdb8');
    g.fillStyle = bodyG; g.strokeStyle = OUT; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-17, -4);                                   // croup
    g.quadraticCurveTo(-16, -11, -6, -12);               // back
    g.quadraticCurveTo(4, -13, 10, -9);                  // withers
    g.quadraticCurveTo(17, -6, 16, 1);                   // chest
    g.quadraticCurveTo(15, 9, 6, 10);                    // belly front
    g.quadraticCurveTo(-6, 12, -14, 8);                  // belly back
    g.quadraticCurveTo(-19, 4, -17, -4);
    g.closePath(); g.fill(); g.stroke();
    // ---------- neck + head ----------
    g.fillStyle = bodyG; g.strokeStyle = OUT; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(8, -9);
    g.quadraticCurveTo(15, -20, 20, -27);                // arched crest
    g.quadraticCurveTo(24, -32, 29, -30);                // poll
    g.quadraticCurveTo(33, -28, 32, -23);                // forehead → muzzle
    g.quadraticCurveTo(31, -19, 26, -19);                // nose
    g.quadraticCurveTo(22, -19, 20, -15);                // jaw
    g.quadraticCurveTo(17, -8, 15, -6);                  // throat
    g.closePath(); g.fill(); g.stroke();
    // ears
    g.beginPath(); g.moveTo(27, -30); g.lineTo(28.5, -35); g.lineTo(30.5, -29.5);
    g.closePath(); g.fill(); g.stroke();
    // nostril + mouth
    g.fillStyle = '#8a7566';
    g.beginPath(); g.ellipse(28.5, -21, 1.1, 0.8, 0.3, 0, TAU); g.fill();
    g.strokeStyle = '#8a7566'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(26.5, -19.6); g.lineTo(30, -20.2); g.stroke();
    // eye (with highlight)
    g.fillStyle = '#14100a';
    g.beginPath(); g.ellipse(26.5, -26.5, 1.7, 1.9, 0, 0, TAU); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(27, -27.2, 0.6, 0, TAU); g.fill();
    // ---------- carved mane in the rider's colour ----------
    g.fillStyle = col; g.strokeStyle = OUT; g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(9, -10);
    g.quadraticCurveTo(15, -22, 21, -29);                // follows the crest
    g.quadraticCurveTo(25, -33, 27, -31);
    g.quadraticCurveTo(23, -28, 20, -22);                // scalloped locks
    g.quadraticCurveTo(23, -23, 25, -21);
    g.quadraticCurveTo(19, -19, 17, -14);
    g.quadraticCurveTo(20, -15, 21, -13);
    g.quadraticCurveTo(14, -11, 11, -7);
    g.closePath(); g.fill(); g.stroke();
    // forelock
    g.beginPath(); g.moveTo(29, -30); g.quadraticCurveTo(33, -28, 32, -24);
    g.quadraticCurveTo(30, -27, 28, -28); g.closePath(); g.fill();
    // ---------- bridle ----------
    g.strokeStyle = '#c0392b'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(23, -27.5); g.quadraticCurveTo(26, -24, 24.5, -20); g.stroke();
    g.beginPath(); g.moveTo(21, -22); g.lineTo(29, -23.5); g.stroke();
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.arc(24.5, -23, 1.3, 0, TAU); g.fill();
    // reins back to the saddle
    g.strokeStyle = '#8a4a2b'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(23.5, -21.5); g.quadraticCurveTo(16, -16, 6, -12); g.stroke();
    // ---------- saddle + blanket ----------
    g.fillStyle = '#2f6fb0'; g.strokeStyle = OUT; g.lineWidth = 1.6;
    g.beginPath();                                        // blanket
    g.moveTo(-12, -8); g.lineTo(4, -11); g.lineTo(6, -2); g.lineTo(-11, 1);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffd23f';                              // blanket trim
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.arc(-10 + i * 4.6, 0.2 + i * -0.7, 1, 0, TAU); g.fill();
    }
    g.fillStyle = '#8a4a2b'; g.strokeStyle = OUT; g.lineWidth = 1.8;
    g.beginPath();                                        // saddle seat
    g.moveTo(-8, -10);
    g.quadraticCurveTo(-3, -14, 3, -12);                  // cantle → pommel
    g.quadraticCurveTo(6, -11, 5, -8);
    g.quadraticCurveTo(-2, -6, -8, -7);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffd23f';                              // pommel knob
    g.beginPath(); g.arc(3.5, -12.5, 1.6, 0, TAU); g.fill(); g.stroke();
    // stirrup
    g.strokeStyle = '#8a4a2b'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-2, -7); g.lineTo(-1, 2); g.stroke();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(-1, 3.4, 2, 0, Math.PI); g.stroke();
    // ---------- near legs ----------
    g.strokeStyle = '#f4ece0'; g.lineWidth = 5;
    // near foreleg: high tuck (the classic prancer)
    g.beginPath(); g.moveTo(11, 4);
    g.quadraticCurveTo(20 + gal * 2, 6, 18 + gal * 3, 13);
    g.stroke();
    g.strokeStyle = '#2b2018'; g.lineWidth = 1.2;         // hoof
    g.beginPath(); g.moveTo(16 + gal * 3, 13); g.lineTo(20 + gal * 3, 14.5); g.stroke();
    // near hind leg: driving back
    g.strokeStyle = '#f4ece0'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(-13, 4);
    g.quadraticCurveTo(-22 - gal * 2, 8, -25 - gal * 3, 17);
    g.stroke();
    g.strokeStyle = '#2b2018'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-27 - gal * 3, 17); g.lineTo(-23 - gal * 3, 18.5); g.stroke();
    // ---------- painted rosettes ----------
    g.fillStyle = col;
    g.beginPath(); g.arc(-13, -1, 2.4, 0, TAU); g.fill();
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.arc(-13, -1, 1.1, 0, TAU); g.fill();
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
