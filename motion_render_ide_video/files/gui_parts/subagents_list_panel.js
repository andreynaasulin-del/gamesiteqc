/**
 * IDESubagentsListPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Emulates the Python agent_action_list_panel subagent card UI.
 *
 * Matches agent_action_list_panel.lui and agent_action_list_item_subagent.lui:
 *   - Top header (h:50) with "Sub-agent Requests" label, model combo,
 *     "Claude enabled" CLI mode toggle, Add (+) button, and Clear button.
 *   - Each card (IDESubagentCard) mirrors agent_action_list_item_subagent.lui:
 *     ┌──────────────────────────────────────────────────────────────────────┐
 *     │ ▌  [caller] CallerName  →  [target] AgentName          [CLI]   [v]  │
 *     │             caller role             Agent role                       │
 *     │    Question / short_description text…                                │
 *     │    ⟳  0:12s  ▪  ToolReadFile  src/model.py                          │
 *     │    ⎿  ✓  Identify model transformer layers                           │
 *     │       ▶  Insert nn.Dropout(0.1) in attention blocks                  │
 *     │       ○  Run forward pass verification test                          │
 *     └──────────────────────────────────────────────────────────────────────┘
 */
class IDESubagentsListPanel {
  constructor(opts) {
    opts = opts || {};
    this._cards = [];
    this.el     = null;
    this.modelName  = opts.modelName  || 'claude-sonnet-4-5';
    this.cliEnabled = opts.cliEnabled !== false;
    this.onAddRequest = opts.onAddRequest || null;
    this.onClear = opts.onClear || null;
    this._build();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  _build() {
    _sapInjectStyles();

    this.el = document.createElement('div');
    this.el.className = 'sap-panel-root';
    this.el.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'width:100%',
      'height:100%',
      'overflow:hidden',
    ].join(';');

    // Header matching agent_action_list_panel.lui
    var header = document.createElement('div');
    header.className = 'sap-panel-header';
    header.style.cssText = [
      'height:50px',
      'min-height:50px',
      'display:flex',
      'align-items:center',
      'padding:0 16px',
      'gap:10px',
      'border-bottom:1px solid var(--qc-color-border-subtle, rgba(255,255,255,0.06))',
      'flex-shrink:0',
      'user-select:none',
    ].join(';');

    // Title
    var title = document.createElement('span');
    title.className = 'sap-header-title';
    title.style.cssText = 'font-size:13px;font-weight:500;color:var(--qc-color-text-info,#888);white-space:nowrap;';
    title.textContent = 'Sub-agent Requests';
    header.appendChild(title);

    // Model dropdown
    var modelCombo = document.createElement('div');
    modelCombo.className = 'sap-model-combo';
    modelCombo.style.cssText = 'display:flex;align-items:center;gap:6px;height:28px;padding:0 10px;background:var(--qc-color-bg-secondary,rgba(255,255,255,0.05));border-radius:6px;cursor:pointer;font-size:12px;color:var(--qc-color-text-primary,#ccc);';
    modelCombo.appendChild(_sapIconMask('images/icons/phosphor/head-circuit.png', 14, 14, 'var(--qc-color-text-secondary,#aaa)'));
    this._modelLabel = document.createElement('span');
    this._modelLabel.textContent = this.modelName;
    modelCombo.appendChild(this._modelLabel);
    modelCombo.appendChild(_sapIconMask('images/icons/coolicons/Arrow/Caret_Down_MD.png', 12, 12, 'var(--qc-color-text-secondary,#888)'));
    header.appendChild(modelCombo);

    // CLI toggle
    var cliToggle = document.createElement('div');
    cliToggle.className = 'sap-cli-toggle';
    cliToggle.style.cssText = 'display:flex;align-items:center;gap:6px;height:28px;padding:0 8px;border-radius:6px;cursor:pointer;font-size:12px;color:var(--qc-color-text-primary,#ccc);';
    cliToggle.appendChild(_sapIconMask('images/icons/logos/anthropic.png', 14, 14));
    this._cliLabel = document.createElement('span');
    this._cliLabel.textContent = this.cliEnabled ? 'Claude enabled' : 'Claude disabled';
    cliToggle.appendChild(this._cliLabel);
    var self = this;
    cliToggle.addEventListener('click', function() {
      self.setCliEnabled(!self.cliEnabled);
    });
    header.appendChild(cliToggle);

    // Spacer
    var spacer = document.createElement('div');
    spacer.style.flex = '1';
    header.appendChild(spacer);

    // Add button
    var addBtn = document.createElement('button');
    addBtn.className = 'button-icon sap-add-btn';
    addBtn.title = 'Add a new subagent request';
    addBtn.style.cssText = 'width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:5px;background:transparent;border:none;cursor:pointer;';
    addBtn.appendChild(_sapIconMask('images/icons/phosphor/plus.png', 14, 14, 'var(--qc-color-text-primary,#ccc)'));
    addBtn.addEventListener('click', function() {
      if (self.onAddRequest) self.onAddRequest();
    });
    header.appendChild(addBtn);

    // Clear button
    var clearBtn = document.createElement('button');
    clearBtn.className = 'button-icon sap-clear-btn';
    clearBtn.title = "'Clear' the list of actions";
    clearBtn.style.cssText = 'width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:5px;background:transparent;border:none;cursor:pointer;';
    clearBtn.appendChild(_sapIconMask('images/icons/coolicons/Interface/Trash_Empty.png', 14, 14, 'var(--qc-color-text-primary,#ccc)'));
    clearBtn.addEventListener('click', function() {
      self.clear();
      if (self.onClear) self.onClear();
    });
    header.appendChild(clearBtn);

    this.el.appendChild(header);

    // Cards scrollable container
    this._cardsContainer = document.createElement('div');
    this._cardsContainer.className = 'sap-cards-container';
    this._cardsContainer.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'flex:1',
      'overflow-y:auto',
      'overflow-x:hidden',
      'padding:10px 0',
    ].join(';');
    this.el.appendChild(this._cardsContainer);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  mount(parent) {
    parent.appendChild(this.el);
    return this;
  }

