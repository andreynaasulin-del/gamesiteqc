/**
 * IDEViewerSound
 * ─────────────────────────────────────────────────────────────────────────────
 * Audio / sound viewer for scenario-driven IDE emulation.
 *
 * Two rendering modes:
 *   'bridge'   — uses QC.media.SoundPlayer (bridge-styled waveform player).
 *                Falls back to 'embedded' if not available.
 *   'embedded' — compact HTML5 <audio> player with custom waveform visualiser.
 *
 * Optionally wrapped in IDECustomWindow floating panel.
 *
 * Usage (standalone):
 *   var viewer = new IDEViewerSound({
 *     src:      '/.temp/recordings/narration.mp3',
 *     mode:     'bridge',    // 'bridge' | 'embedded'
 *     autoplay: false,
 *     loop:     false,
 *     volume:   0.8,
 *   });
 *   viewer.mount(document.getElementById('audio-root'));
 *   viewer.play();
 *
 * Usage (wrapped in floating window):
 *   var viewer = new IDEViewerSound({ src: '/narration.mp3' });
 *   var win = viewer.openInWindow({ title: 'Narration', width: 480, height: 160 });
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
 *   viewer.openInWindow(winOpts) → IDECustomWindow
 *   viewer.el                  — root element
 */
class IDEViewerSound {
  /**
   * @param {object} opts
   * @param {string}  [opts.src]           — audio URL / path
   * @param {string}  [opts.mode='bridge'] — 'bridge' | 'embedded'
   * @param {boolean} [opts.autoplay=false]
   * @param {boolean} [opts.loop=false]
   * @param {number}  [opts.volume=0.8]
   * @param {string}  [opts.name]          — display name
   * @param {string}  [opts.variant='default'] — bridge player variant
   * @param {function} [opts.onReady]
   * @param {function} [opts.onEnded]
   */
  constructor(opts) {
    opts = opts || {};
    this._src      = opts.src      || '';
    this._mode     = opts.mode     || 'bridge';
    this._autoplay = opts.autoplay || false;
    this._loop     = opts.loop     || false;
    this._volume   = opts.volume   !== undefined ? opts.volume : 0.8;
    this._name     = opts.name     || this._nameFromSrc(opts.src || '');
    // Always use 'default' variant — compact mode hides filename/duration which
    // looks broken in a floating window. Caller can override via opts.variant.
    this._variant  = opts.variant  || 'default';
    this._onReady  = opts.onReady  || null;
    this._onEnded  = opts.onEnded  || null;

    this.el        = null;
    this._player   = null;   // QC.media.SoundPlayer (bridge mode)
    this._audioEl  = null;   // <audio> element (embedded mode)
    this._vizCtx   = null;   // AudioContext for visualiser
    this._mounted  = false;
  }

  // ── Mount ──────────────────────────────────────────────────────────────────

  mount(parent) {
    if (this._mounted) return this;
    this._mounted = true;

    var useBridge = (this._mode === 'bridge') &&
                    typeof window !== 'undefined' &&
                    window.QC && window.QC.media && window.QC.media.SoundPlayer;

    if (useBridge) {
      this._mountBridge(parent);
    } else {
      this._mountEmbedded(parent);
    }

    return this;
  }

  // ── Bridge mode ────────────────────────────────────────────────────────────

  _mountBridge(parent) {
    var self = this;

    var root = document.createElement('div');
    root.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;';
    root._viewer = this;  // allow IDECustomWindow._stopInnerMedia to find us
    this.el = root;
    parent.appendChild(root);

    this._player = new window.QC.media.SoundPlayer({
      root:    root,
      src:     this._src,
      name:    this._name,
      volume:  this._volume,
      variant: this._variant,
    });

    var sp = this._player;
    if (sp.audio) {
      if (this._onReady) sp.audio.addEventListener('canplay', function() { self._onReady(self); }, { once: true });
      if (this._onEnded) sp.audio.addEventListener('ended',   function() { self._onEnded(self); });
      sp.audio.loop   = this._loop;
      sp.audio.volume = this._volume;
    }

    if (this._autoplay && this._src) {
      setTimeout(function() { self.play(); }, 80);
    }
  }

  // ── Embedded mode ──────────────────────────────────────────────────────────

