import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./ts-resolve.mjs', import.meta.url));
const THREE = await import('three');
const { createGrenades, throwVelocity } = await import('../src/strike/weapons/grenades.ts');
const { armoredDamage } = await import('../src/strike/game/combat.ts');
const { ARMOR, BOTS, GRENADE, PLAYER } = await import('../src/strike/config.ts');

const { Scene, Vector3 } = THREE;

/** A world that is nothing but a floor at y = 0, which is all a bounce needs. */
function floorWorld({ sight = true } = {}) {
  const floor = { name: 'floor' };
  return {
    seesEverything: sight,
    raycast(origin, direction, maxDistance) {
      if (direction.y > -1e-6) return null;
      const distance = origin.y / -direction.y;
      if (distance < 0 || distance > maxDistance) return null;
      return {
        point: new Vector3(
          origin.x + direction.x * distance,
          0,
          origin.z + direction.z * distance,
        ),
        normal: new Vector3(0, 1, 0),
        distance,
        object: floor,
        kind: 'static',
      };
    },
    lineOfSight: () => sight,
  };
}

/** A grenade sim with every side effect recorded instead of drawn. */
function harness(world = floorWorld()) {
  const scene = new Scene();
  const decals = [];
  const sounds = [];
  let bursts = 0;
  const grenades = createGrenades(
    scene,
    world,
    { add(_target, point, normal, team, seed) { decals.push({ point: point.clone(), team, seed }); } },
    { splat() {}, burst() { bursts += 1; } },
    { play(name) { sounds.push(name); } },
  );
  const hits = [];
  grenades.onPlayerHit((hit) => hits.push(hit));
  return { grenades, scene, decals, sounds, hits, burstCount: () => bursts };
}

function nade(overrides = {}) {
  return {
    id: 'me:nade:1',
    by: 'me',
    team: 'a',
    origin: [0, 0.9, 0],
    velocity: [0, 0, 0],
    t: Date.now(),
    seed: 4242,
    fuseMs: GRENADE.fuseMs,
    ...overrides,
  };
}

/** A player standing at (x, z): the capsule the blast is measured against. */
function standing(id, team, x, z, alive = true) {
  return {
    id,
    team,
    alive,
    capsuleStart: new Vector3(x, 0.3, z),
    capsuleEnd: new Vector3(x, 1.45, z),
    capsuleRadius: 0.3,
  };
}

/** Run the sim until every shell is gone (or we give up), in 120 Hz steps. */
function runUntilQuiet(grenades, targets = [], seconds = 4) {
  const steps = Math.round(seconds * 120);
  for (let index = 0; index < steps && grenades.liveCount > 0; index++) {
    grenades.update(1 / 120, targets);
  }
}

test('a throw leaves the hand above the crosshair, and a run carries it further', () => {
  const flat = throwVelocity(new Vector3(0, 0, -1), new Vector3());
  assert.ok(
    Math.abs(flat.length() - GRENADE.throwSpeed) < 1e-6,
    `throw speed was ${flat.length().toFixed(2)}, expected ${GRENADE.throwSpeed}`,
  );
  // Above the crosshair by the configured pitch: a grenade thrown exactly where you look
  // lands short of it, and the arc has to read as a lob rather than a bullet.
  const pitch = (Math.atan2(flat.y, Math.hypot(flat.x, flat.z)) * 180) / Math.PI;
  assert.ok(Math.abs(pitch - GRENADE.throwPitchDeg) < 1e-6, `pitched ${pitch.toFixed(2)}°`);
  // Still going where you are looking.
  assert.ok(flat.z < 0 && Math.abs(flat.x) < 1e-9, 'the throw drifted off the look direction');

  // Sprinting forward throws further; the inherited stride is half, not all, of it.
  const running = throwVelocity(new Vector3(0, 0, -1), new Vector3(), new Vector3(0, 0, -6));
  assert.ok(running.length() > flat.length(), 'a run has to add to the throw');
  assert.ok(running.z < flat.z, 'the inherited stride went the wrong way');

  // Looking straight up must not roll the throw over the top and fire it backwards.
  const up = throwVelocity(new Vector3(0, 1, 0), new Vector3());
  assert.ok(up.y > 0, 'a throw aimed at the ceiling came back down the way it went');
  assert.ok(
    Math.abs(up.length() - GRENADE.throwSpeed) < 1e-6,
    'the vertical case lost the throw speed',
  );
});

