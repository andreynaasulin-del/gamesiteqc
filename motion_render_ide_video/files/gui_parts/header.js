/**
 * IDEHeader — two-row header matching the real Quadcode IDE exactly
 *
 * Row 1 (38px):
 *   LEFT:   🔴🟡🟢 macOS controls | [QCAI logo ▾] | ProjectName ▾ | + | ≡
 *   CENTER: "Quadcode AI v0.16540 [2026-06-21]"
 *   RIGHT:  ▶  🚀  ⎇  ⚙  □□□□□
 *
 * Row 2 (30px tabs):
 *   LEFT tabs:  Chat · History · Console · Find in files · Pipeline · Actions
 *   RIGHT tabs: Files · Meta · Web browsers
 */
class IDEHeader {
  constructor(opts = {}) {
    this.projectName = opts.projectName ?? 'MyProject';
    this.appTitle    = opts.appTitle    ?? 'Quadcode AI v0.16540 [2026-06-21]';
    this._build();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _icon(path, size = 14) {
    const s = document.createElement('span');
    Object.assign(s.style, {
      display:            'inline-block',
      width:              size + 'px',
      height:             size + 'px',
      minWidth:           size + 'px',
      backgroundColor:    'currentColor',
      WebkitMaskImage:    `url('/_ide/${path}')`,
      maskImage:          `url('/_ide/${path}')`,
      WebkitMaskSize:     'contain',
      maskSize:           'contain',
      WebkitMaskRepeat:   'no-repeat',
      maskRepeat:         'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition:       'center',
      pointerEvents:      'none',
      flexShrink:         '0',
    });
    return s;
  }

  _iconBtn(iconPath, title, iconSize = 14, btnSize = 26) {
    const btn = document.createElement('button');
    btn.title = title;
    Object.assign(btn.style, {
      width:          btnSize + 'px',
      height:         btnSize + 'px',
      border:         'none',
      background:     'transparent',
      cursor:         'pointer',
      borderRadius:   '4px',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      color:          'var(--qc-color-text-secondary, #666)',
      flexShrink:     '0',
      transition:     'color 0.12s, background 0.12s',
      padding:        '0',
    });
    btn.appendChild(this._icon(iconPath, iconSize));
    btn.addEventListener('mouseenter', () => {
      btn.style.color = 'var(--qc-color-text-primary, #ccc)';
      btn.style.background = 'rgba(128,128,128,0.1)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.color = 'var(--qc-color-text-secondary, #666)';
      btn.style.background = 'transparent';
    });
    return btn;
  }

  // ── Panel button active state ──────────────────────────────────────────────

  /**
   * Visually mark a panel toggle button as active (panel visible) or inactive.
   * Active   = icon tinted with secondary color (mirrors icon-selected in main.css).
   * Inactive = dimmed icon, no background, no frame.
   */
  _setPanelBtnState(btn, visible) {
    // Mirrors Python: hidden panel → icon-selected (tinted), visible → icon-deselected (dimmed)
    btn.style.color      = visible
      ? 'var(--qc-color-text-secondary, #555)'
      : 'var(--qc-color-secondary, #56a8f5)';
    btn.style.background = 'transparent';
    btn.style.opacity    = visible ? '0.55' : '1';
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  _build() {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      display:      'flex',
      flexDirection:'column',
      flexShrink:   '0',
      background:   'var(--qc-color-bg-primary, #13131f)',
      userSelect:   'none',
    });

    this.el.appendChild(this._buildRow1());
  }

  _buildRow1() {
    const row = document.createElement('div');
    Object.assign(row.style, {
      height:     '38px',
      minHeight:  '38px',
      display:    'flex',
      alignItems: 'center',
      padding:    '0 8px',
      gap:        '0',
    });

    // ── LEFT ──────────────────────────────────────────────────────────────
    const left = document.createElement('div');
    Object.assign(left.style, {
      display:    'flex',
      alignItems: 'center',
      gap:        '4px',
      flex:       '0 0 auto',
    });

    // macOS traffic lights
    const tlPanel = document.createElement('div');
    Object.assign(tlPanel.style, {
      display:    'flex',
      alignItems: 'center',
      gap:        '6px',
      marginRight:'8px',
    });
    const dotColors = ['#ff5f57', '#febc2e', '#28c840'];
    dotColors.forEach(color => {
      const dot = document.createElement('div');
      Object.assign(dot.style, {
        width:        '12px',
        height:       '12px',
        borderRadius: '50%',
        background:   color,
        flexShrink:   '0',
        cursor:       'pointer',
      });
      tlPanel.appendChild(dot);
    });
    left.appendChild(tlPanel);

    // QCAI logo
    const logo = document.createElement('div');
    Object.assign(logo.style, {
      display:        'flex',
      alignItems:     'center',
      gap:            '3px',
      height:         '26px',
      padding:        '0 5px',
      borderRadius:   '5px',
      cursor:         'pointer',
      color:          'var(--qc-color-text-primary, #ccc)',
      transition:     'background 0.12s',
      marginRight:    '4px',
    });
    logo.addEventListener('mouseenter', () => logo.style.background = 'rgba(128,128,128,0.1)');
    logo.addEventListener('mouseleave', () => logo.style.background = 'transparent');

    const logoImg = document.createElement('img');
    logoImg.src = '/_ide/images/icons/qcai.png';
    logoImg.style.cssText = 'width:18px;height:18px;object-fit:contain;flex-shrink:0;';

    const logoCaret = this._icon('images/icons/phosphor/caret-down.png', 9);
    logoCaret.style.opacity = '0.35';
    logo.appendChild(logoImg);
    logo.appendChild(logoCaret);
    left.appendChild(logo);

    // Project name combo
    this._projectCombo = document.createElement('div');
    Object.assign(this._projectCombo.style, {
      display:      'flex',
      alignItems:   'center',
      gap:          '4px',
      height:       '26px',
      padding:      '0 6px',
      borderRadius: '4px',
      cursor:       'pointer',
      color:        'var(--qc-color-text-primary, #c8c8d0)',
      fontSize:     '12.5px',
      fontWeight:   '500',
      transition:   'background 0.12s',
      maxWidth:     '140px',
    });
    this._projectCombo.addEventListener('mouseenter', () => this._projectCombo.style.background = 'rgba(128,128,128,0.08)');
    this._projectCombo.addEventListener('mouseleave', () => this._projectCombo.style.background = 'transparent');

    this._projectNameEl = document.createElement('span');
    this._projectNameEl.textContent = this.projectName;
    Object.assign(this._projectNameEl.style, {
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    });
    const projCaret = this._icon('images/icons/phosphor/caret-down.png', 9);
    projCaret.style.opacity = '0.35';
    this._projectCombo.appendChild(this._projectNameEl);
    this._projectCombo.appendChild(projCaret);
    left.appendChild(this._projectCombo);

    left.appendChild(this._iconBtn('images/icons/phosphor/plus.png', 'New project', 13, 24));
    left.appendChild(this._iconBtn('images/icons/coolicons/Menu/Hamburger_MD.png', 'Menu', 13, 24));

    // ── CENTER: app title ─────────────────────────────────────────────────
    const center = document.createElement('div');
    Object.assign(center.style, {
      flex:           '1',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
    });
    const titleEl = document.createElement('span');
    titleEl.textContent = this.appTitle;
    Object.assign(titleEl.style, {
      fontSize:   '11.5px',
      color:      'var(--qc-color-text-secondary, #666)',
      whiteSpace: 'nowrap',
      opacity:    '0.7',
    });
    center.appendChild(titleEl);

    // ── RIGHT: action icons ───────────────────────────────────────────────
    const right = document.createElement('div');
    Object.assign(right.style, {
      display:    'flex',
      alignItems: 'center',
      gap:        '1px',
      flex:       '0 0 auto',
    });

    const rightActions = [
      { icon: 'images/icons/phosphor/play.png',                    title: 'Run' },
      { icon: 'images/icons/phosphor/rocket-launch.png',           title: 'Deploy' },
      { icon: 'images/icons/phosphor/git-branch.png',              title: 'Git' },
      { icon: 'images/icons/phosphor/gear.png',                    title: 'Settings' },
      { spacer: 8 },
      { icon: 'images/icons/coolicons/System/Bar_Left.png',         title: 'Left panel',    panelKey: 'left',    activeDefault: true },
      { icon: 'images/icons/coolicons/System/Bar_Right_Middle.png', title: 'Central panel', panelKey: 'central', activeDefault: true },
      { icon: 'images/icons/coolicons/System/Bar_Bottom.png',       title: 'Bottom panel',  panelKey: 'bottom',  activeDefault: false },
      { icon: 'images/icons/coolicons/System/Bar_Right.png',        title: 'Right panel',   panelKey: 'right',   activeDefault: true },
    ];
    rightActions.forEach(a => {
      // Spacer
      if (a.spacer) {
        const sp = document.createElement('div');
        sp.style.cssText = 'width:' + a.spacer + 'px;flex-shrink:0;';
        right.appendChild(sp);
        return;
      }
      // Panel toggle buttons are smaller (20px) — regular action buttons stay 26px
      const isPanelBtn = !!a.panelKey;
      const btn = this._iconBtn(a.icon, a.title, isPanelBtn ? 12 : 14, isPanelBtn ? 20 : 26);

      if (isPanelBtn) {
        // Override hover — panel buttons must NOT get a background frame on hover
        btn.addEventListener('mouseenter', () => {
          btn.style.opacity = '1';
          btn.style.background = 'transparent';
        });
        btn.addEventListener('mouseleave', () => {
          this._setPanelBtnState(btn, btn._panelActive);
        });

        // Track active state — active = panel is visible
        btn._panelActive = a.activeDefault;
        this._setPanelBtnState(btn, a.activeDefault);
        btn.addEventListener('click', () => {
          btn._panelActive = !btn._panelActive;
          this._setPanelBtnState(btn, btn._panelActive);
          if (this._onPanelToggle) this._onPanelToggle(a.panelKey, btn._panelActive);
        });
        this['_panelBtn_' + a.panelKey] = btn;
      }
      right.appendChild(btn);
    });

    row.appendChild(left);
    row.appendChild(center);
    row.appendChild(right);
    return row;
  }

  _buildRow2() {
    const row = document.createElement('div');
    Object.assign(row.style, {
      height:         '30px',
      minHeight:      '30px',
      display:        'flex',
      alignItems:     'stretch',
      padding:        '0 4px',
      borderTop:      '1px solid var(--qc-color-divider, rgba(255,255,255,0.05))',
    });

    // Left tabs
    const leftTabs = document.createElement('div');
    Object.assign(leftTabs.style, {
      display:    'flex',
      alignItems: 'stretch',
      flex:       '1',
      gap:        '0',
    });

    const leftTabNames = ['Chat', 'History', 'Console', 'Find in files', 'Pipeline', 'Actions'];
    leftTabNames.forEach((name, i) => {
      leftTabs.appendChild(this._tab(name, i === 0));
    });

    // Right tabs
    const rightTabs = document.createElement('div');
    Object.assign(rightTabs.style, {
      display:    'flex',
      alignItems: 'stretch',
      gap:        '0',
    });

    const rightTabNames = ['Files', 'Meta', 'Web browsers'];
    rightTabNames.forEach((name, i) => {
      rightTabs.appendChild(this._tab(name, i === 2)); // "Web browsers" active
    });

    row.appendChild(leftTabs);
    row.appendChild(rightTabs);
    return row;
  }

  _tab(name, active = false) {
    const tab = document.createElement('div');
    Object.assign(tab.style, {
      display:        'flex',
      alignItems:     'center',
      padding:        '0 12px',
      fontSize:       '11.5px',
      cursor:         'pointer',
      whiteSpace:     'nowrap',
      color:          active
        ? 'var(--qc-color-text-primary, #ccc)'
        : 'var(--qc-color-text-secondary, #666)',
      borderBottom:   active ? '2px solid var(--qc-color-secondary, #56a8f5)' : '2px solid transparent',
      transition:     'color 0.12s, border-color 0.12s',
      boxSizing:      'border-box',
    });
    if (active) {
      // Slight bracket-style border like real IDE
      tab.style.border = '1px solid rgba(255,255,255,0.12)';
      tab.style.borderBottom = '1px solid transparent';
      tab.style.borderRadius = '4px 4px 0 0';
      tab.style.marginBottom = '-1px';
      tab.style.color = 'var(--qc-color-text-primary, #ccc)';
    }
    tab.textContent = name;
    tab.addEventListener('mouseenter', () => {
      if (!active) tab.style.color = 'var(--qc-color-text-primary, #ccc)';
    });
    tab.addEventListener('mouseleave', () => {
      if (!active) tab.style.color = 'var(--qc-color-text-secondary, #666)';
    });
    return tab;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  mountInto(wrapper) {
    wrapper.prependToWindow(this.el);
    return this;
  }

  mount(parent) {
    parent.appendChild(this.el);
    return this;
  }

  setProject(name) {
    this.projectName = name;
    this._projectNameEl.textContent = name;
    return this;
  }

  /**
   * Register a callback fired when a panel toggle button is clicked.
   * @param {function(panelKey: 'left'|'bottom'|'right', visible: boolean)} fn
   */
  onPanelToggle(fn) {
    this._onPanelToggle = fn;
    return this;
  }

  /**
   * Programmatically set a panel button state (without firing the callback).
   * Use this to sync button state when panels are toggled externally.
   * @param {'left'|'bottom'|'right'} panelKey
   * @param {boolean} visible
   */
  setPanelVisible(panelKey, visible) {
    const btn = this['_panelBtn_' + panelKey];
    if (!btn) return this;
    btn._panelActive = visible;
    this._setPanelBtnState(btn, visible);
    return this;
  }
}

if (typeof module !== 'undefined') module.exports = { IDEHeader };
