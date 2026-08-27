// Divers Arcade shell: home → lobby → game(s) → results.
// "Board Game" mode = gauntlet of all minigames with placement points (real board TBD).
// bump ?v= on any module edit — defeats stale module caches (embedded webviews, PWAs)
import { clamp, lsGet, lsSet, uid, mulberry32, PLAYER_COLORS } from './util.js?v=15';
import * as audio from './audio.js?v=15';
import { getInput, attachTouch, clearTouch, ctl, setCtl, askTiltPerm, calibrateTilt, tiltStatus, setTiltOrient, getTiltOrient } from './input.js?v=15';
import { Net, makeRoomCode } from './net.js?v=15';
import tunnel from './games/tunnel.js?v=15';
import stack from './games/stack.js?v=15';
import crown from './games/crown.js?v=15';
import brain from './games/brain.js?v=15';
import blast from './games/blast.js?v=15';
import food from './games/food.js?v=15';
import homerun from './games/homerun.js?v=15';
import trivia from './games/trivia.js?v=15';
import ghost from './games/ghost.js?v=15';
import greed from './games/greed.js?v=15';
import lava from './games/lava.js?v=15';
import { createBoard } from './board.js?v=15';

const GAMES = { tunnel, stack, crown, brain, blast, food, homerun, trivia, ghost, greed, lava };
const MODES = [
  { id: 'party', name: 'Board Game', icon: '🎲', desc: 'THE CHAOTIC BOARDWALK — dice, coins, shops, piñatas, item cards, cosmetic steals… and a minigame every turn. Highest coins+cosmetics wins.' },
  { id: 'tunnel', name: tunnel.name, icon: tunnel.icon, desc: tunnel.desc },
  { id: 'stack', name: stack.name, icon: stack.icon, desc: stack.desc },
  { id: 'crown', name: crown.name, icon: crown.icon, desc: crown.desc },
  { id: 'brain', name: brain.name, icon: brain.icon, desc: brain.desc },
  { id: 'blast', name: blast.name, icon: blast.icon, desc: blast.desc },
  { id: 'food', name: food.name, icon: food.icon, desc: food.desc },
  { id: 'homerun', name: homerun.name, icon: homerun.icon, desc: homerun.desc },
  { id: 'trivia', name: trivia.name, icon: trivia.icon, desc: trivia.desc },
  { id: 'ghost', name: ghost.name, icon: ghost.icon, desc: ghost.desc },
  { id: 'greed', name: greed.name, icon: greed.icon, desc: greed.desc },
  { id: 'lava', name: lava.name, icon: lava.icon, desc: lava.desc },
];

const $ = id => document.getElementById(id);
const cv = $('game'), g = cv.getContext('2d');
const dim = { W: 0, H: 0, V: 1 };
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  dim.W = window.innerWidth; dim.H = window.innerHeight; dim.V = Math.min(dim.W, dim.H) / 700;
  cv.width = Math.round(dim.W * dpr); cv.height = Math.round(dim.H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // canvas paints under the notch — HUDs offset by the real safe areas
  const probe = document.getElementById('safeProbe');
  if (probe) {
    const cs = getComputedStyle(probe);
    dim.safeTop = parseFloat(cs.paddingTop) || 0;
    dim.safeBottom = parseFloat(cs.paddingBottom) || 0;
  } else { dim.safeTop = 0; dim.safeBottom = 0; }
}
addEventListener('resize', resize); addEventListener('orientationchange', resize);
resize(); attachTouch(cv);

/* ---------------- app state ---------------- */
const S = {
  screen: 'home',
  profile: { name: lsGet('td_name') || 'DIVER', color: PLAYER_COLORS[0] },
  mode: 'party',
  locals: [],          // [{id,name,color,local:true,slot,bot}]
  net: null, code: null,
  inst: null,          // running game instance
  gauntlet: null,      // {rounds:[modeIds], round, pts:Map, seed}
  lastResults: null,
  gameNet: null,       // active game's net message handler
  pending: null,       // {gameId,seed,players} awaiting ready-up
  readySet: {},        // playerId -> true during intro
  countdown: 0,
};
$('nameIn').value = S.profile.name === 'DIVER' ? '' : S.profile.name;
$('nameIn').addEventListener('change', () => {
  S.profile.name = ($('nameIn').value.trim() || 'DIVER').slice(0, 12);
  lsSet('td_name', S.profile.name);
});

