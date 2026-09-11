import test from 'node:test';
import assert from 'node:assert/strict';
import { QualityGovernor, TIERS } from '../src/core/QualityGovernor.js';
import { Time } from '../src/core/Time.js';
import { ELEMENTS, ELEMENT_META } from '../src/config/settings.js';

function governor(id = 'high') {
  const q = new QualityGovernor();
  q.set(id, { lock: false });
  return q;
}
function feed(q, frames, dt, options) {
  for (let i = 0; i < frames; i++) q.sample(dt, options);
}

test('six distinct slots and shortcuts', () => {
  assert.deepEqual(ELEMENTS, ['ward', 'venom', 'astral', 'quake', 'ink', 'rend']);
  assert.deepEqual(ELEMENTS.map(e => ELEMENT_META[e].key), ['Q', 'W', 'E', 'R', 'D', 'F']);
});

test('simulation clamp does not hide a long frame from the governor', () => {
  const time = new Time();
  time._last = performance.now() / 1000 - 0.4;
  assert.equal(time.tick(), 0.05);
  assert.ok(time.rawDelta >= 0.4);
  time.reset();
  assert.equal(time.rawDelta, 0);
});

test('budgets scale monotonically, preserving a usable raymarch floor', () => {
  assert.deepEqual(TIERS.map(t => t.id), ['eco', 'low', 'medium', 'high']);
  for (const key of ['pixelRatio', 'shadowMap', 'particleCount', 'particleSize', 'maxConcurrent', 'volumeSteps', 'maxDecals', 'surfaceDetail']) {
    for (let i = 1; i < TIERS.length; i++) assert.ok(TIERS[i - 1][key] <= TIERS[i][key], key);
  }
  assert.ok(TIERS[0].pixelRatio >= 0.8, 'eco must stay legible');
  // The volume materials floor their march at 6 samples (the shader clamp), so
  // the multiplier may go as low as it likes: what must hold is that every
  // volume still marches, and that eco is not paying for samples it cannot see.
  const VOLUME_BASE_STEPS = { nebula: 24, mist: 18, ink: 16 };
  for (const [name, base] of Object.entries(VOLUME_BASE_STEPS)) {
    const steps = Math.max(6, Math.round(base * TIERS[0].volumeSteps));
    assert.ok(steps >= 6 && steps <= 8, `${name} at eco marches ${steps} samples`);
  }
  // Soft sprites at eco keep more than a third of their fill: below that the
  // quake's dust reads as confetti rather than a cloud.
  assert.ok(TIERS[0].particleSize >= 0.6, 'eco particles must still read as clouds');
  assert.equal(TIERS[TIERS.length - 1].particleSize, 1, 'high is the authored size');
});

test('nobody starts on eco; it is earned by measurements', () => {
  assert.notEqual(TIERS[QualityGovernor.guessInitialIndex()].id, 'eco');
  assert.notEqual(TIERS[QualityGovernor.guessInitialIndex({ gpu: 'Apple M1' })].id, 'eco');
});

test('nobody starts on high either: it is earned in eight seconds of headroom', () => {
  // The old guess put every 8-core desktop on `high`; on an integrated GPU that
  // was a 72 ms frame for the first ten seconds of play.
  assert.notEqual(TIERS[QualityGovernor.guessInitialIndex()].id, 'high');
  assert.notEqual(TIERS[QualityGovernor.guessInitialIndex({ gpu: 'NVIDIA GeForce RTX 4070' })].id, 'high');
});

