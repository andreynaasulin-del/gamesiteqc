/**
 * IDEBrowser
 * ─────────────────────────────────────────────────────────────────────────────
 * Emulates the embedded webview panel from Python multi_tab_viewer_widget.py
 * (MultiTabType.BROWSER tabs).
 *
 * Structure:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  [←][→][↺]  [ url bar .......................... ]  │  ← toolbar
 *   ├─────────────────────────────────────────────────────┤
 *   │                                                     │
 *   │              content placeholder / iframe           │  ← viewport
 *   │                                                     │
 *   └─────────────────────────────────────────────────────┘
 *
 * Integration points:
 *   • IDETabHolder  — pass a tabHolder instance; browser opens new tabs in it
 *   • IDEMainPanel  — pass a mainPanel instance; browser can trigger panel actions
 *   • onNavigate(url) callback — called when user navigates
 *   • onTitleChange(title) callback — called when page title changes
 *
 * Usage:
 *   var browser = new IDEBrowser({
 *     url: 'https://example.com',
 *     tabHolder: myTabHolder,   // optional
 *     onNavigate: fn,           // optional
 *   });
 *   browser.mount(paneEl);
 *   browser.navigate('https://other.com');
 */
class IDEBrowser {
  constructor(opts) {
    opts = opts || {};
    this._url        = opts.url        || '';
    this._tabHolder  = opts.tabHolder  || null;
    this._mainPanel  = opts.mainPanel  || null;
    this._onNavigate = opts.onNavigate || null;
    this._onTitle    = opts.onTitleChange || null;
    this._loading    = false;
    this._loadingTimers = [];
    this._history    = [];
    this._histIdx    = -1;
    this.el          = null;
    this._urlInput   = null;
    this._viewport   = null;
    this._backBtn    = null;
    this._fwdBtn     = null;
    this._reloadBtn  = null;
    this._favicon    = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Normalize optional HTML iframe scale values.
   * Accepts `0.9` and compact `x0.9`; invalid values fall back to 1.
   * Video rendering intentionally does not use this helper.
   * @param {number|string} value
   * @returns {number}
   */
  static normalizeContentScale(value) {
    if (typeof value === 'string') value = value.trim().replace(/^x/i, '');
    var scale = Number(value);
    return Number.isFinite(scale) && scale > 0 && scale <= 1 ? scale : 1;
  }

  /**
   * Scale a same-origin document inside an iframe while the iframe itself keeps
   * its full viewport area. Cross-origin documents cannot be styled by design.
   */
  static applyContentScale(frame, value) {
    var scale = IDEBrowser.normalizeContentScale(value);
    if (scale === 1) return true;

    try {
      var doc = frame.contentDocument;
      if (!doc || !doc.documentElement) return false;
      var style = doc.getElementById('__ide-content-scale');
      if (!style) {
        style = doc.createElement('style');
        style.id = '__ide-content-scale';
        (doc.head || doc.documentElement).appendChild(style);
      }
      style.textContent = [
        'html, body {',
        '  width:100% !important;',
        '  height:100% !important;',
        '  min-height:0 !important;',
        '  margin:0 !important;',
        '  padding:0 !important;',
        '  overflow:hidden !important;',
        '}',
        'body {',
        '  width:calc(100% / ' + scale + ') !important;',
        '  height:calc(100% / ' + scale + ') !important;',
        '  transform:scale(' + scale + ') !important;',
        '  transform-origin:top left !important;',
        '}',
      ].join('\n');
      return true;
    } catch (error) {
      console.warn('[IDEBrowser] iframe content scale requires a same-origin URL');
      return false;
    }
  }

  mount(parent) {
    this._injectStyles();
    this.el = this._build();
    parent.appendChild(this.el);
    if (this._url) this.navigate(this._url, true);
  }

  /** Navigate to a URL */
  navigate(url, silent) {
    if (!url) return;
    // Normalise
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/_ide') && !url.startsWith('/')) {
      url = 'https://' + url;
    }
    this._url = url;
    if (this._urlInput) this._urlInput.value = url;

    // Push history
    if (!silent) {
      this._history = this._history.slice(0, this._histIdx + 1);
      this._history.push(url);
      this._histIdx = this._history.length - 1;
    }
    this._updateNavBtns();
    this._showLoading(url);

    if (this._onNavigate) this._onNavigate(url);
  }

