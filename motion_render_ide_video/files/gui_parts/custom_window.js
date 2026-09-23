/**
 * IDECustomWindow
 * ─────────────────────────────────────────────────────────────────────────────
 * A floating, draggable, resizable window that matches the Python
 * CustomWindowWidget behaviour — macOS-style traffic-light buttons,
 * custom title bar, translucent background, inner shadow.
 *
 * Designed to wrap viewer_video.js / viewer_image.js / viewer_sound.js
 * (or any arbitrary DOM element) inside a styled floating panel.
 *
 * Features:
 *   • macOS traffic-light close / minimise / maximise buttons
 *   • Draggable title bar
 *   • Resizable edges (6 px grab zone)
 *   • show() / hide() with optional fade
 *   • setPosition(x, y) / setSize(w, h) / setTitle(t)
 *   • autostart — call content.play() when window becomes visible
 *   • recording-safe: exposes .contentEl for capture rect
 *
 * Usage:
 *   var win = new IDECustomWindow({
 *     title:   'Preview',
 *     width:   640,
 *     height:  400,
 *     x:       100,          // initial left (px or '50%')
 *     y:       80,           // initial top
 *     content: myViewerEl,   // DOM element to embed
 *     autostart: true,       // call content.play() on show
 *     hideMinimize: false,
 *     hideMaximize: false,
 *   });
 *   win.mount(document.body);
 *   win.show();
 *
 * Public API:
 *   win.show(duration?)          — fade in (ms, default 250)
 *   win.hide(duration?)          — fade out
 *   win.toggle()                 — show/hide
 *   win.setTitle(str)
 *   win.setPosition(x, y)        — px numbers or CSS strings
 *   win.setSize(w, h)            — px numbers
 *   win.setContent(el)           — replace inner content
 *   win.mount(parent)
 *   win.destroy()
 *   win.el                       — outer wrapper div
 *   win.contentEl                — inner content area (for recording rect)
 */