function show(scr) {
  S.screen = scr;
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('show'));
  const map = { home: 'scrHome', set: 'scrSet', lobby: 'scrLobby', results: 'scrResults' };
  if (map[scr]) $(map[scr]).classList.add('show');
  $('btnQuit').style.display = scr === 'game' ? 'block' : 'none';
}

/* ---------------- lobby ---------------- */
function resetLocals() {
  S.locals = [{ id: 'L0', name: S.profile.name, color: S.profile.color, local: true, slot: 0, bot: false }];
}
function lobbyPlayers() {
  if (!S.net) return S.locals;
  // deterministic shared ordering: self + peers, sorted by net id
  const rows = [{ nid: S.net.selfId, name: S.profile.name }];
  for (const pid in S.net.peers) rows.push({ nid: pid, name: (S.net.peers[pid] || {}).name || 'DIVER' });
  rows.sort((a, b) => a.nid < b.nid ? -1 : 1);
  return rows.map((r, i) => ({
    id: r.nid, name: r.name, color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    local: r.nid === S.net.selfId, slot: 0, bot: false,
  }));
}
function netStatusLine() {
  if (!S.net) return 'same-device party — add players & bots';
  const n = S.net.peerCount(), relays = S.net.relayCount();
  const alone = n === 0, waited = (Date.now() - S.net.joinedAt) / 1000;
  let line = (S.net.isHost ? 'code ' + S.code + ' — share it! ' : '') + (n + 1) + ' in room';
  if (relays >= 0) line += ' · ' + relays + ' relay' + (relays === 1 ? '' : 's');
  if (alone) {
    if (relays === 0 && waited > 5) line = '⚠ can\'t reach the relays — check your connection';
    else if (waited > 20) line = '⚠ nobody found yet — same code on everyone\'s screen? Have friends refresh the page (old versions can\'t join new rooms)';
    else line += ' · 🔎 looking for players…';
  }
  return line;
}
function renderLobby() {
  $('lobbyTitle').textContent = S.net ? 'ROOM ' + S.code : 'PARTY LOBBY';
  $('roomLine').textContent = netStatusLine();
  const list = $('playerList'); list.innerHTML = '';
  const ps = lobbyPlayers();
  ps.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'pRow';
    row.innerHTML = '<span class="pDot" style="background:' + p.color + '"></span>' +
      '<span class="who">' + p.name + (p.local && !S.net ? '' : p.local ? ' (you)' : '') + '</span>' +
      '<span class="sub">' + (p.bot ? 'BOT' : S.net ? 'online' : ('P' + (p.slot + 1) + (p.slot === 0 ? ' · WASD/touch' : ' · arrows'))) + '</span>';
    if (!S.net && i > 0) {
      const del = document.createElement('button');
      del.className = 'btn tiny ghostBtn'; del.textContent = '✕';
      del.addEventListener('click', () => { S.locals.splice(i, 1); renderLobby(); });
      row.appendChild(del);
    }
    list.appendChild(row);
  });
  $('btnAddLocal').style.display = (!S.net && S.locals.filter(p => !p.bot).length < 2) ? '' : 'none';
  $('btnAddBot').style.display = (!S.net && S.locals.length < 4) ? '' : 'none';
  // modes
  const grid = $('modeGrid'); grid.innerHTML = '';
  for (const m of MODES) {
    const b = document.createElement('button');
    b.className = 'modeTile' + (S.mode === m.id ? ' sel' : '');
    b.innerHTML = '<span class="mi">' + m.icon + '</span><div class="mn">' + m.name + '</div><div class="md">' + m.desc + '</div>';
    b.addEventListener('click', () => {
      audio.sfx.ui(); S.mode = m.id;
      if (S.net) S.net.send('mode', { mode: m.id });   // anyone can change (owner-only later)
      renderLobby();
    });
    grid.appendChild(b);
  }
  if (S.mode === 'party') {   // board length selector
    const row = document.createElement('div');
    row.style.gridColumn = '1 / -1';
    row.innerHTML = '<div class="secLbl" style="margin:4px 0 4px">BOARD LENGTH</div>';
    const chips = document.createElement('div'); chips.className = 'chips';
    for (const t of [8, 14, 20]) {
      const c = document.createElement('button');
      c.className = 'cchip' + ((S.boardTurns || 20) === t ? ' sel' : '');
      c.textContent = t + ' turns';
      c.addEventListener('click', () => {
        S.boardTurns = t; audio.sfx.ui();
        if (S.net) S.net.send('turns', { t });   // board length must match on every client
        renderLobby();
      });
      chips.appendChild(c);
    }
    row.appendChild(chips); grid.appendChild(row);
  }
  $('btnStart').disabled = !!(S.net && !S.net.isHost);
  $('btnStart').textContent = S.net && !S.net.isHost ? 'HOST STARTS…' : 'START ▶';
}
$('btnAddLocal').addEventListener('click', () => {
  audio.sfx.ui();
  S.locals.push({ id: 'L' + S.locals.length + uid(), name: 'PLAYER ' + (S.locals.filter(p => !p.bot).length + 1), color: PLAYER_COLORS[S.locals.length], local: true, slot: 1, bot: false });
  renderLobby();
});
$('btnAddBot').addEventListener('click', () => {
  audio.sfx.ui();
  const names = ['CHAD', 'BLINKY', 'MOOSE', 'GARY'];
  S.locals.push({ id: 'B' + uid(), name: names[S.locals.filter(p => p.bot).length % 4], color: PLAYER_COLORS[S.locals.length], local: true, slot: -1, bot: true });
  renderLobby();
});
$('btnLeave').addEventListener('click', () => {
  audio.sfx.ui();
  if (S.net) { S.net.leave(); S.net = null; }
  show('home');
});

