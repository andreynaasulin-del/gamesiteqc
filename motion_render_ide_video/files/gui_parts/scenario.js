/**
 * IDEScenario — YAML-driven scenario player for IDE emulation
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * YAML format (parsed via js-yaml or inline JS object):
 *
 *   project: NeuralForge
 *
 *   browser_tabs:
 *     - id: br-video
 *       label: message_box.mp4
 *       video: /.temp/recordings/message_box_1782111045951.mp4
 *     - id: br-home
 *       label: home.html
 *       url: http://localhost:9230/.temp/home.html
 *
 *   actions:
 *     - at: 0
 *       type: send_message
 *       text: Add dropout regularization to the transformer model
 *
 *     - at: 1200
 *       type: begin_answer
 *       tool_calls:
 *         - ToolVectorSearch  transformer dropout
 *         - ToolReadFile  src/model.py
 *         - ToolTextFileEdit  src/model.py
 *       answer: Done! Added dropout layers (p=0.1) after each transformer block.
 *
 *     - at: 8000
 *       type: send_message
 *       text: Increase hidden size to 1024
 *
 *     - at: 9200
 *       type: begin_answer
 *       tool_calls:
 *         - ToolReadFile  src/config.yaml
 *         - ToolTextFileEdit  src/config.yaml
 *       answer: Updated! config.yaml now has hidden_size 1024.
 *
 * Usage:
 *   const scenario = new IDEScenario(yamlString_or_jsObject, {
 *     header,       // IDEHeader instance
 *     mainPanel,    // IDEMainPanel instance
 *     statusBar,    // IDEStatusBar instance
 *     onDone,       // optional callback when scenario finishes
 *   });
 *   scenario.play();   // start
 *   scenario.stop();   // cancel
 *
 * The scenario also exposes a static helper:
 *   IDEScenario.parseYaml(yamlString) → JS object
 *   (uses js-yaml if available, otherwise a tiny built-in parser for simple cases)
 */
class IDEScenario {
  /**
   * @param {string|object} source  — YAML string or already-parsed JS object
   * @param {object}        ctx     — { header, mainPanel, statusBar, onDone }
   */
  constructor(source, ctx) {
    this._data      = typeof source === 'string' ? IDEScenario.parseYaml(source) : source;
    this._ctx       = ctx || {};
    this._timers    = [];
    this._running   = false;
    this._startedAt = 0;

    // Internal chat state — set by mainPanel._chatLog / _chatBox refs
    this._log = null;
    this._box = null;

    // Camera ref — optional, set via ctx.camera or window.camera
    this._camera = ctx.camera || null;

    // Prewarm video dimension cache for all referenced video srcs so
    // fit_to_video / resize_ide_to_perfect_fit can resolve instantly from cache.
    IDEScenario._prewarmVideoCache(this._data);
  }

  /**
   * Collect all video srcs from scenario data and prewarm VideoDimensionCache.
   * Called on construction — recording starts later so metadata loads in background.
   * @param {object} data — parsed scenario object
   */
  static _prewarmVideoCache(data) {
    if (typeof VideoDimensionCache === 'undefined') return;
    var srcs = [];
    // browser_tabs and scenario-defined custom center panel
    (data.browser_tabs || []).forEach(function(t) { if (t.video) srcs.push(t.video); });
    var customPanel = data.main_panel && data.main_panel.custom;
    if (customPanel && customPanel.video) srcs.push(customPanel.video);
    // actions — switch_video, bg_video_play, set_background, viewer_open
    (data.actions || []).forEach(function(a) {
      if (a.video) srcs.push(a.video);
      if (a.src && typeof a.src === 'string' && /\.(mp4|webm|mov)(\?|$)/i.test(a.src)) srcs.push(a.src);
    });
    // deduplicate
    srcs = srcs.filter(function(s, i, arr) { return s && arr.indexOf(s) === i; });
    if (srcs.length) {
      console.log('[IDEScenario] prewarming video dimensions for', srcs.length, 'src(s):', srcs);
      VideoDimensionCache.prewarm(srcs);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Start playing the scenario from t=0. */
  play() {
    if (this._running) this.stop();
    this._running   = true;
    this._startedAt = Date.now();

    var self = this;
    var data = this._data;
    var ctx  = this._ctx;

    // ── Apply project name ─────────────────────────────────────────────────
    if (data.project && ctx.header) {
      ctx.header.setProject(data.project);
    }
    if (data.project && ctx.statusBar) {
      ctx.statusBar.setProject && ctx.statusBar.setProject(data.project);
    }

    // ── Apply browser tabs ─────────────────────────────────────────────────
    if (data.browser_tabs && ctx.mainPanel) {
      ctx.mainPanel._applyBrowserTabs && ctx.mainPanel._applyBrowserTabs(data.browser_tabs);
    }

    // ── Apply chat topic ───────────────────────────────────────────────────
    if (ctx.mainPanel && ctx.mainPanel._chatLog) {
      var log = ctx.mainPanel._chatLog;
      log.clear();
      if (data.topic !== undefined) {
        log.setTopic(data.topic || '');
      }
    }

    // ── Apply project to folder tree ───────────────────────────────────────
    // If the scenario has a `project` object (with project_name + files[]),
    // rebuild the folder tree from it. A plain string project name is handled
    // by the header/statusBar blocks above; the tree needs the full object.
    if (data.project && typeof data.project === 'object' && ctx.mainPanel) {
      ctx.mainPanel.setProject && ctx.mainPanel.setProject(data.project);
      // Also update header/statusBar with project_name string
      var pName = data.project.project_name || data.project;
      if (ctx.header)    ctx.header.setProject(pName);
      if (ctx.statusBar) ctx.statusBar.setProject && ctx.statusBar.setProject(pName);
    }

    // ── Start narration & soundtrack ──────────────────────────────────────
    // Both are optional top-level YAML keys. Each starts playing immediately
    // when the scenario plays and stops when stop() is called.
    //
    // YAML:
    //   narration:
    //     src: /.temp/audio/narration.mp3
    //     volume: 0.9          # 0.0–1.0, default 1.0
    //     loop: false          # default false
    //
    //   soundtrack:
    //     src: /.temp/audio/bg_music.mp3
    //     volume: 0.35         # keep quiet under narration
    //     loop: true           # default true for soundtrack
    self._startAudio('narration', data.narration);
    self._startAudio('soundtrack', data.soundtrack);

    // ── Resolve relative time markers → absolute ms ────────────────────────
    // Supports:
    //   at: 1200       — absolute milliseconds (number)
    //   at: "+4"       — +4 seconds relative to previous action's resolved time
    //   at: "+3.232"   — fractional seconds, sub-second precision
    //   at: "+0"       — same time as previous action (parallel)
    var actions = IDEScenario._resolveTimings(data.actions || []);

    // ── Pre-warm viewer windows ────────────────────────────────────────────
    // Create all viewer_open windows NOW (hidden, src already set) so the
    // browser starts buffering video/audio immediately. At the scheduled
    // time we just show() + play() — no 3-5s load delay.
    actions.forEach(function(action) {
      if (action.type === 'viewer_open') {
        self._prewarmViewer(action);
      }
    });

    // ── Schedule actions ───────────────────────────────────────────────────
    actions.forEach(function(action) {
      var delay = action.at || 0;
      var tid = setTimeout(function() {
        if (!self._running) return;
        self._dispatch(action);
      }, delay);
      self._timers.push(tid);
    });

    // ── Schedule done callback ─────────────────────────────────────────────
    // ── Schedule done callback ─────────────────────────────────────────────
    // If the scenario has an explicit `stop_record` action, onDone is triggered
    // immediately when that action fires (see _doStopRecord).
    // The timer below is a safety-net fallback: fires 500ms after the last
    // scheduled action in case there is no stop_record action.
    var nonStopActions = actions.filter(function(a) { return a.type !== 'stop_record'; });
    var lastAt = nonStopActions.reduce(function(max, a) { return Math.max(max, a.at || 0); }, 0);
    var finishDelay = lastAt + 500;
    var doneTid = setTimeout(function() {
      if (!self._running) return;
      self._running = false;
      if (ctx.onDone) ctx.onDone();
    }, finishDelay);
    self._timers.push(doneTid);
  }

  /** Stop / cancel a running scenario. */
  stop() {
    this._running = false;
    this._timers.forEach(function(t) { clearTimeout(t); });
    this._timers = [];
    // Stop narration & soundtrack
    this._stopAudio('narration');
    this._stopAudio('soundtrack');
    // Stop fallback bg video (created by _playFallbackBgVideo when no camera)
    if (this._bgVideoEl) {
      this._bgVideoEl.pause();
      this._bgVideoEl.src = '';
      try { this._bgVideoEl.remove(); } catch(e) {}
      this._bgVideoEl = null;
    }
    // Hide all open viewer windows (don't destroy — they may be reused on re-play)
    if (this._viewers) {
      Object.values(this._viewers).forEach(function(entry) {
        try { if (entry.win) entry.win.hide(0); } catch(e) {}
        try {
          if (!entry.win && entry.viewer && entry.viewer.el) {
            entry.viewer.el.style.opacity = '0';
            entry.viewer.el.style.pointerEvents = 'none';
          }
        } catch(e) {}
        // Stop media playback
        try {
          var v = entry.viewer;
          if (v && v._videoEl) v._videoEl.pause();
          if (v && v._audioEl) v._audioEl.pause();
        } catch(e) {}
      });
      // Reset pre-warm flag so next play() re-warms them
      this._viewers = {};
    }
  }

  /** True while scenario is playing. */
  get isRunning() { return this._running; }

  // ── Action dispatcher ──────────────────────────────────────────────────────

  _dispatch(action) {
    var type = action.type;
    if      (type === 'send_message')   this._doSendMessage(action);
    else if (type === 'begin_answer')   this._doBeginAnswer(action);
    else if (type === 'switch_tab')     this._doSwitchTab(action);
    else if (type === 'set_status')     this._doSetStatus(action);
    else if (type === 'camera_move')    this._doCameraMove(action);
    else if (type === 'camera_anim')    this._doCameraAnim(action);
    else if (type === 'camera_reset')   this._doCameraReset(action);
    else if (type === 'camera_viewport') this._doCameraViewport(action);
    else if (type === 'bg_video_play')   this._doBgVideoPlay(action);
    else if (type === 'bg_video_stop')   this._doBgVideoStop(action);
    else if (type === 'camera_pan_to')  this._doCameraPanTo(action);
    else if (type === 'switch_video')   this._doSwitchVideo(action);
    else if (type === 'clear_browser')  this._doClearBrowser(action);
    else if (type === 'fit_to_video')   this._doFitToVideo(action);
    else if (type === 'label_show')     this._doLabelShow(action);
    else if (type === 'label_hide')     this._doLabelHide(action);
    else if (type === 'label_set')      this._doLabelSet(action);
    else if (type === 'label_move')     this._doLabelMove(action);
    else if (type === 'ide_hide')       this._doIdeVisibility(action, false);
    else if (type === 'ide_show')       this._doIdeVisibility(action, true);
    else if (type === 'viewer_open')    this._doViewerOpen(action);
    else if (type === 'viewer_show')    this._doViewerShow(action);
    else if (type === 'viewer_hide')    this._doViewerHide(action);
    else if (type === 'viewer_set_source') this._doViewerSetSource(action);
    else if (type === 'audio_play')     this._doAudioPlay(action);
    else if (type === 'audio_stop')     this._doAudioStop(action);
    else if (type === 'select_file')    this._doSelectFile(action);
    else if (type === 'set_background') this._doSetBackground(action);
    else if (type === 'set_dim')          this._doSetDim(action);
    else if (type === 'show_right_panel') this._doShowRightPanel();
    else if (type === 'hide_right_panel') this._doHideRightPanel();
    else if (type === 'set_main_window_size') this._doSetMainWindowSize(action);
    else if (type === 'set_side_panel_width') this._doSetSidePanelWidth(action);
    else if (type === 'stop_record')      this._doStopRecord();
    else if (type === 'browser_open_tab') this._doBrowserOpenTab(action);
    else if (type === 'open_file')      this._doOpenFile(action);
    else if (type === 'switch_main_tab' || type === 'switch_panel') this._doSwitchMainTab(action);
    else if (type === 'switch_left_tab') this._doSwitchLeftTab(action);
    else if (type === 'show_subpanel')   this._doShowSubpanel(action);
    else if (type === 'switch_subpanel')  this._doSwitchSubpanel(action);
    else if (type === 'add_console_log')  this._doAddConsoleLog(action);
    else if (type === 'clear_console')    this._doClearConsole();
    else if (type === 'console_mode')        this._doConsoleMode(action);
    else if (type === 'terminal_type')       this._doTerminalType(action);
    else if (type === 'console_demo')        this._doConsoleDemo(action);
    else if (type === 'add_subagent_call')      this._doAddSubagentCall(action);
    else if (type === 'update_subagent_call')   this._doUpdateSubagentCall(action);
    else if (type === 'append_chat_message')    this._doAppendChatMessage(action);
    else if (type === 'clear_chat_log')         this._doClearChatLog();
    else if (type === 'shadow_gradient_show')   this._doShadowGradientShow(action);
    else if (type === 'shadow_gradient_hide')   this._doShadowGradientHide(action);
    else if (type === 'shadow_gradient_update') this._doShadowGradientUpdate(action);
    else console.warn('[IDEScenario] unknown action type:', type);
  }

  // ── Action handlers ────────────────────────────────────────────────────────

  /** Type text into the message box, then submit it. */
  _doSendMessage(action) {
    var self = this;
    var box  = this._getBox();
    var log  = this._getLog();
    if (!box || !log) return;

    var text      = action.text || '';
    var typeDelay = action.type_delay || 35;

    // Suppress the box's own onSend handler during scenario playback
    // so it doesn't add a duplicate message to the log
    box._scenarioPlaying = true;

    _typeIntoBox(box, text, typeDelay, function() {
      if (!self._running) return;
      // Typing complete — now add to log (correct order: before answer)
      log.addMessage({
        role:      'user',
        name:      action.sender_name  || 'You',
        roleLabel: action.sender_label || 'Product Owner',
        text:      text,
        time:      _now(),
      });
      setTimeout(function() {
        box.setText('');
        box._scenarioPlaying = false;
      }, 200);
    });
  }

  /** Start an agent answer: show spinner → stream tool calls → typewrite reply. */
  _doBeginAnswer(action) {
    var self      = this;
    var log       = this._getLog();
    var box       = this._getBox();
    if (!log) return;

    // Wait until any in-progress typing finishes before starting the answer
    if (box && box._scenarioPlaying) {
      var waitTid = setInterval(function() {
        if (!self._running) { clearInterval(waitTid); return; }
        if (!box._scenarioPlaying) {
          clearInterval(waitTid);
          self._startAgentAnswer(action, log);
        }
      }, 50);
      self._timers.push(waitTid);
      return;
    }

    this._startAgentAnswer(action, log);
  }

  _startAgentAnswer(action, log) {
    var self        = this;
    var toolCalls   = action.tool_calls   || [];
    var answer      = action.answer       || '';
    var actionDelay = action.action_delay || 550;
    // Per-answer `model` wins; otherwise the scenario-wide `model_name` so a
    // demo never shows one model in the chat combo and another on the badge.
    var model       = action.model || this._data.model_name || 'claude-sonnet';

    // Start agent turn (shows header + spinner)
    var ctrl = log.startAgentTurn({ model: model });

    // Stream tool calls one by one
    var ai = 0;
    var interval = setInterval(function() {
      if (!self._running) { clearInterval(interval); return; }
      if (ai < toolCalls.length) {
        ctrl.addAction(toolCalls[ai]);
        ai++;
      } else {
        clearInterval(interval);
        ctrl.finish(answer, function() {});
      }
    }, actionDelay);

    this._timers.push(interval);
  }

  /** Switch a browser tab in the center panel. */
  _doSwitchTab(action) {
    var mp = this._ctx.mainPanel;
    if (!mp || !mp._browserTabHolder) return;
    mp._browserTabHolder.activateTab(action.tab_id);
  }

  /** Update status bar text. */
  _doSetStatus(action) {
    var sb = this._ctx.statusBar;
    if (!sb) return;
    if (action.status) sb.setStatus(action.status);
    if (action.branch) sb.setBranch && sb.setBranch(action.branch);
  }

  /**
   * Replace the video source in a browser tab — in-place, same viewport.
   *
   * YAML:
   *   - at: 5000
   *     type: switch_video
   *     panel_id: generated-app   # custom panel id (or tab_id for browser tabs)
   *     video: /.temp/recordings/stage2.mp4
   *     fade: 300                 # crossfade ms (optional, default 300)
   *     loop: true                # optional overrides
   *     muted: true
   */
  _doSwitchVideo(action) {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] switch_video: no mainPanel in ctx'); return; }

    var panelId = action.panel_id || action.tab_id || 'br-video';
    var src     = action.video  || action.src || '';
    if (!src) { console.warn('[IDEScenario] switch_video: no video src'); return; }

    var opts = {};
    if (action.fade     !== undefined) opts.fade     = action.fade;
    if (action.loop     !== undefined) opts.loop     = action.loop;
    if (action.muted    !== undefined) opts.muted    = action.muted;
    if (action.controls !== undefined) opts.controls = action.controls;
    if (action.fit)                    opts.fit      = action.fit;
    // Label for the corner badge (first load only) — e.g. "localhost:5173"
    // instead of the raw mp4 filename, so a "running app" doesn't announce
    // that it is a video file.
    if (action.title)                  opts.title    = action.title;

    if (mp.switchBrowserVideo) {
      mp.switchBrowserVideo(panelId, src, opts);
    } else {
      console.warn('[IDEScenario] switch_video: mainPanel.switchBrowserVideo not available');
    }

    // Optional: fit IDE window height to the new video's aspect ratio — instant, no delay
    if (action.fit_to_video) {
      var win = this._getWin();
      if (mp.fitToVideo && win) {
        mp.fitToVideo(panelId, win).then(function(r) {
          console.log('[IDEScenario] switch_video fit_to_video done:', r);
        }).catch(function(e) {
          console.warn('[IDEScenario] switch_video fit_to_video failed:', e.message);
        });
      } else {
        console.warn('[IDEScenario] switch_video fit_to_video: fitToVideo or win not available');
      }
    }
  }

  /**
   * Highlight a file in the folder tree by its relative path.
   * Expands parent folders so the file is visible.
   *
   * YAML:
   *   - at: 5000
   *     type: select_file
   *     path: src/model/transformer.py   # relative to project root
   */
  _doSelectFile(action) {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] select_file: no mainPanel in ctx'); return; }
    var path = action.path || action.file || '';
    if (!path) { console.warn('[IDEScenario] select_file: no path specified'); return; }
    mp.selectFile && mp.selectFile(path);
  }

  /**
   * Change the background — either a named animation effect or a video file.
   *
   * Named effect:
   *   - at: 2000
   *     type: set_background
   *     effect: aurora          # any BgAnimations key, or 'none' to stop
   *
   * Video background:
   *   - at: 2000
   *     type: set_background
   *     video: /.temp/recordings/bg.mp4
   *     loop: true              # default true
   *     autoplay: true          # default true
   *     mute: true              # default true (required for autoplay)
   *     fit_to_viewport: true   # default true — cover viewport (object-fit:cover), no rotation/scale
   *     preserve_aspect: true   # default true — use object-fit:cover to preserve AR
   *     mode: behind            # 'behind' (default) | 'overlay'
   *     fade: 600               # fade-in ms, default 0
   *
   * Behavior during scenario recording and transitions:
   *   - Preload: video element is created immediately (even before fade-in) so
   *     playback starts without buffering delay.
   *   - Seamless switch: calling set_background again with a new video src
   *     cross-fades to the new video without a blank frame (same as bg_video_play).
   *   - Stop on scenario end: video is paused and removed when stop() is called.
   */
  _doSetBackground(action) {
    var cam = this._getCamera();
    var bg  = this._ctx.bg;

    // ── Video background ─────────────────────────────────────────────────────
    if (action.video || action.src) {
      var src = action.video || action.src;

      // If no camera, fall back to direct DOM video element on bg layer
      if (cam && cam.playBgVideo) {
        cam.playBgVideo(src, {
          mode:  action.mode  || 'behind',
          loop:  action.loop  !== false,
          muted: action.mute  !== false,
          fade:  action.fade  || 0,
          fit:   action.preserve_aspect !== false ? 'cover' : 'fill',
          dim:   action.dim,   // 0..1 black overlay; omit to leave unchanged
        });
      } else {
        this._playFallbackBgVideo(src, action);
      }

      // Stop named animation if one was running
      if (bg) bg.apply('none');
      return;
    }

    // ── Named animation effect ────────────────────────────────────────────────
    // If a bg video is playing, stop it first
    if (cam && cam.stopBgVideo) cam.stopBgVideo(action.fade || 0);

    if (!bg) { console.warn('[IDEScenario] set_background: no bg in ctx'); return; }
    var effect = action.effect || action.name || 'none';
    bg.apply(effect);
  }

  /**
   * Fallback video background when no camera is available.
   * Creates a full-viewport <video> element on the bg canvas layer.
   * @private
   */
  _playFallbackBgVideo(src, action) {
    var bgLayer = document.getElementById('bg-canvas-layer');
    if (!bgLayer) { console.warn('[IDEScenario] set_background: no #bg-canvas-layer found'); return; }

    // Reuse or create a dedicated <video> el
    var el = bgLayer.querySelector('._sce-bg-video');
    if (!el) {
      el = document.createElement('video');
      el.className = '_sce-bg-video';
      el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
      bgLayer.appendChild(el);
      // Register for cleanup on stop()
      this._bgVideoEl = el;
    }

    var mode = action.mode || 'behind';
    el.style.zIndex  = mode === 'overlay' ? '10' : '0';
    el.style.objectFit = action.preserve_aspect !== false ? 'cover' : 'fill';

    el.loop    = action.loop    !== false;
    el.muted   = action.mute   !== false;
    el.autoplay = action.autoplay !== false;

    var fade = action.fade || 0;
    if (fade > 0) { el.style.opacity = '0'; el.style.transition = 'opacity ' + fade + 'ms'; }

    el.src = src;
    el.load();
    var self = this;
    el.play().catch(function() {});
    if (fade > 0) {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() { el.style.opacity = '1'; });
      });
    }
  }

  /**
   * Open a new tab in the browser tab holder (Web browsers section).
   * Automatically switches the central panel to "Web browsers".
   *
   * YAML:
   *   - at: 3000
   *     type: browser_open_tab
   *     label: "quadcode.ai"          # tab name shown in the strip
   *     url: https://quadcode.ai      # page to load (mutually exclusive with video)
   *     # OR:
   *     video: /.temp/recordings/demo.mp4
   *     loop: true                    # optional, default true (video only)
   *     controls: true                # optional, default true (video only)
   *     activate: true                # switch to this tab (default true)
   *     switch_panel: true            # also switch central panel to Web browsers (default true)
   */
  _doBrowserOpenTab(action) {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] browser_open_tab: no mainPanel in ctx'); return; }

    // Switch central panel to Web browsers first (so tab holder is built)
    if (action.switch_panel !== false) {
      mp.switchCentralTab && mp.switchCentralTab('Web browsers');
    }

    // Small defer to let lazy content builder run if tab holder wasn't built yet
    var self = this;
    setTimeout(function() {
      if (!mp.openBrowserTab) {
        console.warn('[IDEScenario] browser_open_tab: mainPanel.openBrowserTab not available');
        return;
      }
      mp.openBrowserTab({
        label:    action.label    || action.name || 'New tab',
        url:      action.url      || null,
        video:    action.video    || null,
        loop:     action.loop,
        controls: action.controls,
        activate: action.activate !== false,
      });
    }, 80);
  }

  /**
   * Open a file in the File editors tab.
   * Automatically switches the central panel to "File editors".
   *
   * YAML:
   *   - at: 4000
   *     type: open_file
   *     path: src/model/transformer.py   # relative path from project root
   *     label: transformer.py            # optional tab label (defaults to filename)
   *     unsaved: false                   # show unsaved dot (default false)
   *     activate: true                   # switch to this tab (default true)
   *     switch_panel: true               # also switch central panel to File editors (default true)
   */
  _doOpenFile(action) {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] open_file: no mainPanel in ctx'); return; }

    // Switch central panel to File editors first (so tab holder is built)
    if (action.switch_panel !== false) {
      mp.switchCentralTab && mp.switchCentralTab('File editors');
    }

    var self = this;
    setTimeout(function() {
      if (!mp.openFileTab) {
        console.warn('[IDEScenario] open_file: mainPanel.openFileTab not available');
        return;
      }
      mp.openFileTab({
        path:     action.path || action.file || '',
        label:    action.label || null,
        unsaved:  action.unsaved || false,
        activate: action.activate !== false,
      });
      // Also highlight in folder tree
      if (action.path && mp.selectFile) mp.selectFile(action.path);
    }, 80);
  }

  /**
   * Switch the active tab in the central section.
   *
   * YAML:
   *   - at: 5000
   *     type: switch_panel
   *     panel_id: generated-app # scenario-defined custom panel id
   *
   * `switch_main_tab` remains supported for built-in tab labels.
   */
  _doSwitchMainTab(action) {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] switch_main_tab: no mainPanel in ctx'); return; }
    var panel = action.panel_id || action.panel || action.tab || action.label || '';
    if (!panel) { console.warn('[IDEScenario] switch_panel: no panel specified'); return; }
    mp.switchCentralTab && mp.switchCentralTab(panel);
  }

  /**
   * Switch the active tab in the LEFT panel.
   *
   * YAML:
   *   - at: 1000
   *     type: switch_left_tab
   *     tab: "Console"     # 'Chat' | 'History' | 'Console' | 'Find in files'
   */
  _doSwitchLeftTab(action) {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] switch_left_tab: no mainPanel in ctx'); return; }
    var label = action.tab || action.label || '';
    if (!label) { console.warn('[IDEScenario] switch_left_tab: no tab label specified'); return; }
    mp.switchLeftTab && mp.switchLeftTab(label);
  }

  /**
   * Add (or switch to) a custom subpanel iframe in the left, center, or right IDE panel.
   * If the tab already exists it is simply activated; otherwise it's created.
   *
   * YAML:
   *   - at: 1000
   *     type: show_subpanel
   *     side: left                             # 'left' | 'center' | 'right'
   *     label: "Planning"                      # tab label shown in the strip
   *     url: subpanels/planning_progress.html  # URL for the iframe
   *     scale: x0.9                             # optional; HTML iframes only
   */
  _doShowSubpanel(action) {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] show_subpanel: no mainPanel in ctx'); return; }
    var side  = action.side  || 'left';
    var label = action.label || 'Panel';
    var url   = action.url   || '';
    if (!url) { console.warn('[IDEScenario] show_subpanel: no url specified'); return; }
    mp.showSubpanel && mp.showSubpanel(side, label, url, action.scale);
  }

  /**
   * Switch to an existing subpanel tab by label.
   *
   * YAML:
   *   - at: 5000
   *     type: switch_subpanel
   *     side: right                # 'left' | 'center' | 'right'
   *     label: "Game Structure"    # tab label to activate
   */
  _doSwitchSubpanel(action) {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] switch_subpanel: no mainPanel in ctx'); return; }
    var side  = action.side  || 'left';
    var label = action.label || '';
    if (!label) { console.warn('[IDEScenario] switch_subpanel: no label specified'); return; }
    mp.switchSubpanel && mp.switchSubpanel(side, label);
  }

  /**
   * Clear the content of a browser tab — removes any video or page and shows
   * the empty placeholder.
   *
   * YAML:
   *   - at: 5000
   *     type: clear_browser
   *     panel_id: generated-app   # custom panel id (or tab_id for browser tabs)
   *     label: 'No content yet'   # optional placeholder text
   */
  /**
   * Show the right panel (file tree).
   * YAML:  - at: 5000
   *          type: show_right_panel
   */
  _doShowRightPanel() {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] show_right_panel: no mainPanel in ctx'); return; }
    mp.showRightPanel && mp.showRightPanel();
  }

  /**
   * Hide the right panel (file tree).
   * YAML:  - at: 5000
   *          type: hide_right_panel
   */
  _doHideRightPanel() {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] hide_right_panel: no mainPanel in ctx'); return; }
    mp.hideRightPanel && mp.hideRightPanel();
  }

  /**
   * Set or adjust the native IDE frame size.
   *
   * YAML:
   *   - at: 1000
   *     type: set_main_window_size
   *     width: 1600         # absolute native px, or "+80" / "-80" for delta
   *     height: 1000        # absolute native px, or "+40" / "-40" for delta
   */
  _doSetMainWindowSize(action) {
    var win = this._getWin();
    if (!win) { console.warn('[IDEScenario] set_main_window_size: no win in ctx'); return; }
    var r = win.setNativeSize(action.width, action.height);
    console.log('[IDEScenario] set_main_window_size →', r);
  }

  /**
   * Set or adjust the width of the left or right side panel.
   *
   * YAML:
   *   - at: 1000
   *     type: set_side_panel_width
   *     side: left          # left | right
   *     width: 25           # absolute %, or "+5" / "-5" for delta
   */
  _doSetSidePanelWidth(action) {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] set_side_panel_width: no mainPanel in ctx'); return; }
    var side = action.side === 'right' ? 'right' : 'left';
    var w = mp.setSidePanelWidth(side, action.width);
    console.log('[IDEScenario] set_side_panel_width →', side, w + '%');
  }

  /**
   * Explicit scenario end — fires onDone immediately and cancels the safety-net
   * fallback timer, so recording stops without the extra idle delay.
   *
   * YAML:
   *   - at: +2          # 2s after last action
   *     type: stop_record
   */
  _doStopRecord() {
    if (!this._running) return;
    // Cancel all pending timers (including the fallback finishDelay)
    this._timers.forEach(function(t) { clearTimeout(t); });
    this._timers = [];
    this._running = false;
    var ctx = this._ctx;
    if (ctx.onDone) ctx.onDone();
  }

  _doClearBrowser(action) {
    var mp = this._ctx.mainPanel;
    if (!mp) { console.warn('[IDEScenario] clear_browser: no mainPanel in ctx'); return; }
    var panelId = action.panel_id || action.tab_id || 'br-video';
    var opts    = {};
    if (action.label !== undefined) opts.label = action.label;
    if (action.icon  !== undefined) opts.icon  = action.icon;
    if (mp.clearBrowserContent) {
      mp.clearBrowserContent(panelId, opts);
    } else {
      console.warn('[IDEScenario] clear_browser: mainPanel.clearBrowserContent not available');
    }
  }

  /**
   * Trigger "Fit to video" — resizes the IDE window height so the browser
   * content area matches the loaded video aspect ratio with zero black bars.
   * Requires a video to already be loaded in the target tab.
   *
   * YAML:
   *   - at: 6000
   *     type: fit_to_video
   *     panel_id: generated-app   # custom panel id (or tab_id for browser tabs)
   */
  _doFitToVideo(action) {
    var mp  = this._ctx.mainPanel;
    var win = this._getWin();
    if (!mp)  { console.warn('[IDEScenario] fit_to_video: no mainPanel in ctx'); return; }
    if (!win) { console.warn('[IDEScenario] fit_to_video: no win in ctx'); return; }
    var panelId = action.panel_id || action.tab_id || 'br-video';
    if (mp.fitToVideo) {
      mp.fitToVideo(panelId, win).then(function(r) {
        console.log('[IDEScenario] fit_to_video done:', r);
      }).catch(function(e) {
        console.warn('[IDEScenario] fit_to_video failed:', e.message);
      });
    } else {
      console.warn('[IDEScenario] fit_to_video: mainPanel.fitToVideo not available');
    }
  }

  // ── Background video handlers ──────────────────────────────────────────────

  /**
   * Play a video that fills the viewport without any rotation/scale.
   * Aspect ratio is preserved (object-fit:cover). Plays behind or over the IDE.
   *
   * YAML:
   *   - at: 2000
   *     type: bg_video_play
   *     video: /path/to/clip.mp4   # required
   *     mode: behind               # 'behind' (default) | 'overlay'
   *     loop: true                 # default true
   *     muted: true                # default true
   *     fade: 600                  # fade-in ms, default 0
   */
  _doBgVideoPlay(action) {
    if (!this._camera) { console.warn('[IDEScenario] bg_video_play: no camera'); return; }
    var src = action.video || action.src;
    if (!src) { console.warn('[IDEScenario] bg_video_play: missing video/src'); return; }
    this._camera.playBgVideo(src, {
      mode:  action.mode  || 'behind',
      loop:  action.loop  !== false,
      muted: action.muted !== false,
      fade:  action.fade  || 0,
      dim:   action.dim,   // 0..1 black overlay, passed only when defined
    });
  }

  /**
   * Set the dimming overlay on the background video at runtime.
   *
   * YAML:
   *   - at: 3000
   *     type: set_dim
   *     dim: 0.5          # 0 = no overlay, 1 = fully black (default 1.0)
   *     fade: 600         # transition ms (default 400)
   */
  _doSetDim(action) {
    var cam = this._getCamera();
    if (!cam) { console.warn('[IDEScenario] set_dim: no camera'); return; }
    var opacity = action.dim !== undefined ? action.dim : 1.0;
    cam.setDim(opacity, action.fade !== undefined ? action.fade : 400);
  }

  /**
   * Stop and hide the background video.
   *
   * YAML:
   *   - at: 5000
   *     type: bg_video_stop
   *     fade: 400    # fade-out ms, default 0
   */
  _doBgVideoStop(action) {
    if (!this._camera) { console.warn('[IDEScenario] bg_video_stop: no camera'); return; }
    this._camera.stopBgVideo(action.fade || 0);
  }

  // ── Camera action handlers ─────────────────────────────────────────────────

  _getCamera() {
    if (this._camera) return this._camera;
    // Fall back to window.camera set by whole_ide_render_mock.html
    if (typeof window !== 'undefined' && window.camera) {
      this._camera = window.camera;
      return this._camera;
    }
    return null;
  }

  /**
   * Smoothly move camera to a target state.
   * action: { zoom?, tx?, ty?, rx?, ry?, rz?, duration?, easing? }
   * Falls back to global camera_move_duration / camera_move_easing from YAML.
   */
  _doCameraMove(action) {
    var cam = this._getCamera();
    if (!cam) return;
    var dur    = action.duration !== undefined ? action.duration
               : (this._data.camera_move_duration !== undefined ? this._data.camera_move_duration : undefined);
    var easing = action.easing !== undefined ? action.easing
               : (this._data.camera_move_easing  || undefined);
    cam.moveTo({
      zoom: action.zoom,
      tx:   action.tx,
      ty:   action.ty,
      rx:   action.rx,
      ry:   action.ry,
      rz:   action.rz,
    }, dur, easing);
  }

  /**
   * Start or stop a camera animation preset.
   * action: { name }  — 'float'|'swing'|'tilt'|'breathe'|'drift'|'wobble'|'pendulum'|'none'
   */
  _doCameraAnim(action) {
    var cam = this._getCamera();
    if (!cam) return;
    var name = action.name || action.anim || '';
    if (!name || name === 'none') { cam.stopAnim(); return; }
    // amplitude: 1 = preset as authored, 0.4 = 40 % of its motion (optional)
    cam.setAnim(name, { amplitude: action.amplitude });
  }

  /**
   * Smoothly reset camera to identity.
   * action: { duration? }
   */
  _doCameraReset(action) {
    var cam = this._getCamera();
    if (!cam) return;
    cam.reset(action.duration !== undefined ? action.duration : 600);
  }

  /**
   * Switch viewport mode.
   * action: { mode }  — 'free'|'desktop'|'r169'|'r916'|'mobile'
   */
  _doCameraViewport(action) {
    var cam = this._getCamera();
    if (!cam) return;
    cam.setViewport(action.mode || 'desktop');
  }

  /**
   * Pan + zoom camera to frame a named container so it fills the viewport
   * with a configurable margin.
   *
   * action: { target, margin?, zoom?, duration?, tilt? }
   *
   * Named targets (built-in):
   *   'message_box'      — chat input area
   *   'chat_log'         — chat history panel
   *   'result_window'    — browser panel (first browser tab / video result)
   *   'video_result'     — alias for result_window
   *   'ide_center'       — center panel
   *   'ide_full'         — zoom out to show full IDE (resets tx/ty/rx/ry)
   *   'panel:<id>'       — scenario-defined custom central panel, e.g. `panel:generated-app`
   *   'window:<id>'      — additional floating viewer window by its viewer id
   *                        e.g. target: 'window:vw_video'
   *
   * Parameters:
   *   margin   {number}  — fraction of viewport to leave as padding on each side
   *                        0 = fill 100%, 0.1 = 10% margin (default 0.12)
   *   zoom     {number}  — override auto-computed zoom (skips margin calc)
   *   duration {number}  — transition ms (default 900)
   *   tilt     {boolean} — add subtle 3D tilt toward target (default true)
   *
   * How it works:
   *   1. Resolve target → DOM element (IDE-internal or floating window).
   *   2. Measure element rect in IDE-native pixels (pre-transform).
   *   3. Compute zoom so the element fills (1 - 2*margin) of the viewport.
   *   4. Compute tx/ty to center the element in the viewport.
   *   5. Optionally add a small rx/ry tilt for 3D feel.
   */
  /**
   * Offset (in IDE-native px, at `targetZoom`) that moves the IDE window's
   * untranslated centre onto the centre of the capture frame (#vpCapture).
   *
   * The frame is laid out with 80 px top / 125 px bottom margins, so its
   * centre sits ~22 px above the browser-window centre where the IDE rests at
   * tx/ty = 0. Without this every "centred" shot lands low and the bottom edge
   * of the target touches or leaves the recorded frame.
   *
   * Returns { tx: 0, ty: 0 } in free-viewport mode (no frame → nothing to fix).
   */
  _frameOffsetNative(cam, targetZoom) {
    var out = { tx: 0, ty: 0 };
    var win = cam && cam._wrapper && cam._wrapper.window;
    var vp  = document.getElementById('vpCapture');
    if (!win || !vp || vp.style.display === 'none' || !vp.offsetWidth) return out;

    var fr = vp.getBoundingClientRect();
    // Untransformed IDE centre from layout geometry (offsetLeft/Top chain),
    // NOT getBoundingClientRect: a bounding rect taken while a swing/tilt
    // preset is rotating the window is perspective-skewed and would drift
    // each "full" shot by 20-40 px depending on the phase of the swing.
    var ox = 0, oy = 0, cur = win;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      ox += cur.offsetLeft; oy += cur.offsetTop;
      cur = cur.offsetParent;
    }
    var baseCX = ox + win.offsetWidth  / 2;
    var baseCY = oy + win.offsetHeight / 2;
    var tScale = (cam._vpScale || 1) * (targetZoom || 1);
    out.tx = ((fr.left + fr.width  / 2) - baseCX) / tScale;
    out.ty = ((fr.top  + fr.height / 2) - baseCY) / tScale;
    return out;
  }

  _doCameraPanTo(action) {
    var cam = this._getCamera();
    if (!cam) return;

    var target    = action.target   || 'ide_full';
    var dur       = action.duration !== undefined ? action.duration : 900;
    var overZoom  = action.zoom     || null;   // explicit zoom override
    var margin    = action.margin   !== undefined ? action.margin : 0.12;  // 12% margin each side
    var doTilt    = action.tilt     !== false;  // default true

    // ── Zoom-out / full view ───────────────────────────────────────────────
    // Fit the whole IDE window into the capture frame with `margin` air on
    // each side. Falls back to the initial zoom only when nothing can be
    // measured. (Resetting to _initialZoom alone cut the IDE at 16:9 —
    // ~150 px per side went off-frame.)
    if (target === 'ide_full') {
      var fullZoom = overZoom || cam._initialZoom;
      var fullWin  = cam._wrapper && cam._wrapper.window;
      if (!overZoom && fullWin && fullWin.offsetWidth && fullWin.offsetHeight) {
        var fvp = document.getElementById('vpCapture');
        var fW = (fvp && fvp.style.display !== 'none' && fvp.offsetWidth) ? fvp.offsetWidth  : window.innerWidth;
        var fH = (fvp && fvp.style.display !== 'none' && fvp.offsetHeight) ? fvp.offsetHeight : window.innerHeight;
        var fFill  = 1 - 2 * margin;
        var fScale = cam._vpScale || 1;
        fullZoom = Math.min(fW * fFill / (fullWin.offsetWidth * fScale),
                            fH * fFill / (fullWin.offsetHeight * fScale));
        fullZoom = Math.max(0.3, Math.min(3.0, fullZoom));
      }
      var fo = this._frameOffsetNative(cam, fullZoom);
      cam.moveTo({ zoom: fullZoom, tx: fo.tx, ty: fo.ty, rx: 0, ry: 0, rz: 0 }, dur);
      return;
    }

    // ── Resolve target element ─────────────────────────────────────────────
    // Built-in named targets → CSS selector inside the IDE window
    var BUILTIN = {
      'message_box':   '#ide-message-box',
      'chat_log':      '#ide-chat-log',
      'result_window': '#ide-browser-pane',
      'video_result':  '#ide-browser-pane',
      'ide_center':    '#ide-browser-pane',
    };

    var el = null;
    var isSceneEl = false;  // true for floating windows in sceneLayer (outside ideWin)

    if (BUILTIN[target]) {
      // IDE-internal element
      el = document.querySelector(BUILTIN[target]);
    } else if (target.indexOf('panel:') === 0) {
      // Scenario-defined custom central panel by its stable id.
      el = document.getElementById('ide-custom-panel-' + target.slice('panel:'.length).trim());
    } else if (target.indexOf('window:') === 0) {
      // Floating viewer window — look up by viewer id
      var viewerId = target.slice('window:'.length).trim();
      var entry = this._viewers && this._viewers[viewerId];
      if (entry && entry.win && entry.win.el) {
        el = entry.win.el;
        isSceneEl = true;
      } else if (entry && entry.viewer && entry.viewer.el) {
        el = entry.viewer.el;
        isSceneEl = true;
      }
    }

    if (!el) {
      console.warn('[IDEScenario] camera_pan_to: target element not found for', target);
      return;
    }

    // ── Measure element in scene-native pixels (pre-camera-transform) ──────
    var ideWin  = cam._wrapper && cam._wrapper.window;
    var sceneEl = (cam._wrapper && cam._wrapper.sceneLayer) || ideWin;

    // For IDE-internal elements: walk offsetParent up to ideWin
    // For scene elements (floating windows): walk up to sceneLayer/body
    var nativeW, nativeH, elCX, elCY;

    if (!isSceneEl && ideWin) {
      nativeW = ideWin.offsetWidth;
      nativeH = ideWin.offsetHeight;
      var ox = 0, oy = 0, cur = el;
      while (cur && cur !== ideWin) {
        ox += cur.offsetLeft;
        oy += cur.offsetTop;
        cur = cur.offsetParent;
      }
      elCX = ox + el.offsetWidth  / 2;
      elCY = oy + el.offsetHeight / 2;
    } else {
      // Floating window: use getBoundingClientRect relative to sceneLayer
      // sceneLayer has the same transform as ideWin, so we need pre-transform coords.
      // Use offsetLeft/offsetTop relative to sceneLayer.
      var refEl = sceneEl || document.body;
      nativeW = refEl.offsetWidth;
      nativeH = refEl.offsetHeight;
      var ox2 = 0, oy2 = 0, cur2 = el;
      while (cur2 && cur2 !== refEl) {
        ox2 += cur2.offsetLeft;
        oy2 += cur2.offsetTop;
        cur2 = cur2.offsetParent;
      }
      elCX = ox2 + el.offsetWidth  / 2;
      elCY = oy2 + el.offsetHeight / 2;
    }

    // ── Compute zoom to fit element with margin ────────────────────────────
    var targetZoom;
    if (overZoom) {
      targetZoom = overZoom;
    } else {
      // Use the viewport capture div dimensions (the actual recording frame),
      // not window.innerWidth/Height — the viewport frame has margins applied
      // and may be a constrained aspect-ratio rect (16:10, 9:16, etc.)
      // NOTE: camera uses style.display='block' not a 'visible' class.
      var vpCapture = document.getElementById('vpCapture');
      var vpFrameW, vpFrameH;
      if (vpCapture && vpCapture.style.display !== 'none' &&
          vpCapture.offsetWidth > 0 && vpCapture.offsetHeight > 0) {
        vpFrameW = vpCapture.offsetWidth;
        vpFrameH = vpCapture.offsetHeight;
      } else {
        // Fallback: full window (free viewport mode)
        vpFrameW = window.innerWidth;
        vpFrameH = window.innerHeight;
      }

      // Viewport area available after margin on each side
      var fill    = 1 - 2 * margin;
      var vpW     = vpFrameW * fill;
      var vpH     = vpFrameH * fill;

      // Element screen size = native size × vpScale
      // (camera zoom is what we're solving for — don't include current zoom)
      var vpScale = cam._vpScale || 1;
      var scaleX  = vpW / (el.offsetWidth  * vpScale);
      var scaleY  = vpH / (el.offsetHeight * vpScale);

      // Pick the more constrained axis so element fits in both dimensions
      targetZoom  = Math.min(scaleX, scaleY, 3.0);
      targetZoom  = Math.max(targetZoom, 0.3);
    }

    // ── Compute tx/ty to center element in viewport ────────────────────────
    // ...plus the frame-vs-window offset, so "centred" means centred in the
    // capture frame (what gets recorded), not in the browser window.
    var dx = elCX - nativeW / 2;
    var dy = elCY - nativeH / 2;
    var fo2 = this._frameOffsetNative(cam, targetZoom);
    var tx = -dx + fo2.tx;
    var ty = -dy + fo2.ty;

    // ── Keep the frame inside the IDE (clamp) ──────────────────────────────
    // Centring on an off-centre element (the chat panel is narrow and hard
    // left) pushes the frame past the edge of the IDE window, so a third of
    // the shot becomes empty background. Whenever the IDE is big enough to
    // cover the frame at this zoom, slide the shot back until it does.
    // Opt out per action with `clamp: false`. Floating windows live outside
    // the IDE, so they are never clamped.
    if (action.clamp !== false && !isSceneEl && nativeW && nativeH) {
      var cvp = document.getElementById('vpCapture');
      if (cvp && cvp.style.display !== 'none' && cvp.offsetWidth) {
        var cScale = (cam._vpScale || 1) * targetZoom;
        // Frame size expressed in IDE-native px at this zoom.
        var frameNW = cvp.offsetWidth  / cScale;
        var frameNH = cvp.offsetHeight / cScale;
        // The swing preset rotates the window, so its projected edges creep
        // inward a little; 1.5 % of air keeps the clamp honest under motion.
        var bleed = 0.015;
        var limX = (nativeW * (1 - bleed) - frameNW) / 2;
        var limY = (nativeH * (1 - bleed) - frameNH) / 2;
        var offX = tx - fo2.tx;   // frame centre → IDE centre, native px
        var offY = ty - fo2.ty;
        offX = limX <= 0 ? 0 : Math.max(-limX, Math.min(limX, offX));
        offY = limY <= 0 ? 0 : Math.max(-limY, Math.min(limY, offY));
        tx = fo2.tx + offX;
        ty = fo2.ty + offY;
      }
    }

    // ── Optional subtle 3D tilt toward target ─────────────────────────────
    var rx = 0, ry = 0;
    if (doTilt && nativeW && nativeH) {
      ry = Math.max(-10, Math.min(10, -dx / nativeW * 16));
      rx = Math.max(-6,  Math.min(6,   dy / nativeH * 10));
    }

    cam.moveTo({ zoom: targetZoom, tx: tx, ty: ty, rx: rx, ry: ry, rz: 0 }, dur);
  }

  // ── Label action handlers ──────────────────────────────────────────────────

  /**
   * Show (or create + show) a label.
   *
   * YAML:
   *   - at: 1000
   *     type: label_show
   *     id: hero
   *     text: 'Where *imagination* meets execution'
   *     style: caption          # 'caption' | 'subcaption'
   *     x: '50%'               # CSS left  (default 50%)
   *     y: '72%'               # CSS top   (default 72%)
   *     anchor: center          # 'center' | 'left' | 'right'
   *     anim_in: rise           # 'fade'|'rise'|'drop'|'scale'|'none'
   *     anim_out: fade
   *     duration: 400           # ms
   */
  _doLabelShow(action) {
    var labels = this._getLabels();
    if (!labels) return;

    // Merge label_defaults from YAML (lowest priority) → action fields (highest)
    var defaults = (this._data && this._data.label_defaults) || {};
    var a = Object.assign({}, defaults, action);

    var id = a.id || ('lbl_' + Date.now());

    // If label already exists: remove it so it gets recreated fresh (handles re-play)
    if (labels._labels[id]) {
      labels.remove(id);
    }

    // Create new label — sensible defaults baked in, overridden by YAML
    var opts = {
      id:       id,
      style:    a.style    || 'caption',
      space:    a.space    || 'viewport',
      x:        a.x        !== undefined ? a.x : '50%',
      y:        a.y        !== undefined ? a.y : '72%',
      anchor:   a.anchor   || 'center',
      animIn:   a.anim_in  || a.animIn  || 'rise',
      animOut:  a.anim_out || a.animOut || 'fade',
      duration: a.duration !== undefined ? a.duration : 400,
      visible:  true,
    };
    // Image label
    if (a.image) {
      opts.image = a.image;
    } else {
      opts.text = a.text || '';
    }
    // Width/height apply to any label type (not just images)
    if (a.width)  opts.width  = a.width;
    if (a.height) opts.height = a.height;
    // Background rect
    if (a.bg !== undefined)         opts.bg         = a.bg;
    if (a.bg_radius !== undefined)  opts.bg_radius  = a.bg_radius;
    if (a.bg_padding !== undefined) opts.bg_padding = a.bg_padding;
    // Font scale (1.0 = default, 1.5 = back to original pre-reduction size)
    if (a.scale !== undefined)      opts.scale      = a.scale;
    // Optional final position — label glides there after anim_in completes
    var finalPos = a.final_position || a.move_to;
    if (finalPos) opts.final_position = finalPos;
    if (a.move_duration !== undefined) opts.move_duration = a.move_duration;
    if (a.move_easing   !== undefined) opts.move_easing   = a.move_easing;
    labels.add(opts);
  }

  /**
   * Hide a label.
   *
   * YAML:
   *   - at: 5000
   *     type: label_hide
   *     id: hero
   *     anim_out: fade    # optional override
   *     duration: 300
   */
  _doLabelHide(action) {
    var labels = this._getLabels();
    if (!labels) return;
    labels.hide(action.id, action.duration);
  }

  /**
   * Update label text without show/hide.
   *
   * YAML:
   *   - at: 3000
   *     type: label_set
   *     id: hero
   *     text: 'New *text* here'
   */
  _doLabelSet(action) {
    var labels = this._getLabels();
    if (!labels) return;
    if (action.text !== undefined) labels.setText(action.id, action.text);
    if (action.x || action.y)     labels.setPosition(action.id, action.x, action.y);
  }

  /**
   * Smoothly move a visible label to a new position.
   *
   * YAML:
   *   - at: 4000
   *     type: label_move
   *     id: hero
   *     x: '10%'              # new left (CSS string for viewport, px number for scene)
   *     y: '5%'               # new top
   *     move_duration: 900    # ms (default 800)
   *     move_easing: 'ease-in-out'   # optional CSS easing
   */
  _doLabelMove(action) {
    var labels = this._getLabels();
    if (!labels) return;
    labels.moveTo(action.id, {
      x:             action.x,
      y:             action.y,
      move_duration: action.move_duration,
      move_easing:   action.move_easing,
    });
  }

  /**
   * Show or hide the IDE window element with optional fade animation.
   *
   * YAML:
   *   - at: 0
   *     type: ide_hide
   *     duration: 600          # fade-out ms (default 500). 0 = instant.
   *     record_while_hidden: false  # default false — viewport bg still records
   *
   *   - at: 3000
   *     type: ide_show
   *     duration: 600          # fade-in ms (default 500). 0 = instant.
   *
   * Notes:
   *   - Uses CSS opacity + transition so the IDE layout is preserved (no reflow).
   *   - `record_while_hidden: true` keeps the IDE in the DOM at opacity 0 so the
   *     recording viewport continues to capture (background animations still play).
   *   - `record_while_hidden: false` (default) sets visibility:hidden after fade-out
   *     so the IDE is truly invisible but still occupies space.
   *   - Labels in viewport space remain visible regardless (they are siblings of the IDE).
   */
  _doIdeVisibility(action, show) {
    var win = this._getWin();
    if (!win) { console.warn('[IDEScenario] ide_show/ide_hide: no win in ctx'); return; }

    var el       = win.window;          // the IDE <div> element
    var dur      = action.duration !== undefined ? action.duration : 500;
    var keepDom  = action.record_while_hidden !== false; // default true (opacity only)

    if (dur > 0) {
      el.style.transition = 'opacity ' + dur + 'ms ease';
    } else {
      el.style.transition = 'none';
    }

    if (show) {
      // Restore visibility before fading in
      el.style.visibility = '';
      el.style.pointerEvents = '';
      if (dur > 0) {
        // Always start from opacity 0 so fade-in fires even if IDE was previously visible
        el.style.transition = 'none';
        el.style.opacity = '0';
        void el.offsetWidth;  // force reflow
        el.style.transition = 'opacity ' + dur + 'ms ease';
      }
      el.style.opacity = '1';
    } else {
      el.style.opacity = '0';
      if (!keepDom) {
        // After fade completes, also hide from pointer events
        setTimeout(function() {
          el.style.visibility  = 'hidden';
          el.style.pointerEvents = 'none';
        }, dur);
      }
    }
  }

  // ── Viewer action handlers ─────────────────────────────────────────────────

  /**
   * Open a floating viewer window (video / image / sound).
   * Creates the viewer + IDECustomWindow, mounts into document.body (or ctx.viewerRoot).
   * The window is stored in this._viewers[id] for later show/hide/set_source.
   *
   * YAML:
   *   - at: 2000
   *     type: viewer_open
   *     id: preview_video          # unique id for later control
   *     viewer: video              # 'video' | 'image' | 'sound'
   *     src: /.temp/recordings/demo.mp4
   *     mode: embedded             # 'bridge' | 'embedded' (default: bridge)
   *     autoplay: true
   *     loop: true
   *     muted: true
   *     window:                    # optional — wrap in floating window
   *       title: Demo Video
   *       width: 640
   *       height: 400
   *       x: 120
   *       y: 80
   *       hide_minimize: false
   *       hide_maximize: false
   *       resizable: true
   *       draggable: true
   *     show: true                 # show immediately (default true)
   *     show_duration: 300         # fade-in ms
   */
  /**
   * Pre-create a viewer window at play() time — hidden, src already set.
   * The browser starts buffering immediately so show() at scenario time is instant.
   * Called for every viewer_open action before the timeline starts.
   */
  _prewarmViewer(action) {
    if (!this._viewers) this._viewers = {};

    var id      = action.id      || ('viewer_' + Date.now());
    var kind    = action.viewer  || 'video';
    var src     = action.src     || '';
    var mode    = action.mode    || 'bridge';
    var winOpts = action.window  || null;

    // Already pre-warmed (e.g. duplicate viewer_open with same id)
    if (this._viewers[id] && this._viewers[id]._prewarmed) return;

    var viewerOpts = {
      src:      src,
      mode:     mode,
      autoplay: false,   // don't autoplay during pre-warm — just buffer
      loop:     action.loop     !== undefined ? action.loop     : false,
      muted:    action.muted    !== undefined ? action.muted    : true,
      controls: action.controls !== undefined ? action.controls : true,
      volume:   action.volume   !== undefined ? action.volume   : 0.8,
      fit:      action.fit      || 'contain',
      name:     action.name     || '',
    };

    var viewer, win;
    var sceneLayer = this._getSceneLayer();
    var root = sceneLayer || (this._ctx && this._ctx.viewerRoot) || document.body;

    if (winOpts) {
      var wo = {
        title:        winOpts.title        || (kind === 'video' ? 'Video' : kind === 'image' ? 'Image' : 'Audio'),
        width:        winOpts.width        || (kind === 'sound' ? 480 : 640),
        height:       winOpts.height       || (kind === 'sound' ? 180 : 400),
        x:            winOpts.x            !== undefined ? winOpts.x : 100,
        y:            winOpts.y            !== undefined ? winOpts.y : 80,
        hideMinimize: winOpts.hide_minimize || false,
        hideMaximize: winOpts.hide_maximize || false,
        resizable:    winOpts.resizable    !== false,
        draggable:    winOpts.draggable    !== false,
        autostart:    false,
      };
      if (!sceneLayer) wo.sceneSpace = false;

      if (kind === 'video')       { viewer = new IDEViewerVideo(viewerOpts); win = viewer.openInWindow(wo); }
      else if (kind === 'image')  { viewer = new IDEViewerImage(viewerOpts); win = viewer.openInWindow(wo); }
      else                        { viewer = new IDEViewerSound(viewerOpts); win = viewer.openInWindow(wo); }

      win.mount(root);

      // CRITICAL: use visibility:hidden not opacity:0 — opacity:0 suspends video
      // decode pipeline in Chromium/WebKit, causing 3-5s black on first show().
      // visibility:hidden keeps the decode pipeline hot while hiding from view.
      win.el.style.visibility = 'hidden';
      win.el.style.opacity    = '1';   // must be 1 for decode to run
      win.el.style.pointerEvents = 'none';

      // Start playing immediately (muted) so first frame is decoded before show()
      if (kind === 'video' && viewer._videoEl) {
        viewer._videoEl.muted = true;
        viewer._videoEl.play().catch(function() {});
      }

    } else {
      if (kind === 'video')       viewer = new IDEViewerVideo(viewerOpts);
      else if (kind === 'image')  viewer = new IDEViewerImage(viewerOpts);
      else                        viewer = new IDEViewerSound(viewerOpts);
      viewer.mount(root);
      // Same: visibility:hidden keeps decode pipeline active
      if (viewer.el) {
        viewer.el.style.visibility  = 'hidden';
        viewer.el.style.opacity     = '1';
        viewer.el.style.pointerEvents = 'none';
      }
      if (kind === 'video' && viewer._videoEl) {
        viewer._videoEl.muted = true;
        viewer._videoEl.play().catch(function() {});
      }
      win = null;
    }

    this._viewers[id] = { viewer: viewer, win: win, _prewarmed: true };
  }

  /**
   * Show a pre-warmed viewer window (or create it if not pre-warmed).
   * Reuses the existing hidden window — just shows it and starts playback.
   */
  _doViewerOpen(action) {
    if (!this._viewers) this._viewers = {};

    var id      = action.id      || ('viewer_' + Date.now());
    var doShow  = action.show    !== false;
    var showDur = action.show_duration !== undefined ? action.show_duration : 300;

    var entry = this._viewers[id];

    if (entry && entry._prewarmed) {
      // ── Reuse pre-warmed window ──────────────────────────────────────────
      entry._prewarmed = false;  // mark as active

      // Seek back to start (video has been playing silently during pre-warm)
      // then apply final playback settings and play
      var v = entry.viewer;
      if (v && v._videoEl) {
        v._videoEl.loop    = action.loop  !== false;
        v._videoEl.muted   = action.muted !== false;
        v._videoEl.currentTime = 0;
        if (action.autoplay !== false) v._videoEl.play().catch(function() {});
      } else if (v && v._audioEl) {
        v._audioEl.currentTime = 0;
        if (action.autoplay !== false) v._audioEl.play().catch(function() {});
      }

      if (doShow) {
        if (entry.win) {
          entry.win.show(showDur);
        } else if (entry.viewer && entry.viewer.el) {
          var el = entry.viewer.el;
          el.style.transition   = 'opacity ' + showDur + 'ms ease';
          el.style.opacity      = '1';
          el.style.pointerEvents = '';
        }
      }
      return;
    }

    // ── Fallback: create fresh (pre-warm missed or id collision) ─────────
    var kind    = action.viewer  || 'video';
    var src     = action.src     || '';
    var mode    = action.mode    || 'bridge';
    var winOpts = action.window  || null;

    // Destroy existing viewer with same id
    if (entry) {
      try { entry.win.destroy(); } catch(e) {}
      try { entry.viewer.destroy(); } catch(e) {}
      delete this._viewers[id];
    }

    var viewerOpts = {
      src:      src,
      mode:     mode,
      autoplay: action.autoplay !== undefined ? action.autoplay : false,
      loop:     action.loop     !== undefined ? action.loop     : false,
      muted:    action.muted    !== undefined ? action.muted    : true,
      controls: action.controls !== undefined ? action.controls : true,
      volume:   action.volume   !== undefined ? action.volume   : 0.8,
      fit:      action.fit      || 'contain',
      name:     action.name     || '',
    };

    var viewer, win;
    var sceneLayer = this._getSceneLayer();
    var root = sceneLayer || (this._ctx && this._ctx.viewerRoot) || document.body;

    if (winOpts) {
      var wo = {
        title:        winOpts.title        || (kind === 'video' ? 'Video' : kind === 'image' ? 'Image' : 'Audio'),
        width:        winOpts.width        || (kind === 'sound' ? 480 : 640),
        height:       winOpts.height       || (kind === 'sound' ? 180 : 400),
        x:            winOpts.x            !== undefined ? winOpts.x : 100,
        y:            winOpts.y            !== undefined ? winOpts.y : 80,
        hideMinimize: winOpts.hide_minimize || false,
        hideMaximize: winOpts.hide_maximize || false,
        resizable:    winOpts.resizable    !== false,
        draggable:    winOpts.draggable    !== false,
        autostart:    viewerOpts.autoplay,
      };
      if (!sceneLayer) wo.sceneSpace = false;

      if (kind === 'video')       { viewer = new IDEViewerVideo(viewerOpts); win = viewer.openInWindow(wo); }
      else if (kind === 'image')  { viewer = new IDEViewerImage(viewerOpts); win = viewer.openInWindow(wo); }
      else                        { viewer = new IDEViewerSound(viewerOpts); win = viewer.openInWindow(wo); }

      win.mount(root);
      if (doShow) win.show(showDur);
    } else {
      if (kind === 'video')       viewer = new IDEViewerVideo(viewerOpts);
      else if (kind === 'image')  viewer = new IDEViewerImage(viewerOpts);
      else                        viewer = new IDEViewerSound(viewerOpts);
      viewer.mount(root);
      win = null;
    }

    this._viewers[id] = { viewer: viewer, win: win };
  }

  /**
   * Show a previously opened viewer window.
   *
   * YAML:
   *   - at: 5000
   *     type: viewer_show
   *     id: preview_video
   *     duration: 300
   */
  _doViewerShow(action) {
    var entry = this._viewers && this._viewers[action.id];
    if (!entry) { console.warn('[IDEScenario] viewer_show: unknown id', action.id); return; }
    var dur = action.duration !== undefined ? action.duration : 300;
    if (entry.win) entry.win.show(dur);
    else if (entry.viewer && entry.viewer.el) {
      entry.viewer.el.style.transition = 'opacity ' + dur + 'ms ease';
      entry.viewer.el.style.opacity = '1';
    }
  }

  /**
   * Hide a previously opened viewer window.
   *
   * YAML:
   *   - at: 8000
   *     type: viewer_hide
   *     id: preview_video
   *     duration: 300
   */
  _doViewerHide(action) {
    var entry = this._viewers && this._viewers[action.id];
    if (!entry) { console.warn('[IDEScenario] viewer_hide: unknown id', action.id); return; }
    var dur = action.duration !== undefined ? action.duration : 300;
    if (entry.win) entry.win.hide(dur);
    else if (entry.viewer && entry.viewer.el) {
      entry.viewer.el.style.transition = 'opacity ' + dur + 'ms ease';
      entry.viewer.el.style.opacity = '0';
    }
  }

  /**
   * Change the source of an open viewer.
   *
   * YAML:
   *   - at: 10000
   *     type: viewer_set_source
   *     id: preview_video
   *     src: /.temp/recordings/stage2.mp4
   *     name: Stage 2 Result      # optional title update
   */
  _doViewerSetSource(action) {
    var entry = this._viewers && this._viewers[action.id];
    if (!entry) { console.warn('[IDEScenario] viewer_set_source: unknown id', action.id); return; }
    var src  = action.src  || '';
    var name = action.name || '';
    if (entry.viewer && entry.viewer.setSource) entry.viewer.setSource(src, name);
    if (name && entry.win) entry.win.setTitle(name);
  }

  // ── Audio playback (narration / soundtrack) ───────────────────────────────

  /**
   * Create (or reuse) an <audio> element for the given channel ('narration' or
   * 'soundtrack') and start playing it.
   *
   * @param {string} channel  — 'narration' | 'soundtrack' | any custom id
   * @param {object|null} cfg — { src, volume?, loop?, autoplay? }
   *                           autoplay defaults to true; loop defaults to false
   *                           (soundtrack defaults loop to true)
   */
  _startAudio(channel, cfg) {
    if (!cfg || !cfg.src) return;

    // Reuse existing element if src hasn't changed
    if (!this._audioEls) this._audioEls = {};
    var existing = this._audioEls[channel];
    if (existing && existing.src === cfg.src) {
      existing.currentTime = 0;
      existing.play().catch(function() {});
      return;
    }

    // Destroy old element if src changed
    if (existing) {
      existing.pause();
      existing.src = '';
      existing.remove();
    }

    var el = document.createElement('audio');
    el.src = cfg.src;
    el.volume = (cfg.volume !== undefined) ? Math.max(0, Math.min(1, cfg.volume)) : 1.0;
    // soundtrack loops by default; narration does not
    el.loop = (cfg.loop !== undefined) ? !!cfg.loop : (channel === 'soundtrack');
    el.preload = 'auto';
    // Hide from layout
    el.style.display = 'none';
    document.body.appendChild(el);

    var self = this;
    // Auto-stop scenario audio when non-looping track finishes
    el.addEventListener('ended', function() {
      if (!el.loop) {
        el.pause();
        el.currentTime = 0;
      }
    });

    var autoplay = (cfg.autoplay !== undefined) ? !!cfg.autoplay : true;
    if (autoplay) {
      el.play().catch(function(e) {
        console.warn('[IDEScenario] audio play failed (' + channel + '):', e.message || e);
      });
    }

    this._audioEls[channel] = el;
  }

  /**
   * Stop and reset an audio channel.
   * @param {string} channel
   * @param {boolean} [destroy=false] — if true, remove the element entirely
   */
  _stopAudio(channel, destroy) {
    if (!this._audioEls) return;
    var el = this._audioEls[channel];
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    if (destroy) {
      el.src = '';
      el.remove();
      delete this._audioEls[channel];
    }
  }

  /**
   * audio_play action — play or swap a named audio channel mid-scenario.
   *
   * YAML:
   *   - at: 5000
   *     type: audio_play
   *     channel: soundtrack      # 'narration' | 'soundtrack' | any custom id
   *     src: /.temp/audio/bg.mp3 # optional — omit to resume current src
   *     volume: 0.4              # optional
   *     loop: true               # optional
   *     fade_in: 800             # optional — fade in over N ms
   */
  _doAudioPlay(action) {
    var channel = action.channel || 'narration';
    if (action.src) {
      // New source — (re)create the element
      this._startAudio(channel, {
        src:      action.src,
        volume:   action.volume,
        loop:     action.loop,
        autoplay: true,
      });
    } else {
      // Resume existing
      if (!this._audioEls) return;
      var el = this._audioEls[channel];
      if (!el) return;
      if (action.volume !== undefined) el.volume = Math.max(0, Math.min(1, action.volume));
      if (action.loop    !== undefined) el.loop   = !!action.loop;
      el.play().catch(function() {});
    }

    // Optional fade-in
    if (action.fade_in && this._audioEls && this._audioEls[channel]) {
      var el = this._audioEls[channel];
      var targetVol = el.volume;
      el.volume = 0;
      var steps = 20;
      var stepMs = action.fade_in / steps;
      var step = 0;
      var tid = setInterval(function() {
        step++;
        el.volume = Math.min(targetVol, (step / steps) * targetVol);
        if (step >= steps) clearInterval(tid);
      }, stepMs);
      this._timers.push(tid);
    }
  }

  /**
   * audio_stop action — stop a named audio channel mid-scenario.
   *
   * YAML:
   *   - at: 12000
   *     type: audio_stop
   *     channel: soundtrack
   *     fade_out: 1000           # optional — fade out over N ms before stopping
   */
  _doAudioStop(action) {
    var channel = action.channel || 'narration';
    if (!this._audioEls || !this._audioEls[channel]) return;
    var el = this._audioEls[channel];
    var self = this;

    if (action.fade_out) {
      var startVol = el.volume;
      var steps = 20;
      var stepMs = action.fade_out / steps;
      var step = 0;
      var tid = setInterval(function() {
        step++;
        el.volume = Math.max(0, startVol * (1 - step / steps));
        if (step >= steps) {
          clearInterval(tid);
          self._stopAudio(channel);
          el.volume = startVol; // restore for next play
        }
      }, stepMs);
      this._timers.push(tid);
    } else {
      this._stopAudio(channel);
    }
  }

  _getWin() {
    if (this._ctx.win) return this._ctx.win;
    if (typeof window !== 'undefined' && window.win) return window.win;
    return null;
  }

  /**
   * Returns the scene layer div from the IDEWindowWrapper.
   * Viewer windows mounted here inherit the camera transform (scale, 3D rotation,
   * pan) and move/rotate/scale in perfect sync with the IDE window.
   */
  _getSceneLayer() {
    var win = this._getWin();
    if (win && win.sceneLayer) return win.sceneLayer;
    if (typeof window !== 'undefined' && window.win && window.win.sceneLayer) return window.win.sceneLayer;
    return null;
  }

  _getLabels() {
    if (this._ctx.labels) return this._ctx.labels;
    if (typeof window !== 'undefined' && window.labels) return window.labels;
    return null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _getLog() {
    if (this._log) return this._log;
    var mp = this._ctx.mainPanel;
    if (mp && mp._chatLog) { this._log = mp._chatLog; return this._log; }
    return null;
  }

  _getBox() {
    if (this._box) return this._box;
    var mp = this._ctx.mainPanel;
    if (mp && mp._chatBox) { this._box = mp._chatBox; return this._box; }
    return null;
  }

  // ── Static helpers ─────────────────────────────────────────────────────────

  /**
   * Resolve relative time markers in an actions array.
   *
   * Supported `at` formats:
   *   1200        — absolute milliseconds (number)
   *   "+4000"     — +4000 ms relative to previous action's resolved time
   *   "+500"      — +500 ms (half a second after previous)
   *   "+0"        — same time as previous action (parallel actions)
   *
   * Returns a NEW array with `at` replaced by resolved absolute ms values.
   * Original action objects are not mutated.
   */
  static _resolveTimings(actions) {
    var prevMs = 0;
    return actions.map(function(action) {
      var raw = action.at;
      var ms;

      if (typeof raw === 'string' && raw.charAt(0) === '+') {
        // Relative: "+N" — milliseconds offset from previous action
        var offset = parseInt(raw.slice(1), 10);
        if (isNaN(offset)) offset = 0;
        ms = prevMs + offset;
      } else {
        // Absolute ms (number or numeric string)
        ms = Math.round(parseFloat(raw) || 0);
      }

      prevMs = ms;
      // Return shallow copy with resolved `at`
      return Object.assign({}, action, { at: ms });
    });
  }

  /**
   * Parse a YAML string into a JS object.
   * Uses js-yaml if available (window.jsyaml), otherwise falls back to a
   * minimal built-in parser that handles the scenario format.
   */
  static parseYaml(yamlStr) {
    if (typeof window !== 'undefined' && window.jsyaml) {
      return window.jsyaml.load(yamlStr);
    }
    return IDEScenario._miniYaml(yamlStr);
  }

  /**
   * Minimal YAML parser — handles the scenario format only.
   * Supports: top-level keys, string values, list items (- key: val),
   * nested objects under list items, multi-line strings via |.
   * Not a full YAML parser — use js-yaml for complex cases.
   */
  static _miniYaml(text) {
    var lines  = text.split('\n');
    var result = {};
    var i      = 0;

    function peek()  { return lines[i]; }
    function next()  { return lines[i++]; }
    function indent(line) {
      var m = line.match(/^(\s*)/);
      return m ? m[1].length : 0;
    }
    function trimVal(v) {
      v = v.trim();
      if ((v[0] === '"' && v[v.length-1] === '"') ||
          (v[0] === "'" && v[v.length-1] === "'")) {
        return v.slice(1, -1);
      }
      if (v === 'true')  return true;
      if (v === 'false') return false;
      if (v === 'null' || v === '~') return null;
      var n = Number(v);
      if (!isNaN(n) && v !== '') return n;
      return v;
    }

    function parseBlock(baseIndent) {
      var obj = null;
      var arr = null;

      while (i < lines.length) {
        var line = peek();
        var raw  = line;
        var stripped = line.trimEnd();
        if (stripped === '' || stripped.trimStart()[0] === '#') { next(); continue; }

        var ind = indent(stripped);
        if (ind < baseIndent) break;

        next(); // consume

        var content = stripped.trimStart();

        // List item
        if (content.startsWith('- ')) {
          if (!arr) arr = [];
          var rest = content.slice(2).trim();
          if (rest === '') {
            // next lines are the object body
            var item = parseBlock(ind + 2);
            arr.push(item || {});
          } else if (rest.includes(': ')) {
            // inline key: val — start an object, then continue parsing same-indent
            var kv = rest.split(': ');
            var item = {};
            item[kv[0].trim()] = trimVal(kv.slice(1).join(': '));
            // peek for more keys at same indent+2
            while (i < lines.length) {
              var nxt = lines[i];
              if (!nxt || nxt.trim() === '' || nxt.trim()[0] === '#') { i++; continue; }
              var nind = indent(nxt.trimEnd());
              if (nind <= ind) break;
              i++;
              var nc = nxt.trimStart();
              if (nc.startsWith('- ')) {
                // sub-list item (e.g. tool_calls)
                var subKey = Object.keys(item)[Object.keys(item).length - 1];
                // Actually this is a new list item at same level — push back
                i--;
                break;
              }
              if (nc.includes(': ')) {
                var nkv = nc.split(': ');
                var nval = nkv.slice(1).join(': ').trim();
                if (nval === '') {
                  // sub-list follows
                  var subArr = [];
                  while (i < lines.length) {
                    var sl = lines[i];
                    if (!sl || sl.trim() === '') { i++; continue; }
                    var sind = indent(sl.trimEnd());
                    if (sind <= nind) break;
                    i++;
                    var sc = sl.trimStart();
                    if (sc.startsWith('- ')) subArr.push(trimVal(sc.slice(2).trim()));
                  }
                  item[nkv[0].trim()] = subArr;
                } else {
                  item[nkv[0].trim()] = trimVal(nval);
                }
              }
            }
            arr.push(item);
          } else {
            arr.push(trimVal(rest));
          }
          obj = null;
          continue;
        }

        // Key: value
        if (content.includes(': ') || content.endsWith(':')) {
          if (!obj) obj = arr ? null : (result === null ? {} : null);
          var colonIdx = content.indexOf(': ');
          var key, val;
          if (colonIdx >= 0) {
            key = content.slice(0, colonIdx).trim();
            val = content.slice(colonIdx + 2).trim();
          } else {
            key = content.slice(0, -1).trim();
            val = '';
          }

          if (val === '' || val === '|') {
            // nested block or multiline
            var sub = parseBlock(ind + 2);
            if (arr) { /* ignore */ }
            else result[key] = sub;
          } else {
            if (arr) { /* ignore */ }
            else result[key] = trimVal(val);
          }
          continue;
        }
      }

      return arr || obj || result;
    }

    parseBlock(0);
    return result;
  }

  /**
   * add_console_log — append a line to the fake console panel.
   * YAML:
   *   - at: 5000
   *     type: add_console_log
   *     kind: tool          # info | tool | out | ok | err | warn
   *     text: "ToolReadFile  game/world/DungeonGen.cpp"
   */
  _doAddConsoleLog(action) {
    var mp = this._ctx.mainPanel;
    if (!mp || !mp._fakeConsole) return;
    mp._fakeConsole.add(action.kind || 'info', action.text || '');
  }

  /**
   * clear_console — clear all lines from the fake console.
   * YAML:
   *   - at: 3000
   *     type: clear_console
   */
  _doClearConsole() {
    var mp = this._ctx.mainPanel;
    if (!mp || !mp._fakeConsole) return;
    mp._fakeConsole.clear();
  }

  /**
   * console_mode — switch the terminal emulation mode (clears the screen).
   * YAML:
   *   - at: 1000
   *     type: console_mode
   *     mode: shell          # 'shell' | 'claude' | 'log'
   */
  _doConsoleMode(action) {
    var mp = this._ctx.mainPanel;
    if (!mp || !mp._fakeConsole) return;
    mp._fakeConsole.setMode(action.mode || 'log');
  }

  /**
   * terminal_type — typewrite a shell command, then print its output.
   * YAML:
   *   - at: 1500
   *     type: terminal_type
   *     command: "git status"
   *     output: |            # optional, multi-line
   *       On branch main
   *       nothing to commit, working tree clean
   *     out_kind: out         # info|out|ok|err|warn (default out)
   */
  _doTerminalType(action) {
    var mp = this._ctx.mainPanel;
    if (!mp || !mp._fakeConsole) return;
    var con = mp._fakeConsole;
    if (con._mode !== 'shell') con.setMode('shell');
    con.typeCommand(action.command || '', function() {
      if (action.output) con.output(action.output, action.out_kind || 'out');
    });
  }

  /**
   * console_demo — play a full canned terminal demo.
   * YAML:
   *   - at: 3000
   *     type: console_demo
   *     demo: shell           # 'shell' | 'claude'
   */
  _doConsoleDemo(action) {
    var mp = this._ctx.mainPanel;
    if (!mp || !mp._fakeConsole) return;
    var con = mp._fakeConsole;
    if (action.demo === 'claude') con.runClaudeCodeDemo();
    else                          con.runShellDemo();
  }

  /**
   * add_subagent_call — add a new subagent card to the Actions tab.
   *
   * YAML params:
   *   id          {string}   — reference id for later update_subagent_call
   *   caller      {string}   — caller avatar key  (e.g. 'many', 'po', 'dev'). Defaults to
   *                            'many' — subagent delegation is normally triggered by the
   *                            'Many' orchestrator, not the user/PO.
   *   caller_name {string}   — caller display name (e.g. 'Many'); defaults to title-cased `caller`
   *   caller_role {string}   — caller role label (e.g. 'Team Leader'); auto-resolved from
   *                            `caller` if omitted (never uppercased) — pass '' to force-hide it
   *   target      {string}   — target avatar key  (e.g. 'dev', 'designer')
   *   role        {string}   — target role label   (e.g. 'Developer'); auto-resolved from
   *                            `target` if omitted (never uppercased) — pass '' to force-hide it
   *   name        {string}   — target display name (e.g. 'Cody')
   *   question    {string}   — task description
   *   status      {string}   — initial status (default 'executing')
   *   switch_tab  {boolean}  — switch Actions tab into view (default true)
   */
  _doAddSubagentCall(action) {
    var mp = this._ctx.mainPanel;
    if (!mp || !mp._subagentsPanel) return;

    if (action.switch_tab !== false) {
      mp.switchCentralTab && mp.switchCentralTab('Actions');
    }

    var card = mp._subagentsPanel.addCard({
      callerName:        action.caller      || 'many',
      callerDisplayName: action.caller_name || '',
      callerRole:        action.caller_role, // undefined -> card auto-resolves via _SAP_ROLE_MAP
      targetName: action.target   || 'dev',
      agentRole:  action.role,    // undefined -> card auto-resolves via _SAP_ROLE_MAP
      agentName:  action.name     || 'Agent',
      question:   action.question || '',
      cli:        action.cli !== undefined ? action.cli : false,
      plan:       action.plan || null,
      autoStart:  true,
    });

    card.setStatus(action.status || 'executing');

    if (action.id) {
      this._subagentCards = this._subagentCards || {};
      this._subagentCards[action.id] = card;
    }
  }

  /**
   * update_subagent_call — update an existing subagent card.
   *
   * YAML params:
   *   id      {string}  — id given in add_subagent_call
   *   status  {string}  — 'executing'|'completed'|'failed'|'selecting'
   *   tool    {string}  — current tool label text
   *   cli     {boolean} — toggle CLI button
   *   plan    {string|array} — update plan checklist
   *   elapsed {string}  — optional elapsed override
   *   finish  {boolean} — call card.finish()
   *   fail    {boolean} — call card.fail()
   */
  _doUpdateSubagentCall(action) {
    var cards = this._subagentCards || {};
    var card = cards[action.id];
    if (!card) { console.warn('[IDEScenario] update_subagent_call: no card with id', action.id); return; }
    if (action.fail)   { card.fail();                     return; }
    if (action.finish) { card.finish(action.elapsed);     return; }
    if (action.status) card.setStatus(action.status);
    if (action.cli !== undefined)  card.setCli(action.cli);
    if (action.plan !== undefined) card.setPlan(action.plan);
    if (action.tool !== undefined) card.setCurrentTool(action.tool, action.elapsed, true);
  }

  // ── Chat log instant operations ────────────────────────────────────────────

  /**
   * append_chat_message — instantly append a message with no entrance animation.
   * Useful for pre-populating chat history before the scenario's animated turns begin.
   *
   * YAML:
   *   - at: 0
   *     type: append_chat_message
   *     role: user              # user | agent | status
   *     name: You               # display name
   *     role_label: Product Owner
   *     text: Can you add dropout to the model?
   *     model: claude-sonnet   # agent only
   *     time: '10:42'           # optional timestamp
   *     avatar: images/avatars/po_circle.png  # optional
   */
  _doAppendChatMessage(action) {
    var log = this._getLog();
    if (!log) return;
    log.appendInstant({
      role:      action.role       || 'user',
      name:      action.name       || (action.role === 'agent' ? 'Cody' : 'You'),
      roleLabel: action.role_label || (action.role === 'agent' ? 'Front-end Developer' : 'Product Owner'),
      text:      action.text       || '',
      model:     action.model      || '',
      time:      action.time       || '',
      avatar:    action.avatar     || '',
    });
  }

  /**
   * clear_chat_log — clear all messages from the chat log instantly.
   *
   * YAML:
   *   - at: 0
   *     type: clear_chat_log
   */
  _doClearChatLog() {
    var log = this._getLog();
    if (!log) return;
    log.clear();
  }

  // ── Shadow gradient handlers ───────────────────────────────────────────────

  /**
   * Get or create the shadow gradient container — a fixed div mirroring
   * the vpCapture frame, at z-index 48.5 (above IDE, below labels overlay).
   */
  _getShadowGradientContainer() {
    if (this._sgContainer) return this._sgContainer;

    // Find vpCapture to mirror its bounds
    var vpCapture = document.getElementById('vpCapture');

    var el = document.createElement('div');
    el.id = 'ide-shadow-gradients';
    el.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:48',          // same layer as vpCapture, rendered over it
      'overflow:hidden',
      'display:none',
    ].join(';');
    document.body.appendChild(el);
    this._sgContainer = el;

    // Mirror vpCapture bounds (same logic as IDELabels._syncOverlayBounds)
    var self = this;
    function syncBounds() {
      var vp = document.getElementById('vpCapture');
      if (!vp || vp.style.display === 'none' || !vp.offsetWidth) {
        el.style.display = 'none';
        return;
      }
      var r = vp.getBoundingClientRect();
      el.style.left   = r.left   + 'px';
      el.style.top    = r.top    + 'px';
      el.style.width  = r.width  + 'px';
      el.style.height = r.height + 'px';
      el.style.display = 'block';
    }
    this._sgSyncBounds = syncBounds;
    syncBounds();
    window.addEventListener('resize', syncBounds);

    return el;
  }

  /**
   * Build a CSS gradient string from action params.
   *
   * Direction resolution priority:
   *   1. x + y  → radial gradient centered at (x%, y%)
   *   2. dx + dy → linear-gradient at angle derived from vector
   *   3. angle   → linear-gradient at explicit degree (0 = top→bottom)
   *   4. direction → named preset mapped to vector
   *   5. default → 'bottom' (shadow at bottom, fades upward)
   *
   * @param {object} a        — action params
   * @param {number} opacity  — override opacity (for update)
   * @returns {string}        — CSS gradient value
   */
  _buildShadowGradient(a, opacity) {
    var op      = opacity !== undefined ? opacity : (a.opacity !== undefined ? a.opacity : 0.7);
    var radius  = a.radius  !== undefined ? a.radius  : 60;
    var color   = a.color   || '0,0,0';

    var rgba0 = 'rgba(' + color + ',' + op + ')';
    var rgba1 = 'rgba(' + color + ',0)';

    // ── Radial mode: x + y given ───────────────────────────────────────────
    if (a.x !== undefined && a.y !== undefined) {
      return 'radial-gradient(ellipse ' + radius + '% ' + radius + '% at ' +
             a.x + '% ' + a.y + '%, ' + rgba0 + ' 0%, ' + rgba1 + ' 100%)';
    }

    // ── Linear mode: resolve angle in degrees ──────────────────────────────
    var angleDeg;

    if (a.dx !== undefined || a.dy !== undefined) {
      // Custom vector: (dx, dy) points toward the transparent end
      var dx = a.dx !== undefined ? a.dx : 0;
      var dy = a.dy !== undefined ? a.dy : 1;
      // CSS gradient angle 0deg = bottom→top, 90deg = left→right
      // atan2(dx, -dy) gives CSS-compatible angle
      angleDeg = Math.atan2(dx, -dy) * 180 / Math.PI;
    } else if (a.angle !== undefined) {
      // Explicit angle in degrees: 0 = shadow at top (fades down),
      // 90 = shadow at right, 180 = shadow at bottom (fades up), etc.
      angleDeg = a.angle;
    } else {
      // Named direction presets → (dx, dy)
      var PRESETS = {
        'top':          [  0, -1 ],
        'bottom':       [  0,  1 ],
        'left':         [ -1,  0 ],
        'right':        [  1,  0 ],
        'top_left':     [ -1, -1 ],
        'top_right':    [  1, -1 ],
        'bottom_left':  [ -1,  1 ],
        'bottom_right': [  1,  1 ],
      };
      var dir = a.direction || 'bottom';
      var vec = PRESETS[dir] || PRESETS['bottom'];
      angleDeg = Math.atan2(vec[0], -vec[1]) * 180 / Math.PI;
    }

    // CSS linear-gradient angle: the angle points toward the END color (transparent)
    // We want solid at source → so the angle we computed already points transparent-end
    return 'linear-gradient(' + angleDeg.toFixed(2) + 'deg, ' +
           rgba0 + ' 0%, ' + rgba1 + ' ' + radius + '%)';
  }

  /**
   * shadow_gradient_show — create and fade in a gradient overlay.
   *
   * YAML:
   *   - at: 1000
   *     type: shadow_gradient_show
   *     id: bottom_vignette     # optional, default 'sg_default'
   *     direction: bottom       # named preset (ignored if dx/dy or x/y given)
   *     # — OR —
   *     dx: 0                   # custom direction vector (any angle)
   *     dy: 1
   *     # — OR —
   *     angle: 135              # explicit degrees (0=top→down, 90=right→left)
   *     # — OR (radial) —
   *     x: 50                   # position % → radial gradient
   *     y: 80
   *     opacity: 0.7            # black opacity at solid end (default 0.7)
   *     radius: 60              # falloff size as % (default 60)
   *     duration: 400           # fade-in ms (default 400)
   *     color: '0,0,0'          # RGB components (default black)
   */
  _doShadowGradientShow(action) {
    var container = this._getShadowGradientContainer();
    var id        = action.id || 'sg_default';
    var duration  = action.duration !== undefined ? action.duration : 400;

    // Remove existing element with same id if present
    this._gradients = this._gradients || {};
    if (this._gradients[id]) {
      this._gradients[id].remove();
      delete this._gradients[id];
    }

    var el = document.createElement('div');
    el.dataset.sgId = id;
    el.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'background:' + this._buildShadowGradient(action),
      'opacity:0',
      'transition:opacity ' + duration + 'ms ease',
    ].join(';');

    // Store action params for later update (to rebuild gradient with new opacity)
    el._sgParams = {
      color:     action.color     || '0,0,0',
      radius:    action.radius    !== undefined ? action.radius    : 60,
      dx:        action.dx,
      dy:        action.dy,
      angle:     action.angle,
      direction: action.direction,
      x:         action.x,
      y:         action.y,
    };

    container.appendChild(el);
    this._gradients[id] = el;

    // Sync container bounds then trigger fade-in
    this._sgSyncBounds && this._sgSyncBounds();
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { el.style.opacity = '1'; });
    });
  }

  /**
   * shadow_gradient_hide — fade out and remove a gradient overlay.
   *
   * YAML:
   *   - at: 5000
   *     type: shadow_gradient_hide
   *     id: bottom_vignette
   *     duration: 400           # fade-out ms (default 400)
   */
  _doShadowGradientHide(action) {
    var id       = action.id || 'sg_default';
    var duration = action.duration !== undefined ? action.duration : 400;
    var gradients = this._gradients || {};
    var el = gradients[id];
    if (!el) return;

    el.style.transition = 'opacity ' + duration + 'ms ease';
    el.style.opacity    = '0';
    var self = this;
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (self._gradients && self._gradients[id] === el) delete self._gradients[id];
    }, duration + 50);
  }

  /**
   * shadow_gradient_update — change opacity (and optionally rebuild gradient).
   *
   * YAML:
   *   - at: 6000
   *     type: shadow_gradient_update
   *     id: bottom_vignette
   *     opacity: 0.3            # new opacity
   *     radius: 80              # optionally change radius (rebuilds gradient)
   *     duration: 600           # transition ms (default 400)
   */
  _doShadowGradientUpdate(action) {
    var id       = action.id || 'sg_default';
    var duration = action.duration !== undefined ? action.duration : 400;
    var gradients = this._gradients || {};
    var el = gradients[id];
    if (!el) return;

    // Merge updated params into stored params
    var p = el._sgParams;
    if (action.radius    !== undefined) p.radius    = action.radius;
    if (action.color     !== undefined) p.color     = action.color;
    if (action.dx        !== undefined) p.dx        = action.dx;
    if (action.dy        !== undefined) p.dy        = action.dy;
    if (action.angle     !== undefined) p.angle     = action.angle;
    if (action.direction !== undefined) p.direction = action.direction;
    if (action.x         !== undefined) p.x         = action.x;
    if (action.y         !== undefined) p.y         = action.y;

    var newOpacity = action.opacity !== undefined ? action.opacity : parseFloat(el.style.opacity) || 0.7;

    el.style.transition = 'opacity ' + duration + 'ms ease, background ' + duration + 'ms ease';
    el.style.background = this._buildShadowGradient(p, newOpacity);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { el.style.opacity = '1'; });
    });
  }
}

// ── Module-level helpers (shared with main_panel.js) ──────────────────────────

function _now() {
  var d = new Date();
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}

function _typeIntoBox(box, text, speed, onDone) {
  box.setText('');
  var i = 0;
  speed = speed || 35;
  function tick() {
    if (i >= text.length) { if (onDone) onDone(); return; }
    box.setText(text.slice(0, ++i));
    setTimeout(tick, speed);
  }
  tick();
}

if (typeof module !== 'undefined') module.exports = { IDEScenario };
