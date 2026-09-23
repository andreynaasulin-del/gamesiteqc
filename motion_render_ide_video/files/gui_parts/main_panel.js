/**
 * IDEMainPanel — mirrors main_genui_layout.lui exactly:
 *
 *  upper_splitter  x:15 y:100 w:calc(100%-30) h:calc(100%-40-40-70)
 *    left panel (30%)          tabs_left  (Chat, Pipeline, History, Console, Find in files)
 *    project_widget (fill)
 *         agent_actions_splitter (horizontal)
 *              right_middle_splitter (vertical, 60%)
 *                   tabs_right  (60%)  Actions / File editors / Meta editors
 *                   tabs_bottom (40%)  Terminal / Output / Problems
 *              folder_tabs (40%)       Files / Meta / Web browsers
 *
 * Uses only bridge CSS classes — no custom borders.
 * Tabs: .tabs-header / .tab / .tab--active  (exact bridge markup).
 */
class IDEMainPanel {
  constructor() {
    this.el = null;
  }

  /**
   * Pass the scenario config before mounting so browser tabs can read
   * their initial state (video src, empty flag, label, etc.)
   * @param {object} scenario — the SCENARIO object from the HTML
   */
  setScenario(scenario) {
    this._scenario = scenario;
    return this;
  }

  mountInto(wrapper) {
    this.el = this._build();
    wrapper.setContent(this.el);
  }

  /**
   * Adjust the width of the left or right side panel.
   * Panels are percentage-sized within the splitter (left starts 30%, right 20%).
   * The center column absorbs the delta.
   * @param {'left'|'right'} side
   * @param {number} deltaPct — percentage-point delta (e.g. +2 or -2)
   * @returns {number} new width percentage
   */
  adjustSidePanelWidth(side, deltaPct) {
    var panel = side === 'left' ? this._leftPanel : side === 'right' ? this._rightPanel : null;
    if (!panel) { console.warn('[IDEMainPanel] adjustSidePanelWidth: invalid side', side); return null; }
    var min = 10, max = 50;
    var cur = parseFloat(panel.style.width) || (side === 'left' ? 30 : 20);
    var next = Math.min(max, Math.max(min, cur + (Number(deltaPct) || 0)));
    panel.style.width = next + '%';
    return next;
  }

  /**
   * Set side panel width to an absolute %, or adjust by relative delta.
   * Accepts: 25 (absolute), "+5" / "-5" (delta). Clamped 10–50%.
   * The center column absorbs the change.
   * @param {'left'|'right'} side
   * @param {number|string} pct
   * @returns {number|null} new width percentage
   */
  setSidePanelWidth(side, pct) {
    var panel = side === 'left' ? this._leftPanel
              : side === 'right' ? this._rightPanel : null;
    if (!panel) { console.warn('[IDEMainPanel] setSidePanelWidth: invalid side', side); return null; }
    var min = 10, max = 50;
    var cur = parseFloat(panel.style.width) || (side === 'left' ? 30 : 20);
    var s = String(pct).trim();
    var next = (s.charAt(0) === '+' || s.charAt(0) === '-')
      ? cur + (parseFloat(s) || 0)
      : (parseFloat(s) || cur);
    next = Math.min(max, Math.max(min, next));
    panel.style.width = next + '%';
    return next;
  }

  /**
   * Return the current video src for a browser tab, or null if empty.
   * Used by Fit to video to know whether a video is loaded.
   * @param {string} tabId — e.g. 'br-video'
   * @returns {string|null}
   */
  getVideoSrc(panelId) {
    var browser = this._getVideoPanelBrowser(panelId);
    return browser ? (browser._videoSrc || null) : null;
  }

  /** Resolve a video-capable browser or custom central panel by its id. */
  _getVideoPanelBrowser(panelId) {
    var browser = this._browsers && this._browsers[panelId];
    if (browser) return browser;
    var customPanel = this._customPanels && this._customPanels[panelId];
    return customPanel ? customPanel.browser : null;
  }

  /**
   * Return the selected video-capable panel id.
   * A custom center panel takes precedence over the nested browser tab.
   * @returns {string|null}
   */
  getActiveVideoPanelId() {
    var centralTabs = this._centralTabs || [];
    var activeIndex = this._tabsRight && this._tabsRight._activeIndex;
    var activeCentralTab = centralTabs[activeIndex];
    if (activeCentralTab && this._customPanels && this._customPanels[activeCentralTab.id]) {
      return activeCentralTab.id;
    }
    return (this._browserTabHolder && this._browserTabHolder._activeId) || null;
  }

  _icon(path, size) {
    size = size || 14;
    var s = document.createElement('span');
    s.className = 'icon';
    s.style.cssText = 'width:' + size + 'px;height:' + size + 'px;min-width:' + size + 'px;min-height:' + size + 'px;--icon:url(\'/_ide/' + path + '\');opacity:0.55;';
    return s;
  }

