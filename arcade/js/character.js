// THE DIVER — the one character model every minigame (and the future board game)
// shares. Canonical look, set by Tunnel Divers: chunky body in the player's
// color, tan skin, dark goggle band with ice-blue lenses, black outlines.
// Views: top-down (arenas), back (batting/standing), plus accessory options.
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

/* ---- cosmetic layers: one look, every game, updating as you collect ---- */
function headwear(cos) {
  if (!cos) return null;
  if (cos.includes('crown')) return 'crown';
  if (cos.includes('prop')) return 'prop';
  return null;
}
function drawCrownAt(g, x, y, s) {
  g.fillStyle = '#ffd23f'; g.strokeStyle = OUTLINE; g.lineWidth = 2 * s;
  g.beginPath();
  g.moveTo(x - 8 * s, y + 4 * s); g.lineTo(x - 8 * s, y - 3 * s); g.lineTo(x - 4 * s, y);
  g.lineTo(x, y - 6 * s); g.lineTo(x + 4 * s, y); g.lineTo(x + 8 * s, y - 3 * s); g.lineTo(x + 8 * s, y + 4 * s);
  g.closePath(); g.fill(); g.stroke();
}
function drawPropAt(g, x, y, s, t) {
  g.fillStyle = '#e04040'; g.strokeStyle = OUTLINE; g.lineWidth = 2 * s;
  g.beginPath(); g.arc(x, y + 2 * s, 6 * s, Math.PI, TAU); g.fill(); g.stroke();
  g.strokeStyle = OUTLINE; g.lineWidth = 1.6 * s;
  g.beginPath(); g.moveTo(x, y + 1 * s); g.lineTo(x, y - 4 * s); g.stroke();
  const a = (t || 0) * 14;
  g.fillStyle = '#ffd23f';
  g.save(); g.translate(x, y - 4 * s); g.rotate(a);
  g.fillRect(-8 * s, -1.2 * s, 16 * s, 2.4 * s); g.strokeRect(-8 * s, -1.2 * s, 16 * s, 2.4 * s);
  g.restore();
}

/* top-down arena view (Crown Carriers, Diner Dash…)
   o: {x, y, r, color, t, vx?, vy?, speedNorm?, squash?, hat?: 'none'|'paper',
       mouth?: 0..1, cos?: string[] (cosmetic ids)} */
