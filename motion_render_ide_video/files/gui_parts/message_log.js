/**
 * IDEMessageLog
 * ─────────────────────────────────────────────────────────────────────────────
 * Scrollable chat message history — mirrors the real IDE chat log panel.
 *
 * Structure (from chat_layout.lui):
 *   upper [panel-section]
 *     upperSection (50px) — "Add Chat" / "Clear" buttons
 *     scrollArea [scroll-area-panel-section]
 *       scrollAreaWidgetContents — stacked messages
 *
 * Message types:
 *   - user   : right-aligned bubble with avatar
 *   - agent  : left-aligned with avatar + name + model badge
 *   - status : centered dim system message
 *
 * Usage:
 *   const log = new IDEMessageLog({ messages: [...] });
 *   log.mount(parentEl);
 *   log.addMessage({ role, name, avatar, text, model, time });
 *   log.setTyping(true);
 */
class IDEMessageLog {
  constructor(opts) {
    opts = opts || {};
    this.messages   = opts.messages   || [];
    this.showTopBar = opts.showTopBar !== false;
    this.topic      = opts.topic      || '';
    this._typingEl  = null;
    this._build();
    this.messages.forEach(m => this._appendMessage(m));
  }

  // ── Icon helper (mask-based, same as rest of gui_parts) ──────────────────
  _icon(path, size, color) {
    size = size || 14;
    var s = document.createElement('span');
    s.className = 'icon';
    s.style.cssText = [
      'display:inline-block',
      'width:' + size + 'px',
      'height:' + size + 'px',
      'min-width:' + size + 'px',
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

  // ── Avatar ───────────────────────────────────────────────────────────────
  _avatar(src, size) {
    size = size || 32;
    var wrap = document.createElement('div');
    wrap.style.cssText = [
      'width:' + size + 'px',
      'height:' + size + 'px',
      'min-width:' + size + 'px',
      'border-radius:50%',
      'overflow:hidden',
      'flex-shrink:0',
      'background:var(--qc-color-bg-secondary2,rgba(255,255,255,0.08))',
      'display:flex',
      'align-items:center',
      'justify-content:center',
    ].join(';');

    if (src) {
      var img = document.createElement('img');
      img.src = src.startsWith('/_ide/') ? src : '/_ide/' + src;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      img.onerror = function() { img.style.display = 'none'; };
      wrap.appendChild(img);
    }
    return wrap;
  }

  // ── Top bar: TOPIC label + Add Chat / Clear buttons ──────────────────────
  // Mirrors: chat_context_widget.lui (topicLabel) + chat_layout.lui (menuSection)
  _buildTopBar() {
    var bar = document.createElement('div');
    bar.style.cssText = [
      'display:flex',
      'align-items:center',
      'height:40px',
      'padding:0 8px 0 10px',
      'flex-shrink:0',
      'gap:6px',
    ].join(';');

    // TOPIC label — mirrors topicLabel <comment> style
    this._topicEl = document.createElement('span');
    this._topicEl.style.cssText = [
      'font-size:10px',
      'color:var(--qc-color-text-info,#555)',
      'flex:1',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'white-space:nowrap',
      'letter-spacing:0.03em',
    ].join(';');
    this._topicEl.textContent = this.topic ? 'TOPIC: ' + this.topic : '';
    bar.appendChild(this._topicEl);

    var self = this;
    var btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;align-items:center;gap:0;';
    [
      { icon: 'images/icons/phosphor/plus.png',                   label: 'Add Chat' },
      { icon: 'images/icons/coolicons/Interface/Trash_Empty.png',  label: 'Clear'    },
    ].forEach(function(b) {
      var btn = document.createElement('button');
      btn.className = 'button-with-icon';
      btn.title = b.label;
      btn.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'width:24px',
        'height:26px',
        'padding:0',
        'cursor:pointer',
        'border-radius:5px',
        'border:none',
        'background:transparent',
        'color:var(--qc-color-text-secondary,#888)',
        'transition:background 0.12s,color 0.12s',
      ].join(';');
      btn.addEventListener('mouseenter', function() {
        btn.style.background = 'rgba(128,128,128,0.1)';
        btn.style.color = 'var(--qc-color-text-primary,#ccc)';
      });
      btn.addEventListener('mouseleave', function() {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--qc-color-text-secondary,#888)';
      });
      btn.appendChild(self._icon(b.icon, 13));
      btnGroup.appendChild(btn);
    });
    bar.appendChild(btnGroup);

    return bar;
  }

  // ── Single message row ────────────────────────────────────────────────────
  // Mirrors: ChatMessage.create_top_row() + MessageBodyText layout in chat_message.py
  //
  // Key facts from Python:
  //   - BOTH user and agent messages are LEFT-aligned with avatar (no right-flip for user)
  //   - User messages have NO bubble background — same flat layout as agent
  //   - info_panel (model badge) uses "tab-selected" CSS = tab--active SVG corner brackets
  //   - info_panel is HIDDEN for USER messages
  //   - Timestamp is shown as MicroToolBarWithLabel caption BELOW the body, not in top row
  //   - font_size = 12px for body; username = 12px bold (TOP line), role label = 12px
  //     "comment" style (BELOW name) — matches AgentComboBox collapsed identity block
  _buildMessageRow(msg) {
    var role      = msg.role      || 'agent';
    var name      = msg.name      || (role === 'user' ? 'You' : 'Cody');
    var text      = msg.text      || '';
    var model     = msg.model     || '';
    var time      = msg.time      || '';
    var roleLabel = msg.roleLabel || (role === 'user' ? 'Product Owner' : 'Front-end Developer');
    var avatar    = msg.avatar    || (role === 'user'
      ? 'images/avatars/po_circle.png'
      : 'images/avatars/dev.png');

    // Working / proloader row — IDEActionRow
    if (role === 'working') {
      var actionRow = new IDEActionRow({ label: msg.label || text || 'Working' });
      actionRow.mount(document.createElement('div')); // build first
      // pre-populate actions if provided
      if (msg.actions && msg.actions.length) {
        msg.actions.forEach(function(a) { actionRow.addAction(a.text || a, true); });
      }
      if (msg.working !== false) {
        actionRow.start();
        // store ref so caller can control it
        if (msg.ref) msg.ref.row = actionRow;
      } else {
        // pre-finished state
        if (msg.actions && msg.actions.length) {
          actionRow.finish();
        }
      }
      // wrap with entrance animation
      var wrapW = document.createElement('div');
      wrapW.className = 'ar-msg-new';
      wrapW.appendChild(actionRow.el);
      return wrapW;
    }

    // Status message — centered dim line (mirrors is_status_message)
    if (role === 'status') {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:center;padding:4px 12px;';
      var lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:10px;color:var(--qc-color-text-dark,#444);font-style:italic;';
      lbl.textContent = text;
      row.appendChild(lbl);
      return row;
    }

    var isUser = role === 'user';

    // Outer wrapper — mirrors ChatMessage QWidget with QVBoxLayout
    var wrap = document.createElement('div');
    wrap.className = 'ar-msg-new';
    wrap.style.cssText = 'display:flex;flex-direction:column;padding:0;';

    // ── Top row: avatar + name container + spacer + model badge ──────────
    // Mirrors: create_top_row() — QHBoxLayout, left_margin=space6(16px)
    // NOTE: BOTH user and agent are left-aligned (no row-reverse for user)
    var topRow = document.createElement('div');
    topRow.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:10px',
      'padding:0 8px 0 16px',
    ].join(';');

    // Avatar — 32px compact mode (mirrors AVATAR_SIZE_COMPACT = 32)
    topRow.appendChild(this._avatar(avatar, 32));

    // Name container: role label (9px comment) + username (12px bold)
    // Mirrors: name_container QVBoxLayout with spacing=0
    var nameCol = document.createElement('div');
    nameCol.style.cssText = 'display:flex;flex-direction:column;gap:0;align-items:flex-start;';

    // Username — mirrors UILabel "main_text bold-font", font-size:12px — TOP line
    var nameLbl = document.createElement('span');
    nameLbl.style.cssText = [
      'font-size:12px',
      'font-weight:600',
      'color:var(--qc-color-text-light,#fff)',
      'line-height:1.3',
    ].join(';');
    nameLbl.textContent = name;
    nameCol.appendChild(nameLbl);

    // Role label — mirrors UILabel(agent_role) "comment" style, font-size:12px — BELOW name
    var roleLbl = document.createElement('span');
    roleLbl.style.cssText = [
      'font-size:12px',
      'color:var(--qc-color-text-secondary,#888)',
      'line-height:1.2',
    ].join(';');
    roleLbl.textContent = roleLabel;
    nameCol.appendChild(roleLbl);
    topRow.appendChild(nameCol);

    // Spacer — pushes model badge to the right
    var spacer = document.createElement('div');
    spacer.style.flex = '1';
    topRow.appendChild(spacer);

    // Model badge — mirrors info_panel with LUI.apply_styles("tab-selected")
    // Uses real tab--active CSS class with SVG corner bracket decoration
    // HIDDEN for USER messages (mirrors: info_panel.setVisible(False) for USER/empty method)
    if (model && !isUser) {
      var badge = document.createElement('button');
      badge.className = 'tab tab--active msg-badge';
      badge.style.cssText = [
        'font-size:10px',
        'color:var(--qc-color-text-info,#555)',
        'white-space:nowrap',
        'flex-shrink:0',
        'align-self:flex-end',
        'cursor:default',
        'pointer-events:none',
        'height:22px',
        'padding:0 12px',
      ].join(';');
      badge.textContent = model;
      topRow.appendChild(badge);
    }

    wrap.appendChild(topRow);

    // ── Message body ──────────────────────────────────────────────────────
    // Both user and agent: flat, no bubble, left margin
    // left margin = space6(16px) + avatar(32px) + gap(10px) = 58px
    // Mirrors: MessageBodyText with left_margin = int(UIVariables.get("space6"))
    var bodyWrap = document.createElement('div');
    bodyWrap.style.cssText = 'display:flex;padding:2px 40px 0 58px;';

    var bubble = document.createElement('div');
    // Both user and agent: flat text, no background (mirrors Python — no bubble for either)
    bubble.style.cssText = [
      'font-size:11px',
      'line-height:1.55',
      'color:var(--qc-color-text-primary,#ccc)',
      'word-break:break-word',
      'white-space:pre-wrap',
      'flex:1',
    ].join(';');
    bubble.textContent = text;
    bodyWrap.appendChild(bubble);
    wrap.appendChild(bodyWrap);

    // ── Timestamp toolbar ─────────────────────────────────────────────────
    // Mirrors: MicroToolBarWithLabel(method, ...) in MessageBodyText.__init__
    // The timestamp is the toolbar caption shown BELOW the message body
    // style: "comment-low" = TEXT_DARK color, small font
    if (time) {
      var tsBar = document.createElement('div');
      tsBar.style.cssText = [
        'display:flex',
        'align-items:center',
        'padding:1px 8px 0 58px',
        'gap:4px',
      ].join(';');
      var tsLbl = document.createElement('span');
      tsLbl.style.cssText = [
        'font-size:9px',
        'color:var(--qc-color-text-dark,#3a3a4a)',
        'letter-spacing:0.02em',
      ].join(';');
      tsLbl.textContent = time;
      tsBar.appendChild(tsLbl);
      wrap.appendChild(tsBar);
    }

    return wrap;
  }

  // ── Typing indicator ─────────────────────────────────────────────────────
  _buildTypingIndicator() {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;padding:0;';

    var topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:center;gap:10px;padding:0 8px 0 16px;';
    topRow.appendChild(this._avatar('images/avatars/dev.png', 32));

    var nameCol = document.createElement('div');
    nameCol.style.cssText = 'display:flex;flex-direction:column;gap:0;align-items:flex-start;';
    var nameLbl = document.createElement('span');
    nameLbl.style.cssText = 'font-size:12px;font-weight:600;color:var(--qc-color-text-light,#fff);line-height:1.3;';
    nameLbl.textContent = 'Cody';
    var roleLbl = document.createElement('span');
    roleLbl.style.cssText = 'font-size:12px;color:var(--qc-color-text-secondary,#888);line-height:1.2;';
    roleLbl.textContent = 'Front-end Developer';
    nameCol.appendChild(nameLbl);
    nameCol.appendChild(roleLbl);
    topRow.appendChild(nameCol);
    wrap.appendChild(topRow);

    // Dots — flat, no bubble, left-aligned with space6 margin
    var bodyWrap = document.createElement('div');
    bodyWrap.style.cssText = 'display:flex;padding:4px 40px 0 58px;';
    var dots = document.createElement('div');
    dots.style.cssText = 'display:flex;align-items:center;gap:3px;padding:4px 0;';
    for (var i = 0; i < 3; i++) {
      var d = document.createElement('span');
      d.style.cssText = [
        'width:5px',
        'height:5px',
        'border-radius:50%',
        'background:var(--qc-color-text-info,#555)',
        'animation:msgLogDotPulse 1.2s ' + (i * 0.2) + 's infinite',
        'display:inline-block',
      ].join(';');
      dots.appendChild(d);
    }
    bodyWrap.appendChild(dots);
    wrap.appendChild(bodyWrap);
    return wrap;
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  _build() {
    // Inject keyframes once
    if (!document.getElementById('_msg-log-styles')) {
      var st = document.createElement('style');
      st.id = '_msg-log-styles';
      st.textContent = [
        '@keyframes msgLogDotPulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}',
        /* Scale down SVG corner brackets for the small model badge */
        '.msg-badge::before,.msg-badge::after{',
        '  background-size:5px 5px !important;',
        '  -webkit-mask-size:5px 5px !important;',
        '  mask-size:5px 5px !important;',
        '}',
        '.msg-badge::before{',
        '  -webkit-mask-position:top 1px left 1px,bottom 1px left 1px !important;',
        '  mask-position:top 1px left 1px,bottom 1px left 1px !important;',
        '}',
        '.msg-badge::after{',
        '  -webkit-mask-position:top 1px right 1px,bottom 1px right 1px !important;',
        '  mask-position:top 1px right 1px,bottom 1px right 1px !important;',
        '}',
      ].join('\n');
      document.head.appendChild(st);
    }

    // Root — no panel-section here: this log is mounted INSIDE the chat pane
    // (main_panel.js's `pane`), which already carries panel-section's bg +
    // inset-shadow ring. Adding the same class here nested right next to it
    // stacked two inset shadows into a visible double-shadow/border line.
    // Fills parent via flex (NOT height:100% — breaks after hide/show).
    this.el = document.createElement('div');
    this.el.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;flex:1;min-height:0;';

    // Top bar
    if (this.showTopBar) {
      this.el.appendChild(this._buildTopBar());
    }

    // Scroll area — scroll-area-panel-section
    this._scrollWrap = document.createElement('div');
    this._scrollWrap.className = 'scroll-area-panel-section';
    this._scrollWrap.style.cssText = [
      'flex:1',
      'overflow-y:auto',
      'overflow-x:hidden',
      'display:flex',
      'flex-direction:column',
    ].join(';');

    // Inner content — scroll-area-widget-contents
    this._content = document.createElement('div');
    this._content.className = 'scroll-area-widget-contents';
    this._content.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'gap:15px',
      'padding:10px 0 12px',
      'min-height:100%',
    ].join(';');

    // Stretch to push messages to bottom when few
    this._stretch = document.createElement('div');
    this._stretch.style.flex = '1';
    this._content.appendChild(this._stretch);

    this._scrollWrap.appendChild(this._content);
    this.el.appendChild(this._scrollWrap);
  }

  // ── Internal append ───────────────────────────────────────────────────────
  _appendMessage(msg) {
    // Remove typing indicator before appending
    if (this._typingEl && this._typingEl.parentNode === this._content) {
      this._content.removeChild(this._typingEl);
    }

    var row = this._buildMessageRow(msg);
    this._content.appendChild(row);

    // Re-append typing if active
    if (this._typingEl && this._typingVisible) {
      this._content.appendChild(this._typingEl);
    }

    this._scrollToBottom();
  }

  // ── Build an agent message shell (header only, no text yet) ──────────────
  // Returns the wrapper element so we can append action row + text later
  _buildAgentShell(opts) {
    var name      = opts.name      || 'Cody';
    var roleLabel = opts.roleLabel || 'Front-end Developer';
    var model     = opts.model     || 'claude-sonnet';
    var avatar    = opts.avatar    || 'images/avatars/dev.png';
    var time      = opts.time      || '';

    var wrap = document.createElement('div');
    wrap.className = 'ar-msg-new';
    wrap.style.cssText = 'display:flex;flex-direction:column;padding:0;';

    // Top row
    var topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:center;gap:10px;padding:0 8px 0 16px;';
    topRow.appendChild(this._avatar(avatar, 32));

    var nameCol = document.createElement('div');
    nameCol.style.cssText = 'display:flex;flex-direction:column;gap:0;align-items:flex-start;';
    var nameLbl = document.createElement('span');
    nameLbl.style.cssText = 'font-size:12px;font-weight:600;color:var(--qc-color-text-light,#fff);line-height:1.3;';
    nameLbl.textContent = name;
    var roleLbl = document.createElement('span');
    roleLbl.style.cssText = 'font-size:12px;color:var(--qc-color-text-secondary,#888);line-height:1.2;';
    roleLbl.textContent = roleLabel;
    nameCol.appendChild(nameLbl);
    nameCol.appendChild(roleLbl);
    topRow.appendChild(nameCol);

    var spacer = document.createElement('div');
    spacer.style.flex = '1';
    topRow.appendChild(spacer);

    var badge = document.createElement('button');
    badge.className = 'tab tab--active msg-badge';
    badge.style.cssText = 'font-size:10px;color:var(--qc-color-text-info,#555);white-space:nowrap;flex-shrink:0;align-self:flex-end;cursor:default;pointer-events:none;height:22px;padding:0 12px;';
    badge.textContent = model;
    topRow.appendChild(badge);
    wrap.appendChild(topRow);

    // Slot for action row (inserted between header and text)
    var actionSlot = document.createElement('div');
    actionSlot.style.cssText = 'display:flex;flex-direction:column;padding:4px 8px 0 0;';
    wrap.appendChild(actionSlot);

    // Body slot (text appears here after finish)
    var bodySlot = document.createElement('div');
    bodySlot.style.cssText = 'display:flex;padding:2px 40px 0 58px;';
    var bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'font-size:11px;line-height:1.55;color:var(--qc-color-text-primary,#ccc);word-break:break-word;white-space:pre-wrap;flex:1;';
    bodySlot.appendChild(bodyEl);
    wrap.appendChild(bodySlot);

    // Timestamp
    if (time) {
      var tsBar = document.createElement('div');
      tsBar.style.cssText = 'display:flex;align-items:center;padding:1px 8px 0 58px;gap:4px;';
      var tsLbl = document.createElement('span');
      tsLbl.style.cssText = 'font-size:9px;color:var(--qc-color-text-dark,#3a3a4a);letter-spacing:0.02em;';
      tsLbl.textContent = time;
      tsBar.appendChild(tsLbl);
      wrap.appendChild(tsBar);
    }

    return { wrap, actionSlot, bodyEl };
  }

  _scrollToBottom() {
    var el = this._scrollWrap;
    requestAnimationFrame(function() { el.scrollTop = el.scrollHeight; });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  mount(parent) {
    parent.appendChild(this.el);
    return this;
  }

  /** Add a message: { role, name, avatar, text, model, time, roleLabel } */
  addMessage(msg) {
    this._appendMessage(msg);
    return this;
  }

  /** Update the TOPIC label */
  setTopic(topic) {
    this.topic = topic;
    if (this._topicEl) {
      this._topicEl.textContent = topic ? 'TOPIC: ' + topic : '';
    }
    return this;
  }

  /** Show/hide typing indicator */
  setTyping(visible) {
    this._typingVisible = visible;
    if (visible) {
      if (!this._typingEl) this._typingEl = this._buildTypingIndicator();
      if (!this._typingEl.parentNode) this._content.appendChild(this._typingEl);
      this._scrollToBottom();
    } else {
      if (this._typingEl && this._typingEl.parentNode) {
        this._content.removeChild(this._typingEl);
      }
    }
    return this;
  }

  /**
   * Start an agent turn: shows header immediately, embeds a live action row,
   * then reveals text after finish() is called.
   *
   * Returns a controller:
   *   ctrl.addAction(text)      — add action item + update status label
   *   ctrl.finish(replyText)    — stop spinner, reveal reply text with typewriter
   *
   * Usage:
   *   const ctrl = log.startAgentTurn({ model: 'claude-sonnet' });
   *   ctrl.addAction('ToolReadFile  main.py');
   *   ctrl.finish('Here is what I found...');
   */
  startAgentTurn(opts) {
    opts = opts || {};
    var self = this;

    // Remove typing indicator
    if (this._typingEl && this._typingEl.parentNode === this._content) {
      this._content.removeChild(this._typingEl);
    }

    // Build agent shell (header + empty slots)
    var shell = this._buildAgentShell({
      name:      opts.name      || 'Cody',
      roleLabel: opts.roleLabel || 'Front-end Developer',
      model:     opts.model     || 'claude-sonnet',
      avatar:    opts.avatar    || 'images/avatars/dev.png',
      time:      opts.time      || _nowTime(),
    });

    // Create embedded action row (no extra left padding — already inside 58px body indent)
    var actionRow = new IDEActionRow({ label: 'Thinking', embedded: true });
    actionRow.el.style.padding = '2px 8px 0 58px'; // align with body text
    shell.actionSlot.appendChild(actionRow.el);
    actionRow.start();

    this._content.appendChild(shell.wrap);
    this._scrollToBottom();

    var ctrl = {
      /** Add an action step — updates spinner label + counter */
      addAction: function(text) {
        actionRow.addAction(text, false); // false = in-progress dot color
        actionRow.setStatus(text);
        self._scrollToBottom();
        return ctrl;
      },
      /** Finish actions, then reveal reply text with typewriter effect */
      finish: function(replyText, onDone) {
        actionRow.finish();
        self._scrollToBottom();
        // Small pause then typewrite the reply
        setTimeout(function() {
          self._typewriteInto(shell.bodyEl, replyText || '', 18, function() {
            self._scrollToBottom();
            if (onDone) onDone();
          });
        }, 300);
        return ctrl;
      },
    };

    function _nowTime() {
      var d = new Date();
      return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    return ctrl;
  }

  /**
   * Typewriter effect: writes text char-by-char into an element.
   * @param {HTMLElement} el   — target element
   * @param {string}      text — full text to write
   * @param {number}      speed — ms per char (default 18)
   * @param {Function}    onDone — called when complete
   */
  _typewriteInto(el, text, speed, onDone) {
    el.textContent = '';
    var i = 0;
    speed = speed || 18;
    var self = this;
    function tick() {
      if (i >= text.length) {
        if (onDone) onDone();
        return;
      }
      // Write in small chunks for performance on long texts
      var chunk = Math.min(3, text.length - i);
      el.textContent += text.slice(i, i + chunk);
      i += chunk;
      self._scrollToBottom();
      setTimeout(tick, speed);
    }
    tick();
  }

  /**
   * Append a message instantly — no entrance animation, no typewriter.
   * Same params as addMessage(). Useful for pre-populating chat before recording.
   */
  appendInstant(msg) {
    // Build row without ar-msg-new animation class
    var row = this._buildMessageRow(Object.assign({}, msg, { _noAnim: true }));
    // Remove the animation class if _buildMessageRow added it
    row.classList && row.classList.remove('ar-msg-new');

    if (this._typingEl && this._typingEl.parentNode === this._content) {
      this._content.removeChild(this._typingEl);
    }
    this._content.appendChild(row);
    if (this._typingEl && this._typingVisible) {
      this._content.appendChild(this._typingEl);
    }
    this._scrollToBottom();
    return this;
  }

  /** Clear all messages */
  clear() {
    // Remove all children except stretch
    while (this._content.firstChild) this._content.removeChild(this._content.firstChild);
    this._content.appendChild(this._stretch);
    this._typingEl = null;
    this._typingVisible = false;
    return this;
  }
}

if (typeof module !== 'undefined') module.exports = { IDEMessageLog };
