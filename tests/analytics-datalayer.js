import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register(new URL('./ts-resolve.mjs', import.meta.url));
const { dataLayerEvent, loadBucket } = await import('../src/analytics/events.ts');

test('prefixes the event so GTM triggers match qc_<name>', () => {
  assert.deepEqual(dataLayerEvent('cta_download', { cta_section: 'hero' }, new Set()),
    { event: 'qc_cta_download', cta_section: 'hero' });
});

test('clears params from earlier events so they do not leak into later GA4 hits', () => {
  const seen = new Set();
  dataLayerEvent('plan_click', { plan: 'pro', cta_section: 'pricing' }, seen);
  const next = dataLayerEvent('cta_download', { cta_section: 'hero', cta_text: 'Download' }, seen);
  assert.equal(next.plan, undefined);
  assert.ok('plan' in next, 'the stale key must be pushed as undefined, not omitted');
  assert.equal(next.cta_section, 'hero');
  const bare = dataLayerEvent('play_60s', undefined, seen);
  for (const key of ['plan', 'cta_section', 'cta_text']) assert.equal(bare[key], undefined);
});

test('adds a load bucket GA4 can segment on', () => {
  const payload = dataLayerEvent('game_ready', { game: 'rocket', load_ms: 4200 }, new Set());
  assert.equal(payload.load_bucket, '3-6s');
  assert.equal(payload.load_ms, 4200);
  assert.deepEqual([1000, 3000, 6000, 12000].map(loadBucket), ['<3s', '3-6s', '6-12s', '12s+']);
});
