// Game code reports what happened; analytics decides where it goes. Games never import
// Clarity directly, so a blocked or absent tag can't break gameplay.
export type TrackTags = Record<string, string | number | boolean>;
export interface TrackDetail { name: string; tags?: TrackTags }

export const TRACK_EVENT = 'qc:track';

const NAME = /^[a-z0-9_]{1,48}$/;

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
