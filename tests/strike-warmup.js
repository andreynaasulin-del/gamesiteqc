import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Scene, Sprite } from 'three';

const { warmUpScene, warmUpObject } = await import('../src/strike/engine/warmup.ts');

const camera = new PerspectiveCamera();

test('scene warm-up awaits the renderer before the loading veil drops', async () => {
  const calls = [];
  let resolved = false;
  const scene = new Scene();
  const renderer = {
    compileAsync: async (target, cam) => {
      calls.push([target, cam]);
      await new Promise(done => setTimeout(done, 10));
      resolved = true;
    },
  };

  await warmUpScene(renderer, scene, camera);

  assert.equal(calls.length, 1, 'the whole scene is compiled exactly once');
  assert.equal(calls[0][0], scene);
  assert.equal(calls[0][1], camera);
  assert.ok(resolved, 'warm-up resolves only after the GPU work finished');
});

test('a renderer without compileAsync falls back to the synchronous path', async () => {
  const scene = new Scene();
  let compiled = null;
  await warmUpScene({ compile: target => { compiled = target; } }, scene, camera);
  assert.equal(compiled, scene);
});

test('a renderer that cannot compile at all never breaks the match', async () => {
  await warmUpScene({}, new Scene(), camera);
  await warmUpScene({ compileAsync: async () => { throw new Error('no GPU'); } }, new Scene(), camera);
});

test('a late avatar compiles against the live scene without blocking', () => {
  const scene = new Scene();
  const avatar = new Object3D();
  const seen = [];
  let settled = false;
  const renderer = {
    compileAsync: (target, cam, targetScene) => {
      seen.push([target, cam, targetScene]);
      return Promise.resolve().then(() => { settled = true; });
    },
  };

  warmUpObject(renderer, avatar, scene, camera);

  assert.equal(settled, false, 'the caller is not made to wait for the GPU');
  assert.deepEqual(seen, [[avatar, camera, scene]], 'the object compiles in the context of its scene');
});

test('a rejected late compile is swallowed, not thrown at the frame loop', () => {
  const renderer = { compileAsync: () => Promise.reject(new Error('lost context')) };
  assert.doesNotThrow(() => warmUpObject(renderer, new Object3D(), new Scene(), camera));
});

// three#34632: an async-compiled SpriteMaterial fails its WebGPU pipeline ("Binding doesn't exist").
test('sprites are kept out of the async compile and come back afterwards', async () => {
  const avatar = new Object3D();
  const tag = new Sprite();
  const hiddenSplat = new Sprite();
  hiddenSplat.visible = false;
  avatar.add(tag, hiddenSplat);
  let masksDuringCompile = null;
  let finish;
  const renderer = {
    compileAsync: () => {
      masksDuringCompile = [tag.layers.mask, hiddenSplat.layers.mask];
      return new Promise(done => { finish = done; });
    },
  };

  warmUpObject(renderer, avatar, new Scene(), camera);
  assert.deepEqual(masksDuringCompile, [0, 0], 'no sprite reaches the async compile');

  // The game flips visibility mid-compile; the warm-up must not undo it.
  tag.visible = false;
  finish();
  await new Promise(done => setTimeout(done, 0));

  assert.equal(tag.layers.mask, 1, 'layer restored');
  assert.equal(hiddenSplat.layers.mask, 1);
  assert.equal(tag.visible, false, 'game visibility left alone');
  assert.equal(hiddenSplat.visible, false);
});

test('scene warm-up restores sprite layers even when the compile fails', async () => {
  const scene = new Scene();
  const sprite = new Sprite();
  scene.add(sprite);
  await warmUpScene({ compileAsync: async () => { throw new Error('pipeline'); } }, scene, camera);
  assert.equal(sprite.layers.mask, 1);
});
