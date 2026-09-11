import test from 'node:test';
import assert from 'node:assert/strict';
import { Quality, TIERS, PIXEL_BUDGET, MIN_PIXELS } from '../src/rocket/core/Quality.ts';

/** A governor past its warmup, so tests measure decisions and not the boot. */
function governor() {
  const q = new Quality();
  feed(q, 6 * 60, 16.7); // burn WARMUP at a clean 60
  return q;
}
function feed(q, frames, ms) {
  for (let i = 0; i < frames; i++) q.sample(ms);
}
/** One decision window's worth of frames at `ms`. */
function seconds(q, count, ms) {
  feed(q, Math.ceil((count * 1000) / ms), ms);
}
/**
 * A second of 60 fps in which `latePct` of the frames miss vsync.
 *
 * The late frames are spread through the window, not bunched at the front:
 * bunching them makes the window close early on a burst and reads as a much
 * worse share than the second actually contained.
 */
function mixedSecond(q, latePct) {
  let elapsed = 0;
  let late = 0;
  const target = 60 * latePct;
  for (let i = 0; elapsed < 1000; i++) {
    const wantLate = late < Math.round((i + 1) * latePct);
    const ms = wantLate ? 40 : 16.7;
    if (wantLate) late++;
    q.sample(ms);
    elapsed += ms;
    if (late >= target && elapsed >= 1000) break;
  }
}

test('tiers only get cheaper downwards', () => {
  assert.deepEqual(TIERS.map(t => t.id), ['eco', 'low', 'medium', 'high']);
  for (const key of ['scale', 'shadowMap']) {
    for (let i = 1; i < TIERS.length; i++) assert.ok(TIERS[i - 1][key] <= TIERS[i][key], key);
  }
  // bloomDiv is inverted: a bigger divisor is the cheaper option.
  for (let i = 1; i < TIERS.length; i++) assert.ok(TIERS[i - 1].bloomDiv >= TIERS[i].bloomDiv);
});

test('starts at full quality; eco is earned, never assumed', () => {
  assert.equal(new Quality().tier.id, 'high');
});

test('a single stuttery second is not a downgrade', () => {
  const q = governor();
  // A goal explosion: a third of the second misses vsync, the rest is clean.
  // That is a hitch to ride out, not a machine that cannot keep up.
  mixedSecond(q, 0.35);
  mixedSecond(q, 0);
  assert.equal(q.tier.id, 'high');
});

test('two stuttery seconds in a row is', () => {
  const q = governor();
  mixedSecond(q, 0.35);
  mixedSecond(q, 0.35);
  assert.equal(q.tier.id, 'medium');
});

test('a hopeless machine drops without waiting for a vote', () => {
  const q = governor();
  seconds(q, 1, 90); // >60% late: panic path, one window is enough
  assert.equal(q.tier.id, 'medium');
});

test('a steady 60 climbs back up — the vsync-floor regression', () => {
  // 16.7 ms *is* the best a 60 Hz display can report. An upgrade threshold
  // below that number silently pins the game to whatever tier it fell to.
  const q = new Quality();
  q.set('eco');
  q.locked = false;
  seconds(q, 12, 16.7);
  assert.notEqual(q.tier.id, 'eco');
});

test('a shader compile is an event, not a load signal', () => {
  const q = governor();
  for (let i = 0; i < 3; i++) {
    q.sample(320); // outlier: ignored, but re-arms the settle window
    seconds(q, 1, 16.7);
  }
  assert.equal(q.tier.id, 'high');
});

test('a pinned tier stays pinned', () => {
  const q = governor();
  q.set('low');
  seconds(q, 10, 60);
  assert.equal(q.tier.id, 'low');
});

test('resolution respects the pixel budget on a retina 4K', () => {
  globalThis.window = { devicePixelRatio: 2 };
  const shaded = (q, w, h) => {
    const pr = q.pixelRatio(w, h);
    return w * pr * (h * pr);
  };
  try {
    const w = 3840;
    const h = 2160;
    const q = new Quality();
    assert.ok(shaded(q, w, h) <= PIXEL_BUDGET * 1.01, 'budget must hold at high');

    // The floor is a pixel count, not a ratio — 0.32 on 4K is still 1080p.
    q.set('eco');
    assert.ok(shaded(q, w, h) >= MIN_PIXELS, 'eco must stay legible');
    assert.ok(shaded(q, w, h) < shaded(new Quality(), w, h), 'eco must be cheaper');

    // A small hero card on a 1x display: never upscaled past the device, and
    // the floor must not push a tiny box above its own native resolution.
    globalThis.window = { devicePixelRatio: 1 };
    assert.equal(new Quality().pixelRatio(940, 610), 1);
    const eco = new Quality();
    eco.set('eco');
    assert.ok(eco.pixelRatio(940, 610) <= 1);
  } finally {
    delete globalThis.window;
  }
});
