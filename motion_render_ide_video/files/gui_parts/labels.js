/**
 * IDELabels — floating text label overlay for IDE emulation videos
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Each label has a `space` property that controls how it is positioned:
 *
 *   space: 'viewport'  (default)
 *     — Label lives inside #vpCapture (the camera recording frame div).
 *     — x/y are recording-frame-relative CSS values ('50%', '10%', '200px', …).
 *     — Font sizes use clamp()/cqw so they scale with the recording frame size.
 *     — NOT affected by camera 3D rotation/zoom — always flat over the frame.
 *     — IS captured in recordings (inside the recording rect).
 *     — Use for: hero captions, step tags, HUD-style overlays.
 *
 *   space: 'scene'
 *     — Label lives inside the IDE window element (win.window) which carries
 *       all 3D camera transforms (scale, rotateX/Y/Z, translateX/Y).
 *     — x/y are in native IDE coordinates: 0–nativeW × 0–nativeH (default 1440×900).
 *       e.g. x: 720, y: 450 → center of the IDE window.
 *     — Font sizes are fixed px (scene is already scaled by the camera).
 *     — IS affected by camera zoom, rotation, and pan — moves with the scene.
 *     — Use for: labels that should appear "inside" the IDE, attached to UI elements.
 *
 * Usage:
 *   const labels = new IDELabels();
 *   labels.mount(document.body, win);   // win = IDEWindowWrapper instance
 *
 *   // Viewport label (default):
 *   labels.add({ id: 'hero', text: 'Where *imagination* meets execution',
 *                style: 'caption', x: '50%', y: '10%', anchor: 'center',
 *                space: 'viewport', animIn: 'rise', duration: 400, visible: true });
 *
 *   // Scene label (inside IDE, affected by 3D camera):
 *   labels.add({ id: 'tag', text: '*New feature* added',
 *                style: 'subcaption', x: 720, y: 820, anchor: 'center',
 *                space: 'scene', animIn: 'rise', duration: 400, visible: true });
 *
 *   labels.setText('hero', 'Build *anything*. Ship *everything*.');
 *   labels.setPosition('hero', '50%', '20%');   // viewport: CSS strings
 *   labels.setPosition('tag',  720,   820);      // scene: native px numbers
 *   labels.show('hero');
 *   labels.hide('hero');
 *   labels.remove('hero');
 *   labels.clear();
 *
 * Scenario YAML:
 *   type: label_show
 *   id: hero
 *   space: viewport        # 'viewport' (default) | 'scene'
 *   x: '50%'              # viewport: CSS string | scene: native px number
 *   y: '10%'
 *   ...
 */
class IDELabels {
  constructor() {
    this._overlay      = null;   // fixed full-screen div (viewport labels)
    this._sceneOverlay = null;   // absolute div inside win.window (scene labels)
    this._labels       = {};     // id → { el, opts, space }
    this._win          = null;   // IDEWindowWrapper instance (for scene labels)
  }

  // ── Mount ──────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement}       parent  — usually document.body (used as fallback only)
   * @param {IDEWindowWrapper}  [win]   — required for scene-relative labels
   */
  mount(parent, win) {
    this._injectStyles();
    this._win = win || null;
    this._parent = parent || document.body;

    // ── Viewport overlay — fixed div SIBLING of #vpCapture ───────────────────
    // We do NOT put it inside #vpCapture because vpCapture is display:none in
    // 'free' viewport mode (and during title cards when IDE is hidden).
    // Instead we mirror vpCapture's position/size via _syncOverlayBounds() so
    // labels are always visible and correctly positioned over the recording frame.
    // z-index 49 = above vpCapture (z-index:48) but below vpDecor (z-index:50).
    this._overlay = document.createElement('div');
    this._overlay.id = 'ide-labels-overlay';
    this._overlay.style.cssText = [
      'position:fixed',
      'z-index:49',
      'pointer-events:none',
      'overflow:hidden',
      // Start hidden — _syncOverlayBounds() will set real bounds once vpCapture exists
      'display:none',
    ].join(';');
    this._parent.appendChild(this._overlay);

    // Sync bounds now (if vpCapture already exists) and on every resize
    this._syncOverlayBounds();
    var self = this;
    window.addEventListener('resize', function() { self._syncOverlayBounds(); });

    // Also poll briefly after mount in case camera.js creates vpCapture after us
    var attempts = 0;
    var poll = setInterval(function() {
      self._syncOverlayBounds();
      if (++attempts > 20) clearInterval(poll);
    }, 100);

    // ── Scene overlay — absolute inside win.window, inherits 3D transform ────
    // Created lazily in _getSceneOverlay() when first scene label is added.
  }

