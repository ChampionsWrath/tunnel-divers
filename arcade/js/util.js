// shared math / rng / storage
export const TAU = Math.PI * 2, HPI = Math.PI / 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, f) => a + (b - a) * f;
export const hlerp = (a, b, f) => { const d = ((b - a + 540) % 360) - 180; return (a + d * f + 360) % 360; };

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return (h >>> 0) % 1000000 || 7;
}
export function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
export function uid() { return Math.random().toString(36).slice(2, 8); }
export function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
export function mixHex(a, b, f) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return 'rgb(' + Math.round(lerp(A[0], B[0], f)) + ',' + Math.round(lerp(A[1], B[1], f)) + ',' + Math.round(lerp(A[2], B[2], f)) + ')';
}
export const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const PLAYER_COLORS = ['#ffd23f', '#59d9ff', '#ff6fae', '#7dff6a', '#d5b3ff', '#ffb84d', '#66e0c9', '#ff8a5c'];
