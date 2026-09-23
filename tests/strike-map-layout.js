import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./ts-resolve.mjs', import.meta.url));
const THREE = await import('three');
const { buildOpenDoorObstacles } = await import('../src/strike/map/doors.ts');
const {
  getLayout,
  applyLayout,
  STEP_RISE,
  STAIR_TREADS,
  STAIR_RUN,
  ROOF_RIM,
  SLOT_RAIL,
  ROOF_PLAN,
  WELLS,
  YARD_PLAN,
} = await import('../src/strike/map/layout.ts');
const { NAVMESH, PLAYER } = await import('../src/strike/config.ts');

/**
 * The tallest lip the controller can get on top of: one step up from the apex of a jump.
 *
 * Anything at or below this is climbable, so it cannot be used to fence the player in; anything
 * above it can never be mounted. Every roof edge has to land on the correct side of this number.
 * With the shipped numbers (4.8 m/s jump, 20 m/s² gravity, 0.52 m step) that is 1.096 m.
 */
function mountLimit() {
  const apex = (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * PLAYER.gravity);
  return apex + PLAYER.stepHeight;
}

/** Do two axis-aligned rectangles overlap on both axes (touching edges do not count)? */
function overlapsXZ(a, b) {
  return a.x0 < b.x1 - 1e-9 && a.x1 > b.x0 + 1e-9 && a.z0 < b.z1 - 1e-9 && a.z1 > b.z0 + 1e-9;
}

const {
  AnimationClip,
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  VectorKeyframeTrack,
} = THREE;

/**
 * A sliding door in a narrow doorway — the exact shape that broke `corridors.glb`.
 *
 * Aperture `width` wide on X, centred on the origin, in a wall lying along X. The leaf fills the
 * doorway when closed and slides `travel` along +X to open, so at the end of the clip it still
 * overlaps the aperture by `width - travel`.
 */
function slidingDoor({ width = 0.76, travel = 0.62, thickness = 0.06 } = {}) {
  const root = new Group();
  const node = new Object3D();
  node.name = 'door-node';
  root.add(node);

  const leaf = new Mesh(new BoxGeometry(width, 2, thickness), new MeshBasicMaterial());
  leaf.name = 'door-leaf';
  node.add(leaf);
  leaf.position.set(0, 1, 0);

  const clip = new AnimationClip('open', 1, [
    new VectorKeyframeTrack('door-leaf.position', [0, 1], [0, 1, 0, travel, 1, 0]),
  ]);

  const door = {
    id: 'door-1',
    label: 'Door',
    kind: 'door',
    node,
    leafMeshes: [leaf],
    clip,
    center: new Vector3(0, 1, 0),
    halfWidth: width / 2,
  };
  return { root, door, width, travel };
}

/** World-space AABBs of every box in the merged obstacle mesh. */
function obstacleBoxes(mesh) {
  if (!mesh) return [];
  const position = mesh.geometry.getAttribute('position');
  const out = [];
  // Every box contributes 24 vertices, in order.
  for (let start = 0; start < position.count; start += 24) {
    const box = new Box3();
    for (let i = start; i < Math.min(start + 24, position.count); i++) {
      box.expandByPoint(new Vector3(position.getX(i), position.getY(i), position.getZ(i)));
    }
    out.push(box);
  }
  return out;
}

test('an open door leaves its doorway walkable instead of sealing it', () => {
  const { root, door, width, travel } = slidingDoor();
  const boxes = obstacleBoxes(buildOpenDoorObstacles(root, [door]));
  assert.ok(boxes.length > 0, 'the parked leaf must still be an obstacle');

  // How much of the doorway the obstacles cover. The bug: all of it.
  const aperture = { min: -width / 2, max: width / 2 };
  let blocked = 0;
  for (const box of boxes) {
    const lo = Math.max(box.min.x, aperture.min);
    const hi = Math.min(box.max.x, aperture.max);
    if (hi > lo) blocked += hi - lo;
  }
  const free = width - blocked;

  // Recast erodes `walkableRadius` off each side on top of whatever is left here, so the
  // obstacle has to leave more than that or the doorway bakes shut.
  const needed = NAVMESH.walkableRadius * 2;
  assert.ok(
    free > needed,
    `doorway left ${free.toFixed(3)} m free, recast needs more than ${needed.toFixed(3)} m`,
  );
  // And it must be genuinely passable, not merely non-zero.
  assert.ok(free >= travel - 1e-6, `expected the full ${travel} m of travel to stay open`);
});