/* ---------------- home / rooms ---------------- */
$('btnLocal').addEventListener('click', () => {
  audio.initAudio(); audio.sfx.ui(); askTiltPerm();
  S.profile.name = ($('nameIn').value.trim() || 'DIVER').slice(0, 12); lsSet('td_name', S.profile.name);
  resetLocals(); S.net = null; show('lobby'); renderLobby();
});
async function goOnline(asHost) {
  audio.initAudio(); askTiltPerm();
  S.profile.name = ($('nameIn').value.trim() || 'DIVER').slice(0, 12); lsSet('td_name', S.profile.name);
  const code = asHost ? makeRoomCode() : ($('codeIn').value.trim().toUpperCase());
  if (!asHost && code.length !== 4) { $('netStatus').textContent = 'enter the 4-letter room code first'; return; }
  $('netStatus').textContent = 'connecting…';
  S.net = new Net();
  try {
    await S.net.join(code, { name: S.profile.name }, asHost);
  } catch (e) { $('netStatus').textContent = '⚠ ' + e.message; S.net = null; return; }
  S.code = code; $('netStatus').textContent = '';
  // keep the status line honest while waiting (relay health, hints)
  if (S._lobbyTick) clearInterval(S._lobbyTick);
  S._lobbyTick = setInterval(() => {
    if (S.screen === 'lobby' && S.net) $('roomLine').textContent = netStatusLine();
    else if (!S.net) { clearInterval(S._lobbyTick); S._lobbyTick = null; }
  }, 1500);
  S.net.onPeers = () => { if (S.screen === 'lobby') renderLobby(); };
  S.net.onMsg = (t, p, from) => {
    if (t === 'mode') { S.mode = p.mode; if (S.screen === 'lobby') renderLobby(); }
    else if (t === 'turns') { S.boardTurns = p.t; if (S.screen === 'lobby') renderLobby(); }
    else if (t === 'start') { if (p.turns) S.boardTurns = p.turns; launch(p.mode, p.seed, true); }
    else if (t === 'next' && S.gauntlet) nextRound(true);
    else if (t === 'ready') { S.readySet[p.id] = true; updateIntroUI(); checkAllReady(); }
    else if (t === 'bd' && S.boardObj) S.boardObj.applyAct(p, true);   // board events survive minigames
    else if (S.gameNet) S.gameNet(t, p, from);
  };
  show('lobby'); renderLobby();
}
$('btnHost').addEventListener('click', () => goOnline(true));
$('btnJoin').addEventListener('click', () => goOnline(false));

