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
function tiltXY() {
  if (!tilt0) tilt0 = { g: tg, b: tb };
  const ang = (screen.orientation && screen.orientation.angle != null) ?
    screen.orientation.angle : (window.orientation || 0);
  const dg = tg - tilt0.g, db = tb - tilt0.b;
  let tx, ty;
  if (ang === 90) { tx = db; ty = -dg; }
  else if (ang === 270 || ang === -90) { tx = -db; ty = dg; }
  else if (ang === 180) { tx = -dg; ty = -db; }
  else { tx = dg; ty = db; }
  return [clamp(tx / 20, -1, 1), clamp(ty / 20, -1, 1)];
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
    if (pad.id === null) { pad.id = e.pointerId; pad.ox = e.clientX; pad.oy = e.clientY; pad.x = e.clientX; pad.y = e.clientY; }
    else taps[0] = true;
  });
  cv.addEventListener('pointermove', e => { if (e.pointerId === pad.id) { pad.x = e.clientX; pad.y = e.clientY; } });
  const end = e => { if (e.pointerId === pad.id) pad.id = null; touches.delete(e.pointerId); };
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
    if (ctl === 'tilt' && tiltOK) { const t = tiltXY(); x += t[0]; y += t[1]; }
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