test('the parked leaf is still an obstacle where it sticks out past the frame', () => {
  const { root, door, width, travel } = slidingDoor();
  const boxes = obstacleBoxes(buildOpenDoorObstacles(root, [door]));
  // The leaf parks at x travel-width/2 .. travel+width/2, so it overhangs the jamb by `travel`.
  const overhang = boxes.some((b) => b.max.x > width / 2 + travel - 0.05);
  assert.ok(overhang, 'the strip along the wall is what stops bots wedging on the panel corner');
  // It reaches the floor: a floating strip lets recast thread a path underneath.
  assert.ok(Math.min(...boxes.map((b) => b.min.y)) <= 0.01, 'obstacle must stand on the floor');
});

test('door furniture that never leaves the frame contributes no obstacle', () => {
  // A leaf whose clip does not move it: entirely inside the aperture, so clipping empties it.
  const { root, door } = slidingDoor({ travel: 0 });
  // Compared by identity, not by `assert.equal`: a failure there dumps the whole Mesh.
  assert.ok(
    buildOpenDoorObstacles(root, [door]) === null,
    'a leaf that never clears the frame must not narrow the doorway on the navmesh',
  );
});

test('a storey invented by a layout overlay is declared, not just built', () => {
  const spec = getLayout('corridors');
  assert.ok(spec, 'corridors must have a layout overlay');
  assert.ok(
    spec.levels?.length > 0,
    'the roof deck has to be in MapData.levels or the bot roam grid never probes it',
  );

  // And applyLayout has to hand those levels back to the loader.
  const root = new Group();
  const floor = new Mesh(new BoxGeometry(10, 0.1, 20), new MeshBasicMaterial());
  floor.userData.kind = 'slab';
  root.add(floor);
  const result = applyLayout(root, 'corridors');
  assert.ok(result, 'applyLayout returned nothing for a known map');
  assert.deepEqual(result.levels, spec.levels);
  assert.ok(result.blocks > 0, 'the overlay emitted no geometry');
});

test('every layout block clears the ground by a walkable height or sits on it', () => {
  const spec = getLayout('corridors');
  // A block a player can stand on top of must not have the roof deck right above it, and a
  // block on the floor must not be mountable by accident: 0.52 is the step height.
  for (const block of spec.blocks) {
    assert.ok(block.y1 > block.y0, `${block.label} has no height`);
    assert.ok(block.x1 > block.x0 && block.z1 > block.z0, `${block.label} has no footprint`);
  }
  // The cover heights are the two the movement config justifies, plus decks and parapets.
  const groundCover = spec.blocks.filter((b) => b.y0 === 0 && !b.label.startsWith('stair') && b.surface !== 'guide');
  assert.ok(groundCover.length >= 20, `only ${groundCover.length} cover blocks on the ground`);
  for (const block of groundCover) {
    assert.ok(
      block.y1 > NAVMESH.walkableClimb,
      `${block.label} is ${block.y1} high — low enough to walk onto, which is not cover`,
    );
  }
});

