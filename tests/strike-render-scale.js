import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Float32BufferAttribute, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, BufferGeometry } from 'three';
import { createGraphics, graphicsPixelRatio, GRAPHICS_PROFILES, RENDER_SCALES } from '../src/strike/engine/graphics.ts';
import { mergeCharacterSkins } from '../src/strike/characters/merge-skins.ts';

/** Feeds the governor a steady stream of frames of the same length. */
function feed(graphics, ms, seconds) {
  const dt = ms / 1000;
  for (let t = 0; t < seconds; t += dt) graphics.sample(dt, true);
}

test('a machine that misses the frame budget loses pixels, one rung at a time', () => {
  const graphics = createGraphics('auto', 'low');
  feed(graphics, 12, 11); // warmup burns the first ten seconds
  assert.equal(graphics.renderScale, 1);

  feed(graphics, 25, 2.5);
  assert.equal(graphics.renderScale, RENDER_SCALES[1], 'one bad window costs exactly one rung');

  feed(graphics, 25, 10);
  assert.equal(graphics.renderScale, RENDER_SCALES[RENDER_SCALES.length - 1], 'sustained misses reach the floor');
  assert.ok(graphics.renderScale >= 0.6, 'and never scale past readability');
});

test('a machine that holds 60 fps renders at full resolution and is told when that changes', () => {
  const graphics = createGraphics('auto', 'low');
  let announced = 0;
  graphics.onChange(() => { announced++; });

  feed(graphics, 12, 30);
  assert.equal(graphics.renderScale, 1);
  assert.equal(announced, 0, 'a fast machine is never resized');

  feed(graphics, 25, 3);
  assert.equal(announced, 1, 'the renderer hears about the drop');
});

test('the scaler settles instead of breathing in and out', () => {
  const graphics = createGraphics('auto', 'low');
  let announced = 0;
  graphics.onChange(() => { announced++; });
  feed(graphics, 12, 11);

  // A machine that is fast right up until it renders: alternating windows would make a naive
  // scaler flip resolution forever.
  for (let i = 0; i < 12; i++) { feed(graphics, 25, 2.5); feed(graphics, 12, 2.5); }
  // The climb budget bounds the seesaw: at most four climbs and the drops that answer them.
  assert.ok(announced <= 12, `resolution changed ${announced} times, expected the scaler to settle`);

  // Settled means it stops moving, not that it stays blurry forever: once the climb budget is
  // spent, the same seesaw must produce no further resizes.
  const settledAt = announced;
  const settledScale = graphics.renderScale;
  for (let i = 0; i < 12; i++) { feed(graphics, 25, 2.5); feed(graphics, 12, 2.5); }
  assert.equal(announced, settledAt, 'a settled scaler stops resizing under the same seesaw');
  assert.equal(graphics.renderScale, settledScale, 'and holds the resolution it settled on');
});

/**
 * The shadow map is redrawn from `environment.update()` on this clock, with the light's own
 * `autoUpdate` off. A zero or missing `shadowHz` makes the interval `Infinity` or `NaN`, and the
 * failure mode is silent: the sun renders its depth map once and every shadow in the match
 * freezes to the spawn room, which no test that only renders a frame would notice.
 */
test('every quality profile refreshes its shadows on a usable clock', () => {
  for (const [quality, profile] of Object.entries(GRAPHICS_PROFILES)) {
    assert.equal(typeof profile.shadowHz, 'number', `${quality} declares no shadow refresh rate`);
    assert.ok(Number.isFinite(profile.shadowHz) && profile.shadowHz > 0,
      `${quality} would freeze its shadow map (shadowHz ${profile.shadowHz})`);
    // Above the display's own rate the clock is always due and the throttle does nothing.
    assert.ok(profile.shadowHz <= 60, `${quality} asks for more shadow passes than frames`);
    // Below ~15 Hz a running avatar's shadow separates from its feet.
    assert.ok(profile.shadowHz >= 15, `${quality} would let shadows visibly lag their casters`);
  }
});

test('the pixel ratio carries the scale into the renderer', () => {
  const full = graphicsPixelRatio('low', 2, 1280, 720, 1);
  const scaled = graphicsPixelRatio('low', 2, 1280, 720, 0.62);
  assert.ok(scaled < full);
  assert.ok(Math.abs(scaled / full - 0.62) < 1e-6);
});

/** Builds a character-shaped rig: one skeleton, several one-material parts hanging off it. */
function rig(parts) {
  const bone = new Bone();
  const group = new Group();
  group.add(bone);
  const built = parts.map(({ color, triangles, roughness = 1, transparent = false, map = null }) => {
    const geometry = new BufferGeometry();
    const count = triangles * 3;
    const position = [];
    const skinIndex = [];
    const skinWeight = [];
    for (let i = 0; i < count; i++) {
      position.push(i, i * 2, i * 3);
      skinIndex.push(0, 0, 0, 0);
      skinWeight.push(1, 0, 0, 0);
    }
    geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(position, 3));
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4));
    const material = new MeshStandardMaterial({ color, roughness, transparent, map });
    const mesh = new SkinnedMesh(geometry, material);
    // The exporter hands every part its own Skeleton object over the same bones.
    mesh.bind(new Skeleton([bone]));
    group.add(mesh);
    return mesh;
  });
  return { group, parts: built };
}

