/**
 * Embed mode: the playground running inside the landing page's hero card.
 *
 * Enabled by `?embed` on play.html. What changes:
 *   - the in-game brand header, CTA and credit are hidden (the page has its own)
 *   - the wheel *is* captured (zoom): the host only creates this frame after an
 *     explicit Play, and destroys it on exit, so while it exists the visitor is
 *     playing and must not scroll the page out from under a cast
 *   - rendering pauses while the card is scrolled out of view or the parent
 *     says the card is not the active one (`qc:active` message)
 *   - the parent is told when the scene is ready (`qc:ready`) so it can drop
 *     its poster, and when the player wants out (`qc:exit`, Esc with nothing
 *     armed) so it can return the card to its preview state
 */
export const EMBED = new URLSearchParams(window.location.search).has('embed');

if (EMBED) {
  document.documentElement.classList.add('is-embed');
  // The canvas turns wheel into zoom; over the HUD (ability bar, onboarding)
  // nothing consumes it and the browser would chain the scroll to the host
  // page. Nothing in this document scrolls, so swallowing it costs nothing.
  window.addEventListener('wheel', (event) => {
    // Scrollable game menus retain their wheel; their overscroll is contained in the iframe.
    for (let node = event.target; node instanceof Element; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) return;
    }
    event.preventDefault();
  }, { passive: false });
}

/** Messages accepted from / sent to the host page. Same origin only. */
export const MESSAGE = Object.freeze({
  READY: 'qc:ready',
  EXIT: 'qc:exit',
  ACTIVE: 'qc:active'
});

/**
 * Tracks whether the embedded canvas should be rendering at all.
 *
 * `IntersectionObserver` with a null root measures against the top-level
 * viewport, so it sees the host page's scroll position without the host
 * having to tell us anything.
 */
export class EmbedPresence {
  constructor(canvas) {
    this.visible = true;
    this.active = true;
    this._observer = null;
    this._onMessage = null;
    if (!EMBED) return;

    if ('IntersectionObserver' in window) {
      this._observer = new IntersectionObserver(
        ([entry]) => { this.visible = entry.isIntersecting; },
        { threshold: 0.02 }
      );
      this._observer.observe(canvas);
    }

    this._onMessage = (event) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const data = event.data;
      if (data && data.type === MESSAGE.ACTIVE) this.active = Boolean(data.active);
    };
    window.addEventListener('message', this._onMessage);
  }

  /** True when the frame loop should skip rendering this tick. */
  get suspended() {
    return EMBED && (!this.visible || !this.active);
  }

  /** Tell the host the scene is interactive. */
  announceReady() {
    if (!EMBED || window.parent === window) return;
    window.parent.postMessage({ type: MESSAGE.READY }, window.location.origin);
  }

  /** Ask the host to leave play mode. @returns {boolean} whether a host was told */
  requestExit() {
    if (!EMBED || window.parent === window) return false;
    window.parent.postMessage({ type: MESSAGE.EXIT }, window.location.origin);
    return true;
  }

  dispose() {
    this._observer?.disconnect();
    if (this._onMessage) window.removeEventListener('message', this._onMessage);
  }
}
