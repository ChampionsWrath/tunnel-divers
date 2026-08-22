// GHOST GRABBERS — a 3×3 haunted house, one room on screen at a time.
// Ghosts are invisible unless your green flashlight is on them; hold the beam
// for 5 seconds to capture. Captured ghosts join you as assistant hunters who
// ping the minimap when they share a room with a ghost. Catch them all!
import { TAU, clamp, lerp, mulberry32 } from '../util.js';
import { drawDiverTop } from '../character.js';

const RW = 100, RH = 66;                 // virtual room size
const T_LIMIT = 90, CAPTURE_T = 5, NGHOSTS = 3;
const ACC = 330, DRAG = 3.2, VMAX = 46, GH_WANDER = 26, GH_FLEE = 40, PRr = 4.2;
const BEAM_LEN = 46, BEAM_HALF = 0.46;
const DOORS = { top: [42, 58], bottom: [42, 58], left: [26, 40], right: [26, 40] };

export default {
  id: 'ghost', name: 'Ghost Grabbers', icon: '👻',
  desc: 'Hunt invisible ghosts room-to-room with your flashlight.',
  howto: {
    goal: 'Ghosts haunt a 3×3 house — invisible until your green beam hits them. Hold the light on a ghost for 5 seconds to capture it; captured ghosts become fellow hunters who ping rooms on your map. Catch all ' + NGHOSTS + ' before time runs out!',
    touch: 'Tilt / drag to move — your beam points where you walk',
    keys: 'WASD / arrows to move — the beam follows your movement',
    tip: 'Listen for giggles (a ghost is in your room) and watch the minimap for assistant pings. Walk into doorways to change rooms.',
  },
  create(ctx) { return new GhostGame(ctx); }
};

class GhostGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.practice = !!ctx.practice;
    this.online = !!ctx.net && !this.practice;
    const locals = ctx.players.filter(p => p.local && !p.bot);
    this.queue = this.practice ? [locals[0]] : [...locals];
    this.remotes = this.online ? ctx.players.filter(p => !p.local && !p.bot) : [];
    this.remoteLive = {};
    this.results = [];
    // local bot players race in parallel (timeline: captures over time)
    this.botRacers = (this.practice ? [] : ctx.players.filter(p => p.bot)).map(b => {
      const bh = hashSeed(b.id), rng = mulberry32((ctx.seed ^ bh) >>> 0);
      const evs = []; let t = 12 + rng() * 14, n = 0;
      while (n < NGHOSTS && t < T_LIMIT) { evs.push({ t }); n++; t += 16 + rng() * 22 - (0.3 + (bh % 100) / 250) * 12; }
      return { p: b, evs, n: 0, i: 0, done: false };
    });
    if (ctx.onNet) ctx.onNet((t, p) => { if (t === 'g' && p.k === 'sc') this.remoteLive[p.id] = p; });
    this.pops = [];
    this.dark = null; this.darkW = 0; this.darkH = 0;
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
    this.runT = 0; this.captured = 0; this.doneBonus = 0;
    this.rx = 1; this.ry = 1;                    // start center room
    this.px = 50; this.py = 33; this.vx = 0; this.vy = 0; this.fx = 0; this.fy = -1;
    this.slide = 0; this.slideDx = 0; this.slideDy = 0;
    this.assistants = [];
    this.giggleT = 2;
    const n = this.practice ? 1 : NGHOSTS;
    this.ghosts = [];
    for (let i = 0; i < n; i++) {
      let gr;
      do { gr = [Math.floor(this.rng() * 3), Math.floor(this.rng() * 3)]; }
      while (gr[0] === 1 && gr[1] === 1);
      this.ghosts.push({
        id: i, room: gr, x: 20 + this.rng() * 60, y: 14 + this.rng() * 38,
        vx: 0, vy: 0, litT: 0, glimpse: 0, captured: false,
        wob: this.rng() * TAU, wpT: 0, wpx: 50, wpy: 33,
      });
    }
    this.state = 'run'; this.stateT = 0;
  }
  pop(txt, col, size) { this.pops.push({ txt, col: col || '#7dff6a', t: 0, dur: 1.1, size: size || 24 }); }

  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
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
          this.results.push({ id: r.id, score: s ? s.n : 0, label: 'ghost score', name: r.name, color: r.color });
        }
        for (const bt of this.botRacers) {
          const sc = bt.n * 100 + (bt.n >= NGHOSTS ? 40 : 0);
          this.results.push({ id: bt.p.id, score: sc, label: bt.n + ' caught', name: bt.p.name, color: bt.p.color });
        }
        this.ctx.end(this.results);
      }
      return;
    }
    // ---- run ----
    this.runT += rdt; this.giggleT -= rdt;
    if (this.slide > 0) { this.slide -= rdt * 3.4; if (this.slide < 0) this.slide = 0; }
    const inp = this.ctx.input(this.runner.slot, rdt);
    this.vx += inp.x * ACC * rdt; this.vy += inp.y * ACC * rdt;
    const dr = Math.exp(-DRAG * rdt); this.vx *= dr; this.vy *= dr;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > VMAX) { this.vx *= VMAX / sp; this.vy *= VMAX / sp; }
    if (sp > 6) { this.fx = this.vx / sp; this.fy = this.vy / sp; }
    this.px += this.vx * rdt; this.py += this.vy * rdt;
    this.tryDoor();
    this.px = clamp(this.px, PRr + 2, RW - PRr - 2);
    this.py = clamp(this.py, PRr + 2, RH - PRr - 2);
    // ghosts simulate in every room
    const beamA = Math.atan2(this.fy, this.fx);
    let inMyRoom = false;
    for (const gh of this.ghosts) {
      if (gh.captured) continue;
      gh.wob += rdt * 5; gh.glimpse -= rdt;
      const sameRoom = gh.room[0] === this.rx && gh.room[1] === this.ry;
      if (sameRoom) inMyRoom = true;
      const lit = sameRoom && this.inBeam(gh.x, gh.y, beamA);
      // AI: flee the light, wander otherwise
      gh.wpT -= rdt;
      if (lit || (sameRoom && Math.hypot(gh.x - this.px, gh.y - this.py) < 22)) {
        const dx = gh.x - this.px, dy = gh.y - this.py, d = Math.hypot(dx, dy) || 1;
        gh.vx = dx / d * GH_FLEE; gh.vy = dy / d * GH_FLEE;
        // bolt for the farthest door sometimes
        if (gh.wpT <= 0) { gh.wpT = 1.2; gh.fleeDoor = this.rng() < 0.5; }
      } else if (gh.wpT <= 0) {
        gh.wpT = 1.6 + this.rng() * 2.2;
        gh.wpx = 12 + this.rng() * (RW - 24); gh.wpy = 10 + this.rng() * (RH - 20);
      } else if (!lit) {
        const dx = gh.wpx - gh.x, dy = gh.wpy - gh.y, d = Math.hypot(dx, dy) || 1;
        gh.vx = lerp(gh.vx, dx / d * GH_WANDER, rdt * 3); gh.vy = lerp(gh.vy, dy / d * GH_WANDER, rdt * 3);
      }
      gh.x += gh.vx * rdt; gh.y += gh.vy * rdt;
      // ghosts slip through doors when they reach one
      this.ghostDoor(gh);
      gh.x = clamp(gh.x, 4, RW - 4); gh.y = clamp(gh.y, 4, RH - 4);
      // capture progress
      if (lit) {
        gh.litT += rdt;
        if (gh.litT >= CAPTURE_T) {
          gh.captured = true; this.captured++;
          this.ctx.audio.sfx.win(); this.pop('CAPTURED! 👻→🔦');
          this.assistants.push({ room: [gh.room[0], gh.room[1]], x: gh.x, y: gh.y, wpT: 0, ping: 0 });
        }
      } else gh.litT = Math.max(0, gh.litT - rdt * 1.5);
    }
    // assistant hunters roam and ping
    for (const as of this.assistants) {
      as.wpT -= rdt; as.ping -= rdt;
      if (as.wpT <= 0) {
        as.wpT = 2.5 + this.rng() * 2;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d =>
          as.room[0] + d[0] >= 0 && as.room[0] + d[0] < 3 && as.room[1] + d[1] >= 0 && as.room[1] + d[1] < 3);
        const d = dirs[Math.floor(this.rng() * dirs.length)];
        as.room = [as.room[0] + d[0], as.room[1] + d[1]];
      }
      for (const gh of this.ghosts)
        if (!gh.captured && gh.room[0] === as.room[0] && gh.room[1] === as.room[1]) as.ping = 0.9;
    }
    // audio hint: giggle when a ghost shares your room
    if (inMyRoom && this.giggleT <= 0) {
      this.giggleT = 2.5 + this.rng() * 2.5;
      this.ctx.audio.sfx.whoosh();
      for (const gh of this.ghosts)
        if (!gh.captured && gh.room[0] === this.rx && gh.room[1] === this.ry) gh.glimpse = 0.35;
    }
    this.ctx.audio.setMusicIntensity(0.3 + (inMyRoom ? 0.25 : 0) + this.captured * 0.08);
    for (const bt of this.botRacers)
      while (bt.i < bt.evs.length && bt.evs[bt.i].t <= this.runT) { bt.n++; bt.i++; }
    if (this.online) {
      this._nAcc = (this._nAcc || 0) + rdt;
      if (this._nAcc > 0.5) { this._nAcc = 0; this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.scoreNow(), done: false }); }
    }
    if (!this.practice && (this.captured >= NGHOSTS || this.runT >= T_LIMIT)) {
      if (this.captured >= NGHOSTS) this.doneBonus = Math.round(Math.max(0, T_LIMIT - this.runT) * 2);
      this.results.push({
        id: this.runner.id, score: this.scoreNow(),
        label: this.captured + '/' + NGHOSTS + ' caught' + (this.doneBonus ? ' +' + this.doneBonus : ''),
        name: this.runner.name, color: this.runner.color,
      });
      if (this.online) this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.scoreNow(), done: true });
      this.nextRunner();
    }
  }
  scoreNow() { return this.captured * 100 + this.doneBonus; }
  inBeam(x, y, beamA) {
    const dx = x - this.px, dy = y - this.py, d = Math.hypot(dx, dy);
    if (d > BEAM_LEN) return false;
    const a = Math.atan2(dy, dx);
    const da = Math.abs(Math.atan2(Math.sin(a - beamA), Math.cos(a - beamA)));
    return da < BEAM_HALF || d < 9;      // the lantern glow catches point-blank ghosts
  }
  tryDoor() {
    const [tx0, tx1] = DOORS.top, [ly0, ly1] = DOORS.left;
    if (this.py <= PRr + 2.2 && this.px > tx0 && this.px < tx1 && this.ry > 0) { this.ry--; this.py = RH - PRr - 4; this.roomSlide(0, -1); }
    else if (this.py >= RH - PRr - 2.2 && this.px > tx0 && this.px < tx1 && this.ry < 2) { this.ry++; this.py = PRr + 4; this.roomSlide(0, 1); }
    else if (this.px <= PRr + 2.2 && this.py > ly0 && this.py < ly1 && this.rx > 0) { this.rx--; this.px = RW - PRr - 4; this.roomSlide(-1, 0); }
    else if (this.px >= RW - PRr - 2.2 && this.py > ly0 && this.py < ly1 && this.rx < 2) { this.rx++; this.px = PRr + 4; this.roomSlide(1, 0); }
  }
  roomSlide(dx, dy) { this.slide = 1; this.slideDx = dx; this.slideDy = dy; this.ctx.audio.sfx.drop(); }
  ghostDoor(gh) {
    const [tx0, tx1] = DOORS.top, [ly0, ly1] = DOORS.left;
    if (gh.y <= 4.5 && gh.x > tx0 && gh.x < tx1 && gh.room[1] > 0) { gh.room[1]--; gh.y = RH - 6; gh.litT = 0; }
    else if (gh.y >= RH - 4.5 && gh.x > tx0 && gh.x < tx1 && gh.room[1] < 2) { gh.room[1]++; gh.y = 6; gh.litT = 0; }
    else if (gh.x <= 4.5 && gh.y > ly0 && gh.y < ly1 && gh.room[0] > 0) { gh.room[0]--; gh.x = RW - 6; gh.litT = 0; }
    else if (gh.x >= RW - 4.5 && gh.y > ly0 && gh.y < ly1 && gh.room[0] < 2) { gh.room[0]++; gh.x = 6; gh.litT = 0; }
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    const S = Math.min(W / RW, H / (RH + 14));
    const ox = (W - S * RW) / 2, oy = (H - S * RH) / 2 + S * 5;
    const mx = v => ox + v * S, my = v => oy + v * S;
    g.fillStyle = '#0a0710'; g.fillRect(0, 0, W, H);
    if (this.state === 'ready' || this.state === 'wait') {
      g.textAlign = 'center';
      if (this.state === 'ready' && this.runner) {
        g.fillStyle = this.runner.color; g.font = '900 34px system-ui';
        g.fillText(this.runner.name, W / 2, H * 0.4);
        g.fillStyle = '#ffeccf'; g.font = '800 20px system-ui';
        g.fillText('GET READY — tap / SPACE', W / 2, H * 0.4 + 40);
        if (this.results.length) {
          g.font = '700 15px system-ui'; g.fillStyle = '#93a0bd';
          g.fillText('so far: ' + this.results.map(r => r.name + ' ' + r.score).join(' · '), W / 2, H * 0.4 + 80);
        }
      } else if (this.state === 'wait') {
        g.fillStyle = '#ffeccf'; g.font = '800 22px system-ui';
        g.fillText(this.online ? 'waiting for the other hunters…' : 'tallying…', W / 2, H * 0.45);
      }
      return;
    }
    // room slide flourish
    g.save();
    if (this.slide > 0) g.translate(this.slideDx * this.slide * 24, this.slideDy * this.slide * 24);
    // ---- the room ----
    const roomSeed = (this.ctx.seed ^ (this.rx * 7 + this.ry * 31)) >>> 0;
    const rr = mulberry32(roomSeed);
    // wallpaper + floor
    g.fillStyle = ['#2a1f33', '#25242e', '#2e2030'][Math.floor(rr() * 3)];
    g.fillRect(mx(0), my(0), RW * S, RH * S);
    g.fillStyle = '#221812';
    g.fillRect(mx(0), my(RH * 0.22), RW * S, RH * 0.78 * S);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(mx(0), my(RH * 0.22 + i * 6.5)); g.lineTo(mx(RW), my(RH * 0.22 + i * 6.5)); g.stroke(); }
    // furniture silhouettes (seeded per room)
    g.fillStyle = '#171019';
    for (let i = 0; i < 3; i++) {
      const fx2 = 12 + rr() * 66, fy2 = 20 + rr() * 34, fw = 8 + rr() * 14, fh = 6 + rr() * 10;
      g.fillRect(mx(fx2), my(fy2), fw * S, fh * S);
    }
    // doors
    const drw = (x0, x1, y, horiz) => {
      g.fillStyle = '#3d2c1e'; g.strokeStyle = '#5a4028'; g.lineWidth = 3;
      if (horiz) { g.fillRect(mx(x0), my(y) - 3 * S, (x1 - x0) * S, 6 * S); g.strokeRect(mx(x0), my(y) - 3 * S, (x1 - x0) * S, 6 * S); }
      else { g.fillRect(mx(y) - 3 * S, my(x0), 6 * S, (x1 - x0) * S); g.strokeRect(mx(y) - 3 * S, my(x0), 6 * S, (x1 - x0) * S); }
    };
    if (this.ry > 0) drw(DOORS.top[0], DOORS.top[1], 0, true);
    if (this.ry < 2) drw(DOORS.bottom[0], DOORS.bottom[1], RH, true);
    if (this.rx > 0) drw(DOORS.left[0], DOORS.left[1], 0, false);
    if (this.rx < 2) drw(DOORS.right[0], DOORS.right[1], RW, false);
    // ghosts in this room (only as lit/glimpsed)
    const beamA = Math.atan2(this.fy, this.fx);
    for (const gh of this.ghosts) {
      if (gh.captured || gh.room[0] !== this.rx || gh.room[1] !== this.ry) continue;
      const lit = this.inBeam(gh.x, gh.y, beamA);
      const a = lit ? 0.35 + Math.min(1, gh.litT / CAPTURE_T) * 0.65 : (gh.glimpse > 0 ? 0.14 : 0);
      if (a <= 0) continue;
      this.drawGhost(g, mx(gh.x), my(gh.y), S * 5.4, a, gh.wob);
      if (lit && gh.litT > 0.15) {   // capture ring
        g.strokeStyle = '#7dff6a'; g.lineWidth = 3;
        g.beginPath(); g.arc(mx(gh.x), my(gh.y), S * 7.5, -HPI2, -HPI2 + TAU * (gh.litT / CAPTURE_T)); g.stroke();
      }
    }
    // the hunter
    drawDiverTop(g, {
      x: mx(this.px), y: my(this.py), r: S * PRr, color: this.runner.color,
      t: this.tt, vx: this.vx, vy: this.vy, speedNorm: Math.hypot(this.vx, this.vy) / VMAX,
    });
    g.restore();
    // ---- darkness with beam + halo cut out ----
    if (!this.dark || this.darkW !== W || this.darkH !== H) {
      this.dark = document.createElement('canvas'); this.dark.width = W; this.dark.height = H;
      this.darkW = W; this.darkH = H;
    }
    const dg = this.dark.getContext('2d');
    dg.clearRect(0, 0, W, H);
    dg.fillStyle = 'rgba(4,3,8,0.9)'; dg.fillRect(0, 0, W, H);
    dg.globalCompositeOperation = 'destination-out';
    const hx = mx(this.px), hy = my(this.py);
    const halo = dg.createRadialGradient(hx, hy, 2, hx, hy, S * 13);
    halo.addColorStop(0, 'rgba(0,0,0,0.95)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    dg.fillStyle = halo; dg.beginPath(); dg.arc(hx, hy, S * 13, 0, TAU); dg.fill();
    const bl = BEAM_LEN * S;
    const beamG = dg.createRadialGradient(hx, hy, S * 3, hx, hy, bl);
    beamG.addColorStop(0, 'rgba(0,0,0,0.98)'); beamG.addColorStop(0.8, 'rgba(0,0,0,0.85)'); beamG.addColorStop(1, 'rgba(0,0,0,0)');
    dg.fillStyle = beamG;
    dg.beginPath(); dg.moveTo(hx, hy);
    dg.arc(hx, hy, bl, beamA - BEAM_HALF, beamA + BEAM_HALF);
    dg.closePath(); dg.fill();
    dg.globalCompositeOperation = 'source-over';
    g.drawImage(this.dark, 0, 0);
    // green beam tint on top
    g.globalAlpha = 0.14; g.fillStyle = '#7dff6a';
    g.beginPath(); g.moveTo(hx, hy);
    g.arc(hx, hy, bl, beamA - BEAM_HALF, beamA + BEAM_HALF);
    g.closePath(); g.fill(); g.globalAlpha = 1;
    // ---- minimap ----
    const mmS = Math.min(W, H) * 0.052, mmX = W - mmS * 3 - 12, mmY = 12;
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) {
      const cur = x === this.rx && y === this.ry;
      g.fillStyle = cur ? 'rgba(125,255,106,0.4)' : 'rgba(20,26,40,0.65)';
      g.fillRect(mmX + x * mmS, mmY + y * mmS, mmS - 2, mmS - 2);
      for (const as of this.assistants)
        if (as.room[0] === x && as.room[1] === y) {
          g.fillStyle = as.ping > 0 ? '#ffd23f' : '#7dff6a';
          g.beginPath(); g.arc(mmX + x * mmS + mmS / 2, mmY + y * mmS + mmS / 2, as.ping > 0 ? 5 : 3, 0, TAU); g.fill();
          if (as.ping > 0) {
            g.font = '900 ' + Math.round(mmS * 0.5) + 'px system-ui'; g.textAlign = 'center';
            g.fillText('👻', mmX + x * mmS + mmS / 2, mmY + y * mmS + mmS * 0.42);
          }
        }
    }
    // HUD
    g.textAlign = 'left'; g.font = '800 18px system-ui'; g.fillStyle = '#7dff6a';
    g.fillText('👻 ' + this.captured + '/' + (this.practice ? 1 : NGHOSTS), 14, 30);
    g.textAlign = 'center'; g.font = '900 26px system-ui';
    if (this.practice) { g.fillStyle = '#7dff6a'; g.fillText('PRACTICE', W / 2, 36); }
    else {
      const tl = Math.max(0, T_LIMIT - this.runT);
      g.fillStyle = tl < 15 ? '#ff5f5f' : '#ffeccf';
      g.fillText(Math.ceil(tl) + '', W / 2, 36);
    }
    for (const p of this.pops) {
      const f = 1 - p.t / p.dur;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = '900 ' + p.size + 'px system-ui'; g.textAlign = 'center';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      g.strokeText(p.txt, W / 2, H * 0.3 - p.t * 40);
      g.fillStyle = p.col; g.fillText(p.txt, W / 2, H * 0.3 - p.t * 40);
    }
    g.globalAlpha = 1;
  }
  drawGhost(g, x, y, r, a, wob) {
    g.globalAlpha = a;
    g.fillStyle = '#f4f2ff'; g.strokeStyle = 'rgba(20,16,10,0.6)'; g.lineWidth = 2.5;
    g.beginPath();
    g.arc(x, y - r * 0.2, r, Math.PI, 0);
    const seg = r * 2 / 3;
    for (let i = 0; i < 3; i++)
      g.arc(x + r - seg * (i + 0.5), y + r * 0.55 + Math.sin(wob + i) * r * 0.12, seg / 2, 0, Math.PI);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#14100a';
    g.beginPath(); g.arc(x - r * 0.32, y - r * 0.25, r * 0.14, 0, TAU); g.fill();
    g.beginPath(); g.arc(x + r * 0.32, y - r * 0.25, r * 0.14, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  dispose() { }
}
const HPI2 = Math.PI / 2;
const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };
