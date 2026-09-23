/**
 * IDECamera
 * ─────────────────────────────────────────────────────────────────────────────
 * 3D camera controller for IDE emulation.
 * Wraps IDEWindowWrapper.window with perspective + 3D transforms.
 * Mirrors the 3D controls panel from message_box.html exactly.
 *
 * Features:
 *  • Zoom / RotX / RotY / RotZ sliders
 *  • Animation presets: Float, Swing, Tilt, Breathe, Drift, Wobble, Pendulum
 *  • Smooth animated movements via moveTo(state, durationMs)
 *  • Viewport selection panel (Free / Desktop 16:10 / 16:9 / 9:16 / Mobile 10:16)
 *  • Scale slider in viewport panel
 *  • Collapsible 3D control panel (top-left)
 *  • Viewport overlay (top-left, bottom panels)
 *
 * Usage:
 *   const cam = new IDECamera(wrapperInstance);
 *   cam.mount(document.body);   // injects control panels into page
 *
 *   // Programmatic control (for scenario commands):
 *   cam.moveTo({ zoom:1.2, rx:5, ry:-8, rz:0 }, 800);   // smooth move
 *   cam.setAnim('float');    // start animation preset
 *   cam.stopAnim();          // stop animation
 *   cam.reset(600);          // smooth reset to identity
 *   cam.setViewport('r169'); // switch viewport
 *
 * Scenario action types (handled by IDEScenario):
 *   { type: 'camera_move',     zoom, rx, ry, rz, duration }
 *   { type: 'camera_anim',     name }   // float|swing|tilt|breathe|drift|wobble|pendulum|none
 *   { type: 'camera_reset',    duration }
 *   { type: 'camera_viewport', mode }   // free|desktop|r169|r916|mobile
 */
