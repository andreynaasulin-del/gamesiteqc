---
SECTION_ID: plans.paint-strike-corridors
TYPE: note
---

# Paint Strike · Corridors layout rework

## Diagnosis (measured, not guessed)
`?dev=map` + `window.__ps` on `public/strike/maps/corridors.glb`:

- Building x -5..5, z -12..8, ceiling 2.48, walls 2.1-2.5. Lot x/z -15..15, no roof outside.
- Spawn room A z 5..8, spawn room B z -12..-9. Middle band z -9..5 = **14 m**.
- Walls at x = -3, -1, 1, 3 cut the band into **five parallel 2 m corridors**:
  C1 x -5..-3 │ C2 x -3..-1 │ **C3 x -1..1** │ C4 x 1..3 │ C5 x 3..5.
- C3 opens straight into BOTH spawn rooms (2 m gap at z=5 and z=-9), no door.
- The other four are reachable only through doors: z=5 / z=-9 at x=±2, ±4; x=-1 and x=3 at
  z 2.3 and -6.3; the x=-3 and x=1 stubs at z=-2.
- 0 props, 0 stairs, 0 windows, 1 level.

So: **one 14 m dead-straight tube from spawn to spawn, zero cover, zero verticality.**

And it was worse than the geometry suggests — see the door bug below: four of the five corridors
were not on the navmesh at all, so **100% of bot traffic used C3.** The map was not boring by
layout alone; it was boring because it had literally one route.

## Fix: three changes, no new art
1. **Break every long sightline** with staggered blocks: full-height (2.05) and waist-high (1.15,
   crouch-safe / stand-shootable), each half the 2 m corridor width and alternating sides, so the
   route zigzags and fights happen at corners at 3-6 m instead of 14 m head-on.
2. **Add a second storey for free**: strip the 5 flat ceiling planes, rebuild them as walkable
   roof decks, and leave a 2 m **open slot over C3** (x -1..1, z -9..5) as a drop-in lane.
3. **Make the roof a real route**: a 0.5 m step stack at the north end of C5 and another at the
   south end of C1 — diagonally opposite, each 1 m of a 2 m corridor so ground traffic still
   passes on the other 0.83 m. Each surfaces through its own well in the deck. One 1.2 m bridge
   across the slot at mid-map, parapets along the slot edges, six cover blocks on the deck.
   Height costs a walk down an outer corridor in the open; it is never free from spawn.

Everything is generated in code from the numbers above and reuses the map's own materials, so
there is no GLB to re-export.

## Engine bugs this uncovered (fixed, and not Corridors-specific)
1. **Open doors were sealing their own doorways on the navmesh.**
   `buildOpenDoorObstacles` swings each door open, boxes the leaves, and feeds them to recast so
   no path runs through a panel. It padded that box by `LEAF_PAD` 0.12 on *both* horizontal axes.
   These doorways are 0.76 m wide and the leaf still overlaps ~0.14 m of the aperture when open,
   so the strip left ~0.50 m — and recast erodes 0.22 m per side on top. Result: zero walkable
   width, and every room behind such a door became a navmesh island.
   Fix in `doors.ts`: pad the panel's **thin** axis only (which is what the pad was ever for), and
   clip the obstacle out of the closed-pose aperture entirely (`clipToOutsideAperture`).
2. **Zone spawns could land on a roof.** `spawnsFromZones` probes downward from `zone.floorY + 1.5`.
   Two of this map's four spawn zones are authored a metre off the ground, so once a deck existed
   at 2.5 the probe started above it and found the roof first. Fix in `spawns.ts`: reject a sample
   more than `MAX_ZONE_RISE` (0.6) above the zone's own floor.
3. **Bots ignored the new roof.** `createRoamTargetSet` probes once per entry in `MapData.levels`,
   so a storey the GLB never declared is invisible to the roam grid even when the navmesh connects
   it. Fix: `LayoutSpec.levels` is merged into `MapData.levels` by the loader.

## Steps
- [x] Measure the real map (bounds, walls, doors, zones, floorplan).
- [x] `src/strike/map/layout.ts`: per-map overlay (strip nodes + emit boxes) applied in `loadMap`
      before the colliders are baked, so colliders / navmesh / bounds pick it up for free.
- [x] Hook it into `map-loader.ts` (`layout` option, `?layout=off` to A/B the old map).
- [x] Verify in the browser: no spawn-to-spawn sightline, headroom on every block, roof reachable,
      navmesh still builds, no perf hit.