class IDECustomWindow {
  /**
   * @param {object} opts
   * @param {string}      [opts.title='Window']
   * @param {number}      [opts.width=480]
   * @param {number}      [opts.height=320]
   * @param {number|string} [opts.x=80]
   * @param {number|string} [opts.y=80]
   * @param {HTMLElement} [opts.content]       — element to embed in content area
   * @param {boolean}     [opts.autostart]     — call content.play() on show
   * @param {boolean}     [opts.hideMinimize=false]
   * @param {boolean}     [opts.hideMaximize=false]
   * @param {boolean}     [opts.resizable=true]
   * @param {boolean}     [opts.draggable=true]
   * @param {number}      [opts.minWidth=200]
   * @param {number}      [opts.minHeight=120]
   * @param {function}    [opts.onClose]
   */
  constructor(opts) {
    opts = opts || {};
    this._title       = opts.title       || 'Window';
    this._w           = opts.width       || 480;
    this._h           = opts.height      || 320;
    this._x           = opts.x           !== undefined ? opts.x : 80;
    this._y           = opts.y           !== undefined ? opts.y : 80;
    this._autostart   = opts.autostart   || false;
    this._hideMin     = opts.hideMinimize || false;
    this._hideMax     = opts.hideMaximize || false;
    this._resizable   = opts.resizable   !== false;
    this._draggable   = opts.draggable   !== false;
    this._minW        = opts.minWidth    || 200;
    this._minH        = opts.minHeight   || 120;
    this._onClose     = opts.onClose     || null;
    this._visible     = false;
    this._minimized   = false;
    this._maximized   = false;
    this._savedGeom   = null;   // for restore after maximize
    // sceneSpace: when true the window uses position:absolute and is mounted
    // into wrapper.sceneLayer — it then inherits the camera transform and
    // moves/rotates/scales with the IDE window automatically.
    // x/y are treated as offsets from the CENTER of the scene container.
    // When false (legacy) position:fixed is used and the window is in screen space.
    this._sceneSpace  = opts.sceneSpace !== false;  // default true

    this.el        = null;
    this.contentEl = null;
    this._titleEl  = null;

    this._build();

    if (opts.content) this.setContent(opts.content);
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  _build() {
    IDECustomWindow._ensureStyles();

    var self = this;

    // ── Outer window frame ──────────────────────────────────────────────────
    var win = document.createElement('div');
    win.className = 'ide-cwin';

    // In scene-space mode: position:absolute inside sceneLayer.
    // x/y are offsets from the CENTER of the container (50%/50% anchor).
    // We use left:50% + marginLeft / top:50% + marginTop so the window
    // is positioned relative to the scene center — matching the IDE window origin.
    var posMode = this._sceneSpace ? 'absolute' : 'fixed';
    var leftVal, topVal, extraCss = '';
    if (this._sceneSpace) {
      var xPx = typeof this._x === 'number' ? this._x : parseInt(this._x) || 0;
      var yPx = typeof this._y === 'number' ? this._y : parseInt(this._y) || 0;
      leftVal = '50%';
      topVal  = '50%';
      extraCss = 'margin-left:' + xPx + 'px;margin-top:' + yPx + 'px;';
    } else {
      leftVal = typeof this._x === 'number' ? this._x + 'px' : this._x;
      topVal  = typeof this._y === 'number' ? this._y + 'px' : this._y;
    }

    win.style.cssText = [
      'position:' + posMode,
      'left:' + leftVal,
      'top:'  + topVal,
      'width:'  + this._w + 'px',
      'height:' + this._h + 'px',
      'display:flex',
      'flex-direction:column',
      'overflow:hidden',
      // Python CustomWindowWidget uses border-radius:12px (matches .window in main.css)
      'border-radius:12px',
      'z-index:1000',
      'opacity:0',
      'pointer-events:none',
      'transition:opacity 250ms ease',
      // Outer drop shadow + inner 1px border matching .window { box-shadow: inset 0 0 0 1px ... 7% }
      'box-shadow:0 24px 64px rgba(0,0,0,0.55),inset 0 0 0 1px rgba(255,255,255,0.07)',
      'background:var(--qc-color-bg-primary,#13131f)',
    ].join(';') + ';' + extraCss;
    this.el = win;

    // ── Title bar ───────────────────────────────────────────────────────────
    var titleBar = document.createElement('div');
    titleBar.className = 'ide-cwin__titlebar';
    titleBar.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:6px',
      // LUI custom_window.lui: bar x:8, w:calc(100%-16), h:29
      // We handle the 8px side margins via padding instead of absolute positioning
      'padding:0 10px',
      'height:29px',
      'flex-shrink:0',
      'user-select:none',
      // Python version: transparent bar (no background, no border-bottom)
      'background:transparent',
      'cursor:default',
    ].join(';') + ';';

    // Traffic-light buttons
    var btnClose = this._makeTrafficBtn('close',    '#ff5f57', function() { self._doClose(); });
    var btnMin   = this._makeTrafficBtn('minimize', '#febc2e', function() { self._doMinimize(); });
    var btnMax   = this._makeTrafficBtn('maximize', '#28c840', function() { self._doMaximize(); });

    if (this._hideMin) btnMin.style.display = 'none';
    if (this._hideMax) btnMax.style.display = 'none';

    titleBar.appendChild(btnClose);
    titleBar.appendChild(btnMin);
    titleBar.appendChild(btnMax);

    // Title label
    var titleLbl = document.createElement('div');
    titleLbl.className = 'ide-cwin__title';
    titleLbl.style.cssText = [
      'flex:1',
      'text-align:center',
      // LUI custom_window.lui: titleLabel font-size:9, text-align:center
      'font-size:9px',
      'font-weight:600',
      'letter-spacing:0.06em',
      'color:var(--qc-color-text-secondary,#aaa)',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'padding:0 8px',
      'text-transform:uppercase',
    ].join(';') + ';';
    titleLbl.textContent = this._title;
    this._titleEl = titleLbl;
    titleBar.appendChild(titleLbl);

    // Spacer to balance traffic lights on right
    var spacer = document.createElement('div');
    spacer.style.cssText = 'width:' + (3 * 14 + 2 * 6) + 'px;flex-shrink:0;';
    titleBar.appendChild(spacer);

    // ── Content area ────────────────────────────────────────────────────────
    var content = document.createElement('div');
    content.className = 'ide-cwin__content';
    content.style.cssText = [
      'flex:1',
      'overflow:hidden',
      'position:relative',
      'display:flex',
      'flex-direction:column',
      // LUI custom_window.lui: contentPanel x:8, w:calc(100%-16), h:calc(100%-29-8)
      // → 8px left/right margin, 8px bottom margin
      'margin:0 8px 8px 8px',
      'border-radius:8px',
    ].join(';') + ';';
    this.contentEl = content;

    // ── Inner shadow overlay ─────────────────────────────────────────────────
    var shadow = document.createElement('div');
    shadow.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'border-radius:12px',
      // Inner shadow already on the outer win element; this overlay adds inner glow
      'box-shadow:inset 0 0 2px 0 rgba(255,255,255,0.15)',
      'z-index:100',
    ].join(';') + ';';