  _mountEmbedded(parent) {
    var self = this;

    var root = document.createElement('div');
    root._viewer = this;  // allow IDECustomWindow._stopInnerMedia to find us
    root.style.cssText = [
      'width:100%', 'height:100%',
      'min-height:120px',
      'display:flex', 'flex-direction:column',
      'align-items:stretch', 'justify-content:center',
      'gap:12px',
      'padding:16px',
      'box-sizing:border-box',
      'background:var(--qc-color-bg-primary,#13131f)',
    ].join(';') + ';';
    this.el = root;
    parent.appendChild(root);

    // Track name
    var nameEl = document.createElement('div');
    nameEl.style.cssText = [
      'font-size:11px',
      'font-weight:600',
      'letter-spacing:0.06em',
      'text-transform:uppercase',
      'color:var(--qc-color-text-secondary,#888)',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
    ].join(';') + ';';
    nameEl.textContent = this._name || 'Audio';
    root.appendChild(nameEl);

    // Waveform canvas (static decorative bars)
    var canvas = document.createElement('canvas');
    canvas.height = 40;
    canvas.style.cssText = 'width:100%;height:40px;display:block;border-radius:4px;';
    root.appendChild(canvas);
    this._canvas = canvas;
    this._drawStaticWaveform(canvas);

    // Progress bar + time
    var progressWrap = document.createElement('div');
    progressWrap.style.cssText = [
      'display:flex', 'align-items:center', 'gap:8px',
    ].join(';') + ';';

    var timeEl = document.createElement('span');
    timeEl.style.cssText = 'font-size:10px;color:var(--qc-color-text-info,#555);min-width:36px;';
    timeEl.textContent = '0:00';
    this._timeEl = timeEl;

    var progress = document.createElement('input');
    progress.type = 'range';
    progress.min  = '0';
    progress.max  = '100';
    progress.value = '0';
    progress.style.cssText = 'flex:1;height:3px;accent-color:var(--qc-color-accent,#7c6af7);cursor:pointer;';
    this._progressEl = progress;

    var durEl = document.createElement('span');
    durEl.style.cssText = 'font-size:10px;color:var(--qc-color-text-info,#555);min-width:36px;text-align:right;';
    durEl.textContent = '0:00';
    this._durEl = durEl;

    progressWrap.appendChild(timeEl);
    progressWrap.appendChild(progress);
    progressWrap.appendChild(durEl);
    root.appendChild(progressWrap);

    // Controls row
    var controls = document.createElement('div');
    controls.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:center', 'gap:12px',
    ].join(';') + ';';

    var playBtn = this._makeControlBtn('/_ide/images/icons/coolicons/Media/Play.png', function() {
      if (self._audioEl.paused) self.play(); else self.pause();
    });
    this._playBtn = playBtn;

    var volSlider = document.createElement('input');
    volSlider.type  = 'range';
    volSlider.min   = '0';
    volSlider.max   = '1';
    volSlider.step  = '0.01';
    volSlider.value = String(this._volume);
    volSlider.style.cssText = 'width:64px;height:3px;accent-color:var(--qc-color-accent,#7c6af7);cursor:pointer;';
    volSlider.addEventListener('input', function() { self.setVolume(parseFloat(volSlider.value)); });

    controls.appendChild(playBtn);
    controls.appendChild(volSlider);
    root.appendChild(controls);

    // Hidden <audio>
    var audio = document.createElement('audio');
    audio.src     = this._src;
    audio.loop    = this._loop;
    audio.volume  = this._volume;
    audio.preload = 'metadata';
    if (this._autoplay) audio.autoplay = true;
    root.appendChild(audio);
    this._audioEl = audio;

    // Wire events
    audio.addEventListener('timeupdate', function() {
      if (!audio.duration) return;
      progress.value = (audio.currentTime / audio.duration * 100).toFixed(1);
      timeEl.textContent = self._fmtTime(audio.currentTime);
    });
    audio.addEventListener('loadedmetadata', function() {
      durEl.textContent = self._fmtTime(audio.duration);
    });
    audio.addEventListener('play',  function() { playBtn.querySelector('span').style.setProperty('--icon', 'url(\'/_ide/images/icons/coolicons/Media/Pause.png\')'); });
    audio.addEventListener('pause', function() { playBtn.querySelector('span').style.setProperty('--icon', 'url(\'/_ide/images/icons/coolicons/Media/Play.png\')'); });
    audio.addEventListener('ended', function() {
      playBtn.querySelector('span').style.setProperty('--icon', 'url(\'/_ide/images/icons/coolicons/Media/Play.png\')');
      if (self._onEnded) self._onEnded(self);
    });
    if (this._onReady) audio.addEventListener('canplay', function() { self._onReady(self); }, { once: true });