class IDECamera {
  /**
   * @param {IDEWindowWrapper} wrapper
   * @param {object} [opts]
   * @param {boolean} [opts.showControls=true]  — show 3D control panel
   * @param {boolean} [opts.showViewport=true]  — show viewport + bg panels
   */
  constructor(wrapper, opts) {
    opts = opts || {};
    this._wrapper      = wrapper;
    this._showControls = opts.showControls !== false;
    this._showViewport = opts.showViewport !== false;

    // Camera state — the "base" is the target set by moveTo/scenario commands.
    // Animations add DELTAS on top of _base, never replace it.
    this._initialZoom    = opts.initialZoom    || 1;
    this._initialVpScale = opts.initialVpScale || 1.0;
    // smoothness: 0 = instant, 1 = very slow (maps to CSS transition duration 0–2s)
    this._smoothness        = (opts.smoothness    !== undefined) ? opts.smoothness    : 0.6;
    // Default duration (ms) and easing for moveTo() — overridable per-call
    this._defaultMoveDuration = (opts.moveDuration !== undefined) ? opts.moveDuration : 700;
    this._defaultMoveEasing   = opts.moveEasing || 'ease_in_out';
    this._base  = { zoom: this._initialZoom, tx: 0, ty: 0, rx: 0, ry: 0, rz: 0 };
    this._state = { zoom: this._initialZoom, tx: 0, ty: 0, rx: 0, ry: 0, rz: 0 };
    // _animDelta holds the current additive offset from the running animation
    this._animDelta = { zoom: 0, tx: 0, ty: 0, rx: 0, ry: 0, rz: 0 };

    // Viewport state — global scale multiplies camera zoom
    this._vpMode  = 'desktop';
    this._vpScale = this._initialVpScale;

    // Animation
    this._animRaf    = null;
    this._activeAnim = null;

    // Smooth move tween
    this._tweenRaf  = null;
    this._tweenFrom = null;
    this._tweenTo   = null;
    this._tweenT0   = 0;
    this._tweenDur  = 0;

    // DOM refs (set in mount)
    this._panel     = null;   // ctrl3d panel
    this._vpCapture = null;
    this._vpDecor   = null;
    this._sliders   = {};
    this._vals      = {};
    this._animBtns  = {};
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Inject control panels into parent (usually document.body). */
  mount(parent) {
    // Add perspective to the wrapper's outer shell
    this._wrapper.el.style.perspective = '1200px';
    this._wrapper.window.style.transformStyle = 'preserve-3d';
    this._wrapper.window.style.transformOrigin = 'center center';
    this._wrapper.window.style.transition = _transitionCss(this._smoothness);
    this._wrapper.window.style.willChange = 'transform';

    if (this._showControls) {
      this._panel = this._buildCtrl3dPanel();
      parent.appendChild(this._panel);
    }

    // Viewport overlay divs
    this._vpCapture = document.createElement('div');
    this._vpCapture.id = 'vpCapture';
    this._vpCapture.style.cssText = 'position:fixed;pointer-events:none;z-index:48;display:none;container-type:size;';
    parent.appendChild(this._vpCapture);

    // ── Background video layer ─────────────────────────────────────────────
    // Sits INSIDE the viewport frame, fills it with object-fit:cover.
    // Never receives any 3D transform — always flat, axis-aligned.
    // z-index 46 = behind IDE (47) and vpCapture (48) but above page bg.
    // In 'overlay' mode z-index is bumped to 47 so it covers the IDE.
    this._vpBgVideo = document.createElement('div');
    this._vpBgVideo.id = 'vpBgVideo';
    this._vpBgVideo.style.cssText = [
      'position:fixed;pointer-events:none;z-index:46;display:none;',
      'overflow:hidden;',
    ].join('');
    var bgVid = document.createElement('video');
    bgVid.id = 'vpBgVideoEl';
    bgVid.style.cssText = [
      'position:absolute;top:0;left:0;width:100%;height:100%;',
      'object-fit:cover;object-position:center;',
      'display:block;',
    ].join('');
    bgVid.muted   = true;
    bgVid.loop    = true;
    bgVid.preload = 'auto';
    bgVid.playsInline = true;
    this._vpBgVideo.appendChild(bgVid);
    this._bgVidEl = bgVid;

    // Dimming overlay — sits above the video, below the IDE.
    // Opacity is set via playBgVideo({ dim: 0..1 }).  Default: 0 (no dim).
    var dimEl = document.createElement('div');
    dimEl.id = 'vpBgVideoDim';
    dimEl.style.cssText = [
      'position:absolute;top:0;left:0;width:100%;height:100%;',
      'background:#000;opacity:0;pointer-events:none;',
      'transition:opacity 400ms ease;',
    ].join('');
    this._vpBgVideo.appendChild(dimEl);
    this._bgDimEl = dimEl;

    parent.appendChild(this._vpBgVideo);

    this._vpDecor = document.createElement('div');
    this._vpDecor.id = 'vpDecor';
    this._vpDecor.style.cssText = [
      'position:fixed;pointer-events:none;z-index:50;',
      'box-shadow:0 0 0 9999px rgba(0,0,0,0.45);',
      'border:1px solid rgba(255,255,255,0.18);border-radius:3px;display:none;',
    ].join('');
    // Corner marks via pseudo — inject style once
    this._injectVpDecorStyle();
    parent.appendChild(this._vpDecor);

    if (this._showViewport) {
      var bottomPanels = this._buildBottomPanels();
      parent.appendChild(bottomPanels);
    }

    // Apply initial state
    this._applyTransform();
    this._applyViewport(this._vpMode);

    window.addEventListener('resize', () => {
      if (this._vpMode !== 'free') this._applyViewport(this._vpMode);
    });

    return this;
  }

  /**
   * Smoothly move camera to target state.
   * @param {object} target  — { zoom?, tx?, ty?, rx?, ry?, rz? }
   * @param {number} [dur]   — duration ms (default: this._defaultMoveDuration)
   * @param {string} [easing] — easing name (default: this._defaultMoveEasing)
   *   Values: 'linear'|'ease_in'|'ease_out'|'ease_in_out'|'spring'|'bounce'
   */
  moveTo(target, dur, easing) {
    dur    = (dur    === undefined) ? this._defaultMoveDuration : dur;
    easing = (easing === undefined) ? this._defaultMoveEasing   : easing;
    this._stopTween();
    // NOTE: do NOT stop anim — moveTo tweens _base, anim keeps running additively

    var from = Object.assign({}, this._base);
    var to   = {
      zoom: target.zoom !== undefined ? target.zoom : from.zoom,
      tx:   target.tx   !== undefined ? target.tx   : from.tx,
      ty:   target.ty   !== undefined ? target.ty   : from.ty,
      rx:   target.rx   !== undefined ? target.rx   : from.rx,
      ry:   target.ry   !== undefined ? target.ry   : from.ry,
      rz:   target.rz   !== undefined ? target.rz   : from.rz,
    };

    if (dur <= 0) {
      Object.assign(this._base, to);
      this._combineAndApply();
      return;
    }

    this._tweenFrom = from;
    this._tweenTo   = to;
    this._tweenT0   = performance.now();
    this._tweenDur  = dur;

    // Disable CSS transition — tween drives it frame by frame
    this._wrapper.window.style.transition = 'none';

    var self = this;
    var _easing = easing;  // capture for closure
    function tick(now) {
      var t = Math.min(1, (now - self._tweenT0) / self._tweenDur);
      var e = _applyEasing(_easing, t);
      self._base.zoom = self._tweenFrom.zoom + (self._tweenTo.zoom - self._tweenFrom.zoom) * e;
      self._base.tx   = self._tweenFrom.tx   + (self._tweenTo.tx   - self._tweenFrom.tx)   * e;
      self._base.ty   = self._tweenFrom.ty   + (self._tweenTo.ty   - self._tweenFrom.ty)   * e;
      self._base.rx   = self._tweenFrom.rx   + (self._tweenTo.rx   - self._tweenFrom.rx)   * e;
      self._base.ry   = self._tweenFrom.ry   + (self._tweenTo.ry   - self._tweenFrom.ry)   * e;
      self._base.rz   = self._tweenFrom.rz   + (self._tweenTo.rz   - self._tweenFrom.rz)   * e;
      self._combineAndApply();
      if (t < 1) {
        self._tweenRaf = requestAnimationFrame(tick);
      } else {
        self._tweenRaf = null;
        // Re-enable CSS transition after tween — unless a RAF-driven preset
        // is running, which must stay transition-free or every frame smears.
        if (!self._activeAnim) {
          self._wrapper.window.style.transition = _transitionCss(self._smoothness);
        }
      }
    }
    this._tweenRaf = requestAnimationFrame(tick);
  }

  /**
   * Start a named animation preset.
   * @param {string} name — float|swing|tilt|breathe|drift|wobble|pendulum
   */
  setAnim(name, opts) {
    if (name === 'none') { this.stopAnim(); return; }
    var fn = IDECamera._ANIMS[name];
    if (!fn) { console.warn('[IDECamera] unknown anim:', name); return; }
    opts = opts || {};
    // A running pan (moveTo tween) keeps going — animations are additive on
    // top of _base, so there is no reason to kill it. Killing it left the
    // camera half-way to its target whenever camera_anim fired mid-pan.
    this._stopAnim();
    this._activeAnim = name;
    // amplitude scales every preset delta (1 = as authored). Lets a scenario
    // use `swing` at 0.4 so a ±12° yaw becomes ±5° and nothing leaves the frame.
    this._animAmp = (opts.amplitude !== undefined) ? +opts.amplitude : 1;

    // Mark button active
    Object.keys(this._animBtns).forEach(k => {
      this._animBtns[k].classList.toggle('active', k === name);
    });

    // Disable CSS transition — RAF drives it
    this._wrapper.window.style.transition = 'none';

    var self  = this;
    var start = performance.now();
    function tick(now) {
      // fn writes into _animDelta, then calls _combineAndApply
      fn.call(self, now - start);
      self._animRaf = requestAnimationFrame(tick);
    }
    this._animRaf = requestAnimationFrame(tick);
  }

  /** Stop any running animation. */
  stopAnim() {
    this._stopAnim();
    this._wrapper.window.style.transition = _transitionCss(this._smoothness);
  }

  /**
   * Smoothly reset camera to identity.
   * @param {number} [dur=600]
   */
  reset(dur) {
    this.moveTo({ zoom: this._initialZoom || 1, tx: 0, ty: 0, rx: 0, ry: 0, rz: 0 }, dur === undefined ? 600 : dur);
  }

  /**
   * Switch viewport mode.
   * @param {'free'|'desktop'|'r169'|'r916'|'mobile'} mode
   */
  setViewport(mode) {
    this._applyViewport(mode);
  }

  /**
   * Play a video that fills the viewport frame without any 3D transform.
   * Aspect ratio is preserved via object-fit:cover (crops edges if needed).
   *
   * @param {string}  src             — video URL / path
   * @param {object}  [opts]
   * @param {boolean} [opts.loop=true]
   * @param {boolean} [opts.muted=true]
   * @param {number}  [opts.fade=0]   — fade-in duration ms
   * @param {number}  [opts.dim]      — black overlay opacity 0..1 (default: 1.0 = fully opaque).
   *                                    Set to 0 for no dimming, 0.5 for 50% black overlay.
   *                                    Omit to keep current dim level unchanged.
   * @param {'behind'|'overlay'} [opts.mode='behind']
   *   'behind'  — z-index 46, IDE renders on top (good for ambient bg)
   *   'overlay' — z-index 47, video covers the IDE (good for transitions)
   */
  playBgVideo(src, opts) {
    opts = opts || {};
    var vid  = this._bgVidEl;
    var wrap = this._vpBgVideo;
    if (!vid || !wrap) return;

    var mode = opts.mode === 'overlay' ? 'overlay' : 'behind';
    wrap.style.zIndex = mode === 'overlay' ? '47' : '46';

    vid.loop  = opts.loop  !== false;
    vid.muted = opts.muted !== false;

    // Position wrapper to match current viewport frame (or full page in free mode)
    this._syncBgVideoPos();

    var fade = opts.fade || 0;
    if (fade > 0) {
      vid.style.opacity    = '0';
      vid.style.transition = 'opacity ' + fade + 'ms ease';
    } else {
      vid.style.opacity    = '1';
      vid.style.transition = 'none';
    }

    // Apply dimming overlay — default 1.0 (fully opaque black) when dim is specified
    if (opts.dim !== undefined) {
      this.setDim(opts.dim, fade || 0);
    }

    vid.src = src;
    wrap.style.display = 'block';
    vid.load();
    vid.play().then(function() {
      if (fade > 0) vid.style.opacity = '1';
    }).catch(function(e) {
      console.warn('[IDECamera] bg video play failed:', e);
    });
  }

  /**
   * Set the dimming overlay opacity on the background video.
   * @param {number} opacity  — 0 (no dim) … 1 (fully black)
   * @param {number} [fadeDur=400]  — transition duration ms
   */
  setDim(opacity, fadeDur) {
    var el = this._bgDimEl;
    if (!el) return;
    fadeDur = (fadeDur !== undefined) ? fadeDur : 400;
    el.style.transition = 'opacity ' + fadeDur + 'ms ease';
    el.style.opacity    = Math.max(0, Math.min(1, opacity)).toString();
  }

  /**
   * Stop and hide the background video.
   * @param {number} [fade=0] — fade-out duration ms
   */
  stopBgVideo(fade) {
    var vid  = this._bgVidEl;
    var wrap = this._vpBgVideo;
    if (!vid || !wrap) return;
    fade = fade || 0;
    // Reset dim overlay
    this.setDim(0, fade || 200);
    if (fade > 0) {
      vid.style.transition = 'opacity ' + fade + 'ms ease';
      vid.style.opacity    = '0';
      setTimeout(function() {
        vid.pause();
        vid.src = '';
        wrap.style.display = 'none';
      }, fade);
    } else {
      vid.pause();
      vid.src = '';
      wrap.style.display = 'none';
    }
  }

  /** Sync bg video wrapper position to current viewport frame. */
  _syncBgVideoPos() {
    var wrap    = this._vpBgVideo;
    var capture = this._vpCapture;
    if (!wrap) return;

    if (this._vpMode === 'free' || !capture || capture.style.display === 'none') {
      // Free mode — fill entire page
      wrap.style.left   = '0';
      wrap.style.top    = '0';
      wrap.style.width  = '100vw';
      wrap.style.height = '100vh';
    } else {
      wrap.style.left   = capture.style.left;
      wrap.style.top    = capture.style.top;
      wrap.style.width  = capture.style.width;
      wrap.style.height = capture.style.height;
    }
  }

  // ── Internal: transform ────────────────────────────────────────────────────

  _applyTransform() {
    var s = this._state;
    var totalScale = this._vpScale * s.zoom;
    // translate BEFORE scale so units are in screen pixels (not scaled pixels)
    // tx/ty are in native IDE pixels — divide by scale to get screen offset
    var sx = s.tx ? (s.tx * totalScale) : 0;
    var sy = s.ty ? (s.ty * totalScale) : 0;
    var t =
      'translateX(' + sx + 'px) translateY(' + sy + 'px) ' +
      'scale(' + totalScale + ') ' +
      'rotateX(' + s.rx + 'deg) rotateY(' + s.ry + 'deg) rotateZ(' + s.rz + 'deg)';

    this._wrapper.window.style.transform = t;

    // Mirror identical transform onto sceneLayer so viewer windows (IDECustomWindow)
    // mounted there move / rotate / scale in perfect sync with the IDE window.
    if (this._wrapper.sceneLayer) {
      this._wrapper.sceneLayer.style.transform = t;
      this._wrapper.sceneLayer.style.transition = this._wrapper.window.style.transition;
    }
  }

  /** Recompute _state = _base + _animDelta and apply. */
  _combineAndApply() {
    var a = (this._animAmp !== undefined) ? this._animAmp : 1;
    this._state.zoom = this._base.zoom + this._animDelta.zoom * a;
    this._state.tx   = this._base.tx   + (this._animDelta.tx || 0) * a;
    this._state.ty   = this._base.ty   + (this._animDelta.ty || 0) * a;
    this._state.rx   = this._base.rx   + this._animDelta.rx * a;
    this._state.ry   = this._base.ry   + this._animDelta.ry * a;
    this._state.rz   = this._base.rz   + this._animDelta.rz * a;
    this._syncSliders();
    this._applyTransform();
  }

  _syncSliders() {
    var s = this._state;
    if (this._sliders.zoom) { this._sliders.zoom.value = s.zoom; this._vals.zoom.textContent = s.zoom.toFixed(2) + '×'; }
    if (this._sliders.rx)   { this._sliders.rx.value   = s.rx;   this._vals.rx.textContent   = Math.round(s.rx) + '°'; }
    if (this._sliders.ry)   { this._sliders.ry.value   = s.ry;   this._vals.ry.textContent   = Math.round(s.ry) + '°'; }
    if (this._sliders.rz)   { this._sliders.rz.value   = s.rz;   this._vals.rz.textContent   = Math.round(s.rz) + '°'; }
  }

  _stopAnim() {
    if (this._animRaf) { cancelAnimationFrame(this._animRaf); this._animRaf = null; }
    this._activeAnim = null;
    // Zero out the additive delta so base state is clean
    this._animDelta = { zoom: 0, rx: 0, ry: 0, rz: 0 };
    this._combineAndApply();
    Object.values(this._animBtns).forEach(b => b.classList.remove('active'));
  }

  _stopTween() {
    if (this._tweenRaf) { cancelAnimationFrame(this._tweenRaf); this._tweenRaf = null; }
  }

  // ── Internal: viewport ─────────────────────────────────────────────────────

  _applyViewport(mode) {
    this._vpMode = mode;
    var capture = this._vpCapture;
    var decor   = this._vpDecor;

    // Update viewport buttons
    document.querySelectorAll('.vp-btn').forEach(b => b.classList.remove('active'));
    var activeBtn = document.getElementById('vp_' + mode);
    if (activeBtn) activeBtn.classList.add('active');

    // Default scale per mode
    var defaultScales = { free: 1.0, desktop: 1.0, r169: 1.0, r916: 0.6, mobile: 0.6 };
    this._setVpScale(defaultScales[mode] !== undefined ? defaultScales[mode] : 1.0);

    if (mode === 'free') {
      if (capture) { capture.style.display = 'none'; }
      if (decor)   { decor.style.display   = 'none'; }
      return;
    }

    var ratios = { desktop: 16/10, r169: 16/9, r916: 9/16, mobile: 10/16 };
    var ratio  = ratios[mode];
    if (!ratio) return;

    var winW = window.innerWidth;
    var winH = window.innerHeight;
    var marginTop    = 80;
    var marginBottom = 125;
    var marginSide   = 40;

    var availW = winW - marginSide * 2;
    var availH = winH - marginTop - marginBottom;

    var fw, fh;
    if (availW / availH > ratio) { fh = availH; fw = fh * ratio; }
    else                          { fw = availW; fh = fw / ratio; }

    var fx = (winW - fw) / 2;
    var fy = marginTop + (availH - fh) / 2;

    [capture, decor].forEach(function(el) {
      if (!el) return;
      el.style.left   = fx + 'px';
      el.style.top    = fy + 'px';
      el.style.width  = fw + 'px';
      el.style.height = fh + 'px';
      el.style.display = 'block';
    });

    this._applyTransform();
    // Keep bg video frame in sync with viewport
    if (this._vpBgVideo && this._vpBgVideo.style.display !== 'none') {
      this._syncBgVideoPos();
    }
  }

  _setVpScale(v) {
    this._vpScale = v;
    var slider = document.getElementById('vpScaleSlider');
    var label  = document.getElementById('vpScaleVal');
    if (slider) slider.value = v;
    if (label)  label.textContent = v.toFixed(2) + '×';
    this._applyTransform();
  }

  // ── Build: 3D control panel ────────────────────────────────────────────────

  _buildCtrl3dPanel() {
    var self = this;
    var panel = document.createElement('div');
    panel.className = 'ctrl3d';
    panel.style.cssText = [
      // Approx. 15% narrower than the previous `right:400px` layout, left-aligned.
      'position:fixed;top:10px;left:12px;right:calc(15vw + 338px);z-index:100;',
      'background:rgba(13,13,21,0.88);border:1px solid rgba(255,255,255,0.07);',
      'border-radius:10px;padding:7px 14px;display:flex;flex-direction:column;gap:6px;',
      'backdrop-filter:blur(8px);font-size:11px;color:var(--qc-color-text-primary,#868a91);',
    ].join('');

    // ── Row 1: sliders ──────────────────────────────────────────────────────
    var row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;align-items:center;gap:10px;white-space:nowrap;';

    var title = document.createElement('div');
    title.textContent = '3D';
    title.style.cssText = 'font-size:10px;font-weight:600;letter-spacing:0.08em;opacity:0.45;text-transform:uppercase;flex-shrink:0;';
    row1.appendChild(title);

    var sliderDefs = [
      { key: 'zoom', label: 'Zoom', min: 0.3, max: 2.0, step: 0.01, val: 1.0, fmt: v => (+v).toFixed(2) + '×' },
      { key: 'rx',   label: 'Rot X', min: -60, max: 60, step: 1, val: 0, fmt: v => Math.round(v) + '°' },
      { key: 'ry',   label: 'Rot Y', min: -60, max: 60, step: 1, val: 0, fmt: v => Math.round(v) + '°' },
      { key: 'rz',   label: 'Rot Z', min: -45, max: 45, step: 1, val: 0, fmt: v => Math.round(v) + '°' },
    ];

    sliderDefs.forEach(function(def, i) {
      if (i > 0) {
        var div = document.createElement('div');
        div.style.cssText = 'width:1px;height:16px;background:rgba(255,255,255,0.08);flex-shrink:0;';
        row1.appendChild(div);
      }

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:5px;flex:1;min-width:0;';

      var lbl = document.createElement('span');
      lbl.textContent = def.label;
      lbl.style.cssText = 'font-size:10px;opacity:0.6;flex-shrink:0;';

      var slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'cam-slider';
      slider.min = def.min; slider.max = def.max; slider.step = def.step; slider.value = def.val;
      slider.style.cssText = 'flex:1;min-width:40px;outline:none;';
      _injectSliderThumbStyle();

      var valEl = document.createElement('span');
      valEl.textContent = def.fmt(def.val);
      valEl.style.cssText = 'width:28px;font-size:10px;text-align:right;opacity:0.5;font-variant-numeric:tabular-nums;flex-shrink:0;';

      slider.addEventListener('input', function() {
        self._stopAnim();
        self._stopTween();
        self._state[def.key] = parseFloat(slider.value);
        valEl.textContent = def.fmt(slider.value);
        self._applyTransform();
      });

      self._sliders[def.key] = slider;
      self._vals[def.key]    = valEl;

      row.appendChild(lbl); row.appendChild(slider); row.appendChild(valEl);
      row1.appendChild(row);
    });

    // Collapse button
    var collapseBtn = document.createElement('button');
    collapseBtn.title = 'Collapse';
    collapseBtn.style.cssText = [
      'width:18px;height:18px;border:none;background:transparent;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;opacity:0.35;',
      'transition:opacity 0.15s;color:var(--qc-color-text-primary,#868a91);',
      'flex-shrink:0;padding:0;border-radius:3px;',
    ].join('');
    collapseBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="7,3 4,6 1,3"/></svg>';
    collapseBtn.addEventListener('mouseenter', () => { collapseBtn.style.opacity = '0.8'; collapseBtn.style.background = 'rgba(128,128,128,0.12)'; });
    collapseBtn.addEventListener('mouseleave', () => { collapseBtn.style.opacity = '0.35'; collapseBtn.style.background = 'transparent'; });
    collapseBtn.addEventListener('click', () => {
      var collapsed = panel.dataset.collapsed === '1';
      panel.dataset.collapsed = collapsed ? '0' : '1';
      row2.style.display = collapsed ? 'flex' : 'none';
      sliderDefs.forEach(function(def, i) {
        // hide all slider rows and dividers except title
        row1.children[i > 0 ? i * 2 : 0].style.display = collapsed ? '' : (i === 0 ? '' : 'none');
      });
      // simpler: toggle all children of row1 except title and collapse btn
      Array.from(row1.children).forEach(function(ch, i) {
        if (i === 0 || ch === collapseBtn) return;
        ch.style.display = collapsed ? '' : 'none';
      });
      collapseBtn.querySelector('svg').style.transform = collapsed ? '' : 'rotate(180deg)';
      if (collapsed) panel.style.right = 'calc(15vw + 338px)';
      else           panel.style.right = 'auto';
    });
    row1.appendChild(collapseBtn);

    // ── Row 2: animation presets ────────────────────────────────────────────
    var row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;align-items:center;gap:5px;';

    var animDefs = [
      { key: 'float',     label: 'Float' },
      { key: 'swing',     label: 'Swing' },
      { key: 'tilt',      label: 'Tilt' },
      { key: 'breathe',   label: 'Breathe' },
      { key: 'drift',     label: 'Drift' },
      { key: 'wobble',    label: 'Wobble' },
      { key: 'pendulum',  label: 'Pendulum' },
      { key: 'none',      label: 'None' },
    ];

    animDefs.forEach(function(def) {
      var btn = document.createElement('button');
      btn.textContent = def.label;
      btn.style.cssText = [
        'height:20px;padding:0 7px;border:1px solid rgba(255,255,255,0.1);border-radius:4px;',
        'background:rgba(255,255,255,0.04);color:var(--qc-color-text-primary,#868a91);',
        'font-size:10px;font-family:inherit;cursor:pointer;',
        'transition:background 0.12s,border-color 0.12s;white-space:nowrap;flex-shrink:0;',
      ].join('');
      btn.addEventListener('mouseenter', () => { if (!btn.classList.contains('active')) { btn.style.background = 'rgba(255,255,255,0.09)'; btn.style.borderColor = 'rgba(255,255,255,0.2)'; } });
      btn.addEventListener('mouseleave', () => { if (!btn.classList.contains('active')) { btn.style.background = 'rgba(255,255,255,0.04)'; btn.style.borderColor = 'rgba(255,255,255,0.1)'; } });
      btn.addEventListener('click', () => {
        if (self._activeAnim === def.key) { self.stopAnim(); return; }
        self.setAnim(def.key);
      });
      // active style via class
      var origStyle = btn.style.cssText;
      var observer = new MutationObserver(() => {
        if (btn.classList.contains('active')) {
          btn.style.borderColor = 'var(--qc-color-primary,#56a8f5)';
          btn.style.color = 'var(--qc-color-primary,#56a8f5)';
        } else {
          btn.style.borderColor = 'rgba(255,255,255,0.1)';
          btn.style.color = 'var(--qc-color-text-primary,#868a91)';
        }
      });
      observer.observe(btn, { attributes: true, attributeFilter: ['class'] });

      self._animBtns[def.key] = btn;
      row2.appendChild(btn);
    });

    // Reset button
    var resetBtn = document.createElement('button');
    resetBtn.textContent = '↺ Reset';
    resetBtn.style.cssText = [
      'height:20px;padding:0 7px;border:none;border-radius:4px;',
      'background:rgba(128,128,128,0.14);color:var(--qc-color-text-primary,#868a91);',
      'font-size:10px;font-family:inherit;cursor:pointer;transition:background 0.12s;',
      'flex-shrink:0;margin-left:auto;',
    ].join('');
    resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'rgba(128,128,128,0.25)'; });
    resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'rgba(128,128,128,0.14)'; });
    resetBtn.addEventListener('click', () => { this.reset(500); });
    row2.appendChild(resetBtn);

    panel.appendChild(row1);
    panel.appendChild(row2);
    return panel;
  }

  // ── Build: bottom panels (viewport + bg) ───────────────────────────────────

  _buildBottomPanels() {
    var self = this;
    var wrap = document.createElement('div');
    wrap.id = 'btmPanels';
    wrap.style.cssText = [
      'position:fixed;bottom:14px;left:0;right:0;',
      'display:flex;flex-direction:column;align-items:center;gap:8px;',
      'z-index:100;pointer-events:none;',
    ].join('');

    // ── Viewport panel ──────────────────────────────────────────────────────
    var vpPanel = document.createElement('div');
    vpPanel.style.cssText = _btmPanelCss();
    vpPanel.style.pointerEvents = 'all';

    vpPanel.appendChild(_btmTitle('Viewport'));
    vpPanel.appendChild(_btmDivider());

    var vpDefs = [
      { id: 'free',    label: 'Free',    ratio: null,
        icon: '' },
      { id: 'desktop', label: 'Desktop', ratio: '16:10',
        icon: '<svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"><rect x="0.6" y="0.6" width="14.8" height="8.8" rx="1.2"/><line x1="4" y1="9.4" x2="12" y2="9.4"/><line x1="8" y1="9.4" x2="8" y2="10"/></svg>' },
      { id: 'r169',    label: '',        ratio: '16:9',
        icon: '<svg width="16" height="9" viewBox="0 0 16 9" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"><rect x="0.6" y="0.6" width="14.8" height="7.8" rx="1.2"/></svg>' },
      { id: 'r916',    label: '',        ratio: '9:16',
        icon: '<svg width="9" height="16" viewBox="0 0 9 16" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"><rect x="0.6" y="0.6" width="7.8" height="14.8" rx="1.2"/></svg>' },
      { id: 'mobile',  label: 'Mobile',  ratio: '10:16',
        icon: '<svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"><rect x="0.6" y="0.6" width="8.8" height="14.8" rx="1.5"/><circle cx="5" cy="13.5" r="0.8" fill="currentColor" stroke="none"/></svg>' },
    ];

    vpDefs.forEach(function(def) {
      var btn = document.createElement('button');
      btn.id = 'vp_' + def.id;
      btn.className = 'vp-btn' + (def.id === self._vpMode ? ' active' : '');
      btn.style.cssText = _vpBtnCss();
      btn.title = def.label || def.ratio || def.id;

      if (def.icon) {
        var iconWrap = document.createElement('span');
        iconWrap.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-shrink:0;';
        iconWrap.innerHTML = def.icon;
        btn.appendChild(iconWrap);
      }
      if (def.label) {
        var lbl = document.createElement('span');
        lbl.textContent = def.label;
        lbl.style.cssText = 'font-size:10px;';
        btn.appendChild(lbl);
      }
      if (def.ratio) {
        var rat = document.createElement('span');
        rat.textContent = def.ratio;
        rat.style.cssText = 'font-size:9px;opacity:0.5;';
        btn.appendChild(rat);
      }

      btn.addEventListener('click', function() { self._applyViewport(def.id); });
      _watchActiveClass(btn);
      vpPanel.appendChild(btn);
    });

    vpPanel.appendChild(_btmDivider());

    // Scale slider
    var scaleRow = document.createElement('div');
    scaleRow.style.cssText = 'display:flex;align-items:center;gap:5px;flex-shrink:0;';

    var scaleLbl = document.createElement('span');
    scaleLbl.textContent = 'Scale';
    scaleLbl.style.cssText = 'font-size:10px;opacity:0.6;flex-shrink:0;';

    var sliderWrap = document.createElement('div');
    sliderWrap.style.cssText = 'width:48px;flex-shrink:0;overflow:hidden;';

    var scaleSlider = document.createElement('input');
    scaleSlider.type = 'range'; scaleSlider.id = 'vpScaleSlider';
    scaleSlider.className = 'cam-slider';
    scaleSlider.min = 0.3; scaleSlider.max = 1.5; scaleSlider.step = 0.05; scaleSlider.value = this._vpScale;
    scaleSlider.style.cssText = 'width:100%;outline:none;display:block;';
    _injectSliderThumbStyle();

    var scaleVal = document.createElement('span');
    scaleVal.id = 'vpScaleVal';
    scaleVal.textContent = this._vpScale.toFixed(2) + '×';
    scaleVal.style.cssText = 'font-size:10px;opacity:0.5;font-variant-numeric:tabular-nums;width:30px;flex-shrink:0;';

    scaleSlider.addEventListener('input', function() {
      self._vpScale = parseFloat(scaleSlider.value);
      scaleVal.textContent = self._vpScale.toFixed(2) + '×';
      self._applyTransform();
    });

    sliderWrap.appendChild(scaleSlider);
    scaleRow.appendChild(scaleLbl);
    scaleRow.appendChild(sliderWrap);
    scaleRow.appendChild(scaleVal);
    vpPanel.appendChild(scaleRow);

    wrap.appendChild(vpPanel);
    return wrap;
  }

  // ── Viewport decor style ───────────────────────────────────────────────────

  _injectVpDecorStyle() {
    if (document.getElementById('__cam-vpdecor-css')) return;
    var s = document.createElement('style');
    s.id = '__cam-vpdecor-css';
    s.textContent = [
      '#vpDecor::before,#vpDecor::after{content:\'\';position:absolute;width:12px;height:12px;border-color:rgba(255,255,255,0.6);border-style:solid;}',
      '#vpDecor::before{top:-1px;left:-1px;border-width:2px 0 0 2px;}',
      '#vpDecor::after{bottom:-1px;right:-1px;border-width:0 2px 2px 0;}',
      // ── Recording: hide decor frame, keep #vpCapture intact for capture rect ──
      'body.is-recording #vpDecor{display:none!important;}',
      'body.is-recording .ctrl3d,body.is-recording #btmPanels{opacity:0!important;pointer-events:none!important;}',
      'body.is-recording #demo-controls .demo-btn:not(#btnRecord){opacity:0!important;pointer-events:none!important;}',
      '.vp-btn{display:flex;align-items:center;gap:6px;height:26px;padding:0 10px;',
      'border:1px solid rgba(255,255,255,0.1);border-radius:5px;',
      'background:rgba(255,255,255,0.04);color:var(--qc-color-text-primary,#868a91);',
      'font-size:10px;font-family:inherit;cursor:pointer;',
      'transition:background 0.12s,border-color 0.12s;flex-shrink:0;}',
      '.vp-btn:hover{background:rgba(255,255,255,0.09);border-color:rgba(255,255,255,0.2);}',
      '.vp-btn.active{border-color:var(--qc-color-primary,#56a8f5);color:var(--qc-color-primary,#56a8f5);}',

    ].join('');
    document.head.appendChild(s);
  }

  // ── Animation presets ──────────────────────────────────────────────────────

  static get _ANIMS() {
    // Each preset writes DELTAS into this._animDelta, then calls _combineAndApply().
    // This means animations are purely additive on top of the current _base state
    // set by moveTo() / scenario camera commands.
    return {
      float: function(t) {
        this._animDelta.zoom = Math.sin(t / 2000) * 0.03;
        this._animDelta.rx   = Math.sin(t / 2600) * 3;
        this._animDelta.ry   = Math.sin(t / 3400) * 2;
        this._animDelta.rz   = 0;
        this._combineAndApply();
      },
      swing: function(t) {
        this._animDelta.zoom = 0;
        this._animDelta.rx   = 0;
        this._animDelta.ry   = Math.sin(t / 2000) * 12;
        this._animDelta.rz   = 0;
        this._combineAndApply();
      },
      tilt: function(t) {
        this._animDelta.zoom = 0;
        this._animDelta.rx   = Math.sin(t / 2000) * 6;
        this._animDelta.ry   = Math.cos(t / 2600) * 8;
        this._animDelta.rz   = Math.sin(t / 3800) * 2;
        this._combineAndApply();
      },
      breathe: function(t) {
        this._animDelta.zoom = Math.sin(t / 1600) * 0.08;
        this._animDelta.rx   = Math.sin(t / 3000) * 2;
        this._animDelta.ry   = 0;
        this._animDelta.rz   = 0;
        this._combineAndApply();
      },
      drift: function(t) {
        this._animDelta.zoom = Math.sin(t / 4000) * 0.02;
        this._animDelta.rx   = Math.sin(t / 3000) * 4;
        this._animDelta.ry   = Math.sin(t / 2000) * 5;
        this._animDelta.rz   = Math.sin(t / 5000) * 1.5;
        this._combineAndApply();
      },
      wobble: function(t) {
        var decay = 0.5 + 0.5 * Math.abs(Math.sin(t / 1800));
        this._animDelta.zoom = 0;
        this._animDelta.rx   = Math.sin(t / 180) * 3 * decay;
        this._animDelta.ry   = Math.cos(t / 220) * 4 * decay;
        this._animDelta.rz   = Math.sin(t / 260) * 1.5 * decay;
        this._combineAndApply();
      },
      pendulum: function(t) {
        this._animDelta.zoom = 0;
        this._animDelta.rx   = 0;
        this._animDelta.ry   = Math.sin(t / 1400) * 10 * Math.exp(-0.0001 * (t % 6000));
        this._animDelta.rz   = Math.sin(t / 1400) * 2;
        this._combineAndApply();
      },
      none: function(t) {
        // No-op: stop any running animation and hold still
        this._stopAnim();
      },
    };
  }
}

