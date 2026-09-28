// Meta Conversions API relay (Vercel Node function).
//
// The browser Pixel fires every event with an `eventID`; the same id is posted
// here and forwarded server-side, so Meta deduplicates the pair and still gets
// the event when an ad blocker or ITP kills the Pixel request.
//
// Env (Vercel → Settings → Environment Variables, never in the repo):
//   META_PIXEL_ID         – dataset / pixel id
//   META_CAPI_TOKEN       – Conversions API access token (secret)
//   META_TEST_EVENT_CODE  – optional, routes events to Events Manager → Test events
//   META_API_VERSION      – optional, Graph API version (default v21.0)
import crypto from 'node:crypto';

const ALLOWED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'ClickDownload',
  'ClickDiscount',
  'Lead',
  'InitiateCheckout',
  'Contact',
  'CompleteRegistration',
  'Subscribe',
  'StartTrial',
  'Search',
]);
const MAX_KEYS = 20;
const MAX_STR = 200;

const sha256 = (value) => crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
const str = (value, max = MAX_STR) => (typeof value === 'string' && value ? value.slice(0, max) : undefined);

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

// Only flat, small, primitive values go to Meta — the endpoint is public.
function cleanCustomData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out = {};
  for (const [key, value] of Object.entries(input).slice(0, MAX_KEYS)) {
    if (!/^[a-z_]{1,40}$/.test(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string') out[key] = value.slice(0, MAX_STR);
    else if (Array.isArray(value)) out[key] = value.filter((v) => typeof v === 'string').slice(0, 20).map((v) => v.slice(0, MAX_STR));
  }
  return Object.keys(out).length ? out : undefined;
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim();
  return first || req.headers['x-real-ip'] || req.socket?.remoteAddress || undefined;
}

// Same-site only: reject posts whose Origin is another host.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // sendBeacon from same origin may omit it
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'forbidden' });

  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) return res.status(500).json({ error: 'not_configured' });

  const body = readBody(req);
  const eventName = str(body?.event_name, 50);
  const eventId = str(body?.event_id, 100);
  if (!eventName || !ALLOWED_EVENTS.has(eventName) || !eventId) {
    return res.status(400).json({ error: 'bad_event' });
  }

  const cookies = req.cookies || {};
  const externalId = str(body.external_id, 100);
  const userData = {
    client_ip_address: clientIp(req),
    client_user_agent: str(req.headers['user-agent'], 500),
    fbp: str(body.fbp) || str(cookies._fbp),
    fbc: str(body.fbc) || str(cookies._fbc),
    external_id: externalId ? [sha256(externalId)] : undefined,
  };

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: str(body.event_source_url, 1000) || str(req.headers.referer, 1000),
        user_data: userData,
        custom_data: cleanCustomData(body.custom_data),
      },
    ],
    access_token: token,
  };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  const version = process.env.META_API_VERSION || 'v21.0';
  try {
    // Awaited on purpose: a serverless function may be frozen right after it responds.
    const response = await fetch(`https://graph.facebook.com/${version}/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('[meta-capi]', response.status, detail.slice(0, 500));
      return res.status(502).json({ error: 'meta_rejected' });
    }
    return res.status(204).end();
  } catch (error) {
    console.error('[meta-capi]', error?.name, error?.message);
    return res.status(504).json({ error: 'meta_unreachable' });
  }
}
