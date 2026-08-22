// Divers Arcade shell: home → lobby → game(s) → results.
// "Board Game" mode = gauntlet of all minigames with placement points (real board TBD).
import { clamp, lsGet, lsSet, uid, mulberry32, PLAYER_COLORS } from './util.js';
import * as audio from './audio.js';
import { getInput, attachTouch, clearTouch, ctl, setCtl, askTiltPerm, calibrateTilt, tiltStatus } from './input.js';
import { Net, makeRoomCode } from './net.js';
import tunnel from './games/tunnel.js';
import stack from './games/stack.js';
import crown from './games/crown.js';

const GAMES = { tunnel, stack, crown };
const MODES = [
  { id: 'party', name: 'Board Game', icon: '🎲', desc: 'All minigames, placement points, crown the champion. (Board coming soon — gauntlet rules for now.)' },
  { id: 'tunnel', name: tunnel.name, icon: tunnel.icon, desc: tunnel.desc },
  { id: 'stack', name: stack.name, icon: stack.icon, desc: stack.desc },
  { id: 'crown', name: crown.name, icon: crown.icon, desc: crown.desc },
];

const $ = id => document.getElementById(id);
const cv = $('game'), g = cv.getContext('2d');
const dim = { W: 0, H: 0, V: 1 };
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  dim.W = window.innerWidth; dim.H = window.innerHeight; dim.V = Math.min(dim.W, dim.H) / 700;
  cv.width = Math.round(dim.W * dpr); cv.height = Math.round(dim.H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
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
function renderLobby() {
  $('lobbyTitle').textContent = S.net ? 'ROOM ' + S.code : 'PARTY LOBBY';
  $('roomLine').textContent = S.net ?
    (S.net.isHost ? 'you are hosting — share the code' : 'connected') +
    ' · ' + (S.net.peerCount() + 1) + ' online' :
    'same-device party — add players & bots';
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
  S.net.onPeers = () => { if (S.screen === 'lobby') renderLobby(); };
  S.net.onMsg = (t, p, from) => {
    if (t === 'mode') { S.mode = p.mode; if (S.screen === 'lobby') renderLobby(); }
    else if (t === 'start') launch(p.mode, p.seed, true);
    else if (t === 'next' && S.gauntlet) nextRound(true);
    else if (S.inst && S.inst.constructor) { /* in-game messages are re-routed by games via net.onMsg */ }
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
  if (S.net) S.net.send('start', { mode: S.mode, seed });
  launch(S.mode, seed, false);
});
function launch(mode, seed, fromNet) {
  const players = lobbyPlayers();
  if (mode === 'party') {
    const rng = mulberry32(seed);
    const rounds = ['tunnel', 'stack', 'crown'].sort(() => rng() - 0.5);
    S.gauntlet = { rounds, round: 0, pts: {}, seed, players };
    for (const p of players) S.gauntlet.pts[p.id] = 0;
    startGame(rounds[0], seed + 1, players);
  } else {
    S.gauntlet = null;
    startGame(mode, seed, players);
  }
}
function startGame(gameId, seed, players) {
  const game = GAMES[gameId];
  calibrateTilt(); clearTouch();
  show('game');
  S.inst = game.create({
    cv, g, dim, players, seed: seed >>> 0,
    net: S.net, input: getInput,
    audio: { sfx: audio.sfx, setMusicIntensity: audio.setMusicIntensity },
    end: results => onGameEnd(gameId, results),
  });
}
function onGameEnd(gameId, results) {
  if (S.inst) { S.inst.dispose(); S.inst = null; }
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
  const game = GAMES[gameId];
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
  if (S.inst) { S.inst.dispose(); S.inst = null; }
  S.gauntlet = null; show('lobby'); renderLobby();
});

/* ---------------- frame loop ---------------- */
let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!last) last = ts;
  let dt = (ts - last) / 1000; last = ts;
  if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0;
  if (S.inst && S.screen === 'game') {
    S.inst.update(dt);
    if (S.inst) S.inst.render();
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
window.ARC = { S, launch, startGame, lobbyPlayers, show, GAMES, dim };
