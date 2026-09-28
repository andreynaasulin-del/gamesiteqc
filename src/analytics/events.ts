// Game code reports what happened; analytics decides where it goes. Games never import
// Clarity directly, so a blocked or absent tag can't break gameplay.
export type TrackTags = Record<string, string | number | boolean>;
export interface TrackDetail { name: string; tags?: TrackTags }

export const TRACK_EVENT = 'qc:track';

const NAME = /^[a-z0-9_]{1,48}$/;

export function loadBucket(ms: number): string {
  return ms < 3000 ? '<3s' : ms < 6000 ? '3-6s' : ms < 12000 ? '6-12s' : '12s+';
}

/**
 * dataLayer payload for GTM. GTM keeps every pushed key in its data model for the rest of the
 * page, so without the reset a `plan` from one click would ride along on every later GA4 event.
 */
export function dataLayerEvent(name: string, tags: TrackTags | undefined, seen: Set<string>): Record<string, unknown> {
  const payload: Record<string, unknown> = { event: `qc_${name}` };
  for (const key of seen) payload[key] = undefined;
  const fields: Record<string, unknown> = { ...tags };
  if (typeof fields.load_ms === 'number') fields.load_bucket = loadBucket(fields.load_ms);
  for (const [key, value] of Object.entries(fields)) {
    payload[key] = value;
    seen.add(key);
  }
  return payload;
}

export function track(name: string, tags?: TrackTags): void {
  if (!NAME.test(name)) return;
  const game = location.pathname.match(/\/(play|rocket|strike)(?:\.html)?$/)?.[1];
  const detail: TrackDetail = { name, tags: game ? { game: game === 'play' ? 'playground' : game, ...tags } : tags };
  window.dispatchEvent(new CustomEvent<TrackDetail>(TRACK_EVENT, { detail }));
  // Embedded games have no Clarity of their own; the landing's session records them.
  if (window.parent !== window) {
    try { window.parent.postMessage({ type: TRACK_EVENT, ...detail }, location.origin); } catch { /* noop */ }
  }
}