test('a shell bounces off the floor instead of sticking to it, then settles and waits', () => {
  const kit = harness();
  // Dropped from 2 m with a long fuse: gravity, one audible bounce, then rest.
  kit.grenades.spawn(nade({ origin: [0, 2, 0], fuseMs: 3_000 }), { resolveDamage: false });

  const shell = () => kit.scene.children.find((child) => child.visible);
  const trace = [];
  for (let index = 0; index < 240; index++) {
    kit.grenades.update(1 / 120, []);
    const mesh = shell();
    if (mesh) trace.push(mesh.position.y);
  }

  assert.ok(kit.grenades.liveCount === 1, 'a 3 s fuse must survive 2 s of bouncing');
  // Measured from the FIRST time it touches down, not from the global low point: it comes to
  // rest on the floor too, so the lowest sample of the run is the end, not the bounce.
  const touchdown = trace.findIndex((y) => y < 0.12);
  assert.ok(touchdown > 0, 'the shell never reached the floor');
  const rebound = Math.max(...trace.slice(touchdown, touchdown + 60));
  assert.ok(
    rebound > trace[touchdown] + 0.05,
    `no bounce: the shell hit the floor at ${trace[touchdown].toFixed(3)} and stayed there`,
  );
  // And it does not keep creeping: the last half-second is still.
  const tail = trace.slice(-60);
  assert.ok(
    Math.max(...tail) - Math.min(...tail) < 1e-6,
    'the shell was still moving when its fuse should have been quietly burning down',
  );
  assert.ok(kit.sounds.includes('land'), 'a shell hitting the floor from 2 m has to be audible');
  kit.grenades.dispose();
});

test('the fuse decides when it goes off, and the burst paints whatever it can see', () => {
  const kit = harness();
  kit.grenades.spawn(nade({ fuseMs: 500 }), { resolveDamage: false });

  // Still live a tick before the fuse ends, gone a tick after: the fuse, not the first bounce,
  // is what detonates a grenade.
  for (let index = 0; index < 59; index++) kit.grenades.update(1 / 120, []);
  assert.equal(kit.grenades.liveCount, 1, 'it went off early');
  assert.equal(kit.burstCount(), 0);
  runUntilQuiet(kit.grenades);
  assert.equal(kit.grenades.liveCount, 0, 'it never went off');
  assert.equal(kit.burstCount(), 1, 'exactly one burst per shell');
  assert.ok(kit.decals.length > 0, 'a paint grenade that paints nothing is a dud');
  assert.ok(
    kit.decals.length <= GRENADE.splats,
    `${kit.decals.length} splats from a ${GRENADE.splats}-splat burst`,
  );
  kit.grenades.dispose();
});

test('every client paints the same room from the same seed', () => {
  const first = harness();
  first.grenades.spawn(nade({ fuseMs: 10 }), { resolveDamage: false });
  runUntilQuiet(first.grenades);

  const second = harness();
  second.grenades.spawn(nade({ fuseMs: 10 }), { resolveDamage: false });
  runUntilQuiet(second.grenades);

  assert.ok(first.decals.length > 0);
  assert.deepEqual(
    first.decals.map((d) => [d.point.x.toFixed(6), d.point.z.toFixed(6), d.seed]),
    second.decals.map((d) => [d.point.x.toFixed(6), d.point.z.toFixed(6), d.seed]),
    'the same throw painted two different rooms — the burst is not deterministic',
  );

  // A different throw must not be a copy of the last one.
  const other = harness();
  other.grenades.spawn(nade({ seed: 99, fuseMs: 10 }), { resolveDamage: false });
  runUntilQuiet(other.grenades);
  assert.notDeepEqual(
    first.decals.map((d) => d.point.x.toFixed(6)),
    other.decals.map((d) => d.point.x.toFixed(6)),
    'every grenade paints an identical pattern',
  );
  first.grenades.dispose();
  second.grenades.dispose();
  other.grenades.dispose();
});

test('one burst, one hit per enemy caught in it, each with its own shot id', () => {
  const kit = harness();
  const targets = [
    standing('close', 'b', 0.5, 0),
    standing('far', 'b', 2, 0),
    standing('outside', 'b', 10, 0),
    standing('mate', 'a', 0.5, 0),
    standing('me', 'a', 0, 0),
    standing('corpse', 'b', 0.6, 0, false),
  ];
  kit.grenades.spawn(nade({ fuseMs: 10 }), { resolveDamage: true });
  runUntilQuiet(kit.grenades, targets);

  assert.deepEqual(
    kit.hits.map((hit) => hit.target).sort(),
    ['close', 'far'],
    'the blast picked the wrong people out of the room',
  );
  // Distinct ids or the host de-duplicates the burst down to a single victim.
  assert.equal(new Set(kit.hits.map((hit) => hit.shotId)).size, kit.hits.length);
  for (const hit of kit.hits) {
    assert.ok(hit.shotId.startsWith('me:nade:1:'), `shot id ${hit.shotId} is not traceable`);
    assert.equal(hit.weapon, 'grenade');
    assert.equal(hit.by, 'me');
    assert.ok(hit.falloff > 0 && hit.falloff <= 1, `falloff ${hit.falloff} is out of range`);
  }
  // Closer hurts more, and that is the only thing the thrower gets to claim.
  const byId = Object.fromEntries(kit.hits.map((hit) => [hit.target, hit.falloff]));
  assert.ok(byId.close > byId.far, 'the falloff curve is inverted');
  kit.grenades.dispose();
});