  /**
   * Sync the viewport overlay position/size to match #vpCapture exactly.
   * Called on resize and periodically after mount.
   * When vpCapture is display:none (free mode / title card), we keep the
   * overlay at the last known bounds so labels remain visible.
   */
  _syncOverlayBounds() {
    var vpCapture = document.getElementById('vpCapture');
    if (!vpCapture) return;

    // Read bounds from vpCapture's inline style (set by camera.js _applyViewport)
    var left   = vpCapture.style.left;
    var top    = vpCapture.style.top;
    var width  = vpCapture.style.width;
    var height = vpCapture.style.height;

    if (!left || !width) {
      // vpCapture not yet positioned (free mode never set bounds) — use full page
      var winW = window.innerWidth;
      var winH = window.innerHeight;
      left   = '0px';
      top    = '0px';
      width  = winW + 'px';
      height = winH + 'px';
    }

    this._overlay.style.left   = left;
    this._overlay.style.top    = top;
    this._overlay.style.width  = width;
    this._overlay.style.height = height;
    this._overlay.style.display = 'block';
  }

  /** Ensure viewport overlay bounds are up to date (called before adding labels). */
  _ensureViewportOverlayMounted() {
    this._syncOverlayBounds();
  }

  /** Lazy-create the scene overlay inside win.window. */
  _getSceneOverlay() {
    if (this._sceneOverlay) return this._sceneOverlay;
    var winEl = this._win ? this._win.window : null;
    if (!winEl) {
      console.warn('[IDELabels] scene labels require win (IDEWindowWrapper) passed to mount()');
      return this._overlay; // fallback to viewport overlay
    }
    this._sceneOverlay = document.createElement('div');
    this._sceneOverlay.id = 'ide-labels-scene';
    this._sceneOverlay.style.cssText = [
      'position:absolute',
      'inset:0',
      'z-index:500',          // above all IDE content, below nothing (no fixed layers here)
      'pointer-events:none',
      'overflow:hidden',
    ].join(';');
    winEl.appendChild(this._sceneOverlay);
    return this._sceneOverlay;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Add a label (hidden by default unless opts.visible = true).
   * @param {object} opts
   *   id        {string}  — unique id
   *   text      {string}  — text, *word* → gradient emphasis  (mutually exclusive with image)
   *   image     {string}  — path/URL to image file            (mutually exclusive with text)
   *   width     {string}  — CSS width for image  (default 'auto')
   *   height    {string}  — CSS height for image (default 'auto')
   *   style     {string}  — 'caption' | 'subcaption' (ignored for image labels)
   *   x         {string}  — CSS left  (default '50%')
   *   y         {string}  — CSS top   (default '50%')
   *   anchor    {string}  — 'center' | 'left' | 'right'
   *   animIn    {string}           — 'fade' | 'rise' | 'drop' | 'scale' | 'none'
   *   animOut   {string}           — same options
   *   duration  {number}           — transition ms (default 400)
   *   visible   {boolean}          — show immediately (default false)
   *   bg        {boolean|string}   — semi-transparent background rect:
   *                                   true            → default rgba(0,0,0,0.55)
   *                                   'rgba(0,0,0,0.4)' → custom color/opacity
   *   bg_radius {string}           — border-radius (default '8px')
   *   bg_padding {string}          — padding inside rect (default '6px 16px')
   *
   *   final_position / move_to  {object}  — optional target position after anim_in completes.
   *     Smoothly moves the label from its initial x/y to the final position.
   *     viewport: { x: '10%', y: '5%' }   (CSS strings)
   *     scene:    { x: 100,   y: 50  }     (native IDE px numbers)
   *     move_duration {number}  — move animation ms (default 800)
   *     move_easing   {string}  — CSS easing (default 'cubic-bezier(0.22,1,0.36,1)')
   */
  add(opts) {
    if (!this._overlay) { console.warn('[IDELabels] call mount() first'); return; }
    var id    = opts.id    || ('lbl_' + Date.now());
    var space = opts.space || 'viewport';   // 'viewport' | 'scene'
    if (this._labels[id]) this.remove(id);

    if (space !== 'scene') this._ensureViewportOverlayMounted();
    var container = (space === 'scene') ? this._getSceneOverlay() : this._overlay;

    var el = document.createElement('div');
    var isImage = !!opts.image;
    el.className = 'ide-label' +
                   (isImage ? ' ide-label--image' : ' ide-label--' + (opts.style || 'caption')) +
                   ' ide-label--' + space;
    el.style.cssText = this._positionCss(opts, space);
    // Apply scale multiplier (1.0 = default reduced size, 1.5 = back to original, etc.)
    if (opts.scale !== undefined && opts.scale !== 1) {
      el.style.setProperty('--lbl-scale', opts.scale);
    }

    // ── Background rect (optional) ────────────────────────────────────────────
    if (opts.bg) {
      var bgColor   = (opts.bg === true) ? 'rgba(0,0,0,0.55)' : opts.bg;
      var bgRadius  = opts.bg_radius  || '8px';
      var bgPadding = opts.bg_padding || '6px 16px';
      el.style.background    = bgColor;
      el.style.borderRadius  = bgRadius;
      el.style.padding       = bgPadding;
      el.style.boxSizing     = 'border-box';
      // For centered viewport labels: shrink to content width so bg hugs the text
      if (!isImage && (opts.anchor || 'center') === 'center' && space !== 'scene') {
        if (!opts.width) el.style.width = 'auto';   // only shrink-to-content when no explicit width
        el.style.marginLeft = '0';
        el.style.left       = '50%';
        el.style.transform  = 'translateX(-50%)';
      }
    }

    // Render image or text
    if (isImage) {
      var img = document.createElement('img');
      img.src = opts.image;
      img.draggable = false;
      img.style.cssText = [
        'display:block',
        'width:'  + (opts.width  || 'auto'),
        'height:' + (opts.height || 'auto'),
        'max-width:100%',
        'object-fit:contain',
        'pointer-events:none',
        'user-select:none',
      ].join(';');
      el.appendChild(img);
    } else {
      // Render text with *emphasis* → gradient span
      el.innerHTML = this._renderText(opts.text || '');
    }

    // Start hidden
    var animIn = opts.animIn || 'rise';
    el.style.opacity    = '0';
    el.style.transform  = this._getHiddenTransformFull(opts, animIn);
    el.style.filter     = (animIn === 'blur') ? 'blur(12px)' : '';
    el.style.transition = 'none';

    container.appendChild(el);
    this._labels[id] = { el: el, opts: Object.assign({}, opts), space: space };

    // ── Autosize right-anchor text labels ─────────────────────────────────────
    // Left-aligned labels expand naturally (width:auto, no translateX constraint).
    // Right-aligned labels use translateX(-100%) which causes the browser to
    // constrain available width to the space between `left` and the container
    // right edge — producing short wrapped lines.
    //
    // Fix: if no explicit width was set, measure the label's natural single-line
    // width by temporarily rendering it off-screen with no width constraint,
    // then lock that width in so it behaves identically to a left-aligned label.
    if (!isImage && (opts.anchor || 'center') === 'right' && !opts.width) {
      // Prevent wrapping immediately — measurement will confirm/lock the width
      el.style.whiteSpace = 'nowrap';
      // Measure natural single-line width and lock it in so the label never wraps.
      // Strategy: clone off-screen with white-space:nowrap, measure scrollWidth,
      // set that as explicit width on the real element.
      // Double-rAF ensures Lexend font is applied before measuring (avoids
      // measuring with fallback font then re-rendering with wider Lexend glyphs).
      var _measureAndLock = function() {
        var probe = el.cloneNode(true);
        probe.style.cssText = [
          'position:fixed',
          'top:-9999px',
          'left:-9999px',
          'width:auto',
          'max-width:none',
          'white-space:nowrap',    // single line → true content width
          'box-sizing:content-box',// measure content only, padding added separately
          'transform:none',
          'opacity:0',
          'pointer-events:none',
          'visibility:hidden',
        ].join(';');
        document.body.appendChild(probe);
        // scrollWidth = content width without padding (content-box)
        // Add padding from the real element so final width = content + padding
        var computedPad = window.getComputedStyle(el);
        var padH = parseFloat(computedPad.paddingLeft || 0) + parseFloat(computedPad.paddingRight || 0);
        var contentW = Math.ceil(probe.scrollWidth) + 2; // +2px sub-pixel buffer
        var naturalW  = contentW + padH;
        document.body.removeChild(probe);
        if (naturalW > 2) {
          // Cap to viewport width using dynamic edge distance as margin.
          // For right-anchor: x is distance from RIGHT edge → maxW = x position in px.
          // For left-anchor:  x is distance from LEFT edge  → maxW = vpW - x position in px.
          var container = el.parentElement;
          var vpW = container ? container.offsetWidth : window.innerWidth;
          var anchor = opts.anchor || 'center';
          var xVal = opts.x || '0';
          // Resolve x to px relative to vpW
          var xPx = (typeof xVal === 'string' && xVal.endsWith('%'))
            ? (parseFloat(xVal) / 100) * vpW
            : parseFloat(xVal) || 0;
          var edgeDistance, maxAllowed;
          if (anchor === 'right') {
            // x is the position of the right edge from the left
            // edge distance from right = vpW - xPx
            // subtract same distance from left side too → vpW - 2*(vpW-xPx)
            edgeDistance = vpW - xPx;
            maxAllowed = vpW - 2 * edgeDistance;
          } else {
            // anchor === 'left': x is the left edge position
            // edge distance from left = xPx
            // subtract same distance from right side too → vpW - 2*xPx
            edgeDistance = xPx;
            maxAllowed = vpW - 2 * edgeDistance;
          }
          var finalW = Math.min(naturalW, maxAllowed);
          el.style.width      = finalW + 'px';
          el.style.maxWidth   = '';            // clear 80vw cap — exact width is set
          el.style.boxSizing  = 'border-box';  // width includes padding
          // Only keep nowrap if text fits; otherwise allow wrapping within capped width
          if (finalW >= naturalW) {
            el.style.whiteSpace = 'nowrap';
          } else {
            el.style.whiteSpace = 'pre-line';  // capped — allow wrap within safe width
          }
        }
      };
      // Wait for fonts then double-rAF to ensure layout is stable
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(function() {
        requestAnimationFrame(function() {
          requestAnimationFrame(_measureAndLock);
        });
      });
    }

    if (opts.visible) {
      requestAnimationFrame(function() { this.show(id, opts.duration); }.bind(this));
    }
  }

  /** Show a label with its animIn transition, then optionally move to final_position. */
  show(id, duration) {
    var entry = this._labels[id];
    if (!entry) return;
    var el     = entry.el;
    var opts   = entry.opts;
    var animIn = opts.animIn || 'rise';
    var dur    = duration !== undefined ? duration : (opts.duration || 400);
    var easing = this._getEasing(animIn);
    // Image labels centered with translateX(-50%) — preserve that base offset
    var baseXform = this._getBaseTransform(opts);

    el.style.transition = 'opacity ' + dur + 'ms ease, transform ' + dur + 'ms ' + easing +
                          ', filter ' + dur + 'ms ease';
    requestAnimationFrame(function() {
      el.style.opacity   = '1';
      el.style.transform = baseXform;
      el.style.filter    = '';
    });

    // ── Optional final_position / move_to — animate position after anim_in ──
    var finalPos = opts.final_position || opts.move_to;
    if (finalPos) {
      var self = this;
      setTimeout(function() { self.moveTo(id, finalPos); }, dur + 16);
    }
  }

  /**
   * Smoothly move a label to a new position.
   * @param {string} id
   * @param {object} pos
   *   x             {string|number}  — new left (CSS string for viewport, px number for scene)
   *   y             {string|number}  — new top
   *   move_duration {number}         — ms (default 800)
   *   move_easing   {string}         — CSS easing (default smooth spring)
   */
  moveTo(id, pos) {
    var entry = this._labels[id];
    if (!entry || !pos) return;
    var el      = entry.el;
    var opts    = entry.opts;
    var isScene = entry.space === 'scene';
    var moveDur = pos.move_duration !== undefined ? pos.move_duration
                : (opts.move_duration || 800);
    var moveEase = pos.move_easing || opts.move_easing
                 || 'cubic-bezier(0.22, 1, 0.36, 1)';

    // ── Fix: viewport/scene labels with anchor=center use margin-left:-40vw (or
    // -300px for scene) to center the fixed-width block around `left`.
    // When we animate `left` to a new value the margin offset still applies and
    // the label lands at the wrong position (appears to jump to ~0,0).
    //
    // Only do this when x is actually changing — if final_position only has y,
    // skip the horizontal adjustment entirely to avoid a jump.
    //
    // Solution: use getBoundingClientRect().left for the true visual position
    // (accounts for margin-left offset), then clear margin-left + width so
    // `left` can be freely animated from that px value to the target.
    var xChanging = pos.x !== undefined;
    if (xChanging && (opts.anchor || 'center') !== 'left' && !opts.image) {
      var containerRect = el.parentElement ? el.parentElement.getBoundingClientRect() : { left: 0 };
      var elRect   = el.getBoundingClientRect();
      var curLeft  = (elRect.left - containerRect.left) + 'px';  // true visual left in px
      // Strip the fixed-width centering — label will now be auto-width, left-anchored
      el.style.marginLeft = '0';
      el.style.width      = 'auto';
      // Remove translateX(0) / translateX(-50%) from the current transform so
      // only translateY and scale remain (they come from the show() animation).
      var curXform = el.style.transform || '';
      curXform = curXform.replace(/translateX\([^)]*\)\s*/g, '').trim();
      el.style.transform = curXform || 'none';
      // Snap left to the true visual px so the CSS transition starts from here
      el.style.left = curLeft;
      // Force reflow so the browser registers the new left before we animate
      void el.offsetWidth;
    }

    // Add left/top to the existing transition (keep opacity/transform transitions)
    var curTransition = el.style.transition || '';
    // Strip any existing left/top transitions to avoid duplicates
    curTransition = curTransition.replace(/,?\s*left\s+[^,]+/g, '')
                                 .replace(/,?\s*top\s+[^,]+/g, '').trim();
    if (curTransition && !curTransition.endsWith(',')) curTransition += ', ';
    el.style.transition = curTransition +
      'left ' + moveDur + 'ms ' + moveEase + ', ' +
      'top '  + moveDur + 'ms ' + moveEase;

    requestAnimationFrame(function() {
      if (pos.x !== undefined) {
        var newX = isScene ? (pos.x + 'px') : pos.x;
        el.style.left = newX;
        entry.opts.x  = pos.x;   // keep opts in sync for future setPosition calls
      }
      if (pos.y !== undefined) {
        var newY = isScene ? (pos.y + 'px') : pos.y;
        el.style.top = newY;
        entry.opts.y = pos.y;
      }
    });
  }

