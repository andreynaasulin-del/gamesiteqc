/**
 * IDEViewerImage
 * ─────────────────────────────────────────────────────────────────────────────
 * Image viewer for scenario-driven IDE emulation.
 *
 * Features:
 *   • Displays any image URL / data-URI
 *   • object-fit modes: contain | cover | fill | actual (1:1 pixels)
 *   • Optional zoom + pan (mouse wheel + drag) when fit='actual' or zoom enabled
 *   • Smooth fade-in on load
 *   • Optionally wrapped in IDECustomWindow floating panel
 *
 * Usage (standalone):
 *   var viewer = new IDEViewerImage({
 *     src:  '/assets/screenshot.png',
 *     fit:  'contain',    // 'contain' | 'cover' | 'fill' | 'actual'
 *     zoom: true,         // enable mouse-wheel zoom + drag pan
 *     bg:   '#000',       // background color (default transparent)
 *   });
 *   viewer.mount(document.getElementById('img-root'));
 *
 * Usage (wrapped in floating window):
 *   var viewer = new IDEViewerImage({ src: '/screenshot.png' });
 *   var win = viewer.openInWindow({ title: 'Screenshot', width: 800, height: 600 });
 *   win.mount(document.body);
 *   win.show();
 *
 * Public API:
 *   viewer.mount(parent)
 *   viewer.setSource(src)
 *   viewer.setFit(mode)          — 'contain' | 'cover' | 'fill' | 'actual'
 *   viewer.resetZoom()
 *   viewer.destroy()
 *   viewer.openInWindow(winOpts) → IDECustomWindow
 *   viewer.el                    — root element
 */
class IDEViewerImage {
  /**
   * @param {object} opts
   * @param {string}  [opts.src]           — image URL
   * @param {string}  [opts.fit='contain'] — 'contain'|'cover'|'fill'|'actual'
   * @param {boolean} [opts.zoom=false]    — enable wheel zoom + drag pan
   * @param {string}  [opts.bg]            — background CSS color
   * @param {string}  [opts.alt]           — alt text
   * @param {function} [opts.onLoad]
   * @param {function} [opts.onError]
   */
  constructor(opts) {
    opts = opts || {};
    this._src     = opts.src     || '';
    this._fit     = opts.fit     || 'contain';
    this._zoom    = opts.zoom    || false;
    this._bg      = opts.bg      || 'transparent';
    this._alt     = opts.alt     || '';
    this._onLoad  = opts.onLoad  || null;
    this._onError = opts.onError || null;

    this.el       = null;
    this._imgEl   = null;
    this._scale   = 1;
    this._tx      = 0;
    this._ty      = 0;
    this._mounted = false;
  }

  // ── Mount ──────────────────────────────────────────────────────────────────

  mount(parent) {
    if (this._mounted) return this;
    this._mounted = true;

    var self = this;

    var root = document.createElement('div');
    root.style.cssText = [
      'width:100%', 'height:100%',
      'position:relative',
      'overflow:hidden',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:' + this._bg,
    ].join(';') + ';';
    this.el = root;
    parent.appendChild(root);

    // Empty placeholder
    this._placeholder = this._makePlaceholder();
    root.appendChild(this._placeholder);

    // Image element
    var img = document.createElement('img');
    img.alt = this._alt;
    img.style.cssText = [
      'max-width:100%', 'max-height:100%',
      'display:block',
      'opacity:0',
      'transition:opacity 300ms ease',
      'user-select:none',
      'pointer-events:none',
    ].join(';') + ';';
    this._imgEl = img;
    root.appendChild(img);

    this._applyFit();

    img.addEventListener('load', function() {
      self._placeholder.style.display = 'none';
      img.style.opacity = '1';
      if (self._onLoad) self._onLoad(self);
    });
    img.addEventListener('error', function() {
      self._placeholder.style.display = 'flex';
      self._placeholder.querySelector('span:last-child').textContent = 'Cannot load image';
      if (self._onError) self._onError(self);
    });

    if (this._src) img.src = this._src;

    // Zoom + pan
    if (this._zoom) this._addZoomPan(root, img);

    return this;
  }

