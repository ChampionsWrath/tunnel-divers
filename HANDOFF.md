# Tunnel Divers / Divers Arcade — Handoff

## 📏 STANDING RULE (Sam, 2026-08-22): every minigame must open with a
## Mario Party-style intro: live practice arena + how-to card + all humans
## ready up + 3-2-1 countdown. This is implemented ONCE in the shell
## (main.js startGame → practice instance w/ ctx.practice:true → checkAllReady →
## real instance + countdown). New games only need: a `howto:{goal,touch,keys,tip}`
## export and to honor `ctx.practice` (no timer, no scoring, no end()).

## Session 2026-08-22 (round 7) — shared character + Home Run POV
- **`arcade/js/character.js` — THE DIVER, the canonical player model** (matches
  Tunnel Divers' look: player-color body, tan skin, dark goggle band, ice-blue
  lenses, black outline). `drawDiverTop` (arenas: crown, food w/ hat:'paper')
  and `drawDiverBack` (batting/standing). RULE: any minigame that shows the
  player uses this module; reticle/cursor games (blast, brain, trivia) don't
  show a model. This is the board-game avatar.
- Home Run Heroes rewritten to batter's-eye POV (MLB The Show cam): pitch grows
  toward camera (drift variance), full ballpark (3 curved crowd tiers, light
  towers, jumbotron w/ live distance ticker, blue wall + yellow line, mow
  stripes, batter's boxes), Flick Home Run scoring: crit stacks on
  q>0.85&charge>0.88 (×1.7-3) and q>0.96&charge>0.97 (×2.6-6): milestones
  HOME RUN 120m / OUT OF THE PARK 300m / 🚀 SPACE 800m (sky→starfield).
- imports ?v=5. Deployed.

## Session 2026-08-22 (round 10) — asymmetric Ghost Grabbers + HR flight v2
- ghost.js has TWO modes: `asym` (online, ≥2 humans): seeded hunter pick
  (sorted ids, seed % n), everyone else ghosts in ONE shared house; fills to 3
  ghosts w/ host-simulated bots. Roles switch live on capture (ghost→hunter).
  Capture 2.5s (was 5). Placements: hunter-win = hunter 1st + reverse capture
  order; ghost-win = ghosts by distance roamed (survivors first), hunter last.
  Net msgs: st(10Hz pos/room/beam/dist), bot, lit(8Hz), cap, end. Each hunter
  client = authority for own beam. Classic scored mode kept for local/solo.
  ⚠ untested with real multi-device peers — Sam should 3-player test.
- Home Run flight = horizontal side-chase (stadium slides away left, ocean
  surface + boat, clouds/birds band, diagonal climb to starfield + aliens for
  moonshots, splash ending for sub-space hits).
- imports ?v=10. Deployed.

## Session 2026-08-22 (round 9) — multiplayer joining FIXED
- Sam's 3-player real-world test failed: all players alone in same-code rooms.
  Cause: Trystero 'torrent' strategy → public WebTorrent trackers often dead →
  silent discovery failure. net.js now uses **'nostr' strategy** with pinned
  relays (damus.io, nos.lol, relay.nostr.band, nostr.mom, snort.social,
  redundancy 4) + **STUN + openrelay TURN** in rtcConfig. appId bumped to
  tunnel-divers-arcade-v2. Lobby shows 'N in room · M relays' + hints
  (self-refreshing line). Verified 2-tab discovery on the new stack.
- ⚠ if joining breaks again: check relayCount() in lobby line first — 0 relays
  = outbound wss blocked/relay list rotted; swap RELAYS list in net.js.

## Session 2026-08-22 (round 8) — roster now 11 games
- **Ghost Grabbers** (`games/ghost.js`): 3×3 room house, beam-cone capture (5s),
  captured ghosts → assistant hunters w/ minimap pings; giggle+glimpse hints;
  darkness = offscreen mask canvas. v1 = scored hunter runs (bots as ghosts);
  TRUE asymmetric hunter-vs-ghosts online = server phase (Sam's original spec).
- **Grid N' Greed** (`games/greed.js`): shared 5×5 push-your-luck vault,
  $25-$1000 + monster, persistent reveals (memory), reshuffle on monster,
  BANK button/Space, 3 turns each, bot greed personalities, odds readout.
- **Floor is Lava** (`games/lava.js`): 4-color tile grid over lava, safe-color
  calls w/ shrinking timers, dash-shoving (crown physics), safe tiles 6→1,
  elimination placements, practice = respawn.
- Board Game gauntlet = 5 random picks of the 11 now.
- Also this round: Home Run follow-cam (ocean/boat → clouds/birds → space/aliens,
  EXPERIMENTAL, old version at git 13c1201), trivia bank v2 (14×8 pub-quiz).
- imports ?v=8. Deployed.

## Session 2026-08-22 (round 6) — roster now 8 games
- Fixed swipe-mode taps: quick still press (<250ms/<12px) fires taps[0] on
  release (ready screens + Stack drops were dead on phones in swipe mode).
- Food Flash map v2: stations in 4 corners (dead-ends), tables mid-floor,
  trash left wall, 0.7s grab cooldown → no accidental pickups.
- **Home Run Heroes** (`games/homerun.js`): 10 pitches, hold=charge (1.1s to
  full), release=swing; contact q from |ball−plate| (13% window), dist ≈
  22+charge*(0.35+0.65q)*118 m; pitch speed varies; total distance wins.
- **Trivia Triathlon** (`games/trivia.js`): BANK = 8 cats × 10 evergreen Qs
  (correct answer FIRST in source, shuffled at build). Seeded run: 3 cats ×
  3 Qs + bonus (2pts, any cat). 12s/Q, one pick, reveal. Hot-seat gets fresh
  Qs per player. Perfect score = 11.
- Imports at ?v=4. Deployed (git push).

## Session 2026-08-22 (round 5) — tilt pipeline v2
- input.js tiltXY: 14Hz low-pass on sensor, 1.5° deadzone, ~16.5° full deflection,
  pow-1.3 easing. Orientation is PLAYER-CHOSEN via picker on every ready-up card
  (shown when touch + tilt; auto-defaults from window aspect); landscape rotation
  direction detected from gamma sign at calibration — screen.orientation is never
  trusted (home-screen PWAs misreport it).
- Fixed: Bottle Blasters crashed rendering the countdown (cans undefined pre-startRun).
- ⚠ RULE: main.js imports carry `?v=N` — BUMP THE VERSION whenever you edit any
  imported module, or stale caches (preview pane, phone PWAs) keep old code.

## Session 2026-08-22 (round 4) — roster now 6 games
- **Bottle Blasters** (`games/blast.js`): farm skeet shoot, tap/click = shoot
  (reticle at pointer, 0.22s fire cooldown). MP: shared seeded can stream,
  spawn ramps 1→2.6/s over 75s, gold cans 3pts. Solo: 30s countdown, green
  clock cans +4s on an independent 5.5-10.5s luck timer (deliberately NOT tied
  to the spawn ramp — aimbot verified dead at ~58s, forever takes luck).
- **Food Flash** (`games/food.js`): 50s-diner Overcooked-lite. Steer, touch a
  counter station to grab (1 item hands, touch=swap, trash bin), touch table to
  serve; complete all order items → table served. MP: most tables in 75s.
  Solo: 40s clock, +3s/serve, +7s RUSH; order size ramps 1-2→3 items AND drain
  accelerates past 45s (optimal scripted bot dies ~189s; humans ~90-120s).
- Both honor the intro rule + practice, bots = seeded timelines, hot-seat +
  online sync, in gauntlet (now 6 rounds).

## Session 2026-08-22 (round 3)
- **Crown Carriers grab shield**: picking up the crown grants 2.5s immunity
  (gold pulsing ring); dash-thieves BOUNCE off a shielded carrier; bots lunge
  1.8x slower and skip shielded targets. This is the anti-"instant drop" fix —
  Sam explicitly didn't want multi-hit knocks.
- **New minigame: Big Brain** (`games/brain.js`, id 'brain') — mental math,
  steer onto the correct answer pad (4 corner pads, virtual 100x62 stage).
  Correct = instant next question. MP = simple math (L1-3 mix) volume race,
  75s, most correct wins; bots answer on precomputed seeded timelines; online
  syncs scores at 0.5s. SOLO (exactly 1 player in lobby) = difficulty scales
  L1→L8 every 2 correct, points = level, 3 strikes (wrong OR timeout) = out.
  KEY RULE: must step off all pads before answers re-arm (prevents
  standing-on-pad auto-answer). Gauntlet now runs all 4 games.

## Session 2026-08-22 (fixes after Sam's first playtest)
- Stack Attack: camera bug fixed — crane/piece spawn were in mixed screen/world
  coords so at height pieces spawned inside the tower; also a doubled camera
  translate in render. All world-space now; spawn rides the visible screen top.
- Crown Steal reworked per feedback: wider arena (S=0.5·min, shrink 1→0.62),
  edge is a bouncy BARRIER (no fall-outs), knocked crown launches in a random
  direction at high speed and ricochets off walls (chase it), holder is heavier
  (0.45× knockback) and slower (0.78× max speed), dash got a hit-window
  (0.35s, lower knock threshold), trail effect, and an on-screen DASH hint.
- Games now use ctx.onNet(handler) instead of overwriting net.onMsg (main.js
  routes 'g' messages to the active game; lobby msgs keep working after games).

## ⭐ Session 2026-08-22 (later): DIVERS ARCADE built (`arcade/`)
Long-term plan (agreed): Mario Party-style platform. Web-first, **no build step** (plain ES
modules — exFAT-safe, deploys anywhere), Capacitor→App Store / Tauri→Steam later.
Multiplayer: WebRTC P2P via Trystero (torrent signaling, $0, CDN-imported lazily — local play
never touches network). Supabase free tier later for accounts/coins.

- `arcade/index.html` + `css/shell.css` — shell screens (home/settings/lobby/results)
- `arcade/js/`: `util` `audio` (sfx+music sequencer) `input` (WASD/arrows/touch/tilt, 2 local
  slots) `net` (Net class, room codes, host flag) `main` (lobby, mode select, gauntlet, runner)
- `arcade/js/games/`: minigame contract = `{id,name,icon,desc,create(ctx)}`;
  ctx = `{cv,g,dim,players,seed,net,input,audio,end(results)}`
  - **tunnel.js** — TD cut: 75s depth race, TunnelWorld class (full zone/pattern/creature port),
    hot-seat turns w/ ghost replays, online live ghosts, bots pre-simulated headless (skill+lapses)
  - **stack.js** — shared-tower crane stacking, turn-based, lean/topple, elimination,
    solo=3-miss height chase, bots host-authoritative online, 42-piece ceiling tie
  - **crown.js** — top-down shrinking arena, momentum+dash bumps, crown-time scoring,
    fills to 4 with bots (host-authoritative online), 75s
- **Modes**: Board Game (default; gauntlet of all 3 w/ placement points + standings + champion —
  real board TBD), or any single minigame. Anyone in lobby can switch mode (owner-only later).
- **Rooms**: HOST → 4-letter code; JOIN from any device. Verified 2-tab: peers discover, lobby
  syncs, ordering deterministic. In-game sync smoke-tested at channel level only — verify
  PC-host + phone-join on LAN for real.
- Verified headless: all 3 games end-to-end ×multiple seeds, full 3-round gauntlet, standings.
  ⚠ Hidden-pane tests report window size 0 — always set `ARC.dim` when driving headless.
- NOT done: deploy to GitHub Pages (needs Sam's gh login), cosmetics in arcade (standalone TD
  keeps them; arcade uses name+color), the actual board, owner-only mode lock.

## Deploy — LIVE on GitHub Pages (2026-08-22) ✅
- Repo: https://github.com/ChampionsWrath/tunnel-divers (public, gh CLI authed locally)
- **Arcade: https://championswrath.github.io/tunnel-divers/arcade/**
- **Solo TD: https://championswrath.github.io/tunnel-divers/tunnel-divers.html**
- Tilt works here (direct URL, no iframe). These are the canonical share links now.
- To publish future changes: commit then `git push` (Pages rebuilds automatically, ~1 min).
- LAN server (`python -m http.server 8137 --bind 0.0.0.0` in this folder) remains an option
  for offline dev; the Claude artifact remains a dev preview only.

## What this is
Falling tunnel-dodger arcade game (Rebel Assault II falcon-run feel, Gang Beasts tone).
**Single self-contained HTML file** — no build, no deps, Canvas 2D pseudo-3D. PC + iPhone from one URL.

- Source: `tunnel-divers.html` (everything: CSS, JS, audio synth, world gen)
- Live artifact: https://claude.ai/code/artifact/92aad5e1-daec-4519-a679-e249eaf27be4
  (private to Sam's Claude login by default — use the page's share menu for a public link)
- LAN testing: `python -m http.server 8137 --bind 0.0.0.0` in this folder → `http://<pc-ip>:8137/tunnel-divers.html`
- Fable one-pass spec that seeded the project: `FABLE_PROMPT.md`

## Architecture (all in the one file)
- **Projection**: world moves past player at z=0; `scale = FOCAL/(z+FOCAL)`; painter's sort.
  Tunnel = 12-gon rings every 75 units; snaking centerline `curX/curY(depth)`.
- **Sim**: fixed 120Hz timestep + interpolated render; momentum steering (accel not position).
- **World gen**: seeded (mulberry32 per chunk, `seed ^ chunkIndex*0x9E3779B9`) — same seed = same tunnel.
  600-unit chunks; pattern library w/ tiers 1–5; rest chunk every 5th. 10 units = 1m.
- **Zones** (depth-themed biomes, `ZONES[]`): grass/dirt → STONE (250m) → OCEAN (700m) →
  THE CORE (1250m) → THE BEYOND (1900m+). Each has ring HSL, bg gradient, obstacle palette,
  streak color, ambient particles (bubbles/embers/twinkles), zone-entry banner +100.
- **Creatures**: ocean tentacles (m:4, reach in from wall), core lava spouts (m:5, telegraphed
  38%-duty jets, dormant = harmless glow), void eyes (pupils track player), jellyfish pendulums, wisps.
- **Fairness**: hit needs 6-unit penetration (skims = near-miss), gaps widen with terminal
  velocity (`GML`), gate/checker safe paths chained via `chainAng`, TR 320 (was 260).
- **Intro**: 3.25s over-the-shoulder cinematic (grass field → leap → zoom into hole), skippable,
  auto-skipped for prefers-reduced-motion; plays from title DIVE only, not on retry.
- **Meta**: ghost of best run (localStorage `td_best_v1`), powerup HUD chips w/ timer bars,
  seed replay UI, WebAudio synth SFX + speed-pitched wind (gesture-unlocked, `td_mute`).

## Session 2026-08-21 additions
- **`<meta charset="utf-8">`** added (was missing → emoji mojibake on iPhone Safari via the
  LAN python server, which sends no charset header; Chrome sniffed UTF-8 so desktop looked fine)
- **Touch tuning**: virtual stick full-tilt at 38px (was 80px), deadzone 5 (was 10), anchor
  drift 1.2/s (was 1.8). This was the "input lag" — mapping, not platform; a Capacitor/WKWebView
  App Store build will feel the same as Safari.
- **Laser gun replaces umbrella** (`pow.laser`, 4s): destroys hazards within `62+r*0.6` lateral
  of player, z 20–900, +5/kill, green beam to vanishing point. Verified: 14 kills/4s when aimed
  at obstacles, 0 damage taken. Umbrella is fully gone.
- **Cosmetics** (🎨 menu, free, localStorage `td_cos1`): hats/hair ×8, shirts ×7 (incl rainbow),
  pants ×6 (incl shorts/rainbow), facial hair ×5, trails ×7 (scarves/rainbow/fire/bubbles/sparkle).
  `drawBody(g,t,back,panic)` shared by gameplay, intro (back view), and live preview canvas.
  Later: tie to user accounts + persistent coins (not built).
- **Serverless multiplayer**: 📅 DAILY DIVE (seed = YYYYMMDD, same tunnel worldwide);
  👥 RIVALS — run compresses to `TDV1|seed|score|depth|name|base64(varint deltas)` code
  (~1KB, 10Hz samples, `makeCode`/`decCode`), friends paste codes, rival ghosts (max 4, colored,
  named) fall alongside on matching seeds; RACE button starts their seed. Stored `td_rivals`.
  Live rooms still need a real server (Colyseus) — artifact shared-state is owner/editor-write
  only, so viewer-writable leaderboards are not possible on this platform.

## Verified (headless, via browser JS driving stepSim)
All zones to 2859m, no console errors; determinism; creatures spawn; chips render; share-code
round-trip (938 chars, seed/name/track intact); rival ghost tracks alongside player; laser kill
test. NOT yet verified: real iPhone frame rate / touch feel.

## Session 2026-08-22 additions
- **Run-code copy fix**: code now always renders in a selectable textarea on game-over
  (clipboard API + execCommand fallbacks; embedded webviews block both clipboard AND prompt()).
- **⚙️ Settings** (title menu, persisted): steering toggle TILT (default) / SWIPE (`td_ctl`),
  master volume (`td_vol`) and music volume (`td_mvol`) sliders.
- **Tilt steering**: deviceorientation, neutral grip auto-calibrated at each run start
  (`tilt0`), orientation-angle corrected, ±20° = full deflection; any touch = dive in tilt
  mode. iOS motion permission requested inside the DIVE click gesture (`askTiltPerm`).
- **Music**: live WebAudio step sequencer (no files — CSP), 132 BPM, 64-step loop, Am-F-C-G:
  kick/snare/hats/acid-saw bass (filter opens with intensity)/square arp. `musInt` rides
  zone + dive; menu plays a stripped low-intensity version. Starts with initAudio.
- Sam's roadmap note: wants a **Mario Party-style board meta** where minigame performance
  affects board turns — park until TD feels right.

## Next / open
- Sam playtests touch tuning on iPhone (LAN URL: `http://<pc-ip>:8137/tunnel-divers.html`)
- User accounts + persistent coins + paid cosmetics (needs backend)
- Live multiplayer rooms (needs server — Colyseus; pairs with eventual Three.js rebuild)
- Landing/crumple screen at bottom? (from original ideation) — not built
