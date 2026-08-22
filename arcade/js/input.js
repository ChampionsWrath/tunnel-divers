// unified input: keyboard slots, touch (swipe stick / tilt), per local player
// slot 0: WASD + Space | touch/tilt on mobile      slot 1: Arrows + Enter
import { clamp, lsGet, lsSet } from './util.js';

export let ctl = lsGet('td_ctl') || 'tilt';        // 'tilt' | 'swipe' (phone steering)
export function setCtl(v) { ctl = v; lsSet('td_ctl', v); }

const keys = {};
addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (!e.repeat) { if (e.code === 'Space') taps[0] = true; if (e.code === 'Enter') taps[1] = true; }
});
addEventListener('keyup', e => { keys[e.code] = false; });

/* tilt */
export let tiltOK = false, tiltDenied = false;
let tg = 0, tb = 0, tilt0 = null;
addEventListener('deviceorientation', e => {
  if (e.gamma == null && e.beta == null) return;
  tiltOK = true; tiltDenied = false; tg = e.gamma || 0; tb = e.beta || 0;
});
export function askTiltPerm() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission)
      DeviceOrientationEvent.requestPermission().then(s => { if (s !== 'granted') tiltDenied = true; })
        .catch(() => { tiltDenied = true; });
  } catch (e) { tiltDenied = true; }
}
export function calibrateTilt() { tilt0 = null; }
const EMBEDDED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
export function tiltStatus() {
  if (tiltOK) return '✓ tilt sensor active';
  if (EMBEDDED) return '⚠ Motion sensors are blocked inside embedded viewers — open the game by its direct link.';
  if (tiltDenied) return '⚠ Motion access denied — allow it in Safari settings, or use swipe.';
  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission)
    return 'Tap START once to trigger the iOS motion prompt.';
  return 'No tilt sensor on this device — swipe will be used.';
}
/* Orientation is PLAYER-CHOSEN (browsers embedded/home-screen apps misreport
   rotation). For landscape, which WAY the phone was rotated is read from
   gravity at calibration: a comfortable landscape grip leaves gamma strongly
   signed, and the sign tells left- from right-rotation. */
let tiltOrient = 'portrait';   // 'portrait' | 'landscape'
export function setTiltOrient(v) { tiltOrient = v; }
export function getTiltOrient() { return tiltOrient; }
let ftg = 0, ftb = 0;
function tiltXY(dt) {
  if (!tilt0) {
    tilt0 = { g: tg, b: tb, landDir: tg < 0 ? 90 : 270 };
    ftg = tg; ftb = tb;
  }
  // low-pass the sensor — kills the jitter that made steering feel scratchy
  const k = Math.min(1, (dt || 0.016) * 14);
  ftg += (tg - ftg) * k; ftb += (tb - ftb) * k;
  const dg = ftg - tilt0.g, db = ftb - tilt0.b;
  let tx, ty;
  if (tiltOrient === 'landscape') {
    if (tilt0.landDir === 90) { tx = db; ty = -dg; }
    else { tx = -db; ty = dg; }
  } else { tx = dg; ty = db; }
  // response curve: 1.5° deadzone, full tilt ~16.5°, eased for fine aim near center
  const curve = v => {
    const a = Math.abs(v);
    if (a <= 1.5) return 0;
    const n = Math.min(1, (a - 1.5) / 15);
    return Math.sign(v) * Math.pow(n, 1.3);
  };
  return [curve(tx), curve(ty)];
}

/* touch — attach to the game canvas */
const pad = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const touches = new Set();
const taps = [false, false]; // consumable action taps per slot
export function attachTouch(cv) {
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { }
    touches.add(e.pointerId);
    if (ctl === 'tilt' && tiltOK) { taps[0] = true; return; }
    if (pad.id === null) {
      pad.id = e.pointerId; pad.ox = e.clientX; pad.oy = e.clientY; pad.x = e.clientX; pad.y = e.clientY;
      pad.t0 = performance.now(); pad.sx = e.clientX; pad.sy = e.clientY;
    }
    else taps[0] = true;
  });
  cv.addEventListener('pointermove', e => { if (e.pointerId === pad.id) { pad.x = e.clientX; pad.y = e.clientY; } });
  const end = e => {
    if (e.pointerId === pad.id) {
      // a quick, still press was a TAP, not a steer — swipe mode needs taps too
      if (performance.now() - pad.t0 < 250 && Math.hypot(pad.x - pad.sx, pad.y - pad.sy) < 12) taps[0] = true;
      pad.id = null;
    }
    touches.delete(e.pointerId);
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  cv.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
}

/* poll: {x,y in [-1,1], act: momentary action, hold: any press held} */
export function getInput(slot, dt) {
  let x = 0, y = 0;
  if (slot === 0) {
    if (keys.KeyA) x -= 1; if (keys.KeyD) x += 1;
    if (keys.KeyW) y -= 1; if (keys.KeyS) y += 1;
    if (ctl === 'tilt' && tiltOK) { const t = tiltXY(dt); x += t[0]; y += t[1]; }
    else if (pad.id !== null) {
      pad.ox += (pad.x - pad.ox) * Math.min(1, (dt || 0.016) * 1.2);
      pad.oy += (pad.y - pad.oy) * Math.min(1, (dt || 0.016) * 1.2);
      const dx = pad.x - pad.ox, dy = pad.y - pad.oy, mag = Math.hypot(dx, dy);
      if (mag > 5) { const n = Math.min(1, (mag - 5) / 38); x += dx / mag * n; y += dy / mag * n; }
    }
  } else {
    if (keys.ArrowLeft) x -= 1; if (keys.ArrowRight) x += 1;
    if (keys.ArrowUp) y -= 1; if (keys.ArrowDown) y += 1;
  }
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  const act = taps[slot]; taps[slot] = false;
  const hold = slot === 0 ? (!!keys.Space || touches.size > 0) : !!keys.Enter;
  return { x, y, act, hold };
}
export function clearTouch() { pad.id = null; touches.clear(); taps[0] = taps[1] = false; }
