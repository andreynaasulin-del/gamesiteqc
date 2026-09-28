// Meta Pixel + Conversions API, deduplicated.
//
// Every event is sent twice with ONE event id: by the browser Pixel (fbq) and
// by /api/meta-capi (server → Graph API). Meta merges the pair, so nothing is
// double counted, and the server copy survives ad blockers / Safari ITP.
//
// The pixel id is public by design. The CAPI token lives only in Vercel env.
//
// Auto events:
//   PageView          – every top-level page load
//   ViewContent       – "Play" on a game card        (content_type: game)
//   Lead              – any link to quadcode.ai/#download
//   InitiateCheckout  – any link to quadcode.ai/profile/plans
//   ClickDownload     – click on product download CTA (custom)
//   ClickDiscount     – click on a discounted plans CTA (custom)
// Manual: import { track } from './analytics/meta.js'; track('Lead', {...}).

const PIXEL_ID = '28644604081844406';
const ENDPOINT = '/api/meta-capi';
const EXTERNAL_ID_KEY = 'qc_eid';

const params = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
// Games run inside the landing's hero card via <iframe ?embed>. The parent
// page owns tracking; the iframe forwards its events up instead of loading a
// second Pixel and counting a second PageView.
const EMBEDDED = params.has('embed') || window.top !== window.self;

const uuid = () =>
  crypto.randomUUID?.() ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

const cookie = (name) => document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];

// Stable anonymous id → hashed server-side as external_id (better match rate).
function externalId() {
  try {
    let id = localStorage.getItem(EXTERNAL_ID_KEY);
    if (!id) localStorage.setItem(EXTERNAL_ID_KEY, (id = uuid()));
    return id;
  } catch {
    return undefined;
  }
}

// _fbc may not be written yet on the landing hit, so derive it from fbclid.
function clickId() {
  const fbclid = params.get('fbclid');
  if (fbclid && fbclid.length <= 500) return `fb.1.${Date.now()}.${fbclid}`;
  return cookie('_fbc') || undefined;
}

function loadPixel() {
  if (window.fbq) return;
  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  const eid = externalId();
  window.fbq('init', PIXEL_ID, eid ? { external_id: eid } : {});
}

function sendServer(eventName, eventId, customData) {
  if (LOCAL && !params.has('capi')) return; // no serverless function under `vite`
  const body = JSON.stringify({
    event_name: eventName,
    event_id: eventId,
    event_source_url: location.href,
    custom_data: customData,
    fbp: cookie('_fbp'),
    fbc: clickId(),
    external_id: externalId(),
  });
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
  } catch {
    /* fall through to fetch */
  }
  fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

/** Fire a standard Meta event on both channels with a shared event id. */
export function track(eventName, customData = {}) {
  if (EMBEDDED) {
    try {
      return window.parent.__qcMeta?.track(eventName, customData);
    } catch {
      return undefined; // cross-origin parent: nothing to forward to
    }
  }
  const eventId = uuid();
  window.fbq?.(eventName.startsWith('Click') ? 'trackCustom' : 'track', eventName, customData, { eventID: eventId });
  sendServer(eventName, eventId, customData);
  return eventId;
}

function bindAutoEvents() {
  document.addEventListener(
    'click',
    (event) => {
      const play = event.target.closest?.('[data-game-play]');
      if (play) {
        const card = play.closest('[data-game]');
        track('ViewContent', { content_type: 'game', content_name: card?.dataset.game || 'game' });
        return;
      }
      const link = event.target.closest?.('a[href]');
      if (!link) return;
      let url;
      try { url = new URL(link.href, location.href); } catch { return; }
      if (!['quadcode.ai', 'www.quadcode.ai'].includes(url.hostname)) return;
      if (url.pathname === '/profile/plans') {
        const plan = link.closest('[data-plan]')?.dataset.plan || 'plans';
        track('InitiateCheckout', { content_name: plan, content_category: 'subscription' });
        const discounted = link.matches('[data-deal-cta]') ||
          (link.matches('.rate__cta') && document.querySelector('[data-rate-period="year"][aria-pressed="true"]'));
        if (discounted) track('ClickDiscount', { content_name: plan, content_category: 'subscription' });
      } else if (url.hash === '#download') {
        track('Lead', { content_name: 'download', content_category: 'desktop_app' });
        track('ClickDownload', { content_name: 'download', content_category: 'desktop_app' });
      }
    },
    { capture: true },
  );
}

if (!EMBEDDED) {
  loadPixel();
  window.__qcMeta = { track };
  track('PageView');
}
bindAutoEvents();