test('integrated GPUs start on low, discrete ones on medium', () => {
  const start = gpu => TIERS[QualityGovernor.guessInitialIndex({ gpu })].id;
  assert.equal(start('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)'), 'low');
  assert.equal(start('ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)'), 'low');
  assert.equal(start('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'low');
  assert.equal(start('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'low');
  assert.equal(start('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'low');
  assert.equal(start('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'medium');
  assert.equal(start('ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'medium');
  assert.equal(start('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'medium');
  assert.equal(start(''), 'medium', 'a hidden GPU string is not evidence either way');
  assert.equal(start(undefined), 'medium');
});

test('sustained slow frames downgrade; a single hitch does not', () => {
  const q = governor();
  feed(q, 180, 1 / 60);
  q.sample(0.4);
  assert.equal(q.tier.id, 'high');
  // 40 ms frames: past the 30 ms "very slow" line, so evidence accrues faster
  // and 12 s is enough to walk high → medium → low → eco.
  feed(q, 300, 0.04);
  assert.equal(q.tier.id, 'eco');
  assert.equal(q.downgrades, 3);
});

test('mildly slow frames demote more patiently than very slow ones', () => {
  const mild = governor();
  feed(mild, 120, 0.025); // 3 s at 40 FPS: settled, 1 s of evidence, still holding
  assert.equal(mild.tier.id, 'high');
  const harsh = governor();
  feed(harsh, 75, 0.04); // 3 s at 25 FPS already dropped a tier
  assert.equal(harsh.tier.id, 'medium');
});

test('sustained sub-4 FPS is not incorrectly ignored as isolated spikes', () => {
  const q = governor();
  feed(q, 50, 0.4);
  assert.equal(q.tier.id, 'eco');
});

test('manual lock preserves tier but keeps FPS measurements live', () => {
  const q = governor();
  q.set('high');
  feed(q, 100, 0.05);
  assert.equal(q.tier.id, 'high');
  assert.ok(q.frameMs > 45);
});

test('pause cannot earn an upgrade, resume can after stable headroom', () => {
  const q = governor('low');
  feed(q, 1200, 1 / 60, { paused: true });
  assert.equal(q.tier.id, 'low');
  feed(q, 1500, 1 / 60);
  assert.equal(q.tier.id, 'high');
});

test('an empty arena cannot earn an upgrade; casting can', () => {
  const q = governor('low');
  feed(q, 3600, 1 / 60, { idle: true });
  assert.equal(q.tier.id, 'low', 'a minute of fast idle frames proves nothing');

  // Evidence earned under load survives an idle gap rather than resetting.
  feed(q, 300, 1 / 60);            // 5 s of fast frames while casting
  feed(q, 300, 1 / 60, { idle: true });
  feed(q, 200, 1 / 60);            // 3.3 s more: 8.3 s total under load
  assert.equal(q.tier.id, 'medium');
});

test('reset removes stale slow evidence and invalid samples do not poison EMA', () => {
  const q = governor();
  feed(q, 45, 0.05); // 2.25 s at 20 FPS: settled and accruing, not yet demoted
  assert.equal(q.tier.id, 'high');
  assert.ok(q._slowFor > 0);
  q.resetSamples();
  const ms = q.frameMs;
  for (const value of [NaN, Infinity, -1, 0]) assert.equal(q.sample(value), false);
  assert.equal(q.frameMs, ms);
  assert.equal(q._slowFor, 0);
  feed(q, 60, 1 / 60);
  assert.equal(q.tier.id, 'high');
});

test('lowering concurrency immediately retires oldest casts and recycles them', async () => {
  const { AbilityManager } = await import('../src/abilities/AbilityManager.js');
  const retired = [], released = [];
  const manager = Object.create(AbilityManager.prototype);
  manager.active = ['ward', 'venom', 'astral', 'rend'].map(element => ({
    element, destroy() { retired.push(element); }
  }));
  manager.pools = new Map(manager.active.map(a => [a.element, { release(item) { released.push(item.element); } }]));
  manager.setMaxConcurrent(2);
  assert.deepEqual(retired, ['ward', 'venom']);
  assert.deepEqual(released, retired);
  assert.deepEqual(manager.active.map(a => a.element), ['astral', 'rend']);
  manager.setMaxConcurrent(4);
  assert.equal(manager.active.length, 2);
});
