// STACK ATTACK — shared-tower crane stacking. Take turns dropping increasingly
// stupid furniture; sloppy placement makes the tower lean; whoever topples it is out.
// Solo: 3 misses, chase height. Turn-based → trivially fair online & hot-seat.
import { TAU, clamp, lerp, mulberry32 } from '../util.js';

const PIECES = [
  { n: 'THE CRATE', w: 96, h: 54, c: '#b8834a' },
  { n: 'THE FRIDGE', w: 74, h: 108, c: '#bfd4dc' },
  { n: 'THE COUCH', w: 128, h: 56, c: '#c0563e' },
  { n: 'THE TV', w: 88, h: 66, c: '#3a3f4a' },
  { n: 'THE CAKE', w: 82, h: 60, c: '#f2b8d0' },
  { n: 'THE TIRE', w: 76, h: 76, c: '#454545' },
  { n: 'THE PIANO', w: 118, h: 84, c: '#6b4a86' },
  { n: 'THE DUCK', w: 64, h: 58, c: '#ffd23f' },
];

export default {
  id: 'stack', name: 'Stack Attack', icon: '📦',
  desc: 'Take turns stacking junk. Topple the tower, you\'re out.',
  create(ctx) { return new StackGame(ctx); }
};

class StackGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = mulberry32(ctx.seed);
    this.players = ctx.players.map(p => ({ ...p, alive: true, out: 0, misses: 0, height: 0 }));
    this.solo = this.players.length === 1;
    this.stack = [];             // {x,y,w,h,c,rot,n}
    this.falling = null;         // piece in flight
    this.debris = [];            // tumbling pieces
    this.turn = 0;               // index into players
    this.pieceNo = 0;
    this.camY = 0; this.shake = 0; this.t = 0;
    this.state = 'swing';        // swing | fall | settle | collapse | done
    this.stateT = 0;
    this.lean = 0;               // accumulated tower lean (-1..1)
    this.pops = [];
    this.elimOrder = [];
    this.craneT = this.rng() * TAU;
    this.newPiece();
    this.banner(this.curP().name + "'S TURN", this.curP().color, 1.4);
    this.remoteDrop = null;
    if (ctx.net) ctx.net.onMsg = (t, p, from) => { if (t === 'g' && p.k === 'drop') this.remoteDrop = p.x; };
  }
  curP() { return this.players[this.turn]; }
  banner(txt, col, dur) { this.pops.push({ txt, col: col || '#ffd23f', t: 0, dur: dur || 1, big: true }); }
  pop(txt, x, y, col) { this.pops.push({ txt, x, y, col: col || '#ffeccf', t: 0, dur: 0.9 }); }
  newPiece() {
    const def = PIECES[Math.floor(this.rng() * PIECES.length)];
    const grow = 1 + Math.min(0.5, this.pieceNo * 0.012);
    this.piece = { ...def, w: def.w, h: def.h };
    this.craneSpeed = (1.3 + this.pieceNo * 0.09) * grow;
    this.craneRange = 0.34;
  }
  towerTop() { return this.stack.length ? this.stack[this.stack.length - 1] : null; }

  update(dt) {
    const { dim } = this.ctx;
    this.t += dt; this.stateT += dt;
    this.shake *= Math.exp(-7 * dt);
    for (let i = this.pops.length; i--;) { this.pops[i].t += dt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    const W = dim.W, H = dim.H, groundY = H * 0.88;
    const top = this.towerTop();
    const targetCam = top ? Math.max(0, (groundY - top.y) - H * 0.45) : 0;
    this.camY = lerp(this.camY, targetCam, Math.min(1, dt * 3));
    // debris tumble
    for (let i = this.debris.length; i--;) {
      const d = this.debris[i];
      d.vy += 1400 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
      if (d.y - this.camY > H + 200) this.debris.splice(i, 1);
    }
    if (this.state === 'swing') {
      this.craneT += dt * this.craneSpeed;
      const p = this.curP();
      const isHost = !this.ctx.net || this.ctx.net.isHost;
      let dropX = null, mine = false;
      if (p.local && !p.bot) {
        const inp = this.ctx.input(p.slot, dt);
        if (inp.act) { dropX = this.craneX(W); mine = true; }
      } else if (p.bot && isHost) {
        // bots run on the host only (frame-rate-dependent RNG would diverge otherwise)
        const err = 30 + this.pieceNo * 4.5;
        const tx = (top ? top.x : W / 2) + (this.rng() - 0.5) * err;
        if (Math.abs(this.craneX(W) - tx) < 14 + this.rng() * 22 && this.stateT > 0.6) { dropX = this.craneX(W); mine = true; }
      } else if (this.remoteDrop != null) { dropX = this.remoteDrop; this.remoteDrop = null; }
      if (dropX != null) {
        if (mine && this.ctx.net) this.ctx.net.send('g', { k: 'drop', x: dropX });
        this.falling = { x: dropX, y: this.camY - 60, w: this.piece.w, h: this.piece.h, c: this.piece.c, n: this.piece.n, vy: 0, rot: 0 };
        this.state = 'fall'; this.stateT = 0;
        this.ctx.audio.sfx.drop();
      }
    } else if (this.state === 'fall') {
      const f = this.falling;
      f.vy += 2000 * dt; f.y += f.vy * dt;
      const landY = top ? top.y - top.h / 2 - f.h / 2 : groundY - f.h / 2;
      if (f.y >= landY) { f.y = landY; this.land(); }
    } else if (this.state === 'settle') {
      if (this.stateT > 0.55) this.nextTurn();
    } else if (this.state === 'collapse') {
      if (this.stateT > 1.6) this.afterCollapse();
    } else if (this.state === 'done' && this.stateT > 2) this.finish();
    this.ctx.audio.setMusicIntensity(0.35 + Math.min(0.4, this.stack.length * 0.02) + Math.abs(this.lean) * 0.3);
  }
  craneX(W) { return W / 2 + Math.sin(this.craneT) * W * this.craneRange; }

  land() {
    const f = this.falling, top = this.towerTop();
    const baseX = top ? top.x : f.x, baseW = top ? top.w : f.w + 1;
    const off = f.x - baseX;
    const overlap = 1 - Math.abs(off) / ((baseW + f.w) / 2);
    this.pieceNo++;
    if (overlap < 0.3 && top) {                     // clean miss — piece tumbles off
      this.debris.push({ ...f, vx: Math.sign(off) * 260, vy: -140, vr: Math.sign(off) * 5, rot: 0 });
      this.falling = null;
      this.ctx.audio.sfx.wall();
      this.pop('MISS!', f.x, f.y - 60, '#ff5f5f');
      this.miss();
      return;
    }
    f.rot = clamp(off * 0.004, -0.13, 0.13);
    this.stack.push(f); this.falling = null;
    this.curP().height = this.stack.length;
    // lean accumulates with off-center drops, decays slightly with perfect ones
    const wob = off / 85;
    this.lean = clamp(this.lean + wob, -1.6, 1.6);
    if (Math.abs(off) < 7) { this.lean *= 0.55; this.pop('PERFECT!', f.x, f.y - 60, '#7dff6a'); this.ctx.audio.sfx.coin(6); }
    else { this.ctx.audio.sfx.thud(Math.min(1, Math.abs(off) / 60 + 0.4)); this.pop(f.n, f.x, f.y - 60); }
    this.shake = Math.min(10, 3 + Math.abs(off) * 0.06);
    if (Math.abs(this.lean) > 1 && this.stack.length > 3) this.collapse();
    else { this.state = 'settle'; this.stateT = 0; }
  }
  miss() {
    const p = this.curP();
    p.misses++;
    if (this.solo) {
      if (p.misses >= 3) { this.state = 'done'; this.stateT = 0; this.banner('OUT OF PIECES!', '#ff5f5f', 1.6); }
      else { this.state = 'settle'; this.stateT = 0; }
    } else this.eliminate(p, 'dropped it!');
  }
  collapse() {
    this.ctx.audio.sfx.crash(); this.shake = 18;
    const keep = Math.min(2, this.stack.length);
    while (this.stack.length > keep) {
      const s = this.stack.pop();
      this.debris.push({ ...s, vx: (this.rng() - 0.5) * 500, vy: -200 - this.rng() * 250, vr: (this.rng() - 0.5) * 9 });
    }
    this.lean = 0;
    this.state = 'collapse'; this.stateT = 0;
    this.banner('💥 TIMBER!', '#ff5f5f', 1.4);
  }
  afterCollapse() {
    const p = this.curP();
    if (this.solo) { this.state = 'done'; this.stateT = 0; }
    else this.eliminate(p, 'toppled the tower!');
  }
  eliminate(p, why) {
    p.alive = false; this.elimOrder.push(p);
    this.banner(p.name + ' ' + why, p.color, 1.6);
    this.ctx.audio.sfx.death();
    const alive = this.players.filter(q => q.alive);
    if (alive.length <= 1) { this.state = 'done'; this.stateT = 0; if (alive[0]) this.banner('🏆 ' + alive[0].name + ' WINS!', alive[0].color, 2); }
    else this.nextTurn();
  }
  nextTurn() {
    if (this.pieceNo >= 42) {
      this.state = 'done'; this.stateT = 0; this.finishByHeight = true;
      this.banner('CEILING! EVERYBODY WINS-ISH', '#ffd23f', 1.6);
      return;
    }
    do { this.turn = (this.turn + 1) % this.players.length; } while (!this.players[this.turn].alive);
    this.newPiece(); this.state = 'swing'; this.stateT = 0;
    if (!this.solo) this.banner(this.curP().name + "'S TURN", this.curP().color, 1);
  }
  finish() {
    let res;
    if (this.solo) res = [{ id: this.players[0].id, score: this.stack.length, label: this.stack.length + ' high' }];
    else {
      const alive = this.players.filter(p => p.alive);
      const order = [...alive, ...[...this.elimOrder].reverse()];
      // survivors tie at the top; the eliminated rank by how long they lasted
      res = order.map((p, i) => ({
        id: p.id, score: p.alive ? order.length : order.length - i,
        label: p.alive ? 'survivor' : 'toppled'
      }));
    }
    this.ctx.end(res);
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#1a2438'); grd.addColorStop(1, '#0b0f1a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.save();
    if (this.shake > 0.3) g.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    g.translate(0, -(-this.camY));   // camY shifts world down as tower grows
    g.translate(0, this.camY);
    const groundY = H * 0.88;
    // ground
    g.fillStyle = '#2c3a52'; g.fillRect(-50, groundY, W + 100, H);
    g.fillStyle = '#3d5070'; g.fillRect(-50, groundY, W + 100, 8);
    // tower (with lean displayed as growing horizontal skew near top)
    for (let i = 0; i < this.stack.length; i++) {
      const s = this.stack[i];
      const sway = Math.sin(this.t * 2.2) * this.lean * i * 1.1;
      this.drawPiece(g, s.x + sway, s.y, s);
    }
    for (const d of this.debris) this.drawPiece(g, d.x, d.y, d);
    // crane + dangling piece
    if (this.state === 'swing') {
      const cx = this.craneX(W), cy = this.camY - 40 + Math.max(0, H * 0.12);
      g.strokeStyle = '#93a0bd'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, this.camY - 80); g.lineTo(cx, cy); g.stroke();
      this.drawPiece(g, cx, cy + this.piece.h / 2, { ...this.piece, rot: Math.sin(this.craneT * 2) * 0.05 });
      // drop guide
      g.strokeStyle = 'rgba(255,210,63,0.25)'; g.setLineDash([6, 8]);
      g.beginPath(); g.moveTo(cx, cy + this.piece.h); g.lineTo(cx, groundY); g.stroke(); g.setLineDash([]);
    }
    if (this.falling) this.drawPiece(g, this.falling.x, this.falling.y, this.falling);
    g.restore();
    // HUD: height + lean meter
    g.fillStyle = '#ffeccf'; g.font = '800 17px system-ui'; g.textAlign = 'left';
    g.fillText('HEIGHT ' + this.stack.length, 14, 30);
    if (this.solo) g.fillText('MISSES ' + this.players[0].misses + '/3', 14, 52);
    const lw = Math.min(220, W * 0.4);
    g.fillStyle = 'rgba(20,26,40,0.7)'; g.fillRect(W / 2 - lw / 2, 16, lw, 10);
    g.fillStyle = Math.abs(this.lean) > 0.7 ? '#ff5f5f' : '#ffd23f';
    g.fillRect(W / 2, 16, clamp(this.lean, -1, 1) * lw / 2, 10);
    g.strokeStyle = '#ffeccf'; g.lineWidth = 1.5; g.strokeRect(W / 2 - lw / 2, 16, lw, 10);
    // banners / pops
    g.textAlign = 'center';
    for (const p of this.pops) {
      const f = 1 - p.t / p.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + (p.big ? 30 : 17) + 'px system-ui';
      const x = p.x != null ? p.x : W / 2, y = (p.y != null ? p.y + this.camY : H * 0.3) - p.t * 40;
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)'; g.strokeText(p.txt, x, y);
      g.fillStyle = p.col; g.fillText(p.txt, x, y);
    }
    g.globalAlpha = 1;
  }
  drawPiece(g, x, y, s) {
    g.save(); g.translate(x, y); g.rotate(s.rot || 0);
    g.fillStyle = s.c; g.strokeStyle = '#14100a'; g.lineWidth = 3;
    const w = s.w, h = s.h, r = 10;
    g.beginPath();
    g.moveTo(-w / 2 + r, -h / 2); g.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
    g.arcTo(w / 2, h / 2, -w / 2, h / 2, r); g.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
    g.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r); g.closePath();
    g.fill(); g.stroke();
    // little face — everything in this game is alive and mildly upset
    g.fillStyle = '#14100a';
    g.beginPath(); g.arc(-w * 0.16, -h * 0.1, 2.6, 0, TAU); g.fill();
    g.beginPath(); g.arc(w * 0.16, -h * 0.1, 2.6, 0, TAU); g.fill();
    g.beginPath(); g.arc(0, h * 0.12, 4, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.restore();
  }
  dispose() { }
}