test('the wall between you and the burst is the wall that saves you', () => {
  const kit = harness(floorWorld({ sight: false }));
  kit.grenades.spawn(nade({ fuseMs: 10 }), { resolveDamage: true });
  runUntilQuiet(kit.grenades, [standing('behind-cover', 'b', 1, 0)]);
  assert.equal(kit.hits.length, 0, 'the blast went through a wall');
  kit.grenades.dispose();
});

test("a receiver's copy paints and makes noise, but never claims a hit", () => {
  const kit = harness();
  kit.grenades.spawn(nade({ by: 'someone-else', fuseMs: 10 }), { resolveDamage: false });
  runUntilQuiet(kit.grenades, [standing('victim', 'b', 0.5, 0)]);
  assert.equal(kit.hits.length, 0, 'two clients resolving one burst double-reports it');
  assert.ok(kit.decals.length > 0, 'the paint is the whole point of watching it land');
  assert.equal(kit.burstCount(), 1);
  kit.grenades.dispose();
});

test('a paint grenade opens a fight; it cannot end one', () => {
  // The design constraint, not an implementation detail: a centre hit on a full-health player
  // has to leave them standing, armour or no armour. The moment this fails, the meta is
  // "throw first, aim never" and the longer firefights this was built for are gone.
  assert.ok(
    GRENADE.maxDamage < PLAYER.maxHp,
    `${GRENADE.maxDamage} damage against ${PLAYER.maxHp} hp is a one-shot kill`,
  );
  assert.ok(GRENADE.minDamage > 0, 'the edge of the blast should still sting');
  assert.ok(GRENADE.minDamage < GRENADE.maxDamage, 'the falloff curve is backwards');

  const centre = armoredDamage(GRENADE.maxDamage, ARMOR.max, 'torso', 'grenade');
  assert.ok(centre.amount < PLAYER.maxHp, 'even the worst case must not be lethal on its own');
  assert.ok(centre.armor < ARMOR.max, 'a vest that absorbs paint has to be spent doing it');

  // Legs bypass armour for bullets. A blast has no body part, so it does not get that pass.
  const leg = armoredDamage(GRENADE.maxDamage, ARMOR.max, 'leg', 'grenade');
  assert.ok(leg.armor < ARMOR.max, 'the vest ignored a blast because it was flagged as a leg hit');
  assert.equal(
    armoredDamage(GRENADE.maxDamage, ARMOR.max, 'leg', 'rifle').armor,
    ARMOR.max,
    'a leg shot should still bypass the vest',
  );
});

/**
 * What the bots were before W6. The task was "make them 20 % easier" — this pins the direction
 * and the size of that move, so a later tweak that quietly hands the difficulty back has to
 * argue with a failing test instead of slipping through a diff.
 */
const BOT_BASELINE = {
  viewDistance: 28,
  fovDeg: 130,
  aimErrorDeg: 2.6,
  reactionMs: 320,
  memoryMs: 4_000,
  burstShots: 4,
  burstPauseMs: 450,
  decisionHz: 8,
  aimSettleMs: 120,
};

test('the bot nerf is 20 %, and every part of it lengthens the fight', () => {
  // Senses: a fifth shorter and a fifth narrower. This is what stopped the cross-house spot.
  for (const key of ['viewDistance', 'fovDeg', 'memoryMs', 'decisionHz']) {
    const ratio = BOTS[key] / BOT_BASELINE[key];
    assert.ok(
      Math.abs(ratio - 0.8) < 1e-9,
      `BOTS.${key} is ${BOTS[key]} — ${(ratio * 100).toFixed(1)} % of the old ${BOT_BASELINE[key]}, not 80 %`,
    );
  }
  // Delays: a quarter longer, which is a fifth less of the fight spent under fire.
  for (const key of ['reactionMs', 'burstPauseMs', 'aimErrorDeg', 'aimSettleMs']) {
    const ratio = BOTS[key] / BOT_BASELINE[key];
    assert.ok(
      ratio > 1.2 && ratio < 1.3,
      `BOTS.${key} is ${BOTS[key]} — ${(ratio * 100).toFixed(1)} % of the old ${BOT_BASELINE[key]}, not ~125 %`,
    );
  }
  // And a burst that can no longer finish a full-health player on its own.
  assert.ok(BOTS.burstShots < BOT_BASELINE.burstShots, 'the burst is as long as it ever was');
  assert.ok(BOTS.burstShots >= 2, 'a one-ball burst is a different bot, not an easier one');
});