test('each staircase presents its bottom step to the spawn it serves', () => {
  const spec = getLayout('corridors');
  const risers = (prefix) =>
    spec.blocks
      .filter((block) => block.label.startsWith(prefix))
      .sort((a, b) => a.y1 - b.y1);

  // Spawn A is to the north (high z), spawn B to the south (low z). Walking out of your own
  // spawn you must meet the LOWEST riser first — the first build faced them the other way and
  // the climb was a 2 m wall you could not read as a staircase, let alone use.
  const a = risers('stair-a');
  assert.equal(a.length, STAIR_TREADS);
  assert.ok(
    a[0].z0 > a.at(-1).z0,
    'stair A climbs away from spawn A, so team A meets the bottom step first',
  );

  const b = risers('stair-b');
  assert.equal(b.length, STAIR_TREADS);
  assert.ok(
    b[0].z0 < b.at(-1).z0,
    'stair B climbs away from spawn B, so team B meets the bottom step first',
  );

  // A single-file stair made roof access depend on perfect movement and on which way the player
  // happened to face at the top. The two staircases must now occupy nearly the full corridor.
  assert.ok(a.every((step) => step.x1 - step.x0 >= 1.5), 'stair A is still a narrow slit');
  assert.ok(b.every((step) => step.x1 - step.x0 >= 1.5), 'stair B is still a narrow slit');

  // One guide per tread, on every flight in the map — the two indoor ones and the two exterior
  // ones in the yard. Counting the total rather than per flight is what let the exterior stairs
  // ship unlit: the number still looked plausible.
  const guides = spec.blocks.filter((block) => block.surface === 'guide');
  const flights = ['stair-a', 'stair-b', 'stair-yard-a', 'stair-yard-b'];
  for (const flight of flights) {
    const lit = guides.filter((block) => block.label.includes(flight));
    assert.equal(lit.length, STAIR_TREADS, `${flight} is missing tread guides`);
  }
  assert.equal(guides.length, STAIR_TREADS * flights.length, 'a guide belongs to no known flight');
  for (const guide of guides) {
    assert.ok(guide.y1 - guide.y0 <= 0.02, `${guide.label} becomes a collision step`);
    assert.ok(guide.y0 > 0, `${guide.label} must sit on a stair tread, not the floor`);
  }

  for (const [label, steps] of [['A', a], ['B', b]]) {
    for (let index = 1; index < steps.length; index++) {
      const rise = steps[index].y1 - steps[index - 1].y1;
      assert.ok(
        rise <= STEP_RISE + 1e-6,
        `stair ${label} has a ${rise.toFixed(2)} m riser — over the ${STEP_RISE} m the `
          + 'controller can step and recast can link, so bots would refuse the route',
      );
    }
    // Wall-coloured steps are invisible against the wall they stand on.
    assert.ok(
      steps.every((step) => step.surface === 'floor'),
      `stair ${label} is drawn in the wall material and disappears into it`,
    );
  }
});

test('the roof is fenced on all four sides by something that cannot be climbed', () => {
  const spec = getLayout('corridors');
  const { footprint, deckY } = ROOF_PLAN;
  const rim = spec.blocks.filter((block) => block.label.startsWith('rim-'));
  // Four sides, the east one in three pieces: it is cut open at the head of each exterior stair.
  assert.equal(rim.length, 6, 'the roof needs a parapet on each side');

  // Height first. Below the mount limit it is a kerb you hop; at or below stepHeight you do not
  // even notice it. Either way the player ends up off the roof — and there is nothing out there
  // but the GLB's ground plane, 15 m wide, with no fall deep enough to count as falling.
  for (const block of rim) {
    assert.equal(block.y0, deckY, `${block.label} does not start at deck level`);
    assert.ok(
      block.y1 - block.y0 > mountLimit(),
      `${block.label} is ${(block.y1 - block.y0).toFixed(2)} m — climbable, so it fences nothing`,
    );
  }
  assert.ok(ROOF_RIM > mountLimit(), 'ROOF_RIM must be above the mount limit');

  // Then coverage: walk the whole perimeter and require a rim block over every metre of it. A
  // ring with one segment short is exactly the bug, and it is invisible until someone walks it.
  const covers = (x, z) =>
    rim.some((b) => x >= b.x0 - 1e-9 && x <= b.x1 + 1e-9 && z >= b.z0 - 1e-9 && z <= b.z1 + 1e-9);
  for (let x = footprint.x0; x <= footprint.x1; x += 0.25) {
    const cx = Math.min(x, footprint.x1);
    assert.ok(covers(cx, footprint.z0 + 0.05), `south rim open at x ${cx.toFixed(2)}`);
    assert.ok(covers(cx, footprint.z1 - 0.05), `north rim open at x ${cx.toFixed(2)}`);
  }
  // The east side is allowed exactly two holes, at the head of the two exterior stairs, and
  // nowhere else. Anything wider than that is the same bug with a nicer name.
  const inGate = (z) => YARD_PLAN.gates.some((gate) => z > gate.z0 - 1e-9 && z < gate.z1 + 1e-9);
  for (let z = footprint.z0; z <= footprint.z1; z += 0.25) {
    const cz = Math.min(z, footprint.z1);
    assert.ok(covers(footprint.x0 + 0.05, cz), `west rim open at z ${cz.toFixed(2)}`);
    if (inGate(cz)) continue;
    assert.ok(covers(footprint.x1 - 0.05, cz), `east rim open at z ${cz.toFixed(2)}`);
  }
});

