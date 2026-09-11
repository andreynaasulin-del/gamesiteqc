---
SECTION_ID: facts.quadcode-playground
TYPE: fact
---

# Quadcode Games Playground (Three.js interactive, v2)

## Origin
- Forked from https://github.com/achrefelouafi/LinearAbiltyCastingExtendedThreeJS (MIT, LICENSE kept in root; credit link in HUD footer).
- Previous static landing (v1) archived untouched in `archive/landing-v1/` (index.html, style-guide.html, src/, public/assets incl. 5 demo videos).

## Stack & run
- Vite + three. `npm install`, `npm run dev -- --port 5173 --host 127.0.0.1`, `npm run build` → `dist/` (~11 MB assets + 1.1 MB JS, 300 KB gzip).
- Entry `index.html` → `src/main.js` → `src/core/App.js`. `window.app` exposed for debugging.

## Short-edition cuts (vs. the networked build)
- `src/config/settings.js` `ELEMENTS = ['ward','venom','astral']`; `ELEMENT_META` has brand accents + `blurb`. Keys Q / W / E (and 1/2/3) in `src/input/InputManager.js`.
- `src/abilities/AbilityManager.js` registers only 3 classes; other 7 ability files kept but unbundled (re-add = one import + one line).
- Removed: lil-gui Editor, PresetManager, contact card, stats panel, snake.glb + CyberSerpent load, cathedral floor textures (5 MB; floor is procedural, `floorTexture:false`), StoneTextures wait in precompile.
- Deleted from `public/`: textures/, contact/, models/snake.glb.

## Branding
- `src/ui/styles.css` — League Spartan (bundled `src/ui/league-spartan.woff2`), palette #0B0D15/#13131E/#212233, accent gradient #FF9569→#DD344D.
- `public/brand/` — quadcode-logo.png, quadcode-mark.svg, FONT-LICENSE.txt.
- `src/ui/HUD.js` — brand header, "Get Quadcode" CTA → https://quadcode.ai/#download, 3 ability cards, help panel (H), one-time onboarding card (touch-aware copy via `(pointer: coarse)`), toast, paused badge.

## Landing-frame / hero prominence (v2.1)
- `settings.camera`: `distance 6.0` (landing), `castDistance 10.5` (rig eases out when an ability is armed — `App#armAbility`), `fov 42`, `targetHeight 1.1`, `portraitDrop 0.9` when `aspect < 0.8` (CameraRig) so the character sits in the top half on phones.
- `CameraRig` initial angle lowered: position (-4.2, 3.0, 8.0).
- `Environment.hero` = coral `SpotLight` (`settings.environment.hero*`, intensity 80, follows character, always on camera side, no shadows). Rim intensity 1.1 → 1.6.
- Onboarding: desktop = left column with side gradient (character stays clear); mobile (<760px) = bottom sheet. `.hud.is-onboarding` hides the help panel while the card is up. HUD is `user-select: none`.

## QA done
- Desktop 1424×789 CSS px and 390×844: loader → HUD → onboarding OK, all 3 casts render, cooldown sweep works, no console errors, no 4xx.
- Not done: real touch device test, deploy.

## v2.2 — Six abilities and adaptive quality (supersedes the three-slot notes above)
- Six registered abilities: ward, venom, astral, quake, ink, rend. Keys Q/W/E/R/D/F and 1–6; native button clicks support keyboard activation, with accessible names on glyph-only mobile cards.
- `src/core/QualityGovernor.js`: low/medium/high, automatic by default; `?quality=low|medium|high` locks a tier for debugging. Budgets pixel ratio 1/1.25/1.5, shadow maps 1024/2048/4096, raymarch scale .4/.65/1, particles .45/.7/1, concurrent casts 2/3/4. Downgrades immediately recycle oldest excess casts.
- `Time.rawDelta` is unclamped wall time for FPS; simulation remains capped at 50ms. Hidden pages skip rendering and reset measurements on return. Pause cannot earn upgrades. Hysteresis prevents rapid quality oscillations; locked tiers still measure FPS.
- Floor procedural noise baked once into a GPU texture; bloom is half CSS resolution including initial addPass; empty distortion composite skipped. Nebula raymarch bounded by its oblate envelope. Volume step budgets affect active nebula, ink and mist materials live.
- Regression tests: `node --test tests/quality.js` (9 passed). Latest production JS ~1.327 MB, ~365.57 KB gzip; source map ~5.22 MB. Build passes.
- Desktop 1424×789 CSS DPR2: sequential 5s casts measured 38–60 FPS on adaptive low; stacked-spawn test 37 FPS with active budget 2; idle 60 FPS. Not a controlled before/after benchmark, not a universal frame-rate guarantee.
- Mobile 390×789 CSS: six 56×50 buttons, no horizontal overflow, synthetic touch cast verified. Real mobile hardware performance remains untested. QA details/screenshots: `meta/plans/six-abilities-performance.md`.
- No payments, deployment or commits. Working directory currently has no .git metadata.


