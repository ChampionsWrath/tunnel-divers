# Tunnel Divers — Handoff

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