export function drawDiverTop(g, o) {
  const r = o.r, sp = o.speedNorm != null ? o.speedNorm :
    clamp(Math.hypot(o.vx || 0, o.vy || 0) / 640, 0, 1);
  const n = Math.hypot(o.vx || 0, o.vy || 0) || 1;
  const fx = (o.vx || 0) / n, fy = (o.vy || 0) / n;
  g.save(); g.translate(o.x, o.y);
  if (o.rot) g.rotate(o.rot);
  const sq = 1 + (o.squash || 0) * 0.35;
  g.scale(sq, 1 / sq);
  // flailing limbs
  g.lineCap = 'round'; g.strokeStyle = o.color; g.lineWidth = r * 0.27;
  for (let l = 0; l < 4; l++) {
    const a = l * (Math.PI / 2) + Math.PI / 4 + Math.sin((o.t || 0) * 9 + l) * 0.4 * (0.3 + sp);
    g.beginPath(); g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15); g.stroke();
  }
  // body
  g.fillStyle = o.color; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, r * (1 + sp * 0.08), 0, TAU); g.fill(); g.stroke();
  // goggle band across the crown of the head — the diver's signature from above
  g.strokeStyle = GOGGLE; g.lineWidth = r * 0.22;
  g.beginPath(); g.arc(0, 0, r * 0.72, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  // eyes track motion
  const ex = fx * r * 0.22 * (sp > 0.02 ? 1 : 0), ey = fy * r * 0.22 * (sp > 0.02 ? 1 : 0);
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(-r * 0.27 + ex, -r * 0.12 + ey, r * 0.22, 0, TAU); g.fill();
  g.beginPath(); g.arc(r * 0.27 + ex, -r * 0.12 + ey, r * 0.22, 0, TAU); g.fill();
  g.fillStyle = OUTLINE;
  g.beginPath(); g.arc(-r * 0.27 + ex * 1.4, -r * 0.12 + ey * 1.4, r * 0.1, 0, TAU); g.fill();
  g.beginPath(); g.arc(r * 0.27 + ex * 1.4, -r * 0.12 + ey * 1.4, r * 0.1, 0, TAU); g.fill();
  // mouth: bigger with speed / override
  const mo = o.mouth != null ? o.mouth : sp;
  g.strokeStyle = OUTLINE; g.lineWidth = Math.max(1.5, r * 0.09);
  g.beginPath(); g.arc(0, r * 0.27, r * 0.12 + mo * r * 0.16, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
  // cosmetics visible from above
  if (o.cos) {
    if (o.cos.includes('cape')) {
      g.globalAlpha = 0.7; g.fillStyle = '#39ffb4';
      g.beginPath(); g.arc(0, r * 0.55, r * 0.85, 0.15 * Math.PI, 0.85 * Math.PI); g.fill();
      g.globalAlpha = 1;
    }
    if (o.cos.includes('nose')) {
      g.fillStyle = '#e04040'; g.strokeStyle = OUTLINE; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, r * 0.06, r * 0.18, 0, TAU); g.fill(); g.stroke();
    }
  }
  const hw = headwear(o.cos);
  if (hw === 'crown') drawCrownAt(g, 0, -r * 0.72, r / 12);
  else if (hw === 'prop') drawPropAt(g, 0, -r * 0.78, r / 13, o.t);
  // hats
  if (o.hat === 'paper' && !hw) {
    g.fillStyle = '#fff'; g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-r * 0.65, -r * 0.62); g.lineTo(0, -r * 1.35); g.lineTo(r * 0.65, -r * 0.62);
    g.closePath(); g.fill(); g.stroke();
  }
  g.restore();
}

/* full standing front view — THE board model. Local units: ~56 tall, feet at y=28.
   o: {x, y, scale, color, t, cos?: string[], mood?: 'idle'|'cheer'} */