- [x] Fix the three engine bugs above (`doors.ts`, `spawns.ts`, `layout.ts` + `map-loader.ts`).
- [x] Playtest pass with bots (2 min, 12 bots), measure route distribution.
- [x] Technical validation: input fallback, silent start, navmesh, roof bot routing, full tests and production build.
- [x] Follow-up: widened each roof well/stair from 1.1 m to 1.7 m and restored the A-key fallback for browsers that omit `KeyboardEvent.code`.
- [x] Containment pass: fenced the roof, re-anchored both flights to their wells, fixed iframe
      keyboard focus. See "The roof had no edge" below.
- [x] Paintball grenades (`G`) and a 20% bot difficulty nerf — see the config block and `grenades.ts`.
- [x] Outdoor yard east of the building, two exterior flights to the roof, `openAreas` so bots use it.
- [x] Shadow map on its own clock (`shadowHz`): 44.3 → 47.7 fps on the same scripted drive.
- [x] Audio off by default (`AUDIO_AUTOSTART`), menu toggle still live.
- [ ] Second tuning pass once someone plays it by hand — see "Open" below.

## The roof had no edge (and WASD was going to the wrong window)
Reported as "hard to get on the roof, A doesn't work, I fall through the roof textures". Three
separate causes, all reproduced in the running game before anything was changed.

**1. WASD went to the parent page, not the game.** In the hero card the game runs in an iframe.
The card focused the `<iframe>` element but never its `contentWindow`, so until you clicked
*inside* the canvas the keystrokes landed on the landing page. A single key looked dead at random
— usually whichever one you pressed first. Fixed in two places, because either alone still leaves
a gap: `hero-game.js` focuses the frame *and* `frame.contentWindow` when the game reports ready,
and `main.ts` re-takes focus on every `pointerdown` inside the game, so clicking back into a game
you had scrolled away from restores the keyboard. Pinned by `tests/strike-embed.js`.

**2. "Falling through the roof" was walking off the side of it.** The decks had no perimeter at
all. An 8-heading sweep across the roof ran the player clean off the edge and down onto the GLB's
own 30 × 30 m ground plane at y = -0.05 — *outside the house*, still alive, with no way back in.
`controller.ts` only calls `onFellOut` below `bounds.min.y - 10`, and those bounds include that
ground plane, so no respawn ever fired. You were stuck in the void, which is exactly what
"falling through the texture" looks like from the inside.

Fixed with a closed `ROOF_RIM` ring (`rim-west/east/south/north`) at `COVER_LOW` 1.15 m. That
height is load-bearing: the controller can mount `jumpVelocity²/2g + stepHeight` = 0.576 + 0.52 =
**1.096 m**, so 1.15 can never be climbed or stumbled over, while crouch eye 1.0 still hides
behind it and standing eye 1.6 still shoots over it. The same sweep now reports **0 escapes** —
the two runs that ended at x = ±14.88 stop at ±4.55.

For the record: a 4.5 m drop onto the 6 cm deck does **not** tunnel through it. The slabs are thin
but the sweep is continuous. Falling through the geometry was never the bug.

**3. The climb was gated on one 50 cm slot.** Both flights started flush against the spawn-room
wall, so leaving spawn meant threading the doorway *and* hitting the first riser in the same step.
Probing door B across x -4.9 → -3.1 in 10 cm steps, only **x -3.9..-3.4** got through: these are
sliding doors and the parked leaf (0.75 m) eats two thirds of its own 1.42 m frame. That gap is
the source asset's and stays, but it no longer coincides with the stairs — each flight now starts
0.8 m inside the corridor, so the two moves are separate. Holding W from spawn B now walks the
whole route unaided: `0.05 → 0.09 → 0.76 → 1.50 → 2.26 → 2.50` and out onto the deck.

Three geometry bugs fell out of re-anchoring the flights, all of which had been invisible:
- The wells were **longer than their flights** (3.8 m well, 3.5 m flight), leaving 30 cm of open
  well with neither tread nor deck under it right where you walked out of the door.
- The wells **reached the outside wall**, so the new rim would have hung over the opening and a
  player surfacing from the climb would have met a 2.5 m drop instead of a parapet.
- `roof-cover-sw` sat **on top of stair B**, capping the climb. `c5-block-b` collided with the
  relocated well A. Both moved.

