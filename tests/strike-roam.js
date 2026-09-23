import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./ts-resolve.mjs', import.meta.url));
const THREE = await import('three');
const { createRoamTargetSet } = await import('../src/strike/bots/roam.ts');

const { Box3, BufferGeometry, Group, Mesh, Vector3 } = THREE;

const DECK_Y = 2.5;
/** The building: everything outside this on X/Z is terrain around it. */
const FOOTPRINT = 5;

/**
 * A single-room building with a walkable roof — the shape Corridors became.
 *
 * Ground floor at y 0 under a ceiling at 2.5, a deck on top of that ceiling, and open terrain
 * all around. The deck is the interesting part: nothing is above it, so every "is there a
 * ceiling over my head?" probe in the roam module calls it outdoors.
 */
function fixture() {
  const object = new Group();
  const inside = (x, z) => Math.abs(x) <= FOOTPRINT && Math.abs(z) <= FOOTPRINT;

  const world = {
    raycast(origin, direction, maxDistance) {
      if (direction.y < 0) {
        // Nearest surface below: the deck over the building, the ground everywhere.
        const surface = inside(origin.x, origin.z) && origin.y > DECK_Y ? DECK_Y : 0;
        const distance = origin.y - surface;
        if (distance < 0 || distance > maxDistance) return null;
        return hit(origin.x, surface, origin.z, distance, 1, object);
      }
      if (!inside(origin.x, origin.z) || origin.y >= DECK_Y) return null;
      const distance = DECK_Y - origin.y;
      if (distance > maxDistance) return null;
      return hit(origin.x, DECK_Y, origin.z, distance, -1, object);
    },
    lineOfSight: () => true,
  };

  const nav = {
    ready: true,
    findPath: (from, to) => [from.clone(), to.clone()],
    randomPoint: () => new Vector3(),
    randomPointAround: (center) => center.clone(),
    closestPoint: (point) => point.clone(),
    snapToNavmesh: (point) => point.clone(),
  };

  const colliderMesh = new Mesh(new BufferGeometry());
  const map = {
    name: 'roof fixture',
    root: new Group(),
    levels: [
      { id: 'level-0', label: 'Ground', node: new Group(), y: 0 },
      { id: 'level-1', label: 'Roof', node: new Group(), y: DECK_Y },
    ],
    zones: [],
    spawnNodes: [],
    doors: [],
    collider: { mesh: colliderMesh, geometry: colliderMesh.geometry },
    bounds: new Box3(new Vector3(-10, 0, -10), new Vector3(10, 4, 10)),
    navMeshSource: [colliderMesh],
  };

  return { map, world, nav };
}

