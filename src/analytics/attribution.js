// Only marketing parameters are carried between the two domains. Never copy
// arbitrary query parameters (tokens, emails, internal navigation state).
export const MARKETING_PARAMS = ['fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'qc_marketing_attribution_v1';

export function readAttribution(search, storage, now = Date.now()) {
  let saved = {};
  try {
    const record = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    if (record && Number.isFinite(record.at) && record.at <= now && now - record.at < TTL_MS) saved = record.values || {};
  } catch { /* storage may be blocked; still use the current URL */ }
  const incoming = new URLSearchParams(search);
  // New campaign touch must not inherit UTM fields from a previous ad.
  if (incoming.get('fbclid') || incoming.get('utm_source')) saved = {};
  let updated = false;
  for (const key of MARKETING_PARAMS) {
    const value = incoming.get(key);
    if (value && value.length <= (key === 'fbclid' ? 500 : 200) && !/[\x00-\x1f\x7f]/.test(value)) {
      saved[key] = value;
      updated = true;
    }
  }
  const values = Object.fromEntries(MARKETING_PARAMS.filter((key) => saved[key]).map((key) => [key, saved[key]]));
  if (updated) {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({ values, at: now })); } catch { /* noop */ }
  }
  return values;
}

export function trafficSegment(attribution, referrer = '') {
  const medium = (attribution.utm_medium || '').toLowerCase();
  if (attribution.fbclid || /^(paid|cpc|ppc|paid_social|social_paid)$/.test(medium)) return 'paid_social';
  if (medium === 'organic') return 'organic_search';
  if (medium === 'email') return 'email';
  if (medium === 'social') return 'organic_social';
  if (attribution.utm_source) return 'campaign';
  return referrer ? 'referral' : 'direct';
}

export function decorateProductUrl(href, base, attribution, handoff = {}) {
  let url;
  try { url = new URL(href, base); } catch { return href; }
  if (url.protocol !== 'https:' || !['quadcode.ai', 'www.quadcode.ai'].includes(url.hostname)) return href;
  for (const key of MARKETING_PARAMS) {
    if (attribution[key] && !url.searchParams.has(key)) url.searchParams.set(key, attribution[key]);
  }
  // Anonymous PostHog SDK identifiers only. Never forward email/account IDs.
  if (/^[a-f0-9-]{36}$/i.test(handoff.distinctId || '')) url.searchParams.set('qc_ph_id', handoff.distinctId);
  if (/^[a-f0-9-]{36}$/i.test(handoff.sessionId || '')) url.searchParams.set('qc_ph_session', handoff.sessionId);
  return url.href;
}
