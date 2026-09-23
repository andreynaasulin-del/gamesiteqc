import { Vector3 } from 'three'
import { validateFloor } from '../map/spawns'
import type { MapData, Navigation, WorldQuery } from '../types'

const GRID_STEP = 0.5
const MAX_GRID_CANDIDATES_PER_LEVEL = 4000
const NAV_SNAP_TOLERANCE = 0.3
const INDOOR_PROBE_HEIGHT = 0.3
const INDOOR_CEILING_RANGE = 4
const INDOOR_TARGET_CHANCE = 0.85
/**
 * Share of roam goals aimed at open-air ground that is still in play — a roof deck the map
 * declares as a level, or a yard it declares as an `OpenArea`.
 *
 * Uniform sampling cannot find either on its own. Neither has anything above it, so `hasCeiling`
 * files them with the lawn and they compete for the 15% of goals that are not indoor. On
 * Corridors that left the roof — built, reachable, covered, and the only way to cross the map
 * above the fighting — with 4.7% of measured bot traffic.
 */
const OPEN_AIR_TARGET_CHANCE = 0.22
/**
 * The same draw for a bot already out there.
 *
 * Without it the roof is a waypoint, not a route: the climb costs six seconds, the bot touches
 * its goal, redraws, and 78% of the time the next one is downstairs again. Weighting the redraw
 * in favour of staying is what turns the deck — and the yard — into a lane bots travel along.
 */
const OPEN_AIR_STAY_CHANCE = 0.6
/** Bucket edge of the open-air lookup, in metres. */
const OPEN_AIR_BUCKET_SIZE = 1
/** How close to an open-air sample a bot must stand to count as being out there. */
const OPEN_AIR_SNAP = 0.75
const BUILDING_AREA_RADIUS = 8
// The stricter gameplay bound wins over the broader definition of the building area.
const MAX_DISTANCE_FROM_INDOOR = 4
const UP = new Vector3(0, 1, 0)

interface Candidate {
  point: Vector3
  indoor: boolean
  /** Index into the sorted level list this sample was probed from. 0 is the ground floor. */
  levelIndex: number
}

export interface RoamTargetSet {
  readonly size: number
  readonly indoorSize: number
  /** Samples on in-play open-air ground: an upper storey, or a declared `OpenArea`. */
  readonly openAirSize: number
  /**
   * 22% on in-play open-air ground when the map has any — 60% for a bot already standing out
   * there — then 85% indoor; otherwise anywhere in the tightly bounded building area.
   *
   * @param from where the bot is asking from. Optional: omitting it just drops the stickiness.
   */
  sample(rng: () => number, from?: Vector3): Vector3 | null
  sampleIndoor(rng: () => number): Vector3 | null
  /**
   * Is this point inside the arena rather than out on the terrain around it?
   *
   * Under a ceiling counts, and so does open-air ground the map vouches for — an upper storey
   * or a declared `OpenArea`: a roof deck and a walled yard are playable space with a way in and
   * a way out, unlike the lawn they stand on. The brain marches a bot that has been "outside"
   * for six seconds back indoors, so answering this with a bare ceiling probe would evict every
   * bot that stepped out — which is exactly what capped roof traffic on Corridors at 4.7% no
   * matter how many goals were placed up there, and would do the same to the yard.
   */
  isInPlay(point: Vector3): boolean
}

type SnappingNavigation = Navigation & {
  snapToNavmesh?(point: Vector3): Vector3 | null
}

/**
 * Build the shared, deterministic roam pool once for a loaded map. A uniform sample of the
 * indoor grid naturally distributes goals across floors in proportion to walkable indoor area;
 * open-air ground is drawn separately because no amount of area makes the ceiling probe see it
 * (see `OPEN_AIR_TARGET_CHANCE`).
 */
