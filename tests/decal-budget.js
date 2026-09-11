import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3 } from 'three';
import { DecalSystem, DecalType } from '../src/effects/GroundDecals.js';

const at = new Vector3(0, 0, 0);

test('spawn never exceeds the budget; the oldest mark goes first', () => {
  const decals = new DecalSystem(new Scene());
  decals.setBudget(3);

  const first = decals.spawn(DecalType.DUSTRING, at, { life: 5 });
  decals.spawn(DecalType.DUSTRING, at, { life: 5 });
  decals.spawn(DecalType.SCORCH, at, { life: 5 });
  assert.equal(decals.active.length, 3);
  assert.ok(first.mesh.visible);

  const fourth = decals.spawn(DecalType.SHOCKWAVE, at, { life: 5 });
  assert.equal(decals.active.length, 3, 'still three');
  assert.ok(!decals.active.includes(first), 'the oldest retired');
  assert.ok(!first.mesh.visible, 'and its mesh is hidden');
  assert.ok(decals.active.includes(fourth), 'the new one is live');
});

test('lowering the budget at runtime trims the excess immediately', () => {
  const decals = new DecalSystem(new Scene());
  for (let i = 0; i < 8; i++) decals.spawn(DecalType.DUSTRING, at, { life: 5 });
  assert.equal(decals.active.length, 8, 'unbounded by default');

  decals.setBudget(5);
  assert.equal(decals.active.length, 5);

  decals.setBudget(undefined);
  for (let i = 0; i < 4; i++) decals.spawn(DecalType.DUSTRING, at, { life: 5 });
  assert.equal(decals.active.length, 9, 'undefined restores no cap');
});

test('a retired decal is reused by the pool, not leaked', () => {
  const decals = new DecalSystem(new Scene());
  decals.setBudget(1);
  const a = decals.spawn(DecalType.DUSTRING, at, { life: 5 });
  const b = decals.spawn(DecalType.DUSTRING, at, { life: 5 });
  assert.equal(a, b, 'same pooled object came back');
  assert.equal(decals.active.length, 1);
});