function hit(x, y, z, distance, normalY, object) {
  return {
    point: new Vector3(x, y, z),
    normal: new Vector3(0, normalY, 0),
    distance,
    object,
    kind: 'static',
  };
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleShare(targets, count, predicate) {
  const rng = mulberry32(0x5eed);
  let matched = 0;
  for (let index = 0; index < count; index++) {
    const point = targets.sample(rng);
    assert.ok(point, 'fixture produced no roam targets');
    if (predicate(point)) matched++;
  }
  return matched / count;
}

test('a roof deck gets a real share of roam goals, not the leftovers', () => {
  const { map, world, nav } = fixture();
  const targets = createRoamTargetSet(map, world, nav);

  assert.ok(targets.openAirSize > 0, 'the deck produced no candidates at all');
  const share = sampleShare(targets, 600, (point) => point.y > DECK_Y - 0.5);

  // Before the open-deck draw the roof competed with the lawn for the 15% of goals that are not
  // indoor, and measured 4.7% of bot traffic on Corridors.
  assert.ok(share > 0.15, `only ${(share * 100).toFixed(1)}% of goals went to the roof`);
  // And it must not swallow the match either: the building is still the arena.
  assert.ok(share < 0.35, `${(share * 100).toFixed(1)}% of goals on the roof starves the floor`);
});

test('a bot already on the roof is more likely to be kept there', () => {
  const { map, world, nav } = fixture();
  const targets = createRoamTargetSet(map, world, nav);

  const onDeck = new Vector3(0, DECK_Y, 0);
  const fromBelow = sampleShare(targets, 600, (point) => point.y > DECK_Y - 0.5);
  const rng = mulberry32(0x5eed);
  let stayed = 0;
  for (let index = 0; index < 600; index++) {
    if (targets.sample(rng, onDeck).y > DECK_Y - 0.5) stayed++;
  }
  const fromDeck = stayed / 600;

  // Without this the deck is a waypoint: climb, touch the goal, walk back down.
  assert.ok(
    fromDeck > fromBelow + 0.2,
    `redraw on the deck kept ${(fromDeck * 100).toFixed(1)}% up top vs `
      + `${(fromBelow * 100).toFixed(1)}% from the floor — not enough to form a route`,
  );
  // But it must not trap them either: a bot that never comes down stops being an opponent.
  assert.ok(fromDeck < 0.8, `${(fromDeck * 100).toFixed(1)}% is a bot that lives on the roof`);
});

test('the roof does not cost the ground floor its majority', () => {
  const { map, world, nav } = fixture();
  const targets = createRoamTargetSet(map, world, nav);
  const ground = sampleShare(targets, 600, (point) => point.y < DECK_Y - 0.5);
  assert.ok(ground > 0.6, `ground floor kept only ${(ground * 100).toFixed(1)}% of goals`);
});

test('a bot standing on the roof counts as in play, not stranded outdoors', () => {
  const { map, world, nav } = fixture();
  const targets = createRoamTargetSet(map, world, nav);

  // The regression: `isInPlay` used to be a bare ceiling probe, so the roof read as "outdoors".
  // Six seconds later the brain overrode the bot's goal and marched it back down the stairs —
  // which is why placing more goals up there alone would not have moved the numbers.
  assert.ok(targets.isInPlay(new Vector3(0, DECK_Y, 0)), 'the roof deck must count as in play');
  assert.ok(targets.isInPlay(new Vector3(0, 0, 0)), 'the ground floor must count as in play');
  assert.ok(
    !targets.isInPlay(new Vector3(8.5, 0, 8.5)),
    'open terrain outside the building must still read as outdoors',
  );
  assert.ok(
    !targets.isInPlay(new Vector3(0, DECK_Y + 6, 0)),
    'height alone is not the roof — a point in the air above it is not standing on anything',
  );
});

/**
 * The yard case: outdoor ground at *ground level*, which fails both of the module's tests for
 * playable space — nothing above it, and not an upper storey. Before `OpenArea` existed such a
 * yard could be built, walled, navigable and connected, and bots would still never use it: the
 * goals were never drawn there, and any bot that wandered in was marched back inside after six
 * seconds for being "outdoors".
 */
test('a declared open area is in play even though it is outdoors and on the ground', () => {
  const { map, world, nav } = fixture();
  // A strip of ground east of the building, the way the Corridors yard sits against its wall.
  map.openAreas = [{ x0: 6, x1: 9, z0: -5, z1: 5, y0: -0.6, y1: 0.6, label: 'yard' }];
  const targets = createRoamTargetSet(map, world, nav);

  const inYard = (point) =>
    point.x >= 6 && point.x <= 9 && point.z >= -5 && point.z <= 5 && point.y < 0.6;

  assert.ok(targets.isInPlay(new Vector3(7.5, 0, 0)), 'the declared yard must count as in play');
  assert.ok(
    !targets.isInPlay(new Vector3(8.5, 0, 8.5)),
    'ground outside every declared area must still read as outdoors',
  );
  const share = sampleShare(targets, 600, inYard);
  assert.ok(share > 0.02, `the yard drew only ${(share * 100).toFixed(1)}% of goals`);
});

test('an undeclared patch of terrain is still not roamed', () => {
  const { map, world, nav } = fixture();
  map.openAreas = [{ x0: 6, x1: 9, z0: -5, z1: 5, y0: -0.6, y1: 0.6, label: 'yard' }];
  const targets = createRoamTargetSet(map, world, nav);

  // The declaration is a whitelist, not a switch that turns the outdoors on: the lawn north of
  // the yard is the same flat ground, one metre away, and must stay out of the open-air pool.
  const share = sampleShare(targets, 900, (point) => point.z > 6 && Math.abs(point.x) > FOOTPRINT);
  assert.ok(share < 0.02, `${(share * 100).toFixed(1)}% of goals landed on undeclared terrain`);
});

test('roam sampling stays deterministic, so every client roams the same map', () => {
  const { map, world, nav } = fixture();
  const targets = createRoamTargetSet(map, world, nav);
  const run = () => {
    const rng = mulberry32(0xc0ffee);
    return Array.from({ length: 50 }, () => targets.sample(rng).toArray());
  };
  assert.deepEqual(run(), run());
});

test('a map with no upper storey is left exactly as it was', () => {
  const { map, world, nav } = fixture();
  map.levels = [map.levels[0]];
  const targets = createRoamTargetSet(map, world, nav);

  assert.equal(targets.openAirSize, 0);
  const indoorShare = sampleShare(
    targets,
    600,
    (point) => Math.abs(point.x) <= FOOTPRINT && Math.abs(point.z) <= FOOTPRINT,
  );
  assert.ok(indoorShare > 0.8, `indoor share fell to ${(indoorShare * 100).toFixed(1)}%`);
});