  _makePlaceholder() {
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
    ico.style.cssText = 'width:32px;height:32px;min-width:32px;--icon:url(\'/_ide/images/icons/coolicons/Interface/Image.png\');opacity:0.18;';
    var lbl = document.createElement('span');
    lbl.textContent = this._src ? 'Loading…' : 'No image selected';
    ph.appendChild(ico);
    ph.appendChild(lbl);
    return ph;
  }

  _applyFit() {
    var img = this._imgEl;
    if (!img) return;
    if (this._fit === 'actual') {
      img.style.maxWidth  = 'none';
      img.style.maxHeight = 'none';
      img.style.width     = 'auto';
      img.style.height    = 'auto';
    } else if (this._fit === 'cover') {
      img.style.maxWidth  = '100%';
      img.style.maxHeight = '100%';
      img.style.width     = '100%';
      img.style.height    = '100%';
      img.style.objectFit = 'cover';
    } else if (this._fit === 'fill') {
      img.style.maxWidth  = '100%';
      img.style.maxHeight = '100%';
      img.style.width     = '100%';
      img.style.height    = '100%';
      img.style.objectFit = 'fill';
    } else {
      // contain (default)
      img.style.maxWidth  = '100%';
      img.style.maxHeight = '100%';
      img.style.width     = 'auto';
      img.style.height    = 'auto';
      img.style.objectFit = 'contain';
    }
  }

  // ── Zoom + pan ─────────────────────────────────────────────────────────────

  _addZoomPan(root, img) {
    var self = this;

    // Wheel zoom
    root.addEventListener('wheel', function(e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? 0.9 : 1.1;
      self._scale = Math.min(8, Math.max(0.1, self._scale * delta));
      self._applyTransform(img);
    }, { passive: false });

    // Drag pan
    var dragging = false, sx, sy, stx, sty;
    root.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      stx = self._tx; sty = self._ty;
      root.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      self._tx = stx + (e.clientX - sx);
      self._ty = sty + (e.clientY - sy);
      self._applyTransform(img);
    });
    document.addEventListener('mouseup', function() {
      if (dragging) { dragging = false; root.style.cursor = 'grab'; }
    });
    root.style.cursor = 'grab';
  }

  _applyTransform(img) {
    img.style.transform = 'translate(' + this._tx + 'px,' + this._ty + 'px) scale(' + this._scale + ')';
    img.style.transformOrigin = 'center center';
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Change image source.
   * @param {string} src
   */
  setSource(src) {
    this._src = src;
    if (this._imgEl) {
      this._imgEl.style.opacity = '0';
      if (this._placeholder) {
        this._placeholder.style.display = 'flex';
        var lbl = this._placeholder.querySelector('span:last-child');
        if (lbl) lbl.textContent = 'Loading…';
      }
      this._imgEl.src = src;
    }
    return this;
  }

  /**
   * Change fit mode.
   * @param {string} mode  — 'contain'|'cover'|'fill'|'actual'
   */
  setFit(mode) {
    this._fit = mode;
    this._applyFit();
    return this;
  }

  /** Reset zoom and pan to default. */
  resetZoom() {
    this._scale = 1;
    this._tx    = 0;
    this._ty    = 0;
    if (this._imgEl) this._applyTransform(this._imgEl);
    return this;
  }

  /** Destroy and remove from DOM. */
  destroy() {
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
    winOpts.title  = winOpts.title  || (this._src ? this._src.split('/').pop() : 'Image');
    winOpts.width  = winOpts.width  || 640;
    winOpts.height = winOpts.height || 480;

    var win = new IDECustomWindow(winOpts);
    this.mount(win.contentEl);
    return win;
  }
}

if (typeof module !== 'undefined') module.exports = { IDEViewerImage };