export function createRoamTargetSet(
  map: MapData,
  world: WorldQuery,
  nav: Navigation,
): RoamTargetSet {
  const all: Candidate[] = []
  const indoor: Candidate[] = []
  const openAir: Candidate[] = []
  const seen = new Set<string>()
  const probeOrigin = new Vector3()
  const point = new Vector3()
  const levelYs = map.levels.length > 0
    ? map.levels.map((level) => level.y).sort((left, right) => left - right)
    : [map.bounds.min.y]
  const snapToNavmesh = nav.ready
    ? (nav as SnappingNavigation).snapToNavmesh
    : undefined

  const hasCeiling = (candidate: Vector3): boolean => {
    probeOrigin.set(candidate.x, candidate.y + INDOOR_PROBE_HEIGHT, candidate.z)
    return world.raycast(probeOrigin, UP, INDOOR_CEILING_RANGE) !== null
  }

  /**
   * Inside a volume the map declared in bounds. Cheap and exact — a handful of box tests — which
   * is the point: the alternative is asking the geometry, and the geometry cannot tell a yard
   * from the field next to it.
   */
  const openAreas = map.openAreas ?? []
  const inOpenArea = (candidate: Vector3): boolean => {
    for (let index = 0; index < openAreas.length; index++) {
      const area = openAreas[index]
      if (
        candidate.x >= area.x0 && candidate.x <= area.x1
        && candidate.z >= area.z0 && candidate.z <= area.z1
        && candidate.y >= area.y0 && candidate.y <= area.y1
      ) return true
    }
    return false
  }

  for (let levelIndex = 0; levelIndex < levelYs.length; levelIndex++) {
    const levelY = levelYs[levelIndex]
    let acceptedOnLevel = 0
    for (
      let x = map.bounds.min.x + GRID_STEP * 0.5;
      x < map.bounds.max.x && acceptedOnLevel < MAX_GRID_CANDIDATES_PER_LEVEL;
      x += GRID_STEP
    ) {
      for (
        let z = map.bounds.min.z + GRID_STEP * 0.5;
        z < map.bounds.max.z && acceptedOnLevel < MAX_GRID_CANDIDATES_PER_LEVEL;
        z += GRID_STEP
      ) {
        const floorY = validateFloor(world, x, levelY, z)
        if (floorY === null) continue
        point.set(x, floorY, z)

        if (typeof snapToNavmesh === 'function') {
          const snapped = snapToNavmesh.call(nav, point)
          if (!snapped || snapped.distanceTo(point) > NAV_SNAP_TOLERANCE) continue
          const snappedFloorY = validateFloor(world, snapped.x, snapped.y, snapped.z)
          if (snappedFloorY === null) continue
          point.set(snapped.x, snappedFloorY, snapped.z)
        }

        // Recast can snap neighbouring grid samples to the same polygon boundary.
        const key = `${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)}`
        if (seen.has(key)) continue
        seen.add(key)

        const candidate = { point: point.clone(), indoor: hasCeiling(point), levelIndex }
        all.push(candidate)
        if (candidate.indoor) indoor.push(candidate)
        // Roofed storeys are already served by the indoor pool. This is the other kind: a deck
        // the layout put on top of the building, or a yard it walled off beside it — open to the
        // sky and invisible to every heuristic here that asks "is something above me?".
        else if (levelIndex > 0 || inOpenArea(point)) openAir.push(candidate)
        acceptedOnLevel++
      }
    }
  }

  const buildingArea = indoor.length > 0
    ? candidatesNearIndoor(all, indoor, Math.min(BUILDING_AREA_RADIUS, MAX_DISTANCE_FROM_INDOOR))
    : all

  const openAirBuckets = bucketByFootprint(openAir)

  /** Out on in-play open ground: an open-air sample within arm's reach, at this height. */
  const onOpenAir = (candidate: Vector3): boolean => {
    if (openAir.length === 0) return false
    const bucketX = Math.floor(candidate.x / OPEN_AIR_BUCKET_SIZE)
    const bucketZ = Math.floor(candidate.z / OPEN_AIR_BUCKET_SIZE)
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        const bucket = openAirBuckets.get(`${bucketX + offsetX},${bucketZ + offsetZ}`)
        if (!bucket) continue
        for (let index = 0; index < bucket.length; index++) {
          const sample = bucket[index].point
          // Height matters: the ground floor sits directly under the deck, and a bot down there
          // is indoors, not on it.
          if (Math.abs(candidate.y - sample.y) > OPEN_AIR_SNAP) continue
          const dx = candidate.x - sample.x
          const dz = candidate.z - sample.z
          if (dx * dx + dz * dz <= OPEN_AIR_SNAP * OPEN_AIR_SNAP) return true
        }
      }
    }
    return false
  }

  return {
    size: buildingArea.length,
    indoorSize: indoor.length,
    openAirSize: openAir.length,
    sample(rng, from) {
      // Drawn first and from its own roll, so the share is the number written above rather than
      // whatever falls out of the open ground's area relative to the rest of the map.
      const chance = from && onOpenAir(from) ? OPEN_AIR_STAY_CHANCE : OPEN_AIR_TARGET_CHANCE
      if (openAir.length > 0 && rng() < chance) return pick(openAir, rng)
      if (indoor.length > 0 && rng() < INDOOR_TARGET_CHANCE) return pick(indoor, rng)
      return pick(buildingArea, rng)
    },
    sampleIndoor(rng) {
      return pick(indoor, rng)
    },
    isInPlay(candidate) {
      return hasCeiling(candidate) || onOpenAir(candidate)
    },
  }
}

/** Spatial index over the open-air samples, so the per-tick "am I out there?" test stays O(1). */
function bucketByFootprint(candidates: Candidate[]): Map<string, Candidate[]> {
  const buckets = new Map<string, Candidate[]>()
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]
    const key = `${Math.floor(candidate.point.x / OPEN_AIR_BUCKET_SIZE)},`
      + `${Math.floor(candidate.point.z / OPEN_AIR_BUCKET_SIZE)}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(candidate)
    else buckets.set(key, [candidate])
  }
  return buckets
}

function pick(candidates: Candidate[], rng: () => number): Vector3 | null {
  if (candidates.length === 0) return null
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))
  return candidates[index].point
}

/** Spatial buckets keep the one-time proximity filter linear for lawn-heavy maps. */
function candidatesNearIndoor(
  candidates: Candidate[],
  indoor: Candidate[],
  radius: number,
): Candidate[] {
  const buckets = new Map<string, Candidate[]>()
  for (let index = 0; index < indoor.length; index++) {
    const candidate = indoor[index]
    const bucketX = Math.floor(candidate.point.x / radius)
    const bucketZ = Math.floor(candidate.point.z / radius)
    const key = `${bucketX},${bucketZ}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(candidate)
    else buckets.set(key, [candidate])
  }

  const radiusSq = radius * radius
  return candidates.filter((candidate) => {
    const bucketX = Math.floor(candidate.point.x / radius)
    const bucketZ = Math.floor(candidate.point.z / radius)
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        const bucket = buckets.get(`${bucketX + offsetX},${bucketZ + offsetZ}`)
        if (!bucket) continue
        for (let index = 0; index < bucket.length; index++) {
          const dx = candidate.point.x - bucket[index].point.x
          const dz = candidate.point.z - bucket[index].point.z
          if (dx * dx + dz * dz <= radiusSq) return true
        }
      }
    }
    return false
  })
}
