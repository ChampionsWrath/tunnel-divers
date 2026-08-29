// GHOST GRABBERS — 3×3 haunted house, one room on screen at a time.
// ONLINE (2-4 in a room): true asymmetric — ONE player is the hunter, everyone
// else haunts the same house as ghosts (own light circle the hunter can't see).
// Captured ghosts BECOME hunters. Capture = hold the beam 2.5s.
//   Hunter team wins  → hunter 1st, last ghost caught 2nd, and so on.
//   Ghosts survive    → most-traveled ghost 1st … hunter LAST.
// Local/solo: scored hunter runs vs bot ghosts (same house, same rules).
import { TAU, clamp, lerp, mulberry32 } from '../util.js';
import { drawDiverTop } from '../character.js?v=28';

const RW = 100, RH = 66;
const T_LIMIT = 90, CAPTURE_T = 2.5, NGHOSTS = 3;
const ACC = 330, DRAG = 3.2, VMAX = 46, VMAX_G = 42, GH_WANDER = 26, GH_FLEE = 40, PRr = 4.2;
const BEAM_LEN = 46, BEAM_HALF = 0.46;
const DOORS = { top: [42, 58], left: [26, 40] };
const HPI2 = Math.PI / 2;
const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

export default {
  id: 'ghost', name: 'Ghost Grabbers', icon: '👻',
  desc: 'One hunter, invisible ghosts, one haunted house.',
  howto: {
    goal: 'One player hunts — everyone else IS a ghost in the same 3×3 house. Ghosts are invisible unless the green beam hits them; ' + CAPTURE_T + 's of light = captured, and captured ghosts become hunters! Hunters win by catching everyone; ghosts win by surviving 90s (the ghost who ROAMS the most wins it all).',
    touch: 'Tilt / drag to move — hunter beams point where you walk',
    keys: 'WASD / arrows to move',
    tip: 'Ghosts: keep moving — distance decides the ghost winner, and a sitting ghost is a caught ghost. Hunters: watch the minimap and listen for giggles.',
  },
  create(ctx) { return new GhostGame(ctx); }
};

class GhostGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.practice = !!ctx.practice;
    this.online = !!ctx.net && !this.practice;
    this.rng = mulberry32(ctx.seed);
    const humans = ctx.players.filter(p => !p.bot);
    this.asym = this.online && humans.length >= 2;
    this.pops = []; this.tt = 0;
    this.dark = null; this.darkW = 0; this.darkH = 0;
    if (this.asym) this.initAsym(ctx, humans);
    else this.initClassic(ctx);
    if (ctx.onNet) ctx.onNet((t, p, from) => this.onNet(t, p, from));
    if (this.practice) this.startRun();
  }
  pop(txt, col, size) { this.pops.push({ txt, col: col || '#7dff6a', t: 0, dur: 1.2, size: size || 24 }); }

  /* ================= ASYMMETRIC (online rooms) ================= */
  initAsym(ctx, humans) {
    const sorted = [...humans].sort((a, b) => a.id < b.id ? -1 : 1);
    this.hunterId = sorted[ctx.seed % sorted.length].id;
    this.myId = ctx.players.find(p => p.local && !p.bot).id;
    this.role = this.myId === this.hunterId ? 'hunter' : 'ghost';
    // roster: hunter + ghosts (humans − hunter, plus host-run bot fills to 3 ghosts)
    this.parts = [];   // {id,name,color,hunter:boolean at START}
    this.gh = [];      // ghost entities
    this.hunters = []; // hunter entities
    const mkHunter = (p, me) => ({ id: p.id, name: p.name, color: p.color, me, x: 50, y: 33, rm: [1, 1], vx: 0, vy: 0, fx: 0, fy: -1 });
    const mkGhost = (p, me, bot, i) => {
      let rm; const r = mulberry32((ctx.seed ^ hashSeed(p.id)) >>> 0);
      do { rm = [Math.floor(r() * 3), Math.floor(r() * 3)]; } while (rm[0] === 1 && rm[1] === 1);
      return {
        id: p.id, name: p.name, color: p.color, me, bot, isFill: !!p.isFill,
        x: 20 + r() * 60, y: 14 + r() * 38, rm, vx: 0, vy: 0,
        captured: false, litT: 0, myLit: 0, dist: 0, glimpse: 0, wob: r() * TAU, wpT: 0, wpx: 50, wpy: 33,
      };
    };
    for (const p of sorted) {
      this.parts.push({ id: p.id, name: p.name, color: p.color, startHunter: p.id === this.hunterId });
      if (p.id === this.hunterId) this.hunters.push(mkHunter(p, p.id === this.myId));
      else this.gh.push(mkGhost(p, p.id === this.myId, false));
    }
    let bi = 0;
    while (this.gh.length < NGHOSTS) {
      const fp = { id: 'gbot' + bi, name: ['BLINKY', 'MOOSE', 'GARY'][bi % 3], color: ['#66e0c9', '#d5b3ff', '#ff8a5c'][bi % 3], isFill: true };
      this.parts.push({ id: fp.id, name: fp.name, color: fp.color, startHunter: false });
      this.gh.push(mkGhost(fp, false, true)); bi++;
    }
    this.capOrder = [];
    this.runT = 0; this.giggleT = 2; this.slide = 0; this.slideDx = 0; this.slideDy = 0;
    this.state = 'run'; this.stateT = 0; this.ended = false;
    this.pop(this.role === 'hunter' ? '🔦 YOU ARE THE HUNTER!' : '👻 YOU ARE A GHOST — SURVIVE!',
      this.role === 'hunter' ? '#7dff6a' : '#e08bd0', 26);
  }
  me() { return this.role === 'hunter' ? this.hunters.find(h => h.me) : this.gh.find(g => g.me); }
  onNet(t, p) {
    if (t !== 'g' || !this.asym) return;
    if (p.k === 'st') {
      const pool = p.role === 'hunter' ? this.hunters : this.gh;
      const e = pool.find(q => q.id === p.id);
      if (e && !e.me) {
        e.x = p.x; e.y = p.y; e.rm = p.rm;
        if (p.role === 'hunter') { e.fx = p.fx; e.fy = p.fy; }
        else e.dist = p.d;
      }
    } else if (p.k === 'bot') {
      const e = this.gh.find(q => q.id === p.id);
      if (e) { e.x = p.x; e.y = p.y; e.rm = p.rm; e.dist = p.d; }
    } else if (p.k === 'lit') {
      const e = this.gh.find(q => q.id === p.gid);
      if (e && e.me) e.myLit = p.lt;
    } else if (p.k === 'cap') {
      this.applyCapture(p.gid, false);
    } else if (p.k === 'end') {
      this.endAsym(p.win, false);
    }
  }
  applyCapture(gid, broadcast) {
    const e = this.gh.find(q => q.id === gid);
    if (!e || e.captured) return;
    e.captured = true; this.capOrder.push(gid);
    this.ctx.audio.sfx.win();
    if (broadcast && this.ctx.net) this.ctx.net.send('g', { k: 'cap', gid });
    // the captured ghost rises as a hunter
    this.hunters.push({ id: e.id, name: e.name, color: e.color, me: e.me, x: e.x, y: e.y, rm: [e.rm[0], e.rm[1]], vx: 0, vy: 0, fx: 0, fy: -1, bot: e.bot });
    if (e.me) { this.role = 'hunter'; this.pop('CAPTURED! NOW YOU HUNT 🔦', '#7dff6a', 26); }
    else this.pop(e.name + ' captured — joins the hunt!', e.color);
    if (this.gh.every(q => q.captured)) this.endAsym('hunters', true);
  }
  endAsym(win, broadcast) {
    if (this.ended) return; this.ended = true;
    if (broadcast && this.ctx.net) this.ctx.net.send('g', { k: 'end', win });
    const n = this.parts.length;
    const rows = [];
    const hunterP = this.parts.find(p => p.startHunter);
    if (win === 'hunters') {
      rows.push({ id: hunterP.id, score: n, label: '🔦 caught them all', name: hunterP.name, color: hunterP.color });
      const rev = [...this.capOrder].reverse();
      rev.forEach((gid, i) => {
        const e = this.gh.find(q => q.id === gid);
        rows.push({ id: gid, score: n - 1 - i, label: 'caught #' + (this.capOrder.indexOf(gid) + 1), name: e.name, color: e.color, isFill: e.isFill });
      });
    } else {
      const free = this.gh.filter(q => !q.captured).sort((a, b) => b.dist - a.dist);
      const caught = this.gh.filter(q => q.captured).sort((a, b) => b.dist - a.dist);
      let pts = n;
      for (const e of [...free, ...caught])
        rows.push({ id: e.id, score: pts--, label: (e.captured ? 'caught · ' : '👻 escaped · ') + Math.round(e.dist) + 'm roamed', name: e.name, color: e.color, isFill: e.isFill });
      rows.push({ id: hunterP.id, score: 1, label: 'the ghosts got away', name: hunterP.name, color: hunterP.color });
    }
    this.ctx.end(rows);
  }
  updateAsym(rdt) {
    this.runT += rdt; this.giggleT -= rdt;
    if (this.slide > 0) { this.slide -= rdt * 3.4; if (this.slide < 0) this.slide = 0; }
    const me = this.me();
    // --- move myself ---
    const inp = this.ctx.input(0, rdt);
    const vmax = this.role === 'hunter' ? VMAX : VMAX_G;
    me.vx += inp.x * ACC * rdt; me.vy += inp.y * ACC * rdt;
    const dr = Math.exp(-DRAG * rdt); me.vx *= dr; me.vy *= dr;
    const sp = Math.hypot(me.vx, me.vy);
    if (sp > vmax) { me.vx *= vmax / sp; me.vy *= vmax / sp; }
    if (this.role === 'hunter' && sp > 6) { me.fx = me.vx / sp; me.fy = me.vy / sp; }
    const preRm = me.rm.join();
    me.x += me.vx * rdt; me.y += me.vy * rdt;
    this.doorCheck(me);
    me.x = clamp(me.x, PRr + 2, RW - PRr - 2); me.y = clamp(me.y, PRr + 2, RH - PRr - 2);
    if (me.rm.join() !== preRm) this.roomSlideFx();
    if (this.role === 'ghost' && !me.captured) me.dist += sp * rdt * 0.1;   // roaming meters
    // --- host simulates bot ghosts (flee nearest hunter in their room) ---
    if (this.ctx.net && this.ctx.net.isHost) {
      for (const e of this.gh) {
        if (!e.bot || e.captured) continue;
        e.wob += rdt * 5; e.wpT -= rdt;
        const hunter = this.hunters.find(h => h.rm[0] === e.rm[0] && h.rm[1] === e.rm[1]);
        if (hunter && Math.hypot(e.x - hunter.x, e.y - hunter.y) < 26) {
          const dx = e.x - hunter.x, dy = e.y - hunter.y, d = Math.hypot(dx, dy) || 1;
          e.vx = dx / d * GH_FLEE; e.vy = dy / d * GH_FLEE;
        } else if (e.wpT <= 0) {
          e.wpT = 1.6 + this.rng() * 2.2;
          e.wpx = 12 + this.rng() * (RW - 24); e.wpy = 10 + this.rng() * (RH - 20);
        } else {
          const dx = e.wpx - e.x, dy = e.wpy - e.y, d = Math.hypot(dx, dy) || 1;
          e.vx = lerp(e.vx, dx / d * GH_WANDER, rdt * 3); e.vy = lerp(e.vy, dy / d * GH_WANDER, rdt * 3);
        }
        e.x += e.vx * rdt; e.y += e.vy * rdt;
        this.doorCheck(e, true);
        e.x = clamp(e.x, 4, RW - 4); e.y = clamp(e.y, 4, RH - 4);
        e.dist += Math.hypot(e.vx, e.vy) * rdt * 0.1;
      }
      this._bAcc = (this._bAcc || 0) + rdt;
      if (this._bAcc > 0.1) {
        this._bAcc = 0;
        for (const e of this.gh) if (e.bot && !e.captured)
          this.ctx.net.send('g', { k: 'bot', id: e.id, x: e.x, y: e.y, rm: e.rm, d: Math.round(e.dist) });
      }
    }
    // --- hunters (only MY beam captures; each hunter client runs its own) ---
    if (this.role === 'hunter') {
      const beamA = Math.atan2(me.fy, me.fx);
      for (const e of this.gh) {
        if (e.captured) continue;
        const sameRoom = e.rm[0] === me.rm[0] && e.rm[1] === me.rm[1];
        const lit = sameRoom && this.inBeam(me, e.x, e.y, beamA);
        if (lit) {
          e.litT += rdt;
          this._lAcc = (this._lAcc || 0) + rdt;
          if (this._lAcc > 0.12 && this.ctx.net) { this._lAcc = 0; this.ctx.net.send('g', { k: 'lit', gid: e.id, lt: e.litT }); }
          if (e.litT >= CAPTURE_T) this.applyCapture(e.id, true);
        } else e.litT = Math.max(0, e.litT - rdt * 1.5);
      }
      // giggle hint
      const inMyRoom = this.gh.some(e => !e.captured && e.rm[0] === me.rm[0] && e.rm[1] === me.rm[1]);
      if (inMyRoom && this.giggleT <= 0) {
        this.giggleT = 2.5 + this.rng() * 2.5;
        this.ctx.audio.sfx.whoosh();
        for (const e of this.gh) if (!e.captured && e.rm[0] === me.rm[0] && e.rm[1] === me.rm[1]) e.glimpse = 0.35;
      }
      for (const e of this.gh) e.glimpse -= rdt;
    } else { const g2 = me; g2.myLit = Math.max(0, g2.myLit - rdt * 0.5); }
    // --- broadcast my state ---
    if (this.ctx.net) {
      this._sAcc = (this._sAcc || 0) + rdt;
      if (this._sAcc > 0.1) {
        this._sAcc = 0;
        const m2 = this.me();
        this.ctx.net.send('g', {
          k: 'st', id: this.myId, role: this.role, x: m2.x, y: m2.y, rm: m2.rm,
          fx: m2.fx || 0, fy: m2.fy || 0, d: Math.round(m2.dist || 0),
        });
      }
    }
    this.ctx.audio.setMusicIntensity(0.35 + this.capOrder.length * 0.1 + (this.role === 'ghost' && this.me().myLit > 0.2 ? 0.25 : 0));
    if (this.runT >= T_LIMIT) this.endAsym('ghosts', this.ctx.net && this.ctx.net.isHost);
  }
  inBeam(h, x, y, beamA) {
    const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy);
    if (d > BEAM_LEN) return false;
    const a = Math.atan2(dy, dx);
    const da = Math.abs(Math.atan2(Math.sin(a - beamA), Math.cos(a - beamA)));
    return da < BEAM_HALF || d < 9;
  }
  doorCheck(e, isGhost) {
    const [tx0, tx1] = DOORS.top, [ly0, ly1] = DOORS.left;
    const m = isGhost ? 4.5 : PRr + 2.2;
    if (e.y <= m && e.x > tx0 && e.x < tx1 && e.rm[1] > 0) { e.rm[1]--; e.y = RH - m - 2; if (e.litT !== undefined) e.litT = 0; }
    else if (e.y >= RH - m && e.x > tx0 && e.x < tx1 && e.rm[1] < 2) { e.rm[1]++; e.y = m + 2; if (e.litT !== undefined) e.litT = 0; }
    else if (e.x <= m && e.y > ly0 && e.y < ly1 && e.rm[0] > 0) { e.rm[0]--; e.x = RW - m - 2; if (e.litT !== undefined) e.litT = 0; }
    else if (e.x >= RW - m && e.y > ly0 && e.y < ly1 && e.rm[0] < 2) { e.rm[0]++; e.x = m + 2; if (e.litT !== undefined) e.litT = 0; }
  }
  roomSlideFx() { this.slide = 1; this.ctx.audio.sfx.drop(); }

  /* ================= CLASSIC (local/solo/practice): scored hunter runs ================= */
  initClassic(ctx) {
    const locals = ctx.players.filter(p => p.local && !p.bot);
    this.queue = this.practice ? [locals[0]] : [...locals];
    this.remotes = this.online ? ctx.players.filter(p => !p.local && !p.bot) : [];
    this.remoteLive = {};
    this.results = [];
    this.botRacers = (this.practice ? [] : ctx.players.filter(p => p.bot)).map(b => {
      const bh = hashSeed(b.id), rng = mulberry32((ctx.seed ^ bh) >>> 0);
      const evs = []; let t = 8 + rng() * 10, n = 0;
      while (n < NGHOSTS && t < T_LIMIT) { evs.push({ t }); n++; t += 10 + rng() * 16 - (0.3 + (bh % 100) / 250) * 8; }
      return { p: b, evs, n: 0, i: 0 };
    });
    this.state = 'ready'; this.stateT = 0;
    this.nextRunner();
  }
  nextRunner() {
    this.runner = this.queue.shift() || null;
    if (!this.runner) { this.state = 'wait'; this.stateT = 0; return; }
    this.state = 'ready'; this.stateT = 0;
  }
  startRun() {
    this.rng = mulberry32(this.ctx.seed);
    this.runT = 0; this.captured = 0; this.doneBonus = 0;
    this.rx = 1; this.ry = 1;
    this.px = 50; this.py = 33; this.vx = 0; this.vy = 0; this.fx = 0; this.fy = -1;
    this.slide = 0; this.assistants = []; this.giggleT = 2;
    const n = this.practice ? 1 : NGHOSTS;
    this.ghosts = [];
    for (let i = 0; i < n; i++) {
      let gr;
      do { gr = [Math.floor(this.rng() * 3), Math.floor(this.rng() * 3)]; } while (gr[0] === 1 && gr[1] === 1);
      this.ghosts.push({
        id: i, room: gr, x: 20 + this.rng() * 60, y: 14 + this.rng() * 38,
        vx: 0, vy: 0, litT: 0, glimpse: 0, captured: false,
        wob: this.rng() * TAU, wpT: 0, wpx: 50, wpy: 33,
      });
    }
    this.state = 'run'; this.stateT = 0;
  }
  scoreNow() { return this.captured * 100 + this.doneBonus; }

  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
    for (let i = this.pops.length; i--;) { this.pops[i].t += rdt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    if (this.asym) { if (!this.ended) this.updateAsym(rdt); return; }
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
    // classic run (single hunter vs AI ghosts)
    this.runT += rdt; this.giggleT -= rdt;
    if (this.slide > 0) { this.slide -= rdt * 3.4; if (this.slide < 0) this.slide = 0; }
    const inp = this.ctx.input(this.runner.slot, rdt);
    this.vx += inp.x * ACC * rdt; this.vy += inp.y * ACC * rdt;
    const dr = Math.exp(-DRAG * rdt); this.vx *= dr; this.vy *= dr;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > VMAX) { this.vx *= VMAX / sp; this.vy *= VMAX / sp; }
    if (sp > 6) { this.fx = this.vx / sp; this.fy = this.vy / sp; }
    this.px += this.vx * rdt; this.py += this.vy * rdt;
    const fake = { x: this.px, y: this.py, rm: [this.rx, this.ry] };
    this.doorCheck(fake); this.px = fake.x; this.py = fake.y;
    if (fake.rm[0] !== this.rx || fake.rm[1] !== this.ry) { this.rx = fake.rm[0]; this.ry = fake.rm[1]; this.roomSlideFx(); }
    this.px = clamp(this.px, PRr + 2, RW - PRr - 2);
    this.py = clamp(this.py, PRr + 2, RH - PRr - 2);
    const beamA = Math.atan2(this.fy, this.fx);
    const meH = { x: this.px, y: this.py };
    let inMyRoom = false;
    for (const gh of this.ghosts) {
      if (gh.captured) continue;
      gh.wob += rdt * 5; gh.glimpse -= rdt;
      const sameRoom = gh.room[0] === this.rx && gh.room[1] === this.ry;
      if (sameRoom) inMyRoom = true;
      const lit = sameRoom && this.inBeam(meH, gh.x, gh.y, beamA);
      gh.wpT -= rdt;
      if (lit || (sameRoom && Math.hypot(gh.x - this.px, gh.y - this.py) < 22)) {
        const dx = gh.x - this.px, dy = gh.y - this.py, d = Math.hypot(dx, dy) || 1;
        gh.vx = dx / d * GH_FLEE; gh.vy = dy / d * GH_FLEE;
      } else if (gh.wpT <= 0) {
        gh.wpT = 1.6 + this.rng() * 2.2;
        gh.wpx = 12 + this.rng() * (RW - 24); gh.wpy = 10 + this.rng() * (RH - 20);
      } else if (!lit) {
        const dx = gh.wpx - gh.x, dy = gh.wpy - gh.y, d = Math.hypot(dx, dy) || 1;
        gh.vx = lerp(gh.vx, dx / d * GH_WANDER, rdt * 3); gh.vy = lerp(gh.vy, dy / d * GH_WANDER, rdt * 3);
      }
      gh.x += gh.vx * rdt; gh.y += gh.vy * rdt;
      const gf = { x: gh.x, y: gh.y, rm: gh.room, litT: gh.litT };
      this.doorCheck(gf, true); gh.x = gf.x; gh.y = gf.y; gh.litT = gf.litT;
      gh.x = clamp(gh.x, 4, RW - 4); gh.y = clamp(gh.y, 4, RH - 4);
      if (lit) {
        gh.litT += rdt;
        if (gh.litT >= CAPTURE_T) {
          gh.captured = true; this.captured++;
          this.ctx.audio.sfx.win(); this.pop('CAPTURED! 👻→🔦');
          this.assistants.push({ room: [gh.room[0], gh.room[1]], wpT: 0, ping: 0 });
        }
      } else gh.litT = Math.max(0, gh.litT - rdt * 1.5);
    }
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

  /* ================= render ================= */
  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    const S = Math.min(W / RW, H / (RH + 14));
    const ox = (W - S * RW) / 2, oy = (H - S * RH) / 2 + S * 5;
    const mx = v => ox + v * S, my = v => oy + v * S;
    g.fillStyle = '#0a0710'; g.fillRect(0, 0, W, H);
    if (!this.asym && (this.state === 'ready' || this.state === 'wait')) {
      g.textAlign = 'center';
      if (this.state === 'ready' && this.runner) {
        g.fillStyle = this.runner.color; g.font = '900 34px system-ui';
        g.fillText(this.runner.name, W / 2, H * 0.4);
        g.fillStyle = '#ffeccf'; g.font = '800 20px system-ui';
        g.fillText('GET READY — tap / SPACE', W / 2, H * 0.4 + 40);
      } else if (this.state === 'wait') {
        g.fillStyle = '#ffeccf'; g.font = '800 22px system-ui';
        g.fillText(this.online ? 'waiting for the other hunters…' : 'tallying…', W / 2, H * 0.45);
      }
      this.drawPops(g, W, H);
      return;
    }
    // whose view is this?
    const asym = this.asym;
    const me = asym ? this.me() : null;
    const rx = asym ? me.rm[0] : this.rx, ry = asym ? me.rm[1] : this.ry;
    g.save();
    if (this.slide > 0) g.translate(this.slideDx * this.slide * 24 || 0, this.slideDy * this.slide * 24 || 0);
    this.drawRoom(g, mx, my, S, rx, ry);
    if (asym) this.renderAsymEntities(g, mx, my, S, me, rx, ry);
    else this.renderClassicEntities(g, mx, my, S);
    g.restore();
    // darkness: hunters get a beam; ghosts get their own light circle
    const isHunterView = !asym || this.role === 'hunter';
    const px2 = asym ? mx(me.x) : mx(this.px), py2 = asym ? my(me.y) : my(this.py);
    if (!this.dark || this.darkW !== W || this.darkH !== H) {
      this.dark = document.createElement('canvas'); this.dark.width = W; this.dark.height = H;
      this.darkW = W; this.darkH = H;
    }
    const dg = this.dark.getContext('2d');
    dg.clearRect(0, 0, W, H);
    dg.fillStyle = isHunterView ? 'rgba(4,3,8,0.9)' : 'rgba(6,4,12,0.78)';
    dg.fillRect(0, 0, W, H);
    dg.globalCompositeOperation = 'destination-out';
    const haloR = isHunterView ? S * 13 : S * 30;   // the ghost's personal light circle
    const halo = dg.createRadialGradient(px2, py2, 2, px2, py2, haloR);
    halo.addColorStop(0, 'rgba(0,0,0,0.96)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    dg.fillStyle = halo; dg.beginPath(); dg.arc(px2, py2, haloR, 0, TAU); dg.fill();
    if (isHunterView) {
      const fx2 = asym ? me.fx : this.fx, fy2 = asym ? me.fy : this.fy;
      const beamA = Math.atan2(fy2, fx2), bl = BEAM_LEN * S;
      const beamG = dg.createRadialGradient(px2, py2, S * 3, px2, py2, bl);
      beamG.addColorStop(0, 'rgba(0,0,0,0.98)'); beamG.addColorStop(0.8, 'rgba(0,0,0,0.85)'); beamG.addColorStop(1, 'rgba(0,0,0,0)');
      dg.fillStyle = beamG;
      dg.beginPath(); dg.moveTo(px2, py2);
      dg.arc(px2, py2, bl, beamA - BEAM_HALF, beamA + BEAM_HALF);
      dg.closePath(); dg.fill();
    }
    dg.globalCompositeOperation = 'source-over';
    g.drawImage(this.dark, 0, 0);
    if (isHunterView) {
      const fx2 = asym ? me.fx : this.fx, fy2 = asym ? me.fy : this.fy;
      const beamA = Math.atan2(fy2, fx2), bl = BEAM_LEN * S;
      g.globalAlpha = 0.14; g.fillStyle = '#7dff6a';
      g.beginPath(); g.moveTo(px2, py2);
      g.arc(px2, py2, bl, beamA - BEAM_HALF, beamA + BEAM_HALF);
      g.closePath(); g.fill(); g.globalAlpha = 1;
    }
    this.drawMinimap(g, W, H, rx, ry);
    this.drawHud(g, W, H);
    this.drawPops(g, W, H);
  }
  drawRoom(g, mx, my, S, rx, ry) {
    const roomSeed = (this.ctx.seed ^ (rx * 7 + ry * 31)) >>> 0;
    const rr = mulberry32(roomSeed);
    g.fillStyle = ['#2a1f33', '#25242e', '#2e2030'][Math.floor(rr() * 3)];
    g.fillRect(mx(0), my(0), RW * S, RH * S);
    g.fillStyle = '#221812';
    g.fillRect(mx(0), my(RH * 0.22), RW * S, RH * 0.78 * S);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(mx(0), my(RH * 0.22 + i * 6.5)); g.lineTo(mx(RW), my(RH * 0.22 + i * 6.5)); g.stroke(); }
    g.fillStyle = '#171019';
    for (let i = 0; i < 3; i++) {
      const fx2 = 12 + rr() * 66, fy2 = 20 + rr() * 34, fw = 8 + rr() * 14, fh = 6 + rr() * 10;
      g.fillRect(mx(fx2), my(fy2), fw * S, fh * S);
    }
    const drw = (x0, x1, y, horiz) => {
      g.fillStyle = '#3d2c1e'; g.strokeStyle = '#5a4028'; g.lineWidth = 3;
      if (horiz) { g.fillRect(mx(x0), my(y) - 3 * S, (x1 - x0) * S, 6 * S); g.strokeRect(mx(x0), my(y) - 3 * S, (x1 - x0) * S, 6 * S); }
      else { g.fillRect(mx(y) - 3 * S, my(x0), 6 * S, (x1 - x0) * S); g.strokeRect(mx(y) - 3 * S, my(x0), 6 * S, (x1 - x0) * S); }
    };
    if (ry > 0) drw(DOORS.top[0], DOORS.top[1], 0, true);
    if (ry < 2) drw(DOORS.top[0], DOORS.top[1], RH, true);
    if (rx > 0) drw(DOORS.left[0], DOORS.left[1], 0, false);
    if (rx < 2) drw(DOORS.left[0], DOORS.left[1], RW, false);
  }
  renderAsymEntities(g, mx, my, S, me, rx, ry) {
    const iAmHunter = this.role === 'hunter';
    // hunters in this room: always drawn (everyone can see hunters)
    for (const h of this.hunters) {
      if (h.rm[0] !== rx || h.rm[1] !== ry) continue;
      drawDiverTop(g, { x: mx(h.x), y: my(h.y), r: S * PRr, color: h.color, t: this.tt, vx: h.vx || 0, vy: h.vy || 0, cos: h.cos, ward: h.ward, skin: h.skin });
      if (!h.me) {   // their beam, visible to ghosts (and other hunters)
        const ba = Math.atan2(h.fy, h.fx);
        g.globalAlpha = 0.12; g.fillStyle = '#7dff6a';
        g.beginPath(); g.moveTo(mx(h.x), my(h.y));
        g.arc(mx(h.x), my(h.y), BEAM_LEN * S, ba - BEAM_HALF, ba + BEAM_HALF);
        g.closePath(); g.fill(); g.globalAlpha = 1;
      }
    }
    // ghosts in this room
    for (const e of this.gh) {
      if (e.captured || e.rm[0] !== rx || e.rm[1] !== ry) continue;
      let a = 0;
      if (iAmHunter) a = e.litT > 0 ? 0.35 + Math.min(1, e.litT / CAPTURE_T) * 0.65 : (e.glimpse > 0 ? 0.14 : 0);
      else a = e.me ? 0.95 : 0.5;                    // ghosts see themselves & each other
      if (a <= 0) continue;
      this.drawGhost(g, mx(e.x), my(e.y), S * 5.4, a, e.wob || this.tt * 5, e.color);
      const lt = iAmHunter ? e.litT : (e.me ? e.myLit : 0);
      if (lt > 0.12) {
        g.strokeStyle = iAmHunter ? '#7dff6a' : '#ff5f5f'; g.lineWidth = 3;
        g.beginPath(); g.arc(mx(e.x), my(e.y), S * 7.5, -HPI2, -HPI2 + TAU * Math.min(1, lt / CAPTURE_T)); g.stroke();
      }
    }
  }
  renderClassicEntities(g, mx, my, S) {
    const beamA = Math.atan2(this.fy, this.fx);
    const meH = { x: this.px, y: this.py };
    for (const gh of this.ghosts) {
      if (gh.captured || gh.room[0] !== this.rx || gh.room[1] !== this.ry) continue;
      const lit = this.inBeam(meH, gh.x, gh.y, beamA);
      const a = lit ? 0.35 + Math.min(1, gh.litT / CAPTURE_T) * 0.65 : (gh.glimpse > 0 ? 0.14 : 0);
      if (a <= 0) continue;
      this.drawGhost(g, mx(gh.x), my(gh.y), S * 5.4, a, gh.wob);
      if (lit && gh.litT > 0.12) {
        g.strokeStyle = '#7dff6a'; g.lineWidth = 3;
        g.beginPath(); g.arc(mx(gh.x), my(gh.y), S * 7.5, -HPI2, -HPI2 + TAU * (gh.litT / CAPTURE_T)); g.stroke();
      }
    }
    drawDiverTop(g, {
      x: mx(this.px), y: my(this.py), r: S * PRr, color: this.runner.color, cos: this.runner.cosmetics, ward: this.runner.ward, skin: this.runner.skin,
      t: this.tt, vx: this.vx, vy: this.vy, speedNorm: Math.hypot(this.vx, this.vy) / VMAX,
    });
  }
  drawMinimap(g, W, H, rx, ry) {
    const mmS = Math.min(W, H) * 0.052, mmX = W - mmS * 3 - 12, mmY = 12;
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) {
      const cur = x === rx && y === ry;
      g.fillStyle = cur ? 'rgba(125,255,106,0.4)' : 'rgba(20,26,40,0.65)';
      g.fillRect(mmX + x * mmS, mmY + y * mmS, mmS - 2, mmS - 2);
      if (this.asym) {
        for (const h of this.hunters)
          if (h.rm[0] === x && h.rm[1] === y) {
            g.fillStyle = this.role === 'ghost' ? '#ff5f5f' : '#7dff6a';
            g.beginPath(); g.arc(mmX + x * mmS + mmS / 2, mmY + y * mmS + mmS / 2, 4, 0, TAU); g.fill();
          }
      } else if (this.assistants) {
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
    }
  }
  drawHud(g, W, H) {
    g.textAlign = 'left'; g.font = '800 18px system-ui'; g.fillStyle = '#7dff6a';
    if (this.asym) {
      const caught = this.capOrder.length, total = this.gh.length;
      g.fillText((this.role === 'hunter' ? '🔦 HUNTER' : '👻 GHOST') + ' · ' + caught + '/' + total + ' caught', 14, 30);
      if (this.role === 'ghost') {
        g.fillStyle = '#e08bd0'; g.font = '700 13px system-ui';
        g.fillText('roamed ' + Math.round(this.me().dist) + 'm — keep moving!', 14, 52);
      }
    } else {
      g.fillText('👻 ' + this.captured + '/' + (this.practice ? 1 : NGHOSTS), 14, 30);
    }
    g.textAlign = 'center'; g.font = '900 26px system-ui';
    if (this.practice) { g.fillStyle = '#7dff6a'; g.fillText('PRACTICE', W / 2, 36); }
    else {
      const tl = Math.max(0, T_LIMIT - this.runT);
      g.fillStyle = tl < 15 ? '#ff5f5f' : '#ffeccf';
      g.fillText(Math.ceil(tl) + '', W / 2, 36);
    }
  }
  drawPops(g, W, H) {
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
  drawGhost(g, x, y, r, a, wob, tint) {
    g.globalAlpha = a;
    g.fillStyle = '#f4f2ff'; g.strokeStyle = 'rgba(20,16,10,0.6)'; g.lineWidth = 2.5;
    g.beginPath();
    g.arc(x, y - r * 0.2, r, Math.PI, 0);
    const seg = r * 2 / 3;
    for (let i = 0; i < 3; i++)
      g.arc(x + r - seg * (i + 0.5), y + r * 0.55 + Math.sin(wob + i) * r * 0.12, seg / 2, 0, Math.PI);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = tint || '#14100a';
    g.beginPath(); g.arc(x - r * 0.32, y - r * 0.25, r * 0.15, 0, TAU); g.fill();
    g.beginPath(); g.arc(x + r * 0.32, y - r * 0.25, r * 0.15, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  dispose() { }
}