test('every gap in the roof parapet has a stair tread under it', () => {
  const spec = getLayout('corridors');
  const { footprint, deckY } = ROOF_PLAN;
  const rim = spec.blocks.filter((block) => block.label.startsWith('rim-east'));
  assert.equal(YARD_PLAN.gates.length, 2, 'one gate per exterior flight');

  // A gate is a hole in the fence that stops a 2.5 m fall. It is only allowed to exist where
  // there is something to step onto — and "something" means a tread that finishes flush with
  // the deck, not one riser short of it. Unchecked, moving either flight by a single tread
  // depth turns its gate into the exact unfenced edge the parapet was built to close.
  const topTreads = spec.blocks.filter(
    (block) =>
      block.label.startsWith('stair-yard')
      && block.surface !== 'guide'
      && Math.abs(block.y1 - deckY) < 1e-9,
  );
  assert.equal(topTreads.length, 2, 'each exterior flight needs one tread at deck level');

  for (const gate of YARD_PLAN.gates) {
    const tread = topTreads.find(
      (block) => Math.abs(block.z0 - gate.z0) < 1e-9 && Math.abs(block.z1 - gate.z1) < 1e-9,
    );
    assert.ok(tread, `the gate at z ${gate.z0.toFixed(2)} has no tread under it`);
    // And the tread has to reach the wall, or the last step across is over open air.
    assert.ok(
      tread.x0 <= footprint.x1 + 1e-9,
      `the tread at z ${gate.z0.toFixed(2)} does not reach the roof edge`,
    );
    // The gate may not be wider than the tread: the fence has to resume immediately.
    const openLength = gate.z1 - gate.z0;
    assert.ok(
      openLength <= tread.z1 - tread.z0 + 1e-9,
      `the gate at z ${gate.z0.toFixed(2)} is ${openLength.toFixed(2)} m of unfenced edge`,
    );
  }

  // The remaining segments still have to be real parapet, not slivers left by the arithmetic.
  for (const block of rim) {
    assert.ok(block.z1 - block.z0 > 1, `${block.label} is ${(block.z1 - block.z0).toFixed(2)} m long`);
  }
});

