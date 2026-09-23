/**
 * Per-map layout overlays: gameplay geometry authored in code, on top of the shipped GLB.
 *
 * Why this exists: `corridors.glb` is a flat, empty, single-storey box — five 14 m corridors, no
 * cover, no verticality, both spawns staring down the same 2 m tube. Fixing that in the map
 * editor means re-exporting a 645 KB binary nobody can review in a diff. So the layout lives
 * here as numbers: a list of boxes (and a list of nodes to delete) applied to the loaded scene
 * graph *before* `buildStaticColliders` runs, which is the one seam where everything downstream
 * — movement collider, bullet collider, bounds, navmesh source, static batching — picks the new
 * geometry up for free.
 *
 * Rules for anything added here:
 * - Reuse the map's own materials (`surfaceOf`), or the addition reads as a grey programmer box.
 * - Cover is either waist-high (`COVER_LOW` 1.15: crouch eye is 1.0, standing eye 1.6, so you are
 *   safe crouched and can shoot over it standing) or full (`COVER_FULL` 2.05, under the 2.1 walls).
 *   Nothing in between — 1.15 is also above the 1.09 m the controller can mount (jump apex 0.576
 *   + stepHeight 0.52), so low cover never turns into an accidental platform.
 * - Anything meant to be climbed rises in 0.5 m steps, below `NAVMESH.walkableClimb` (0.52), so
 *   recast connects it and bots use the route too.
 */
