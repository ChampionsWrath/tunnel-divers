// GRID N' GREED — push-your-luck treasure vault. 5×5 hidden tiles, one MONSTER.
// Flip tiles to grow your pot; BANK to keep it, or flip the monster and lose it
// all. Revealed tiles STAY revealed (memory!) — until the monster reshuffles
// the vault. Everyone plays the same grid, 3 turns each. Richest wins.
import { TAU, clamp, mulberry32 } from '../util.js';

const COLS = 5, ROWS = 5, TURNS = 3;
const DECK = [1000, 250, 250, 100, 100, 100, 100, 50, 50, 50, 50, 50, 50, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25]; // + 1 monster

export default {
  id: 'greed', name: "Grid N' Greed", icon: '💰',
  desc: 'Flip for treasure. Bank it — or the monster eats your pot.',
  howto: {
    goal: 'A vault of 25 hidden tiles — one hides the MONSTER. On your turn, flip tiles to build a pot, then BANK to keep it… or keep flipping. Hit the monster and your pot is GONE (and the vault reshuffles). ' + TURNS + ' turns each — richest player wins.',
    touch: 'TAP tiles to keep flipping · TAP the BANK button when you want to stop',
    keys: 'CLICK tiles to keep flipping · SPACE or the BANK button to stop',
    tip: 'Flip as many as you dare — nothing banks until YOU say so. Revealed tiles stay revealed, so remember what\'s left: fewer hidden tiles = better odds the monster is next.',
  },
  create(ctx) { return new GreedGame(ctx); }
};

const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

class GreedGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.practice = !!ctx.practice;
    this.online = !!ctx.net && !this.practice;
    // hot-seat & bots share ONE vault; online plays your own vault vs synced totals
    const src = this.practice ? ctx.players.filter(p => p.local && !p.bot).slice(0, 1)
      : this.online ? ctx.players.filter(p => p.local && !p.bot)
        : ctx.players;
    this.players = src.map(p => {
      const bh = hashSeed(p.id);
      return { ...p, banked: 0, greed: 0.35 + (bh % 100) / 160 };   // bot risk appetite
    });
    this.remotes = this.online ? ctx.players.filter(p => !p.local && !p.bot) : [];
    this.remoteLive = {};
    this.botSide = this.online ? ctx.players.filter(p => p.bot) : [];
    if (ctx.onNet) ctx.onNet((t, p) => { if (t === 'g' && p.k === 'sc') this.remoteLive[p.id] = p; });
    this.rng = mulberry32(ctx.seed);
    this.turn = 0; this.round = 1; this.pot = 0;
    this.phase = 'play'; this.phaseT = 0;      // play | flip | boom | done
    this.botT = 1.2;
    this.pops = []; this.tt = 0;
    this.clicks = [];
    this.wantBank = false;
    this._pd = e => { this.clicks.push([e.clientX, e.clientY]); };
    ctx.cv.addEventListener('pointerdown', this._pd);
    // SPACE banks for keyboard players (the canvas tap can't — it's the flip)
    this._kd = e => { if (e.code === 'Space') { e.preventDefault(); this.wantBank = true; } };
    window.addEventListener('keydown', this._kd);
    this.shuffle();
    this.banner = this.curP().name + "'S TURN";
    this.bannerT = 1.4;
  }
  curP() { return this.players[this.turn % this.players.length]; }
  shuffle() {
    const cells = [...DECK, 'M'];
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    this.grid = cells.map(v => ({ v, open: false }));
  }
  hiddenCount() { return this.grid.filter(c => !c.open).length; }
  pop(txt, x, y, col, size) { this.pops.push({ txt, x, y, t: 0, dur: 1, col: col || '#ffd23f', size: size || 22 }); }

  layout() {
    const { W, H } = this.ctx.dim;
    const gy = H * 0.22, gh = H * 0.58;
    const cell = Math.min((W - 24) / COLS, gh / ROWS) - 4;
    const gx = (W - (cell + 4) * COLS) / 2 + 2;
    return { gx, gy, cell };
  }
  bankRect() {
    const { W, H } = this.ctx.dim;
    const bw = Math.min(240, W * 0.55), bh = 54;
    return { x: W / 2 - bw / 2, y: H * 0.845, w: bw, h: bh };
  }
  flipTile(i) {
    const c = this.grid[i];
    if (c.open) return;
    c.open = true; c.flash = 1;
    if (c.v === 'M') {
      this.ctx.audio.sfx.crash();
      this.pop('MONSTER! POT LOST!', null, null, '#ff5f5f', 26);
      this.pot = 0;
      this.phase = 'boom'; this.phaseT = 0;
    } else {
      this.pot += c.v;
      this.ctx.audio.sfx.coin(Math.min(12, Math.floor(this.pot / 100)));
      if (c.v >= 250) { this.pop('+' + c.v + '!', null, null, '#ffd23f', 28); this.ctx.audio.sfx.pow(); }
    }
  }
  bank() {
    if (this.pot <= 0) { this.nextTurn(); return; }
    this.curP().banked += this.pot;
    this.ctx.audio.sfx.win();
    this.pop('BANKED ' + this.pot + '!', null, null, '#7dff6a', 26);
    this.pot = 0;
    this.nextTurn();
  }
  nextTurn() {
    this.turn++;
    if (!this.practice && this.turn >= this.players.length * TURNS) { this.phase = 'done'; this.phaseT = 0; return; }
    this.round = Math.floor(this.turn / this.players.length) + 1;
    this.pot = 0; this.phase = 'play'; this.phaseT = 0;
    this.wantBank = false;
    this.botT = 1 + this.rng() * 0.6;
    this.banner = this.curP().name + "'S TURN"; this.bannerT = 1.3;
    if (this.hiddenCount() < 5) this.shuffle();   // nearly-empty vault refills
  }

  update(rdt) {
    this.tt += rdt; this.phaseT += rdt; this.bannerT -= rdt;
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    for (const c of this.grid) if (c.flash > 0) c.flash -= rdt * 2.5;
    this.ctx.audio.setMusicIntensity(0.35 + clamp(this.pot / 800, 0, 0.4));
    if (this.phase === 'boom') {
      this.clicks.length = 0; this.wantBank = false;
      if (this.phaseT > 1.3) { this.shuffle(); this.nextTurn(); }
      return;
    }
    if (this.phase === 'done') {
      if (this.phaseT > 1) {
        if (this.online) {
          let allDone = true;
          for (const r of this.remotes) { const s = this.remoteLive[r.id]; if (!s || !s.done) allDone = false; }
          if (!allDone && this.phaseT < 12) return;
        }
        const res = this.players.map(p => ({ id: p.id, score: p.banked, label: '$' + p.banked, name: p.name, color: p.color }));
        for (const r of this.remotes) {
          const s = this.remoteLive[r.id];
          res.push({ id: r.id, score: s ? s.n : 0, label: '$' + (s ? s.n : 0), name: r.name, color: r.color });
        }
        this.ctx.end(res);
      }
      return;
    }
    const p = this.curP(), { gx, gy, cell } = this.layout(), br = this.bankRect();
    if (p.local && !p.bot) {
      // NOTE: deliberately NOT ctx.input().act here — that flag is set by ANY
      // tap on the canvas, which is the same tap that flips a tile, so it used
      // to bank you out the moment you went for a second tile. Banking is the
      // BANK button or the SPACE key, nothing else.
      if (this.wantBank) {
        this.wantBank = false;
        if (this.pot > 0 && this.bannerT <= 0) { this.bank(); this.clicks.length = 0; return; }
      }
      if (this.clicks.length && this.bannerT <= 0) {
        for (const [px, py] of this.clicks) {
          if (px >= br.x && px <= br.x + br.w && py >= br.y && py <= br.y + br.h) {
            if (this.pot > 0) { this.bank(); break; }
          }
          const cx2 = Math.floor((px - gx) / (cell + 4)), cy2 = Math.floor((py - gy) / (cell + 4));
          if (cx2 >= 0 && cx2 < COLS && cy2 >= 0 && cy2 < ROWS) {
            this.flipTile(cy2 * COLS + cx2);
            if (this.phase !== 'play') break;
          }
        }
        this.clicks.length = 0;
      } else this.clicks.length = 0;
    } else if (p.bot) {
      this.clicks.length = 0; this.wantBank = false;   // a stray SPACE can't carry into your turn
      this.botT -= rdt;
      if (this.botT <= 0 && this.bannerT <= 0) {
        this.botT = 0.75 + this.rng() * 0.7;
        // bank when the pot outweighs the monster odds (personality-scaled)
        const hid = this.hiddenCount();
        const risk = 1 / Math.max(1, hid);
        const wantBank = this.pot > 0 && (this.pot * risk > 14 * p.greed || this.pot >= 320 * p.greed + 120);
        if (wantBank) this.bank();
        else {
          const hidden = this.grid.map((c, i) => c.open ? -1 : i).filter(i => i >= 0);
          this.flipTile(hidden[Math.floor(this.rng() * hidden.length)]);
        }
      }
    }
    if (this.online) {
      this._nAcc = (this._nAcc || 0) + rdt;
      if (this._nAcc > 0.5) {
        this._nAcc = 0;
        const me = this.players.find(q => q.local && !q.bot);
        if (me) this.ctx.net.send('g', { k: 'sc', id: me.id, n: me.banked, done: this.phase === 'done' });
      }
    }
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    // vault: dark stone + gold haze
    const grd = g.createRadialGradient(W / 2, H * 0.4, 30, W / 2, H * 0.4, Math.max(W, H) * 0.75);
    grd.addColorStop(0, '#2e2416'); grd.addColorStop(1, '#120d08');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const { gx, gy, cell } = this.layout();
    const p = this.curP();
    // header: pot + turn
    g.textAlign = 'center';
    g.font = '900 ' + Math.round(Math.min(44, W * 0.09)) + 'px system-ui';
    g.fillStyle = this.pot > 0 ? '#ffd23f' : '#93a0bd';
    g.fillText('POT $' + this.pot, W / 2, H * 0.085);
    g.font = '800 15px system-ui'; g.fillStyle = p.color;
    g.fillText((this.practice ? 'PRACTICE — ' : 'ROUND ' + Math.min(this.round, TURNS) + '/' + TURNS + ' — ') + p.name + "'S TURN", W / 2, H * 0.125);
    // odds hint
    const hid = this.hiddenCount();
    g.font = '700 12.5px system-ui'; g.fillStyle = '#93a0bd';
    g.fillText(hid + ' tiles hidden · monster chance ' + Math.round(100 / Math.max(1, hid)) + '%', W / 2, H * 0.155);
    // banked scores row
    g.font = '700 13px system-ui'; g.textAlign = 'left';
    let yy = 28;
    for (const q of this.players) { g.fillStyle = q.color; g.fillText(q.name + ' $' + q.banked, 12, yy); yy += 17; }
    for (const r of this.remotes) { const s = this.remoteLive[r.id]; g.fillStyle = r.color; g.fillText(r.name + ' $' + (s ? s.n : 0), 12, yy); yy += 17; }
    // grid
    for (let i = 0; i < this.grid.length; i++) {
      const c = this.grid[i];
      const cx2 = gx + (i % COLS) * (cell + 4), cy2 = gy + Math.floor(i / COLS) * (cell + 4);
      const r = cell * 0.14;
      g.beginPath();
      g.moveTo(cx2 + r, cy2); g.arcTo(cx2 + cell, cy2, cx2 + cell, cy2 + cell, r);
      g.arcTo(cx2 + cell, cy2 + cell, cx2, cy2 + cell, r); g.arcTo(cx2, cy2 + cell, cx2, cy2, r);
      g.arcTo(cx2, cy2, cx2 + cell, cy2, r); g.closePath();
      if (!c.open) {
        g.fillStyle = '#57534e'; g.fill();
        g.lineWidth = 3; g.strokeStyle = '#14100a'; g.stroke();
        g.fillStyle = '#3d3935';
        g.font = '900 ' + Math.round(cell * 0.42) + 'px system-ui';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('?', cx2 + cell / 2, cy2 + cell / 2);
      } else if (c.v === 'M') {
        g.fillStyle = c.flash > 0 ? '#ff5f5f' : '#3a1030'; g.fill();
        g.lineWidth = 3; g.strokeStyle = '#14100a'; g.stroke();
        g.font = Math.round(cell * 0.55) + 'px serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('👹', cx2 + cell / 2, cy2 + cell / 2);
      } else {
        g.fillStyle = c.flash > 0 ? '#8a6a10' : '#241d10'; g.fill();
        g.lineWidth = 2; g.strokeStyle = 'rgba(255,210,63,0.35)'; g.stroke();
        g.fillStyle = c.v >= 250 ? '#ffd23f' : c.v >= 100 ? '#e8c95a' : '#a3915c';
        g.font = '900 ' + Math.round(cell * (c.v >= 1000 ? 0.3 : 0.34)) + 'px system-ui';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('$' + c.v, cx2 + cell / 2, cy2 + cell / 2);
      }
      g.textBaseline = 'alphabetic';
    }
    // BANK button
    const br = this.bankRect(), active = this.pot > 0 && p.local && !p.bot && this.phase === 'play';
    g.fillStyle = active ? '#ffd23f' : '#3a3450';
    g.strokeStyle = '#14100a'; g.lineWidth = 4;
    g.beginPath();
    const rr2 = 14;
    g.moveTo(br.x + rr2, br.y); g.arcTo(br.x + br.w, br.y, br.x + br.w, br.y + br.h, rr2);
    g.arcTo(br.x + br.w, br.y + br.h, br.x, br.y + br.h, rr2); g.arcTo(br.x, br.y + br.h, br.x, br.y, rr2);
    g.arcTo(br.x, br.y, br.x + br.w, br.y, rr2); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = active ? '#14100a' : '#93a0bd';
    g.font = '900 22px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(this.pot > 0 ? '💰 BANK $' + this.pot : 'flip a tile…', br.x + br.w / 2, br.y + br.h / 2);
    g.textBaseline = 'alphabetic';
    // banner + pops
    if (this.bannerT > 0) {
      g.globalAlpha = Math.min(1, this.bannerT * 2);
      g.font = '900 30px system-ui'; g.textAlign = 'center';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      g.strokeText(this.banner, W / 2, H * 0.45);
      g.fillStyle = p.color; g.fillText(this.banner, W / 2, H * 0.45);
      g.globalAlpha = 1;
    }
    g.textAlign = 'center';
    for (const q of this.pops) {
      const f = 1 - q.t / q.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + q.size + 'px system-ui';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      g.strokeText(q.txt, W / 2, H * 0.35 - q.t * 40);
      g.fillStyle = q.col; g.fillText(q.txt, W / 2, H * 0.35 - q.t * 40);
    }
    g.globalAlpha = 1;
  }
  dispose() {
    this.ctx.cv.removeEventListener('pointerdown', this._pd);
    window.removeEventListener('keydown', this._kd);
  }
}