    progress.addEventListener('input', function() {
      if (audio.duration) audio.currentTime = parseFloat(progress.value) / 100 * audio.duration;
    });

    if (!this._src) this._showEmpty(root);
  }

  _makeControlBtn(iconUrl, onClick) {
    var btn = document.createElement('button');
    btn.style.cssText = [
      'width:28px', 'height:28px',
      'border:none', 'background:var(--qc-color-bg-secondary,rgba(255,255,255,0.06))',
      'border-radius:50%', 'cursor:pointer',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:0',
    ].join(';') + ';';
    var ico = document.createElement('span');
    ico.className = 'icon';
    ico.style.cssText = 'width:14px;height:14px;min-width:14px;--icon:url(\'' + iconUrl + '\');';
    btn.appendChild(ico);
    btn.addEventListener('click', onClick);
    return btn;
  }

  _drawStaticWaveform(canvas) {
    // Draw decorative static waveform bars
    var ctx = canvas.getContext('2d');
    var W = canvas.offsetWidth || 300;
    canvas.width = W;
    var H = canvas.height;
    var bars = Math.floor(W / 4);
    var accent = '#7c6af7';
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < bars; i++) {
      var h = (0.15 + Math.abs(Math.sin(i * 0.37 + 1.2)) * 0.7) * H;
      var x = i * 4;
      var alpha = 0.25 + Math.abs(Math.sin(i * 0.13)) * 0.45;
      ctx.fillStyle = accent;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.roundRect(x, (H - h) / 2, 2, h, 1);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _showEmpty(root) {
    var ph = document.createElement('div');
    ph.style.cssText = [
      'position:absolute', 'inset:0',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'gap:8px',
      'color:var(--qc-color-text-info,#555)',
      'font-size:12px', 'pointer-events:none',
    ].join(';') + ';';
    var ico = document.createElement('span');
    ico.className = 'icon';
    ico.style.cssText = 'width:28px;height:28px;min-width:28px;--icon:url(\'/_ide/images/icons/coolicons/Media/Music_Note.png\');opacity:0.18;';
    ph.appendChild(ico);
    ph.appendChild(document.createTextNode('No audio selected'));
    root.style.position = 'relative';
    root.appendChild(ph);
  }

  _fmtTime(s) {
    if (!isFinite(s)) return '0:00';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  play() {
    if (this._player) return this._player.play();
    if (this._audioEl) return this._audioEl.play().then(function() { return true; }).catch(function() { return false; });
    return Promise.resolve(false);
  }

  pause() {
    if (this._player) this._player.pause();
    else if (this._audioEl) this._audioEl.pause();
    return this;
  }

  seek(seconds) {
    if (this._player) this._player.seek(seconds);
    else if (this._audioEl) this._audioEl.currentTime = seconds;
    return this;
  }

  setVolume(v) {
    this._volume = Math.min(1, Math.max(0, v));
    if (this._player) this._player.setVolume(this._volume);
    else if (this._audioEl) this._audioEl.volume = this._volume;
    return this;
  }

  setSource(src, name) {
    this._src  = src;
    this._name = name || this._nameFromSrc(src);
    if (this._player) this._player.setSource(src, this._name);
    else if (this._audioEl) {
      this._audioEl.src = src;
      this._audioEl.load();
    }
    return this;
  }

  destroy() {
    if (this._player) this._player.destroy();
    else if (this._audioEl) {
      this._audioEl.pause();
      this._audioEl.removeAttribute('src');
      this._audioEl.load();
    }
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    return this;
  }

  /**
   * Wrap in IDECustomWindow floating panel.
   * @param {object} winOpts
   * @returns {IDECustomWindow}
   */
  openInWindow(winOpts) {
    winOpts = winOpts || {};
    winOpts.title     = winOpts.title     || this._name || 'Audio';
    winOpts.width     = winOpts.width     || 480;
    winOpts.height    = winOpts.height    || 180;
    winOpts.autostart = winOpts.autostart !== undefined ? winOpts.autostart : this._autoplay;

    var win = new IDECustomWindow(winOpts);
    this.mount(win.contentEl);
    return win;
  }

  _nameFromSrc(src) {
    if (!src) return '';
    return src.split('/').pop().split('?')[0] || src;
  }
}

if (typeof module !== 'undefined') module.exports = { IDEViewerSound };
