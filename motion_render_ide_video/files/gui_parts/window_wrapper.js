/**
 * IDEWindowWrapper
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a centered, 2× down-scaled IDE window container on the page.
 *
 * The "native" IDE size is 1440×900 (full-size mock).
 * We render it at that size then scale(0.5) so it appears as 720×450 on screen,
 * centered both axes in the viewport.
 *
 * Usage:
 *   const win = new IDEWindowWrapper({ scale: 0.5 });
 *   win.mount(document.body);
 *   win.setContent(myPanelElement);   // fill the inner content area
 *   win.unmount();
 *
 * The wrapper exposes:
 *   .el          — outer centering shell (position:fixed, full viewport)
 *   .window      — the IDE window frame (native 1440×900, scaled)
 *   .contentArea — the flex-grow inner area between header and status bar
 *                  (mount your panels here)
 */
class IDEWindowWrapper {
  /**
   * @param {object} opts
   * @param {number}  [opts.nativeW=1440]  — native (pre-scale) width in px
   * @param {number}  [opts.nativeH=900]   — native (pre-scale) height in px
   * @param {number}  [opts.scale=0.5]     — CSS scale factor (0.5 = 2× smaller)
   * @param {string}  [opts.shadow]        — box-shadow override
   */
  constructor(opts = {}) {
    this.nativeW = opts.nativeW ?? 1440;
    this.nativeH = opts.nativeH ?? 900;
    this.scale   = opts.scale   ?? 0.5;
    this.shadow  = opts.shadow  ?? '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)';

    this._build();
  }

  // ── Build DOM ──────────────────────────────────────────────────────────────

  _build() {
    /* Outer shell — full-viewport centering layer */
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position:       'fixed',
      inset:          '0',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      pointerEvents:  'none',   // pass-through so page bg animations still work
      zIndex:         '10',
    });

    /* IDE window frame — rendered at native size, then scaled.
       transformOrigin:center keeps it visually centered in the flex container. */
    this.window = document.createElement('div');
    Object.assign(this.window.style, {
      width:          this.nativeW + 'px',
      height:         this.nativeH + 'px',
      display:        'flex',
      flexDirection:  'column',
      overflow:       'hidden',
      borderRadius:   '10px',
      background:     'var(--qc-color-bg-primary, #13131f)',
      boxShadow:      this.shadow,
      transform:      `scale(${this.scale})`,
      transformOrigin:'center center',
      pointerEvents:  'auto',
      flexShrink:     '0',
      position:       'absolute',
    });

    /* Content area — grows between header and status bar */
    this.contentArea = document.createElement('div');
    Object.assign(this.contentArea.style, {
      flex:     '1',
      display:  'flex',
      flexDirection: 'row',
      overflow: 'hidden',
      minHeight: '0',
    });

    this.window.appendChild(this.contentArea);
    this.el.appendChild(this.window);

    /* Scene layer — siblings with .window inside the centering shell.
       Viewer windows (IDECustomWindow) mount here so they share the same
       perspective + 3D transform as the IDE window and move/rotate/scale
       with it during camera animations.

       Coordinates inside sceneLayer are in the same space as .window:
       origin = center of the centering shell (same as IDE window center).
       Use position:absolute + left/top relative to the shell center.

       The camera (IDECamera) mirrors every transform it applies to .window
       onto .sceneLayer so they stay in perfect sync. */
    this.sceneLayer = document.createElement('div');
    Object.assign(this.sceneLayer.style, {
      position:        'absolute',
      inset:           '0',
      pointerEvents:   'none',   // pass-through by default; windows set their own
      transformOrigin: 'center center',
      transformStyle:  'preserve-3d',
    });
    this.el.appendChild(this.sceneLayer);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Mount the wrapper into a parent element.
   * Header and StatusBar should be mounted into this.window separately
   * (they prepend/append themselves).
   * @param {HTMLElement} parent
   */
  mount(parent) {
    parent.appendChild(this.el);
    return this;
  }

  /** Remove from DOM */
  unmount() {
    this.el.remove();
    return this;
  }

  /**
   * Place a panel element inside the content area.
   * Replaces existing content.
   * @param {HTMLElement} el
   */
  setContent(el) {
    this.contentArea.innerHTML = '';
    this.contentArea.appendChild(el);
    return this;
  }

  /**
   * Append a panel element to the content area (for multi-column layouts).
   * @param {HTMLElement} el
   */
  appendContent(el) {
    this.contentArea.appendChild(el);
    return this;
  }

  /**
   * Update scale at runtime (e.g. from a slider).
   * @param {number} s
   */
  setScale(s) {
    this.scale = s;
    this.window.style.transform = `scale(${s})`;
    return this;
  }

  /**
   * Resize the native IDE frame while preserving its viewport scale and center.
   * @param {number} deltaW — horizontal delta in native px
   * @param {number} deltaH — vertical delta in native px
   */
  adjustNativeSize(deltaW, deltaH) {
    var minW = 720;
    var minH = 480;
    this.nativeW = Math.max(minW, this.nativeW + (Number(deltaW) || 0));
    this.nativeH = Math.max(minH, this.nativeH + (Number(deltaH) || 0));
    this.window.style.width = this.nativeW + 'px';
    this.window.style.height = this.nativeH + 'px';
    return { nativeW: this.nativeW, nativeH: this.nativeH };
  }

  /**
   * Set native IDE frame size, or adjust by relative delta.
   * Values prefixed with + or - are treated as deltas; plain numbers are absolute.
   * @param {number|string} [w] — e.g. 1600, "+80", "-80"
   * @param {number|string} [h] — e.g. 900, "+40", "-40"
   * @returns {{nativeW:number, nativeH:number}}
   */
  setNativeSize(w, h) {
    var minW = 720;
    var minH = 480;
    function resolve(cur, v) {
      if (v === undefined || v === null) return cur;
      var s = String(v).trim();
      if (s.charAt(0) === '+' || s.charAt(0) === '-') return cur + (parseInt(s, 10) || 0);
      var n = parseFloat(s);
      return isNaN(n) ? cur : n;
    }
    this.nativeW = Math.max(minW, resolve(this.nativeW, w));
    this.nativeH = Math.max(minH, resolve(this.nativeH, h));
    this.window.style.width  = this.nativeW + 'px';
    this.window.style.height = this.nativeH + 'px';
    return { nativeW: this.nativeW, nativeH: this.nativeH };
  }

  /**
   * Prepend an element to the window (use for header — goes above contentArea).
   * @param {HTMLElement} el
   */
  prependToWindow(el) {
    this.window.insertBefore(el, this.window.firstChild);
    return this;
  }

  /**
   * Append an element to the window (use for status bar — goes below contentArea).
   * @param {HTMLElement} el
   */
  appendToWindow(el) {
    this.window.appendChild(el);
    return this;
  }
}