test('parts that render alike become one mesh and keep their colours', () => {
  const { group } = rig([
    { color: 0xff0000, triangles: 400 },
    { color: 0x00ff00, triangles: 400 },
    { color: 0x0000ff, triangles: 400 },
  ]);

  const result = mergeCharacterSkins(group);
  assert.equal(result.saved, 2, 'three parts should submit as one');
  assert.equal(result.merged.length, 1);

  const merged = result.merged[0];
  const colors = merged.geometry.attributes.color;
  assert.ok(colors, 'the flat colours moved onto the vertices');
  assert.equal(merged.material.vertexColors, true);
  assert.deepEqual([colors.getX(0), colors.getY(0), colors.getZ(0)], [1, 0, 0]);
  const last = colors.count - 1;
  assert.deepEqual([colors.getX(last), colors.getY(last), colors.getZ(last)], [0, 0, 1]);

  const triangles = merged.geometry.index.count / 3;
  assert.equal(triangles, 1200, 'no geometry was lost in the weld');

  let live = 0;
  group.traverse(node => { if (node.isSkinnedMesh) live++; });
  assert.equal(live, 1, 'the welded parts left the scene graph');
  assert.equal(result.retired.length, 3, 'and their materials are handed back for disposal');
});

test('parts the renderer treats differently are left alone, and everything gets culled again', () => {
  const { group } = rig([
    { color: 0xff0000, triangles: 400 },
    { color: 0x00ff00, triangles: 400 },
    { color: 0x111111, triangles: 400, transparent: true },
    { color: 0x222222, triangles: 400, roughness: 0.1 },
  ]);

  const result = mergeCharacterSkins(group);
  const meshes = [];
  group.traverse(node => { if (node.isSkinnedMesh) meshes.push(node); });

  assert.equal(result.saved, 1, 'only the two matching parts weld');
  assert.equal(meshes.length, 3);
  for (const mesh of meshes) {
    assert.equal(mesh.frustumCulled, true, 'a body outside the view should cost nothing');
    assert.ok(mesh.geometry.boundingSphere, 'culling needs bounds');
  }
  const transparent = meshes.find(mesh => mesh.material.transparent);
  assert.equal(transparent.castShadow, false, 'glass does not belong in the shadow map');
});

/**
 * A rig whose parts sit inside a sphere of a given radius, so a test can say "5 000 triangles
 * packed into 10 cm" rather than relying on `rig`'s spread-out debug positions.
 */
function packedRig(parts) {
  const bone = new Bone();
  const group = new Group();
  group.add(bone);
  for (const { triangles, radius, roughness = 1 } of parts) {
    const geometry = new BufferGeometry();
    const count = triangles * 3;
    const position = [];
    const skinIndex = [];
    const skinWeight = [];
    for (let i = 0; i < count; i++) {
      // Walk the sphere's surface: the bounding radius is exactly `radius`.
      const angle = (i / count) * Math.PI * 2;
      position.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      skinIndex.push(0, 0, 0, 0);
      skinWeight.push(1, 0, 0, 0);
    }
    geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(position, 3));
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4));
    const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial({ roughness }));
    mesh.bind(new Skeleton([bone]));
    group.add(mesh);
  }
  return group;
}

test('dense hair is excluded from the shadow map, clothing is not', () => {
  // A shiny part is one the renderer treats differently, which is what keeps these two from
  // welding into a single mesh with a single verdict.
  const group = packedRig([
    { triangles: 60_000, radius: 0.16, roughness: 1 },   // hair: ~2.3 M tris/m²
    { triangles: 28_000, radius: 1.1, roughness: 0.1 },  // a satin trouser leg: ~23 k tris/m²
  ]);
  mergeCharacterSkins(group);
  const meshes = [];
  group.traverse(node => { if (node.isSkinnedMesh) meshes.push(node); });
  assert.equal(meshes.length, 2, 'the two parts render differently and stay separate');

  const hair = meshes.find(mesh => mesh.material.roughness === 1);
  const trousers = meshes.find(mesh => mesh.material.roughness === 0.1);
  assert.equal(hair.castShadow, false, '60k triangles inside 16 cm add nothing to a 512px shadow map');
  assert.equal(trousers.castShadow, true, 'a garment still casts: it is what gives the body its shape');
});

test('the shadow verdict is taken before the cull margin inflates the bounds', () => {
  // `prepare` grows the bounding sphere for culling. Reading the density off the grown radius
  // would divide by ~3× too much area and quietly let dense hair back into the shadow pass.
  const group = packedRig([{ triangles: 60_000, radius: 0.16 }]);
  mergeCharacterSkins(group);
  const mesh = group.children.find(node => node.isSkinnedMesh);
  assert.equal(mesh.castShadow, false, 'the cull margin must not buy a part its way into the shadow map');
  assert.ok(mesh.geometry.boundingSphere.radius > 0.16, 'and the margin is still applied for culling');
});

test('eyelashes and teeth stay out of the shadow pass', () => {
  const { group } = rig([
    { color: 0xffffff, triangles: 20 },
    { color: 0xffffff, triangles: 30 },
  ]);
  mergeCharacterSkins(group);
  const meshes = [];
  group.traverse(node => { if (node.isSkinnedMesh) meshes.push(node); });
  assert.equal(meshes.length, 1, 'they still weld together');
  assert.equal(meshes[0].castShadow, false, '50 triangles cast no shadow worth drawing');
});