test('the yard is walled in, so leaving the building is not leaving the map', () => {
  const spec = getLayout('corridors');
  const { footprint, fence } = YARD_PLAN;
  const fences = spec.blocks.filter((block) => block.label.startsWith('yard-fence'));
  // Three, because the building's own east wall is the fourth side.
  assert.equal(fences.length, 3, 'the yard needs a fence on every side but the building');

  for (const block of fences) {
    assert.equal(block.y0, 0, `${block.label} does not reach the ground`);
    assert.ok(
      block.y1 - block.y0 > mountLimit(),
      `${block.label} is ${block.y1.toFixed(2)} m — climbable, so the yard leaks onto the lawn`,
    );
  }

  // Walk the three open sides and demand a fence over every quarter metre. The yard's whole
  // justification is that it is outdoors *and* in bounds; a gap makes it neither.
  const covers = (x, z) =>
    fences.some((b) => x >= b.x0 - 1e-9 && x <= b.x1 + 1e-9 && z >= b.z0 - 1e-9 && z <= b.z1 + 1e-9);
  for (let z = footprint.z0; z <= footprint.z1; z += 0.25) {
    const cz = Math.min(z, footprint.z1);
    assert.ok(covers(footprint.x1 - 0.05, cz), `the east fence is open at z ${cz.toFixed(2)}`);
  }
  for (let x = footprint.x0; x <= footprint.x1; x += 0.25) {
    const cx = Math.min(x, footprint.x1);
    assert.ok(covers(cx, footprint.z0 + 0.05), `the south fence is open at x ${cx.toFixed(2)}`);
    assert.ok(covers(cx, footprint.z1 - 0.05), `the north fence is open at x ${cx.toFixed(2)}`);
  }
  assert.ok(fence.thickness > 0.1, 'a paper-thin fence is a shooting-through bug waiting to happen');
});

test('the yard is reachable from inside without a stair, and declared in bounds', () => {
  const spec = getLayout('corridors');
  const { door, footprint } = YARD_PLAN;

  // The doorway: a gap in the rebuilt east wall, at ground level, wide enough for recast to
  // thread a path through after it erodes `walkableRadius` off each jamb. If this closes, the
  // yard is reachable only by roof, which makes it a dead end rather than a route.
  const segments = spec.blocks.filter((block) => block.label.startsWith('east-wall'));
  assert.ok(segments.length >= 3, 'the east wall must come back in pieces around the exit');
  const atFloor = segments.filter((block) => block.y0 === 0);
  const blocksDoor = atFloor.some(
    (block) => block.z0 < door.z1 - 1e-9 && block.z1 > door.z0 + 1e-9,
  );
  assert.ok(!blocksDoor, 'the yard exit is walled up');
  assert.ok(
    door.z1 - door.z0 > NAVMESH.walkableRadius * 2,
    `the exit is ${(door.z1 - door.z0).toFixed(2)} m — recast would bake it shut`,
  );
  // A header over the opening, or the "doorway" is a 2.5 m hole in the side of the house.
  const header = segments.find((block) => block.label === 'east-wall-header');
  assert.ok(header && header.y0 > PLAYER.height, 'the exit needs a header above head height');

  // And the declaration the bots read. Built-but-undeclared is the failure mode that is
  // invisible in a screenshot: the yard looks finished and no bot ever walks into it.
  const areas = spec.openAreas ?? [];
  assert.equal(areas.length, 1, 'the yard must be declared as an open area');
  const [yard] = areas;
  assert.ok(yard.x0 >= footprint.x0 - 1e-9 && yard.x1 <= footprint.x1 + 1e-9, 'yard area overruns x');
  assert.ok(yard.z0 >= footprint.z0 - 1e-9 && yard.z1 <= footprint.z1 + 1e-9, 'yard area overruns z');
  // Ground only. A span tall enough to include the top of a container turns cover into a
  // roam goal, and bots would queue to stand on crates they cannot actually climb.
  assert.ok(yard.y1 < 1, `the yard's open span reaches ${yard.y1} m and would pick up cover tops`);
});