import {
  Box3,
  BoxGeometry,
  Color,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three'
import type { OpenArea } from '../types'

/** Waist-high: crouch behind it, shoot over it standing, never stand on it. */
export const COVER_LOW = 1.15
/** Full cover: blocks a standing player, stays under the map's 2.1 m interior walls. */
export const COVER_FULL = 2.05
/**
 * One roof-stair riser. Kept far below the 0.52 m controller/navmesh limit: collision seams and
 * the 12 mm visual tread guide must never turn an otherwise valid staircase into a precision jump.
 */
export const STEP_RISE = 0.25
/** Ten shallow treads make the 2.5 m roof climb consistently walkable. */
export const STAIR_TREADS = 10
/** Depth per shallow tread; ten fill the 3.5 m stair well. */
export const STAIR_TREAD_DEPTH = 0.35
/** Length of one flight, and therefore the length of the well it climbs out of. */
export const STAIR_RUN = STAIR_TREADS * STAIR_TREAD_DEPTH

/**
 * Parapet wall thickness, and the two heights a roof edge can have.
 *
 * `ROOF_RIM` is deliberately `COVER_LOW`: crouch eye is 1.0 and standing eye 1.6, so you are
 * safe behind it crouched and can still shoot over it standing — and it is above the 1.09 m the
 * controller can mount (jump apex 0.576 + stepHeight 0.52), so it can never be climbed or
 * stumbled over. Before it existed you simply walked off the roof: a measured sweep ran the
 * player from (-2, 6) straight past the edge to x = -14.9, y = -0.05, i.e. onto the GLB's
 * 30 x 30 m ground plane outside the house, where nothing ever respawns him.
 *
 * `SLOT_RAIL` is the inner rail around the C3 drop-in lane. It has to be *over* stepHeight
 * (0.52) so a sprint along the roof cannot walk into the hole by accident, and *under* the
 * 1.09 m mount limit so a deliberate jump still drops you in. 0.45 m — the first build — was
 * below stepHeight, which is why the lane read as a trap instead of a choice.
 */
export const PARAPET_THICKNESS = 0.15
export const ROOF_RIM = COVER_LOW
export const SLOT_RAIL = 0.75

/** An axis-aligned box in world metres. `x0/z0` are the min corner, `y0` the floor it sits on. */
export interface LayoutBlock {
  x0: number
  x1: number
  z0: number
  z1: number
  y0: number
  y1: number
  /** Which harvested material to draw it with. Defaults to `wall`. */
  surface?: SurfaceKey
  /** Shows up in the scene graph, so the map viewer can tell blocks apart. */
  label: string
}

export type SurfaceKey = 'wall' | 'deck' | 'floor' | 'guide'

/**
 * Open-air ground the overlay declares in bounds. The shape lives in `types.ts` because the
 * loader hands it straight to `MapData` and the bots read it from there.
 */
export type LayoutArea = OpenArea

export interface LayoutSpec {
  /** Nodes deleted from the graph before anything is baked. */
  strip?(node: Object3D): boolean
  blocks: LayoutBlock[]
  /**
   * World Y of any walkable storey this overlay invents, e.g. a roof deck.
   *
   * A storey has to be declared, not just built: the bot roam grid probes downward once per
   * entry in `MapData.levels`, so a floor the GLB never knew about is invisible to it, and bots
   * will use a route the navmesh happily connects for them. (Measured: 0% of bot traffic used
   * the Corridors roof until it was listed here.)
   */
  levels?: number[]
  /** Open-air ground the overlay declares in bounds (see `LayoutArea`). */
  openAreas?: LayoutArea[]
}

export interface LayoutResult {
  group: Group
  blocks: number
  stripped: number
  /** Walkable storeys the overlay added, for the loader to merge into `MapData.levels`. */
  levels: number[]
  /** Open-air ground the overlay declares in bounds, for the loader to pass to the bots. */
  openAreas: LayoutArea[]
}

// ---------------------------------------------------------------------------
// Corridors
// ---------------------------------------------------------------------------

/**
 * Measured off the shipped GLB (`?dev=map`, `window.__ps`), not guessed:
 *
 *   building x -5..5, z -12..8 · ceiling planes at 2.48 · interior walls 2.1 · doors 1.5 m wide
 *   FIVE parallel 2 m corridors, divided by walls at x = -3, -1, 1, 3:
 *     C1 x -5..-3 │ C2 x -3..-1 │ C3 x -1..1 │ C4 x 1..3 │ C5 x 3..5
 *   all 14 m long (z -9..5), spawn room A z 5..8 and spawn room B z -12..-9 across the full width.
 *
 * C3 is the problem: it opens straight into both spawn rooms with no door, so the default route
 * is a 14 m tube with an enemy at the far end. The side corridors are only reachable through
 * doors at the ends (z=5 / z=-9), through the walls at x=-1 / x=3 (z 2.3 and -6.3), and through
 * the stubs at x=-3 / x=1 (z=-2). Nobody takes them, because they are equally empty.
 */
const DECK_Y0 = 2.44
const DECK_Y1 = 2.5
/** Sky over C3: the drop-in lane. Everything under it is exposed from the roof. */
const SLOT_X0 = -1
const SLOT_X1 = 1
const SLOT_Z0 = -9
const SLOT_Z1 = 5
/** The bridge across the slot. Both slot rails open here, so it is walked onto, never hopped. */
const BRIDGE_Z0 = -2.7
const BRIDGE_Z1 = -1.5
/** The building footprint, and therefore the roof's own outline. */
const ROOF_X0 = -5
const ROOF_X1 = 5
const ROOF_Z0 = -12
const ROOF_Z1 = 8

/**
 * The roof's holes and outline, exported so the tests can assert against the numbers the map is
 * actually built from. Duplicating them in a test only proves the copy agrees with itself.
 */
export const ROOF_PLAN = {
  footprint: { x0: ROOF_X0, x1: ROOF_X1, z0: ROOF_Z0, z1: ROOF_Z1 },
  slot: { x0: SLOT_X0, x1: SLOT_X1, z0: SLOT_Z0, z1: SLOT_Z1 },
  bridge: { z0: BRIDGE_Z0, z1: BRIDGE_Z1 },
  deckY: DECK_Y1,
} as const
/**
 * Roof openings over the two stair wells. Team A climbs at the north end of C5, team B at the
 * south end of C1 — diagonally opposite, so the two teams never surface at the same place, and
 * height always costs a commitment to an outer corridor rather than being free from spawn.
 *
 * Two hard constraints, both learned from measurements rather than taste:
 *
 * 1. A well is exactly one flight long (`STAIR_RUN`). Any slack left over is an unfenced hole
 *    at the foot of the stairs with neither tread nor deck under it.
 * 2. A well stops `PARAPET_THICKNESS` short of the building edge, so the perimeter rim below
 *    can run all the way round without floating over the opening — and so a player surfacing
 *    from the climb meets a parapet instead of a 2.5 m drop off the side of the house.
 *
 * The z ranges also keep the *bottom* tread out of the spawn-room doorway. These are sliding
 * doors: the parked leaf occupies two thirds of its own 1.5 m frame, leaving a 0.5 m gap —
 * exactly the player's diameter (probed, x -3.9..-3.4 was the only way through door B). With
 * the flight starting flush against that wall you had to thread the slot and hit the first
 * riser in the same step. Now the flight starts 0.8 m into the corridor, so you come through
 * the door onto flat floor and meet a 1.55 m wide tread with the whole corridor to line it up.
 */
const WELL_A = { x0: 3.3, x1: ROOF_X1 - PARAPET_THICKNESS, z0: 0.4, z1: 0.4 + STAIR_RUN }
const WELL_B = { x0: ROOF_X0 + PARAPET_THICKNESS, x1: -3.3, z0: -8.2, z1: -8.2 + STAIR_RUN }

/** The two stair wells, in the same order as the spawns they serve. Exported for the tests. */
export const WELLS = [WELL_A, WELL_B] as const

// ---------------------------------------------------------------------------
// The yard: the one place Corridors stops being a corridor
// ---------------------------------------------------------------------------

/**
 * A walled yard along the building's east face, and the three ways in and out of it.
 *
 * The whole map was interior until now. That is the reason every fight in it reads the same:
 * both teams are always in a 2 m tube or on a 10 x 20 m deck, sightlines are axis-aligned, and
 * the only vertical decision is "stairs or not". A yard changes the *shape* of the fight —
 * daylight, a long flank, and a route that starts indoors, leaves the building, and comes back
 * in one storey higher.
 *
 * Three connections, deliberately of different quality:
 *
 * 1. A 1.5 m ground doorway punched through the east wall of C5 (`YARD_DOOR`). The cheap way
 *    out and the one that reads as "exit". It costs nothing but exposes the C5 mouth.
 * 2. Two exterior flights up to the roof (`YARD_FLIGHTS`), one at each end. They make the yard
 *    a *through* route rather than a pocket: in at ground level, out onto the roof, or the
 *    reverse — the long way round that skips the single bridge over the C3 slot.
 * 3. The parapet above. `rim-east` is cut open at the head of each flight (`YARD_GATES`) and
 *    nowhere else, which is also why the roof perimeter test now asserts "closed except at a
 *    declared gate" instead of "closed".
 *
 * The enclosure is not decoration: without it the yard spills onto the GLB's 30 x 30 m lot,
 * which is exactly the failure the roof parapet was added to fix (walk off, stay alive, no
 * respawn, no way back). Its fences are the same 2.5 m as the building's own outside walls, so
 * from the roof you look down into the yard over the parapet and the yard is never safe.
 */
const YARD_X1 = 12
const FENCE_THICKNESS = 0.2
/** Same height as the building's exterior walls, so the yard reads as part of the block. */
const FENCE_HEIGHT = DECK_Y1
/** The east wall of C5, thickness included: the yard starts where the building ends. */
const EAST_WALL_X0 = 4.95
const EAST_WALL_X1 = 5.05
/** The stretch of east wall that is corridor rather than spawn room — the only part we may cut. */
const EAST_WALL_Z0 = -9
const EAST_WALL_Z1 = 5

/**
 * The ground-level exit, 1.5 m wide to match the map's own doorways.
 *
 * z is chosen to clear everything already in C5: stair A's well (z 0.4..3.9), `c5-cover-c`
 * (z -3.4..-2.5) and `c5-block-d` (z -7.2..-6.3). It lands in the gap between the last two, so
 * the exit is a decision made mid-corridor, under fire, and not a free door next to a spawn.
 */
export const YARD_DOOR = { z0: -5.6, z1: -4.1 } as const
/** Header height over the exit. Matches the 2.1 m interior walls, so it reads as a doorway. */
const DOOR_HEAD = 2.1

/**
 * The exterior flights, given by the z their *lowest* tread starts at and the direction they
 * climb. Both are 1.55 m wide — the same tread width as the indoor flights, which is what makes
 * them recognisable as stairs at a glance — and start at the building's outer face, so the top
 * tread is flush with the deck it arrives at and no tread reaches past the wall into a corridor.
 */
// Flush with the roof edge, not with the outside face of the wall: the 10 cm offset that reads
// as tidy on a plan is a 10 cm slot at the gate, dropping the full 2.5 m to the yard.
const YARD_STAIR_X0 = ROOF_X1
const YARD_STAIR_X1 = YARD_STAIR_X0 + 1.55
export const YARD_FLIGHTS = [
  { z: 3.0, dir: 1 as const, label: 'stair-yard-a' },
  { z: -6.9, dir: -1 as const, label: 'stair-yard-b' },
] as const

/**
 * Where a flight meets the deck: the footprint of its top tread, which is also the hole left in
 * `rim-east`. Derived from the flight rather than typed twice — a gate that does not line up
 * with a tread is a 2.5 m drop off the side of the house with a parapet either side of it.
 */
function topTread(flight: { z: number; dir: 1 | -1 }): { z0: number; z1: number } {
  const from = flight.z + flight.dir * STAIR_TREAD_DEPTH * (STAIR_TREADS - 1)
  const to = from + flight.dir * STAIR_TREAD_DEPTH
  return { z0: Math.min(from, to), z1: Math.max(from, to) }
}

/** The two openings in the roof's east parapet, south first. Exported for the tests. */
export const YARD_GATES = YARD_FLIGHTS.map(topTread).sort((a, b) => a.z0 - b.z0)

/** The yard's outline and its ways in, exported so the tests assert the built numbers. */
export const YARD_PLAN = {
  footprint: { x0: ROOF_X1, x1: YARD_X1, z0: ROOF_Z0, z1: ROOF_Z1 },
  door: YARD_DOOR,
  gates: YARD_GATES,
  fence: { thickness: FENCE_THICKNESS, height: FENCE_HEIGHT },
} as const

/**
 * True for the one GLB node the yard needs deleted: the east wall of the five corridors.
 *
 * Matched on its measured world box rather than its name, because `wall_6dchtt12nh4673ns` is an
 * exporter-generated id that changes on every re-export, and a strip predicate that silently
 * stops matching would leave the doorway walled up with no error anywhere. The box is unique:
 * it is the only wall node in the 10 cm slab at x 5 spanning the corridor length. It comes back
 * as three layout blocks (`east-wall-south`, `-north`, `-header`) with the exit between them.
 */
function isCorridorEastWall(node: Object3D): boolean {
  if (node.userData?.kind !== 'wall') return false
  const box = new Box3().setFromObject(node)
  if (box.isEmpty()) return false
  return (
    box.min.x > EAST_WALL_X0 - 0.1
    && box.max.x < EAST_WALL_X1 + 0.1
    && box.min.z > EAST_WALL_Z0 - 0.2
    && box.max.z < EAST_WALL_Z1 + 0.2
  )
}

function corridors(): LayoutSpec {
  const blocks: LayoutBlock[] = []
  const add = (block: LayoutBlock) => blocks.push(block)

  // --- roof: the ceiling planes, rebuilt as decks --------------------------
  // The GLB's ceilings are single-sided planes at 2.48: invisible from above, so they are
  // stripped and replaced by 6 cm slabs that read as a roof from the top and as the same ceiling
  // from below (same material). Three holes are left in it: the slot over C3 and the two stair
  // wells.
  const deck = (x0: number, x1: number, z0: number, z1: number, label: string) =>
    add({ x0, x1, z0, z1, y0: DECK_Y0, y1: DECK_Y1, surface: 'deck', label })
  // West of the slot, split around well B.
  deck(ROOF_X0, SLOT_X0, WELL_B.z1, ROOF_Z1, 'deck-west')
  deck(WELL_B.x1, SLOT_X0, ROOF_Z0, WELL_B.z1, 'deck-west-south')
  deck(ROOF_X0, WELL_B.x1, ROOF_Z0, WELL_B.z0, 'deck-west-tail')
  // East of the slot, split around well A.
  deck(SLOT_X1, ROOF_X1, ROOF_Z0, WELL_A.z0, 'deck-east')
  deck(SLOT_X1, WELL_A.x0, WELL_A.z0, ROOF_Z1, 'deck-east-north')
  deck(WELL_A.x0, ROOF_X1, WELL_A.z1, ROOF_Z1, 'deck-east-tail')
  // The strip of roof between each well and the building edge. Without it the perimeter
  // parapet below would hang over the opening with nothing underneath it, and the well would
  // reach the outside wall — which is the one place a climb must not come out.
  deck(ROOF_X0, WELL_B.x0, WELL_B.z0, WELL_B.z1, 'deck-west-rim')
  deck(WELL_A.x1, ROOF_X1, WELL_A.z0, WELL_A.z1, 'deck-east-rim')
  // The slot's end caps, over the two spawn rooms.
  deck(SLOT_X0, SLOT_X1, SLOT_Z1, ROOF_Z1, 'deck-cap-a')
  deck(SLOT_X0, SLOT_X1, ROOF_Z0, SLOT_Z0, 'deck-cap-b')
  // The only crossing between the two roof halves: a 1.2 m plank at mid-map. Anyone else has to
  // go the long way round through a spawn-room cap, which is what makes the roof a decision
  // rather than a free lane.
  deck(SLOT_X0, SLOT_X1, BRIDGE_Z0, BRIDGE_Z1, 'deck-bridge')

  // The perimeter. A closed ring, because the roof used to have no edge at all: walking off it
  // put the player on the GLB's ground plane 15 m outside the house, still alive, with no way
  // back in and no fall deep enough for the controller to call it a fall.
  // The east side is the one exception: it is cut open at the head of each exterior flight
  // (`YARD_GATES`), so the ring is three segments there. The gaps are the width of a tread and
  // have that tread underneath them at deck height — the only kind of hole a parapet may have.
  const rimEast = [
    [ROOF_Z0, YARD_GATES[0].z0, 'rim-east-south'],
    [YARD_GATES[0].z1, YARD_GATES[1].z0, 'rim-east-mid'],
    [YARD_GATES[1].z1, ROOF_Z1, 'rim-east-north'],
  ] as const
  for (const [x0, x1, z0, z1, label] of [
    [ROOF_X0, ROOF_X0 + PARAPET_THICKNESS, ROOF_Z0, ROOF_Z1, 'rim-west'],
    ...rimEast.map(
      ([z0, z1, label]) => [ROOF_X1 - PARAPET_THICKNESS, ROOF_X1, z0, z1, label] as const,
    ),
    [ROOF_X0, ROOF_X1, ROOF_Z0, ROOF_Z0 + PARAPET_THICKNESS, 'rim-south'],
    [ROOF_X0, ROOF_X1, ROOF_Z1 - PARAPET_THICKNESS, ROOF_Z1, 'rim-north'],
  ] as const) {
    add({ x0, x1, z0, z1, y0: DECK_Y1, y1: DECK_Y1 + ROOF_RIM, label })
  }

  // Rails along the slot, `SLOT_RAIL` high so a sprint cannot fall in. They stop at the bridge
  // from both sides: a rail you have to hop to reach the only crossing on the roof turns the
  // bridge into a trick shot, and the crossing is supposed to be the obvious brave option.
  for (const [x0, x1, label] of [
    [SLOT_X0 - PARAPET_THICKNESS, SLOT_X0, 'rail-west'],
    [SLOT_X1, SLOT_X1 + PARAPET_THICKNESS, 'rail-east'],
  ] as const) {
    add({ x0, x1, z0: SLOT_Z0, z1: BRIDGE_Z0, y0: DECK_Y1, y1: DECK_Y1 + SLOT_RAIL, label: `${label}-south` })
    add({ x0, x1, z0: BRIDGE_Z1, z1: SLOT_Z1, y0: DECK_Y1, y1: DECK_Y1 + SLOT_RAIL, label: `${label}-north` })
  }

  // Roof cover: a 10 x 20 m flat deck with nothing on it is a sniper platform, not a route.
  // Staggered waist-high blocks so a roof duel is also a corner fight, and so the long walk
  // between the two wells is survivable.
  for (const [x0, z0, label] of [
    [-4.4, 2.0, 'roof-cover-nw'],
    [1.4, 3.4, 'roof-cover-ne'],
    [-2.6, -1.0, 'roof-cover-w'],
    [3.4, -2.6, 'roof-cover-e'],
    // Inboard of well B (x -4.85..-3.3): at its old x of -3.7 this block floated over the
    // open stairwell and blocked the top of the climb.
    [-3.1, -6.4, 'roof-cover-sw'],
    [2.0, -7.6, 'roof-cover-se'],
  ] as const) {
    add({ x0, x1: x0 + 1.3, z0, z1: z0 + 1.3, y0: DECK_Y1, y1: DECK_Y1 + COVER_LOW, label })
  }

  // --- the two ways up ------------------------------------------------------
  // Ten 0.25 m risers top out flush with the 2.5 m deck. The climb stays comfortably below the
  // controller limit even where collision geometry overlaps at a tread edge.
  //
  // Each stack is 1 m of a 2 m corridor, so ground traffic still squeezes past on the other
  // 0.83 m and the corridor is not plugged. They are NOT in the spawn rooms: height has to be
  // paid for by walking an outer corridor, in the open, with your back to a doorway.
  //
  // They climb AWAY from the spawn that owns them, starting 0.8 m past the doorway. The first
  // build had them the other way round, and the effect was brutal: you stepped out of spawn A
  // into C5 and met the 2 m top riser face-on, a dead wall with the actual climb hidden behind
  // it. Playtest verdict was "how do I even get on the roof, if there is one?" — the route
  // existed and bots used it, but no human could see it. Now the doorway frames the bottom step
  // from a short distance, so the 0.5 m gap left by the parked sliding leaf and the first riser
  // are two separate moves instead of one.
  //
  // Each flight fills its well exactly — same x span, same length — so there is never a lip of
  // open well with nothing under it, and the top tread always lands flush on the deck. The
  // numbers come off the well, not out of the air, because the two used to be edited apart.
  stack(add, {
    x0: WELL_A.x0,
    x1: WELL_A.x1,
    z: WELL_A.z1,
    depth: STAIR_TREAD_DEPTH,
    dir: -1,
    label: 'stair-a',
  })
  stack(add, {
    x0: WELL_B.x0,
    x1: WELL_B.x1,
    z: WELL_B.z0,
    depth: STAIR_TREAD_DEPTH,
    dir: 1,
    label: 'stair-b',
  })

  // --- C3 (x -1..1): break the spawn-to-spawn tube -------------------------
  // Five half-width full-height pillars, alternating sides: the 0.9 m gap zigzags, so the
  // corridor stays walkable but no two points 14 m apart can see each other. Waist-high cover
  // would not do it here — standing eye height is 1.6, and this is the lane both teams run first.
  for (const [west, z0, label] of [
    [true, 3.4, 'c3-pillar-1'],
    [false, 0.8, 'c3-pillar-2'],
    [true, -1.8, 'c3-pillar-3'],
    [false, -4.4, 'c3-pillar-4'],
    [true, -7.0, 'c3-pillar-5'],
  ] as const) {
    add({
      x0: west ? -1 : 0,
      x1: west ? 0 : 1,
      z0,
      z1: z0 + 0.9,
      y0: 0,
      y1: COVER_FULL,
      label,
    })
  }

  // --- the four side corridors --------------------------------------------
  // Same trick at a slower rhythm, mixing waist-high (peek and shoot over) with full height
  // (a real corner). Each block is half the 2 m width, alternating sides. The z values dodge
  // every door opening: x=-1 and x=3 have doors at z 1.55..3.05 and -7.05..-5.55, the x=-3 and
  // x=1 stubs have one at z -2.75..-1.25, and the end walls have theirs at z=5 / z=-9.
  const side = (
    x0: number,
    z0: number,
    height: number,
    label: string,
  ) => add({ x0, x1: x0 + 1, z0, z1: z0 + 0.9, y0: 0, y1: height, label })

  // C1 (x -5..-3) — south end is stair B's well (z -8.2..-4.7), so cover stops at z -4.2
  side(-5, 3.2, COVER_FULL, 'c1-block-a')
  side(-4, 0.2, COVER_LOW, 'c1-cover-b')
  side(-5, -4.2, COVER_FULL, 'c1-block-c')
  // C2 (x -3..-1)
  side(-3, 3.4, COVER_LOW, 'c2-cover-a')
  side(-2, 0.0, COVER_FULL, 'c2-block-b')
  side(-3, -3.8, COVER_LOW, 'c2-cover-c')
  side(-2, -8.3, COVER_FULL, 'c2-block-d')
  // C4 (x 1..3)
  side(2, 3.2, COVER_LOW, 'c4-cover-a')
  side(1, -0.4, COVER_FULL, 'c4-block-b')
  side(2, -4.0, COVER_LOW, 'c4-cover-c')
  side(1, -7.8, COVER_FULL, 'c4-block-d')
  // C5 (x 3..5) — the whole north end is stair A's well now (z 0.4..3.9), so cover stops at z 0
  side(4, -0.9, COVER_FULL, 'c5-block-b')
  side(3, -3.4, COVER_LOW, 'c5-cover-c')
  side(4, -7.2, COVER_FULL, 'c5-block-d')

  // --- spawn rooms ---------------------------------------------------------
  // One waist-high block each, in the strip between the two spawn zones, facing the C3 mouth:
  // something to break contact behind when you get spawn-peeked, without shielding the spawn
  // itself and without standing inside a zone the sampler would then try to spawn you on.
  add({ x0: -1.4, x1: 0.0, z0: 6.2, z1: 7.0, y0: 0, y1: COVER_LOW, label: 'spawn-a-cover' })
  add({ x0: 0.0, x1: 1.4, z0: -10.9, z1: -10.1, y0: 0, y1: COVER_LOW, label: 'spawn-b-cover' })

  // --- the yard (see YARD_PLAN) --------------------------------------------
  // The east wall of C5 comes back in three pieces, with the exit between them. Rebuilt rather
  // than cut because a GLB node is all-or-nothing: stripping it is the only way to make a hole,
  // and a 14 m gap where a wall used to be would open all five corridors to the yard at once.
  add({ x0: EAST_WALL_X0, x1: EAST_WALL_X1, z0: EAST_WALL_Z0, z1: YARD_DOOR.z0, y0: 0, y1: DECK_Y1, label: 'east-wall-south' })
  add({ x0: EAST_WALL_X0, x1: EAST_WALL_X1, z0: YARD_DOOR.z1, z1: EAST_WALL_Z1, y0: 0, y1: DECK_Y1, label: 'east-wall-north' })
  // The header over the exit. Without it the opening runs the full 2.5 m to the roof slab and
  // reads as damage rather than a door.
  add({ x0: EAST_WALL_X0, x1: EAST_WALL_X1, z0: YARD_DOOR.z0, z1: YARD_DOOR.z1, y0: DOOR_HEAD, y1: DECK_Y1, label: 'east-wall-header' })

  // The enclosure. Three fences; the building's own east wall is the fourth side.
  for (const [x0, x1, z0, z1, label] of [
    [YARD_X1 - FENCE_THICKNESS, YARD_X1, ROOF_Z0, ROOF_Z1, 'yard-fence-east'],
    [ROOF_X1, YARD_X1, ROOF_Z1 - FENCE_THICKNESS, ROOF_Z1, 'yard-fence-north'],
    [ROOF_X1, YARD_X1, ROOF_Z0, ROOF_Z0 + FENCE_THICKNESS, 'yard-fence-south'],
  ] as const) {
    add({ x0, x1, z0, z1, y0: 0, y1: FENCE_HEIGHT, label })
  }

  // The two exterior flights, built by the same `stack` as the indoor ones: ten 0.25 m risers,
  // amber tread guides, top tread flush with the 2.5 m deck at its gate in the parapet.
  for (const flight of YARD_FLIGHTS) {
    stack(add, {
      x0: YARD_STAIR_X0,
      x1: YARD_STAIR_X1,
      z: flight.z,
      depth: STAIR_TREAD_DEPTH,
      dir: flight.dir,
      label: flight.label,
    })
  }

  // Yard cover. A 7 x 20 m walled box with nothing in it is worse than the corridor it replaces:
  // one long lane with a fence at each end. The x positions cycle through three lanes instead of
  // alternating between two, because two lanes always leave a straight channel down the middle —
  // measured on the first pass as a clear 1.3 m gap running the full 20 m. Cycling three makes
  // the blocked x spans overlap (6.7..8.9, 8.2..10.4, 9.6..11.8 cover 6.7 m of the 6.75 m yard),
  // so the only straight run left is the 1.65 m strip against the building, and both flights
  // interrupt that.
  for (const [x0, z0, height, label] of [
    [6.7, 5.9, COVER_LOW, 'yard-crate-n'],
    [9.6, 4.0, COVER_FULL, 'yard-container-ne'],
    [8.2, 1.4, COVER_LOW, 'yard-crate-e'],
    [6.7, -1.2, COVER_FULL, 'yard-container-mid'],
    [9.6, -3.8, COVER_LOW, 'yard-crate-se'],
    [8.2, -6.4, COVER_FULL, 'yard-container-s'],
    [6.7, -9.2, COVER_LOW, 'yard-crate-sw'],
  ] as const) {
    add({ x0, x1: x0 + 2.2, z0, z1: z0 + 1.2, y0: 0, y1: height, label })
  }

  return {
    // The flat ceiling planes are replaced by the decks above; the corridor's east wall by the
    // three pieces with the yard exit between them.
    strip: (node) => node.userData?.kind === 'ceiling' || isCorridorEastWall(node),
    blocks,
    levels: [DECK_Y1],
    // Ground inside the fences only: the vertical span stops below `COVER_LOW` so the roam grid
    // never picks the top of a crate, which is cover precisely because it cannot be stood on.
    openAreas: [
      {
        x0: ROOF_X1 + 0.05,
        x1: YARD_X1 - FENCE_THICKNESS,
        z0: ROOF_Z0 + FENCE_THICKNESS,
        z1: ROOF_Z1 - FENCE_THICKNESS,
        y0: -0.6,
        y1: 0.6,
        label: 'yard',
      },
    ],
  }
}

/**
 * `STAIR_TREADS` risers climbing along z, each `STEP_RISE` taller than the last.
 *
 * Drawn in the floor material, not the wall one. A staircase built out of wall reads as part of
 * the wall from any distance — the same reason the first build was unfindable — and the floor
 * texture is the one cue that says "this is a surface you stand on" without adding a decal, a
 * light, or a single draw call.
 */
function stack(
  add: (block: LayoutBlock) => void,
  opts: { x0: number; x1: number; z: number; depth: number; dir: 1 | -1; label: string },
): void {
  for (let i = 0; i < STAIR_TREADS; i++) {
    const from = opts.z + opts.dir * opts.depth * i
    const to = from + opts.dir * opts.depth
    const z0 = Math.min(from, to)
    const z1 = Math.max(from, to)
    const top = STEP_RISE * (i + 1)
    add({
      x0: opts.x0,
      x1: opts.x1,
      z0,
      z1,
      y0: 0,
      y1: top,
      surface: 'floor',
      label: `${opts.label}-${i + 1}`,
    })
    // Thin warm bands make the climb legible from its doorway — without a floating HUD arrow
    // or a sign that competes with combat. They sit on the treads (not in the route), so each
    // band leads to the next one and naturally points up to the open roof well.
    add({
      x0: opts.x0 + 0.1,
      x1: opts.x1 - 0.1,
      z0: z0 + 0.12,
      z1: z1 - 0.12,
      y0: top,
      y1: top + 0.012,
      surface: 'guide',
      label: `guide-${opts.label}-${i + 1}`,
    })
  }
}

const LAYOUTS: Record<string, () => LayoutSpec> = {
  corridors,
}

/**
 * The overlay registered for `id`, or null. Exported so the spec can be asserted on without a
 * scene graph — the numbers in it are gameplay rules (cover heights, riser heights), and a
 * regression there is silent: the map still loads, it just stops playing the way it was tuned.
 */
export function getLayout(id: string | false | undefined): LayoutSpec | null {
  if (!id) return null
  return LAYOUTS[id.trim().toLowerCase()]?.() ?? null
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/**
 * Apply the overlay registered for `id` (a map name / GLB basename) to a freshly parsed scene
 * graph. Returns null when the map has no overlay, or when `id` is false.
 *
 * Must run before the colliders are baked and before static batching.
 */
export function applyLayout(root: Object3D, id: string | false | undefined): LayoutResult | null {
  const spec = getLayout(id)
  if (!spec) return null

  const surfaces = harvestSurfaces(root)

  let stripped = 0
  if (spec.strip) {
    const doomed: Object3D[] = []
    root.traverse((node) => {
      if (spec.strip?.(node)) doomed.push(node)
    })
    for (const node of doomed) {
      node.removeFromParent()
      stripped++
    }
  }

  const group = new Group()
  group.name = 'layout'
  for (const block of spec.blocks) {
    const width = block.x1 - block.x0
    const height = block.y1 - block.y0
    const depth = block.z1 - block.z0
    if (width <= 0 || height <= 0 || depth <= 0) {
      console.warn(`[layout] ${id}: block "${block.label}" is degenerate, skipped`)
      continue
    }
    const mesh = new Mesh(
      new BoxGeometry(width, height, depth),
      surfaces[block.surface ?? 'wall'] ?? surfaces.wall,
    )
    mesh.name = `layout-${block.label}`
    mesh.position.set(
      block.x0 + width / 2,
      block.y0 + height / 2,
      block.z0 + depth / 2,
    )
    // Same flags the loader gives map geometry; it re-runs after this anyway.
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  root.add(group)
  root.updateMatrixWorld(true)

  return {
    group,
    blocks: group.children.length,
    stripped,
    levels: spec.levels ?? [],
    openAreas: spec.openAreas ?? [],
  }
}

/**
 * Borrow the map's own materials, so added geometry is indistinguishable from the export (and
 * merges into the same static batch instead of adding a draw call). Picks the largest mesh of
 * each kind, since that is the one carrying the "main" texture.
 */
function harvestSurfaces(root: Object3D): Record<SurfaceKey, Material> {
  const best: Partial<Record<SurfaceKey, { area: number; material: Material }>> = {}
  const kinds: Record<string, SurfaceKey> = {
    wall: 'wall',
    ceiling: 'deck',
    slab: 'floor',
  }
  root.traverse((node) => {
    const key = kinds[String(node.userData?.kind ?? '')]
    if (!key) return
    node.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      if (!material) return
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      const box = mesh.geometry.boundingBox
      if (!box) return
      const size = box.max.clone().sub(box.min)
      const area = Math.max(size.x * size.y, size.x * size.z, size.y * size.z)
      const current = best[key]
      if (!current || area > current.area) best[key] = { area, material }
    })
  })

  // A plain GLB with no map-editor extras has none of these kinds; fall back to any material in
  // the scene, and only then to a fresh one (which `prepareMaterials` will still tone down).
  const fallback = firstMaterial(root)
  const wall = best.wall?.material ?? fallback
  // Route guidance uses an emissive amber, not either team's paint colour: it remains legible
  // in shade and under colour-vision deficiencies, and it cannot be mistaken for a player side.
  const guide = new MeshStandardMaterial({
    color: new Color(0xffc247),
    emissive: new Color(0x6a3100),
    emissiveIntensity: 1.15,
    roughness: 0.52,
    metalness: 0.08,
  })
  return {
    wall,
    deck: best.deck?.material ?? wall,
    floor: best.floor?.material ?? wall,
    guide,
  }
}

function firstMaterial(root: Object3D): Material {
  let found: Material | null = null
  root.traverse((node) => {
    if (found) return
    const mesh = node as Mesh
    if (!mesh.isMesh) return
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (material) found = material
  })
  if (found) return found
  throw new Error('[layout] the map has no materials to borrow')
}