/* ---------------- settings ---------------- */
function applySetUI() {
  $('ctlTilt').classList.toggle('sel', ctl === 'tilt');
  $('ctlSwipe').classList.toggle('sel', ctl === 'swipe');
  const v = audio.getVols();
  $('volMLbl').textContent = Math.round(v.masterVol * 100) + '%';
  $('volMuLbl').textContent = Math.round(v.musVol * 100) + '%';
  $('tiltStat').textContent = tiltStatus();
}
$('btnSet').addEventListener('click', () => {
  audio.initAudio(); audio.sfx.ui();
  const v = audio.getVols();
  $('volMaster').value = Math.round(v.masterVol * 100);
  $('volMusic').value = Math.round(v.musVol * 100);
  applySetUI(); show('set');
});
$('btnSetClose').addEventListener('click', () => { audio.sfx.ui(); show('home'); });
$('ctlTilt').addEventListener('click', () => { setCtl('tilt'); askTiltPerm(); applySetUI(); audio.sfx.ui(); });
$('ctlSwipe').addEventListener('click', () => { setCtl('swipe'); applySetUI(); audio.sfx.ui(); });
$('volMaster').addEventListener('input', () => { audio.setMasterVol($('volMaster').value / 100); applySetUI(); });
$('volMusic').addEventListener('input', () => { audio.setMusVol($('volMusic').value / 100); applySetUI(); });

/* ---------------- launching games ---------------- */
$('btnStart').addEventListener('click', () => {
  audio.sfx.ui();
  const seed = (Math.random() * 999999 | 0) + 1;
  if (S.net) S.net.send('start', { mode: S.mode, seed, turns: S.boardTurns || 20 });
  launch(S.mode, seed, false);
});
function launch(mode, seed, fromNet) {
  const players = lobbyPlayers();
  if (mode === 'party') startBoard(seed, players);
  else { S.gauntlet = null; startGame(mode, seed, players); }
}
/* -------- THE CHAOTIC BOARDWALK: the board wraps the whole minigame roster -------- */
function startBoard(seed, players) {
  S.gauntlet = null; S.pending = null; S.countdown = 0; S.gameNet = null;
  calibrateTilt(); clearTouch();
  show('game');
  $('introPanel').style.display = 'none';
  S.boardObj = createBoard({
    cv, g, dim, players, seed: seed >>> 0,
    net: S.net, onNet: null,           // board traffic is routed explicitly (survives minigames)
    input: getInput,
    audio: { sfx: audio.sfx, setMusicIntensity: audio.setMusicIntensity },
    maxTurns: S.boardTurns || 20,
    gameIds: Object.keys(GAMES),
    launchMinigame: (gid, sd) => {
      S.boardStash = S.boardObj;       // pause the board; the minigame takes the stage
      startGame(gid, sd, S.boardObj.players.map(p => ({ ...p })));
    },
    end: rows => {
      S.boardObj = null; S.boardStash = null;
      if (S.inst) { S.inst.dispose(); S.inst = null; }
      S.lastResults = { gameId: 'party', rows: rows.sort((a, b) => b.score - a.score) };
      renderResults(); show('results'); audio.sfx.win(); audio.setMusicIntensity(0.3);
    },
  });
  S.inst = S.boardObj;
}
// spec hook: minigame results flow back to the board layer
window.OnMinigameComplete = function (resultsArray, gameId) {
  if (S.boardObj) S.boardObj.onMinigameComplete(resultsArray, gameId);
};
/* Every minigame opens Mario Party-style: a live PRACTICE arena + how-to card;
   all human players ready up, then a 3-2-1 countdown into the real game. */