test('the yard has cover in three lanes, so it is not one long shooting gallery', () => {
  const spec = getLayout('corridors');
  const cover = spec.blocks.filter(
    (block) => block.label.startsWith('yard-crate') || block.label.startsWith('yard-container'),
  );
  assert.ok(cover.length >= 6, `only ${cover.length} pieces of cover in a 7 x 20 m yard`);

  // Mixed heights: all-low is a yard you can shoot across while crouched, all-full is a maze.
  const heights = new Set(cover.map((block) => block.y1));
  assert.ok(heights.size >= 2, 'the yard cover is all one height');

  // The point of the third lane. Two alternating lanes always leave a straight channel; the
  // test is whether any 0.25 m-wide line down the yard is clear of cover for its whole length.
  const { footprint } = YARD_PLAN;
  for (let x = footprint.x0 + 0.2; x < footprint.x1 - 0.2; x += 0.25) {
    const blocked = cover.some((block) => x >= block.x0 - 1e-9 && x <= block.x1 + 1e-9);
    if (blocked) continue;
    // A clear lane is only acceptable where a stair interrupts it.
    const stairs = spec.blocks.filter(
      (block) => block.label.startsWith('stair-yard') && x >= block.x0 && x <= block.x1,
    );
    assert.ok(stairs.length > 0, `a clear 20 m firing lane runs down x ${x.toFixed(2)}`);
  }
});

test('the exterior flights climb from the yard to the roof at walkable risers', () => {
  const spec = getLayout('corridors');
  const { deckY, footprint: roof } = ROOF_PLAN;

  for (const label of ['stair-yard-a', 'stair-yard-b']) {
    const steps = spec.blocks
      .filter((block) => block.label.startsWith(label) && block.surface !== 'guide')
      .sort((a, b) => a.y1 - b.y1);
    assert.equal(steps.length, STAIR_TREADS, `${label} is not a full flight`);
    assert.ok(Math.abs(steps.at(-1).y1 - deckY) < 1e-9, `${label} does not arrive at deck level`);
    assert.equal(steps[0].y0, 0, `${label} does not start on the ground`);

    for (let index = 1; index < steps.length; index++) {
      const rise = steps[index].y1 - steps[index - 1].y1;
      assert.ok(
        rise <= STEP_RISE + 1e-6,
        `${label} has a ${rise.toFixed(2)} m riser — over what the controller can step`,
      );
    }
    // Outside the building, or the flight is a column of blocks inside the corridor it runs past.
    assert.ok(
      steps.every((step) => step.x0 >= roof.x1 - 1e-9),
      `${label} reaches back through the east wall into the corridors`,
    );
    // Same width as the indoor flights: that is what makes it read as a staircase.
    assert.ok(steps.every((step) => step.x1 - step.x0 >= 1.5), `${label} is a narrow slit`);
  }

  // The two flights climb towards each other's ends of the yard, so neither team's exit lands
  // them at both a door and a stair — the yard has to be crossed to use the far one.
  const first = (label) =>
    spec.blocks.filter((b) => b.label.startsWith(label) && b.surface !== 'guide')
      .sort((a, b) => a.y1 - b.y1)[0];
  assert.ok(
    (first('stair-yard-a').z0 > 0) !== (first('stair-yard-b').z0 > 0),
    'both exterior stairs start in the same half of the yard',
  );
});

test('each stair well is one flight long, filled by its flight, and clear of the roof edge', () => {
  const spec = getLayout('corridors');
  const { footprint } = ROOF_PLAN;
  const labels = ['stair-a', 'stair-b'];

  WELLS.forEach((well, index) => {
    const label = labels[index];
    // A well longer than its flight leaves an unfenced hole at the foot of the stairs with
    // neither tread nor deck under it — you walk out of the doorway and straight down 2.5 m.
    assert.ok(
      Math.abs(well.z1 - well.z0 - STAIR_RUN) < 1e-9,
      `${label}'s well is ${(well.z1 - well.z0).toFixed(2)} m for a ${STAIR_RUN} m flight`,
    );
    // And it must not reach the outside wall, or the rim below would hang over the opening and
    // the climb would surface at an unfenced edge.
    assert.ok(well.x0 > footprint.x0 + 1e-9, `${label}'s well touches the west wall`);
    assert.ok(well.x1 < footprint.x1 - 1e-9, `${label}'s well touches the east wall`);

    const steps = spec.blocks.filter((b) => b.label.startsWith(label) && b.surface !== 'guide');
    const span = { x0: Math.min(...steps.map((s) => s.x0)), x1: Math.max(...steps.map((s) => s.x1)) };
    assert.equal(span.x0, well.x0, `${label} does not fill its well on x`);
    assert.equal(span.x1, well.x1, `${label} does not fill its well on x`);
    assert.ok(
      Math.min(...steps.map((s) => s.z0)) === well.z0
        && Math.max(...steps.map((s) => s.z1)) === well.z1,
      `${label} does not fill its well on z`,
    );
    // The top tread has to finish flush with the deck, not a step below or above it.
    assert.ok(
      Math.abs(Math.max(...steps.map((s) => s.y1)) - ROOF_PLAN.deckY) < 1e-9,
      `${label} does not arrive at deck level`,
    );
  });
});