Wells and flights are now derived from the same constants (`WELL_A`/`WELL_B` ± `STAIR_RUN`) so they
cannot be edited apart again, and the slot rails went 0.45 m → `SLOT_RAIL` 0.75 m — above
`stepHeight` 0.52 so a sprint cannot fall in by accident, below the 1.096 m mount limit so a
deliberate jump still drops you into C3. The rails **stop at the bridge** on both sides: a rail
you have to hop to reach the only crossing on the roof turns the map's bravest option into a
trick shot.

Four new tests in `tests/strike-map-layout.js`, each verified to fail when its fix is reverted:
a closed unclimbable perimeter (walked at 25 cm resolution, not spot-checked), wells one flight
long and clear of the edge, nothing on the deck floating over a hole, and rails that fence the
slot without walling off the bridge. `ROOF_PLAN` and `WELLS` are exported so the tests read the
numbers the map is built from rather than a copy of them.

## Probe results (read out of the browser, never by hand)
Map viewer, `?dev=map&map=/strike/maps/corridors.glb`:

| check | before | after |
|---|---|---|
| spawn A → spawn B sightline (eye 1.6) | THROUGH | **broken** |
| full-length sightline in C1…C5 | THROUGH in all 5 | **broken in all 5** |
| corridors reachable from spawn A (nav) | 1 of 5 | **5 of 5** |
| roof reachable from spawn A | n/a | **ok** (near A, mid, near B) |
| spawn Y | 2.50 (on the roof) | **0.00 / 0.00** |
| stair treads (rise / headroom) | n/a | 0.5 / 0.5 / 0.5 / 0.5, all ≥ 2.0 m clear |
| step-off at each stair top | n/a | 2.0 → 2.5 deck, both ends |
| ground bypass past each stair | n/a | 0.83 m clear, both corridors |
| load time | 555 ms | 565 ms |
| draw calls / fps | 141 / 60 | **141 / 60** |

Live match, 12 bots, 2 min, position sampled 5 Hz (1376 samples, spawn rooms excluded):

| route | share |
|---|---|
| C1 | 12.4% |
| C2 | 22.5% |
| C3 | 24.9% |
| C4 | 17.0% |
| C5 | 18.6% |
| roof | 4.7% |

Before the fix this was C3 100%, everything else 0%. 58 fps with 12 bots. All 14 doors register
as open during play, i.e. bots are actually crossing between corridors rather than running one
lane end to end.

## Final validation
- Team pick in the browser now enters an active match after pointer-lock refusal: `menuOpen=false`,
  `engaged=true`, and navigation is ready. The browser uses drag-look in that fallback.
- Route-guide material survives static batching as one visible mesh: warm amber `#ffc247`, emissive
  `#6a3100` at 1.15; eight 12 mm bands, one on every stair tread. It is neutral rather than a team colour.
- `node --test tests/*.js`: **95/95 passing**. `npm run build`: **passing**. The only build notice is
  the pre-existing Rocket bundle-size warning.
- Follow-up regression: the focused input/layout suite is **18/18 passing**, including an A-key
  event that has `key="a"` but `code="Unidentified"`; production build passes again.
- Live follow-up: keyboard listeners now run in document capture phase, before iframe/overlay
  handlers can swallow A. The roof uses ten 0.25 m treads per side (including guides, still below
  the controller limit); live bots enter the first tread and the full suite is **96/96 passing**.
- Containment pass, all measured in the running game: held `A` moves 2.08 m / 2.77 m; the
  8-heading roof sweep reports **0 escapes** (was 2 of 8 ending 15 m outside the building); a
  4.5 m drop onto the deck does not tunnel; holding `W` from spawn B reaches the roof unaided
  (max y 2.50) and from spawn A via the x 3.4..3.9 door lane (max y 2.51); the bridge is walkable
  from both sides without a jump. `node --test tests/*.js`: **100/100 passing**, `npm run build`
  passing with only the pre-existing Rocket bundle-size notice.

## The yard: taking the fight outside
The building was a closed box — five corridors and a roof, all of it under one ceiling. The east
corridor wall now has a **ground-level doorway** (z -5.6..-4.1, header at 2.1) opening into a
walled **yard**: x 5..12, z -12..8, ~6.9 × 19.6 m of open ground fenced at 2.5 m.

