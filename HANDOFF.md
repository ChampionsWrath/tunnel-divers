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

## Session 2026-08-28 (round 23) — board network redesign + warp cannons
- buildMap REWRITTEN: 37 explicit nodes (SPEC coords + EDGES list) — outer
  promenade + left midway (3→26-29→19, upward) + right midway (15→30-33→7,
  downward) + shore shortcut (23→34-35→28) + pier cut (10→36→33). FOUR
  forks: nodes 3/10/15/23. Circulation crisscrosses — no more circle feel.
- **Warp cannons**: type 'warp' (cyan 🌀, NODE_STYLE), fixed pairs 2↔16 and
  12↔24 via node.warpTo. LANDING triggers nodeAction case 'warp' → state
  'warping' (1.1s arc, apex −17 units, squash+dust on landing) →
  endPlayerTurn. Deterministic fixed pairs = zero net traffic, all clients
  animate identically. Twin does NOT re-fire; forceBack/pass-through don't
  trigger. Remote-act queue unaffected (menu-gated acts wait it out).
- Spacing: ≥9.2 world units between ANY two nodes (tile spans ~6.6x6.2) —
  overlap complaint fixed. World now ~108x72: Zfit=min(W/120, H*0.68/80),
  wide-focus (54,37). Decor repositioned into the network's pockets (paths
  now cross the middle — no big open center). Tutorial card 2 mentions
  forks + cannons.
- Verified: graph (37/37 reachable, 0 dead ends/orphans, min dist 9.2,
  symmetric warps), forced cannon ride 2→16 lands + ends turn, full bot
  game clean, map-view screenshot sent to Sam. NOTE startTurnPlayer resets
  mapView each turn (test screenshots must hold at a human menu).
- Build 26, deployed 102a184.

## Session 2026-08-28 (round 22) — bodies, t-shirt+jeans, sticky preview, tutorial
- ward gains {body:'m'|'f', shirtCol}. Female: tapered/flared tee silhouette
  (path replaces roundRect torso) + lashes on lenses front AND top view.
- Clothes philosophy per Sam: earned board cosmetics are the flash; base
  wear = T-SHIRT COLOR only (HSL picker dot, shirtCol, falls back to seat
  color when null) + blue jeans always. Shirt colors standing torso +
  sleeves + batter (via ward passed to drawBatter); ARENA TOP VIEW KEEPS
  SEAT COLOR for identity. migrateWard maps old preset c.shirt→shirtCol.
  Solo game: window.__shirtCol override in shirtCol(), cos.pants forced
  'blue'. Preset shirt/pants rows REMOVED from the customize screen (trail
  row stays). anyToRgb/shadeShirt/lightShirt in character.js accept hsl().