test('nothing on the roof is built over a hole in it', () => {
  const spec = getLayout('corridors');
  const holes = [
    ...WELLS.map((w, i) => ({ ...w, label: `well ${'AB'[i]}` })),
    { ...ROOF_PLAN.slot, label: 'the C3 slot' },
  ];
  // Anything standing on the deck — cover, parapet, rail — has to stand on actual deck. A block
  // floating over a well reads as solid roof from above and blocks the top of the climb, which
  // is how `roof-cover-sw` came to sit on top of stair B.
  //
  // The stairs and their tread guides are the exception: filling the well is their whole job.
  const onDeck = spec.blocks.filter(
    (block) =>
      block.y0 >= ROOF_PLAN.deckY - 1e-9
      && !block.label.startsWith('deck')
      && !block.label.startsWith('stair')
      && !block.label.startsWith('guide'),
  );
  assert.ok(onDeck.length > 0, 'expected cover and parapets on the deck');
  for (const block of onDeck) {
    for (const hole of holes) {
      assert.ok(
        !overlapsXZ(block, hole),
        `${block.label} floats over ${hole.label}`,
      );
    }
  }
});

test('the slot rails stop at the bridge so the crossing is walked onto', () => {
  const spec = getLayout('corridors');
  const { bridge, slot, deckY } = ROOF_PLAN;
  const rails = spec.blocks.filter((block) => block.label.startsWith('rail-'));
  assert.equal(rails.length, 4, 'two rails, each split either side of the bridge');

  for (const rail of rails) {
    // Over stepHeight, or a sprint along the roof walks into the slot without being asked.
    assert.ok(
      rail.y1 - rail.y0 > PLAYER.stepHeight,
      `${rail.label} is ${(rail.y1 - rail.y0).toFixed(2)} m — under the ${PLAYER.stepHeight} m `
        + 'step height, so you fall in by accident rather than on purpose',
    );
    // Under the mount limit, or the drop-in lane stops being an option at all.
    assert.ok(
      rail.y1 - rail.y0 < mountLimit(),
      `${rail.label} cannot be crossed even deliberately`,
    );
    assert.equal(rail.y0, deckY, `${rail.label} does not start at deck level`);
    // And none of them may cross the bridge mouth.
    assert.ok(
      rail.z1 <= bridge.z0 + 1e-9 || rail.z0 >= bridge.z1 - 1e-9,
      `${rail.label} walls off the bridge`,
    );
  }
  assert.ok(SLOT_RAIL > PLAYER.stepHeight && SLOT_RAIL < mountLimit(), 'SLOT_RAIL is misjudged');

  // Both mouths of the bridge have to be open, on both sides of the slot.
  const blocksBridge = rails.some(
    (rail) => rail.z0 < bridge.z1 - 1e-9 && rail.z1 > bridge.z0 + 1e-9,
  );
  assert.ok(!blocksBridge, 'a rail still runs across the bridge');
  const bridgeDeck = spec.blocks.find((block) => block.label === 'deck-bridge');
  assert.ok(bridgeDeck, 'the bridge deck is missing');
  assert.equal(bridgeDeck.x0, slot.x0);
  assert.equal(bridgeDeck.x1, slot.x1);
});