  setModel(name) {
    this.modelName = name;
    if (this._modelLabel) this._modelLabel.textContent = name;
  }

  setCliEnabled(enabled) {
    this.cliEnabled = !!enabled;
    if (this._cliLabel) this._cliLabel.textContent = this.cliEnabled ? 'Claude enabled' : 'Claude disabled';
  }

  /**
   * Add a new subagent call card.
   * @param {object} opts  see class header
   * @returns {IDESubagentCard}
   */
  addCard(opts) {
    var card = new IDESubagentCard(opts);
    card.mount(this._cardsContainer);
    this._cards.push(card);
    return card;
  }

  /** Remove all cards */
  clear() {
    this._cards.forEach(function(c) { c.destroy(); });
    this._cards = [];
    if (this._cardsContainer) this._cardsContainer.innerHTML = '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IDESubagentCard
// ─────────────────────────────────────────────────────────────────────────────

class IDESubagentCard {
  constructor(opts) {
    opts = opts || {};
    this._callerName        = opts.callerName        || 'many';
    this._callerRole         = opts.callerRole !== undefined
      ? opts.callerRole : _sapDefaultRole(this._callerName);
    this._callerDisplayName = opts.callerDisplayName ||
      _sapTitleCase(this._callerName);
    this._targetName  = opts.targetName  || 'dev';
    this._agentRole   = opts.agentRole !== undefined
      ? opts.agentRole : _sapDefaultRole(this._targetName);
    this._agentName   = opts.agentName   || 'Agent';
    this._question    = opts.question    || '';
    this._cli         = opts.cli !== undefined ? !!opts.cli : false;
    this._plan        = opts.plan || null;
    this._autoStart   = opts.autoStart !== false;

    this._status      = 'default';
    this._startTime   = null;
    this._timerHandle = null;
    this._isExpanded  = false;

    this.el = null;
    this._build();
    if (this._plan) this.setPlan(this._plan);
    if (this._autoStart) this._startTimer();
  }

  // ── Build ────────────────────────────────────────────────────────────────

  _build() {
    var root = document.createElement('div');
    root.className = 'sap-root sap-card-enter';
    this.el = root;

    var headerCard = _sapDiv('sap-header-card');
    this._headerCard = headerCard;
    root.appendChild(headerCard);

    // top spacer
    headerCard.appendChild(_sapDiv('sap-spacer'));

    // ── mainContent ───────────────────────────────────────────────────────
    var main = _sapDiv('sap-main');
    this._main = main;
    headerCard.appendChild(main);

    main.appendChild(_sapDiv('sap-gutter'));

    this._statusBar = _sapDiv('sap-statusbar sap-status-default');
    main.appendChild(this._statusBar);

    main.appendChild(_sapDiv('sap-gap'));

    // content panel
    var content = _sapDiv('sap-content');
    this._content = content;
    main.appendChild(content);

    // ── row1: avatars + agent name/role ──────────────────────────────────
    var row1 = _sapDiv('sap-row1');

    this._callerAvatarEl = _sapAvatar(this._callerName, 32);
    row1.appendChild(this._callerAvatarEl);
    row1.appendChild(_sapSpacer(8));

    var callerInfoPanel = _sapDiv('sap-info-panel sap-caller-info');

    this._callerNameEl = document.createElement('span');
    this._callerNameEl.className = 'sap-agent-name';
    this._callerNameEl.textContent = this._callerDisplayName;
    callerInfoPanel.appendChild(this._callerNameEl);

    this._callerRoleEl = document.createElement('span');
    this._callerRoleEl.className = 'sap-agent-role';
    this._callerRoleEl.textContent = this._callerRole || '';
    this._callerRoleEl.style.display = this._callerRole ? '' : 'none';
    callerInfoPanel.appendChild(this._callerRoleEl);

    row1.appendChild(callerInfoPanel);
    row1.appendChild(_sapSpacer(10));

    var arrow = _sapIconMask('images/icons/coolicons/Arrow/Arrow_Right_MD.png', 12, 12, 'var(--qc-color-text-secondary,#555)');
    arrow.style.flexShrink = '0';
    row1.appendChild(arrow);
    row1.appendChild(_sapSpacer(10));

    this._targetAvatarEl = _sapAvatar(this._targetName, 32);
    row1.appendChild(this._targetAvatarEl);
    row1.appendChild(_sapSpacer(10));

    var infoPanel = _sapDiv('sap-info-panel');

    this._agentNameEl = document.createElement('span');
    this._agentNameEl.className = 'sap-agent-name';
    this._agentNameEl.textContent = this._agentName;
    infoPanel.appendChild(this._agentNameEl);

    this._agentRoleEl = document.createElement('span');
    this._agentRoleEl.className = 'sap-agent-role';
    this._agentRoleEl.textContent = this._agentRole || '';
    this._agentRoleEl.style.display = this._agentRole ? '' : 'none';
    infoPanel.appendChild(this._agentRoleEl);

    row1.appendChild(infoPanel);
    content.appendChild(row1);

    // ── questionLabel ─────────────────────────────────────────────────────
    this._questionEl = document.createElement('div');
    this._questionEl.className = 'sap-question';
    var q = this._question;
    this._questionEl.textContent = q.length > 120 ? q.slice(0, 117) + '\u2026' : q;
    content.appendChild(this._questionEl);

    // ── statusLine ────────────────────────────────────────────────────────
    this._statusLine = _sapDiv('sap-status-line');

    this._spinnerEl = _sapIconMask(
      'images/icons/coolicons/Arrow/Arrows_Reload_01.png',
      16, 16, 'var(--qc-color-text-secondary,#555)'
    );
    this._spinnerEl.classList.add('sap-spin');
    this._statusLine.appendChild(this._spinnerEl);

    this._timingEl = document.createElement('span');
    this._timingEl.className = 'sap-timing';
    this._timingEl.textContent = '0:00s';
    this._statusLine.appendChild(this._timingEl);

    var dot = document.createElement('span');
    dot.className = 'sap-dot';
    dot.textContent = '\u25aa';
    this._statusLine.appendChild(dot);

    this._actionEl = document.createElement('span');
    this._actionEl.className = 'sap-action-label';
    this._actionEl.textContent = 'thinking\u2026';
    this._statusLine.appendChild(this._actionEl);

    content.appendChild(this._statusLine);

    // ── CLI button (top-right, mirrors jumpToTerminalButton) ───────────────
    var cliBtn = _sapDiv('sap-cli-btn');
    cliBtn.appendChild(_sapIconMask('images/icons/coolicons/System/Window_Terminal.png', 13, 13, 'var(--qc-color-text-secondary,#888)'));
    var cliText = document.createElement('span');
    cliText.textContent = 'CLI';
    cliBtn.appendChild(cliText);
    cliBtn.style.display = this._cli ? 'flex' : 'none';
    this._cliBtn = cliBtn;
    main.appendChild(cliBtn);

    // ── expand button (absolute top-right) ────────────────────────────────
    var expandBtn = _sapDiv('sap-expand-btn');
    this._expandBtnIcon = _sapIconMask(
      'images/icons/coolicons/Arrow/Unfold_More.png',
      13, 13, 'var(--qc-color-text-info,#555)'
    );
    expandBtn.appendChild(this._expandBtnIcon);
    expandBtn.addEventListener('click', this._toggleExpand.bind(this));
    main.appendChild(expandBtn);

    // bottom spacer
    headerCard.appendChild(_sapDiv('sap-spacer'));

    // expanded panel (hidden)
    this._expandedEl = _sapDiv('sap-expanded');
    this._expandedEl.style.display = 'none';
    root.appendChild(this._expandedEl);
  }

  // ── Plan checklist view (PlanStatusMicroView) ─────────────────────────────

  /**
   * Set or update checklist steps.
   * Steps can be:
   *   - a string with lines like: "[x] done\n[*] active\n[ ] todo\n[-] stalled"
   *   - an array of step objects: [{ state: 'done'|'active'|'todo'|'stalled', text: '...' }]
   */
  setPlan(plan) {
    this._plan = plan;
    var steps = _sapParsePlan(plan);
    if (!steps || steps.length === 0) {
      if (this._planViewEl) {
        this._planViewEl.remove();
        this._planViewEl = null;
      }
      this._updateHeightForPlan(0);
      return;
    }

    if (!this._planViewEl) {
      this._planViewEl = _sapDiv('sap-plan-view');
      this._content.appendChild(this._planViewEl);
    }
    this._planViewEl.innerHTML = '';

    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      var row = _sapDiv('sap-plan-row');

      // Marker column: ⎿ on first row, spacer on subsequent
      var marker = document.createElement('span');
      marker.className = 'sap-plan-marker';
      marker.textContent = (i === 0) ? '⎿' : '';
      row.appendChild(marker);

      // Icon column: ✓ / ▶ / ○ / ◌
      var icon = document.createElement('span');
      icon.className = 'sap-plan-icon';
      var text = document.createElement('span');
      text.className = 'sap-plan-text';
      text.textContent = step.text;

      if (step.state === 'done') {
        icon.textContent = '✓';
        icon.style.color = 'var(--qc-color-secondary,#00bcd4)';
        text.style.color = 'var(--qc-color-text-secondary,#888)';
        text.style.textDecoration = 'line-through';
      } else if (step.state === 'active') {
        icon.textContent = '▶';
        icon.style.color = 'var(--qc-color-primary,#6db3f2)';
        text.style.color = 'var(--qc-color-text-light,#fff)';
      } else if (step.state === 'stalled') {
        icon.textContent = '◌';
        icon.style.color = 'var(--qc-color-text-secondary,#888)';
        text.style.color = 'var(--qc-color-text-secondary,#888)';
      } else {
        icon.textContent = '○';
        icon.style.color = 'var(--qc-color-text-info,#666)';
        text.style.color = 'var(--qc-color-text-info,#666)';
      }

      row.appendChild(icon);
      row.appendChild(text);
      this._planViewEl.appendChild(row);
    }

    this._updateHeightForPlan(steps.length);
  }

  _updateHeightForPlan(stepCount) {
    var baseH = 108;
    var extraH = stepCount > 0 ? (stepCount * 20 + 6) : 0;
    var totalH = baseH + extraH;
    if (this._main) this._main.style.height = totalH + 'px';
    if (this._statusBar) this._statusBar.style.height = (totalH - 10) + 'px';
  }

  setCli(enabled) {
    this._cli = !!enabled;
    if (this._cliBtn) this._cliBtn.style.display = this._cli ? 'flex' : 'none';
  }

  // ── Timer ────────────────────────────────────────────────────────────────

  _startTimer() {
    this._startTime = Date.now();
    this._tickTimer();
  }

  _tickTimer() {
    if (!this._startTime) return;
    var s = Math.floor((Date.now() - this._startTime) / 1000);
    var m = Math.floor(s / 60);
    var sec = s % 60;
    if (this._timingEl) {
      this._timingEl.textContent = m + ':' + (sec < 10 ? '0' : '') + sec + 's';
    }
    var self = this;
    this._timerHandle = setTimeout(function() { self._tickTimer(); }, 1000);
  }

  _stopTimer() {
    if (this._timerHandle) clearTimeout(this._timerHandle);
    this._timerHandle = null;
    this._startTime = null;
  }

  // ── Expand / collapse ────────────────────────────────────────────────────

  _toggleExpand() {
    this._isExpanded = !this._isExpanded;
    this._expandedEl.style.display = this._isExpanded ? 'flex' : 'none';
    var newPath  = this._isExpanded
      ? 'images/icons/coolicons/Arrow/Unfold_Less.png'
      : 'images/icons/coolicons/Arrow/Unfold_More.png';
    var newColor = this._isExpanded
      ? 'var(--qc-color-text-primary,#ccc)'
      : 'var(--qc-color-text-info,#555)';
    var urlVal = "url('/_ide/" + newPath + "')";
    this._expandBtnIcon.style.webkitMaskImage = urlVal;
    this._expandBtnIcon.style.maskImage       = urlVal;
    this._expandBtnIcon.style.backgroundColor = newColor;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  mount(parent) {
    parent.appendChild(this.el);
    return this;
  }

  destroy() {
    this._stopTimer();
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
  }

  setStatus(status) {
    if (this._status === status) return;
    this._status = status;
    var bar = this._statusBar;
    bar.classList.add('sap-status-pulse');
    bar.className = 'sap-statusbar sap-status-' + (status || 'default') + ' sap-status-pulse';
    var self = this;
    setTimeout(function() {
      bar.classList.remove('sap-status-pulse');
    }, 500);
  }

  setCurrentTool(text, elapsed, isLoading) {
    if (text !== undefined && this._actionEl) {
      var el = this._actionEl;
      el.classList.add('sap-text-out');
      var newText = text;
      setTimeout(function() {
        el.textContent = newText;
        el.classList.remove('sap-text-out');
        el.classList.add('sap-text-in');
        setTimeout(function() { el.classList.remove('sap-text-in'); }, 200);
      }, 120);
    }
    if (elapsed !== undefined && elapsed !== '' && this._timingEl) {
      this._timingEl.textContent = elapsed;
    }
    if (this._spinnerEl) {
      if (isLoading !== false) {
        this._spinnerEl.classList.add('sap-spin');
      } else {
        this._spinnerEl.classList.remove('sap-spin');
      }
    }
  }

  addExpandedContent(el) {
    this._expandedEl.appendChild(el);
    if (!this._isExpanded) this._toggleExpand();
  }

  finish(elapsed) {
    this._stopTimer();
    this.setStatus('completed');
    var t = elapsed || (this._timingEl ? this._timingEl.textContent : '');
    this.setCurrentTool('done', t, false);
    if (this._spinnerEl) {
      var urlVal = "url('/_ide/images/icons/coolicons/Interface/Check_Big.png')";
      this._spinnerEl.style.webkitMaskImage = urlVal;
      this._spinnerEl.style.maskImage       = urlVal;
      this._spinnerEl.style.backgroundColor = 'var(--qc-color-secondary,#00bcd4)';
      this._spinnerEl.classList.add('sap-icon-pop');
    }
    if (this.el) {
      this.el.classList.add('sap-card-finish');
      var el = this.el;
      setTimeout(function() { el.classList.remove('sap-card-finish'); }, 800);
    }
  }

  fail() {
    this._stopTimer();
    this.setStatus('failed');
    var t = this._timingEl ? this._timingEl.textContent : '';
    this.setCurrentTool('failed', t, false);
    if (this._spinnerEl) {
      var urlVal = "url('/_ide/images/icons/coolicons/Interface/Close_SM.png')";
      this._spinnerEl.style.webkitMaskImage = urlVal;
      this._spinnerEl.style.maskImage       = urlVal;
      this._spinnerEl.style.backgroundColor = 'var(--qc-color-danger,#e05a5a)';
      this._spinnerEl.classList.add('sap-icon-pop');
    }
    if (this.el) {
      this.el.classList.add('sap-card-fail');
      var el = this.el;
      setTimeout(function() { el.classList.remove('sap-card-fail'); }, 800);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function _sapParsePlan(plan) {
  if (!plan) return [];
  if (Array.isArray(plan)) {
    return plan.map(function(item) {
      if (typeof item === 'string') {
        var str = item.trim();
        if (str.startsWith('- ')) str = str.slice(2).trim();
        var marker = str.slice(0, 3);
        var state = 'todo';
        if (marker === '[x]') state = 'done';
        else if (marker === '[*]') state = 'active';
        else if (marker === '[-]') state = 'stalled';
        var text = (marker === '[x]' || marker === '[*]' || marker === '[-]' || marker === '[ ]')
          ? str.slice(3).trim() : str;
        return { state: state, text: text };
      }
      return item;
    });
  }
  if (typeof plan === 'string') {
    var lines = plan.split(/\\n|\n/);
    var steps = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('- ')) line = line.slice(2).trim();
      var state = 'todo';
      var marker = line.slice(0, 3);
      if (marker === '[x]')      state = 'done';
      else if (marker === '[*]') state = 'active';
      else if (marker === '[-]') state = 'stalled';
      else if (marker === '[ ]') state = 'todo';
      else continue;
      steps.push({ state: state, text: line.slice(3).trim() });
    }
    return steps;
  }
  return [];
}

var _SAP_AVATAR_MAP = {
  po:           'po_circle.png',
  dev:          'dev_circle.png',
  dev_senior:   'dev_senior_circle.png',
  designer:     'designer_circle.png',
  analyst:      'business_analyst_circle.png',
  product:      'product_analyst_circle.png',
  creative:     'creative_thinker_circle.png',
  legal:        'legal_circle.png',
  sale:         'sale_circle.png',
  support:      'support_sale_circle.png',
  front_end:    'front-end_developer_circle.png',
  many:         'team_leader.png',
  cody:         'dev_circle.png',
  lumi:         'designer_circle.png',
  sonic:        'creative_thinker_circle.png',
};

var _SAP_ROLE_MAP = {
  po:           'Product Owner',
  dev:          'Developer',
  dev_senior:   'Senior Developer',
  designer:     'Designer',
  analyst:      'Business Analyst',
  product:      'Product Analyst',
  creative:     'Creative Thinker',
  legal:        'Legal Counsel',
  sale:         'Sales Expert',
  support:      'Customer Support',
  front_end:    'Front-end Developer',
  many:         'Team Leader',
  cody:         'Developer',
  lumi:         'Designer',
  sonic:        'Motion Designer',
};

function _sapDefaultRole(key) {
  return _SAP_ROLE_MAP[(key || '').toLowerCase()] || '';
}

function _sapTitleCase(key) {
  return (key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

function _sapAvatar(name, size) {
  var img = document.createElement('img');
  var key = (name || '').toLowerCase();
  var file = _SAP_AVATAR_MAP[key] || 'dev_circle.png';
  img.src = '/_ide/images/avatars/' + file;
  img.style.cssText = [
    'width:' + size + 'px',
    'height:' + size + 'px',
    'min-width:' + size + 'px',
    'border-radius:50%',
    'object-fit:cover',
    'flex-shrink:0',
    'align-self:center',
  ].join(';');
  img.alt = name || 'avatar';
  return img;
}

function _sapIconMask(path, w, h, color) {
  var s = document.createElement('span');
  var urlVal = "url('/_ide/" + path + "')";
  s.style.cssText = [
    'display:inline-block',
    'width:' + w + 'px',
    'height:' + h + 'px',
    'min-width:' + w + 'px',
    'flex-shrink:0',
    'align-self:center',
    'background-color:' + (color || 'currentColor'),
    '-webkit-mask-size:contain',
    'mask-size:contain',
    '-webkit-mask-repeat:no-repeat',
    'mask-repeat:no-repeat',
    '-webkit-mask-position:center',
    'mask-position:center',
    'pointer-events:none',
  ].join(';');
  s.style.webkitMaskImage = urlVal;
  s.style.maskImage       = urlVal;
  return s;
}

function _sapDiv(className) {
  var d = document.createElement('div');
  if (className) d.className = className;
  return d;
}

function _sapSpacer(w) {
  var s = document.createElement('span');
  s.style.cssText = 'display:inline-block;width:' + w + 'px;min-width:' + w + 'px;flex-shrink:0;';
  return s;
}

function _sapInjectStyles() {
  if (document.getElementById('_sap-styles')) return;
  var st = document.createElement('style');
  st.id = '_sap-styles';
  st.textContent = [
    '.sap-panel-root { display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; }',
    '.sap-root { display:flex; flex-direction:column; width:100%; flex-shrink:0; margin-bottom:12px; }',
    '.sap-header-card {',
    '  display:flex; flex-direction:column;',
    '  margin:0 12px; border-radius:10px; overflow:hidden;',
    '  background:var(--qc-color-bg-elevated,#212233);',
    '}',
    '.sap-spacer { height:10px; flex-shrink:0; }',
    '.sap-main {',
    '  display:flex; flex-direction:row; align-items:stretch;',
    '  height:108px; flex-shrink:0; position:relative; transition:height 0.2s ease;',
    '}',
    '.sap-gutter { width:16px; flex-shrink:0; }',
    '.sap-statusbar { width:4px; flex-shrink:0; border-radius:2px; align-self:stretch; margin:0; transition:height 0.2s ease; }',
    '.sap-status-default   { background:var(--qc-color-text-info,   #555); }',
    '.sap-status-executing { background:var(--qc-color-warning,      #e8a44a); }',
    '.sap-status-completed { background:var(--qc-color-secondary,    #00bcd4); }',
    '.sap-status-failed    { background:var(--qc-color-danger,       #e05a5a); }',
    '.sap-status-selecting { background:var(--qc-color-primary,      #6db3f2); }',
    '.sap-gap { width:12px; flex-shrink:0; }',
    '.sap-content {',
    '  flex:1; position:relative; align-self:stretch; min-width:0;',
    '}',
    '.sap-row1 {',
    '  position:absolute; top:4px; left:0; right:80px; height:36px;',
    '  display:flex; flex-direction:row; align-items:center;',
    '}',
    '.sap-info-panel { display:flex; flex-direction:column; justify-content:center; gap:1px; flex:1; min-width:0; }',
    '.sap-caller-info { flex:0 1 auto; max-width:140px; }',
    '.sap-agent-role {',
    '  font-size:12px; color:var(--qc-color-text-secondary,#666);',
    '  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.2;',
    '}',
    '.sap-agent-name {',
    '  font-size:13px; font-weight:600; color:var(--qc-color-text-light,#fff);',
    '  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.3;',
    '}',
    '.sap-question {',
    '  position:absolute; top:58px; left:0; right:0; height:20px;',
    '  font-size:13px; color:var(--qc-color-primary,#6db3f2); line-height:20px;',
    '  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;',
    '}',
    '.sap-status-line {',
    '  position:absolute; top:82px; left:0; width:calc(100% - 50px); height:20px;',
    '  display:flex; flex-direction:row; align-items:center; gap:5px;',
    '}',
    '.sap-timing {',
    '  font-size:13px; font-family:var(--qc-font-code,monospace);',
    '  color:var(--qc-color-text-secondary,#666); white-space:nowrap; flex-shrink:0;',
    '}',
    '.sap-dot { font-size:13px; color:var(--qc-color-text-secondary,#666); flex-shrink:0; }',
    '.sap-action-label {',
    '  font-size:13px; color:var(--qc-color-text-secondary,#666);',
    '  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0;',
    '}',
    '.sap-cli-btn {',
    '  position:absolute; right:44px; top:0; height:26px;',
    '  padding:0 8px; display:flex; align-items:center; gap:5px;',
    '  border-radius:5px; cursor:pointer; font-size:11px; font-weight:500;',
    '  color:var(--qc-color-text-primary,#ccc); background:rgba(255,255,255,0.06);',
    '  transition:background 0.12s;',
    '}',
    '.sap-cli-btn:hover { background:rgba(255,255,255,0.12); }',
    '.sap-expand-btn {',
    '  position:absolute; right:2px; top:0; width:40px; height:26px;',
    '  display:flex; align-items:center; justify-content:center;',
    '  border-radius:5px; cursor:pointer; flex-shrink:0; transition:background 0.12s;',
    '}',
    '.sap-expand-btn:hover { background:var(--qc-color-bg-secondary,rgba(255,255,255,0.08)); }',
    '.sap-plan-view {',
    '  position:absolute; top:104px; left:0; right:16px;',
    '  display:flex; flex-direction:column; gap:3px; padding-bottom:4px;',
    '}',
    '.sap-plan-row {',
    '  display:flex; flex-direction:row; align-items:center; gap:6px; height:18px; font-size:12px;',
    '}',
    '.sap-plan-marker {',
    '  width:14px; text-align:center; font-size:10px; color:var(--qc-color-text-secondary,#888); flex-shrink:0;',
    '}',
    '.sap-plan-icon {',
    '  width:14px; text-align:center; font-size:12px; flex-shrink:0;',
    '}',
    '.sap-plan-text {',
    '  flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;',
    '}',
    '.sap-expanded {',
    '  padding:12px 16px 12px 44px; margin:12px 12px 0 12px; font-size:12px;',
    '  color:var(--qc-color-text-secondary,#666); border-radius:10px;',
    '  background:var(--qc-color-bg-secondary,rgba(255,255,255,0.03));',
    '  flex-direction:column; gap:4px;',
    '}',
    '@keyframes sapSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }',
    '.sap-spin { animation:sapSpin 0.9s linear infinite; }',
    '@keyframes sapCardEnter {',
    '  from { opacity:0; transform:translateY(10px); }',
    '  to   { opacity:1; transform:translateY(0); }',
    '}',
    '.sap-card-enter { animation:sapCardEnter 0.25s ease forwards; }',
    '@keyframes sapStatusPulse {',
    '  0%   { opacity:1; transform:scaleX(1); }',
    '  40%  { opacity:1; transform:scaleX(2.5); }',
    '  100% { opacity:1; transform:scaleX(1); }',
    '}',
    '.sap-status-pulse { animation:sapStatusPulse 0.45s ease; transform-origin:left center; }',
    '@keyframes sapTextOut {',
    '  from { opacity:1; transform:translateY(0); }',
    '  to   { opacity:0; transform:translateY(-4px); }',
    '}',
    '.sap-text-out { animation:sapTextOut 0.12s ease forwards; }',
    '@keyframes sapTextIn {',
    '  from { opacity:0; transform:translateY(4px); }',
    '  to   { opacity:1; transform:translateY(0); }',
    '}',
    '.sap-text-in { animation:sapTextIn 0.18s ease forwards; }',
    '@keyframes sapIconPop {',
    '  0%   { transform:scale(0.3) rotate(-20deg); opacity:0; }',
    '  60%  { transform:scale(1.3) rotate(4deg);  opacity:1; }',
    '  100% { transform:scale(1)   rotate(0deg);  opacity:1; }',
    '}',
    '.sap-icon-pop { animation:sapIconPop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards; }',
    '@keyframes sapCardFinish {',
    '  0%   { background:rgba(0,188,212,0); }',
    '  30%  { background:rgba(0,188,212,0.08); }',
    '  100% { background:rgba(0,188,212,0); }',
    '}',
    '.sap-card-finish { animation:sapCardFinish 0.8s ease; }',
    '@keyframes sapCardFail {',
    '  0%   { background:rgba(224,90,90,0); }',
    '  30%  { background:rgba(224,90,90,0.08); }',
    '  100% { background:rgba(224,90,90,0); }',
    '}',
    '.sap-card-fail { animation:sapCardFail 0.8s ease; }',
  ].join('\n');
  document.head.appendChild(st);
}

if (typeof module !== 'undefined') module.exports = { IDESubagentsListPanel, IDESubagentCard };