  /** Hide a label with its animOut transition. */
  hide(id, duration) {
    var entry = this._labels[id];
    if (!entry) return;
    var el      = entry.el;
    var dur     = duration !== undefined ? duration : (entry.opts.duration || 400);
    var animOut = entry.opts.animOut || 'fade';
    var easing  = this._getEasing(animOut);
    // Image labels: compose base offset + hidden transform
    var hiddenXform = this._getHiddenTransformFull(entry.opts, animOut);

    el.style.transition = 'opacity ' + dur + 'ms ease, transform ' + dur + 'ms ' + easing +
                          ', filter ' + dur + 'ms ease';
    el.style.opacity   = '0';
    el.style.transform = hiddenXform;
    if (animOut === 'blur') el.style.filter = 'blur(12px)';
  }

  /** Update text while label is visible (no show/hide). */
  setText(id, text) {
    var entry = this._labels[id];
    if (!entry) return;
    entry.el.innerHTML = this._renderText(text || '');
    entry.opts.text = text;
  }

  /** Move label to new position.
   *  viewport: x/y are CSS strings ('50%', '200px')
   *  scene:    x/y are native IDE px numbers (720, 450)
   */
  setPosition(id, x, y) {
    var entry = this._labels[id];
    if (!entry) return;
    var isScene = entry.space === 'scene';
    if (x !== undefined) {
      entry.opts.x = x;
      entry.el.style.left = isScene ? (x + 'px') : x;
    }
    if (y !== undefined) {
      entry.opts.y = y;
      entry.el.style.top = isScene ? (y + 'px') : y;
    }
  }