function startGame(gameId, seed, players) {
  const game = GAMES[gameId];
  calibrateTilt(); clearTouch();
  show('game');
  S.pending = { gameId, seed: seed >>> 0, players };
  S.readySet = {}; S.countdown = 0; S.gameNet = null;
  S.inst = game.create({
    cv, g, dim, players, seed: (seed ^ 0x5EED) >>> 0,
    net: null, onNet: null, practice: true, input: getInput,
    audio: { sfx: audio.sfx, setMusicIntensity: audio.setMusicIntensity },
    end: () => { },
  });
  showIntro(game);
}
function humanPlayers() { return S.pending ? S.pending.players.filter(p => !p.bot) : []; }
function showIntro(game) {
  const h = game.howto || {};
  const touch = 'ontouchstart' in window;
  $('ipIcon').textContent = game.icon;
  $('ipName').textContent = game.name.toUpperCase();
  $('ipGoal').textContent = h.goal || game.desc;
  $('ipCtl').textContent = (touch ? (h.touch || '') : (h.keys || '')) + (h.tip ? ' — ' + h.tip : '');
  $('introPanel').style.display = 'block';
  buildOrientPicker();
  updateIntroUI();
}
// tilt players declare how they're holding the phone before readying up
function buildOrientPicker() {
  const el = $('ipOrient');
  const touch = 'ontouchstart' in window;
  if (!touch || ctl !== 'tilt') { el.style.display = 'none'; return; }
  setTiltOrient(dim.W > dim.H ? 'landscape' : 'portrait');   // sensible default
  el.style.display = 'block';
  const paint = () => {
    const o = getTiltOrient();
    el.innerHTML =
      '<div class="muted" style="font-size:11px;letter-spacing:.1em;font-weight:800;margin-bottom:4px">HOLDING MY PHONE</div>' +
      '<div class="chips" style="justify-content:center">' +
      '<button class="cchip' + (o === 'portrait' ? ' sel' : '') + '" data-or="portrait">📱 PORTRAIT</button>' +
      '<button class="cchip' + (o === 'landscape' ? ' sel' : '') + '" data-or="landscape">📱 LANDSCAPE (rotate now)</button></div>';
    el.querySelectorAll('[data-or]').forEach(b => b.addEventListener('click', () => {
      setTiltOrient(b.dataset.or); audio.sfx.ui(); paint();
    }));
  };
  paint();
}
function updateIntroUI() {
  const row = $('ipReadyRow'); row.innerHTML = '';
  for (const p of humanPlayers()) {
    const ready = !!S.readySet[p.id];
    if (p.local) {
      const b = document.createElement('button');
      b.className = 'btn small' + (ready ? ' ghostBtn' : '');
      b.textContent = ready ? '✓ ' + p.name : (p.slot === 1 ? p.name + ' READY (ENTER)' : p.name + ' — READY?');
      b.style.borderColor = p.color;
      if (!ready) b.addEventListener('click', () => readyUp(p.id));
      row.appendChild(b);
    } else {
      const s = document.createElement('span');
      s.className = 'muted';
      s.textContent = (ready ? '✓ ' : '… ') + p.name;
      row.appendChild(s);
    }
  }
}
function readyUp(id) {
  if (S.readySet[id]) return;
  S.readySet[id] = true;
  audio.sfx.ui();
  if (S.net) S.net.send('ready', { id });
  updateIntroUI(); checkAllReady();
}
addEventListener('keydown', e => {
  if (!S.pending || $('introPanel').style.display === 'none') return;
  if (e.target && e.target.tagName === 'INPUT') return;
  const humans = humanPlayers();
  if (e.code === 'Enter') { const p2 = humans.find(p => p.local && p.slot === 1); if (p2) readyUp(p2.id); }
  if (e.code === 'KeyR') { const p1 = humans.find(p => p.local && p.slot === 0); if (p1) readyUp(p1.id); }
});
function checkAllReady() {
  if (!S.pending) return;
  if (!humanPlayers().every(p => S.readySet[p.id])) return;
  // everyone's in — swap practice out for the real thing behind a countdown
  $('introPanel').style.display = 'none';
  if (S.inst) { S.inst.dispose(); S.inst = null; }
  const { gameId, seed, players } = S.pending;
  S.pending = null;
  calibrateTilt(); clearTouch();
  S.inst = GAMES[gameId].create({
    cv, g, dim, players, seed,
    net: S.net, onNet: fn => { S.gameNet = fn; }, input: getInput,
    audio: { sfx: audio.sfx, setMusicIntensity: audio.setMusicIntensity },
    end: results => onGameEnd(gameId, results),
  });
  S.countdown = 3.5;
}
function onGameEnd(gameId, results) {
  if (S.inst) { S.inst.dispose(); S.inst = null; }
  S.gameNet = null;
  // a board-night minigame: hand results back to the boardwalk, no results screen
  if (S.boardStash) {
    const board = S.boardStash; S.boardStash = null;
    const boardIds = new Set(board.players.map(p => p.id));
    const ranked = results.filter(r => boardIds.has(r.id)).sort((a, b) => b.score - a.score);
    const resultsArray = ranked.map((r, i) => ({ playerId: r.id, rank: i + 1, score: r.score }));
    S.inst = board;
    show('game');
    $('introPanel').style.display = 'none';
    window.OnMinigameComplete(resultsArray, gameId);
    return;
  }
  const players = S.gauntlet ? S.gauntlet.players : lobbyPlayers();
  const known = new Set([...players.map(p => p.id), ...S.locals.map(p => p.id)]);
  const rows = results
    .map(r => {
      const p = players.find(q => q.id === r.id) || S.locals.find(q => q.id === r.id);
      return { ...r, name: r.name || (p ? p.name : '???'), color: r.color || (p ? p.color : '#93a0bd'), real: known.has(r.id) };
    })
    .sort((a, b) => b.score - a.score);
  S.lastResults = { gameId, rows };
  // gauntlet points: n..1 among real players
  if (S.gauntlet) {
    const real = rows.filter(r => r.real);
    real.forEach((r, i) => { S.gauntlet.pts[r.id] = (S.gauntlet.pts[r.id] || 0) + (real.length - i); });
  }
  renderResults();
  show('results');
  audio.sfx.win();
  audio.setMusicIntensity(0.3);
}
function renderResults() {
  const { gameId, rows } = S.lastResults;
  const game = gameId === 'party' ? { icon: '🎪', name: 'The Chaotic Boardwalk' } : GAMES[gameId];
  const gl = S.gauntlet;
  $('resTitle').textContent = game.icon + ' ' + game.name.toUpperCase() +
    (gl ? ' — ROUND ' + (gl.round + 1) + '/' + gl.rounds.length : '');
  const medals = ['🥇', '🥈', '🥉', '4.', '5.', '6.', '7.', '8.'];
  $('resList').innerHTML = rows.map((r, i) =>
    '<div class="resRow' + (i === 0 ? ' first' : '') + '">' +
    '<span class="pl">' + (medals[i] || (i + 1) + '.') + '</span>' +
    '<span class="pDot" style="background:' + r.color + '"></span>' +
    '<span>' + r.name + '</span>' +
    (r.label ? '<span class="lb">' + r.label + '</span>' : '') +
    '<span class="sc">' + r.score + '</span></div>').join('');
  if (gl) {
    const st = [...gl.players].sort((a, b) => (gl.pts[b.id] || 0) - (gl.pts[a.id] || 0));
    const final = gl.round >= gl.rounds.length - 1;
    $('standings').innerHTML = '<div class="secLbl">' + (final ? '🏆 FINAL STANDINGS' : 'STANDINGS') + '</div>' +
      st.map(p => '<div class="resRow"><span class="pDot" style="background:' + p.color + '"></span><span>' +
        p.name + '</span><span class="sc">' + (gl.pts[p.id] || 0) + ' pts</span></div>').join('');
    $('btnNext').textContent = final ? '🏆 DONE' : 'NEXT GAME ▶';
    $('btnNext').style.display = (S.net && !S.net.isHost && !final) ? 'none' : '';
  } else {
    $('standings').innerHTML = '';
    $('btnNext').textContent = 'REMATCH ▶';
    $('btnNext').style.display = (S.net && !S.net.isHost) ? 'none' : '';
  }
}
function nextRound(fromNet) {
  const gl = S.gauntlet;
  if (!gl) return;
  gl.round++;
  if (gl.round >= gl.rounds.length) { S.gauntlet = null; show('lobby'); renderLobby(); return; }
  startGame(gl.rounds[gl.round], gl.seed + 1 + gl.round, gl.players);
}
$('btnNext').addEventListener('click', () => {
  audio.sfx.ui();
  if (S.gauntlet) {
    const final = S.gauntlet.round >= S.gauntlet.rounds.length - 1;
    if (final) { S.gauntlet = null; show('lobby'); renderLobby(); return; }
    if (S.net) S.net.send('next', {});
    nextRound(false);
  } else {
    const seed = (Math.random() * 999999 | 0) + 1;
    if (S.net) S.net.send('start', { mode: S.lastResults.gameId, seed });
    launch(S.lastResults.gameId, seed, false);
  }
});
$('btnToLobby').addEventListener('click', () => { audio.sfx.ui(); S.gauntlet = null; show('lobby'); renderLobby(); });
$('btnQuit').addEventListener('click', () => {
  audio.sfx.ui();
  if (S.boardStash) { S.boardStash.dispose(); S.boardStash = null; }
  if (S.boardObj) { S.boardObj = null; }
  if (S.inst) { S.inst.dispose(); S.inst = null; }
  S.gauntlet = null; S.pending = null; S.gameNet = null; S.countdown = 0;
  $('introPanel').style.display = 'none';
  show('lobby'); renderLobby();
});