  _buildTabsPanel(opts) {
    var tabs = opts.tabs;
    var activeIdx = opts.activeIdx !== undefined ? opts.activeIdx : 0;
    var contentBuilder = opts.contentBuilder;
    var style = opts.style || '';

    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;' + style;

    var header = document.createElement('div');
    header.className = 'tabs-header';
    header.style.cssText = 'flex-shrink:0;';

    var contents = [];
    var self = this;
    wrap._activeIndex = activeIdx;

    tabs.forEach(function(tab, i) {
      var btn = document.createElement('button');
      btn.className = 'tab' + (i === activeIdx ? ' tab--active' : '');
      btn.style.cssText = 'display:inline-flex;align-items:center;padding:2px 10px 0;font-size:12px;';

      var lbl = document.createElement('span');
      lbl.textContent = tab.label;
      btn.appendChild(lbl);

      // Pane wrapper — fills remaining space
      var paneWrap = document.createElement('div');
      paneWrap.style.cssText = 'flex:1;overflow:hidden;display:' + (i === activeIdx ? 'flex' : 'none') + ';flex-direction:column;padding:3px;';

      // panel-section inside each tab
      var pane = document.createElement('div');
      pane.className = 'panel-section';
      pane.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;';
      if (contentBuilder) contentBuilder(pane, tab, i);
      paneWrap.appendChild(pane);
      contents.push(paneWrap);

      (function(idx) {
        btn.addEventListener('click', function() {
          header.querySelectorAll('.tab').forEach(function(b, j) {
            b.classList.toggle('tab--active', j === idx);
            contents[j].style.display = j === idx ? 'flex' : 'none';
          });
          wrap._activeIndex = idx;
        });
      })(i);

      header.appendChild(btn);
    });

    wrap.appendChild(header);
    contents.forEach(function(p) { wrap.appendChild(p); });
    return wrap;
  }