export function drawDiverStand(g, o) {
  const cos = o.cos || [];
  g.save(); g.translate(o.x, o.y); g.scale(o.scale, o.scale);
  const bob = Math.sin((o.t || 0) * 2.6) * 1.4;
  const cheer = o.mood === 'cheer' ? Math.abs(Math.sin((o.t || 0) * 8)) * 6 : 0;
  g.translate(0, bob - cheer);
  g.lineCap = 'round';
  // neon cape behind
  if (cos.includes('cape')) {
    const wave = Math.sin((o.t || 0) * 3) * 2.5;
    const cg = g.createLinearGradient(0, -14, 0, 26);
    cg.addColorStop(0, '#39ffb4'); cg.addColorStop(1, '#2bd9ff');
    g.fillStyle = cg; g.strokeStyle = OUTLINE; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-9, -12); g.lineTo(9, -12);
    g.lineTo(13 + wave, 24); g.lineTo(-13 - wave, 24); g.closePath(); g.fill(); g.stroke();
  }
  // legs
  const bootC = cos.includes('boots') ? '#7a8794' : '#2b6cb0';
  g.strokeStyle = bootC; g.lineWidth = cos.includes('boots') ? 8 : 6;
  g.beginPath(); g.moveTo(-5, 10); g.lineTo(-6, 24); g.stroke();
  g.beginPath(); g.moveTo(5, 10); g.lineTo(6, 24); g.stroke();
  // feet
  g.fillStyle = cos.includes('boots') ? '#57534e' : cos.includes('shoes') ? '#ffd23f' : '#3d3935';
  g.strokeStyle = OUTLINE; g.lineWidth = 2;
  roundRect(g, -11, 24, 9, cos.includes('boots') ? 6.5 : 5, 2.5); g.fill(); g.stroke();
  roundRect(g, 2, 24, 9, cos.includes('boots') ? 6.5 : 5, 2.5); g.fill(); g.stroke();
  // duck suit ring around the torso
  if (cos.includes('duck')) {
    g.fillStyle = '#ffd23f'; g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(0, 4, 16, 9, 0, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.arc(-15, 0, 5, 0, TAU); g.fill(); g.stroke();     // duck head
    g.fillStyle = '#e07326';
    g.beginPath(); g.moveTo(-20, 0); g.lineTo(-25, 1.5); g.lineTo(-20, 3); g.closePath(); g.fill();
    g.fillStyle = OUTLINE; g.beginPath(); g.arc(-16, -1.5, 1, 0, TAU); g.fill();
  }
  // torso
  g.fillStyle = o.color; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  roundRect(g, -10, -8, 20, 20, 8); g.fill(); g.stroke();
  // arms (idle sway / cheer up)
  g.strokeStyle = shade(o.color); g.lineWidth = 5.5;
  const armY = o.mood === 'cheer' ? -14 : 6;
  g.beginPath(); g.moveTo(-9, -3); g.lineTo(-14, armY + Math.sin((o.t || 0) * 2.6) * 1.5); g.stroke();
  g.beginPath(); g.moveTo(9, -3); g.lineTo(14, armY - Math.sin((o.t || 0) * 2.6) * 1.5); g.stroke();
  // head
  g.fillStyle = o.skin != null ? skinTone(o.skin) : SKIN; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  g.beginPath(); g.arc(0, -17, 10, 0, TAU); g.fill(); g.stroke();
  // goggles
  g.fillStyle = GOGGLE; roundRect(g, -8.5, -21.5, 17, 6, 3); g.fill();
  g.fillStyle = LENS;
  g.beginPath(); g.arc(-4, -18.5, 2.6, 0, TAU); g.fill();
  g.beginPath(); g.arc(4, -18.5, 2.6, 0, TAU); g.fill();
  // face: burger mask covers it, clown nose sits on it
  if (cos.includes('burger')) {
    g.font = '11px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('🍔', 0, -11.5); g.textBaseline = 'alphabetic';
  } else {
    g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
    g.beginPath(); g.arc(0, -12.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  }
  if (cos.includes('nose')) {
    g.fillStyle = '#e04040'; g.strokeStyle = OUTLINE; g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, -15.5, 2.4, 0, TAU); g.fill(); g.stroke();
  }
  // headwear (crown beats propeller)
  const hw = headwear(cos);
  if (hw === 'crown') drawCrownAt(g, 0, -28, 1);
  else if (hw === 'prop') drawPropAt(g, 0, -27, 1, o.t);
  g.restore();
}

/* from-behind standing view (Home Run Heroes, intro scenes)
   Local units: body ~44 tall, feet at y≈26, head center ≈ -16. Scale with o.scale.
   o: {x, y, scale, color, t, pose: 'bat'|'stand', batAngle?, crouch? 0..1} */