// ── Smoothness → CSS transition helper ────────────────────────────────────────
// smoothness 0..1 maps to duration 0..2s with cubic-bezier easing
function _transitionCss(smoothness) {
  var dur = (smoothness * 2).toFixed(2);
  return 'transform ' + dur + 's cubic-bezier(0.25,0.46,0.45,0.94)';
}

// ── Easing ─────────────────────────────────────────────────────────────────────
// Named easing functions for moveTo(). t is normalized [0..1].
function _applyEasing(name, t) {
  switch (name) {
    case 'linear':
      return t;
    case 'ease_in':
      return t * t * t;
    case 'ease_out':
      return 1 - Math.pow(1 - t, 3);
    case 'spring':
      // Overshoots slightly then settles
      return 1 - Math.cos(t * Math.PI * 2.5) * Math.pow(1 - t, 2.2);
    case 'bounce':
      // Elastic bounce at end
      if (t < 1 / 2.75)      return 7.5625 * t * t;
      else if (t < 2 / 2.75) { t -= 1.5   / 2.75; return 7.5625 * t * t + 0.75; }
      else if (t < 2.5/2.75) { t -= 2.25  / 2.75; return 7.5625 * t * t + 0.9375; }
      else                   { t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375; }
    case 'ease_in_out':
    default:
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
}

// ── Shared style helpers ───────────────────────────────────────────────────────
function _btmPanelCss() {
  return [
    'background:rgba(13,13,21,0.88);border:1px solid rgba(255,255,255,0.07);',
    'border-radius:10px;backdrop-filter:blur(8px);padding:7px 14px;',
    'display:flex;align-items:center;gap:8px;font-size:11px;',
    'color:var(--qc-color-text-primary,#868a91);white-space:nowrap;',
  ].join('');
}

function _btmTitle(text) {
  var el = document.createElement('span');
  el.textContent = text;
  el.style.cssText = 'font-size:10px;font-weight:600;letter-spacing:0.08em;opacity:0.45;text-transform:uppercase;flex-shrink:0;';
  return el;
}

function _btmDivider() {
  var el = document.createElement('div');
  el.style.cssText = 'width:1px;height:16px;background:rgba(255,255,255,0.08);flex-shrink:0;';
  return el;
}

function _vpBtnCss() {
  return 'display:flex;align-items:center;gap:6px;height:26px;padding:0 10px;border:1px solid rgba(255,255,255,0.1);border-radius:5px;background:rgba(255,255,255,0.04);color:var(--qc-color-text-primary,#868a91);font-size:10px;font-family:inherit;cursor:pointer;transition:background 0.12s,border-color 0.12s;flex-shrink:0;';
}

// Watch classList changes to apply active styles
function _watchActiveClass(btn) {
  new MutationObserver(function() {
    if (btn.classList.contains('active')) {
      btn.style.borderColor = 'var(--qc-color-primary,#56a8f5)';
      btn.style.color = 'var(--qc-color-primary,#56a8f5)';
    } else {
      btn.style.borderColor = 'rgba(255,255,255,0.1)';
      btn.style.color = 'var(--qc-color-text-primary,#868a91)';
    }
  }).observe(btn, { attributes: true, attributeFilter: ['class'] });
}

var _sliderThumbInjected = false;
function _injectSliderThumbStyle() {
  if (_sliderThumbInjected) return;
  _sliderThumbInjected = true;
  var s = document.createElement('style');
  // Match bridge main.css slider style exactly:
  // track: 3px high, filled with SECONDARY up to thumb, rest TEXT_DARK
  // thumb: 3px wide × 12px tall rectangle, SECONDARY color
  s.textContent = [
    '.cam-slider{-webkit-appearance:none;appearance:none;width:100%;height:18px;background:transparent;cursor:pointer;padding:0;margin:0;}',
    '.cam-slider::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:linear-gradient(to right,var(--qc-color-secondary,#e8a44a) 0%,var(--qc-color-secondary,#e8a44a) var(--slider-fill,0%),rgba(255,255,255,0.12) var(--slider-fill,0%),rgba(255,255,255,0.12) 100%);}',
    '.cam-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:3px;height:12px;margin-top:-4.5px;border-radius:1px;background:var(--qc-color-secondary,#e8a44a);border:none;transition:transform 120ms;}',
    '.cam-slider::-webkit-slider-thumb:hover{transform:scaleY(1.2);}',
    '.cam-slider::-moz-range-track{height:3px;border-radius:2px;background:rgba(255,255,255,0.12);}',
    '.cam-slider::-moz-range-progress{height:3px;border-radius:2px;background:var(--qc-color-secondary,#e8a44a);}',
    '.cam-slider::-moz-range-thumb{width:3px;height:12px;border-radius:1px;background:var(--qc-color-secondary,#e8a44a);border:none;box-sizing:border-box;}',
  ].join('');
  document.head.appendChild(s);
}

if (typeof module !== 'undefined') module.exports = { IDECamera };
