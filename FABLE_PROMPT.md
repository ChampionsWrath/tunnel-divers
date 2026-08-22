# Tunnel Divers — one-pass build prompt

Paste everything below the line into Fable as a **single message**. Don't converse with it first;
the spec is written to be self-sufficient.

---

Build me a complete, playable arcade game called **Tunnel Divers** and publish it as an artifact so
I get a URL I can open on my PC and my iPhone.

## Hard constraints — read these first, they are not negotiable

- **One self-contained HTML file.** No external scripts, stylesheets, fonts, images, or network
  requests of any kind. A strict CSP blocks all external hosts, so a CDN import will simply fail.
  That means **no Three.js, no physics library, no framework** — plain HTML, CSS and JavaScript.
- **All rendering is Canvas 2D.** No WebGL. The 3D look comes from perspective projection done by
  hand (math is specified below). This is a solved problem and it looks great — do not try to
  hand-roll a WebGL renderer instead.
- **No build step, no modules, no bundler.** One `<script>` block.
- **Must run at 60fps on an iPhone 12 in Safari** and on desktop Chrome. Prefer cheap draw calls
  over visual richness everywhere they conflict.
- **Ship it complete.** No TODOs, no placeholder functions, no "left as an exercise". Every feature
  described below should be working when I open the URL.

## The game

You are a tunnel diver. You jump into a hole and fall. The camera looks straight down the tunnel
with you in the foreground, slightly below centre. Obstacles rush up at you out of the dark and you
steer to avoid them, collecting coins and powerups. The longer you survive, the faster you fall and
the meaner the tunnel gets. Reference feel: the Millennium Falcon trench/tunnel sequence from
*Rebel Assault II*. Tone: silly, chunky, cartoonish — think *Gang Beasts*, not *Alien*.

The run ends when you take too many hits. Score is depth in metres plus coin bonuses.

## Rendering: pseudo-3D projection