export function drawDiverBack(g, o) {
  g.save(); g.translate(o.x, o.y); g.scale(o.scale, o.scale * (1 - (o.crouch || 0) * 0.15));
  g.lineCap = 'round';
  const wob = Math.sin((o.t || 0) * 2.2) * 1.2;
  // legs (spread batting stance)
  g.strokeStyle = '#2b6cb0'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(-6, 10); g.lineTo(-11, 26); g.stroke();
  g.beginPath(); g.moveTo(6, 10); g.lineTo(11, 26); g.stroke();
  // torso
  g.fillStyle = o.color; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  roundRect(g, -11, -8 + wob * 0.3, 22, 22, 8); g.fill(); g.stroke();
  // head (back: hair + goggle strap)
  g.fillStyle = '#6b4423';
  g.beginPath(); g.arc(0, -18 + wob * 0.4, 10.5, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = GOGGLE; roundRect(g, -9.5, -20 + wob * 0.4, 19, 4.5, 2); g.fill();
  if (o.pose === 'bat') {
    // both arms up to the bat grip
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
   o: {x, y, scale, color, t, charge: 0..1, swing: null | 0..1 (progress of the cut)} */
export function drawBatter(g, o) {
  const sw = o.swing;                      // null = waiting, 0..1 = mid-swing
  const charge = o.charge || 0;
  g.save(); g.translate(o.x, o.y); g.scale(o.scale, o.scale);
  // hips coil back with charge, rotate through during the swing
  const hipRot = sw == null ? -0.08 - charge * 0.14 : lerp2(-0.22, 0.34, sw);
  const stride = sw == null ? 0 : Math.sin(Math.min(1, sw * 1.4) * Math.PI) * 4;
  g.lineCap = 'round';
  // legs: back leg (screen-left), front leg strides toward the pitcher
  g.strokeStyle = '#2b6cb0'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(-4, 8); g.lineTo(-13, 26); g.stroke();
  g.beginPath(); g.moveTo(4, 8); g.lineTo(14 + stride, 26); g.stroke();
  g.save(); g.rotate(hipRot);
  // torso (profile: narrower than the back view)
  g.fillStyle = o.color; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  roundRect(g, -9, -10, 18, 22, 7); g.fill(); g.stroke();
  // bat: grip point + angle animate through a real cut —
  // cocked up behind the shoulder → level through the zone → wrapped follow-through
  let batAng, gx, gy;
  if (sw == null) {
    batAng = -2.35 - charge * 0.35 + Math.sin((o.t || 0) * 9) * charge * 0.06;
    gx = 3; gy = -12;
  } else if (sw < 0.45) {                  // the cut: whip down and through
    const f = sw / 0.45;
    batAng = lerp2(-2.35, -0.05, easeIn(f));
    gx = lerp2(3, 11, f); gy = lerp2(-12, -3, f);
  } else {                                 // follow-through wraps around
    const f = (sw - 0.45) / 0.55;
    batAng = lerp2(-0.05, 1.75, easeOut(f));
    gx = lerp2(11, 1, f); gy = lerp2(-3, -9, f);
  }
  // arms: both hands to the grip
  g.strokeStyle = shade(o.color); g.lineWidth = 5.5;
  g.beginPath(); g.moveTo(-6, -4); g.lineTo(gx - 1.5, gy + 1); g.stroke();
  g.beginPath(); g.moveTo(6, -5); g.lineTo(gx + 1, gy); g.stroke();
  // the bat: knob, thin handle, tapered barrel with a rounded tip
  g.save(); g.translate(gx, gy); g.rotate(batAng);
  g.fillStyle = '#d2a468'; g.strokeStyle = OUTLINE; g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(-2, 4);                          // knob side
  g.lineTo(-1.7, -14);                      // handle
  g.lineTo(-4.2, -34);                      // taper out
  g.quadraticCurveTo(-4.6, -44, 0, -44.6);  // rounded tip
  g.quadraticCurveTo(4.6, -44, 4.2, -34);
  g.lineTo(1.7, -14);
  g.lineTo(2, 4);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#8a5a2b';                  // knob
  g.beginPath(); g.arc(0, 5, 3.2, 0, TAU); g.fill(); g.stroke();
  g.restore();
  // head in profile: goggle band + one lens facing the pitcher
  g.fillStyle = o.skin != null ? skinTone(o.skin) : SKIN; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  g.beginPath(); g.arc(2, -18, 10, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = GOGGLE; roundRect(g, -7, -22, 19, 4.5, 2); g.fill();
  g.fillStyle = LENS;
  g.beginPath(); g.arc(8.5, -19.8, 2.8, 0, TAU); g.fill();
  g.fillStyle = OUTLINE;                    // determined little mouth
  g.beginPath(); g.arc(9.5, -13.5, 1.4, 0, TAU); g.fill();
  g.restore();
  g.restore();
}
const lerp2 = (a, b, f) => a + (b - a) * f;
const easeIn = f => f * f;
const easeOut = f => 1 - (1 - f) * (1 - f);

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r); g.closePath();
}
function shade(hex) {  // slightly darker arm tone of the jersey color
  try {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.round(c * 0.78));
    return 'rgb(' + f(n >> 16 & 255) + ',' + f(n >> 8 & 255) + ',' + f(n & 255) + ')';
  } catch (e) { return hex; }
}
