/**
 * IDEViewerVideo
 * ─────────────────────────────────────────────────────────────────────────────
 * Video viewer for scenario-driven IDE emulation.
 *
 * Three rendering modes:
 *   'bridge'   — uses QC.media.VideoPlayer (bridge-styled player with controls,
 *                filename, progress bar).  Falls back to 'embedded' if
 *                QC.media.VideoPlayer is not available.
 *   'embedded' — plain HTML5 <video> element with optional native controls.
 *   'fake'     — raw <video> that fills the entire window with no controls,
 *                no player chrome.  Use this when the window is meant to look
 *                like an app showing content (not a media player).
 *                autoplay + muted + loop are forced on; controls are hidden.
 *
 * Optionally wrapped in IDECustomWindow (custom_window.js) for a floating
 * panel with title bar, drag, resize, show/hide controls.
 *
 * Usage (standalone):
 *   var viewer = new IDEViewerVideo({
 *     src:      '/.temp/recordings/demo.mp4',
 *     mode:     'bridge',      // 'bridge' | 'embedded' (default: 'bridge')
 *     autoplay: true,
 *     loop:     true,
 *     muted:    true,
 *     controls: true,
 *     fit:      'contain',     // 'contain' | 'cover' | 'fill'
 *   });
 *   viewer.mount(document.getElementById('player-root'));
 *   viewer.play();
 *
 * Usage (wrapped in floating window):
 *   var viewer = new IDEViewerVideo({ src: '/demo.mp4', autoplay: true });
 *   var win = viewer.openInWindow({
 *     title:  'Demo Video',
 *     width:  720,
 *     height: 440,
 *     x: 120, y: 80,
 *   });
 *   win.mount(document.body);
 *   win.show();
 *
 * Public API:
 *   viewer.mount(parent)
 *   viewer.play()              → Promise<boolean>
 *   viewer.pause()
 *   viewer.seek(seconds)
 *   viewer.setVolume(0..1)
 *   viewer.setSource(src)
 *   viewer.destroy()
 *   viewer.openInWindow(winOpts)  → IDECustomWindow
 *   viewer.el                  — root element (for recording rect)
 */
class IDEViewerVideo {
  /**
   * @param {object} opts
   * @param {string}  [opts.src]              — video URL / path
   * @param {string}  [opts.mode='bridge']    — 'bridge' | 'embedded' | 'fake'
   * @param {boolean} [opts.autoplay=false]
   * @param {boolean} [opts.loop=false]
   * @param {boolean} [opts.muted=true]
   * @param {boolean} [opts.controls=true]
   * @param {string}  [opts.fit='contain']    — object-fit for embedded mode
   * @param {number}  [opts.volume=0.8]
   * @param {string}  [opts.name]             — display name (bridge mode)
   * @param {string}  [opts.variant='default'] — bridge player variant
   * @param {function} [opts.onReady]
   * @param {function} [opts.onEnded]
   */
  constructor(opts) {
    opts = opts || {};
    this._src      = opts.src      || '';
    this._mode     = opts.mode     || 'bridge';
    this._autoplay = opts.autoplay !== undefined ? opts.autoplay : false;
    this._loop     = opts.loop     || false;
    this._muted    = opts.muted    !== false;
    this._controls = opts.controls !== false;
    this._fit      = opts.fit      || 'contain';
    this._volume   = opts.volume   !== undefined ? opts.volume : 0.8;
    this._name     = opts.name     || this._nameFromSrc(opts.src || '');
    this._variant  = opts.variant  || 'default';
    this._onReady  = opts.onReady  || null;
    this._onEnded  = opts.onEnded  || null;

    this.el        = null;   // root element
    this._player   = null;   // QC.media.VideoPlayer instance (bridge mode)
    this._videoEl  = null;   // <video> element (embedded mode)
    this._mounted  = false;
  }

  // ── Mount ──────────────────────────────────────────────────────────────────

