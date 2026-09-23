import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./ts-resolve.mjs', import.meta.url));

/**
 * `createDecals` builds its four splat alpha maps from a 2D canvas the moment it is called, so
 * the module cannot be imported headless without one. The shapes it paints are irrelevant to
 * what is under test — only the budget is — so the context is a sink that records nothing.
 */
const canvasContext = new Proxy({}, {
  get: (_target, property) => (property === 'canvas' ? {} : () => {}),
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => canvasContext }),
};

const THREE = await import('three');
const { createDecals } = await import('../src/strike/weapons/decals.ts');
const { DECALS } = await import('../src/strike/config.ts');

const { Mesh, PlaneGeometry, Scene, Vector3 } = THREE;

/** A wall for the paint to land on: a real geometry, because the projection is real. */
function wall(scene) {
  const mesh = new Mesh(new PlaneGeometry(4, 4));
  scene.add(mesh);
  mesh.updateWorldMatrix(true, false);
  return mesh;
}

/** Ask for `n` splats in one frame, the way a grenade burst does. */
function requestSplats(decals, target, n) {
  const point = new Vector3(0, 0, 0);
  const normal = new Vector3(0, 0, 1);
  for (let index = 0; index < n; index++) {
    decals.add(target, point, normal, 'a', 1000 + index);
  }
}

test('a burst cannot build more than the frame budget, however many splats it asks for', () => {
  const scene = new Scene();
  const decals = createDecals(scene);
  const target = wall(scene);

  requestSplats(decals, target, 16);
  assert.equal(
    decals.count,
    DECALS.buildsPerFrame,
    `a 16-splat burst built ${decals.count} geometries in one frame`,
  );
  assert.equal(decals.pending, 16 - DECALS.buildsPerFrame, 'the rest have to wait their turn');

  // The frame the burst happened in is already full: draining is next frame's job.
  decals.update();
  assert.equal(decals.count, DECALS.buildsPerFrame, 'the budget was spent twice in one frame');

  decals.update();
  assert.equal(decals.count, DECALS.buildsPerFrame * 2, 'the queue is not draining');

  // And all of it lands, rather than being quietly thrown away.
  for (let frame = 0; frame < 16 && decals.pending > 0; frame++) decals.update();
  assert.equal(decals.pending, 0, 'paint was still queued after four frames of a four-frame backlog');
  assert.equal(decals.count, 16, `16 splats were asked for and ${decals.count} landed`);
  decals.dispose();
});

test('a single shot still paints the wall in the frame it hit it', () => {
  const scene = new Scene();
  const decals = createDecals(scene);
  const target = wall(scene);

  // The common case by three orders of magnitude: one paintball, one splat, no latency.
  requestSplats(decals, target, 1);
  assert.equal(decals.count, 1, 'a paintball has to paint immediately or the hit feels dead');
  assert.equal(decals.pending, 0);
  decals.dispose();
});

test('paint queued behind a burst keeps its order and never jumps the queue', () => {
  const scene = new Scene();
  const decals = createDecals(scene);
  const target = wall(scene);

  requestSplats(decals, target, 16);
  const queued = decals.pending;
  // A shot fired while the backlog exists must queue too, or it would paint before the
  // explosion that was already waiting.
  decals.add(target, new Vector3(1, 0, 0), new Vector3(0, 0, 1), 'b', 7);
  assert.equal(decals.pending, queued + 1, 'a late shot skipped the queue');
  decals.dispose();
});

test('an overlong backlog is dropped at the front rather than grown forever', () => {
  const scene = new Scene();
  const decals = createDecals(scene);
  const target = wall(scene);

  requestSplats(decals, target, DECALS.maxQueued * 2);
  assert.equal(decals.pending, DECALS.maxQueued, 'the queue grew past its ceiling');
  decals.dispose();
});

test('a target that died while its paint was queued does not take the frame with it', () => {
  const scene = new Scene();
  const decals = createDecals(scene);
  const target = wall(scene);

  requestSplats(decals, target, 16);
  const landed = decals.count;
  // The avatar is disposed between the burst and the drain: exactly what happens when a player
  // is painted, dies, and their body is recycled two frames later.
  target.geometry.dispose();
  target.geometry = new THREE.BufferGeometry();

  assert.doesNotThrow(() => { for (let frame = 0; frame < 6; frame++) decals.update(); });
  assert.equal(decals.count, landed, 'a dead target should contribute no new paint');
  assert.equal(decals.pending, 0, 'and its queued paint has to be cleared, not retried forever');
  decals.dispose();
});

test('clearing a round throws away the backlog with the paint', () => {
  const scene = new Scene();
  const decals = createDecals(scene);
  const target = wall(scene);

  requestSplats(decals, target, 16);
  decals.clear();
  assert.equal(decals.count, 0);
  assert.equal(decals.pending, 0, 'last round\'s paint would arrive in the new one');

  // And the budget came back with it: the first shot of the new round paints at once.
  requestSplats(decals, target, 1);
  assert.equal(decals.count, 1);
  decals.dispose();
});