  _buildChatContent(pane) {
    // Keep panel-section — pane is the "chat panel wrapper" (mirrors root
    // <panel-section> in chat_layout.lui). Log and message box sit INSIDE
    // this one shared-bg wrapper, not as two separate floating cards; only
    // the message box stands out, via its own panel-container-elevated.
    pane.style.cssText += 'display:flex;flex-direction:column;overflow:hidden;gap:8px;';

    var log = new IDEMessageLog({ messages: [], showTopBar: true, topic: 'NeuralForge improvements' });
    log.mount(pane);
    this._chatLog = log;  // expose for IDEScenario
    if (log.el) log.el.id = 'ide-chat-log';  // camera target id

    // Scenario may pin the model shown in the combo (`model_name`) and the
    // agent behind the box (`agent: { name, avatar }`); defaults stay Cody/sonnet.
    var sc = this._scenario || {};
    var agentCfg = sc.agent || {};
    var agentName = agentCfg.name || 'Cody';
    var box = new IDEMessageBox({
      agentName:   agentName,
      agentAvatar: agentCfg.avatar || 'images/avatars/dev.png',
      modelName:   sc.model_name || 'sonnet',
      placeholder: 'Ask ' + agentName + ' anything…',
      onSend: function(text) {
        if (!text.trim()) return;
        if (box._scenarioPlaying) return;  // scenario handles log entry itself
        _runUserTurn(text);
        box.setText('');
      },
    });
    box.mount(pane);
    // Inset from the wrapper's edges — matches lower's x:8 w:calc(100%-16)
    // margin inside root in chat_layout.lui.
    box.el.style.margin = '0 8px 8px';
    this._chatBox = box;  // expose for IDEScenario
    if (box.el) box.el.id = 'ide-message-box';  // camera target id

    // ── Helpers ────────────────────────────────────────────────────────────
    function _now() {
      var d = new Date();
      return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    // Run a single user→agent turn with actions
    // opts: { userText, actions:[str], replyText, onDone }
    function _runTurn(opts, onDone) {
      // 1. User message
      log.addMessage({ role: 'user', name: 'You', roleLabel: 'Product Owner',
        text: opts.userText, time: _now() });

      // 2. Start agent turn immediately (shows header + spinner)
      var ctrl = log.startAgentTurn({ model: 'claude-sonnet' });

      // 3. Feed actions one by one
      var actions = opts.actions || [];
      var ai = 0;
      var interval = setInterval(function() {
        if (ai < actions.length) {
          ctrl.addAction(actions[ai]);
          ai++;
        } else {
          clearInterval(interval);
          // 4. Finish: stop spinner, typewrite reply
          ctrl.finish(opts.replyText, onDone);
        }
      }, opts.actionDelay || 550);
    }

    // Run a user turn triggered from the message box (single generic turn)
    function _runUserTurn(text) {
      _runTurn({
        userText: text,
        actions: [
          'ToolVectorSearch  ' + text.substring(0, 35),
          'ToolReadFile  main.py',
          'ToolTextFileEdit  main.py',
        ],
        replyText: 'Done! I\'ve applied the changes to main.py based on your request.',
      });
    }

    // ── Full demo animation script ─────────────────────────────────────────
    // Called when Run is pressed. Plays a multi-turn conversation.
    // Each turn: user types → agent header appears → actions stream in → reply typewriters
    this._runChatAnimation = function() {
      log.clear();

      var script = [
        {
          userText: 'Add dropout regularization to the transformer model',
          typeDelay: 40,
          actions: [
            'ToolVectorSearch  transformer dropout regularization',
            'ToolReadFile  src/model.py',
            'ToolReadFile  src/config.yaml',
            'ToolTextFileEdit  src/model.py — add nn.Dropout(p=0.1) after each block',
            'ToolReadFile  src/model.py',
          ],
          actionDelay: 600,
          replyText: 'Done! Added dropout layers (p=0.1) after each transformer block in model.py. The dropout is applied after the attention and feed-forward sub-layers, which should help reduce overfitting during training.',
        },
        {
          userText: 'Increase hidden size to 1024 and update the config',
          typeDelay: 35,
          actions: [
            'ToolReadFile  src/config.yaml',
            'ToolTextFileEdit  src/config.yaml — hidden_size: 768 → 1024',
            'ToolReadFile  src/model.py',
            'ToolTextFileEdit  src/model.py — update hidden_size reference',
          ],
          actionDelay: 550,
          replyText: 'Updated! config.yaml now has hidden_size: 1024. Also updated the model.py reference. Note: the model will need retraining from scratch with the new dimensions — existing checkpoints are incompatible.',
        },
        {
          userText: 'Run a quick sanity check — does the model forward pass work?',
          typeDelay: 30,
          actions: [
            'ToolRunUserCommand  python -c "from src.model import NeuralForge; m=NeuralForge(); print(m)"',
            'ToolGetConsoleTail  console_id:1',
          ],
          actionDelay: 700,
          replyText: 'Forward pass works! The model initializes correctly with hidden_size=1024. Output shape is [batch, seq_len, 1024] as expected. Ready for training.',
        },
      ];

      // Type user text into box then send, one turn at a time
      var si = 0;
      function _nextTurn() {
        if (si >= script.length) return;
        var step = script[si++];
        // Typewrite into message box
        _typeIntoBox(box, step.userText, step.typeDelay || 40, function() {
          setTimeout(function() {
            box.setText('');
            _runTurn({
              userText:    step.userText,
              actions:     step.actions,
              actionDelay: step.actionDelay,
              replyText:   step.replyText,
            }, function() {
              // Pause between turns
              setTimeout(_nextTurn, 900);
            });
          }, 300);
        });
      }

      // Small intro pause then start
      setTimeout(_nextTurn, 400);
    };

    // Typewrite text into the message box input
    function _typeIntoBox(box, text, speed, onDone) {
      box.setText('');
      var i = 0;
      speed = speed || 40;
      function tick() {
        if (i >= text.length) { if (onDone) onDone(); return; }
        box.setText(text.slice(0, ++i));
        setTimeout(tick, speed);
      }
      tick();
    }
  }

  _buildFileTree(pane) {
    pane.style.cssText += 'padding:8px 4px;overflow-y:auto;';
    var self = this;
    var tree = [
      { name: 'NeuralForge', indent: 0, icon: 'images/icons/coolicons/Files/Folder_Open.png' },
      { name: 'src',         indent: 1, icon: 'images/icons/coolicons/Files/Folder_Open.png' },
      { name: 'main.py',     indent: 2, icon: 'images/icons/coolicons/File/File_Code.png', active: true },
      { name: 'utils.py',    indent: 2, icon: 'images/icons/coolicons/File/File_Code.png' },
      { name: 'model.py',    indent: 2, icon: 'images/icons/coolicons/File/File_Code.png' },
      { name: 'resources',   indent: 1, icon: 'images/icons/coolicons/Files/Folder.png' },
      { name: 'config.yaml', indent: 2, icon: 'images/icons/coolicons/File/File_Settings.png' },
      { name: 'README.md',   indent: 1, icon: 'images/icons/coolicons/File/File_Document.png' },
    ];
    tree.forEach(function(item) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:5px;padding:2px 4px 2px ' + (8 + item.indent * 14) + 'px;border-radius:4px;cursor:pointer;font-size:11px;color:var(--qc-color-text-primary,#ccc);background:' + (item.active ? 'var(--qc-color-bg-secondary2,rgba(255,255,255,0.08))' : 'transparent') + ';';
      row.appendChild(self._icon(item.icon, 13));
      var lbl = document.createElement('span');
      lbl.textContent = item.name;
      if (item.active) lbl.style.color = 'var(--qc-color-text-light,#fff)';
      row.appendChild(lbl);
      pane.appendChild(row);
    });
  }

  _buildCodeEditor(pane) {
    pane.style.cssText += 'overflow:hidden;';

    var code = document.createElement('div');
    code.style.cssText = 'flex:1;overflow:auto;padding:12px 8px;font-family:monospace;font-size:11px;line-height:1.6;color:var(--qc-color-text-primary,#ccc);';

    var lines = [
      [['comment', '# NeuralForge training loop']],
      [['keyword', 'import'], ['plain', ' torch']],
      [['keyword', 'from'], ['plain', ' src.model '], ['keyword', 'import'], ['plain', ' NeuralForge']],
      [['keyword', 'from'], ['plain', ' src.utils '], ['keyword', 'import'], ['plain', ' load_config']],
      [['plain', '']],
      [['comment', '# Initialize model']],
      [['plain', 'config = load_config('], ['string', '"resources/config.yaml"'], ['plain', ')']],
      [['plain', 'model = NeuralForge(config)']],
      [['plain', '']],
      [['keyword', 'def'], ['plain', ' train(epochs='], ['number', '100'], ['plain', '):']],
      [['plain', '    '], ['keyword', 'for'], ['plain', ' epoch '], ['keyword', 'in'], ['plain', ' range(epochs):']],
      [['plain', '        loss = model.step()']],
      [['plain', '        print('], ['string', 'f"Epoch {epoch}: loss={loss:.4f}"'], ['plain', ')']],
      [['plain', '']],
      [['keyword', 'if'], ['plain', ' __name__ == '], ['string', '"__main__"'], ['plain', ':']],
      [['plain', '    train()']],
    ];

    var colors = {
      keyword: 'var(--qc-color-secondary,#e8a44a)',
      comment: 'var(--qc-color-text-info,#666)',
      string:  'var(--qc-color-primary,#6db3f2)',
      number:  'var(--qc-color-text-secondary,#aaa)',
      plain:   'var(--qc-color-text-primary,#ccc)',
    };

    lines.forEach(function(parts, i) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;';
      var lineNum = document.createElement('span');
      lineNum.style.cssText = 'width:28px;text-align:right;margin-right:12px;color:var(--qc-color-text-dark,#444);flex-shrink:0;user-select:none;';
      lineNum.textContent = i + 1;
      row.appendChild(lineNum);
      var lineContent = document.createElement('span');
      parts.forEach(function(p) {
        var span = document.createElement('span');
        span.style.color = colors[p[0]] || colors.plain;
        span.textContent = p[1];
        lineContent.appendChild(span);
      });
      row.appendChild(lineContent);
      code.appendChild(row);
    });


    pane.appendChild(code);
  }