Keep everything in "tunnel space": each object has `x`, `y` (offset from the tunnel's centre line)
and `z` (distance ahead of the player). The player sits permanently at `z = 0` — **the world moves
past the player, the player never moves forward.** This gives infinite depth with no precision drift.

```
FOCAL = 320
scale   = FOCAL / (z + FOCAL)
screenX = centreX + (obj.x - camX) * scale
screenY = centreY + (obj.y - camY) * scale
size    = obj.radius * scale
```

Draw strictly **back to front** (painter's algorithm): sort by descending `z`, cull anything with
`z < 1` or `z > RENDER_DIST`.

**The tunnel itself** is ~40 concentric rings spaced evenly from `z = 0` out to `RENDER_DIST`,
each drawn as a stroked circle (or a 12-sided polygon — cheaper and looks appropriately chunky).
Ring brightness falls off with depth so the tunnel fades into blackness at the vanishing point.
Scroll the rings toward the camera each frame and recycle them; that scrolling motion is what sells
the speed.

**Make the tunnel snake.** Each ring's centre is offset laterally by a smooth function of its depth,
e.g. `cx = sin(z * 0.0007) * 90 + sin(z * 0.0013) * 55`. The camera follows that centre line with a
lag of about 120ms. This one detail is the difference between "falling down a pipe" and "flying".
Obstacle positions must be offset by the same function so they stay attached to the tunnel.

**Camera** also drifts slightly toward the player's lateral position (about 25% of their offset) and
gets a small roll proportional to lateral velocity. Add a subtle FOV punch — raise `FOCAL` by up to
40 as fall speed increases.

## Controls

Detect and support both, simultaneously, with no mode switch:

- **Touch:** drag anywhere on screen. The stick is *relative to where the finger first landed*, not
  a fixed on-screen pad. One-handed play must work. Set `touch-action: none` and a
  `user-scalable=no` viewport so Safari doesn't scroll or zoom the page mid-run.
- **Keyboard:** WASD and arrow keys. Space = dive.
- Optional **dive** input (hold): +45% fall speed while held, which means more score and less
  reaction time.

**Steering is acceleration, not position.** Input sets acceleration; velocity carries momentum and
decays. The overshoot-and-correct loop *is* the game — never snap the diver to the cursor or finger.

```
LATERAL_ACCEL  = 2600   // units/s^2
LATERAL_DRAG   = 3.2    // vel *= exp(-DRAG * dt)
LATERAL_MAX    = 700    // units/s
```

## Tuning constants — start here, they are already roughly balanced

```
TUNNEL_RADIUS   = 260        // player must stay inside this
PLAYER_RADIUS   = 18
RENDER_DIST     = 3000
CHUNK_LENGTH    = 600
FALL_START      = 380        // units/s
FALL_ACCEL      = 8          // units/s added per second survived
FALL_MAX        = 1400
LIVES           = 3
IFRAMES         = 1.2        // seconds of invulnerability after a hit
```

Hitting the tunnel wall is a graze: push back inward, small speed loss, no life lost.

## Obstacles — author these as reusable chunk patterns

Build a library of **at least 10** patterns, each occupying one chunk of tunnel and tagged with a
difficulty tier (1–5). Suggestions:

1. **Gate** — a ring with a single gap you must line up with
2. **Rotating gate** — same, but the gap rotates as it approaches
3. **Bars** — 2–3 parallel bars across the tunnel, slalom between them
4. **Debris field** — scattered floating rocks, loose and forgiving
5. **Throat** — the tunnel narrows sharply for a stretch
6. **Fan** — spinning blades, timing based
7. **Pillars** — vertical columns, weave left/right
8. **Wall crawlers** — hazards hugging the tunnel wall, safe in the middle
9. **Checkerboard** — alternating blocked quadrants
10. **Pendulum** — a hazard swinging across the centre

## Difficulty and generation

**Everything generates from a seed.** Write a small deterministic PRNG (mulberry32 is four lines) —
do not use `Math.random()` for world generation. The same seed must always produce the same tunnel.
Show the seed on the game-over screen and let me enter one to replay a specific tunnel.

Difficulty tier rises with depth: tier 1 for the first ~600m, then a new tier roughly every 700m,
capping at tier 5. Pick chunks from the pool of tiers currently unlocked, weighted toward the
harder end, and never repeat the same pattern twice in a row.

**Rest beats matter.** Every 4th or 5th chunk must be open and easy. Unbroken pressure goes numb;
the calm stretch is what makes the next tight section land.

## Pickups

- **Coins** — arranged in arcs and trails that deliberately lead you through the safe line of the
  chunk ahead. This is how the player learns to read patterns. +10 each, and they should feel great
  to hoover up.
- **Shield** — absorbs the next hit
- **Magnet** — pulls coins toward you for 8s
- **Umbrella** — slows the fall 40% for 6s (a breather, and a score sacrifice)
- **Tiny** — shrinks your hitbox 50% for 8s

## Feel — budget real effort here, it is most of the game

- Speed lines / wind streaks radiating from the vanishing point, density scaling with fall speed
- Screen shake on impact; a quick red vignette flash and a shove off-course
- **Near-miss detection:** passing within ~30 units of a hazard triggers a brief slow-motion dip,
  a whoosh, and a "CLOSE!" popup with bonus points. This is the single highest-value polish item —
  it turns near-death into a reward.
- Chunky, cartoonish diver: a body with limbs that flail with lateral movement and drag behind at
  speed, plus a scarf that streams. Faces reacting to speed and hits. Make it read as *panicking*.
- Coin pickup pops, a rising combo pitch, a satisfying impact thud
- Sound via the WebAudio API, generated in code (oscillators + noise buffers — no audio files).
  **Create the AudioContext only on the first user gesture** or iOS will silently block it. Include
  a mute button.
- Depth counter, coin count, and lives in a clean HUD

## Meta

- **Ghost of your best run.** Record your position track each run to `localStorage`; on the next run
  render a translucent diver replaying your personal best alongside you. Cheap to build, and it makes
  a solo game feel social.
- High score and best depth persisted to `localStorage`
- Title screen with a big "DIVE" button; game-over screen showing depth, coins, seed, best, and a
  one-tap restart

## Safari / iOS specifics — these break real builds, handle them explicitly

- Use `100dvh` (not `100vh`) or size the canvas from JS on resize; Safari's toolbar breaks `100vh`
- Handle `devicePixelRatio` so the canvas isn't blurry on retina, but **cap it at 2** for performance
- Fixed-timestep accumulator for the simulation, interpolated rendering — the game must behave
  identically at 60Hz and 120Hz ProMotion
- Clamp delta time (max ~50ms) so tab-switching doesn't teleport the player through a wall
- Pause on `visibilitychange` and on window blur
- Prevent double-tap zoom, pull-to-refresh, and text selection on the canvas

## Definition of done

Before you finish, verify every one of these:

- [ ] Opens and plays on desktop and on an iPhone with no errors in the console
- [ ] Touch drag steers with visible momentum and overshoot; keyboard works too
- [ ] The tunnel visibly curves and snakes; it does not look like a straight pipe
- [ ] At least 10 distinct chunk patterns appear, and difficulty demonstrably rises with depth
- [ ] Same seed reproduces the same tunnel, every time
- [ ] Coins, all 4 powerups, lives, i-frames and game-over all function
- [ ] Near-miss slow-motion triggers and rewards points
- [ ] Sound works and starts only after the first tap; mute button works
- [ ] Ghost of the previous best run renders on the second and subsequent runs
- [ ] Holds 60fps with a full screen of obstacles

Use a fun emoji favicon and give it a proper title. Prioritise *how the falling feels* over visual
richness — if you have to choose, cut the decoration and spend it on camera, momentum and impact.

---

## Notes for me (not for Fable)

**If I want a real URL with Three.js instead of an artifact**, the same spec mostly applies, but:
delete the "no external scripts" constraint, ask for a Vite + TypeScript project using Three.js and
Rapier, and expect to run `npm install && npm run build` and deploy to Netlify/Vercel/GitHub Pages
myself. That is *not* one pass — it's a repo plus a deploy step, and it can't hand me back a live
link on its own.

**Multiplayer is deliberately absent.** It needs a server, which an artifact cannot have. The ghost
run is the stand-in. Live rooms come after the core is proven fun.

**This prompt's real job** is answering one question: *is the falling fun with cubes and no art?*
If yes, rebuild it properly in Three.js. If no, I've spent one prompt instead of a month.
