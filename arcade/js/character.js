// THE DIVER — the one character model every minigame (and the board) shares.
// Canonical look, set by Tunnel Divers: chunky body in the player's color,
// skin-tone head, dark goggle band with ice-blue lenses, black outlines.
// Views: top-down (arenas), standing front (board), back, side (batting).
// o.skin (0-100 slider) tints the skin; o.ward {hat,face} is the wardrobe
// (picked in the CHARACTER screen); o.cos [] are EARNED board cosmetics.
import { TAU, clamp } from './util.js';

export const SKIN = '#ffd9b3', OUTLINE = '#14100a', GOGGLE = '#2d3436', LENS = '#9ad3ff';

/* skin-tone slider ramp: 0..100 sweeps light → deep. skinTone(35) ≈ the classic SKIN. */
export const SKIN_RAMP = ['#ffe7d1', '#ffd9b3', '#eab98b', '#c68d5a', '#9c6633', '#6e4423'];
export function skinTone(v) {
  const t = clamp((+v || 0) / 100, 0, 1) * (SKIN_RAMP.length - 1);
  const i = Math.min(SKIN_RAMP.length - 2, Math.floor(t)), f = t - i;
  const a = parseInt(SKIN_RAMP[i].slice(1), 16), b = parseInt(SKIN_RAMP[i + 1].slice(1), 16);
  const ch = s => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * f);
  return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
}
function skinShade(v, f) {   // darker skin for shading
  const t = clamp((+v || 0) / 100, 0, 1) * (SKIN_RAMP.length - 1);
  const i = Math.min(SKIN_RAMP.length - 2, Math.floor(t)), ff = t - i;
  const a = parseInt(SKIN_RAMP[i].slice(1), 16), b = parseInt(SKIN_RAMP[i + 1].slice(1), 16);
  const ch = s => Math.round((((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * ff) * f);
  return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
}

/* the free wardrobe (edited on the CHARACTER screen, stored in td_cos1/td_skin).
   ward = {hair, hat, face, hairCol, faceCol} — hair renders under the hat;
   hairCol/faceCol are any CSS color (the picker stores hsl(...) strings). */
export const WARDROBE = {
  body: [['m', 'Male'], ['f', 'Female']],
  hair: [['none', 'None'], ['bowl', 'Bowl Cut'], ['spikes', 'Spikes'], ['curls', 'Curls'],
  ['mohawk', 'Mohawk'], ['pony', 'Ponytail'], ['long', 'Long']],
  hat: [['none', 'None'], ['cap', 'Cap'], ['beanie', 'Beanie'], ['tophat', 'Top Hat'],
  ['viking', 'Viking'], ['crown', 'Crown'], ['cowboy', 'Cowboy'], ['party', 'Party Cone'],
  ['phones', 'Headphones'], ['halo', 'Halo'], ['wizard', 'Wizard']],
  face: [['none', 'None'], ['stache', 'Mustache'], ['goatee', 'Goatee'], ['beard', 'Beard'],
  ['bar', 'Handlebar'], ['chops', 'Mutton Chops'], ['soul', 'Soul Patch']],
};
export const DEF_HAIR_COL = '#6b4423', DEF_FACE_COL = '#5a3a22';
const OLD_SHIRTC = { orange: '#ff8c42', blue: '#4d9de0', red: '#e04040', green: '#3a9d5c', purple: '#9d5cd0', black: '#2d3436' };
// old builds stored hair inside hat, shirts as preset ids — migrate transparently
export function migrateWard(w) {
  w = w || {};
  const out = {
    body: w.body === 'f' ? 'f' : 'm',
    hair: w.hair || 'none', hat: w.hat || 'none', face: w.face || 'none',
    hairCol: w.hairCol || DEF_HAIR_COL, faceCol: w.faceCol || DEF_FACE_COL,
    shirtCol: w.shirtCol || OLD_SHIRTC[w.shirt] || null,   // null = the player's seat color
  };
  if (out.hat === 'hairb') { out.hat = 'none'; out.hair = 'bowl'; out.hairCol = '#6b4423'; }
  if (out.hat === 'hairy') { out.hat = 'none'; out.hair = 'spikes'; out.hairCol = '#f0cd58'; }
  return out;
}

function lightHex(hex, f) {
  try {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.round(v + (255 - v) * f);
    return 'rgb(' + c(n >> 16 & 255) + ',' + c(n >> 8 & 255) + ',' + c(n & 255) + ')';
  } catch (e) { return hex; }
}
function shade(hex, f) {
  try {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.max(0, Math.round(v * (f == null ? 0.78 : f)));
    return 'rgb(' + c(n >> 16 & 255) + ',' + c(n >> 8 & 255) + ',' + c(n & 255) + ')';
  } catch (e) { return hex; }
}
/* color helpers that accept hex, rgb() AND the picker's hsl() strings */
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
function anyToRgb(c) {
  if (typeof c !== 'string') return [200, 60, 60];
  if (c[0] === '#') { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  let m = /rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(c); if (m) return [+m[1], +m[2], +m[3]];
  m = /hsl\((\d+)[, ]+(\d+)%[, ]+(\d+)%\)/.exec(c); if (m) return hslToRgb(+m[1], +m[2], +m[3]);
  return [200, 60, 60];
}
function shadeShirt(c, f) { const [r, gg, b] = anyToRgb(c); return 'rgb(' + (r * f | 0) + ',' + (gg * f | 0) + ',' + (b * f | 0) + ')'; }
function lightShirt(c, f) { const [r, gg, b] = anyToRgb(c); return 'rgb(' + (r + (255 - r) * f | 0) + ',' + (gg + (255 - gg) * f | 0) + ',' + (b + (255 - b) * f | 0) + ')'; }
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r); g.closePath();
}

/* ---- earned cosmetic layers: one look, every game, updating as you collect ---- */
function headwear(cos, ward) {
  if (cos && cos.includes('crown')) return 'crown';
  if (cos && cos.includes('prop')) return 'prop';
  if (ward && ward.hat && ward.hat !== 'none') return 'ward:' + ward.hat;
  return null;
}
function drawCrownAt(g, x, y, s) {
  g.fillStyle = '#ffd23f'; g.strokeStyle = OUTLINE; g.lineWidth = 2 * s;
  g.beginPath();
  g.moveTo(x - 8 * s, y + 4 * s); g.lineTo(x - 8 * s, y - 3 * s); g.lineTo(x - 4 * s, y);
  g.lineTo(x, y - 6 * s); g.lineTo(x + 4 * s, y); g.lineTo(x + 8 * s, y - 3 * s); g.lineTo(x + 8 * s, y + 4 * s);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#e04040';                 // jewels
  for (const jx of [-5, 0, 5]) { g.beginPath(); g.arc(x + jx * s, y + 1.5 * s, 1.1 * s, 0, TAU); g.fill(); }
}
function drawPropAt(g, x, y, s, t) {
  // fitted beanie base + spinning blade with motion blur
  g.fillStyle = '#e04040'; g.strokeStyle = OUTLINE; g.lineWidth = 2 * s;
  g.beginPath(); g.arc(x, y + 2 * s, 6.2 * s, Math.PI, TAU); g.fill(); g.stroke();
  g.strokeStyle = '#a52f2f'; g.lineWidth = 1.2 * s;
  g.beginPath(); g.moveTo(x, y + 2 * s); g.quadraticCurveTo(x + 1 * s, y - 2 * s, x, y - 3.6 * s); g.stroke();
  g.strokeStyle = OUTLINE; g.lineWidth = 1.6 * s;
  g.beginPath(); g.moveTo(x, y + 1 * s); g.lineTo(x, y - 4 * s); g.stroke();
  const a = (t || 0) * 14;
  g.save(); g.translate(x, y - 4 * s); g.rotate(a);
  g.globalAlpha = 0.35;                    // blur ghost
  g.fillStyle = '#ffd23f'; g.fillRect(-8 * s, -1.2 * s, 16 * s, 2.4 * s);
  g.rotate(0.5); g.fillRect(-8 * s, -1.2 * s, 16 * s, 2.4 * s);
  g.globalAlpha = 1; g.rotate(-0.25);
  g.fillStyle = '#ffd23f'; g.strokeStyle = OUTLINE; g.lineWidth = 1.6 * s;
  g.fillRect(-8 * s, -1.2 * s, 16 * s, 2.4 * s); g.strokeRect(-8 * s, -1.2 * s, 16 * s, 2.4 * s);
  g.fillStyle = OUTLINE; g.beginPath(); g.arc(0, 0, 1.3 * s, 0, TAU); g.fill();
  g.restore();
}
/* HAIR, front view — always drawn on the FRONT of the head (fringe/spikes rise
   from the visible crown, never behind the silhouette), fitted to radius hr */
function drawHairFront(g, style, col, x, y, hr, t) {
  if (!style || style === 'none') return;
  const s = hr / 10;
  g.strokeStyle = OUTLINE; g.lineWidth = 1.6 * s; g.lineJoin = 'round';
  g.fillStyle = col;
  const skullCap = (scallops) => {   // hugging cap, fringe ends ABOVE the goggles
    const hy2 = y - hr * 0.42, exr = hr * 0.94;
    g.beginPath();
    g.arc(x, y, hr * 1.06, Math.PI * 1.08, Math.PI * 1.92);
    if (scallops) for (let k = 0; k < 4; k++) {
      const x1 = x + exr - (k + 1) * (2 * exr / 4);
      g.quadraticCurveTo(x + exr - (k + 0.5) * (2 * exr / 4), hy2 + hr * 0.2, x1, hy2);
    } else { g.lineTo(x + exr, hy2); g.lineTo(x - exr, hy2); }
    g.closePath(); g.fill(); g.stroke();
  };
  const sheen = () => {
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.ellipse(x - hr * 0.35, y - hr * 0.85, hr * 0.32, hr * 0.16, -0.5, 0, TAU); g.fill();
    g.fillStyle = col;
  };
  if (style === 'bowl') { skullCap(true); sheen(); }
  else if (style === 'spikes') {
    skullCap(false);
    // spikes rise from the FRONT of the crown, leaning slightly forward
    for (const [a, sh, lean] of [[-0.72, 0.55, -0.25], [-0.36, 0.72, -0.12], [0, 0.8, 0], [0.36, 0.72, 0.12], [0.72, 0.55, 0.25]]) {
      const bx = x + Math.sin(a) * hr * 0.92, by = y - Math.cos(a) * hr * 0.92;
      const tx = bx + Math.sin(a + lean) * hr * sh, ty = by - Math.cos(a + lean) * hr * sh;
      g.beginPath();
      g.moveTo(bx - Math.cos(a) * hr * 0.2, by - Math.sin(a) * hr * 0.2);
      g.lineTo(tx, ty);
      g.lineTo(bx + Math.cos(a) * hr * 0.2, by + Math.sin(a) * hr * 0.2);
      g.closePath(); g.fill(); g.stroke();
    }
    sheen();
  } else if (style === 'curls') {
    for (const [a, cr] of [[-1.15, 0.34], [-0.75, 0.38], [-0.38, 0.4], [0, 0.42], [0.38, 0.4], [0.75, 0.38], [1.15, 0.34]]) {
      const cx2 = x + Math.sin(a) * hr * 0.88, cy2 = y - Math.cos(a) * hr * 0.88;
      g.beginPath(); g.arc(cx2, cy2, hr * cr, 0, TAU); g.fill(); g.stroke();
    }
    sheen();
  } else if (style === 'mohawk') {
    skullCap(false);
    g.beginPath();
    g.moveTo(x - hr * 0.22, y - hr * 0.9);
    for (let k = 0; k <= 4; k++) {           // jagged crest, tallest mid-front
      const fx2 = x - hr * 0.55 + k * hr * 0.3;
      g.lineTo(fx2, y - hr * (1.5 + Math.sin(k / 4 * Math.PI) * 0.65));
      g.lineTo(fx2 + hr * 0.14, y - hr * 1.02);
    }
    g.lineTo(x + hr * 0.22, y - hr * 0.9);
    g.closePath(); g.fill(); g.stroke();
  } else if (style === 'pony') {
    skullCap(true);
    const sway = Math.sin((t || 0) * 2.4) * hr * 0.08;
    g.beginPath();                            // tail swishing off the right side
    g.moveTo(x + hr * 0.78, y - hr * 0.55);
    g.quadraticCurveTo(x + hr * 1.55 + sway, y - hr * 0.2, x + hr * 1.28 + sway, y + hr * 0.75);
    g.quadraticCurveTo(x + hr * 1.05 + sway * 0.5, y + hr * 0.35, x + hr * 0.92, y - hr * 0.28);
    g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#e04040'; g.lineWidth = 2.2 * s;   // tie
    g.beginPath(); g.moveTo(x + hr * 0.82, y - hr * 0.5); g.lineTo(x + hr * 1.0, y - hr * 0.32); g.stroke();
    g.strokeStyle = OUTLINE; g.lineWidth = 1.6 * s;
    sheen();
  } else if (style === 'long') {
    // side curtains falling past the ears first, then the cap over them
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(x + sd * hr * 0.62, y - hr * 0.72);
      g.quadraticCurveTo(x + sd * hr * 1.18, y - hr * 0.3, x + sd * hr * 1.05, y + hr * 1.15);
      g.quadraticCurveTo(x + sd * hr * 0.85, y + hr * 1.3, x + sd * hr * 0.68, y + hr * 1.12);
      g.quadraticCurveTo(x + sd * hr * 0.78, y + hr * 0.2, x + sd * hr * 0.45, y - hr * 0.55);
      g.closePath(); g.fill(); g.stroke();
    }
    skullCap(true); sheen();
  }
}
/* wardrobe hats, front view — fitted to a head of radius hr centered (x,y) */
function drawWardHatFront(g, hat, x, y, hr, t) {
  const s = hr / 10;
  g.strokeStyle = OUTLINE; g.lineWidth = 2 * s;
  if (hat === 'cap') {
    g.fillStyle = '#e04040';
    g.beginPath(); g.arc(x, y - hr * 0.1, hr * 1.02, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#c0392b';               // brim
    roundRect(g, x - hr * 0.85, y - hr * 0.52, hr * 1.7, hr * 0.3, hr * 0.14); g.fill(); g.stroke();
    g.fillStyle = '#fff';                  // button
    g.beginPath(); g.arc(x, y - hr * 1.02, 1.6 * s, 0, TAU); g.fill();
  } else if (hat === 'beanie') {
    g.fillStyle = '#3a9d5c';
    g.beginPath(); g.arc(x, y - hr * 0.12, hr * 1.02, Math.PI * 1.03, Math.PI * 1.97); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#2e7d49';               // fold band
    roundRect(g, x - hr * 0.95, y - hr * 0.58, hr * 1.9, hr * 0.32, hr * 0.14); g.fill(); g.stroke();
    g.fillStyle = '#f2ece2';               // pompom
    g.beginPath(); g.arc(x, y - hr * 1.22, hr * 0.26, 0, TAU); g.fill(); g.stroke();
  } else if (hat === 'tophat') {
    g.fillStyle = '#232028';
    roundRect(g, x - hr * 0.62, y - hr * 2.05, hr * 1.24, hr * 1.35, 2.5 * s); g.fill(); g.stroke();
    roundRect(g, x - hr * 1.02, y - hr * 0.8, hr * 2.04, hr * 0.28, hr * 0.12); g.fill(); g.stroke();
    g.fillStyle = '#e04040';               // band
    g.fillRect(x - hr * 0.6, y - hr * 1.02, hr * 1.2, hr * 0.24);
  } else if (hat === 'viking') {
    g.fillStyle = '#9aa5b1';
    g.beginPath(); g.arc(x, y - hr * 0.05, hr * 1.03, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#7d8894';
    roundRect(g, x - hr * 1.0, y - hr * 0.55, hr * 2.0, hr * 0.22, hr * 0.1); g.fill(); g.stroke();
    g.fillStyle = '#f2ece2';               // horns
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(x + sd * hr * 0.85, y - hr * 0.5);
      g.quadraticCurveTo(x + sd * hr * 1.5, y - hr * 0.8, x + sd * hr * 1.35, y - hr * 1.5);
      g.quadraticCurveTo(x + sd * hr * 1.1, y - hr * 0.85, x + sd * hr * 0.55, y - hr * 0.75);
      g.closePath(); g.fill(); g.stroke();
    }
  } else if (hat === 'crown') drawCrownAt(g, x, y - hr * 1.05, s);
  else if (hat === 'cowboy') {
    g.fillStyle = '#a3703a';
    g.beginPath(); g.ellipse(x, y - hr * 0.52, hr * 1.5, hr * 0.36, 0, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.arc(x, y - hr * 0.52, hr * 0.72, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#6e4423';                 // band
    roundRect(g, x - hr * 0.72, y - hr * 0.78, hr * 1.44, hr * 0.2, hr * 0.08); g.fill();
    g.strokeStyle = 'rgba(20,16,10,0.35)'; g.lineWidth = 1.2 * s;   // brim curl
    g.beginPath(); g.ellipse(x, y - hr * 0.56, hr * 1.28, hr * 0.24, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  } else if (hat === 'party') {
    const lean = 0.18;
    g.fillStyle = '#e08bd0';
    g.beginPath();
    g.moveTo(x - hr * 0.6, y - hr * 0.7);
    g.lineTo(x + hr * lean, y - hr * 2.15);
    g.lineTo(x + hr * 0.6, y - hr * 0.7);
    g.closePath(); g.fill(); g.stroke();
    g.save(); g.clip();                      // diagonal stripes inside the cone
    g.strokeStyle = '#ffd23f'; g.lineWidth = hr * 0.16;
    for (let k = -2; k <= 3; k++) {
      g.beginPath(); g.moveTo(x - hr + k * hr * 0.45, y - hr * 0.5);
      g.lineTo(x - hr * 0.3 + k * hr * 0.45, y - hr * 2.3); g.stroke();
    }
    g.restore();
    g.strokeStyle = OUTLINE;
    g.fillStyle = '#ffd23f';                 // pom
    g.beginPath(); g.arc(x + hr * lean, y - hr * 2.18, hr * 0.2, 0, TAU); g.fill(); g.stroke();
  } else if (hat === 'phones') {
    g.strokeStyle = '#2c3646'; g.lineWidth = hr * 0.2;
    g.beginPath(); g.arc(x, y, hr * 1.12, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.strokeStyle = OUTLINE; g.lineWidth = 1.6 * s;
    g.fillStyle = '#e04040';                 // cups over the ears
    for (const sd of [-1, 1]) {
      roundRect(g, x + sd * hr * 1.0 - hr * 0.2, y - hr * 0.3, hr * 0.4, hr * 0.6, hr * 0.16);
      g.fill(); g.stroke();
      g.fillStyle = '#c0392b';
      g.beginPath(); g.arc(x + sd * hr * 1.0, y, hr * 0.1, 0, TAU); g.fill();
      g.fillStyle = '#e04040';
    }
  } else if (hat === 'halo') {
    const bob2 = Math.sin((t || 0) * 2.2) * hr * 0.08;
    g.globalAlpha = 0.45;                    // glow
    g.strokeStyle = '#ffe98a'; g.lineWidth = hr * 0.3;
    g.beginPath(); g.ellipse(x, y - hr * 1.6 + bob2, hr * 0.72, hr * 0.2, 0, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    g.strokeStyle = '#ffd23f'; g.lineWidth = hr * 0.14;
    g.beginPath(); g.ellipse(x, y - hr * 1.6 + bob2, hr * 0.72, hr * 0.2, 0, 0, TAU); g.stroke();
  } else if (hat === 'wizard') {
    g.fillStyle = '#3b2f6e';
    g.beginPath(); g.ellipse(x, y - hr * 0.58, hr * 1.32, hr * 0.3, 0, 0, TAU); g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(x - hr * 0.62, y - hr * 0.66);
    g.quadraticCurveTo(x + hr * 0.1, y - hr * 1.5, x + hr * 0.42, y - hr * 2.4);
    g.quadraticCurveTo(x + hr * 0.5, y - hr * 1.3, x + hr * 0.62, y - hr * 0.66);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffd23f';                 // stars + moon
    g.font = Math.round(hr * 0.42) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('★', x - hr * 0.12, y - hr * 1.15);
    g.fillText('☾', x + hr * 0.28, y - hr * 1.7);
    g.textBaseline = 'alphabetic';
  }
}
/* facial hair, front view — face center (x,y≈mouth line), scale s, colored col */
function drawFaceHairFront(g, face, x, y, s, skinV, col) {
  const c = col || '#503a26';
  g.fillStyle = c; g.strokeStyle = c;
  if (face === 'stache' || face === 'bar') {
    g.beginPath(); g.ellipse(x - 3.2 * s, y - 1.2 * s, 3.4 * s, 1.5 * s, 0.18, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(x + 3.2 * s, y - 1.2 * s, 3.4 * s, 1.5 * s, -0.18, 0, TAU); g.fill();
    if (face === 'bar') {
      g.beginPath(); g.arc(x - 6.8 * s, y - 2.4 * s, 1.7 * s, 0, TAU); g.fill();
      g.beginPath(); g.arc(x + 6.8 * s, y - 2.4 * s, 1.7 * s, 0, TAU); g.fill();
    }
  } else if (face === 'goatee') {
    g.beginPath(); g.ellipse(x, y + 3.4 * s, 2.6 * s, 2 * s, 0, 0, TAU); g.fill();
  } else if (face === 'beard') {
    g.beginPath();
    g.arc(x, y - 1 * s, 8.6 * s, 0.12 * Math.PI, 0.88 * Math.PI); // jaw arc
    g.quadraticCurveTo(x, y + 7 * s, x - 8.2 * s, y + 1.6 * s);
    g.closePath(); g.fill();
    g.fillStyle = skinTone(skinV == null ? 35 : skinV);   // mouth window
    g.beginPath(); g.ellipse(x, y + 0.4 * s, 3 * s, 1.8 * s, 0, 0, TAU); g.fill();
  } else if (face === 'chops') {
    for (const sd of [-1, 1]) {              // sideburns hugging the jaw
      g.beginPath();
      g.moveTo(x + sd * 8.6 * s, y - 5.5 * s);
      g.quadraticCurveTo(x + sd * 9.4 * s, y - 0.5 * s, x + sd * 6.2 * s, y + 2.4 * s);
      g.quadraticCurveTo(x + sd * 5.4 * s, y - 0.5 * s, x + sd * 6.4 * s, y - 5 * s);
      g.closePath(); g.fill();
    }
  } else if (face === 'soul') {
    g.beginPath(); g.ellipse(x, y + 2.6 * s, 1.5 * s, 1 * s, 0, 0, TAU); g.fill();
  }
}

/* top-down arena view (Crown Carriers, Diner Dash…)
   o: {x, y, r, color, t, vx?, vy?, speedNorm?, squash?, hat?: 'none'|'paper',
       mouth?: 0..1, cos?: string[], ward?: {hat,face}, skin?: 0-100} */
export function drawDiverTop(g, o) {
  const r = o.r, sp = o.speedNorm != null ? o.speedNorm :
    clamp(Math.hypot(o.vx || 0, o.vy || 0) / 640, 0, 1);
  const n = Math.hypot(o.vx || 0, o.vy || 0) || 1;
  const fx = (o.vx || 0) / n, fy = (o.vy || 0) / n;
  g.save(); g.translate(o.x, o.y);
  if (o.rot) g.rotate(o.rot);
  const sq = 1 + (o.squash || 0) * 0.35;
  g.scale(sq, 1 / sq);
  // flailing limbs with little skin hands
  g.lineCap = 'round'; g.strokeStyle = shade(o.color, 0.85); g.lineWidth = r * 0.27;
  const handSkin = skinTone(o.skin == null ? 35 : o.skin);
  for (let l = 0; l < 4; l++) {
    const a = l * (Math.PI / 2) + Math.PI / 4 + Math.sin((o.t || 0) * 9 + l) * 0.4 * (0.3 + sp);
    const hx2 = Math.cos(a) * r * 1.15, hy2 = Math.sin(a) * r * 1.15;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(hx2, hy2); g.stroke();
    if (l < 2) { g.fillStyle = handSkin; g.beginPath(); g.arc(hx2, hy2, r * 0.16, 0, TAU); g.fill(); }
  }
  // body: radial gradient makes it read as a ball, not a disc
  const bg = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r * 1.15);
  bg.addColorStop(0, lightHex(o.color, 0.35)); bg.addColorStop(0.65, o.color); bg.addColorStop(1, shade(o.color, 0.72));
  g.fillStyle = bg; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, r * (1 + sp * 0.08), 0, TAU); g.fill(); g.stroke();
  // goggle band across the crown of the head — the diver's signature from above
  g.strokeStyle = GOGGLE; g.lineWidth = r * 0.22;
  g.beginPath(); g.arc(0, 0, r * 0.72, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = r * 0.06;
  g.beginPath(); g.arc(0, 0, r * 0.78, Math.PI * 1.3, Math.PI * 1.5); g.stroke();
  // eyes track motion
  const ex = fx * r * 0.22 * (sp > 0.02 ? 1 : 0), ey = fy * r * 0.22 * (sp > 0.02 ? 1 : 0);
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(-r * 0.27 + ex, -r * 0.12 + ey, r * 0.22, 0, TAU); g.fill();
  g.beginPath(); g.arc(r * 0.27 + ex, -r * 0.12 + ey, r * 0.22, 0, TAU); g.fill();
  g.fillStyle = OUTLINE;
  g.beginPath(); g.arc(-r * 0.27 + ex * 1.4, -r * 0.12 + ey * 1.4, r * 0.1, 0, TAU); g.fill();
  g.beginPath(); g.arc(r * 0.27 + ex * 1.4, -r * 0.12 + ey * 1.4, r * 0.1, 0, TAU); g.fill();
  if (o.ward && o.ward.body === 'f') {       // lashes, seen from above
    g.strokeStyle = OUTLINE; g.lineWidth = Math.max(1, r * 0.05);
    for (const sd of [-1, 1]) for (const a of [-0.3, 0.1, 0.5]) {
      const bx = sd * r * 0.27 + ex + Math.cos(a) * sd * r * 0.22, by = -r * 0.12 + ey - Math.sin(a + 0.6) * r * 0.22;
      g.beginPath(); g.moveTo(bx, by);
      g.lineTo(bx + Math.cos(a) * sd * r * 0.14, by - Math.sin(a + 0.6) * r * 0.14); g.stroke();
    }
  }
  // mouth: bigger with speed / override
  const mo = o.mouth != null ? o.mouth : sp;
  g.strokeStyle = OUTLINE; g.lineWidth = Math.max(1.5, r * 0.09);
  g.beginPath(); g.arc(0, r * 0.27, r * 0.12 + mo * r * 0.16, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
  // facial hair from above (subtle wedge)
  if (o.ward && o.ward.face && o.ward.face !== 'none') {
    g.fillStyle = '#503a26';
    g.beginPath(); g.ellipse(0, r * 0.5, r * 0.34, r * 0.14, 0, 0, TAU); g.fill();
  }
  // earned cosmetics visible from above
  if (o.cos) {
    if (o.cos.includes('cape')) {
      g.globalAlpha = 0.7; g.fillStyle = '#39ffb4';
      g.beginPath(); g.arc(0, r * 0.55, r * 0.85, 0.15 * Math.PI, 0.85 * Math.PI); g.fill();
      g.globalAlpha = 1;
    }
    if (o.cos.includes('nose')) {
      g.fillStyle = '#e04040'; g.strokeStyle = OUTLINE; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, r * 0.06, r * 0.18, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.arc(-r * 0.06, r * 0.0, r * 0.05, 0, TAU); g.fill();
    }
  }
  if (o.ward) drawHairTop(g, o.ward.hair, o.ward.hairCol || DEF_HAIR_COL, r);
  const hw = headwear(o.cos, o.ward);
  if (hw === 'crown') drawCrownAt(g, 0, -r * 0.72, r / 12);
  else if (hw === 'prop') drawPropAt(g, 0, -r * 0.78, r / 13, o.t);
  else if (hw && hw.startsWith('ward:')) drawWardHatTop(g, hw.slice(5), r);
  // hats
  if (o.hat === 'paper' && !hw) {
    g.fillStyle = '#fff'; g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-r * 0.65, -r * 0.62); g.lineTo(0, -r * 1.35); g.lineTo(r * 0.65, -r * 0.62);
    g.closePath(); g.fill(); g.stroke();
  }
  g.restore();
}
/* hair seen from above (translated/rotated body space) */
function drawHairTop(g, style, col, r) {
  if (!style || style === 'none') return;
  g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
  g.fillStyle = col;
  if (style === 'bowl' || style === 'long' || style === 'pony') {
    g.beginPath(); g.arc(0, -r * 0.25, r * 0.62, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); g.fill(); g.stroke();
    if (style === 'pony') {                  // tail trailing behind
      g.beginPath(); g.ellipse(0, r * 0.05, r * 0.16, r * 0.42, 0, 0, TAU); g.fill(); g.stroke();
    }
    if (style === 'long') {                  // curtains at the sides
      for (const sd of [-1, 1]) {
        g.beginPath(); g.ellipse(sd * r * 0.72, -r * 0.05, r * 0.18, r * 0.4, sd * 0.3, 0, TAU); g.fill(); g.stroke();
      }
    }
  } else if (style === 'spikes') {
    for (let k = 0; k < 5; k++) {
      const a = Math.PI * (1.1 + k * 0.2);
      const bx = Math.cos(a) * r * 0.5, by = Math.sin(a) * r * 0.5 - r * 0.15;
      g.beginPath();
      g.moveTo(bx - r * 0.09, by); g.lineTo(bx + Math.cos(a) * r * 0.38, by + Math.sin(a) * r * 0.38);
      g.lineTo(bx + r * 0.09, by); g.closePath(); g.fill(); g.stroke();
    }
    g.beginPath(); g.arc(0, -r * 0.25, r * 0.45, 0, TAU); g.fill(); g.stroke();
  } else if (style === 'curls') {
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * (1.05 + k * 0.18);
      g.beginPath(); g.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55 - r * 0.12, r * 0.2, 0, TAU); g.fill(); g.stroke();
    }
  } else if (style === 'mohawk') {
    roundRect(g, -r * 0.12, -r * 0.85, r * 0.24, r * 1.0, r * 0.1); g.fill(); g.stroke();
  }
}
/* wardrobe hats seen from above (drawn in the translated/rotated body space) */
function drawWardHatTop(g, hat, r) {
  g.strokeStyle = OUTLINE; g.lineWidth = 2;
  if (hat === 'cap') {
    g.fillStyle = '#e04040';
    g.beginPath(); g.arc(0, -r * 0.3, r * 0.5, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#c0392b';
    roundRect(g, -r * 0.36, -r * 1.1, r * 0.72, r * 0.45, r * 0.15); g.fill(); g.stroke();
  } else if (hat === 'beanie') {
    g.fillStyle = '#3a9d5c';
    g.beginPath(); g.arc(0, -r * 0.3, r * 0.5, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#f2ece2';
    g.beginPath(); g.arc(0, -r * 0.3, r * 0.16, 0, TAU); g.fill(); g.stroke();
  } else if (hat === 'tophat') {
    g.fillStyle = '#232028';
    g.beginPath(); g.arc(0, -r * 0.3, r * 0.55, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = '#e04040'; g.lineWidth = r * 0.1;
    g.beginPath(); g.arc(0, -r * 0.3, r * 0.42, 0, TAU); g.stroke();
  } else if (hat === 'viking') {
    g.fillStyle = '#9aa5b1';
    g.beginPath(); g.arc(0, -r * 0.3, r * 0.5, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#f2ece2';
    for (const sd of [-1, 1]) {
      g.beginPath(); g.ellipse(sd * r * 0.62, -r * 0.3, r * 0.28, r * 0.14, sd * 0.5, 0, TAU); g.fill(); g.stroke();
    }
  } else if (hat === 'crown') drawCrownAt(g, 0, -r * 0.72, r / 12);
  else if (hat === 'cowboy') {
    g.fillStyle = '#a3703a';
    g.beginPath(); g.ellipse(0, -r * 0.28, r * 0.85, r * 0.62, 0, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, -r * 0.28, r * 0.4, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = '#6e4423'; g.lineWidth = r * 0.08;
    g.beginPath(); g.arc(0, -r * 0.28, r * 0.32, 0, TAU); g.stroke();
  } else if (hat === 'party') {
    g.fillStyle = '#e08bd0';
    g.beginPath(); g.arc(0, -r * 0.3, r * 0.42, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.arc(0, -r * 0.3, r * 0.14, 0, TAU); g.fill(); g.stroke();
  } else if (hat === 'phones') {
    g.strokeStyle = '#2c3646'; g.lineWidth = r * 0.16;
    g.beginPath(); g.moveTo(-r * 0.72, -r * 0.1); g.quadraticCurveTo(0, -r * 0.75, r * 0.72, -r * 0.1); g.stroke();
    g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
    g.fillStyle = '#e04040';
    for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * r * 0.75, 0, r * 0.2, 0, TAU); g.fill(); g.stroke(); }
  } else if (hat === 'halo') {
    g.strokeStyle = '#ffd23f'; g.lineWidth = r * 0.1;
    g.beginPath(); g.arc(0, -r * 0.42, r * 0.5, 0, TAU); g.stroke();
  } else if (hat === 'wizard') {
    g.fillStyle = '#3b2f6e';
    g.beginPath(); g.arc(0, -r * 0.28, r * 0.6, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#ffd23f';
    g.font = Math.round(r * 0.4) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('★', 0, -r * 0.28); g.textBaseline = 'alphabetic';
  }
}

/* full standing front view — THE board model. Local units: ~56 tall, feet at y=28.
   o: {x, y, scale, color, t, cos?: string[], ward?: {hat,face}, skin?: 0-100,
       mood?: 'idle'|'cheer'} */
export function drawDiverStand(g, o) {
  const cos = o.cos || [], ward = o.ward || {};
  const skinV = o.skin == null ? 35 : o.skin;
  const skinC = skinTone(skinV), skinD = skinShade(skinV, 0.82);
  g.save(); g.translate(o.x, o.y); g.scale(o.scale, o.scale);
  const bob = Math.sin((o.t || 0) * 2.6) * 1.4;
  const cheer = o.mood === 'cheer' ? Math.abs(Math.sin((o.t || 0) * 8)) * 6 : 0;
  g.translate(0, bob - cheer);
  g.lineCap = 'round';
  // neon cape behind — attached at the shoulders, wavy hem
  if (cos.includes('cape')) {
    const wv = (o.t || 0) * 3;
    const cg = g.createLinearGradient(0, -10, 0, 26);
    cg.addColorStop(0, '#39ffb4'); cg.addColorStop(1, '#2bd9ff');
    g.fillStyle = cg; g.strokeStyle = OUTLINE; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-9.5, -7); g.lineTo(9.5, -7);
    g.lineTo(13 + Math.sin(wv) * 2, 22);
    for (let k = 3; k >= -3; k--)          // wavy bottom edge
      g.lineTo(k * 4.2, 24 + Math.sin(wv + k) * 1.6);
    g.lineTo(-13 - Math.sin(wv + 1) * 2, 22);
    g.closePath(); g.fill(); g.stroke();
  }
  // duck ring: back arc BEHIND the torso
  if (cos.includes('duck')) {
    g.fillStyle = '#f5c518'; g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(0, 6, 15.5, 8.5, 0, Math.PI, TAU); g.fill(); g.stroke();
  }
  // legs
  const bootC = cos.includes('boots') ? '#6e5a48' : '#2b6cb0';
  g.strokeStyle = bootC; g.lineWidth = cos.includes('boots') ? 7.5 : 6;
  g.beginPath(); g.moveTo(-5, 10); g.lineTo(-6, 24); g.stroke();
  g.beginPath(); g.moveTo(5, 10); g.lineTo(6, 24); g.stroke();
  // feet — real little sneakers with soles (squeaky shoes = banana yellow)
  const shoeTop = cos.includes('boots') ? '#57534e' : cos.includes('shoes') ? '#ffd23f' : '#3d3935';
  for (const sd of [-1, 1]) {
    const fx2 = sd * 6.5;
    g.fillStyle = shoeTop; g.strokeStyle = OUTLINE; g.lineWidth = 2;
    roundRect(g, fx2 - 5, 23, 10, cos.includes('boots') ? 7 : 5.5, 2.6); g.fill(); g.stroke();
    g.fillStyle = '#f2ece2';               // sole
    roundRect(g, fx2 - 5.4, 27, 10.8, 2.2, 1.1); g.fill(); g.stroke();
    if (cos.includes('shoes')) {           // squeaker dot
      g.fillStyle = '#e04040'; g.beginPath(); g.arc(fx2 + sd * 2, 25.4, 1.1, 0, TAU); g.fill();
    }
    if (cos.includes('boots')) {           // buckle
      g.fillStyle = '#ffd23f'; g.fillRect(fx2 - 2, 24.2, 4, 1.6);
    }
  }
  // torso: the T-SHIRT — custom color (falls back to the player's seat color);
  // female body tapers at the waist
  const shirt = ward.shirtCol || o.color;
  const fem = ward.body === 'f';
  const tg = g.createLinearGradient(0, -8, 0, 12);
  tg.addColorStop(0, lightShirt(shirt, 0.25)); tg.addColorStop(0.6, shirt); tg.addColorStop(1, shadeShirt(shirt, 0.78));
  g.fillStyle = tg; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  if (fem) {
    g.beginPath();
    g.moveTo(-10, -4); g.quadraticCurveTo(-10, -8, -6, -8);
    g.lineTo(6, -8); g.quadraticCurveTo(10, -8, 10, -4);
    g.quadraticCurveTo(7.2, 2, 8.6, 8);       // waist in, hem flares
    g.quadraticCurveTo(9.4, 12, 5, 12);
    g.lineTo(-5, 12); g.quadraticCurveTo(-9.4, 12, -8.6, 8);
    g.quadraticCurveTo(-7.2, 2, -10, -4);
    g.closePath(); g.fill(); g.stroke();
  } else {
    roundRect(g, -10, -8, 20, 20, 8); g.fill(); g.stroke();
  }
  // collar seam
  g.strokeStyle = shadeShirt(shirt, 0.6); g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 9); g.stroke();
  // duck ring: front arc + head OVER the torso
  if (cos.includes('duck')) {
    g.fillStyle = '#f5c518'; g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(0, 6, 15.5, 8.5, 0, 0, Math.PI); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(0, 7.4, 12.5, 6, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.fillStyle = '#f5c518'; g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
    g.beginPath(); g.arc(-14.5, -1, 4.8, 0, TAU); g.fill(); g.stroke();   // duck head
    g.fillStyle = '#e07326';
    g.beginPath(); g.moveTo(-19, -1.5); g.lineTo(-24, 0); g.lineTo(-19, 1.5); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = OUTLINE; g.beginPath(); g.arc(-15.6, -2.6, 1, 0, TAU); g.fill();
    g.fillStyle = '#f5c518';               // tail
    g.beginPath(); g.moveTo(14.5, 3); g.quadraticCurveTo(19, 0, 17.5, 6); g.closePath(); g.fill(); g.stroke();
  }
  // arms with skin HANDS (cheer = hands up) — sleeves match the shirt
  g.strokeStyle = shadeShirt(shirt, 0.8); g.lineWidth = 5.5;
  const armY = o.mood === 'cheer' ? -14 : 6;
  for (const sd of [-1, 1]) {
    const hx2 = sd * 14, hy2 = armY + Math.sin((o.t || 0) * 2.6) * 1.5 * sd;
    g.beginPath(); g.moveTo(sd * 9, -3); g.lineTo(hx2, hy2); g.stroke();
    g.fillStyle = skinC; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
    g.beginPath(); g.arc(hx2, hy2 + (o.mood === 'cheer' ? -1 : 1.5), 2.6, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = shadeShirt(shirt, 0.8); g.lineWidth = 5.5;
  }
  // head: skin with soft top-left highlight + chin shading
  const hg = g.createRadialGradient(-3, -20, 2, 0, -17, 11.5);
  hg.addColorStop(0, skinC); hg.addColorStop(0.75, skinC); hg.addColorStop(1, skinD);
  g.fillStyle = hg; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  g.beginPath(); g.arc(0, -17, 10, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.beginPath(); g.arc(-3.2, -20.5, 4.2, 0, TAU); g.fill();
  // ears
  g.fillStyle = skinC; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
  g.beginPath(); g.arc(-9.6, -16.5, 2, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.arc(9.6, -16.5, 2, 0, TAU); g.fill(); g.stroke();
  // goggles: strap wraps the head, lenses with glint
  g.strokeStyle = GOGGLE; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(-9.4, -19.5); g.lineTo(9.4, -19.5); g.stroke();
  g.fillStyle = GOGGLE; roundRect(g, -8.5, -21.5, 17, 6, 3); g.fill();
  g.fillStyle = LENS;
  g.beginPath(); g.arc(-4, -18.5, 2.7, 0, TAU); g.fill();
  g.beginPath(); g.arc(4, -18.5, 2.7, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(-4.8, -19.3, 0.9, 0, TAU); g.fill();
  g.beginPath(); g.arc(3.2, -19.3, 0.9, 0, TAU); g.fill();
  if (fem) {                                 // lashes at the lens corners
    g.strokeStyle = OUTLINE; g.lineWidth = 1;
    for (const [lx, sd] of [[-4, -1], [4, 1]]) {
      for (const a of [-0.5, 0, 0.5]) {
        g.beginPath();
        g.moveTo(lx + sd * 2.4 * Math.cos(a * 0.8 - 0.5), -18.5 - 2.4 * Math.sin(0.6 + a * 0.4));
        g.lineTo(lx + sd * 3.6 * Math.cos(a * 0.8 - 0.5), -18.5 - 3.5 * Math.sin(0.6 + a * 0.4));
        g.stroke();
      }
    }
  }
  // cheeks
  g.fillStyle = 'rgba(230,110,90,0.28)';
  g.beginPath(); g.arc(-6, -13.5, 1.8, 0, TAU); g.fill();
  g.beginPath(); g.arc(6, -13.5, 1.8, 0, TAU); g.fill();
  // face: burger mask covers it, clown nose sits on it
  if (cos.includes('burger')) {
    // a DRAWN burger mask (emoji fonts vary wildly per platform)
    g.strokeStyle = OUTLINE; g.lineWidth = 1.8;
    g.fillStyle = '#e8a34c';               // top bun
    g.beginPath(); g.arc(0, -13, 6.2, Math.PI, TAU); g.fill(); g.stroke();
    g.fillStyle = '#7dc75c';               // lettuce
    g.beginPath();
    for (let k = 0; k <= 6; k++) g[k ? 'lineTo' : 'moveTo'](-6.2 + k * 2.07, -12.6 + (k % 2) * 1.4);
    g.lineTo(6.2, -11); g.lineTo(-6.2, -11); g.closePath(); g.fill();
    g.fillStyle = '#8a4a2b';               // patty
    roundRect(g, -6.2, -11.2, 12.4, 2.6, 1.3); g.fill(); g.stroke();
    g.fillStyle = '#e8a34c';               // bottom bun
    roundRect(g, -5.8, -8.8, 11.6, 2.4, 1.2); g.fill(); g.stroke();
    g.fillStyle = '#fff';                  // sesame
    for (const sx of [-3, 0, 3]) { g.beginPath(); g.arc(sx, -15.2, 0.55, 0, TAU); g.fill(); }
  } else {
    g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
    g.beginPath(); g.arc(0, -13, 2.8, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    drawFaceHairFront(g, ward.face, 0, -11.5, 1, skinV, ward.faceCol || DEF_FACE_COL);
  }
  if (cos.includes('nose')) {
    g.fillStyle = '#e04040'; g.strokeStyle = OUTLINE; g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, -15.5, 2.5, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.arc(-0.8, -16.2, 0.8, 0, TAU); g.fill();
  }
  // hair first (colored), then headwear over it (earned crown > earned prop > hat)
  drawHairFront(g, ward.hair, ward.hairCol || DEF_HAIR_COL, 0, -17, 10, o.t);
  const hw = headwear(cos, ward);
  if (hw === 'crown') drawCrownAt(g, 0, -27.5, 1);
  else if (hw === 'prop') drawPropAt(g, 0, -26.5, 1, o.t);
  else if (hw && hw.startsWith('ward:')) drawWardHatFront(g, hw.slice(5), 0, -17, 10, o.t);
  g.restore();
}

/* from-behind standing view (intro scenes)
   o: {x, y, scale, color, t, pose: 'bat'|'stand', batAngle?, crouch? 0..1} */
export function drawDiverBack(g, o) {
  g.save(); g.translate(o.x, o.y); g.scale(o.scale, o.scale * (1 - (o.crouch || 0) * 0.15));
  g.lineCap = 'round';
  const wob = Math.sin((o.t || 0) * 2.2) * 1.2;
  g.strokeStyle = '#2b6cb0'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(-6, 10); g.lineTo(-11, 26); g.stroke();
  g.beginPath(); g.moveTo(6, 10); g.lineTo(11, 26); g.stroke();
  g.fillStyle = o.color; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  roundRect(g, -11, -8 + wob * 0.3, 22, 22, 8); g.fill(); g.stroke();
  g.fillStyle = '#6b4423';
  g.beginPath(); g.arc(0, -18 + wob * 0.4, 10.5, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = GOGGLE; roundRect(g, -9.5, -20 + wob * 0.4, 19, 4.5, 2); g.fill();
  if (o.pose === 'bat') {
    const ba = o.batAngle != null ? o.batAngle : -2.1;
    const gx = 10, gy = -8 + wob * 0.3;
    g.strokeStyle = shade(o.color); g.lineWidth = 6;
    g.beginPath(); g.moveTo(-8, -2); g.lineTo(gx - 2, gy); g.stroke();
    g.beginPath(); g.moveTo(8, -2); g.lineTo(gx, gy); g.stroke();
    g.save(); g.translate(gx, gy); g.rotate(ba);
    g.fillStyle = '#c9a06a'; g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
    roundRect(g, -2.6, -44, 5.2, 44, 2.5); g.fill(); g.stroke();
    g.fillStyle = '#8a5a2b'; roundRect(g, -2.6, -8, 5.2, 8, 2); g.fill();
    g.restore();
  } else {
    g.strokeStyle = shade(o.color); g.lineWidth = 6;
    g.beginPath(); g.moveTo(-10, -2); g.lineTo(-15, 8 + wob); g.stroke();
    g.beginPath(); g.moveTo(10, -2); g.lineTo(15, 8 - wob); g.stroke();
  }
  g.restore();
}

/* side-profile batting stance (Home Run Heroes) — faces screen-right toward the plate.
   o: {x, y, scale, color, t, charge: 0..1, swing: null | 0..1, skin?: 0-100} */
export function drawBatter(g, o) {
  const sw = o.swing;
  const charge = o.charge || 0;
  const skinC = skinTone(o.skin == null ? 35 : o.skin);
  g.save(); g.translate(o.x, o.y); g.scale(o.scale, o.scale);
  const hipRot = sw == null ? -0.08 - charge * 0.14 : lerp2(-0.22, 0.34, sw);
  const stride = sw == null ? 0 : Math.sin(Math.min(1, sw * 1.4) * Math.PI) * 4;
  g.lineCap = 'round';
  g.strokeStyle = '#2b6cb0'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(-4, 8); g.lineTo(-13, 26); g.stroke();
  g.beginPath(); g.moveTo(4, 8); g.lineTo(14 + stride, 26); g.stroke();
  g.save(); g.rotate(hipRot);
  const shirtB = (o.ward && o.ward.shirtCol) || o.color;
  const tg = g.createLinearGradient(0, -10, 0, 12);
  tg.addColorStop(0, lightShirt(shirtB, 0.22)); tg.addColorStop(1, shadeShirt(shirtB, 0.8));
  g.fillStyle = tg; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  roundRect(g, -9, -10, 18, 22, 7); g.fill(); g.stroke();
  let batAng, gx, gy;
  if (sw == null) {
    batAng = -2.35 - charge * 0.35 + Math.sin((o.t || 0) * 9) * charge * 0.06;
    gx = 3; gy = -12;
  } else if (sw < 0.45) {
    const f = sw / 0.45;
    batAng = lerp2(-2.35, -0.05, easeIn(f));
    gx = lerp2(3, 11, f); gy = lerp2(-12, -3, f);
  } else {
    const f = (sw - 0.45) / 0.55;
    batAng = lerp2(-0.05, 1.75, easeOut(f));
    gx = lerp2(11, 1, f); gy = lerp2(-3, -9, f);
  }
  g.strokeStyle = shade(o.color); g.lineWidth = 5.5;
  g.beginPath(); g.moveTo(-6, -4); g.lineTo(gx - 1.5, gy + 1); g.stroke();
  g.beginPath(); g.moveTo(6, -5); g.lineTo(gx + 1, gy); g.stroke();
  // gripping hands
  g.fillStyle = skinC; g.strokeStyle = OUTLINE; g.lineWidth = 1.5;
  g.beginPath(); g.arc(gx - 0.5, gy + 0.8, 2.4, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.arc(gx + 0.8, gy - 1, 2.4, 0, TAU); g.fill(); g.stroke();
  g.save(); g.translate(gx, gy); g.rotate(batAng);
  g.fillStyle = '#d2a468'; g.strokeStyle = OUTLINE; g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(-2, 4); g.lineTo(-1.7, -14); g.lineTo(-4.2, -34);
  g.quadraticCurveTo(-4.6, -44, 0, -44.6);
  g.quadraticCurveTo(4.6, -44, 4.2, -34);
  g.lineTo(1.7, -14); g.lineTo(2, 4);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#8a5a2b';
  g.beginPath(); g.arc(0, 5, 3.2, 0, TAU); g.fill(); g.stroke();
  g.restore();
  // head in profile: goggle band + one lens facing the pitcher
  g.fillStyle = skinC; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  g.beginPath(); g.arc(2, -18, 10, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = GOGGLE; roundRect(g, -7, -22, 19, 4.5, 2); g.fill();
  g.fillStyle = LENS;
  g.beginPath(); g.arc(8.5, -19.8, 2.8, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(7.8, -20.5, 0.9, 0, TAU); g.fill();
  g.fillStyle = OUTLINE;
  g.beginPath(); g.arc(9.5, -13.5, 1.4, 0, TAU); g.fill();
  g.restore();
  g.restore();
}
const lerp2 = (a, b, f) => a + (b - a) * f;
const easeIn = f => f * f;
const easeOut = f => 1 - (1 - f) * (1 - f);