  _buildTerminal(pane) {
    pane.style.cssText += 'padding:8px 10px;overflow-y:auto;font-family:monospace;font-size:11px;line-height:1.6;';
    var lines = [
      { text: '# NeuralForge terminal', color: 'var(--qc-color-text-info,#666)' },
      { text: '$ python main.py',       color: 'var(--qc-color-text-primary,#ccc)' },
      { text: 'Loading config from resources/config.yaml...', color: 'var(--qc-color-text-info,#666)' },
      { text: 'Initializing NeuralForge v2 (12 layers, hidden=768)', color: 'var(--qc-color-text-info,#666)' },
      { text: 'Epoch 1: loss=2.3041', color: 'var(--qc-color-text-primary,#ccc)' },
      { text: 'Epoch 2: loss=1.9872', color: 'var(--qc-color-text-primary,#ccc)' },
    ];
    lines.forEach(function(l) {
      var div = document.createElement('div');
      div.style.color = l.color;
      div.textContent = l.text;
      pane.appendChild(div);
    });
  }

  _buildActions(pane) {
    pane.style.cssText += 'overflow:hidden;display:flex;flex-direction:column;';
    var panel = new IDESubagentsListPanel();
    panel.mount(pane);
    this._subagentsPanel = panel;  // expose for IDEScenario

    // Seed with a few completed example calls so the tab isn't empty on load.
    // Real caller is always 'many' (Team Leader) unless it's a PO bridge call —
    // see agent_action_list_panel.py _build_subagent_header — even when Cody
    // itself delegates onward to Lumi below, the panel still shows Many as caller.
    var seed = [
      {
        callerName: 'many',   targetName: 'dev',
        agentRole:  'Developer', agentName: 'Cody',
        question:   'Add dropout regularization to the transformer model',
        cli:        true,
        plan: [
          '[x] Identify model transformer layers',
          '[*] Insert nn.Dropout(0.1) in attention blocks',
          '[ ] Run forward pass verification test',
        ],
        autoStart: false,
      },
      {
        callerName: 'many',   targetName: 'designer',
        agentRole:  'Designer', agentName: 'Lumi',
        question:   'Generate splash screen for NeuralForge v2',
        autoStart: false,
      },
    ];
    seed.forEach(function(opts) {
      var card = panel.addCard(opts);
      // Mark them as completed with fake elapsed times
      var times = ['0:08s', '0:23s'];
      card.finish(times[seed.indexOf ? seed.indexOf(opts) : 0] || '0:10s');
    });
  }

  _buildFileEditorTabHolder(pane) {
    pane.style.cssText += 'overflow:hidden;';
    var th = new IDETabHolder();
    th.mount(pane);
    this._fileEditorTabHolder = th;  // expose for openFileTab()

    // Pre-populate with sample file tabs. A scenario can supply its own set
    // via `open_files: [path, ...]` so a game project doesn't open on routes.py.
    var scFiles = this._scenario && Array.isArray(this._scenario.open_files) ? this._scenario.open_files : null;
    var files = scFiles
      ? scFiles.map(function(p, i) {
          // Same id scheme as openFileTab() so a later `open_file` on this
          // path re-activates the tab instead of opening a duplicate.
          return { id: 'fe-dyn-' + String(p).replace(/[^a-z0-9]/gi, '-'), label: String(p).split('/').pop(), filePath: p, unsaved: i === 0 };
        })
      : [
      { id: 'fe-main',   label: 'main.py',     filePath: 'src/main.py' },
      { id: 'fe-routes', label: 'routes.py',   filePath: 'src/routes.py',  unsaved: true },
      { id: 'fe-config', label: 'config.yaml', filePath: 'resources/config.yaml' },
    ];
    var self = this;
    files.forEach(function(f) {
      th.addTab({
        id: f.id, type: 'file', label: f.label, filePath: f.filePath, unsaved: f.unsaved || false,
        contentBuilder: function(p) { self._buildCodeEditor(p); },
      });
    });
    // Activate the second tab (routes.py in the default set), or the first one
    if (files.length) th.activateTab((files[1] || files[0]).id);
  }

  _buildBrowserTabHolder(pane) {
    pane.style.cssText += 'overflow:hidden;';
    pane.id = 'ide-browser-pane';  // camera target id
    var th = new IDETabHolder();
    th.mount(pane);
    this._browserTabHolder = th;   // expose for openBrowserTab()

    // Registry: tab id → IDEBrowser instance (used by scenario switch_video)
    this._browsers = this._browsers || {};
    var self = this;

    // Tab 1 — video file (or empty placeholder if no video src provided)
    var videoTab = (this._scenario && this._scenario.browser_tabs || []).find(function(t) { return t.id === 'br-video'; }) || {};
    th.addTab({
      id: 'br-video', type: 'browser', label: videoTab.label || 'Result',
      contentBuilder: function(p) {
        var b = new IDEBrowser({ tabHolder: th });
        b.mount(p);
        if (videoTab.video) {
          b.playVideoFile(videoTab.video, {
            autoplay: true, muted: true, loop: true, controls: true, fit: 'contain',
            title: videoTab.label || 'Result',
          });
        } else {
          // Empty state — no video yet. switchVideo() will fill it later.
          b.showEmpty({ label: videoTab.empty_label || 'No content yet' });
        }
        self._browsers['br-video'] = b;
      },
    });

    // Remaining tabs come from the scenario's `browser_tabs` (anything that
    // isn't br-video). With no scenario at all, keep the legacy home.html tab
    // so the bare mock still shows two tabs.
    var extraTabs = (this._scenario && this._scenario.browser_tabs || []).filter(function(t) { return t.id !== 'br-video'; });
    if (!this._scenario || !this._scenario.browser_tabs) {
      extraTabs = [{ id: 'br-home', label: 'home.html', url: window.location.origin + '/.temp/home.html' }];
    }
    extraTabs.forEach(function(t) {
      th.addTab({
        id: t.id, type: 'browser', label: t.label || t.id,
        contentBuilder: function(p) {
          var b = new IDEBrowser({ url: t.url, tabHolder: th });
          b.mount(p);
          if (t.video) {
            b.playVideoFile(t.video, { autoplay: true, muted: true, loop: true, controls: false, fit: t.fit || 'contain', title: t.label || t.id });
          } else if (t.url) {
            b.showStaticPage(t.url, { title: t.label || t.id });
          } else {
            b.showEmpty({ label: t.empty_label || 'No content yet' });
          }
          self._browsers[t.id] = b;
        },
      });
    });

    th.activateTab('br-video');
  }

