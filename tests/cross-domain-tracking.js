import assert from 'node:assert/strict';
import test from 'node:test';
import { decorateProductUrl, readAttribution, trafficSegment } from '../src/analytics/attribution.js';

function memory() {
  const map = new Map();
  return { getItem: (key) => map.get(key), setItem: (key, value) => map.set(key, value) };
}

const from = 'https://quadcodegames.com/?fbclid=abc_123&utm_source=facebook&utm_medium=paid_social&utm_campaign=reef';
const distinctId = 'cc7305c4-2c19-4750-8a18-3c6287739890';
const sessionId = 'dc7305c4-2c19-4750-8a18-3c6287739890';

test('reads marketing parameters only and persists across internal navigation', () => {
  const storage = memory();
  const first = readAttribution(new URL(from).search, storage, 1000);
  assert.deepEqual(first, { fbclid: 'abc_123', utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'reef' });
  assert.deepEqual(readAttribution('?session_token=secret', storage, 2000), first);
  assert.deepEqual(readAttribution('', storage, 1000 + 31 * 86400000), {});
});

test('does not mix old campaign parameters with a fresh visit', () => {
  const storage = memory();
  readAttribution('?utm_source=facebook&utm_campaign=old&fbclid=first', storage, 1000);
  assert.deepEqual(readAttribution('?utm_source=google&utm_campaign=новая/игра', storage, 2000),
    { utm_source: 'google', utm_campaign: 'новая/игра' });
});

test('preserves product hash, its own params and appends marketing and anonymous handoff', () => {
  const result = new URL(decorateProductUrl('https://quadcode.ai/#download', from,
    { fbclid: 'abc_123', utm_source: 'facebook' }, { distinctId, sessionId }));
  assert.equal(result.hash, '#download');
  assert.equal(result.searchParams.get('utm_source'), 'facebook');
  assert.equal(result.searchParams.get('fbclid'), 'abc_123');
  assert.equal(result.searchParams.get('qc_ph_id'), distinctId);
  assert.equal(result.searchParams.get('qc_ph_session'), sessionId);
  const plan = new URL(decorateProductUrl('https://quadcode.ai/profile/plans?promo=EXISTING', from,
    { utm_source: 'facebook' }));
  assert.equal(plan.searchParams.get('promo'), 'EXISTING');
  assert.equal(plan.searchParams.get('utm_source'), 'facebook');
});

test('keeps a destination campaign when already explicitly set', () => {
  const url = new URL(decorateProductUrl('https://quadcode.ai/?utm_source=newsletter#download', from,
    { utm_source: 'facebook' }));
  assert.equal(url.searchParams.get('utm_source'), 'newsletter');
});

test('does not leak IDs to unrelated domains or arbitrary values', () => {
  assert.equal(decorateProductUrl('https://evil.quadcode.ai/#download', from, { fbclid: 'ad' }), 'https://evil.quadcode.ai/#download');
  assert.equal(decorateProductUrl('mailto:hi@quadcode.ai', from, {}), 'mailto:hi@quadcode.ai');
  assert.equal(decorateProductUrl('https://quadcode.ai/#download', from, {}, { distinctId: 'person@example.com' }).includes('qc_ph_id'), false);
  assert.equal(readAttribution('?utm_source=a&auth_token=secret', memory(), 10).auth_token, undefined);
});

test('classifies paid, organic and direct traffic for cohorts', () => {
  assert.equal(trafficSegment({ fbclid: 'abc' }), 'paid_social');
  assert.equal(trafficSegment({ utm_medium: 'organic' }), 'organic_search');
  assert.equal(trafficSegment({}, ''), 'direct');
  assert.equal(trafficSegment({}, 'example.com'), 'referral');
});