    win.appendChild(titleBar);
    win.appendChild(content);
    win.appendChild(shadow);

    // ── Resize handles ───────────────────────────────────────────────────────
    if (this._resizable) this._addResizeHandles(win);

    // ── Drag ─────────────────────────────────────────────────────────────────
    if (this._draggable) this._addDrag(titleBar, win);
  }

  // ── Traffic-light button ───────────────────────────────────────────────────

  _makeTrafficBtn(type, color, onClick) {
    var btn = document.createElement('div');
    btn.className = 'ide-cwin__traffic ide-cwin__traffic--' + type;
    btn.style.cssText = [
      'width:12px',
      'height:12px',
      'min-width:12px',
      'border-radius:50%',
      'background:' + color,
      'cursor:pointer',
      'flex-shrink:0',
      'transition:filter 0.15s',
    ].join(';') + ';';
    btn.addEventListener('mouseenter', function() { btn.style.filter = 'brightness(1.2)'; });
    btn.addEventListener('mouseleave', function() { btn.style.filter = ''; });
    btn.addEventListener('click', function(e) { e.stopPropagation(); onClick(); });
    return btn;
  }

  // ── Drag ───────────────────────────────────────────────────────────────────

  _addDrag(handle, win) {
    var self = this;
    var startX, startY, startL, startT;

    handle.style.cursor = 'grab';

    handle.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      if (self._maximized) return;
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startL = parseInt(win.style.left)  || 0;
      startT = parseInt(win.style.top)   || 0;
      handle.style.cursor = 'grabbing';

      function onMove(e) {
        win.style.left = (startL + e.clientX - startX) + 'px';
        win.style.top  = (startT + e.clientY - startY) + 'px';
      }
      function onUp() {
        handle.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ── Resize handles ─────────────────────────────────────────────────────────

  _addResizeHandles(win) {
    var self = this;
    var ZONE = 6;
    var edges = [
      { cursor: 'n-resize',  top: 0,    left: ZONE, right: ZONE, height: ZONE, dx: 0, dy: -1, dw: 0,  dh: 1  },
      { cursor: 's-resize',  bottom: 0, left: ZONE, right: ZONE, height: ZONE, dx: 0, dy: 0,  dw: 0,  dh: 1  },
      { cursor: 'w-resize',  top: ZONE, bottom: ZONE, left: 0, width: ZONE,    dx: -1, dy: 0, dw: 1,  dh: 0  },
      { cursor: 'e-resize',  top: ZONE, bottom: ZONE, right: 0, width: ZONE,   dx: 0,  dy: 0, dw: 1,  dh: 0  },
      { cursor: 'nw-resize', top: 0, left: 0, width: ZONE, height: ZONE,       dx: -1, dy: -1, dw: 1, dh: 1  },
      { cursor: 'ne-resize', top: 0, right: 0, width: ZONE, height: ZONE,      dx: 0,  dy: -1, dw: 1, dh: 1  },
      { cursor: 'sw-resize', bottom: 0, left: 0, width: ZONE, height: ZONE,    dx: -1, dy: 0,  dw: 1, dh: 1  },
      { cursor: 'se-resize', bottom: 0, right: 0, width: ZONE, height: ZONE,   dx: 0,  dy: 0,  dw: 1, dh: 1  },
    ];

    edges.forEach(function(e) {
      var h = document.createElement('div');
      h.style.cssText = 'position:absolute;z-index:200;cursor:' + e.cursor + ';';
      if (e.top    !== undefined) h.style.top    = e.top    + 'px';
      if (e.bottom !== undefined) h.style.bottom = e.bottom + 'px';
      if (e.left   !== undefined) h.style.left   = e.left   + 'px';
      if (e.right  !== undefined) h.style.right  = e.right  + 'px';
      if (e.width  !== undefined) h.style.width  = e.width  + 'px';
      if (e.height !== undefined) h.style.height = e.height + 'px';
      if (!e.width  && e.left !== undefined && e.right !== undefined) h.style.width  = 'auto';
      if (!e.height && e.top  !== undefined && e.bottom !== undefined) h.style.height = 'auto';

      h.addEventListener('mousedown', function(ev) {
        if (ev.button !== 0) return;
        if (self._maximized) return;
        ev.preventDefault();
        ev.stopPropagation();
        var sx = ev.clientX, sy = ev.clientY;
        var sl = parseInt(win.style.left) || 0;
        var st = parseInt(win.style.top)  || 0;
        var sw = win.offsetWidth;
        var sh = win.offsetHeight;

        function onMove(ev) {
          var dx = ev.clientX - sx;
          var dy = ev.clientY - sy;
          var nw = Math.max(self._minW, sw + dx * e.dw);
          var nh = Math.max(self._minH, sh + dy * e.dh);
          var nl = sl + (e.dx < 0 ? Math.min(dx, sw - self._minW) : 0);
          var nt = st + (e.dy < 0 ? Math.min(dy, sh - self._minH) : 0);
          win.style.width  = nw + 'px';
          win.style.height = nh + 'px';
          if (e.dx < 0) win.style.left = nl + 'px';
          if (e.dy < 0) win.style.top  = nt + 'px';
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup',   onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
      });

      win.appendChild(h);
    });
  }

  // ── Traffic-light actions ──────────────────────────────────────────────────

  _doClose() {
    if (this._onClose) { this._onClose(this); return; }
    this.hide(200, function() { /* keep in DOM, just hidden */ });
  }

  _doMinimize() {
    if (this._minimized) {
      // Restore
      this.el.style.height = this._savedMinH || (this._h + 'px');
      this._minimized = false;
    } else {
      this._savedMinH = this.el.style.height;
      this.el.style.height = '32px';   // just title bar
      this._minimized = true;
    }
  }

  _doMaximize() {
    if (this._maximized) {
      // Restore
      var g = this._savedGeom;
      if (g) {
        this.el.style.left   = g.left;
        this.el.style.top    = g.top;
        this.el.style.width  = g.width;
        this.el.style.height = g.height;
      }
      this._maximized = false;
    } else {
      this._savedGeom = {
        left:   this.el.style.left,
        top:    this.el.style.top,
        width:  this.el.style.width,
        height: this.el.style.height,
      };
      this.el.style.left   = '0';
      this.el.style.top    = '0';
      this.el.style.width  = '100vw';
      this.el.style.height = '100vh';
      this._maximized = true;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Mount into a parent element. */
  mount(parent) {
    parent.appendChild(this.el);
    return this;
  }

  /** Remove from DOM entirely. */
  destroy() {
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    return this;
  }

  /**
   * Show the window with optional fade.
   * @param {number}   [duration=250]  — fade-in ms (0 = instant)
   * @param {function} [onDone]
   */
  show(duration, onDone) {
    var self = this;
    duration = duration !== undefined ? duration : 250;
    this._visible = true;
    this.el.style.pointerEvents = 'auto';
    // Clear visibility:hidden that may have been set during pre-warm
    // (we use visibility:hidden during pre-warm to keep decode pipeline active)
    this.el.style.visibility = '';

    if (duration > 0) {
      this.el.style.transition = 'opacity ' + duration + 'ms ease';
    } else {
      this.el.style.transition = 'none';
    }
    // Force reflow
    void this.el.offsetWidth;
    this.el.style.opacity = '1';

    if (this._autostart) {
      var inner = this.contentEl.firstElementChild;
      if (inner && typeof inner.play === 'function') inner.play();
    }

    if (onDone) setTimeout(onDone, duration);
    return this;
  }

  /**
   * Hide the window with optional fade.
   * @param {number}   [duration=250]
   * @param {function} [onDone]
   */
  hide(duration, onDone) {
    var self = this;
    duration = duration !== undefined ? duration : 250;
    this._visible = false;

    // Auto-stop any media playing inside the window when it's hidden
    this._stopInnerMedia();

    if (duration > 0) {
      this.el.style.transition = 'opacity ' + duration + 'ms ease';
    } else {
      this.el.style.transition = 'none';
    }
    void this.el.offsetWidth;
    this.el.style.opacity = '0';

    setTimeout(function() {
      self.el.style.pointerEvents = 'none';
      if (onDone) onDone();
    }, duration);
    return this;
  }

  /**
   * Pause/stop any media players inside the content area.
   * Handles: IDEViewerSound/IDEViewerVideo (via .pause()), HTML5 <audio>/<video>,
   * and QC.media.SoundPlayer / VideoPlayer bridge players.
   */
  _stopInnerMedia() {
    if (!this.contentEl) return;

    // 1. Find all HTML5 audio/video elements and pause them
    var mediaEls = this.contentEl.querySelectorAll('audio, video');
    for (var i = 0; i < mediaEls.length; i++) {
      try { mediaEls[i].pause(); } catch(e) {}
    }

    // 2. If the direct child element has a .pause() method (IDEViewerSound/Video)
    var inner = this.contentEl.firstElementChild;
    if (inner && typeof inner.pause === 'function') {
      try { inner.pause(); } catch(e) {}
    }

    // 3. Walk content children for viewer instances stored on elements
    var children = this.contentEl.children;
    for (var j = 0; j < children.length; j++) {
      var el = children[j];
      if (el._viewer && typeof el._viewer.pause === 'function') {
        try { el._viewer.pause(); } catch(e) {}
      }
    }
  }

  /** Toggle show/hide. */
  toggle(duration) {
    return this._visible ? this.hide(duration) : this.show(duration);
  }

  /** Update title bar text. */
  setTitle(title) {
    this._title = title;
    if (this._titleEl) this._titleEl.textContent = title.toUpperCase();
    return this;
  }

  /**
   * Move window to position.
   * @param {number|string} x  — px number or CSS string ('50%')
   * @param {number|string} y
   */
  setPosition(x, y) {
    if (this._sceneSpace) {
      // Scene-space: left/top stay at 50%; offset via margin
      if (x !== undefined) this.el.style.marginLeft = (typeof x === 'number' ? x : parseInt(x) || 0) + 'px';
      if (y !== undefined) this.el.style.marginTop  = (typeof y === 'number' ? y : parseInt(y) || 0) + 'px';
    } else {
      if (x !== undefined) this.el.style.left = typeof x === 'number' ? x + 'px' : x;
      if (y !== undefined) this.el.style.top  = typeof y === 'number' ? y + 'px' : y;
    }
    return this;
  }

  /**
   * Resize window.
   * @param {number} w
   * @param {number} h
   */
  setSize(w, h) {
    if (w) { this._w = w; this.el.style.width  = w + 'px'; }
    if (h) { this._h = h; this.el.style.height = h + 'px'; }
    return this;
  }

  /**
   * Replace the content element.
   * @param {HTMLElement} el
   */
  setContent(el) {
    if (!this.contentEl) return this;
    this.contentEl.innerHTML = '';
    el.style.width  = el.style.width  || '100%';
    el.style.height = el.style.height || '100%';
    this.contentEl.appendChild(el);
    return this;
  }

  /** True if currently visible. */
  get isVisible() { return this._visible; }

  // ── Static helpers ─────────────────────────────────────────────────────────

  /**
   * Convenience factory — create + mount + show a window wrapping any element.
   *
   * @param {HTMLElement} contentEl
   * @param {object}      opts       — same as constructor opts
   * @param {HTMLElement} [parent=document.body]
   * @returns {IDECustomWindow}
   */
  static wrap(contentEl, opts, parent) {
    opts = opts || {};
    opts.content = contentEl;
    var win = new IDECustomWindow(opts);
    win.mount(parent || document.body);
    return win;
  }

  static _ensureStyles() {
    if (document.getElementById('_ide-cwin-styles')) return;
    var st = document.createElement('style');
    st.id = '_ide-cwin-styles';
    st.textContent = [
      '.ide-cwin { font-family: var(--qc-font-family, system-ui, sans-serif); }',
      '.ide-cwin__titlebar:active { cursor: grabbing; }',
    ].join('\n');
    document.head.appendChild(st);
  }
}

if (typeof module !== 'undefined') module.exports = { IDECustomWindow };