  /** Build a scenario-defined custom central panel backed by IDEBrowser. */
  _buildCustomPanel(pane, config) {
    pane.id = 'ide-custom-panel-' + config.id;
    pane.style.cssText += 'overflow:hidden;';
    var browser = new IDEBrowser();
    browser.mount(pane);

    if (config.video) {
      browser.playVideoFile(config.video, {
        autoplay: config.autoplay !== false,
        muted: config.muted !== false,
        loop: config.loop !== false,
        controls: config.controls !== false,
        fit: config.fit || 'contain',
        title: config.label || config.id,
      });
    } else if (config.url) {
      browser.showStaticPage(config.url, {
        title: config.label || config.id,
        scale: config.scale,
      });
    } else {
      browser.showEmpty({ label: config.empty_label || 'No content yet' });
    }

    this._customPanels = this._customPanels || {};
    this._customPanels[config.id] = { browser: browser, label: config.label || config.id };
  }

  /**
   * Switch the video source in a browser tab or custom panel by id.
   * Called by IDEScenario when it processes a switch_video action.
   * @param {string} panelId — e.g. 'br-video' or scenario-defined custom id
   * @param {string} src     — new video path/URL
   * @param {object} opts    — passed to IDEBrowser.switchVideo()
   */
  switchBrowserVideo(panelId, src, opts) {
    var b = this._getVideoPanelBrowser(panelId);
    if (!b) {
      console.warn('[IDEMainPanel] switchBrowserVideo: no video panel for id', panelId);
      return;
    }
    b.switchVideo(src, opts);
  }

  /**
   * Clear the content of a browser tab — removes any video or page and shows
   * the empty placeholder. Useful in scenarios before loading new content.
   * @param {string} tabId  — e.g. 'br-video'
   * @param {object} opts   — passed to IDEBrowser.showEmpty() (label?, icon?)
   */
  clearBrowserContent(panelId, opts) {
    var b = this._getVideoPanelBrowser(panelId);
    if (!b) {
      console.warn('[IDEMainPanel] clearBrowserContent: no video panel for id', panelId);
      return;
    }
    b.showEmpty(opts);
  }

  /**
   * Highlight a file in the folder tree by its relative path.
   * Expands parent folders automatically.
   * @param {string} relPath - e.g. 'src/model/transformer.py'
   */
  selectFile(relPath) {
    if (this._folderTree) this._folderTree.selectFile(relPath);
  }

  /**
   * Replace the folder tree with a new project from a scenario project config.
   * @param {object} projectCfg - same shape as YAML `project:` key
   */
  setProject(projectCfg) {
    if (this._folderTree) this._folderTree.setProject(projectCfg);
  }

  /**
   * Trigger "Fit to video" for a browser tab — resizes the IDE window height
   * so the browser content area matches the video aspect ratio exactly.
   * Resolves with the resize result or rejects if no video is loaded.
   * @param {string} tabId  — e.g. 'br-video'
   * @param {object} wrapperInstance — IDEWindowWrapper instance
   * @returns {Promise}
   */
  fitToVideo(panelId, wrapperInstance) {
    var browser = this._getVideoPanelBrowser(panelId);
    var videoSrc = browser && browser._videoSrc;
    if (!videoSrc) {
      return Promise.reject(new Error('[IDEMainPanel] fitToVideo: no video loaded in panel ' + panelId));
    }

    var isCustomPanel = !!(this._customPanels && this._customPanels[panelId]);
    return resize_ide_to_perfect_fit(
      videoSrc,
      this.getVisiblePanels(),
      wrapperInstance,
      {
        viewport: browser._viewport,
        chromeH: isCustomPanel ? CUSTOM_VIDEO_CHROME : BROWSER_VIDEO_CHROME,
      }
    );
  }