It is not a dead-end pocket. Two **exterior flights** (x 5..6.6, at z = 3.0 climbing north and
z = -6.9 climbing south) run up the outside of the building to the roof deck at 2.5, and the east
parapet is split into three so each flight surfaces through its own **gate**. That closes a loop
the map never had: corridor → yard → outside stairs → roof → back down a well into C1/C5. Height
is now reachable without crossing the whole interior, but the approach is in the open.

Cover is two staggered lanes (x 6.8 / 9.5, seven rows from z 6.0 to -9.8) alternating
`COVER_LOW` 1.15 and `COVER_FULL` 2.05, so no sightline runs the yard's 19.6 m unbroken.

The engine needed one new concept for this. `MapData.levels` is a list of *storeys*, and the roam
grid only treats a level above index 0 as open-air — ground-level outdoor space was dropped on the
floor, so bots would have ignored the yard entirely. `LayoutSpec.openAreas` → `MapData.openAreas`
now declares open-air volumes explicitly, and `roam.ts` samples them (`OPEN_DECK_*` became
`OPEN_AIR_*`, `inOpenArea()` replaces the level-index guess). It is also what keeps `isInPlay`
honest: a bot in the yard is in the match, a bot on the GLB's 30 m lawn is not.

Measured in the running game: nav paths connect yard ↔ roof ↔ both spawns, **0 floor holes** in a
full-yard sweep, and a 75 s / 725-sample bot census puts **12.0% of bot time in the yard** (7.3% of
goals) and 17.4% on the roof, with **0% outside the map**.

## FPS: the shadow map was redrawing 108 casters at 60 Hz
Profiling the real frame (not `renderer.info`, which counts both passes) split it into fixed
update / render handlers / draw. The draw phase dominated, and inside it the **shadow pass was
~1.3 ms of CPU per frame** — a fifth of the whole draw — to move shadows a few centimetres as the
player walks.

`environment.ts` re-centres the sun's orthographic frustum on the player every frame, and that
implies a full re-render of every caster into the depth map. The fix is a clock: `sun.shadow.
autoUpdate = false`, and `update(playerPos, dt)` moves the light *and* sets `needsUpdate` together
on the profile's `shadowHz` (low 20 / medium 24 / high 30). The two must stay in the same branch —
the shader samples the depth map through the light's current matrix, so moving the light without
re-rendering slides every shadow off its object. The sky dome still follows the viewer every
frame; a dome that lags is a horizon that slides.

Same 35 s scripted drive (walk, fire continuously, grenade every 4 s, 180° turn every 2.5 s),
same machine (M1, WebGPU):

| | before | after |
|---|---|---|
| mean fps | 44.3 | **47.7** |
| shadow passes/s | 60 | **16.4** (measured) |

Guarded by a new test in `tests/strike-render-scale.js`: a missing or zero `shadowHz` makes the
interval `Infinity`/`NaN` and every shadow in the match silently freezes to the spawn room, which
no test that merely renders a frame would catch.

Also measured and deliberately **not** acted on: 400 decal meshes and 75 skinned avatars each cost
little enough at this scale that pooling them would be churn. The remaining headroom is GPU-side
fill, not CPU draw submission.

## Audio is off by default
New `AUDIO_AUTOSTART = false` in `config.ts`; `startAudioOnce()` returns early, so the first click
no longer brings sound up. Verified in the browser: **0 AudioContexts, 0 sfx fetches, 0 voices**
across team pick, firing, reloading and grenades. The Esc-menu toggle still works — flipping it on
creates the context and loads the bank, flipping it off silences it again. Flip the constant to
`true` to restore the old behaviour.

## Open
- The roof at 4.7% is deliberately a minority route (long walk, exposed, one bridge). If a human
  playtest says it is *too* rare, widen the bridge or add a third well — do not shorten the stairs,
  that is what keeps height honest.
- `layout.ts` covers `corridors` only. `warehouse` and `arena` get the raw export untouched.
- **Audio stays off until the PO asks for it.** One constant, `AUDIO_AUTOSTART` in `config.ts`.
- The yard at 12% of bot time sits between C1 (12.4%) and C2 (22.5%) — a real route, not a tourist
  attraction. If a hand playtest says the outside stairs are too safe, the lever is the fence line,
  not the stairs: dropping the east fence to `COVER_LOW` opens the climb to fire from the yard.
- Next FPS lever is GPU fill, not draw calls: the post chain (AO/bloom/grain on `high`) is the
  only thing left that scales with pixels. Measure before touching it.