/**
 * resize_ide_to_perfect_fit(videoSrc, visiblePanels, wrapperInstance)
 * ─────────────────────────────────────────────────────────────────────────────
 * Adjusts the IDE emulation window height so the content area matches the
 * video aspect ratio — no black bars when recording.
 *
 * Strategy (scale and rotation are NEVER touched):
 *   1. Read video natural dimensions → videoAspect = videoW / videoH.
 *   2. Read pseudo-browser element width via offsetWidth — immune to CSS transforms
 *      (getBoundingClientRect is corrupted by scale + 3D rotation, offsetWidth is not).
 *   3. contentH = browserOffsetW / videoAspect  — height needed for zero black bars.
 *   4. nativeH = contentH + target chrome overhead — browser and custom tabs differ.
 *   5. Set window.style.height = nativeH + 'px' only. Width, scale, rotation unchanged.
 *
 * visiblePanels is accepted for API compatibility but no longer affects the calculation —
 * panel visibility is already reflected in the live offsetWidth of the browser element.
 *
 * Chrome constants (measured from live IDE emulation at native scale):
 *   CHROME_HEADER   = 38px   — IDEHeader
 *   CHROME_FOOTER   = 28px   — IDEStatusBar (compact reduced height, was 40px)
 *   CHROME_TABS     = 42px   — center panel tabs-header
 *   CHROME_GAP      =  3px   — splitter top padding
 *   ─────────────────────────
 *   CHROME_TOTAL    = 111px
 *
 * @param {string}           videoSrc        — URL or path to the video file
 * @param {object}           [visiblePanels] — { left, bottom, right } booleans (reserved)
 * @param {IDEWindowWrapper} wrapperInstance — the IDEWindowWrapper to resize
 * @returns {Promise<{nativeW, nativeH, scale, contentH, videoW, videoH, vpW, vpH}>}
 */
// Fixed chrome overhead constants (measured from live IDE at native scale, px):
//   IDEHeader          = 38
//   IDEStatusBar       = 28 (compact mode, was 40; reduced by 12)
//   center tabs-header = 42
//   splitter top gap   =  3
//   (browser toolbar hidden — not counted)
var CHROME_WINDOW         = 38 + 28 + 3;
var CHROME_CENTER_TABS    = 42;
var CHROME_BROWSER_TABS   = 42 - 8;
var CHROME_CUSTOM_PADDING = 6 - 4;
var BROWSER_VIDEO_CHROME  = CHROME_WINDOW + CHROME_CENTER_TABS + CHROME_BROWSER_TABS;
var CUSTOM_VIDEO_CHROME   = CHROME_WINDOW + CHROME_CENTER_TABS + CHROME_CUSTOM_PADDING;

/**
 * VideoDimensionCache
 * ─────────────────────────────────────────────────────────────────────────────
 * Preloads video metadata (width/height) in the background so
 * resize_ide_to_perfect_fit can resolve instantly from cache instead of
 * waiting for a hidden <video> to load.
 *
 * Usage:
 *   VideoDimensionCache.prewarm(['/path/a.mp4', '/path/b.mp4']);
 *   var dims = VideoDimensionCache.get('/path/a.mp4');
 *   // dims → { width, height, aspect, duration } or null if not ready yet
 */