  /** Go back */
  back() {
    if (this._histIdx > 0) {
      this._histIdx--;
      this.navigate(this._history[this._histIdx], true);
    }
  }

  /** Go forward */
  forward() {
    if (this._histIdx < this._history.length - 1) {
      this._histIdx++;
      this.navigate(this._history[this._histIdx], true);
    }
  }

  /** Reload */
  reload() {
    this._showLoading(this._url);
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  _build() {
    var self = this;

    var root = document.createElement('div');
    root.className = 'ide-browser';
    root.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;';

    // ── Toolbar — hidden by default for clean IDE emulation ──────────────────
    var toolbar = document.createElement('div');
    toolbar.className = 'ide-browser__toolbar';
    toolbar.style.cssText = [
      'display:none',
      'align-items:center',
      'gap:4px',
      'padding:4px 8px',
      'flex-shrink:0',
      'background:var(--qc-color-bg-secondary,rgba(255,255,255,0.03))',
      'border-bottom:1px solid var(--qc-color-divider,rgba(255,255,255,0.06))',
    ].join(';') + ';';

    // Back
    this._backBtn = this._makeNavBtn('images/icons/coolicons/Arrow/Chevron_Left_MD.png', 'Back', function() { self.back(); });
    // Forward
    this._fwdBtn  = this._makeNavBtn('images/icons/coolicons/Arrow/Chevron_Right_MD.png', 'Forward', function() { self.forward(); });
    // Reload
    this._reloadBtn = this._makeNavBtn('images/icons/coolicons/Interface/Refresh.png', 'Reload', function() { self.reload(); });

    toolbar.appendChild(this._backBtn);
    toolbar.appendChild(this._fwdBtn);
    toolbar.appendChild(this._reloadBtn);

    // Favicon
    var faviconWrap = document.createElement('div');
    faviconWrap.style.cssText = 'width:16px;height:16px;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-left:4px;';
    this._favicon = document.createElement('span');
    this._favicon.className = 'icon';
    this._favicon.style.cssText = 'width:14px;height:14px;min-width:14px;min-height:14px;--icon:url(\'/_ide/images/icons/file_extensions/webpack.png\');opacity:0.5;';
    faviconWrap.appendChild(this._favicon);
    toolbar.appendChild(faviconWrap);

    // URL bar
    var urlWrap = document.createElement('div');
    urlWrap.style.cssText = 'flex:1;display:flex;align-items:center;background:var(--qc-color-bg-primary,#111);border-radius:5px;padding:0 8px;height:24px;';

    this._urlInput = document.createElement('input');
    this._urlInput.type = 'text';
    this._urlInput.className = 'textbox';
    this._urlInput.placeholder = 'Enter URL…';
    this._urlInput.value = this._url;
    this._urlInput.style.cssText = 'flex:1;background:transparent;border:none;outline:none;font-size:11px;padding:0;height:100%;color:var(--qc-color-text-primary,#ccc);';
    this._urlInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') self.navigate(self._urlInput.value.trim());
    });
    urlWrap.appendChild(this._urlInput);
    toolbar.appendChild(urlWrap);
    this._urlWrap = urlWrap;

    // Open in new tab btn
    var newTabBtn = this._makeNavBtn('images/icons/coolicons/Interface/External_Link.png', 'Open in new tab', function() {
      if (self._tabHolder) {
        var url = self._url;
        var label = self._getPageTitle(url);
        self._tabHolder.addTab({
          type: 'browser',
          label: label,
          url: url,
          contentBuilder: function(pane) {
            var b = new IDEBrowser({ url: url, tabHolder: self._tabHolder });
            b.mount(pane);
          },
        });
      }
    });
    toolbar.appendChild(newTabBtn);

    // ── Viewport ─────────────────────────────────────────────────────────────
    var viewport = document.createElement('div');
    viewport.className = 'ide-browser__viewport';
    viewport.style.cssText = 'flex:1;overflow:hidden;position:relative;display:flex;flex-direction:column;';
    this._viewport = viewport;

    root.appendChild(toolbar);
    root.appendChild(viewport);

