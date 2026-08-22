// THE DIVER — the one character model every minigame (and the future board game)
// shares. Canonical look, set by Tunnel Divers: chunky body in the player's
// color, tan skin, dark goggle band with ice-blue lenses, black outlines.
// Views: top-down (arenas), back (batting/standing), plus accessory options.
import { TAU, clamp } from './util.js';

export const SKIN = '#ffd9b3', OUTLINE = '#14100a', GOGGLE = '#2d3436', LENS = '#9ad3ff';

/* top-down arena view (Crown Carriers, Food Flash…)
   o: {x, y, r, color, t, vx?, vy?, speedNorm?, squash?, hat?: 'none'|'paper', mouth?: 0..1} */
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
  // hats
  if (o.hat === 'paper') {
    g.fillStyle = '#fff'; g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-r * 0.65, -r * 0.62); g.lineTo(0, -r * 1.35); g.lineTo(r * 0.65, -r * 0.62);
    g.closePath(); g.fill(); g.stroke();
  }
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
  g.fillStyle = SKIN; g.strokeStyle = OUTLINE; g.lineWidth = 3;
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