## v3 — game in the landing hero (multi-page)

- `index.html` = landing (v1 layout, `src/landing/*`), `play.html` = game. Vite `build.rollupOptions.input` has both.
- Hero cards come from `src/landing/games.js` (registry): exactly three live games (elemental, rocket, strike). The `soon` placeholder slot, its `Coming soon` tag and `.hero-game__soon*` CSS were removed — the carousel renders only the registry, 3 cards, all playable.
- `src/landing/hero-game.js` → `GameCard`: states `preview → loading → playing`. Iframe `<embed>?embed` exists only while playing; destroyed on Exit / Esc / click outside / slot switch (`setCentered(false)`).
- Wheel policy: preview = page scrolls normally; playing = iframe zooms, `Embed.js` swallows wheel over HUD, card swallows wheel over its own chrome. No page scroll while playing.
- Same-origin messages: `qc:ready` (game → host), `qc:exit` (Esc with nothing armed), `qc:active {active}` (host → game). See `src/core/Embed.js` (`EmbedPresence.requestExit`).
- `#play` hash on index auto-starts slot 1.
- Render pipeline: OutputPass removed — tone map + sRGB live in `GradeShader` (`#include <tonemapping_fragment>` needs `toneMappingExposure` uniform synced every frame). Canvas `antialias:false` (only a fullscreen quad hits it).
- QualityGovernor tiers now `eco/low/medium/high`; frames >30 ms weigh 2.5× toward demotion. Nobody *starts* on eco.
- `?fps` on play.html shows a live FPS/tier readout (`HUD.update`).
- Poster: `public/landing/games/elemental.png` (1280×832 from a canvas screenshot, 4.7 MB PNG — needs webp/compression by Lumi).
- Test rig caveat: FPS numbers in the tool browser swing 2–3× with host load (genui/WindowServer); verify on real hardware with `?fps`.

## Paint Strike — integration QA (local build)
- Third live card `strike`, entry `strike.html`, offline match against five bots; desktop mouse/keyboard only. Default Corridors map.
- `public/landing/games/strike.webp`: real gameplay screenshot converted by Lumi using image_edit_essentials, 1880x1220, 36.56KB, quality84. Source `.temp/images_from_tools/0910_210517865_brw_ss.png`.
- Verified browser transitions: preview → loading → playing; Escape during loading and team selection; outside pointer; slot switch; replay; Back to the page; iframe removed and focus restored to Play. Preview loads poster but no game iframe.
- Scrollable menu retains wheel (defaultPrevented=false), top at48px, scrollHeight788 within608px viewport; bottom exit reachable. Invite hidden offline. League Spartan used from existing brand tokens.
- Host messages validated by origin/source. Ready clears60s timeout; qc:error/timeout returns retryable preview. Same-origin unsandboxed iframe uses allow fullscreen/autoplay (pointer-lock is NOT a Permissions Policy feature).
- Engine.isSuspended gates physics and all render passes, not renderer.render monkeypatch. Browser measurement:0 render callbacks over600ms suspended,36 over600ms resumed.
- Final valid gameplay FPS: 10s warmup then30.001s actual engine.onRender sampling,1755 frames; WebGL2 fallback,auto→low,938x608 canvas; avg58.498FPS,p50 16.7ms,p95 18.7ms,1%low24.934FPS,worst85.8ms,3.932%frames>20ms. Automated camera travel128 units, fire/reload/jump,0 window errors. Native pointer-lock user gesture was simulated for this automated input test and is NOT manually validated. WebGPU performance not tested. Strict stable50–60FPS remains unmet due rare spikes.
- Earlier53.7/57.9FPS samples are INVALID for comparison: screenshot capture interfered and synthetic document-target key events threw matches errors. Input now guards target instanceof Element; valid sample dispatches from canvas.
- Tests27/27 pass; production build passes with pre-existing Rocket chunk-size warning. No commits, no public deployment. The full build root/README/package.json inspected: no license grant found; confirm redistribution permission before public release.
- QA screenshots: final preview `.temp/images_from_tools/0910_211530053_brw_ss.png`; scrolled menu `.temp/images_from_tools/0910_211504593_brw_ss.png`.