/* ---------------- frame loop ---------------- */
let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!last) last = ts;
  let dt = (ts - last) / 1000; last = ts;
  if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0;
  if (S.inst && S.screen === 'game') {
    if (S.countdown > 0) {
      const prev = Math.ceil(S.countdown);
      S.countdown -= dt;
      const cur = Math.ceil(S.countdown);
      if (cur !== prev && cur > 0) audio.sfx.ui();
      if (S.countdown <= 0) audio.sfx.zone();
      S.inst.render();
      const n = Math.ceil(Math.max(0.01, S.countdown));
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 ' + Math.round(90 * dim.V + 40) + 'px system-ui';
      g.lineWidth = 8; g.strokeStyle = 'rgba(10,8,4,0.9)';
      const label = S.countdown > 0.35 ? '' + n : 'GO!';
      g.strokeText(label, dim.W / 2, dim.H * 0.42);
      g.fillStyle = '#ffd23f'; g.fillText(label, dim.W / 2, dim.H * 0.42);
      g.textBaseline = 'alphabetic';
    } else {
      S.inst.update(dt);
      if (S.inst) S.inst.render();
    }
  } else {
    // idle backdrop
    const grd = g.createRadialGradient(dim.W / 2, dim.H / 2, 10, dim.W / 2, dim.H / 2, Math.max(dim.W, dim.H) * 0.7);
    grd.addColorStop(0, '#131a2b'); grd.addColorStop(1, '#06070d');
    g.fillStyle = grd; g.fillRect(0, 0, dim.W, dim.H);
    audio.setMusicIntensity(0.25);
  }
}
requestAnimationFrame(frame);

// debug hooks for automated testing
window.ARC = { S, launch, startGame, lobbyPlayers, show, GAMES, dim, setTiltOrient, getInput };
