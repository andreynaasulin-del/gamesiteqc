/**
 * IDEFakeConsole
 * ─────────────────────────────────────────────────────────────────────────────
 * Emulates a real terminal inside the IDE's Console panel — supports two modes:
 *
 *   1) SHELL mode — a realistic interactive terminal session:
 *        user@host project %  git status        ← typed command (animated)
 *        <command output, colored>
 *        user@host project %  █                  ← prompt + blinking cursor
 *
 *   2) CLAUDE-CODE mode — emulates the Claude Code CLI TUI:
 *        ╭──────────────────────────────────────╮
 *        │ ✻ Welcome to Claude Code             │
 *        ╰──────────────────────────────────────╯
 *        > build me a dungeon generator
 *        ⏺ I'll create a procedural dungeon generator…
 *          ⎿  Read DungeonGen.cpp (312 lines)
 *          ⎿  Updated DungeonGen.cpp (+48 -3)
 *        ✓ Done (12.4s · 3.1k tokens)
 *
 * It ALSO keeps the legacy log-style API (add/log/tool/out/ok/err/warn/clear)
 * for backward-compat with existing scenarios (add_console_log / clear_console).
 *
 * Usage — terminal demos:
 *   var con = new IDEFakeConsole();
 *   con.mount(paneEl);
 *   con.runShellDemo();         // animated real-terminal session
 *   con.runClaudeCodeDemo();    // animated Claude Code CLI session
 *
 * Usage — low-level terminal primitives:
 *   con.prompt();                          // print a shell prompt
 *   con.typeCommand('npm run build', cb);  // typewrite a command then run cb
 *   con.output('Build complete', 'ok');    // print an output line (kind colors)
 *   con.claudeUser('add tests');           // Claude Code: user prompt line
 *   con.claudeThinking('Let me look…');     // Claude Code: ⏺ assistant line
 *   con.claudeTool('Read', 'foo.py (88 lines)');  // ⎿ tool-use sub-line
 *   con.claudeDone('8.2s', '2.4k');        // ✓ Done (time · tokens)
 *
 * Usage — legacy log API (still works):
 *   con.log('Starting build…');
 *   con.tool('ToolReadFile', 'src/model.py');
 *   con.out('Read 312 lines'); con.ok('Done'); con.err('…'); con.warn('…');
 *   con.clear();
 *
 * Scenario YAML actions:
 *   - at: 1000
 *     type: console_mode          # switch terminal mode + clear
 *     mode: shell                 # 'shell' | 'claude' | 'log'
 *
 *   - at: 1500
 *     type: terminal_type         # typewrite a shell command, then show output
 *     command: "git status"
 *     output: |                   # optional multi-line output
 *       On branch main
 *       nothing to commit, working tree clean
 *     out_kind: out               # info|out|ok|err|warn (default out)
 *
 *   - at: 3000
 *     type: console_demo          # play a full canned demo
 *     demo: shell                 # 'shell' | 'claude'
 *
 *   - at: 5000                    # legacy — still supported
 *     type: add_console_log
 *     kind: tool
 *     text: "ToolReadFile  game/world/DungeonGen.cpp"
 *
 *   - at: 6000
 *     type: clear_console
 */