  _build() {
    if (!document.getElementById('_ide-panel-styles')) {
      var st = document.createElement('style');
      st.id = '_ide-panel-styles';
      st.textContent = [
        '@keyframes dotPulse { 0%,80%,100% { opacity:0.2; transform:scale(0.8); } 40% { opacity:1; transform:scale(1); } }',
        /* Remove border lines from tabs-header — real IDE has no separator lines */
        '.tabs-header { border: none !important; }',
        /* Emulation-only: real .tab is 36px, a touch tall for this mock's
           chrome-heavy layout (4 tab strips stacked per window). Shave it
           down slightly so more room goes to actual content. */
        '.tabs-header .tab { height: 30px; }',
      ].join('\n');
      document.head.appendChild(st);
    }

    var self = this;

    // Root fills window between header and status bar
    var root = document.createElement('div');
    root.style.cssText = 'flex:1;display:flex;overflow:hidden;';

    var splitter = document.createElement('div');
    splitter.style.cssText = 'flex:1;display:flex;overflow:hidden;gap:3px;padding:3px 3px 0;';

    // LEFT: tabs_left (30%)
    var leftPanel = this._buildTabsPanel({
      tabs: [
        { label: 'Chat',          icon: 'images/icons/coolicons/Communication/Chat.png' },
        { label: 'History',       icon: 'images/icons/coolicons/Calendar/Clock.png' },
        { label: 'Console',       icon: 'images/icons/coolicons/System/Terminal.png' },
        { label: 'Find in files', icon: 'images/icons/coolicons/Interface/Search_Magnifying_Glass.png' },
      ],
      activeIdx: 0,
      contentBuilder: function(pane, tab) {
        if (tab.label === 'Chat') self._buildChatContent(pane);
        if (tab.label === 'Console') {
          pane.style.cssText += 'overflow:hidden;';
          var con = new IDEFakeConsole();
          con.mount(pane);
          self._fakeConsole = con;
          // Seed with a few boot lines so the panel isn't empty
          con.log('Agent session initialized');
          con.log('RAG index loaded — ' + (self._scenario && self._scenario.project && self._scenario.project.files ? self._scenario.project.files.length : 0) + ' files indexed');
        }
      },
      style: 'width:30%;flex-shrink:0;',
    });

    // CENTER column: tabs_right + tabs_bottom
    var centerCol = document.createElement('div');
    centerCol.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;gap:3px;';

    var customPanelConfig = this._scenario && this._scenario.main_panel && this._scenario.main_panel.custom;
    if (customPanelConfig && !customPanelConfig.id) {
      console.warn('[IDEMainPanel] main_panel.custom requires an id; custom panel was skipped');
      customPanelConfig = null;
    }

    var centralTabs = [
      { id: 'actions',       label: 'Actions',      icon: 'images/icons/coolicons/System/Monitor_Play.png' },
      { id: 'file-editors',  label: 'File editors', icon: 'images/icons/coolicons/File/File_Edit.png' },
      { id: 'meta-editors',  label: 'Meta editors', icon: 'images/icons/coolicons/File/File_Code.png' },
      { id: 'web-browsers',  label: 'Web browsers', icon: 'images/icons/coolicons/System/Globe.png' },
    ];
    if (customPanelConfig) {
      centralTabs.push({
        id: customPanelConfig.id,
        label: customPanelConfig.label || customPanelConfig.id,
        custom: customPanelConfig,
      });
    }

    this._centralTabs = centralTabs;

    var tabsRight = this._buildTabsPanel({
      tabs: centralTabs,
      activeIdx: 3,
      contentBuilder: function(pane, tab) {
        if (tab.id === 'file-editors') self._buildFileEditorTabHolder(pane);
        else if (tab.id === 'actions') self._buildActions(pane);
        else if (tab.id === 'web-browsers') self._buildBrowserTabHolder(pane);
        else if (tab.custom) self._buildCustomPanel(pane, tab.custom);
      },
      style: 'flex:1;min-height:0;',
    });

    var tabsBottom = this._buildTabsPanel({
      tabs: [
        { label: 'Terminal', icon: 'images/icons/coolicons/System/Terminal.png' },
        { label: 'Output',   icon: 'images/icons/coolicons/System/Monitor_Play.png' },
        { label: 'Problems', icon: 'images/icons/coolicons/Interface/Alert_Triangle.png' },
      ],
      activeIdx: 0,
      contentBuilder: function(pane, tab) {
        if (tab.label === 'Terminal') self._buildTerminal(pane);
      },
      style: 'flex:2;min-height:0;',
    });

    // Hidden by default — toggle via showBottomPanel() / hideBottomPanel()
    tabsBottom.style.display = 'none';
    this._tabsBottom        = tabsBottom;
    this._tabsRight         = tabsRight;
    this._tabsRightEl       = tabsRight;   // DOM element of center tab panel
    this._leftPanel         = leftPanel;
    // NOTE: this._rightPanel is assigned below after rightPanel is declared

    /**
     * Add or switch to a custom subpanel (iframe) in the left, center, or right panel.
     * If a tab with the same label already exists, just activates it.
     * Otherwise adds a new tab with an iframe loading url.
     *
     * @param {string} side   — 'left' | 'center' | 'right'
     * @param {string} label  — tab label text
     * @param {string} url    — URL to load in the iframe
     * @param {number|string} [scale] — `0 < scale <= 1`; accepts `0.9` or `x0.9`
     */
    this.showSubpanel = function(side, label, url, scale) {
      var targets = {
        left:   { panel: leftPanel,  holderKey: '_leftSubpanelHolder' },
        center: { panel: tabsRight,  holderKey: '_centerSubpanelHolder' },
        right:  { panel: rightPanel, holderKey: '_rightSubpanelHolder' },
      };
      var target = targets[side];
      if (!target) {
        console.warn('[IDEMainPanel] showSubpanel: invalid side', side);
        return;
      }

      var holder = self[target.holderKey];
      var panel = target.panel;
      var holderKey = target.holderKey;
      if (!holder) {
        holder = _getTabHolderForPanel(panel);
        self[holderKey] = holder;
      }
      if (!holder) { console.warn('[IDEMainPanel] showSubpanel: panel not ready'); return; }

      var existingIdx = holder.tabs.findIndex(function(t) { return t.label === label; });
      if (existingIdx >= 0) {
        _activatePanelTab(holder, existingIdx);
        return;
      }

      // Build new tab button
      var btn = document.createElement('button');
      btn.className = 'tab';
      btn.style.cssText = 'display:inline-flex;align-items:center;padding:2px 10px 0;font-size:12px;';
      var lbl = document.createElement('span');
      lbl.textContent = label;
      btn.appendChild(lbl);

      // Build pane wrapper
      var paneWrap = document.createElement('div');
      paneWrap.style.cssText = 'flex:1;overflow:hidden;display:none;flex-direction:column;padding:3px;';

      var pane = document.createElement('div');
      pane.className = 'panel-section';
      pane.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;';

      // The iframe keeps the full panel area. For same-origin pages, scaling is
      // injected into the document after it loads so only its UI gets smaller.
      var contentScale = IDEBrowser.normalizeContentScale(scale);
      var iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
      iframe.setAttribute('frameborder', '0');
      iframe.addEventListener('load', function() {
        IDEBrowser.applyContentScale(iframe, contentScale);
      });
      pane.appendChild(iframe);
      paneWrap.appendChild(pane);

      var newIdx = holder.tabs.length;
      holder.tabs.push({ label: label, btn: btn, pane: paneWrap });
      holder.header.appendChild(btn);
      holder.wrap.appendChild(paneWrap);

      (function(idx) {
        btn.addEventListener('click', function() { _activatePanelTab(holder, idx); });
      })(newIdx);

      _activatePanelTab(holder, newIdx);
    };

    /**
     * Switch to an existing subpanel tab by label on the given side.
     * @param {string} side   — 'left' | 'center' | 'right'
     * @param {string} label  — tab label to activate
     */
    this.switchSubpanel = function(side, label) {
      var holderKeys = {
        left: '_leftSubpanelHolder',
        center: '_centerSubpanelHolder',
        right: '_rightSubpanelHolder',
      };
      var holderKey = holderKeys[side];
      if (!holderKey) { console.warn('[IDEMainPanel] switchSubpanel: invalid side', side); return; }
      var holder = self[holderKey];
      if (!holder) { console.warn('[IDEMainPanel] switchSubpanel: no subpanels on', side); return; }
      var idx = holder.tabs.findIndex(function(t) { return t.label === label; });
      if (idx >= 0) _activatePanelTab(holder, idx);
      else console.warn('[IDEMainPanel] switchSubpanel: tab not found:', label);
    };

    /** Extract tab-holder internals from a panel built by _buildTabsPanel.
     *  Also re-binds the original tab buttons to _activatePanelTab so they
     *  correctly hide any dynamically-added panes (e.g. iframe subpanels).
     *  cloneNode strips the old closure-bound listener before re-adding. */
    function _getTabHolderForPanel(panelEl) {
      var header = panelEl.querySelector('.tabs-header');
      if (!header) return null;
      var btns = Array.from(header.querySelectorAll('.tab'));
      var panes = Array.from(panelEl.children).filter(function(c) { return c !== header; });
      var tabs = btns.map(function(b, i) {
        return { label: b.textContent.trim(), btn: b, pane: panes[i] };
      });
      var holder = { header: header, wrap: panelEl, tabs: tabs };

      // Strip old listeners (which only knew about the original contents array)
      // and re-bind each button to _activatePanelTab on the shared holder object,
      // so switching back to an original tab also hides any future dynamic panes.
      tabs.forEach(function(t, i) {
        var fresh = t.btn.cloneNode(true);
        t.btn.parentNode.replaceChild(fresh, t.btn);
        t.btn = fresh;
        (function(idx) {
          fresh.addEventListener('click', function() { _activatePanelTab(holder, idx); });
        })(i);
      });

      return holder;
    }

    function _activatePanelTab(holder, idx) {
      holder.tabs.forEach(function(t, i) {
        t.btn.classList.toggle('tab--active', i === idx);
        t.pane.style.display = i === idx ? 'flex' : 'none';
      });
    }

    /**
     * Switch the active tab in the LEFT panel by label.
     * Labels: 'Chat' | 'History' | 'Console' | 'Find in files' (+ any subpanels)
     * Uses the subpanel holder if present (so it correctly hides dynamic panes),
     * otherwise clicks the raw tab button.
     * @param {string} label
     */
    this.switchLeftTab = function(label) {
      // If subpanels were added on the left, route through the holder so the
      // dynamic iframe panes are hidden/shown consistently.
      var holder = self._leftSubpanelHolder;
      if (holder) {
        var idx = holder.tabs.findIndex(function(t) { return t.label === label; });
        if (idx >= 0) { _activatePanelTab(holder, idx); return; }
      }
      var header = leftPanel.querySelector('.tabs-header');
      if (!header) return;
      var btns = header.querySelectorAll('.tab');
      btns.forEach(function(b) { if (b.textContent.trim() === label) b.click(); });
    };

    /**
     * Switch the active tab in the central section by label.
     * Accepts a built-in label or scenario-defined custom panel id.
     * @param {string} panel
     */
    this.switchCentralTab = function(panel) {
      var header = tabsRight.querySelector('.tabs-header');
      if (!header) return;
      var idx = centralTabs.findIndex(function(tab) {
        return tab.id === panel || tab.label === panel;
      });
      var btns = header.querySelectorAll('.tab');
      if (idx >= 0 && btns[idx]) btns[idx].click();
      else console.warn('[IDEMainPanel] switchCentralTab: panel not found', panel);
    };

    /**
     * Open a new tab in the browser tab holder.
     * @param {object} opts
     *   opts.id      {string}  — unique tab id (auto-generated if omitted)
     *   opts.label   {string}  — tab name shown in the strip
     *   opts.video   {string}  — video src (mutually exclusive with url)
     *   opts.url     {string}  — page URL to load in iframe
     *   opts.activate {boolean} — switch to this tab immediately (default true)
     */
    this.openBrowserTab = function(opts) {
      opts = opts || {};
      var th = self._browserTabHolder;
      if (!th) { console.warn('[IDEMainPanel] openBrowserTab: browser tab holder not ready'); return; }
      var id = opts.id || ('br-dyn-' + Date.now());
      th.addTab({
        id: id, type: 'browser', label: opts.label || id,
        contentBuilder: function(p) {
          var b = new IDEBrowser({ tabHolder: th });
          b.mount(p);
          if (opts.video) {
            b.playVideoFile(opts.video, {
              autoplay: true, muted: true, loop: opts.loop !== false,
              controls: opts.controls !== false, fit: 'contain',
              title: opts.label || opts.video.split('/').pop(),
            });
          } else if (opts.url) {
            b.showStaticPage(opts.url, { title: opts.label || opts.url });
          } else {
            b.showEmpty({ label: opts.label || 'New tab' });
          }
          self._browsers[id] = b;
        },
      });
      if (opts.activate !== false) th.activateTab(id);
      return id;
    };

    /**
     * Open a file in the File editors tab holder.
     * Switches the central panel to "File editors" automatically.
     * @param {object} opts
     *   opts.path    {string}  — relative file path (e.g. 'src/model/transformer.py')
     *   opts.label   {string}  — tab label (defaults to filename)
     *   opts.unsaved {boolean} — show unsaved dot (default false)
     *   opts.activate {boolean} — switch to this tab (default true)
     */
    this.openFileTab = function(opts) {
      opts = opts || {};
      var th = self._fileEditorTabHolder;
      if (!th) { console.warn('[IDEMainPanel] openFileTab: file editor tab holder not ready'); return; }
      var path  = opts.path || opts.filePath || '';
      var label = opts.label || (path ? path.split('/').pop() : 'file');
      var id    = opts.id || ('fe-dyn-' + path.replace(/[^a-z0-9]/gi, '-'));
      // Don't duplicate if already open
      if (th._indexById(id) >= 0) {
        if (opts.activate !== false) th.activateTab(id);
        return id;
      }
      th.addTab({
        id: id, type: 'file', label: label, filePath: path,
        unsaved: opts.unsaved || false,
        contentBuilder: function(p) { self._buildCodeEditor(p); },
      });
      if (opts.activate !== false) th.activateTab(id);
      return id;
    };

    // ── Central panel (tabsRight = right_middle_splitter area) ───────────
    this.showCentralPanel = function() {
      tabsRight.style.display = '';
    };
    this.hideCentralPanel = function() {
      tabsRight.style.display = 'none';
    };
    this.toggleCentralPanel = function() {
      if (tabsRight.style.display === 'none') self.showCentralPanel();
      else self.hideCentralPanel();
    };

    // ── Bottom panel ──────────────────────────────────────────────────────
    this.showBottomPanel = function() {
      tabsBottom.style.display = '';
      tabsRight.style.flex = '3';
    };
    this.hideBottomPanel = function() {
      tabsBottom.style.display = 'none';
      tabsRight.style.flex = '1';
    };
    this.toggleBottomPanel = function() {
      if (tabsBottom.style.display === 'none') self.showBottomPanel();
      else self.hideBottomPanel();
    };

    // ── Left panel ────────────────────────────────────────────────────────
    // Use display:flex explicitly — display:'' would lose flex context after hide/show
    this.showLeftPanel = function() {
      leftPanel.style.display = 'flex';
    };
    this.hideLeftPanel = function() {
      leftPanel.style.display = 'none';
    };
    this.toggleLeftPanel = function() {
      if (leftPanel.style.display === 'none') self.showLeftPanel();
      else self.hideLeftPanel();
    };

    // ── Right panel ───────────────────────────────────────────────────────
    this.showRightPanel = function() {
      rightPanel.style.display = 'flex';
    };
    this.hideRightPanel = function() {
      rightPanel.style.display = 'none';
    };
    this.toggleRightPanel = function() {
      if (rightPanel.style.display === 'none') self.showRightPanel();
      else self.hideRightPanel();
    };

    /**
     * Returns which panels are currently visible.
     * @returns {{ left: boolean, bottom: boolean, right: boolean }}
     */
    this.getVisiblePanels = function() {
      return {
        left:   leftPanel.style.display  !== 'none',
        bottom: tabsBottom.style.display !== 'none',
        right:  rightPanel.style.display !== 'none',
      };
    };

    centerCol.appendChild(tabsRight);
    centerCol.appendChild(tabsBottom);

    // RIGHT: folder_tabs — slim (20%), Files + Meta only
    var rightPanel = this._buildTabsPanel({
      tabs: [
        { label: 'Files', icon: 'images/icons/coolicons/Files/Folder.png' },
        { label: 'Meta',  icon: 'images/icons/coolicons/File/File_Code.png' },
      ],
      activeIdx: 0,
      contentBuilder: function(pane, tab) {
        if (tab.label === 'Files') {
          pane.style.cssText += 'overflow:hidden;';
          var tree = new IDEFolderTree({ scenario: self._scenario });
          tree.mount(pane);
          self._folderTree = tree;  // expose for IDEScenario
        }
      },
      style: 'width:20%;flex-shrink:0;',
    });

    // Assign _rightPanel now that rightPanel is declared
    this._rightPanel = rightPanel;

    splitter.appendChild(leftPanel);
    splitter.appendChild(centerCol);
    splitter.appendChild(rightPanel);
    root.appendChild(splitter);
    return root;
  }
}

if (typeof module !== 'undefined') module.exports = { IDEMainPanel };
