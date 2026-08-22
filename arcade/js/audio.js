// audio singleton: sfx + live-sequenced music (no files — everything synthesized)
import { clamp, lsGet, lsSet } from './util.js';

let AC = null, master = null, noiseBuf = null;
let muted = lsGet('td_mute') === '1';
let masterVol = (() => { const v = parseFloat(lsGet('td_vol')); return isNaN(v) ? 0.8 : v; })();
let musVol = (() => { const v = parseFloat(lsGet('td_mvol')); return isNaN(v) ? 0.55 : v; })();

export function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = muted ? 0 : masterVol; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    startMusic();
  } catch (e) { AC = null; }
}
export const audioReady = () => !!AC;
export function getVols() { return { muted, masterVol, musVol }; }
export function setMasterVol(v) { masterVol = clamp(v, 0, 1); lsSet('td_vol', '' + masterVol); if (master) master.gain.value = muted ? 0 : masterVol; }
export function setMusVol(v) { musVol = clamp(v, 0, 1); lsSet('td_mvol', '' + musVol); if (musicGain) musicGain.gain.value = musVol; }
export function toggleMute() { muted = !muted; lsSet('td_mute', muted ? '1' : '0'); if (master) master.gain.value = muted ? 0 : masterVol; return muted; }

function tone(f0, f1, dur, type, vol, delay) {
  if (!AC) return; const t0 = AC.currentTime + (delay || 0);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(Math.max(30, f0), t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noiseBurst(dur, f, q, vol, f1) {
  if (!AC) return; const t0 = AC.currentTime;
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const b = AC.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = q;
  b.frequency.setValueAtTime(f, t0);
  if (f1) b.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(b); b.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.05);
}

export const sfx = {
  coin: n => { const f = 430 * Math.pow(1.059, Math.min(24, n || 1)); tone(f, 0, .08, 'square', .15); tone(f * 1.5, 0, .07, 'square', .08, .05); },
  near: () => noiseBurst(.32, 420, 1.1, .5, 2800),
  hit: () => { noiseBurst(.22, 260, .8, .55); tone(150, 55, .3, 'sawtooth', .35); },
  wall: () => tone(95, 70, .08, 'triangle', .18),
  pow: () => { tone(523, 0, .09, 'square', .18); tone(659, 0, .09, 'square', .18, .08); tone(784, 0, .13, 'square', .18, .16); },
  shield: () => { tone(880, 440, .25, 'triangle', .3); noiseBurst(.15, 1500, 2, .2); },
  death: () => { tone(330, 55, .9, 'sawtooth', .4); noiseBurst(.6, 180, .7, .5); },
  ui: () => tone(620, 0, .05, 'square', .12),
  zone: () => { tone(392, 0, .12, 'triangle', .22); tone(523, 0, .12, 'triangle', .22, .1); tone(659, 0, .2, 'triangle', .22, .2); },
  zap: () => { tone(1400, 240, .09, 'sawtooth', .14); noiseBurst(.06, 3000, 3, .1); },
  boom: () => { tone(120, 45, .5, 'sine', .4); noiseBurst(.5, 220, .7, .4); },
  whoosh: () => noiseBurst(.4, 600, 1, .3, 2000),
  thud: (v) => { tone(90, 50, .12, 'sine', .3 * (v || 1)); noiseBurst(.1, 300, 1, .25 * (v || 1)); },
  crash: () => { noiseBurst(.5, 500, .6, .55, 150); tone(200, 60, .4, 'sawtooth', .3); },
  dash: () => noiseBurst(.15, 900, 1.5, .3, 2200),
  grab: () => { tone(660, 990, .12, 'square', .2); },
  drop: () => tone(440, 220, .15, 'triangle', .25),
  win: () => { tone(523, 0, .15, 'square', .25); tone(659, 0, .15, 'square', .25, .13); tone(784, 0, .15, 'square', .25, .26); tone(1047, 0, .3, 'square', .25, .39); },
};

/* ---- music: 132bpm Am-F-C-G step sequencer, intensity 0..1 ---- */
let musicGain = null, musNext = 0, musStep = 0, musInt = 0.3;
const MSPB = 60 / 132 / 4;
const MROOTS = [55, 43.65, 65.41, 49];
const MBASS = [1, 0, 1, 1, 0, 0, 2, 0, 1, 0, 1, 1, 0, 0, 2, 0];
const MARP = [0, 7, 12, 3, 7, 15, 12, 7];
export function setMusicIntensity(v) { musInt = clamp(v, 0, 1); }
function startMusic() {
  if (!AC || musicGain) return;
  musicGain = AC.createGain(); musicGain.gain.value = musVol; musicGain.connect(master);
  musNext = AC.currentTime + 0.1; musStep = 0;
  setInterval(() => {
    if (!AC || AC.state !== 'running' || !musicGain) return;
    if (musNext < AC.currentTime) musNext = AC.currentTime + 0.05;
    while (musNext < AC.currentTime + 0.12) { mStepFn(musStep, musNext); musStep = (musStep + 1) % 64; musNext += MSPB; }
  }, 40);
}
function mStepFn(s, t) {
  const bar = (s >> 4) & 3, root = MROOTS[bar], st16 = s & 15;
  if (st16 % 4 === 0) mKick(t, 0.5);
  if (musInt > 0.8 && st16 === 14) mKick(t, 0.3);
  if (st16 === 8) mSnare(t);
  if (st16 % 2 === 1) mHat(t, 0.035 + musInt * 0.07);
  else if (musInt > 0.6) mHat(t, 0.028);
  const b = MBASS[st16];
  if (b) mBass(t, root * (b === 2 ? 2 : 1), 260 + musInt * 2400);
  if (musInt > 0.45 && st16 % 2 === 0) mArp(t, root * 4 * Math.pow(2, MARP[(s >> 1) % 8] / 12), 0.045 + musInt * 0.05);
}
function mKick(t, v) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.22);
}
function mSnare(t) {
  const s2 = AC.createBufferSource(); s2.buffer = noiseBuf;
  const b = AC.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 1900; b.Q.value = 0.9;
  const g = AC.createGain(); g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  s2.connect(b); b.connect(g); g.connect(musicGain);
  s2.start(t, Math.random() * 0.8); s2.stop(t + 0.14);
}
function mHat(t, v) {
  const s2 = AC.createBufferSource(); s2.buffer = noiseBuf;
  const b = AC.createBiquadFilter(); b.type = 'highpass'; b.frequency.value = 7500;
  const g = AC.createGain(); g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  s2.connect(b); b.connect(g); g.connect(musicGain);
  s2.start(t, Math.random() * 0.8); s2.stop(t + 0.05);
}
function mBass(t, f, cut) {
  const o = AC.createOscillator(), g = AC.createGain(), b = AC.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = f;
  b.type = 'lowpass'; b.Q.value = 6; b.frequency.setValueAtTime(cut, t);
  b.frequency.exponentialRampToValueAtTime(Math.max(120, cut * 0.3), t + MSPB * 0.9);
  g.gain.setValueAtTime(0.19, t); g.gain.exponentialRampToValueAtTime(0.001, t + MSPB * 0.95);
  o.connect(b); b.connect(g); g.connect(musicGain); o.start(t); o.stop(t + MSPB);
}
function mArp(t, f, v) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'square'; o.frequency.value = f;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.12);
}
