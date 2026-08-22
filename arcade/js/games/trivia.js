// TRIVIA TRIATHLON — 3 random categories × 3 questions each, then a bonus
// question (worth 2) from any category. Tap the answer box. Most points wins.
import { clamp, mulberry32 } from '../util.js';

const Q_TIME = 12, PADCOL = ['#4d9de0', '#e04040', '#3a9d5c', '#9d5cd0'];
const CATS = [
  ['movies', '🎬 Movies'], ['tv', '📺 TV'], ['music', '🎵 Music'], ['history', '🏛️ History'],
  ['sports', '🏈 Sports'], ['science', '🔬 Science'], ['games', '🎮 Video Games'], ['animals', '🐾 Animals']];
// first option is always the correct one; shuffled per game
const BANK = {
  movies: [
    { q: 'Who directed Jurassic Park?', o: ['Steven Spielberg', 'George Lucas', 'James Cameron', 'Ridley Scott'] },
    { q: "What color are Dorothy's slippers in The Wizard of Oz?", o: ['Ruby red', 'Emerald green', 'Silver', 'Gold'] },
    { q: 'What kind of fish is Nemo?', o: ['Clownfish', 'Angelfish', 'Pufferfish', 'Swordfish'] },
    { q: 'Who played Jack in Titanic?', o: ['Leonardo DiCaprio', 'Brad Pitt', 'Matt Damon', 'Johnny Depp'] },
    { q: "What is Han Solo's ship called?", o: ['Millennium Falcon', 'X-Wing', 'Star Destroyer', 'Enterprise'] },
    { q: "In The Lion King, Simba's father is?", o: ['Mufasa', 'Scar', 'Rafiki', 'Zazu'] },
    { q: '"You\'re gonna need a bigger boat" is from?', o: ['Jaws', 'Titanic', 'Moby Dick', 'Life of Pi'] },
    { q: 'Ghostbusters catch ghosts with?', o: ['Proton packs', 'Butterfly nets', 'Magic wands', 'Vacuum trucks'] },
    { q: 'In Toy Story, Woody is a?', o: ['Cowboy doll', 'Robot', 'Dinosaur', 'Piggy bank'] },
    { q: "Captain America's shield is made of?", o: ['Vibranium', 'Adamantium', 'Kryptonite', 'Mithril'] },
  ],
  tv: [
    { q: 'In Friends, Phoebe plays the?', o: ['Guitar', 'Piano', 'Drums', 'Violin'] },
    { q: 'SpongeBob lives in a?', o: ['Pineapple', 'Rock', 'Shoe', 'Boat'] },
    { q: 'The Simpsons live in?', o: ['Springfield', 'Shelbyville', 'Quahog', 'South Park'] },
    { q: 'Game of Thrones: "Winter is ___"', o: ['Coming', 'Here', 'Cold', 'Over'] },
    { q: 'Which Sesame Street character lives in a trash can?', o: ['Oscar', 'Elmo', 'Big Bird', 'Bert'] },
    { q: 'The coffee shop in Friends is?', o: ['Central Perk', 'The Grind', "Java Joe's", "MacLaren's"] },
    { q: "Scooby-Doo's van is called the?", o: ['Mystery Machine', 'Party Wagon', 'Ghost Cruiser', 'Doo-mobile'] },
    { q: 'Stranger Things is set mostly in the?', o: ['1980s', '1970s', '1990s', '1960s'] },
    { q: 'The Office (US) takes place at?', o: ['Dunder Mifflin', 'Initech', 'Sterling Cooper', 'Hooli'] },
    { q: "Ash's first Pokémon is?", o: ['Pikachu', 'Charmander', 'Squirtle', 'Bulbasaur'] },
  ],
  music: [
    { q: 'A standard guitar has how many strings?', o: ['6', '4', '5', '8'] },
    { q: 'Which instrument has 88 keys?', o: ['Piano', 'Organ', 'Accordion', 'Harp'] },
    { q: 'The Beatles came from?', o: ['Liverpool', 'London', 'Manchester', 'Dublin'] },
    { q: '"Thriller" is an album by?', o: ['Michael Jackson', 'Prince', 'Madonna', 'Elvis'] },
    { q: 'Which of these is a brass instrument?', o: ['Trumpet', 'Violin', 'Clarinet', 'Xylophone'] },
    { q: 'Do, re, mi, fa, so, la, ti…?', o: ['Do', 'Ra', 'Mi', 'Fa'] },
    { q: "Queen's lead singer was?", o: ['Freddie Mercury', 'David Bowie', 'Elton John', 'Mick Jagger'] },
    { q: 'Four musicians playing together are a?', o: ['Quartet', 'Trio', 'Duet', 'Quintet'] },
    { q: 'The "Moonlight Sonata" was written by?', o: ['Beethoven', 'Mozart', 'Bach', 'Chopin'] },
    { q: 'A metronome keeps the?', o: ['Tempo', 'Volume', 'Pitch', 'Harmony'] },
  ],
  history: [
    { q: 'The first US President was?', o: ['George Washington', 'Abraham Lincoln', 'Thomas Jefferson', 'John Adams'] },
    { q: 'The Great Wall is in?', o: ['China', 'Japan', 'India', 'Egypt'] },
    { q: 'The Titanic sank in which ocean?', o: ['Atlantic', 'Pacific', 'Indian', 'Arctic'] },
    { q: 'Ancient Egyptian kings were called?', o: ['Pharaohs', 'Czars', 'Sultans', 'Emperors'] },
    { q: 'Humans first landed on the Moon in?', o: ['1969', '1959', '1975', '1981'] },
    { q: 'Roman gladiators fought in the?', o: ['Colosseum', 'Parthenon', 'Pyramids', 'Acropolis'] },
    { q: 'Who painted the Mona Lisa?', o: ['Leonardo da Vinci', 'Michelangelo', 'Picasso', 'Van Gogh'] },
    { q: 'The Declaration of Independence was signed in?', o: ['1776', '1492', '1812', '1865'] },
    { q: 'Vikings mostly came from?', o: ['Scandinavia', 'Mongolia', 'Spain', 'Brazil'] },
    { q: 'The first airplane was flown by the?', o: ['Wright brothers', 'Edison brothers', 'Ford brothers', 'Bell brothers'] },
  ],
  sports: [
    { q: 'Soccer teams field how many players?', o: ['11', '9', '10', '12'] },
    { q: 'A basketball shot from behind the arc is worth?', o: ['3 points', '2 points', '4 points', '1 point'] },
    { q: 'Which sport uses a shuttlecock?', o: ['Badminton', 'Tennis', 'Squash', 'Cricket'] },
    { q: 'NHL hockey is played on?', o: ['Ice', 'Grass', 'Sand', 'Concrete'] },
    { q: 'Baseball has how many bases (counting home)?', o: ['4', '3', '5', '6'] },
    { q: 'The Summer Olympics happen every ___ years', o: ['4', '2', '5', '6'] },
    { q: 'In golf, one under par is a?', o: ['Birdie', 'Eagle', 'Bogey', 'Albatross'] },
    { q: 'A touchdown is worth how many points?', o: ['6', '7', '3', '5'] },
    { q: 'Wimbledon is a tournament for?', o: ['Tennis', 'Golf', 'Cricket', 'Rugby'] },
    { q: 'A marathon is about how long?', o: ['26 miles', '13 miles', '50 miles', '10 miles'] },
  ],
  science: [
    { q: 'The Red Planet is?', o: ['Mars', 'Venus', 'Jupiter', 'Mercury'] },
    { q: 'Water is hydrogen plus?', o: ['Oxygen', 'Nitrogen', 'Carbon', 'Helium'] },
    { q: 'The force pulling you toward Earth is?', o: ['Gravity', 'Magnetism', 'Friction', 'Inertia'] },
    { q: 'Insects have how many legs?', o: ['6', '8', '4', '10'] },
    { q: 'The center of an atom is the?', o: ['Nucleus', 'Electron cloud', 'Neutrino', 'Molecule'] },
    { q: 'Plants breathe in which gas?', o: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'] },
    { q: 'Sound travels fastest through?', o: ['Solids', 'Air', 'Water', 'A vacuum'] },
    { q: 'Water freezes at what °C?', o: ['0', '32', '100', '-10'] },
    { q: 'The closest star to Earth is?', o: ['The Sun', 'Polaris', 'Alpha Centauri', 'Sirius'] },
    { q: 'Diamonds are made of?', o: ['Carbon', 'Gold', 'Silicon', 'Iron'] },
  ],
  games: [
    { q: "Mario's brother is?", o: ['Luigi', 'Wario', 'Toad', 'Yoshi'] },
    { q: 'In Minecraft, what hisses then explodes?', o: ['Creeper', 'Zombie', 'Skeleton', 'Enderman'] },
    { q: 'Pac-Man runs from?', o: ['Ghosts', 'Robots', 'Snakes', 'Aliens'] },
    { q: 'Sonic collects?', o: ['Rings', 'Coins', 'Stars', 'Gems'] },
    { q: 'Mario usually rescues Princess…?', o: ['Peach', 'Zelda', 'Daisy', 'Rosalina'] },
    { q: 'Link is the hero of?', o: ['The Legend of Zelda', 'Final Fantasy', 'Halo', 'Metroid'] },
    { q: 'Tetris pieces are made of how many squares?', o: ['4', '3', '5', '6'] },
    { q: 'Pikachu is what type?', o: ['Electric', 'Fire', 'Water', 'Grass'] },
    { q: "Fortnite's shrinking zone is the?", o: ['Storm', 'Fog', 'Ring', 'Void'] },
    { q: 'Kirby beats enemies by?', o: ['Inhaling them', 'Punching them', 'Freezing them', 'Racing them'] },
  ],
  animals: [
    { q: 'The tallest animal is the?', o: ['Giraffe', 'Elephant', 'Ostrich', 'Moose'] },
    { q: 'Spiders have how many legs?', o: ['8', '6', '10', '12'] },
    { q: 'A baby dog is a?', o: ['Puppy', 'Cub', 'Kit', 'Foal'] },
    { q: 'The fastest land animal is the?', o: ['Cheetah', 'Lion', 'Horse', 'Greyhound'] },
    { q: 'The largest animal ever is the?', o: ['Blue whale', 'Elephant', 'T. rex', 'Great white shark'] },
    { q: 'Bees are famous for making?', o: ['Honey', 'Milk', 'Silk', 'Butter'] },
    { q: 'A group of lions is a?', o: ['Pride', 'Pack', 'Herd', 'Flock'] },
    { q: 'Wild penguins mostly live in the?', o: ['Southern Hemisphere', 'Arctic', 'Sahara', 'Amazon'] },
    { q: 'An octopus has how many arms?', o: ['8', '6', '10', '4'] },
    { q: 'Which animal often sleeps standing up?', o: ['Horse', 'Cat', 'Dog', 'Pig'] },
  ],
};

export default {
  id: 'trivia', name: 'Trivia Triathlon', icon: '🏆',
  desc: '3 categories, 3 questions each, then a bonus. Tap to answer.',
  howto: {
    goal: 'Three random categories, three questions each — then a BONUS question worth 2 from any category. TAP the box with the right answer before the timer runs out. Most points wins.',
    touch: 'TAP the answer box',
    keys: 'CLICK the answer box',
    tip: 'One shot per question — the correct answer flashes green either way, so at least you learn something.',
  },
  create(ctx) { return new TriviaGame(ctx); }
};

const hashSeed = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

/* build a 10-question run: 3 cats × 3 + 1 bonus (any cat, no repeated question) */
function buildRun(seed) {
  const rng = mulberry32(seed);
  const shuffled = CATS.map(c => c[0]);
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const cats3 = shuffled.slice(0, 3);
  const used = {};
  const pick = cat => {
    if (!used[cat]) {
      const idx = BANK[cat].map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      used[cat] = idx;
    }
    const qi = used[cat].pop();
    const src = BANK[cat][qi];
    // shuffle options, remember where the correct one landed
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return { cat, q: src.q, opts: order.map(k => src.o[k]), ans: order.indexOf(0) };
  };
  const qs = [];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) qs.push({ ...pick(cats3[r]), round: r + 1, bonus: false });
  const bonusCat = CATS[Math.floor(rng() * CATS.length)][0];
  qs.push({ ...pick(bonusCat), round: 4, bonus: true });
  return { cats3, qs };
}

class TriviaGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.practice = !!ctx.practice;
    this.online = !!ctx.net && !this.practice;
    const locals = ctx.players.filter(p => p.local && !p.bot);
    this.hotseat = !this.practice && locals.length > 1;
    this.queue = this.practice ? [locals[0]] : [...locals];
    this.remotes = this.online ? ctx.players.filter(p => !p.local && !p.bot) : [];
    this.remoteLive = {};
    this.results = [];
    this.runnerIdx = 0;
    // bots: per-question correctness precomputed, revealed over time
    this.bots = (this.practice ? [] : ctx.players.filter(p => p.bot)).map(b => {
      const bh = hashSeed(b.id), rng = mulberry32((ctx.seed ^ bh) >>> 0);
      const evs = []; let t = 4;
      for (let i = 0; i < 10; i++) { evs.push({ t, pts: rng() < 0.55 ? (i === 9 ? 2 : 1) : 0 }); t += 5 + rng() * 5; }
      return { p: b, evs, n: 0, i: 0 };
    });
    if (ctx.onNet) ctx.onNet((t, p) => { if (t === 'g' && p.k === 'sc') this.remoteLive[p.id] = p; });
    this.clicks = [];
    this._pd = e => { this.clicks.push([e.clientX, e.clientY]); };
    ctx.cv.addEventListener('pointerdown', this._pd);
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
    // hot-seat gets fresh questions per player (no spoilers from watching)
    const seed = (this.ctx.seed + (this.hotseat ? this.runnerIdx * 7919 : 0)) >>> 0;
    this.run = buildRun(this.practice ? ((Math.random() * 1e6) | 0) : seed);
    this.runnerIdx++;
    this.qi = -1; this.score = 0; this.runT = 0;
    this.picked = -1;
    for (const b of this.bots) { b.n = 0; b.i = 0; }
    this.clicks.length = 0;
    this.nextQ();
  }
  nextQ() {
    this.qi++;
    if (this.qi >= this.run.qs.length) {
      if (this.practice) { this.startRun(); return; }
      this.results.push({
        id: this.runner.id, score: this.score, label: this.score + ' pts',
        name: this.runner.name, color: this.runner.color,
      });
      if (this.online) this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.score, done: true });
      this.nextRunner();
      return;
    }
    const q = this.run.qs[this.qi];
    const newRound = this.qi === 0 || q.round !== this.run.qs[this.qi - 1].round;
    this.state = newRound ? 'banner' : 'q';
    this.stateT = 0; this.qT = 0; this.picked = -1;
    if (newRound) this.ctx.audio.sfx.zone();
  }
  catLabel(id) { return CATS.find(c => c[0] === id)[1]; }
  cells() {
    const { W, H } = this.ctx.dim;
    const gy = H * 0.3, gap = Math.min(W, H) * 0.015;
    const cw = (W - gap * 3) / 2, ch = (H - gy - gap * 3) / 2;
    const out = [];
    for (let i = 0; i < 4; i++) {
      const cx2 = i % 2, cy2 = Math.floor(i / 2);
      out.push({ x: gap + cx2 * (cw + gap), y: gy + gap + cy2 * (ch + gap), w: cw, h: ch });
    }
    return out;
  }
  update(rdt) {
    this.tt += rdt; this.stateT += rdt;
    if (this.state === 'ready') {
      const inp = this.ctx.input(this.runner.slot, rdt);
      const tapped = this.clicks.length > 0; this.clicks.length = 0;
      if ((inp.act || tapped || (this.online && this.stateT > 3)) && this.stateT > 0.5) { this.runT = 0; this.startRun(); }
      return;
    }
    if (this.state === 'wait') {
      let allDone = true;
      for (const r of this.remotes) { const s = this.remoteLive[r.id]; if (!s || !s.done) allDone = false; }
      if (!this.online || allDone || this.stateT > 12) {
        for (const r of this.remotes) {
          const s = this.remoteLive[r.id];
          this.results.push({ id: r.id, score: s ? s.n : 0, label: (s ? s.n : 0) + ' pts', name: r.name, color: r.color });
        }
        for (const bt of this.bots)
          this.results.push({ id: bt.p.id, score: bt.n, label: bt.n + ' pts', name: bt.p.name, color: bt.p.color });
        this.ctx.end(this.results);
      }
      return;
    }
    this.runT += rdt;
    for (const bt of this.bots)
      while (bt.i < bt.evs.length && bt.evs[bt.i].t <= this.runT) { bt.n += bt.evs[bt.i].pts; bt.i++; }
    if (this.state === 'banner') {
      this.clicks.length = 0;
      if (this.stateT > 1.7) { this.state = 'q'; this.stateT = 0; this.qT = 0; }
    } else if (this.state === 'q') {
      this.qT += rdt;
      const q = this.run.qs[this.qi];
      if (this.clicks.length) {
        const cs = this.cells();
        for (const [px, py] of this.clicks) {
          for (let i = 0; i < 4; i++) {
            const c = cs[i];
            if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) {
              this.picked = i;
              const right = i === q.ans;
              if (right) { this.score += q.bonus ? 2 : 1; this.ctx.audio.sfx.coin(6); }
              else this.ctx.audio.sfx.hit();
              this.state = 'reveal'; this.stateT = 0;
              if (this.online) this.ctx.net.send('g', { k: 'sc', id: this.runner.id, n: this.score, done: false });
              break;
            }
          }
          if (this.state === 'reveal') break;
        }
        this.clicks.length = 0;
      }
      if (this.state === 'q' && this.qT >= Q_TIME) { this.picked = -1; this.state = 'reveal'; this.stateT = 0; this.ctx.audio.sfx.wall(); }
    } else if (this.state === 'reveal') {
      this.clicks.length = 0;
      if (this.stateT > 1.3) this.nextQ();
    }
    this.ctx.audio.setMusicIntensity(0.4 + (this.run && this.run.qs[this.qi] && this.run.qs[this.qi].bonus ? 0.25 : 0.1));
  }

  render() {
    const g = this.ctx.g, { W, H } = this.ctx.dim;
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#241a38'); grd.addColorStop(1, '#0e0a1a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    if (this.state === 'ready' || !this.run) {
      g.textAlign = 'center'; g.fillStyle = this.runner ? this.runner.color : '#ffd23f';
      g.font = '900 34px system-ui';
      if (this.runner) {
        g.fillText(this.runner.name, W / 2, H * 0.4);
        g.fillStyle = '#ffeccf'; g.font = '800 20px system-ui';
        g.fillText('GET READY — tap anywhere', W / 2, H * 0.4 + 40);
        if (this.results.length) {
          g.font = '700 15px system-ui'; g.fillStyle = '#93a0bd';
          g.fillText('so far: ' + this.results.map(r => r.name + ' ' + r.score).join(' · '), W / 2, H * 0.4 + 80);
        }
      }
      return;
    }
    if (this.state === 'wait') {
      g.textAlign = 'center'; g.fillStyle = '#ffeccf'; g.font = '800 22px system-ui';
      g.fillText(this.online ? 'waiting for the other contestants…' : 'tallying…', W / 2, H * 0.45);
      return;
    }
    const q = this.run.qs[this.qi];
    if (this.state === 'banner') {
      g.textAlign = 'center';
      g.fillStyle = '#93a0bd'; g.font = '800 20px system-ui';
      g.fillText(q.bonus ? '⭐ BONUS QUESTION ⭐' : 'ROUND ' + q.round + ' of 3', W / 2, H * 0.4);
      g.fillStyle = '#ffd23f'; g.font = '900 ' + Math.round(Math.min(44, W * 0.09)) + 'px system-ui';
      g.fillText(this.catLabel(q.cat), W / 2, H * 0.48);
      if (q.bonus) { g.fillStyle = '#ffeccf'; g.font = '800 17px system-ui'; g.fillText('worth 2 points!', W / 2, H * 0.55); }
      return;
    }
    // header
    g.textAlign = 'center';
    g.fillStyle = '#93a0bd'; g.font = '800 13px system-ui';
    g.fillText(this.catLabel(q.cat) + '  ·  Q' + (this.qi + 1) + '/10' + (q.bonus ? '  ·  ⭐ 2 PTS' : ''), W / 2, H * 0.045);
    // question text (wrap to 2 lines if long)
    g.fillStyle = '#ffeccf';
    const qFont = Math.round(Math.min(30, W * 0.062));
    g.font = '900 ' + qFont + 'px "Segoe UI",system-ui';
    const words = q.q.split(' ');
    let line1 = '', line2 = '';
    for (const w of words) { if (line2 || g.measureText(line1 + ' ' + w).width > W * 0.92) line2 += (line2 ? ' ' : '') + w; else line1 += (line1 ? ' ' : '') + w; }
    g.fillText(line1, W / 2, H * 0.115);
    if (line2) g.fillText(line2, W / 2, H * 0.115 + qFont * 1.18);
    // timer bar
    const tw = Math.min(320, W * 0.64), tf = this.state === 'q' ? clamp(1 - this.qT / Q_TIME, 0, 1) : 0;
    g.fillStyle = 'rgba(20,26,40,0.7)'; g.fillRect(W / 2 - tw / 2, H * 0.235, tw, 8);
    g.fillStyle = tf < 0.3 ? '#ff5f5f' : '#ffd23f';
    g.fillRect(W / 2 - tw / 2, H * 0.235, tw * tf, 8);
    // score + rivals
    g.textAlign = 'left'; g.font = '800 16px system-ui'; g.fillStyle = '#ffd23f';
    g.fillText(this.practice ? 'PRACTICE' : '★ ' + this.score, 14, 26);
    if (!this.practice && (this.bots.length || this.remotes.length)) {
      g.textAlign = 'right'; g.font = '700 13px system-ui';
      let yy = 26;
      for (const bt of this.bots) { g.fillStyle = bt.p.color; g.fillText(bt.p.name + ' ' + bt.n, W - 14, yy); yy += 17; }
      for (const r of this.remotes) { const s = this.remoteLive[r.id]; g.fillStyle = r.color; g.fillText(r.name + ' ' + (s ? s.n : 0), W - 14, yy); yy += 17; }
    }
    // answer boxes
    const cs = this.cells(), reveal = this.state === 'reveal';
    for (let i = 0; i < 4; i++) {
      const c = cs[i], r = Math.min(c.w, c.h) * 0.09;
      let fill = PADCOL[i];
      if (reveal) {
        if (i === q.ans) fill = '#3a9d5c';
        else if (i === this.picked) fill = '#e04040';
        else fill = '#3a3450';
      }
      g.fillStyle = fill;
      g.globalAlpha = reveal && i !== q.ans && i !== this.picked ? 0.5 : 1;
      g.beginPath();
      g.moveTo(c.x + r, c.y); g.arcTo(c.x + c.w, c.y, c.x + c.w, c.y + c.h, r);
      g.arcTo(c.x + c.w, c.y + c.h, c.x, c.y + c.h, r); g.arcTo(c.x, c.y + c.h, c.x, c.y, r);
      g.arcTo(c.x, c.y, c.x + c.w, c.y, r); g.closePath();
      g.fill();
      g.lineWidth = 5; g.strokeStyle = '#14100a'; g.stroke();
      g.fillStyle = '#fff';
      const maxW = c.w * 0.9;
      let fs = Math.round(Math.min(c.h * 0.24, c.w * 0.14));
      g.font = '900 ' + fs + 'px system-ui';
      while (fs > 11 && g.measureText(q.opts[i]).width > maxW) { fs -= 1; g.font = '900 ' + fs + 'px system-ui'; }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(q.opts[i], c.x + c.w / 2, c.y + c.h / 2);
      g.textBaseline = 'alphabetic';
    }
    g.globalAlpha = 1;
    if (reveal) {
      g.textAlign = 'center'; g.font = '900 30px system-ui';
      const right = this.picked === q.ans;
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,4,0.9)';
      const msg = this.picked < 0 ? "TIME'S UP!" : right ? (q.bonus ? '+2!' : 'CORRECT!') : 'NOPE!';
      g.strokeText(msg, W / 2, H * 0.28);
      g.fillStyle = this.picked < 0 ? '#93a0bd' : right ? '#7dff6a' : '#ff5f5f';
      g.fillText(msg, W / 2, H * 0.28);
    }
  }
  dispose() { this.ctx.cv.removeEventListener('pointerdown', this._pd); }
}