- CHARACTER preview pinned: sticky wrapper div (top:-18px vs panel padding,
  bg #101624, z-index 5) — options scroll under it. Canvas now 220x180.
- **Board tutorial** (board.js): this.tut=0 at creation; 4 cards (objective
  / turn / minigames / squash+items) drawn as drawTutorial overlay, NEXT
  (tutN) / SKIP (tutS) buttons, progress dots. Handling sits in update()
  right after clicks capture: swallows ALL taps while open; state machine +
  remote act mirroring run underneath — zero sync impact. Every game shows
  it; skippable in one tap.
- Verified: rows BODY/HAIR/HATS/FACIAL/T-SHIRT/TRAIL, sticky computed
  style, shirt hsl persisted, 5-diver body lineup, tutorial next/skip +
  roll-after-dismiss + full bot game clean. Build 25, deployed 5d53fe0.

## Session 2026-08-26 (round 21) — wardrobe expansion + color pickers
- ward is now {hair, hat, face, hairCol, faceCol}. HAIR is its own category
  drawn on the FRONT of the head (drawHairFront/drawHairTop — Sam's spikes
  complaint fixed: spikes mount on the visible crown, leaning forward),
  layered UNDER hats. Styles: bowl/spikes/curls/mohawk/pony (animated
  sway + tie)/long (face-framing curtains drawn before the cap).
- New hats: cowboy/party (clipped stripes + pom)/phones/halo (glow+bob)/
  wizard (star+moon). New facial: chops/soul. All have top-down versions.
- **Color pickers**: hair + facial hair rows on the CHARACTER screen get a
  color dot (#dot-hairCol/#dot-faceCol) → HUE/RICHNESS/BRIGHTNESS sliders
  (buildColorPop in main.js), stored as 'hsl(H,S%,L%)' strings in td_cos1,
  net-synced via profile.ward. parseHSL() re-seeds sliders.
- migrateWard() in character.js: converts old {hat:'hairb'/'hairy'} saves;
  applied at profile load AND on remote peers in lobbyPlayers. Bots roll
  random hair/hat/hairCol. Solo game maps unknown hat ids → closest classic
  (spikes/mohawk→hairy, other hair→hairb) so it never renders bald.
- Verified: picker persists hsl + preview live; 12-diver showcase reviewed
  (screenshot sent to Sam); full bot board game + top-view renders clean.
  Build 24, deployed 00d6710.

## Session 2026-08-26 (round 20) — character overhaul + wardrobe + CHARACTER screen
- character.js rewritten. Standing model: gradient torso + zipper, skin
  HANDS on arm ends, head highlight/chin shade, ears, wrap-around goggle
  strap, lens glints, blush. Top view: radial ball shading + hand dots.
  Batter: gradient + gripping hands.
- **Earned cosmetics refit** (all fitted to the model now): crown w/ jewels
  on the skull; prop = fitted beanie + motion-blur blade; cape shoulder-
  attached w/ animated wavy hem; duck ring TWO-PASS (back arc pre-torso,
  front arc + head + tail post-torso — keep this ordering!); shoes get
  squeaker dots + white soles; boots get buckles; burger mask is DRAWN
  shapes (no emoji — platform fonts vary); nose glint.
- **Wardrobe** (NEW on arcade model): ward {hat,face} — 7 hats + 4 facial
  hair styles rendered front (drawWardHatFront — hair uses scalloped
  hairline ABOVE the goggles, keep goggles visible!) and top-down
  (drawWardHatTop). Priority: earned crown > earned prop > ward.hat.
  WARDROBE export drives the UI.
- **CHARACTER screen** (#scrCustom): 🎨 CHARACTER button on arcade home →
  live animated preview canvas (drawCharPreview in frame()), skin slider
  (MOVED off the home screen), hat/face chips, PLUS the solo game's
  shirt/pants/trail rows. All stored in td_cos1/td_skin — the solo game
  reads the same store; its own COSMETICS button is REMOVED (guarded).
- ward rides profile → net hello → lobbyPlayers → board copy → crown/food/
  lava/ghost drawDiverTop calls + board chips. Bots roll random ward.
- Board.update guards empty player list (test-env crashloop protection).
- Verified: custom screen (5 rows, picks persist to td_cos1, preview
  renders), 6-player lineup screenshot (all cosmetics fitted), full 6-turn
  dressed bot game 0 errors, solo page loads w/o btnCos. Build 23,
  deployed 1e4670a.

## Session 2026-08-26 (round 19) — board art pass (Mario Party quality)
- Full visual overhaul of board.js render():
  - Sky: 4-stop dusk gradient, twinkling stars, layered sun glow, parallax
    clouds, ROTATING ferris-wheel silhouette w/ colored gondolas (horizon,
    parallax 0.15), animated seagulls.
  - Ocean: swell lines (sin-wobbled), sun glitter path, foam shoreline.
  - Deck: alternating plank tone bands, staggered joints + nail heads.
  - Walkway: 4-pass ribbon w/ dark outer trim + guide DOTS between spaces.
  - String lights: twinkle + glow halos + white speculars.
  - Tiles (drawTile): AO ground shadow, gradient extrusion, sunset-lit
    gradient top, WHITE ICON PLATE (blue +3 / red -3 text), gloss sweep,
    pulsing halo on the active player's tile. Helper lightCol() added.
  - Goofy physics: landing squash (this.squashT, 0.2s, applied around feet
    in drawStanding), dust poofs (this.dust, spawned on step completion in
    the stepping case), airborne shadow shrink during hops.
  - Dice: pseudo-3D cube (top/right faces), classic PIPS, pop-in scale on
    settle, glowing ? pre-roll.
  - Reward: 70-piece confetti rain (this.confetti, keyed per reward phase).
  - Chips: drop shadow, gradient panels, pulsing active border.
  - Decor: grounding shadows under all props.
- **Test infra**: scratchpad/shotrecv.py — tiny CORS POST receiver on
  :8138; page fetch()es canvas dataURLs to it → screenshots land on disk
  for Read. (Manual base64 copying corrupts — always use this.)
- frac() helper added (deterministic hash-noise). Verified: full 8-turn bot
  game rendering every state, 0 errors; screenshot reviewed. Build 22,
  deployed 6350210.

## Session 2026-08-26 (round 18) — RELAY FALLBACK: multiplayer works on any network
- Sam + wife: both in room, "no players found". Cause class: nostr discovery
  works but the WebRTC connection can't form (CGNAT / AP isolation), no free
  TURN exists, trystero's onPeerJoin never fires → lobby shows nothing.
- **net.js now has a full relay fallback**: own ephemeral nostr events
  (kind 20176, nostr-tools@2.7.2/pure for signing, esm.sh) on the same
  RELAYS. Presence beat every 2.5s (t:'p'); game messages (t:'m', optional
  to:) for any peer without a direct link. hello/hi handshake runs over it
  transparently. Direct P2P preferred per-peer (this.rtc map); relay copies
  from rtc peers dropped; silent relay peers pruned after 15s; sockets
  auto-reopen after 8s. Lobby shows "⚡ relay mode" when active. Out-of-order
  relay delivery absorbed by the board act queue (round 14 work).
- **trystero 0.20 IGNORES rtcConfig** (verified: constructor interception
  shows its own google+twilio STUN always) — our ICE tweaks never applied.
  `?rtcoff=1` cripples RTC at the RTCPeerConnection constructor: THE way to
  test relay mode with two local tabs.
- Home screen shows "build 21 — everyone in a room must match" (#buildTag,
  BUILD const in main.js — bump with ?v=); lonely-lobby hint references it.
- Verified: two ?rtcoff=1 tabs (0 RTC connections) discovered each other in
  ~5s and played a synced board game (turn 1 → minigame ready/rewards →
  turn 2) entirely over public relays, identical state logs. Deployed
  296039f. Sam + wife should BOTH refresh (build 21 on home) and retry.
- Note: minigame remote-score updates over relay are ~100-500ms laggy —
  fine for the board, acceptable for score ticks; revisit if a future game
  needs tight realtime remote state.

## Session 2026-08-26 (round 17) — NEW MINIGAME: Rush Hour 🚗
- games/rush.js — first-person 3-lane traffic dodger, survive-the-longest.
  Sunset FPV: sky gradient + sun + city silhouette, perspective road
  (halfW/yAt use pow(z,0.62)), animated dashed dividers, obstacles {lane,
  span, z, kind car/cone/truck} rushing camera-ward; trucks span 2 lanes
  (from ~12s, p ramps to 0.4). Crash when an obstacle crosses z≈0.06 in
  your lane; near-miss whoosh + white flash otherwise.
- **Fairness invariant**: every spawn wave picks its open lane by ±1 random
  walk from the previous gap — the path through is ALWAYS reachable.
  Verified: 0 frames with all 3 lanes blocked in a 44.7s autopilot run.
- Input: flick hysteresis on inp.x (>0.45 shifts a lane, must return <0.22
  to re-arm) — works for swipe, tilt, and keys. Wheel: camL glide velocity
  → wheel angle (eases at 10/s, clamp ±1.15rad); HANDS on the wheel use
  skinTone(runner.skin), forearms + sleeve cuffs in runner.color (per the
  skin/model rule).
- Format: sequential-runner like food/homerun (ready→run→crash 1.4s beat→
  next runner→wait), bots = seeded survival times (14+skill*38+rng*26,
  capped 120s = MAX_T hard cap), online 'g'/{k:'sc'} progress + done.
  Practice: endless, crash respawns. Difficulty: wave gap 1.55s→0.5s,
  speed 0.55→1.3 z/s.
- Registered in main.js GAMES + MODES (board picks it up via gameIds).
  Verified headlessly at v20: full run (autopilot 44.7s, 20 lane changes,
  wheel to 0.74rad), crash→results with bot times, practice 16 crash-
  respawns over 30s, pixel probes confirm scene layout. Deployed 908e548.

## Session 2026-08-26 (round 16) — lava ladder + Diner Dash + trash fix
- **Floor is Lava difficulty ladder** (Sam's spec): tiles now carry
  {col, shape (●▲■, from r6), num (1-3, from r10)}; the call escalates one
  mechanic at a time — r1-5 color · r6-7 shape · r8-9 color+shape · r10
  number · r11 color+number · r12-14 full combo ("YELLOW ■ 1"). specFor(r)
  is the schedule; matches(t) is the single safety judge (sink/judging/
  cracks/bots all use it). Fair scaling: showT bases 3.4/4.3/5.2s by attr
  count, −0.12s/round, +0.7s grace on each phase's debut round (6/8/10/11/
  12); bot reaction +0.45s per extra attribute. MAX_ROUNDS 12→14.
- **Food Flash renamed Diner Dash** — display name only, id stays 'food'
  (board gameIds, results, net messages unaffected).
- **Trash can fix** (Sam kept losing items unknowingly): dump radius
  PRr+6→PRr+2, red hazard-striped can + TRASH label, pulsing dashed ring
  marks the exact dump zone while carrying, dumping pops "🗑️ TRASHED
  <item>!" + flash (this.trashFx).
- Verified headlessly at v19: spec ladder correct at r1/5/6/7/8/10/11/12/14
  (safe counts 6→1, shapes/nums appear on schedule, labels right), full
  14-round bot game completes, render OK with badges; trash keeps item at
  old accidental distance and trashes+pops inside new radius. Deployed
  9d2811f.

## Session 2026-08-26 (round 15) — skin tone slider
- Sam: "add a skin tone cosmetic to the character editor, make it a slider."
- tunnel-divers.html cosmetics panel: SKIN TONE row at the top — gradient
  range slider (0-100 over 6-stop ramp SKINR light→deep), skinCol() applied
  to drawBody head + shorts legs, live in the preview.
- Arcade: slider on the home screen under the name field (#skinIn);
  S.profile.skin → net hello/hi payload → lobbyPlayers rows → board players
  (board.js copies skin) → minigame player copies. Rendered in
  drawDiverStand (board) and drawBatter (homerun); drawDiverTop deliberately
  untouched — the top-down view is wetsuit+goggles, no skin pixels.
- character.js: exports SKIN_RAMP + skinTone(v 0-100); drawDiverStand and
  drawBatter honor o.skin (default = classic SKIN #ffd9b3 ≈ tone 35).
- **Shared key: both apps read/write localStorage td_skin** — pick a tone in
  either place and it follows you (verified: editor slider inited at the
  value the arcade tab had just saved). Bots get a random tone on add.
- Verified headlessly at v18: slider→profile→board flow (skins [88,32,0]),
  chin-pixel samples track the slider (light/tan/deep at 0/50/100), no
  console errors in either app. Deployed (f85f30a).
- RULE REMINDER: any new place the model shows a face must pass o.skin.

## Session 2026-08-26 (round 14) — ⭐ ONLINE MULTIPLAYER ACTUALLY WORKS NOW ⭐
Sam: "multiplayer still isn't working." It never worked past the lobby. Four
root causes found by driving two live-site tabs through a REAL online board
game (host at ~1x sim speed, guest at 12x — a deliberate worst-case lag test):
1. **Seat scramble (the killer)**: net.js selfId was a homemade uid() while
   peers key each other by trystero peer ids → every client saw ITSELF under
   an id nobody else had, its short uid sorted first, so each client took
   seat 0. Acts landed on the wrong player, turn 2 deadlocked, ready-ups
   could never complete. Fix: selfId = trystero's module selfId (v15).
2. **Dropped remote acts**: applyAct's "ignore echoes of my own authority"
   guard silently ate any act arriving while the receiver still thought it
   was its own turn (constant on phones: throttled rAF, backgrounding,
   latency). One eaten 'roll' = opponent frozen forever. Fix: remote acts go
   through queueAct→rq, drain in update() only when the local state machine
   reaches the state each act belongs to (roll→menu, branch→branch,
   buy/shopDone→shop overlay, pinata2→pinata overlay, steal→action,
   mg→mgIntro; rw/sync immediate since the board may be stashed behind a
   minigame). 6s sim-time failsafe; queue ages in sim time so a backgrounded
   phone resumes cleanly. Also folded the pinata2 bottom-of-file monkey-patch
   into the switch, and made multi-edge path picks (advanceStep backward,
   forceBack) deterministic — rng streams differ per client (v16).
3. **Ready-up race**: a faster peer's 'ready' can arrive BEFORE the
   receiver's startGame() wipes readySet → receiver hangs at the intro
   (observed live). Fix: 'ready' arrivals timestamped in S.readyAt and
   recent (<8s) ones merged back after the reset, plus each ready client
   re-sends its ready every 1s until the round starts (v17).
4. **Board length desync**: S.boardTurns was local-only. Now chip clicks
   broadcast 'turns' and 'start' carries it (v15).
Also: openrelay.metered.ca TURN is DEAD (verified 0 relay candidates) —
removed; cloudflare STUN added. **Remaining gap: no TURN server** = two
phones both on carrier-grade NAT (LTE↔LTE) may still fail to connect;
same-wifi and most home-network pairs are fine on STUN. Free options need an
account: metered.ca free tier or Cloudflare TURN — ask Sam.
**Verified live on the deployed site**: full 8-turn 2-player online board
game, all 8 minigame round-trips (ready-up → play → rewards), shop pauses,
squash, branch picks — both clients logged IDENTICAL nodes/coins at every
checkpoint and identical final scores (146/101) despite the 12x speed skew.
GH Pages caching note: index.html/main.js are unversioned (max-age 600) —
after a deploy, phones may run the old build for up to ~10 min; the lobby
warning line already tells friends to refresh.

## Session 2026-08-22 (round 13) — board UX + ground/decor (Sam's 5 fixes)
- Sam's feedback: chips under iPhone status bar; forks unselectable; only ROLL
  offered; board felt like floating spaces; wanted carnival decor along routes.
- **Safe area**: index.html `#safeProbe` div (env(safe-area-inset-*)) read in
  main.js resize() → `dim.safeTop/safeBottom`. Chips draw at safeTop+8; TURN
  label lifts above the home bar. Any new HUD must respect these.
- **Turn menu**: turn start is state `'menu'` (was auto item→roll): buttons
  🎲 ROLL / 🃏 ITEMS(n) / 🗺️ MAP. MAP toggles `mapView` (camera eases to Zfit
  whole-board, ✕ CLOSE MAP). ITEMS opens overlay card (USE per item / BACK),
  doPlayItem returns to menu. Bots: item-then-roll through the same acts.
- **Fork fix**: branch hit-test used stale `this.S*5` (NaN after render v2
  rewrite) → now `(this.zoom||10)*4.5`, PLUS explicit direction buttons
  `'br'+nid` ("⬆️ 🎡 path" style). Verified both paths headlessly (buttons
  br28/br6 and raw tile tap both fire act('branch')).
- **Ground**: world-anchored (all proj()-based, moves with camera): sunset sky
  → ocean strip (y −14…−8) → sand → plank seams → 3-pass boardwalk ribbon
  drawn UNDER route edges (Z*8.2/7.2/6.6 strokes) → string lights at y=−2.
- **Decor**: buildDecor() places tents/carousel/balloons/popcorn/cotton
  candy/lamps at world coords beside routes; drawDecor() renders per kind,
  y-sorted with tiles/players. Dice shows '?' above head pre-roll.
- imports bumped **?v=14** (all of main.js + character.js sub-imports).
- Verified headless: full 8-turn bot game completes through menu state; map
  toggle (zoom 3.7 vs game ~15); items overlay use/cancel; shield armed;
  branch both input paths; visual snapshot looks Mario-Party-ish (ground,
  ribbon, lights, tent, chips clear of 54px notch band). Committed 46b8881,
  pushed (Pages live ~1min).
- **Next**: Sam phone-playtests round 13; then real multi-device board sync +
  asym Ghost Grabbers test (still untested with real peers).

## Session 2026-08-22 (round 12) — board visuals v2 (Mario Party cam)
- Sam rejected the flat zoomed-out board (screenshot vs Mario Party Superstars).
  board.js render v2: camera LOCKED to active player (update() smooths
  camX/camY/zoom; splash+end zoom out to whole park), extruded chunky tiles,
  plank paths, parallax ferris/sun/pier, drawDiverStand characters ON tiles,
  dice above head, Mario-style top chips w/ rank. proj(x,y) is the projection;
  nodeXY() returns projected coords (branch taps hit-test against it).
- character.js: drawDiverStand (standing front view) renders ALL 8 cosmetics
  on the body; drawDiverTop takes cos[] (crown/prop/nose/cape). Minigames
  (crown/food/lava/ghost) pass player.cosmetics through — collect a crown on
  the board, wear it in the next minigame. THE RULE: any new cosmetic must be
  drawn in both views.
- ⚠ sub-imports must be version-stamped too: character.js is imported as
  '../character.js?v=13' everywhere — bump that stamp when character.js changes.

## Session 2026-08-22 (round 11) — ⭐ THE BOARD IS REAL ⭐
- `arcade/js/board.js` = The Chaotic Boardwalk, full engine per Sam's spec
  (see commit ad1ef7e for the complete feature list). Key architecture:
  - Board Game lobby mode → startBoard() in main.js; board instance lives in
    S.boardObj AND S.inst; minigames stash the board (S.boardStash), run the
    normal intro/ready/countdown flow, and onGameEnd routes rankings back via
    window.OnMinigameComplete(resultsArray, gameId) instead of a results screen.
  - EVERY board mutation flows through act(a,d) → applyAct; online rooms mirror
    by broadcasting 'bd' events (routed in main's net.onMsg even mid-minigame).
    Authority = active player's client; net-host simulates bot decisions + does
    reward math ('rw' broadcast). ⚠ online board untested with real peers.
  - Board length selector (8/14/20 turns) appears in lobby when party selected.
  - Map: buildMap() = 28-loop + 2 forks (nodes 5→28-30→10, 17→31-34→23),
    types via mainType(); NODE_STYLE colors/icons; reverse edges for backward.
  - Deadlock fixed: overlays (shop pause mid-move!) handled in update() BEFORE
    the state switch — never gate overlay decisions on a specific state.
- VERIFIED: full 20-turn all-bot game w/ exact economy math + real minigame
  round-trip (intro included). Gauntlet code still present but unreachable.
- NEXT: real playtest; cosmetics → character visuals; owner-only mode lock.

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
