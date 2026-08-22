// TRIVIA TRIATHLON — 3 random categories × 3 questions each, then a bonus
// question (worth 2) from any category. Tap the answer box. Most points wins.
import { clamp, mulberry32 } from '../util.js';

const Q_TIME = 12, PADCOL = ['#4d9de0', '#e04040', '#3a9d5c', '#9d5cd0'];
const CATS = [
  ['movies', '🎬 Movies'], ['tv', '📺 TV'], ['music', '🎵 Music'], ['history', '🏛️ History'],
  ['sports', '🏈 Sports'], ['science', '🔬 Science'], ['games', '🎮 Video Games'], ['animals', '🐾 Animals']];
// first option is always the correct one; shuffled per game.
// Pub-quiz calibre: universal, evergreen, mixed difficulty (anchors + stumpers).
const BANK = {
  movies: [
    { q: 'Who directed Jaws, E.T., AND Jurassic Park?', o: ['Steven Spielberg', 'Martin Scorsese', 'Francis Ford Coppola', 'Robert Zemeckis'] },
    { q: 'The DeLorean in Back to the Future needs how many gigawatts?', o: ['1.21', '88', '42', '3.14'] },
    { q: '"I see dead people" is from which film?', o: ['The Sixth Sense', 'The Matrix', 'Fight Club', 'The Shining'] },
    { q: "Darth Vader's real name is?", o: ['Anakin Skywalker', 'Ben Solo', 'Sheev Palpatine', 'Obi-Wan Kenobi'] },
    { q: 'Rocky Balboa runs up the museum steps in which city?', o: ['Philadelphia', 'Boston', 'New York', 'Chicago'] },
    { q: 'What does Indiana Jones famously hate?', o: ['Snakes', 'Spiders', 'Heights', 'Nazis in museums'] },
    { q: 'In The Wizard of Oz, the Cowardly Lion wants?', o: ['Courage', 'A heart', 'A brain', 'A way home'] },
    { q: 'The crew of Jaws nicknamed the mechanical shark?', o: ['Bruce', 'Jaws', 'Big Blue', 'Chomper'] },
    { q: 'Forrest Gump: "Life is like a box of ___"', o: ['Chocolates', 'Surprises', 'Crayons', 'Matches'] },
    { q: "In Pixar's Up, the house is lifted by?", o: ['Balloons', 'A tornado', 'Cranes', 'Geese'] },
    { q: 'The Godfather centers on which crime family?', o: ['Corleone', 'Soprano', 'Capone', 'Barzini'] },
    { q: 'Which movie musical features the von Trapp family?', o: ['The Sound of Music', 'Mary Poppins', 'Oliver!', 'Annie'] },
    { q: 'Elijah Wood carries the One Ring as?', o: ['Frodo', 'Bilbo', 'Sam', 'Pippin'] },
    { q: 'Grease is set in which decade?', o: ['1950s', '1960s', '1970s', '1940s'] },
  ],
  tv: [
    { q: 'The Office (US) is set in which Pennsylvania city?', o: ['Scranton', 'Pittsburgh', 'Philadelphia', 'Allentown'] },
    { q: 'In Breaking Bad, Walter White starts out as a?', o: ['Chemistry teacher', 'Pharmacist', 'Police officer', 'Car dealer'] },
    { q: 'The Iron Throne in Game of Thrones is made of?', o: ['Swords', 'Stone', 'Gold', 'Dragon bones'] },
    { q: 'SpongeBob flips burgers at the?', o: ['Krusty Krab', 'Chum Bucket', 'Salty Spitoon', 'Rusty Anchor'] },
    { q: 'Homer Simpson works at a?', o: ['Nuclear power plant', 'Brewery', 'Bowling alley', 'Post office'] },
    { q: 'Sherlock Holmes lives at 221B ___ Street', o: ['Baker', 'Bond', 'Fleet', 'Abbey'] },
    { q: 'In Seinfeld, Kramer lives?', o: ['Across the hall', 'Upstairs', 'In the basement', 'Next door'] },
    { q: "Joey's famous line in Friends is?", o: ['"How you doin\'?"', '"Bazinga!"', '"That\'s what she said"', '"D\'oh!"'] },
    { q: 'The parallel dimension in Stranger Things is?', o: ['The Upside Down', 'The Void', 'The Nether', 'The Shadowlands'] },
    { q: "Doctor Who's time machine looks like a?", o: ['Police box', 'Phone booth', 'Elevator', 'Train car'] },
    { q: 'Squid Game came from which country?', o: ['South Korea', 'Japan', 'China', 'Thailand'] },
    { q: 'M*A*S*H is set during which war?', o: ['Korean War', 'Vietnam War', 'World War II', 'Gulf War'] },
    { q: 'The Mandalorian protects a child of whose species?', o: ["Yoda's", 'Chewbacca\'s', 'Jabba\'s', 'An Ewok\'s'] },
    { q: 'Which family lives at 742 Evergreen Terrace?', o: ['The Simpsons', 'The Griffins', 'The Flintstones', 'The Bradys'] },
  ],
  music: [
    { q: 'Which composer kept writing symphonies after going deaf?', o: ['Beethoven', 'Mozart', 'Handel', 'Haydn'] },
    { q: '"Bohemian Rhapsody" is by?', o: ['Queen', 'The Beatles', 'Led Zeppelin', 'ABBA'] },
    { q: 'A full piano has how many keys?', o: ['88', '76', '100', '64'] },
    { q: "Elvis Presley's mansion is called?", o: ['Graceland', 'Neverland', 'Dollywood', 'Sun Studio'] },
    { q: 'Bob Marley made which genre famous worldwide?', o: ['Reggae', 'Ska', 'Salsa', 'Blues'] },
    { q: 'The Nutcracker was composed by?', o: ['Tchaikovsky', 'Stravinsky', 'Bach', 'Vivaldi'] },
    { q: 'Singing "a cappella" means?', o: ['Without instruments', 'In Latin', 'At full volume', 'In falsetto'] },
    { q: 'Which instrument has around 47 strings and 7 pedals?', o: ['Harp', 'Cello', 'Sitar', 'Grand piano'] },
    { q: "The Beatles' drummer was?", o: ['Ringo Starr', 'Paul McCartney', 'John Lennon', 'George Harrison'] },
    { q: '"The King of Pop" is?', o: ['Michael Jackson', 'Elvis Presley', 'Prince', 'Freddie Mercury'] },
    { q: 'In sheet music, "forte" means play?', o: ['Loud', 'Soft', 'Fast', 'Slow'] },
    { q: 'Mozart began composing at about age?', o: ['5', '15', '21', '30'] },
    { q: 'A violin has how many strings?', o: ['4', '6', '5', '8'] },
    { q: 'Taylor Swift\'s re-recorded albums are labeled?', o: ["(Taylor's Version)", '(Redux)', '(Vol. 2)', '(Remastered)'] },
  ],
  history: [
    { q: 'Who was first to walk on the Moon?', o: ['Neil Armstrong', 'Buzz Aldrin', 'Yuri Gagarin', 'John Glenn'] },
    { q: 'The Berlin Wall fell in?', o: ['1989', '1979', '1991', '1961'] },
    { q: 'Napoleon was finally defeated at?', o: ['Waterloo', 'Trafalgar', 'Austerlitz', 'Normandy'] },
    { q: 'Cleopatra ruled which kingdom?', o: ['Egypt', 'Greece', 'Persia', 'Rome'] },
    { q: 'World War II ended in?', o: ['1945', '1939', '1942', '1950'] },
    { q: 'The Inca Empire was centered in modern-day?', o: ['Peru', 'Mexico', 'Brazil', 'Chile'] },
    { q: 'Who painted the Sistine Chapel ceiling?', o: ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Donatello'] },
    { q: 'The Pilgrims sailed to America on the?', o: ['Mayflower', 'Santa Maria', 'Beagle', 'Endeavour'] },
    { q: 'Genghis Khan founded which empire?', o: ['Mongol', 'Ottoman', 'Roman', 'Ming'] },
    { q: 'The Cold War pitted the USA mainly against?', o: ['The Soviet Union', 'China', 'Germany', 'Japan'] },
    { q: 'Mount Vesuvius buried which Roman city?', o: ['Pompeii', 'Athens', 'Carthage', 'Troy'] },
    { q: 'The Magna Carta was signed in which country?', o: ['England', 'France', 'Spain', 'Italy'] },
    { q: 'Egyptian kings were called?', o: ['Pharaohs', 'Czars', 'Sultans', 'Shoguns'] },
    { q: 'The Great Pyramid stands at?', o: ['Giza', 'Luxor', 'Cairo\'s old town', 'Alexandria'] },
  ],
  sports: [
    { q: 'The FIFA World Cup is held every?', o: ['4 years', '2 years', '3 years', '5 years'] },
    { q: 'A perfect game in bowling scores?', o: ['300', '200', '100', '500'] },
    { q: 'Which country invented judo?', o: ['Japan', 'China', 'Korea', 'Brazil'] },
    { q: 'The Tour de France is raced on?', o: ['Bicycles', 'Motorcycles', 'Horses', 'Foot'] },
    { q: 'A hat-trick is how many goals by one player?', o: ['3', '2', '4', '5'] },
    { q: 'Olympic gold medals are mostly made of?', o: ['Silver', 'Gold', 'Bronze', 'Steel'] },
    { q: 'Muhammad Ali was the champion of?', o: ['Boxing', 'Wrestling', 'Karate', 'Fencing'] },
    { q: 'The Super Bowl trophy is named after coach?', o: ['Vince Lombardi', 'George Halas', 'John Madden', 'Don Shula'] },
    { q: 'Cricket is the biggest sport in?', o: ['India', 'USA', 'Russia', 'France'] },
    { q: 'The marathon honors a legendary run in ancient?', o: ['Greece', 'Rome', 'Egypt', 'Persia'] },
    { q: 'Serena Williams dominated which sport?', o: ['Tennis', 'Golf', 'Soccer', 'Track'] },
    { q: 'In soccer, the keeper may use hands only in the?', o: ['Penalty area', 'Center circle', 'Whole half', 'Corner arc'] },
    { q: 'An NBA game has how many quarters?', o: ['4', '2', '3', '6'] },
    { q: 'Wimbledon is played on?', o: ['Grass', 'Clay', 'Hardcourt', 'Carpet'] },
  ],
  science: [
    { q: 'The chemical symbol for gold is?', o: ['Au', 'Ag', 'Go', 'Gd'] },
    { q: 'The "powerhouse of the cell" is the?', o: ['Mitochondria', 'Nucleus', 'Ribosome', 'Chloroplast'] },
    { q: 'Which planet has the famous rings?', o: ['Saturn', 'Jupiter', 'Neptune', 'Uranus'] },
    { q: 'DNA is shaped like a?', o: ['Double helix', 'Straight chain', 'Sphere', 'Zigzag'] },
    { q: 'An adult human has how many bones?', o: ['206', '300', '150', '250'] },
    { q: "Most of Earth's atmosphere is?", o: ['Nitrogen', 'Oxygen', 'Carbon dioxide', 'Hydrogen'] },
    { q: "Einstein's famous equation is E = ?", o: ['mc²', 'mv²', 'hf', 'mgh'] },
    { q: 'The largest planet in our solar system is?', o: ['Jupiter', 'Saturn', 'Neptune', 'Earth'] },
    { q: 'Lightning is hotter than the surface of the?', o: ['Sun', 'Moon', 'Earth\'s core', 'A volcano'] },
    { q: 'Bees collect what from flowers?', o: ['Nectar', 'Honey', 'Sap', 'Dew'] },
    { q: 'The universal blood donor type is?', o: ['O negative', 'AB positive', 'A positive', 'B negative'] },
    { q: 'Sound travels fastest through?', o: ['Solids', 'Air', 'Water', 'A vacuum'] },
    { q: 'Light travels about 300,000 ___ per second', o: ['Kilometers', 'Miles', 'Meters', 'Feet'] },
    { q: 'Diamonds are pure?', o: ['Carbon', 'Quartz', 'Silicon', 'Calcium'] },
  ],
  games: [
    { q: 'Which company makes the PlayStation?', o: ['Sony', 'Microsoft', 'Nintendo', 'Sega'] },
    { q: 'Tetris was invented in which country?', o: ['Soviet Union (Russia)', 'Japan', 'USA', 'Germany'] },
    { q: '"The cake is a lie" comes from?', o: ['Portal', 'Half-Life', 'BioShock', 'Fallout'] },
    { q: 'Master Chief is the hero of?', o: ['Halo', 'Doom', 'Destiny', 'Gears of War'] },
    { q: 'The currency in Zelda games is?', o: ['Rupees', 'Coins', 'Gil', 'Bells'] },
    { q: "Pac-Man's ghosts: Blinky, Pinky, Inky and…?", o: ['Clyde', 'Stinky', 'Winky', 'Bob'] },
    { q: 'Animal Crossing\'s money is called?', o: ['Bells', 'Bucks', 'Bones', 'Beads'] },
    { q: 'The best-selling video game of all time is?', o: ['Minecraft', 'Tetris', 'GTA V', 'Wii Sports'] },
    { q: 'Lara Croft is famous as a?', o: ['Tomb-raiding archaeologist', 'Fighter pilot', 'Spy', 'Chemist'] },
    { q: "Mario's dinosaur companion is?", o: ['Yoshi', 'Toad', 'Birdo', 'Koopa'] },
    { q: 'In Among Us, crewmates hunt the?', o: ['Impostor', 'Ghost', 'Traitor', 'Alien'] },
    { q: "Minecraft's creator went by the nickname?", o: ['Notch', 'Steve', 'Herobrine', 'Jeb'] },
    { q: 'Sonic the Hedgehog is what color?', o: ['Blue', 'Red', 'Green', 'Purple'] },
    { q: 'Which console popularized motion-control bowling?', o: ['Nintendo Wii', 'Xbox 360', 'PlayStation 3', 'GameCube'] },
  ],
  animals: [
    { q: 'An octopus has how many hearts?', o: ['3', '1', '2', '8'] },
    { q: 'The only mammal that can truly fly is the?', o: ['Bat', 'Flying squirrel', 'Sugar glider', 'Colugo'] },
    { q: 'A group of crows is called a?', o: ['Murder', 'Gaggle', 'Parliament', 'Swarm'] },
    { q: 'The fastest bird in a dive is the?', o: ['Peregrine falcon', 'Golden eagle', 'Osprey', 'Swift'] },
    { q: 'An elephant pregnancy lasts about?', o: ['22 months', '9 months', '12 months', '30 months'] },
    { q: "Which animal's fingerprints look almost human?", o: ['Koala', 'Chimpanzee', 'Gorilla', 'Raccoon'] },
    { q: "A rhino's horn is made of?", o: ['Keratin (like fingernails)', 'Bone', 'Ivory', 'Cartilage'] },
    { q: 'Sharks are older than?', o: ['Trees', 'Fish', 'Jellyfish', 'The oceans'] },
    { q: 'The loudest animal on Earth is the?', o: ['Sperm whale', 'Lion', 'Howler monkey', 'Elephant'] },
    { q: 'Gentoo penguins court mates with a?', o: ['Pebble', 'Fish', 'Feather', 'Dance'] },
    { q: 'A lobster has how many legs?', o: ['10', '8', '6', '12'] },
    { q: "A camel's hump stores?", o: ['Fat', 'Water', 'Milk', 'Food'] },
    { q: 'Which big cat cannot roar?', o: ['Cheetah', 'Lion', 'Tiger', 'Jaguar'] },
    { q: 'A baby kangaroo is called a?', o: ['Joey', 'Cub', 'Calf', 'Pup'] },
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