  /**
   * Mount the viewer into a parent element.
   * Chooses bridge or embedded mode based on availability.
   * @param {HTMLElement} parent
   */
  mount(parent) {
    if (this._mounted) return this;
    this._mounted = true;

    // Decide mode
    if (this._mode === 'fake') {
      this._mountFake(parent);
    } else {
      var useBridge = (this._mode === 'bridge') &&
                      typeof window !== 'undefined' &&
                      window.QC && window.QC.media && window.QC.media.VideoPlayer;
      if (useBridge) {
        this._mountBridge(parent);
      } else {
        this._mountEmbedded(parent);
      }
    }

    return this;
  }

  // ── Bridge mode ────────────────────────────────────────────────────────────

  _mountBridge(parent) {
    var self = this;

    // Root wrapper — fills parent
    var root = document.createElement('div');
    root._viewer = this;  // allow IDECustomWindow._stopInnerMedia to find us
    root.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;';
    this.el = root;
    parent.appendChild(root);

    this._player = new window.QC.media.VideoPlayer({
      root:    root,
      src:     this._src,
      name:    this._name,
      volume:  this._volume,
      variant: this._variant,
    });

    // Wire callbacks via video element events
    var vp = this._player;
    if (vp.video) {
      if (this._onReady) vp.video.addEventListener('canplay', function() { self._onReady(self); }, { once: true });
      if (this._onEnded) vp.video.addEventListener('ended',   function() { self._onEnded(self); });
      if (this._loop)    vp.video.loop    = true;
      if (this._muted)   vp.video.muted   = true;
      vp.video.controls = this._controls;
    }

    if (this._autoplay && this._src) {
      // Small delay to let bridge player finish rendering
      setTimeout(function() { self.play(); }, 80);
    }
  }

  // ── Fake mode — raw video, no controls, fills window ──────────────────────

  /**
   * 'fake' mode: video fills the entire content area with no player chrome.
   * Looks like an app window showing content, not a media player.
   * Controls are always hidden; autoplay + muted + loop are forced on.
   */
  _mountFake(parent) {
    var self = this;

    var root = document.createElement('div');
    root._viewer = this;
    root.style.cssText = [
      'width:100%', 'height:100%',
      'background:#000',
      'overflow:hidden',
      'position:relative',
      'display:flex',
      'align-items:center',
      'justify-content:center',
    ].join(';') + ';';
    this.el = root;
    parent.appendChild(root);

    if (!this._src) { this._showEmpty(root); return; }

    var video = document.createElement('video');
    video.style.cssText = [
      'width:100%', 'height:100%',
      'object-fit:' + this._fit,
      'display:block',
      'pointer-events:none',   // no interaction — it's decorative
    ].join(';') + ';';
    video.src        = this._src;
    video.autoplay   = true;   // always autoplay in fake mode
    video.loop       = true;   // always loop
    video.muted      = true;   // always muted (required for autoplay)
    video.controls   = false;  // never show controls
    video.playsInline = true;
    video.preload    = 'auto';

    if (this._onReady) video.addEventListener('canplay', function() { self._onReady(self); }, { once: true });
    if (this._onEnded) video.addEventListener('ended',   function() { self._onEnded(self); });
    // No error handler — slow-loading videos show black briefly then play fine.
    // Showing an error overlay that persists after playback starts is worse than silence.

    root.appendChild(video);
    this._videoEl = video;

    // Kick off play (browsers may need a gesture, but muted autoplay usually works)
    video.play().catch(function() {});
  }

  // ── Embedded mode ──────────────────────────────────────────────────────────

