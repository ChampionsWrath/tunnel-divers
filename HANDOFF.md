# Tunnel Divers / Divers Arcade — Handoff

## 📏 STANDING RULE (Sam, 2026-08-22): every minigame must open with a
## Mario Party-style intro: live practice arena + how-to card + all humans
## ready up + 3-2-1 countdown. This is implemented ONCE in the shell
## (main.js startGame → practice instance w/ ctx.practice:true → checkAllReady →
## real instance + countdown). New games only need: a `howto:{goal,touch,keys,tip}`
## export and to honor `ctx.practice` (no timer, no scoring, no end()).

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

## Deploy (Sam runs once, ~5 min)
1. Install GitHub CLI + `gh auth login`
2. `cd "D:\Tunnel Divers"` then `gh repo create tunnel-divers --public --source=. --push`
3. `gh api repos/{owner}/tunnel-divers/pages -X POST -f "source[branch]=main" -f "source[path]=/"`
→ `https://<user>.github.io/tunnel-divers/arcade/` (tilt works — no iframe)

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
