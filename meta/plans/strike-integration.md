---
SECTION_ID: plans.strike-integration
TYPE: note
---

# Paint Strike integration

- [x] Review current source and existing landing design handoff (no meta/rules present).
- [x] Review developer_import_21st_guides: guide publisher, not applicable to game integration. Use existing game-card architecture.
- [x] Fix embed lifecycle, Escape, loading cancellation and failure handling.
- [x] Fit existing menu components to embedded viewport; poster created by Lumi from real gameplay, WebP 36.56KB.
- [x] Run regression tests (27/27) and production build (passes; existing Rocket large-chunk warning).
- [x] Browser validation: preview/play/exit/replay/slot switching, menu scrolling, suspension and standalone boot. Actual game-frame FPS measured with simulated inputs and zero errors.
- [x] Record actual results and remaining hardware limitations in meta/facts/quadcode-playground.md.
- [ ] Strict stable 50–60FPS: mean58.5 and p95 18.7ms, but 1%low24.9 and worst85.8ms; profile rare stalls next, do not claim target fully met.
- [ ] Manual trusted pointer-lock / native Escape and WebGPU-device QA (automation simulated pointer lock).
- [ ] Confirm the networked build redistribution license before public deployment (no license found in inspected clone root/README/package.json).

## Launch and controls follow-up
- [x] Apply pointer-lock error/retry handling; keep menu until capture succeeds.
- [x] Always start muted, ignore saved opt-in, mute current output immediately.
- [x] Test real input handlers, refusal/retry/cleanup and landing exit copy (36/36 tests).
- [x] Build and browser-check startup, sound, replay; distinguish trusted from synthetic input QA.
- Browser native refusal now keeps menu open with retry feedback. Successful input path used a pointer-lock shim, NOT a trusted hardware capture. Gameplay movement, aim, fire (30→23), reload (23→30), jump, crouch, E door, pistol selection, Esc and Resume checked; zero captured runtime errors. Replay with saved ps.sound=on still Sound: off and zero SFX requests.
- Existing UI tokens/components reused; reviewed developer_import_21st_guides does not apply to game repair. No redesign or assets needed.
## Match QA after the render work (60 s of driven play, 1100x760 standalone)
- avg 58.5 fps, p50 16.7 ms, p95 18.9 ms, p99 25 ms; five 10 s slices all 57-59.
- Landing card (938x608 iframe): avg 58.3, p50 16.7, p95 20.9; resolution climbed 0.72 -> 0.85 -> 1.00.
- Root cause of the old opening stutter was shader compilation, not GPU load: the first five
  seconds ran at 17 fps and the same scene settled at 58 once every program existed. Fixed by
  compiling behind the loading veil (`src/strike/engine/warmup.ts`).
- Second finding: the resolution scaler could never climb back, because a perfect vsync frame is
  16.7 ms and the climb bar was 14.5 ms. It parked the match at 0.62 while full resolution also
  held 58 fps. Bar moved to 17.5 ms.
- Measurement caveat: a second game window left running halves the frame rate (28 fps vs 58).
  Close every other game tab before trusting an FPS number.

- Native hardware pointer-lock QA remains outstanding above. No new stable-FPS claim.

## Frame rate: from 25 fps to 57
Profiled on an M1 with Chrome, 938x608 embed, quality already at the `low` floor. The game logic
was never the problem (1.2 ms a frame); the frame was spent submitting and simulating.

- [x] **Avatars welded** (`src/strike/characters/merge-skins.ts`). Each character shipped as 23
  separate skinned parts — one per garment, eye and tooth — costing 23 draw calls a body, 138 for
  a 3v3. All but the skin were flat colours, so the colour is baked into a vertex attribute and
  parts that render alike are welded: 23 -> 15 meshes a body, and the parts got frustum culling
  back (they were authored with culling off) plus a shadow-caster cut-off at 600 triangles.
  Measured: avatars cost ~14 ms of a 36 ms frame before, ~7 ms after.
- [x] **Simulation at 60 Hz, not 120** (`src/strike/engine/renderer.ts`). At 120 Hz a machine
  drawing at 25 fps burned five catch-up substeps per frame — half the frame inside the physics.
  Paintball has no fast projectiles that need the finer step. Catch-up capped at 3 substeps so a
  hitch cannot snowball.
- [x] **Cheaper floor profile** (`src/strike/engine/graphics.ts`): `low` shadow map 1024 -> 512,
  pixel budget 1280x720 -> 1024x576. One low sun with long soft shadows hides the difference.
- [x] **Dynamic resolution** below the quality ladder: rungs 1 / 0.85 / 0.72 / 0.62 on the
  profile pixel ratio, judged over 2 s windows, climbing back at most twice so the renderer does
  not reallocate targets forever. A wobbling scaler is worse than a slightly soft one.
- [x] Tests `tests/strike-render-scale.js` (7): scaler steps down, holds at 60, settles instead
  of oscillating (this test caught a real oscillation bug), pixel ratio carries the scale, welding
  preserves colours/geometry, unlike parts are left alone, face detail casts no shadow. 51/51 pass,
  build passes.

Measured in the landing card, 938x608, 15 s of live match: **avg 57.1 fps, p50 16.7 ms (60 fps),
p95 24.3 ms**, at render scale 0.62. Standalone at 1100x760: avg 50.4, p50 17.3. Honest caveat:
the target is met by spending resolution, and roughly one frame in ten still misses vsync.

## Landing: three games, not four
- [x] The registry holds exactly three live games (Elemental Sandbox, Rocket Arena, Paint Strike).
  Removed the dead fourth-slot machinery from `src/landing/app.js`: the numbered "coming soon"
  placeholder poster, the `Coming soon` tag and the `live` branches that hid controls. Verified in
  the browser: 3 cards, all three with a working Play button and control legend, no placeholder
  markup left in the DOM.