  _mountEmbedded(parent) {
    var self = this;

    var root = document.createElement('div');
    root._viewer = this;  // allow IDECustomWindow._stopInnerMedia to find us
    root.style.cssText = [
      'width:100%', 'height:100%',
      'background:#000',
      'display:flex', 'align-items:center', 'justify-content:center',
      'overflow:hidden', 'position:relative',
    ].join(';') + ';';
    this.el = root;
    parent.appendChild(root);

    var video = document.createElement('video');
    video.style.cssText = [
      'width:100%', 'height:100%',
      'object-fit:' + this._fit,
      'display:block',
    ].join(';') + ';';
    video.src       = this._src;
    video.autoplay  = this._autoplay;
    video.loop      = this._loop;
    video.muted     = this._muted;
    video.controls  = this._controls;
    video.volume    = this._volume;
    video.playsInline = true;
    video.preload   = 'metadata';

    if (this._onReady) video.addEventListener('canplay', function() { self._onReady(self); }, { once: true });
    if (this._onEnded) video.addEventListener('ended',   function() { self._onEnded(self); });
    // No error handler — slow-loading local videos fire 'error' transiently then play fine.

    root.appendChild(video);
    this._videoEl = video;

    // No-source placeholder
    if (!this._src) this._showEmpty(root);
  }

  _showEmpty(root) {
    var ph = document.createElement('div');
    ph.style.cssText = [
      'position:absolute', 'inset:0',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'gap:10px',
      'color:var(--qc-color-text-info,#555)',
      'font-size:12px', 'pointer-events:none',
    ].join(';') + ';';
    var ico = document.createElement('span');
    ico.className = 'icon';
    ico.style.cssText = 'width:32px;height:32px;min-width:32px;--icon:url(\'/_ide/images/icons/coolicons/Media/Video_Camera.png\');opacity:0.18;';
    ph.appendChild(ico);
    ph.appendChild(document.createTextNode('No content yet'));
    root.appendChild(ph);
  }

  _showError(root) {
    var msg = document.createElement('div');
    msg.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--qc-color-text-info,#555);font-size:12px;';
    msg.textContent = 'Cannot load video';
    root.appendChild(msg);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Start playback. Returns Promise<boolean>. */
  play() {
    if (this._player) return this._player.play();
    if (this._videoEl) return this._videoEl.play().then(function() { return true; }).catch(function() { return false; });
    return Promise.resolve(false);
  }

  /** Pause playback. */
  pause() {
    if (this._player) this._player.pause();
    else if (this._videoEl) this._videoEl.pause();
    return this;
  }

  /** Seek to seconds. */
  seek(seconds) {
    if (this._player) this._player.seek(seconds);
    else if (this._videoEl) this._videoEl.currentTime = seconds;
    return this;
  }

  /** Set volume 0..1. */
  setVolume(v) {
    if (this._player) this._player.setVolume(v);
    else if (this._videoEl) this._videoEl.volume = Math.min(1, Math.max(0, v));
    return this;
  }

  /**
   * Change video source.
   * @param {string} src
   * @param {string} [name]
   */
  setSource(src, name) {
    this._src  = src;
    this._name = name || this._nameFromSrc(src);
    if (this._player) this._player.setSource(src, this._name);
    else if (this._videoEl) {
      this._videoEl.src = src;
      this._videoEl.load();
    }
    return this;
  }

  /** Destroy and remove from DOM. */
  destroy() {
    if (this._player) this._player.destroy();
    else if (this._videoEl) {
      this._videoEl.pause();
      this._videoEl.removeAttribute('src');
      this._videoEl.load();
    }
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    return this;
  }

  /**
   * Wrap this viewer in an IDECustomWindow floating panel.
   * Mounts the viewer into the window's content area.
   *
   * @param {object} winOpts  — IDECustomWindow constructor options
   *   title, width, height, x, y, hideMinimize, hideMaximize, resizable, ...
   * @returns {IDECustomWindow}
   */
  openInWindow(winOpts) {
    winOpts = winOpts || {};
    winOpts.title     = winOpts.title     || this._name || 'Video';
    winOpts.width     = winOpts.width     || 640;
    winOpts.height    = winOpts.height    || 400;
    winOpts.autostart = winOpts.autostart !== undefined ? winOpts.autostart : this._autoplay;

    var win = new IDECustomWindow(winOpts);

    // Mount viewer into window content area
    this.mount(win.contentEl);

    return win;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _nameFromSrc(src) {
    if (!src) return '';
    return src.split('/').pop().split('?')[0] || src;
  }
}

if (typeof module !== 'undefined') module.exports = { IDEViewerVideo };