## Strike — launch/input/silent-start repair
- `input.ts`: synchronous user-gesture capture; deduplicated pending requests; pointerlockerror, promise rejection, thrown errors and 1.5s no-response timeout all report retry feedback. Disposal clears pending callbacks/timers and exits owned lock; blur resets movement/fire/look/wheel residue. Unlocked Tab keyup no longer blocks menu navigation; locked Space/arrows prevent browser scroll.
- `game.ts` / `overlays.ts`: Play/Resume keeps menu until pointerlockchange confirms success; team completion no longer issues a duplicate asynchronous capture request. Esc pauses inside Strike; outer card now says Exit (without misleading Esc shortcut).
- Every start uses muted=true; ps.sound is no longer read or written. Audio setMuted silences master gain immediately, including existing voices. Browser checked saved ps.sound=on: Sound off and 0 SFX requests on first start AND replay. Explicit on/off tested with audio destination disconnected: one context created only on opt-in, master gain becomes 0 on off; no sound sent to speakers.
- New `tests/strike-input.js`: 9 tests covering actual input module with mocked browser events plus launch-wiring guards. Full `node --test tests/*.js`: 36/36 pass. Vite build passes, pre-existing Rocket chunk warning only.
- Browser native capture REFUSAL verified: menu stays open, explains retry. Successful capture mocked only for end-to-end input checks: position [4.49,.05,-11.4]→[2.96,.05,-9.35], 7 shots consumed, reload 23→30, jump y=.56, crouching=true, E changed door state, pistol selected, Escape opened menu and Resume closed it on capture. 0 captured runtime errors. This is not trusted mouse/native Escape hardware validation.
- Screenshots: menu diagnostic `.temp/images_from_tools/0910_222424906_brw_ss.png`; gameplay `.temp/images_from_tools/0910_222557438_brw_ss.png`. Diagnostic outlines and pointer/audio shims removed via iframe teardown/replay. No FPS stability benchmark in this repair; instantaneous HUD 29–32 during QA must not be presented as stable 50–60.

## Strike — "room is full 3/3" on the team screen
- Cause was the bot fill, not the join check. `host.ts` seated bots up to `MATCH.maxPlayers`
  while the player was still choosing: 1 chooser + 5 bots packed one side to 3/3, so half the
  team screen answered a click with a refusal and the room looked closed.
- Fix: `botSeatsPerTeam()` — while any human has no team, the fill may take only
  `teamSize - 1` slots a side, so both cards read 2/3. Used in the bot team pass, in the
  `addBot` callback, and as a guard on the fill itself (`counts.a < botSeats || counts.b <
  botSeats`) — without that guard the sixth seat was filled and kicked forever.
- The held slot is released on the first pick; the fill tops the room back to 3v3 next pass.
- Team screen now states availability: "1 slot open" / "A bot steps aside" (a full side of bots
  is still joinable — the host kicks one) / "Full - humans only" with `.is-full` dimming.
- `asset-url.ts` reads `import.meta.env?.BASE_URL ?? '/'` so host/config modules import in Node.
- Node cannot resolve the sources' extensionless imports: `tests/ts-resolve.mjs` hook +
  `register()` before dynamic imports. Tests: `tests/strike-teams.js` (6), suite 42/42, build ok.