class IDEFakeConsole {
  constructor(opts) {
    opts = opts || {};
    this._lines     = [];
    this._maxLines  = opts.maxLines || 400;
    this._autoScroll = true;
    this.el          = null;
    this._logEl      = null;
    this._cursorEl   = null;
    this._timers     = [];

    // Terminal config
    this._mode    = opts.mode    || 'log';   // 'log' | 'shell' | 'claude'
    this._user    = opts.user    || 'dev';
    this._host    = opts.host    || 'quadcode';
    this._cwd     = opts.cwd     || '~/DungeonCraft';
    this._symbol  = opts.symbol  || '%';     // prompt char (% zsh, $ bash)
    this._typeSpeed = opts.typeSpeed || 28;  // ms per char when typing commands

    this._injectStyles();
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('_ifc-styles')) return;
    var st = document.createElement('style');
    st.id = '_ifc-styles';
    st.textContent = [
      '@keyframes ifcBlink { 0%,49%{opacity:1} 50%,100%{opacity:0} }',
      '.ifc-cursor { display:inline-block;width:7px;height:13px;background:var(--qc-color-secondary,#56a8f5);border-radius:1px;animation:ifcBlink 1s step-end infinite;vertical-align:text-bottom;margin-left:1px; }',
      '@keyframes ifcFadeIn { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }',
      '.ifc-line { animation:ifcFadeIn 0.15s ease forwards; }',
      // Terminal rows: no fade for typed chars (instant), wrap long output
      '.ifc-term { white-space:pre-wrap;word-break:break-word;padding:0;min-height:0; }',
      '.ifc-term-prompt { display:flex;align-items:baseline;gap:0;flex-wrap:wrap; }',
      // Claude Code welcome box
      '@keyframes ifcGlow { 0%,100%{opacity:0.85} 50%{opacity:1} }',
      '.ifc-cc-star { animation:ifcGlow 2.2s ease-in-out infinite;display:inline-block; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  // ── Icon helper (mask-image approach) ──────────────────────────────────────

  _icon(path, size, color) {
    var s = document.createElement('span');
    s.style.cssText = [
      'display:inline-block',
      'width:' + (size || 12) + 'px',
      'height:' + (size || 12) + 'px',
      'min-width:' + (size || 12) + 'px',
      'flex-shrink:0',
      'background-color:' + (color || 'currentColor'),
      '-webkit-mask-image:url(\'/_ide/' + path + '\')',
      'mask-image:url(\'/_ide/' + path + '\')',
      '-webkit-mask-size:contain',
      'mask-size:contain',
      '-webkit-mask-repeat:no-repeat',
      'mask-repeat:no-repeat',
      '-webkit-mask-position:center',
      'mask-position:center',
      'pointer-events:none',
    ].join(';');
    return s;
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  mount(parent) {
    this.el = this._build();
    parent.appendChild(this.el);
    this._appendCursor();
    return this;
  }

  _build() {
    var self = this;

    var root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;';

    // ── Toolbar ───────────────────────────────────────────────────────────────
    var toolbar = document.createElement('div');
    toolbar.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:6px',
      'padding:3px 8px',
      'flex-shrink:0',
      'border-bottom:1px solid var(--qc-color-divider,rgba(255,255,255,0.06))',
    ].join(';');

    // Status dot
    var dot = document.createElement('span');
    dot.style.cssText = 'width:7px;height:7px;min-width:7px;border-radius:50%;background:var(--qc-color-secondary,#56a8f5);opacity:0.7;flex-shrink:0;';
    this._statusDot = dot;
    toolbar.appendChild(dot);

    // Title (reflects current mode)
    var title = document.createElement('span');
    title.style.cssText = 'font-size:11px;font-weight:600;color:var(--qc-color-text-primary,#ccc);flex:1;';
    title.textContent = this._modeTitle();
    this._titleEl = title;
    toolbar.appendChild(title);

    // Clear button
    var clearBtn = document.createElement('button');
    clearBtn.style.cssText = [
      'background:transparent',
      'border:none',
      'cursor:pointer',
      'padding:2px 6px',
      'border-radius:4px',
      'font-size:10px',
      'color:var(--qc-color-text-secondary,#666)',
      'display:flex',
      'align-items:center',
      'gap:4px',
      'transition:color 0.12s,background 0.12s',
    ].join(';');
    clearBtn.title = 'Clear console';
    clearBtn.appendChild(this._icon('images/icons/coolicons/Interface/Close_SM.png', 10, 'var(--qc-color-text-secondary,#666)'));
    var clearLbl = document.createElement('span');
    clearLbl.textContent = 'clear';
    clearBtn.appendChild(clearLbl);
    clearBtn.addEventListener('mouseenter', function() {
      clearBtn.style.color = 'var(--qc-color-text-primary,#ccc)';
      clearBtn.style.background = 'rgba(255,255,255,0.06)';
    });
    clearBtn.addEventListener('mouseleave', function() {
      clearBtn.style.color = 'var(--qc-color-text-secondary,#666)';
      clearBtn.style.background = 'transparent';
    });
    clearBtn.addEventListener('click', function() { self.clear(); });
    toolbar.appendChild(clearBtn);

    root.appendChild(toolbar);

    // ── Log area ──────────────────────────────────────────────────────────────
    var logWrap = document.createElement('div');
    logWrap.style.cssText = [
      'flex:1',
      'overflow-y:auto',
      'overflow-x:hidden',
      'padding:6px 8px 4px',
      'font-family:var(--qc-var-font-mono,monospace)',
      'font-size:10.5px',
      'line-height:1.65',
    ].join(';');

    // Auto-scroll on user scroll — if user scrolls up, pause auto-scroll
    logWrap.addEventListener('scroll', function() {
      var atBottom = logWrap.scrollHeight - logWrap.scrollTop - logWrap.clientHeight < 8;
      self._autoScroll = atBottom;
    });

    this._logEl = logWrap;
    root.appendChild(logWrap);

    return root;
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  _appendCursor() {
    if (this._cursorEl) this._cursorEl.remove();
    var cur = document.createElement('span');
    cur.className = 'ifc-cursor';
    this._cursorEl = cur;
    this._logEl.appendChild(cur);
    this._scrollToBottom();
  }

  _scrollToBottom() {
    if (!this._autoScroll || !this._logEl) return;
    this._logEl.scrollTop = this._logEl.scrollHeight;
  }

  // ── Line builders ─────────────────────────────────────────────────────────

  /**
   * Badge config for each kind:
   *   kind  → [ badge-text, badge-color, text-color ]
   */
  _kindConfig(kind) {
    var cfg = {
      info: ['INFO', 'rgba(86,168,245,0.18)',  'var(--qc-color-text-secondary,#777)',  'var(--qc-color-text-primary,#ccc)'],
      tool: ['TOOL', 'rgba(232,164,74,0.18)',   'var(--qc-color-secondary,#e8a44a)',    'var(--qc-color-text-primary,#ccc)'],
      out:  ['OUT ', 'rgba(255,255,255,0.05)',   'var(--qc-color-text-secondary,#555)',  'var(--qc-color-text-primary,#bbb)'],
      ok:   ['OK  ', 'rgba(126,203,130,0.15)',   '#7ecb82',                              'var(--qc-color-text-primary,#ccc)'],
      err:  ['ERR ', 'rgba(220,80,80,0.18)',     '#e05555',                              '#e05555'],
      warn: ['WARN', 'rgba(232,164,74,0.15)',    'var(--qc-color-secondary,#e8a44a)',    'var(--qc-color-secondary,#e8a44a)'],
    };
    return cfg[kind] || cfg.info;
  }

  _timestamp() {
    var d = new Date();
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    var s = String(d.getSeconds()).padStart(2, '0');
    return h + ':' + m + ':' + s;
  }

  _addLine(kind, text) {
    if (!this._logEl) return;

    // Trim oldest lines if over limit
    if (this._lines.length >= this._maxLines) {
      var oldest = this._lines.shift();
      if (oldest && oldest.parentNode) oldest.parentNode.removeChild(oldest);
    }

    // Remove cursor temporarily
    if (this._cursorEl && this._cursorEl.parentNode) {
      this._cursorEl.parentNode.removeChild(this._cursorEl);
    }

    var cfg = this._kindConfig(kind);
    var badgeText  = cfg[0];
    var badgeBg    = cfg[1];
    var badgeColor = cfg[2];
    var textColor  = cfg[3];

    var row = document.createElement('div');
    row.className = 'ifc-line';
    row.style.cssText = [
      'display:flex',
      'align-items:baseline',
      'gap:7px',
      'padding:1px 0',
      'min-height:18px',
    ].join(';');

    // Timestamp
    var ts = document.createElement('span');
    ts.style.cssText = 'flex-shrink:0;color:var(--qc-color-text-dark,#444);font-size:10px;user-select:none;white-space:nowrap;';
    ts.textContent = this._timestamp();
    row.appendChild(ts);

    // Badge
    var badge = document.createElement('span');
    badge.style.cssText = [
      'flex-shrink:0',
      'font-size:9px',
      'font-weight:700',
      'letter-spacing:0.04em',
      'padding:1px 5px',
      'border-radius:3px',
      'background:' + badgeBg,
      'color:' + badgeColor,
      'user-select:none',
      'white-space:nowrap',
      'font-family:var(--qc-var-font-mono,monospace)',
    ].join(';');
    badge.textContent = badgeText;
    row.appendChild(badge);

    // Text
    var msg = document.createElement('span');
    msg.style.cssText = [
      'flex:1',
      'color:' + textColor,
      'overflow:hidden',
      'text-overflow:ellipsis',
      'white-space:nowrap',
      'min-width:0',
    ].join(';');
    msg.textContent = text;
    row.appendChild(msg);

    this._logEl.appendChild(row);
    this._lines.push(row);

    // Re-append cursor after new line
    this._appendCursor();
    return this;
  }

  // ── Mode handling ──────────────────────────────────────────────────────────

  /** Human-readable title for the toolbar, derived from current mode. */
  _modeTitle() {
    if (this._mode === 'shell')  return this._user + '@' + this._host + ' — zsh';
    if (this._mode === 'claude') return 'Claude Code';
    return 'Console';
  }

  /**
   * Switch terminal mode and clear the screen.
   * @param {'log'|'shell'|'claude'} mode
   */
  setMode(mode) {
    this._mode = mode || 'log';
    if (this._titleEl) this._titleEl.textContent = this._modeTitle();
    if (this._statusDot) {
      // claude → warm accent, shell → blue, log → muted
      this._statusDot.style.background =
        this._mode === 'claude' ? 'var(--qc-color-secondary,#e8a44a)' :
        this._mode === 'shell'  ? '#7ecb82' :
                                  'var(--qc-color-secondary,#56a8f5)';
    }
    this.clear();
    return this;
  }

  // ── Raw row helper (no badge, no timestamp — pure terminal text) ───────────

  /**
   * Append a raw terminal row. Accepts either a plain string or an array of
   * [text, color] segments for inline coloring.
   * @param {string|Array} content
   * @param {object} [opts]  — { color, indent (px), cls }
   * @returns {HTMLElement} the row element
   */
  _rawRow(content, opts) {
    opts = opts || {};
    if (!this._logEl) return null;

    // Trim oldest if over limit
    if (this._lines.length >= this._maxLines) {
      var oldest = this._lines.shift();
      if (oldest && oldest.parentNode) oldest.parentNode.removeChild(oldest);
    }

    // Detach cursor while we add
    if (this._cursorEl && this._cursorEl.parentNode) {
      this._cursorEl.parentNode.removeChild(this._cursorEl);
    }

    var row = document.createElement('div');
    row.className = 'ifc-term' + (opts.cls ? ' ' + opts.cls : '');
    var css = 'padding:0;min-height:17px;';
    if (opts.indent) css += 'padding-left:' + opts.indent + 'px;';
    if (opts.color)  css += 'color:' + opts.color + ';';
    else             css += 'color:var(--qc-color-text-primary,#cdd2da);';
    row.style.cssText = css;

    if (Array.isArray(content)) {
      content.forEach(function(seg) {
        var s = document.createElement('span');
        s.textContent = seg[0];
        if (seg[1]) s.style.color = seg[1];
        if (seg[2]) s.style.fontWeight = '600';
        row.appendChild(s);
      });
    } else {
      row.textContent = content;
    }

    this._logEl.appendChild(row);
    this._lines.push(row);
    this._appendCursor();
    return row;
  }

  // ── SHELL terminal primitives ──────────────────────────────────────────────

  /**
   * Build the shell prompt prefix segments:
   *   user@host cwd %
   * Colored like a real zsh/ohmyzsh prompt.
   */
  _promptSegments() {
    return [
      [this._user + '@' + this._host, '#7ecb82'],   // green user@host
      [' ', null],
      [this._cwd, 'var(--qc-color-secondary,#56a8f5)'], // blue cwd
      [' ' + this._symbol + ' ', 'var(--qc-color-text-secondary,#888)'],
    ];
  }

  /** Print an empty shell prompt line (no command). */
  prompt() {
    return this._rawRow(this._promptSegments(), { cls: 'ifc-term-prompt' });
  }

  /**
   * Typewrite a command after a fresh prompt, then call onDone.
   * @param {string}   cmd
   * @param {function} [onDone]
   * @param {number}   [speed]  — ms per char (default this._typeSpeed)
   */
  typeCommand(cmd, onDone, speed) {
    var self = this;
    speed = speed || this._typeSpeed;

    // Start with a prompt row, then append chars into a trailing span
    var row = this._rawRow(this._promptSegments(), { cls: 'ifc-term-prompt' });
    var cmdSpan = document.createElement('span');
    cmdSpan.style.color = 'var(--qc-color-text-light,#fff)';
    row.appendChild(cmdSpan);

    var i = 0;
    function tick() {
      if (i >= cmd.length) {
        if (onDone) self._later(onDone, 120);
        return;
      }
      cmdSpan.textContent += cmd.charAt(i++);
      self._scrollToBottom();
      self._later(tick, speed + (Math.random() * 24 - 8)); // tiny human jitter
    }
    self._later(tick, 80);
    return this;
  }

  /**
   * Print command output. Multi-line strings are split into rows.
   * @param {string} text
   * @param {string} [kind]  — 'out'|'ok'|'err'|'warn'|'info' → colors the row
   */
  output(text, kind) {
    var colorMap = {
      out:  'var(--qc-color-text-primary,#cdd2da)',
      info: 'var(--qc-color-text-secondary,#8a91a0)',
      ok:   '#7ecb82',
      err:  '#e06c6c',
      warn: 'var(--qc-color-secondary,#e8a44a)',
    };
    var color = colorMap[kind] || colorMap.out;
    var lines = String(text).split('\n');
    var self = this;
    lines.forEach(function(ln) { self._rawRow(ln, { color: color }); });
    return this;
  }

  // ── CLAUDE-CODE terminal primitives ────────────────────────────────────────

  /** Print the Claude Code welcome box. */
  claudeWelcome(modelLabel) {
    var w = 52;
    var top = '╭' + '─'.repeat(w) + '╮';
    var bot = '╰' + '─'.repeat(w) + '╯';
    var accent = 'var(--qc-color-secondary,#e8a44a)';
    this._rawRow(top, { color: accent });

    var label = ' Welcome to Claude Code';
    var pad = w - label.length - 1;
    var midRow = this._rawRow([
      ['│ ', accent],
      ['✻', accent, true],
      [label, 'var(--qc-color-text-light,#fff)', true],
      [' '.repeat(Math.max(0, pad)) + '│', accent],
    ]);
    if (midRow) midRow.querySelector('span').classList.add('ifc-cc-star');

    var sub = '   ' + (modelLabel || 'claude-sonnet') + '  ·  /help for commands';
    var pad2 = w - sub.length - 1;
    this._rawRow([
      ['│', accent],
      [sub, 'var(--qc-color-text-secondary,#888)'],
      [' '.repeat(Math.max(0, pad2)) + '│', accent],
    ]);
    this._rawRow(bot, { color: accent });
    this._rawRow('', {});
    return this;
  }

  /**
   * Claude Code user prompt line:  > <text>
   * Optionally typewritten.
   * @param {string}   text
   * @param {function} [onDone]
   * @param {number}   [speed]  — ms/char; if omitted, prints instantly
   */
  claudeUser(text, onDone, speed) {
    var self = this;
    var row = this._rawRow([['> ', 'var(--qc-color-text-secondary,#888)']]);
    var span = document.createElement('span');
    span.style.color = 'var(--qc-color-text-light,#fff)';
    row.appendChild(span);

    if (!speed) {
      span.textContent = text;
      if (onDone) self._later(onDone, 200);
      return this;
    }
    var i = 0;
    function tick() {
      if (i >= text.length) { if (onDone) self._later(onDone, 200); return; }
      span.textContent += text.charAt(i++);
      self._scrollToBottom();
      self._later(tick, speed);
    }
    self._later(tick, 60);
    return this;
  }

  /** Claude Code assistant "thinking/acting" line:  ⏺ <text> */
  claudeThinking(text) {
    return this._rawRow([
      ['⏺ ', 'var(--qc-color-secondary,#e8a44a)', true],
      [text, 'var(--qc-color-text-primary,#cdd2da)'],
    ]);
  }

  /**
   * Claude Code tool-use sub-line:  ⎿  <name> <detail>
   * @param {string} name
   * @param {string} [detail]
   */
  claudeTool(name, detail) {
    var segs = [
      ['  ⎿  ', 'var(--qc-color-text-dark,#5a6170)'],
      [name, 'var(--qc-color-secondary,#56a8f5)'],
    ];
    if (detail) segs.push(['  ' + detail, 'var(--qc-color-text-secondary,#8a91a0)']);
    return this._rawRow(segs);
  }

  /** Claude Code completion line:  ✓ Done (time · tokens) */
  claudeDone(time, tokens) {
    var detail = [];
    if (time)   detail.push(time);
    if (tokens) detail.push(tokens + ' tokens');
    var tail = detail.length ? ' (' + detail.join(' · ') + ')' : '';
    this._rawRow([
      ['✓ ', '#7ecb82', true],
      ['Done', '#7ecb82', true],
      [tail, 'var(--qc-color-text-secondary,#888)'],
    ]);
    this._rawRow('', {});
    return this;
  }

  // ── Canned demos ───────────────────────────────────────────────────────────

  /**
   * Animated realistic shell session — types commands and shows outputs.
   * @param {function} [onDone]
   */
  runShellDemo(onDone) {
    var self = this;
    this.setMode('shell');

    var steps = [
      { cmd: 'git status', out:
        'On branch main\n' +
        'Changes not staged for commit:\n' +
        '  modified:   game/world/DungeonGen.cpp\n' +
        '  modified:   game/world/BiomeGen.cpp\n\n' +
        'no changes added to commit (use "git add")', kind: 'out' },
      { cmd: 'cmake --build build --target dungeoncraft', out:
        '[ 12%] Building CXX object world/DungeonGen.cpp.o\n' +
        '[ 48%] Building CXX object world/BiomeGen.cpp.o\n' +
        '[ 87%] Linking CXX executable dungeoncraft\n' +
        '[100%] Built target dungeoncraft', kind: 'info' },
      { cmd: './build/dungeoncraft --seed 42 --gen', out:
        'Seed: 42  |  Rooms: 28  |  Corridors: 41\n' +
        'Biome pass: caverns → 12, ruins → 9, lava → 7\n' +
        'World generated in 0.83s', kind: 'ok' },
      { cmd: 'git add -A && git commit -m "tune dungeon density"', out:
        '[main 4f3a9c1] tune dungeon density\n' +
        ' 2 files changed, 63 insertions(+), 11 deletions(-)', kind: 'out' },
    ];

    var si = 0;
    function next() {
      if (si >= steps.length) {
        self.prompt();               // trailing prompt + cursor
        if (onDone) self._later(onDone, 200);
        return;
      }
      var step = steps[si++];
      self.typeCommand(step.cmd, function() {
        if (step.out) self.output(step.out, step.kind);
        self._later(next, 700);
      });
    }
    self._later(next, 300);
    return this;
  }

  /**
   * Animated Claude Code CLI session.
   * @param {function} [onDone]
   */
  runClaudeCodeDemo(onDone) {
    var self = this;
    this.setMode('claude');
    this.claudeWelcome('claude-sonnet');

    // A sequence of mixed steps: user prompt → thinking → tools → done
    var steps = [
      { type: 'user', text: 'build me a procedural dungeon generator', typed: true },
      { type: 'think', text: "I'll create a procedural dungeon generator with rooms and corridors." },
      { type: 'tool', name: 'Read',   detail: 'game/world/DungeonGen.cpp (312 lines)' },
      { type: 'tool', name: 'Write',  detail: 'game/world/DungeonGen.cpp (+148 -22)' },
      { type: 'tool', name: 'Bash',   detail: 'cmake --build build  →  exit 0' },
      { type: 'done', time: '12.4s', tokens: '3.1k' },

      { type: 'user', text: 'add a biome system on top of it', typed: true },
      { type: 'think', text: 'Adding a biome layer that tags rooms as cavern, ruins or lava.' },
      { type: 'tool', name: 'Read',   detail: 'game/world/BiomeGen.cpp (0 lines — new)' },
      { type: 'tool', name: 'Write',  detail: 'game/world/BiomeGen.cpp (+96)' },
      { type: 'tool', name: 'Edit',   detail: 'game/world/DungeonGen.cpp — call BiomeGen::assign()' },
      { type: 'tool', name: 'Bash',   detail: './build/dungeoncraft --seed 42 → World generated' },
      { type: 'done', time: '8.7s', tokens: '2.4k' },
    ];

    var si = 0;
    function next() {
      if (si >= steps.length) {
        // trailing input prompt
        self._rawRow([['> ', 'var(--qc-color-text-secondary,#888)']], { cls: 'ifc-term-prompt' });
        if (onDone) self._later(onDone, 200);
        return;
      }
      var s = steps[si++];
      if (s.type === 'user') {
        self.claudeUser(s.text, function() { self._later(next, 400); }, s.typed ? 26 : 0);
      } else if (s.type === 'think') {
        self.claudeThinking(s.text);
        self._later(next, 600);
      } else if (s.type === 'tool') {
        self.claudeTool(s.name, s.detail);
        self._later(next, 450);
      } else if (s.type === 'done') {
        self.claudeDone(s.time, s.tokens);
        self._later(next, 900);
      }
    }
    self._later(next, 500);
    return this;
  }

  // ── Public API (legacy log style) ─────────────────────────────────────────

  /** Add an INFO log line */
  log(text)  { return this._addLine('info', text); }

  /** Add a TOOL call line (shows tool name + args) */
  tool(name, args) {
    var text = args ? name + '  ' + args : name;
    return this._addLine('tool', text);
  }

  /** Add an OUT (output) line */
  out(text)  { return this._addLine('out',  text); }

  /** Add an OK (success) line */
  ok(text)   { return this._addLine('ok',   text); }

  /** Add an ERR (error) line */
  err(text)  { return this._addLine('err',  text); }

  /** Add a WARN line */
  warn(text) { return this._addLine('warn', text); }

  /** Add a line by kind string ('info'|'tool'|'out'|'ok'|'err'|'warn') */
  add(kind, text) { return this._addLine(kind, text); }

  /** Clear all lines (and cancel any running demo/typing timers) */
  clear() {
    this._cancelTimers();
    this._lines = [];
    if (this._logEl) {
      this._logEl.innerHTML = '';
      this._appendCursor();
    }
    return this;
  }

  /** Cancel all pending setTimeout/setInterval handles. */
  _cancelTimers() {
    this._timers.forEach(function(t) { clearTimeout(t); clearInterval(t); });
    this._timers = [];
  }

  /** Tracked setTimeout — auto-cancelled on clear(). */
  _later(fn, ms) {
    var t = setTimeout(fn, ms);
    this._timers.push(t);
    return t;
  }

  /**
   * Play a sequence of log entries with delays between them.
   * entries: [{ kind, text, delay }]  — delay in ms before this entry (default 300)
   */
  play(entries, onDone) {
    var self = this;
    var i = 0;
    function next() {
      if (i >= entries.length) { if (onDone) onDone(); return; }
      var e = entries[i++];
      setTimeout(function() {
        self._addLine(e.kind || 'info', e.text || '');
        next();
      }, e.delay !== undefined ? e.delay : 300);
    }
    next();
    return this;
  }
}

if (typeof module !== 'undefined') module.exports = { IDEFakeConsole };