var VideoDimensionCache = {
  _cache: {},

  /**
   * Start preloading metadata for one or more video srcs.
   * Safe to call multiple times with the same src — only loads once.
   * @param {string|string[]} srcs
   */
  prewarm: function(srcs) {
    var self = this;
    (Array.isArray(srcs) ? srcs : [srcs]).forEach(function(src) {
      if (!src || self._cache[src]) return;  // already loading or done
      self._cache[src] = { state: 'loading' };
      var vid = document.createElement('video');
      vid.preload  = 'metadata';
      vid.muted    = true;
      vid.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;';
      document.body.appendChild(vid);
      function cleanup() { try { document.body.removeChild(vid); } catch(e) {} }
      vid.addEventListener('loadedmetadata', function() {
        var w = vid.videoWidth, h = vid.videoHeight;
        cleanup();
        self._cache[src] = {
          state:    'ready',
          width:    w,
          height:   h,
          aspect:   w && h ? w / h : null,
          duration: vid.duration || null,
        };
        console.log('[VideoDimensionCache] prewarmed:', src, w + 'x' + h);
      });
      vid.addEventListener('error', function() {
        cleanup();
        self._cache[src] = { state: 'error' };
        console.warn('[VideoDimensionCache] failed to load:', src);
      });
      vid.src = src;
      vid.load();
    });
  },

  /**
   * Return cached dimensions or null if not ready yet.
   * @param {string} src
   * @returns {{ width, height, aspect, duration }|null}
   */
  get: function(src) {
    var e = this._cache[src];
    return (e && e.state === 'ready') ? e : null;
  },

  /** Clear all cached entries (e.g. on scenario reload). */
  clear: function() { this._cache = {}; },
};

/**
 * _applyFit(videoW, videoH, wrapperInstance, resolve, reject)
 * Shared resize logic used by resize_ide_to_perfect_fit (both cache-hit and miss paths).
 */
function _applyFit(videoW, videoH, wrapperInstance, resolve, reject, fromCache, fitOptions) {
  if (!videoW || !videoH) {
    return reject(new Error('resize_ide_to_perfect_fit: invalid video dimensions ' + videoW + 'x' + videoH));
  }
  if (!wrapperInstance) {
    return reject(new Error('resize_ide_to_perfect_fit: no wrapperInstance'));
  }

  fitOptions = fitOptions || {};
  var currentScale = wrapperInstance.scale;
  var browserVp    = fitOptions.viewport || document.querySelector('.ide-browser__viewport');
  var browserW     = (browserVp && browserVp.offsetWidth > 0)
    ? browserVp.offsetWidth
    : Math.round(wrapperInstance.nativeW * 0.50);
  if (!browserW) {
    return reject(new Error('resize_ide_to_perfect_fit: could not determine browser viewport width'));
  }

  var chromeH     = fitOptions.chromeH !== undefined ? fitOptions.chromeH : BROWSER_VIDEO_CHROME;
  var videoAspect = videoW / videoH;
  var contentH    = Math.round(browserW / videoAspect);
  var nativeH     = contentH + chromeH;

  wrapperInstance.nativeH = nativeH;
  wrapperInstance.window.style.height = nativeH + 'px';

  var result = {
    nativeW: wrapperInstance.nativeW, nativeH: nativeH,
    scale: currentScale,
    browserW: browserW, contentH: contentH, chromeH: chromeH,
    videoW: videoW, videoH: videoH, videoAspect: videoAspect.toFixed(3),
    fromCache: !!fromCache,
  };
  console.log('[IDE] resize_ide_to_perfect_fit →', result);
  resolve(result);
}

function resize_ide_to_perfect_fit(videoSrc, visiblePanels, wrapperInstance, fitOptions) {
  return new Promise(function(resolve, reject) {
    // ── Cache hit: instant path (no async) ────────────────────────────────
    var cached = VideoDimensionCache.get(videoSrc);
    if (cached) {
      _applyFit(cached.width, cached.height, wrapperInstance, resolve, reject, true, fitOptions);
      return;
    }

    // ── Cache miss: load metadata via hidden video ─────────────────────────
    var vid = document.createElement('video');
    vid.preload  = 'metadata';
    vid.muted    = true;
    vid.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;';
    document.body.appendChild(vid);

    function cleanup() { try { document.body.removeChild(vid); } catch(e) {} }

    vid.addEventListener('loadedmetadata', function() {
      var videoW = vid.videoWidth;
      var videoH = vid.videoHeight;
      cleanup();
      // Store in cache for future calls
      VideoDimensionCache._cache[videoSrc] = {
        state: 'ready', width: videoW, height: videoH,
        aspect: videoW && videoH ? videoW / videoH : null,
        duration: vid.duration || null,
      };
      _applyFit(videoW, videoH, wrapperInstance, resolve, reject, false, fitOptions);
    });

    vid.addEventListener('error', function() {
      cleanup();
      reject(new Error('resize_ide_to_perfect_fit: failed to load video: ' + videoSrc));
    });

    vid.src = videoSrc;
    vid.load();
  });
}

// Export for both module and plain-script usage
if (typeof module !== 'undefined') module.exports = { IDEWindowWrapper, resize_ide_to_perfect_fit };
