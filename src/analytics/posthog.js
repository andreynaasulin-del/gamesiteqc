import posthog from 'posthog-js';
import { decorateProductUrl, readAttribution, trafficSegment } from './attribution.js';

// Public project token and collection host observed on quadcode.ai.
const KEY = 'phc_6EjEkuBSuOGvOKbD3eYy4YiR0dILCy1yuDv903cvyD9';
const HOST = 'https://analytics.neteragen.ai';
const embedded = new URLSearchParams(location.search).has('embed') || window.top !== window.self;
const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
const enabled = !embedded && !location.pathname.endsWith('/analytics.html') &&
  navigator.doNotTrack !== '1' && !(local && !new URLSearchParams(location.search).has('analytics'));
let storage;
try { storage = localStorage; } catch { /* Safari private mode */ }
const attribution = readAttribution(location.search, storage);
const referrer = (() => {
  try { return new URL(document.referrer).hostname.replace(/^www\./, ''); } catch { return ''; }
})();
const segment = trafficSegment(attribution, referrer && referrer !== location.hostname ? referrer : '');
const properties = { landing_domain: location.hostname, landing_path: location.pathname,
  traffic_segment: segment, ...Object.fromEntries(Object.entries(attribution).filter(([key]) => key !== 'fbclid')) };

if (enabled) {
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: false, // exactly one manual $pageview after attribution properties
    capture_pageleave: true,
    autocapture: false, // curated CTA events, not form text or uncontrolled click payloads
    person_profiles: 'identified_only',
  });
  // Preserve first-touch UTM on the anonymous person before handing off.
  posthog.createPersonProfile();
  posthog.register(properties);
  posthog.capture('$pageview', { ...properties, $set_once: { first_landing_domain: location.hostname,
    first_traffic_segment: segment, first_utm_source: attribution.utm_source || 'direct' } });
  posthog.capture('prelanding_view', properties);
}

function handoffIds() {
  if (!enabled) return {};
  return { distinctId: posthog.get_distinct_id(), sessionId: posthog.get_session_id() };
}

// Decorate at click-time, not once on DOMContentLoaded: offers, rate-card and
// game HUD links can be rendered/reassigned after the page initially loads.
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href]');
  if (!link) return;
  const previous = link.getAttribute('href');
  let original;
  try { original = new URL(previous, location.href); } catch { return; }
  if (!['quadcode.ai', 'www.quadcode.ai'].includes(original.hostname) || original.protocol !== 'https:') return;
  const decorated = decorateProductUrl(previous, location.href, attribution, handoffIds());
  if (decorated !== previous) link.href = decorated; // native navigation keeps hash & query
  if (!enabled) return;
  const discounted = link.matches('[data-deal-cta]') ||
    (link.matches('.rate__cta') && document.querySelector('[data-rate-period="year"][aria-pressed="true"]'));
  const cta = original.hash === '#download' ? 'click_download' :
    original.pathname === '/profile/plans' && discounted ? 'click_discount' : 'product_handoff';
  posthog.capture(cta, { ...properties, destination_path: original.pathname, destination_hash: original.hash,
    plan: link.closest('[data-plan]')?.dataset.plan || undefined },
  { transport: 'sendBeacon', send_instantly: true });
}, { capture: true });

if (enabled) {
  document.addEventListener('click', (event) => {
    const play = event.target.closest?.('[data-game-play]');
    if (!play) return;
    posthog.capture('demo_game_view', { ...properties,
      game: play.closest('[data-game]')?.dataset.game || 'unknown' });
  }, { capture: true });
}