    this._updateNavBtns();
    return root;
  }

  // ── Loading / content placeholder ─────────────────────────────────────────

  _cancelLoadingTimers() {
    this._loadingTimers.forEach(function(t) { clearTimeout(t); });
    this._loadingTimers = [];
  }

  _showLoading(url) {
    var self = this;
    var vp = this._viewport;
    this._cancelLoadingTimers();
    vp.innerHTML = '';

    // Loading bar
    var bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;top:0;left:0;height:2px;background:var(--qc-color-secondary,#e8a44a);width:0;transition:width 0.4s ease;z-index:10;';
    vp.appendChild(bar);

    // Animate bar — track timers so showStaticPage/playVideoFile can cancel them
    this._loadingTimers.push(setTimeout(function() { bar.style.width = '70%'; }, 30));
    this._loadingTimers.push(setTimeout(function() { bar.style.width = '90%'; }, 500));
    this._loadingTimers.push(setTimeout(function() {
      bar.style.width = '100%';
      self._loadingTimers.push(setTimeout(function() {
        bar.remove();
        self._showContent(url);
      }, 200));
    }, 900));
  }

  _showContent(url) {
    var vp = this._viewport;
    vp.innerHTML = '';

    var title = this._getPageTitle(url);
    if (this._onTitle) this._onTitle(title);

    // Content placeholder — shows domain + mock page skeleton
    var ph = document.createElement('div');
    ph.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:24px 20px;overflow-y:auto;';

    // Mock browser chrome — address bar reflection
    var domainBadge = document.createElement('div');
    domainBadge.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:20px;padding:6px 14px;border-radius:20px;background:var(--qc-color-bg-secondary,rgba(255,255,255,0.04));font-size:11px;color:var(--qc-color-text-info,#666);';
    var lockIco = document.createElement('span');
    lockIco.className = 'icon';
    lockIco.style.cssText = 'width:12px;height:12px;min-width:12px;--icon:url(\'/_ide/images/icons/coolicons/Interface/Lock.png\');opacity:0.4;';
    domainBadge.appendChild(lockIco);
    var domainLbl = document.createElement('span');
    domainLbl.textContent = this._getDomain(url);
    domainBadge.appendChild(domainLbl);
    ph.appendChild(domainBadge);

    // Page skeleton
    var skeleton = this._buildPageSkeleton(url, title);
    ph.appendChild(skeleton);

    vp.appendChild(ph);
  }

  _buildPageSkeleton(url, title) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;max-width:640px;display:flex;flex-direction:column;gap:12px;';

    // Title bar
    var h = document.createElement('div');
    h.style.cssText = 'height:18px;border-radius:4px;background:var(--qc-color-bg-secondary2,rgba(255,255,255,0.07));width:60%;';
    wrap.appendChild(h);

    // Subtitle
    var sub = document.createElement('div');
    sub.style.cssText = 'height:12px;border-radius:3px;background:var(--qc-color-bg-secondary,rgba(255,255,255,0.04));width:40%;';
    wrap.appendChild(sub);

    // Divider
    var hr = document.createElement('div');
    hr.style.cssText = 'height:1px;background:var(--qc-color-divider,rgba(255,255,255,0.06));margin:4px 0;';
    wrap.appendChild(hr);

    // Content lines
    [80, 95, 70, 85, 60, 90, 75].forEach(function(w) {
      var line = document.createElement('div');
      line.style.cssText = 'height:10px;border-radius:3px;background:var(--qc-color-bg-secondary,rgba(255,255,255,0.04));width:' + w + '%;';
      wrap.appendChild(line);
    });

    // Image placeholder
    var img = document.createElement('div');
    img.style.cssText = 'height:120px;border-radius:6px;background:var(--qc-color-bg-secondary2,rgba(255,255,255,0.06));margin-top:8px;display:flex;align-items:center;justify-content:center;';
    var imgIco = document.createElement('span');
    imgIco.className = 'icon';
    imgIco.style.cssText = 'width:24px;height:24px;min-width:24px;--icon:url(\'/_ide/images/icons/coolicons/Interface/Image.png\');opacity:0.15;';
    img.appendChild(imgIco);
    wrap.appendChild(img);

    // More lines
    [65, 88, 72].forEach(function(w) {
      var line = document.createElement('div');
      line.style.cssText = 'height:10px;border-radius:3px;background:var(--qc-color-bg-secondary,rgba(255,255,255,0.04));width:' + w + '%;';
      wrap.appendChild(line);
    });

    // URL label at bottom
    var urlLbl = document.createElement('div');
    urlLbl.style.cssText = 'margin-top:16px;font-size:10px;color:var(--qc-color-text-dark,#444);text-align:center;word-break:break-all;';
    urlLbl.textContent = url;
    wrap.appendChild(urlLbl);

    return wrap;
  }

  // ── Nav buttons ────────────────────────────────────────────────────────────

  _makeNavBtn(iconPath, title, onClick) {
    var btn = document.createElement('button');
    btn.className = 'button-icon button-icon--small';
    btn.title = title;
    btn.style.cssText = 'width:22px;height:22px;min-width:22px;min-height:22px;padding:0;display:inline-flex;align-items:center;justify-content:center;';
    var ico = document.createElement('span');
    ico.className = 'icon';
    ico.style.cssText = 'width:14px;height:14px;min-width:14px;min-height:14px;--icon:url(\'/_ide/' + iconPath + '\');';
    btn.appendChild(ico);
    btn.addEventListener('click', onClick);
    return btn;
  }

  _updateNavBtns() {
    if (this._backBtn)   this._backBtn.disabled   = this._histIdx <= 0;
    if (this._fwdBtn)    this._fwdBtn.disabled    = this._histIdx >= this._history.length - 1;
  }

  // ── showStaticPage ─────────────────────────────────────────────────────────
  /**
   * showStaticPage(urlOrHtml, opts?)
   *
   * Renders a non-interactive page snapshot inside the browser viewport.
   * The page is shown as a read-only visual — no clicks, no scrolling.
   *
   * opts:
   *   title    {string}  — label shown in the URL bar (default: derived from url)
   *   poster   {string}  — image URL to show as a "screenshot" overlay instead of iframe
   *   scale    {number|string} — `0 < scale <= 1`; accepts `0.9` or `x0.9` (default: 1)
   *   onReady  {fn}      — called when content is visible
   *
   * Modes:
   *   • If urlOrHtml starts with '<' → injected as raw HTML into a sandboxed iframe
   *   • If poster is provided        → shows poster image (fastest, recording-safe)
   *   • Otherwise                    → loads URL in iframe with pointer-events:none overlay
   */
  showStaticPage(urlOrHtml, opts) {
    opts = opts || {};
    var self = this;
    var vp = this._viewport;
    if (!vp) return;

    // Cancel any pending loading animation that would overwrite our content
    this._cancelLoadingTimers();

    // Update URL bar
    var displayUrl = opts.title || (urlOrHtml.startsWith('<') ? 'snapshot' : urlOrHtml);
    if (this._urlInput) this._urlInput.value = displayUrl;
    this._url = displayUrl;
    this._updateNavBtns();

    vp.innerHTML = '';

    // ── Mode 1: poster image (screenshot snapshot) ──────────────────────────
    if (opts.poster) {
      var img = document.createElement('img');
      img.src = opts.poster;
      img.style.cssText = [
        'width:100%', 'height:100%', 'object-fit:cover',
        'object-position:top left', 'display:block',
        'pointer-events:none', 'user-select:none',
      ].join(';') + ';';
      img.onload = function() { if (opts.onReady) opts.onReady(); };
      vp.appendChild(img);

      // Non-interactive overlay badge
      vp.appendChild(this._makeStaticBadge());
      return;
    }

    // ── Mode 2: raw HTML injected into sandboxed iframe ──────────────────────
    var isHtml = urlOrHtml.trim().startsWith('<');
    var scale  = IDEBrowser.normalizeContentScale(opts.scale);

    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';

    var frame = document.createElement('iframe');
    // The iframe always fills the panel. Scale is injected into its same-origin
    // document on load, so only page content changes size—not the viewport.
    frame.style.cssText = [
      'width:100%',
      'height:100%',
      'border:none',
      'display:block',
      'pointer-events:none',   // non-interactive
      'user-select:none',
    ].join(';') + ';';

    if (isHtml) {
      // Inject raw HTML via srcdoc (sandboxed — no scripts by default)
      frame.setAttribute('sandbox', 'allow-same-origin');
      frame.srcdoc = urlOrHtml;
    } else {
      // Load URL in a sandboxed iframe.
      // sandbox="allow-same-origin allow-scripts allow-forms" lets the page run
      // its own scripts but blocks top-level navigation and popups.
      // Critically: QWebEngineScript injection (bridge/quadcode-ide.js) does NOT
      // run inside sandboxed iframes — this prevents bridge from initialising
      // inside our mock's sub-frames, which was causing QWebChannel callbacks to
      // fire resize/layout events that collapsed the real IDE's panel splitter.
      frame.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups');
      frame.src = urlOrHtml;
    }

    frame.onload = function() {
      IDEBrowser.applyContentScale(frame, scale);
      if (opts.onReady) opts.onReady();
    };

    // Transparent interaction-blocking overlay
    var overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:absolute', 'inset:0', 'z-index:10',
      'cursor:default',
      // Subtle vignette to signal "read-only"
      'background:radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.18) 100%)',
    ].join(';') + ';';

    wrap.appendChild(frame);
    wrap.appendChild(overlay);
    wrap.appendChild(this._makeStaticBadge());
    vp.appendChild(wrap);
  }

  /** Small "read-only" badge shown in corner of static pages */
  _makeStaticBadge() {
    var badge = document.createElement('div');
    badge.style.cssText = [
      'position:absolute', 'bottom:8px', 'right:8px', 'z-index:20',
      'display:flex', 'align-items:center', 'gap:5px',
      'padding:3px 8px', 'border-radius:10px',
      'background:rgba(0,0,0,0.55)',
      'font-size:10px', 'color:rgba(255,255,255,0.4)',
      'pointer-events:none', 'user-select:none',
    ].join(';') + ';';
    var ico = document.createElement('span');
    ico.className = 'icon';
    ico.style.cssText = 'width:10px;height:10px;min-width:10px;--icon:url(\'/_ide/images/icons/coolicons/Interface/Lock.png\');opacity:0.4;';
    badge.appendChild(ico);
    badge.appendChild(document.createTextNode('read-only'));
    return badge;
  }

  // ── showEmpty ──────────────────────────────────────────────────────────────
  /**
   * showEmpty(opts?)
   *
   * Renders an empty placeholder state — no video loaded yet.
   * The viewport shows a subtle icon + label so the browser tab looks intentional.
   * Calling switchVideo() or playVideoFile() later replaces this state.
   *
   * opts:
   *   label   {string}  — placeholder text (default 'No content yet')
   *   icon    {boolean} — show icon (default true)
   *
   * The _videoSrc is set to null so resize_ide_to_perfect_fit() can detect
   * the empty state and skip (or use a fallback size).
   */
  showEmpty(opts) {
    opts = opts || {};
    this._videoSrc = null;
    this._videoEl  = null;

    var vp = this._viewport;
    if (!vp) return;
    vp.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.style.cssText = [
      'width:100%', 'height:100%',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'gap:10px',
      'color:var(--qc-color-text-info,#555)',
      'font-size:11px',
      'user-select:none',
    ].join(';');

    if (opts.icon !== false) {
      var ico = document.createElement('span');
      ico.className = 'icon';
      ico.style.cssText = [
        'width:32px', 'height:32px', 'min-width:32px',
        '--icon:url(\'/_ide/images/icons/coolicons/Media/Video_Camera.png\')',
        'opacity:0.18',
      ].join(';');
      wrap.appendChild(ico);
    }

    var lbl = document.createElement('span');
    lbl.style.cssText = 'opacity:0.35;letter-spacing:0.04em;';
    lbl.textContent = opts.label || 'No content yet';
    wrap.appendChild(lbl);

    vp.appendChild(wrap);
  }

  // ── playVideoFile ──────────────────────────────────────────────────────────
  /**
   * playVideoFile(pathOrBlob, opts?)
   *
   * Loads and autoplays a video file inside the browser viewport.
   * Recording-safe: the video element is a regular DOM element — CSS 3D
   * transforms on ancestor divs do NOT affect video capture via
   * getBoundingClientRect() (the bridge recorder handles this correctly).
   *
   * opts:
   *   poster      {string}   — poster image URL shown before playback
   *   autoplay    {boolean}  — default true
   *   loop        {boolean}  — default false
   *   muted       {boolean}  — default true (required for autoplay in most browsers)
   *   controls    {boolean}  — default true
   *   fit         {string}   — 'contain' | 'cover' | 'fill' (default 'contain')
   *   title       {string}   — label shown in URL bar
   *   onReady     {fn}       — called when video can play
   *   onEnded     {fn}       — called when video ends
   *
   * 3D / scaling notes:
   *   • The video element itself is NOT transformed — only the wrapper div may be.
   *   • If the browser component is inside a CSS 3D-rotated container, the video
   *     still renders correctly because the GPU composites it as a flat layer.
   *   • For recording: pass the viewport div (this._viewport) as the capture
   *     element to QC.ui.startBrowserRecording — getBoundingClientRect() returns
   *     the visual rect after all transforms automatically.
   */
  playVideoFile(pathOrBlob, opts) {
    opts = opts || {};
    var self = this;
    var vp = this._viewport;
    if (!vp) return;

    // Cancel any pending loading animation
    this._cancelLoadingTimers();

    var src = (pathOrBlob instanceof Blob || pathOrBlob instanceof File)
      ? URL.createObjectURL(pathOrBlob)
      : pathOrBlob;

    // Update URL bar
    var label = opts.title || (typeof pathOrBlob === 'string'
      ? pathOrBlob.split('/').pop()
      : 'video');
    if (this._urlInput) this._urlInput.value = label;
    this._url = label;
    this._updateNavBtns();

    vp.innerHTML = '';

    // Wrapper — fills viewport, black bg
    var wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:relative', 'width:100%', 'height:100%',
      'background:#000', 'display:flex',
      'align-items:center', 'justify-content:center',
      'overflow:hidden',
    ].join(';') + ';';

    // Video element
    var video = document.createElement('video');
    video.src = src;
    video.style.cssText = [
      'width:100%', 'height:100%',
      'object-fit:' + (opts.fit || 'contain'),
      'display:block',
      // Ensure video is NOT 3D-transformed itself — stays flat for GPU compositing
      'transform:none',
      'will-change:auto',
    ].join(';') + ';';

    if (opts.poster)               video.poster   = opts.poster;
    video.autoplay  = opts.autoplay  !== false;
    video.loop      = opts.loop      || false;
    video.muted     = opts.muted     !== false;   // muted required for autoplay
    video.controls  = opts.controls  !== false;
    video.playsInline = true;                     // iOS / embedded safe

    // Revoke blob URL on unload to avoid memory leaks
    if (pathOrBlob instanceof Blob || pathOrBlob instanceof File) {
      video.addEventListener('emptied', function() {
        URL.revokeObjectURL(src);
      });
    }

    video.addEventListener('canplay', function() {
      if (opts.onReady) opts.onReady(video);
    });
    video.addEventListener('ended', function() {
      if (opts.onEnded) opts.onEnded(video);
    });
    video.addEventListener('error', function() {
      self._showVideoError(wrap, label);
    });

    wrap.appendChild(video);

    // ── Recording-safe overlay info ──────────────────────────────────────────
    // Tiny badge in corner — does NOT interfere with video capture
    var infoBadge = document.createElement('div');
    infoBadge.style.cssText = [
      'position:absolute', 'top:8px', 'right:8px', 'z-index:10',
      'display:flex', 'align-items:center', 'gap:5px',
      'padding:3px 8px', 'border-radius:10px',
      'background:rgba(0,0,0,0.55)',
      'font-size:10px', 'color:rgba(255,255,255,0.5)',
      'pointer-events:none', 'user-select:none',
      'opacity:1', 'transition:opacity 2s ease',
    ].join(';') + ';';
    var vidIco = document.createElement('span');
    vidIco.className = 'icon';
    vidIco.style.cssText = 'width:10px;height:10px;min-width:10px;--icon:url(\'/_ide/images/icons/coolicons/Media/Video.png\');opacity:0.6;';
    infoBadge.appendChild(vidIco);
    infoBadge.appendChild(document.createTextNode(label));
    wrap.appendChild(infoBadge);

    // Fade badge out after 3s
    setTimeout(function() { infoBadge.style.opacity = '0'; }, 3000);

    vp.appendChild(wrap);

    // Attempt autoplay (may be blocked by browser policy if not muted)
    if (video.autoplay) {
      video.play().catch(function() {
        // Autoplay blocked — show play button overlay
        self._showPlayOverlay(wrap, video);
      });
    }

    // Expose video element for external control
    this._videoEl  = video;
    this._videoSrc = src;
    return video;
  }

  /** Shown when autoplay is blocked */
  _showPlayOverlay(wrap, video) {
    var overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:absolute', 'inset:0', 'z-index:20',
      'display:flex', 'align-items:center', 'justify-content:center',
      'cursor:pointer', 'background:rgba(0,0,0,0.3)',
    ].join(';') + ';';
    var btn = document.createElement('div');
    btn.style.cssText = [
      'width:56px', 'height:56px', 'border-radius:50%',
      'background:rgba(255,255,255,0.15)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'backdrop-filter:blur(4px)',
      'transition:background 0.2s',
    ].join(';') + ';';
    var ico = document.createElement('span');
    ico.className = 'icon';
    ico.style.cssText = 'width:24px;height:24px;min-width:24px;--icon:url(\'/_ide/images/icons/coolicons/Media/Play.png\');opacity:0.9;';
    btn.appendChild(ico);
    overlay.appendChild(btn);
    overlay.addEventListener('click', function() {
      video.play();
      overlay.remove();
    });
    btn.addEventListener('mouseenter', function() { btn.style.background = 'rgba(255,255,255,0.25)'; });
    btn.addEventListener('mouseleave', function() { btn.style.background = 'rgba(255,255,255,0.15)'; });
    wrap.appendChild(overlay);
  }

  /**
   * switchVideo(src, opts?)
   *
   * Replace the currently playing video with a new source — in-place, no
   * viewport rebuild.  If no video is playing yet, falls back to playVideoFile().
   *
   * opts:
   *   fade      {number}  — crossfade duration in ms (default 300, 0 = instant)
   *   loop      {boolean} — override loop (keeps existing value if omitted)
   *   muted     {boolean} — override muted
   *   controls  {boolean} — override controls
   *   fit       {string}  — 'contain'|'cover'|'fill'
   *   onReady   {fn}      — called when new video can play
   */
  switchVideo(src, opts) {
    opts = opts || {};
    var fadeDur = opts.fade !== undefined ? opts.fade : 300;

    // Normalise path
    if (src && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('blob:')) {
      src = '/' + src;
    }

    var video = this._videoEl;

    // No existing video — fall back to full playVideoFile
    if (!video) {
      this.playVideoFile(src, opts);
      return;
    }

    // Update _videoSrc immediately so getVideoSrc() / fitToVideo returns the
    // new src right away — even when the visual fade is still in progress.
    this._videoSrc = src;

    if (fadeDur > 0) {
      // Fade out → swap src → fade in
      video.style.transition = 'opacity ' + (fadeDur / 2) + 'ms ease';
      video.style.opacity = '0';
      var self = this;
      setTimeout(function() {
        self._swapVideoSrc(video, src, opts);
        video.style.opacity = '1';
      }, fadeDur / 2);
    } else {
      this._swapVideoSrc(video, src, opts);
    }
  }

  /** Internal: update video element src and optional properties */
  _swapVideoSrc(video, src, opts) {
    // Note: _videoSrc is already set by switchVideo() before the fade timeout.
    // No need to set it again here — but harmless if called directly.
    if (opts.loop     !== undefined) video.loop     = opts.loop;
    if (opts.muted    !== undefined) video.muted    = opts.muted;
    if (opts.controls !== undefined) video.controls = opts.controls;
    if (opts.fit)                    video.style.objectFit = opts.fit;

    video.src = src;
    video.load();
    video.play().catch(function() {});

    if (opts.onReady) {
      video.addEventListener('canplay', opts.onReady, { once: true });
    }
  }

  /** Shown when video fails to load */
  _showVideoError(wrap, label) {
    wrap.innerHTML = '';
    var msg = document.createElement('div');
    msg.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--qc-color-text-info,#666);font-size:12px;';
    var ico = document.createElement('span');
    ico.className = 'icon';
    ico.style.cssText = 'width:32px;height:32px;min-width:32px;--icon:url(\'/_ide/images/icons/coolicons/Interface/Alert_Triangle.png\');opacity:0.3;';
    msg.appendChild(ico);
    msg.appendChild(document.createTextNode('Cannot load: ' + label));
    wrap.appendChild(msg);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _getDomain(url) {
    try { return new URL(url).hostname; } catch(e) { return url; }
  }

  _getPageTitle(url) {
    try {
      var u = new URL(url);
      var parts = u.pathname.split('/').filter(Boolean);
      return parts.length ? parts[parts.length - 1] : u.hostname;
    } catch(e) {
      return url.split('/').pop() || url;
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('_idb-styles')) return;
    var st = document.createElement('style');
    st.id = '_idb-styles';
    st.textContent = [
      '.ide-browser__toolbar button:disabled { opacity: 0.25; cursor: not-allowed; pointer-events: none; }',
      '.ide-browser__viewport { background: var(--qc-color-bg-primary, #111); }',
    ].join('\n');
    document.head.appendChild(st);
  }
}

if (typeof module !== 'undefined') module.exports = { IDEBrowser };