  /** Remove a label from DOM. */
  remove(id) {
    var entry = this._labels[id];
    if (!entry) return;
    if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    delete this._labels[id];
  }

  /** Remove all labels. */
  clear() {
    var self = this;
    Object.keys(this._labels).forEach(function(id) { self.remove(id); });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _positionCss(opts, space) {
    var anchor    = opts.anchor || 'center';
    var isImage   = !!opts.image;
    var alignMap  = { center: 'center', left: 'left', right: 'right' };
    var textAlign = alignMap[anchor] || 'center';

    if (space === 'scene') {
      // x/y are native IDE px coordinates (e.g. 0–1440 × 0–900)
      var x = (opts.x !== undefined) ? opts.x : 720;
      var y = (opts.y !== undefined) ? opts.y : 450;
      if (isImage) {
        // Image: use translateX to center since width is unknown
        var xformImg = anchor === 'center' ? 'translateX(-50%)' : 'none';
        return [
          'position:absolute',
          'left:' + x + 'px',
          'top:'  + y + 'px',
          'transform:' + xformImg,
        ].join(';');
      }
      // Text: fixed 600px wide block for centering
      var width      = anchor === 'center' ? '600px' : 'auto';
      var marginLeft = anchor === 'center' ? '-300px'
                     : anchor === 'right'  ? 'auto' : '0';
      return [
        'position:absolute',
        'left:' + x + 'px',
        'top:'  + y + 'px',
        'width:' + width,
        'margin-left:' + marginLeft,
        'text-align:' + textAlign,
        'white-space:pre-line',
      ].join(';');
    }

    // ── Viewport space — x/y are CSS strings ('50%', '10px', …) ─────────────
    var xv = opts.x || '50%';
    var yv = opts.y || '50%';
    if (isImage) {
      // anchor=center  → translateX(-50%) so image center lands at x
      // anchor=right   → translateX(-100%) so image right edge lands at x
      // anchor=left    → no shift, image left edge at x
      var xformImgVp = anchor === 'center' ? 'translateX(-50%)'
                     : anchor === 'right'  ? 'translateX(-100%)'
                     : 'none';
      return [
        'position:absolute',
        'left:' + xv,
        'top:'  + yv,
        'transform:' + xformImgVp,
      ].join(';');
    }
    // Text labels:
    //   center → fixed 80vw wide block, shifted left by 40vw so it's centered on x
    //   left   → auto width (or explicit width/max_width), left edge at x
    //   right  → auto width (or explicit width/max_width), translateX(-100%) so
    //             right edge lands at x — grows leftward, never overflows right edge.
    //
    // opts.width     — explicit CSS width  e.g. '300px', '40%'  (overrides defaults)
    // opts.max_width — explicit CSS max-width e.g. '400px'
    var explicitW    = opts.width     || null;
    var explicitMaxW = opts.max_width || null;

    if (anchor === 'right') {
      var wRight    = explicitW    || 'auto';
      var mwRight   = explicitMaxW || '80vw';
      return [
        'position:absolute',
        'left:' + xv,
        'top:'  + yv,
        'width:' + wRight,
        'max-width:' + mwRight,
        'transform:translateX(-100%)',
        'text-align:right',
        'white-space:pre-line',
      ].join(';');
    }
    // center / left
    var marginLeftV = anchor === 'center' ? '-40vw' : '0';
    var widthV      = explicitW || (anchor === 'center' ? '80vw' : 'auto');
    var maxWidthV   = explicitMaxW || (anchor === 'left' ? '80vw' : '');
    var parts = [
      'position:absolute',
      'left:' + xv,
      'top:'  + yv,
      'width:' + widthV,
      'margin-left:' + marginLeftV,
      'text-align:' + textAlign,
      'white-space:pre-line',
    ];
    if (maxWidthV) parts.push('max-width:' + maxWidthV);
    return parts.join(';');
  }

  /**
   * Convert *word* → <em class="ide-label-em">word</em>
   * Supports multi-word emphasis: *two words*
   */
  _renderText(text) {
    return text.replace(/\*([^*]+)\*/g, '<em class="ide-label-em">$1</em>');
  }

  /**
   * Return the visible (resting) CSS transform for a label.
   * Image labels centered with anchor=center use translateX(-50%).
   */
  _getBaseTransform(opts) {
    var isImage  = !!opts.image;
    var anchor   = opts.anchor || 'center';
    var hasBgCenter = opts.bg && anchor === 'center' && !isImage;
    if (isImage && anchor === 'center') return 'translateX(-50%) translateY(0) scale(1)';
    if (isImage && anchor === 'right')  return 'translateX(-100%) translateY(0) scale(1)';
    if (hasBgCenter)                    return 'translateX(-50%) translateY(0) scale(1)';
    if (anchor === 'right' && !isImage) return 'translateX(-100%) translateY(0) scale(1)';
    return 'translateY(0) translateX(0) scale(1)';
  }

  /**
   * Return the full hidden CSS transform (base offset + animation offset).
   * Needed so image labels keep their centering offset while animating.
   */
  _getHiddenTransformFull(opts, anim) {
    var isImage     = !!opts.image;
    var anchor      = opts.anchor || 'center';
    var needsCenterShift = (isImage && anchor === 'center') || (opts.bg && anchor === 'center' && !isImage);
    var needsRightShift  = (anchor === 'right');
    var base = needsCenterShift ? 'translateX(-50%) ' : needsRightShift ? 'translateX(-100%) ' : '';
    switch (anim) {
      case 'rise':        return base + 'translateY(28px) scale(1)';
      case 'drop':        return base + 'translateY(-28px) scale(1)';
      case 'slide_left':  return base + 'translateX(60px) scale(1)';
      case 'slide_right': return base + 'translateX(-60px) scale(1)';
      case 'scale':
      case 'zoom_out':    return base + 'translateY(0) scale(0.72)';
      case 'zoom_in':     return base + 'translateY(0) scale(1.22)';
      case 'blur':
      case 'fade':
      default:            return base + 'translateY(0) scale(1)';
    }
  }

  /**
   * Return the CSS transform for the hidden (off) state.
   *
   * Available effects:
   *   fade        — opacity only, no movement          (default)
   *   rise        — slides up from below               (default animIn)
   *   drop        — slides down from above
   *   slide_left  — slides in from the right
   *   slide_right — slides in from the left
   *   scale       — scales up from small
   *   zoom_in     — scales down from large (zoom-out feel on appear)
   *   zoom_out    — scales up from small   (zoom-in feel on appear)
   *   blur        — fades in from blurred
   *   none        — instant, no animation
   */
  _getHiddenTransform(anim) {
    switch (anim) {
      case 'rise':        return 'translateY(28px) scale(1)';
      case 'drop':        return 'translateY(-28px) scale(1)';
      case 'slide_left':  return 'translateX(60px) scale(1)';
      case 'slide_right': return 'translateX(-60px) scale(1)';
      case 'scale':
      case 'zoom_out':    return 'translateY(0) scale(0.72)';
      case 'zoom_in':     return 'translateY(0) scale(1.22)';
      case 'blur':        return 'translateY(0) scale(1)';   // filter handles blur
      case 'none':        return 'none';
      case 'fade':
      default:            return 'translateY(0) scale(1)';
    }
  }

  /** Return the CSS easing curve best suited for each animation type. */
  _getEasing(anim) {
    switch (anim) {
      case 'rise':
      case 'drop':
      case 'slide_left':
      case 'slide_right': return 'cubic-bezier(0.22, 1, 0.36, 1)';   // spring-out
      case 'scale':
      case 'zoom_out':
      case 'zoom_in':     return 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // slight overshoot
      case 'blur':
      case 'fade':
      default:            return 'ease';
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('ide-labels-style')) return;
    // Load Lexend from Google Fonts (matches quadcode.ai landing)
    if (!document.getElementById('ide-labels-font')) {
      var link = document.createElement('link');
      link.id   = 'ide-labels-font';
      link.rel  = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
    var style = document.createElement('style');
    style.id = 'ide-labels-style';
    style.textContent = [
      /* Base label */
      '.ide-label {',
      '  pointer-events: none;',
      '  will-change: opacity, transform;',
      '  line-height: 1.15;',
      '  letter-spacing: -0.02em;',
      '}',

      /* ── Caption style — matches quadcode.ai hero "Create real-world impressive apps" ── */
      /* Lexend 500, white. Emphasis: same font/weight, no italic, #F18024→#F85A6A gradient */
      /* Base size reduced by factor 1.5 vs original. Use `scale` param to adjust per-label. */
      '.ide-label--caption {',
      '  font-family: "Lexend", system-ui, sans-serif;',
      '  font-size: calc(clamp(16px, 3.33cqw, 48px) * var(--lbl-scale, 1));',
      '  font-weight: 500;',
      '  line-height: 1.0;',
      '  color: #ffffff;',
      '  text-shadow: 0 2px 40px rgba(0,0,0,0.6);',
      '}',

      /* Caption emphasis — Lexend 500, no italic, orange→red-pink gradient (exact landing colors) */
      '.ide-label--caption .ide-label-em {',
      '  font-family: "Lexend", system-ui, sans-serif;',
      '  font-style: normal;',
      '  font-weight: 500;',
      '  background: linear-gradient(to right, #F18024 0%, #F85A6A 100%);',
      '  -webkit-background-clip: text;',
      '  -webkit-text-fill-color: transparent;',
      '  background-clip: text;',
      '  display: inline;',
      '}',

      /* ── Image label — no text styles, just layout ── */
      '.ide-label--image { line-height:0; }',

      /* ── Scene-space overrides — fixed px sizes (scene is already scaled) ── */
      /* Sizes reduced by factor 1.5 vs original. Scale via --lbl-scale. */
      '.ide-label--scene.ide-label--caption {',
      '  font-size: calc(35px * var(--lbl-scale, 1));',
      '}',
      '.ide-label--scene.ide-label--subcaption {',
      '  font-size: calc(18px * var(--lbl-scale, 1));',
      '}',

      /* ── Subcaption style — matches quadcode.ai landing descriptor paragraph ── */
      /* Lexend 500, #787878. Original size — not downscaled. */
      '.ide-label--subcaption {',
      '  font-family: "Lexend", system-ui, sans-serif;',
      '  font-size: calc(clamp(11px, 1.8cqw, 22px) * var(--lbl-scale, 1));',
      '  font-weight: 500;',
      '  color: #787878;',
      '  line-height: 1.55;',
      '  letter-spacing: 0em;',
      '  text-shadow: none;',
      '}',

      /* Subcaption emphasis — same orange→red-pink gradient, no italic */
      '.ide-label--subcaption .ide-label-em {',
      '  font-style: normal;',
      '  font-weight: 500;',
      '  background: linear-gradient(to right, #F18024 0%, #F85A6A 100%);',
      '  -webkit-background-clip: text;',
      '  -webkit-text-fill-color: transparent;',
      '  background-clip: text;',
      '  display: inline;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }
}

if (typeof module !== 'undefined') module.exports = { IDELabels };
