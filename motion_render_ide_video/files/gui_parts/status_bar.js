/**
 * IDEStatusBar — matches real status_bar.lui and scripts/status_ui.py
 *
 * Supports compact mode (28px height, single-row with icons, carets and reduced height)
 * and normal expanded mode (40px height with micro labels).
 * Defaults to compact mode (compact: true) with reduced height (28px).
 *
 * Uses bridge CSS classes: .footer, .footer-text, .comment-micro
 */
class IDEStatusBar {
  constructor(opts = {}) {
    this.statusText  = opts.status  ?? 'Ready';
    this.branch      = opts.branch  ?? 'main';
    this.lang        = opts.lang    ?? 'Python 3.11';
    this.project     = opts.project ?? 'MyProject';
    this.model       = opts.model   ?? 'claude-sonnet-4-5';
    this.ragText     = opts.ragText ?? 'synced';
    this.profileText = opts.profileText ?? 'user@quadcode.ai';
    this.clusterText = opts.clusterText ?? 'online';
    this.isCompact   = opts.compact !== false;
    this.height      = this.isCompact ? 28 : 40;
    this._onCompactToggle = opts.onCompactToggle || null;
    this._build();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _icon(path, size = 12, opacity = 0.6) {
    const s = document.createElement('span');
    s.className = 'icon';
    s.style.cssText = `width:${size}px;height:${size}px;min-width:${size}px;min-height:${size}px;--icon:url('/_ide/${path}');opacity:${opacity};flex-shrink:0;`;
    return s;
  }

  /** Tiny uppercase label above a section (comment-micro style) */
  _microLabel(text) {
    const el = document.createElement('div');
    el.className = 'comment-micro';
    el.style.cssText = 'font-size:8px;line-height:1;opacity:0.45;white-space:nowrap;margin-bottom:1px;letter-spacing:0.04em;';
    el.textContent = text;
    return el;
  }

  /** A section cell: micro label on top, content row below */
  _section(labelText, contentEl, widthStyle) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `display:flex;flex-direction:column;justify-content:center;padding:0 8px;height:100%;${widthStyle ? widthStyle + ';' : ''}flex-shrink:0;cursor:default;transition:background 0.12s;`;
    wrap.addEventListener('mouseenter', () => wrap.style.background = 'rgba(128,128,128,0.07)');
    wrap.addEventListener('mouseleave', () => wrap.style.background = 'transparent');
    wrap.appendChild(this._microLabel(labelText));
    wrap.appendChild(contentEl);
    return wrap;
  }

  /** footer-text row with optional icon */
  _textRow(text, iconPath, iconSize = 11) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;';
    if (iconPath) row.appendChild(this._icon(iconPath, iconSize));
    const lbl = document.createElement('span');
    lbl.className = 'footer-text';
    lbl.style.cssText = 'font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    lbl.textContent = text;
    row._label = lbl;
    row.appendChild(lbl);
    return row;
  }

  /** Colored state indicator bar */
  _stateBar(color, height = '14px') {
    const bar = document.createElement('div');
    bar.style.cssText = `width:4px;height:${height};border-radius:2px;background:${color};flex-shrink:0;`;
    return bar;
  }

  _stateColor(s) {
    if (s === 'Running' || s === 'busy')  return 'var(--qc-color-in-progress, #f59e0b)';
    if (s === 'Error'   || s === 'error') return 'var(--qc-color-danger, #ef4444)';
    return 'var(--qc-color-success, #22c55e)';
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  _build() {
    this.height = this.isCompact ? 28 : 40;
    this.el = document.createElement('div');
    this.el.className = 'footer';
    Object.assign(this.el.style, {
      height:     this.height + 'px',
      minHeight:  this.height + 'px',
      display:    'flex',
      alignItems: 'center',
      flexShrink: '0',
      userSelect: 'none',
      overflow:   'hidden',
      padding:    this.isCompact ? '0 12px' : '0 4px',
    });

    if (this.isCompact) {
      this._buildCompact();
    } else {
      this._buildNormal();
    }
  }

  _buildCompact() {
    // ── LEFT (single horizontal row) ───────────────────────────────────────
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;flex:1;min-width:0;gap:16px;';

    // section1 — operation/status text (30%)
    const sec1 = document.createElement('div');
    sec1.style.cssText = 'display:flex;align-items:center;gap:6px;width:30%;max-width:30%;';
    this._sec1Icon = this._icon('images/icons/coolicons/Interface/Check.png', 11, 0.6);
    this._sec1Label = document.createElement('span');
    this._sec1Label.className = 'footer-text';
    this._sec1Label.style.cssText = 'font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    this._sec1Label.textContent = this.statusText;
    sec1.appendChild(this._sec1Icon);
    sec1.appendChild(this._sec1Label);
    left.appendChild(sec1);

    // section3 — branch + lang (25%)
    const sec3 = document.createElement('div');
    sec3.style.cssText = 'display:flex;align-items:center;gap:6px;width:25%;max-width:25%;';
    this._sec3Icon = this._icon('images/icons/phosphor/git-branch.png', 11, 0.6);
    this._sec3Label = document.createElement('span');
    this._sec3Label.className = 'footer-text';
    this._sec3Label.style.cssText = 'font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    this._sec3Label.textContent = `${this.branch}  ·  ${this.lang}`;
    sec3.appendChild(this._sec3Icon);
    sec3.appendChild(this._sec3Label);
    left.appendChild(sec3);

    // sectionRag — RAG status (13%)
    const secRag = document.createElement('div');
    secRag.style.cssText = 'display:flex;align-items:center;gap:6px;width:13%;max-width:13%;';
    this._ragIcon = this._icon('images/icons/sync_done.png', 11, 0.6);
    this._ragLabel = document.createElement('span');
    this._ragLabel.className = 'footer-text';
    this._ragLabel.style.cssText = 'font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    this._ragLabel.textContent = this.ragText;
    secRag.appendChild(this._ragIcon);
    secRag.appendChild(this._ragLabel);
    left.appendChild(secRag);

    // ── RIGHT (single horizontal row with carets) ──────────────────────────
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:16px;flex-shrink:0;';

    // Support
    const supportRow = document.createElement('div');
    supportRow.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;';
    supportRow.appendChild(this._icon('images/icons/phosphor/headset.png', 14, 0.65));
    const supportText = document.createElement('span');
    supportText.className = 'footer-text';
    supportText.style.cssText = 'font-size:11px;white-space:nowrap;';
    supportText.textContent = 'Contact us';
    supportRow.appendChild(supportText);
    supportRow.appendChild(this._icon('images/icons/coolicons/Arrow/Caret_Up_SM.png', 12, 0.45));
    right.appendChild(supportRow);

    // Profile
    const profileRow = document.createElement('div');
    profileRow.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;';
    profileRow.appendChild(this._icon('images/icons/phosphor/user-circle.png', 14, 0.65));
    this._profileLabel = document.createElement('span');
    this._profileLabel.className = 'footer-text';
    this._profileLabel.style.cssText = 'font-size:11px;white-space:nowrap;';
    this._profileLabel.textContent = this.profileText;
    profileRow.appendChild(this._profileLabel);
    profileRow.appendChild(this._icon('images/icons/coolicons/Arrow/Caret_Up_SM.png', 12, 0.45));
    right.appendChild(profileRow);

    // Cluster state
    const clusterRow = document.createElement('div');
    clusterRow.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer;';
    this._stateBarEl = this._stateBar(this._stateColor(this.statusText), '14px');
    this._clusterTextEl = document.createElement('span');
    this._clusterTextEl.className = 'footer-text';
    this._clusterTextEl.style.cssText = 'font-size:11px;white-space:nowrap;';
    this._clusterTextEl.textContent = this.clusterText;
    clusterRow.appendChild(this._stateBarEl);
    clusterRow.appendChild(this._clusterTextEl);
    clusterRow.appendChild(this._icon('images/icons/coolicons/Arrow/Caret_Up_SM.png', 12, 0.45));
    right.appendChild(clusterRow);

    // Collapse/Expand button
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'button-icon';
    collapseBtn.title = 'Toggle compact mode';
    collapseBtn.style.cssText = 'width:20px;height:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;border:none;padding:0;';
    collapseBtn.appendChild(this._icon('images/icons/coolicons/Arrow/Expand.png', 12, 0.6));
    collapseBtn.addEventListener('click', () => this.toggleCompactMode());
    right.appendChild(collapseBtn);

    this.el.appendChild(left);
    this.el.appendChild(right);
  }

  _buildNormal() {
    this.el.style.alignItems = 'stretch';
    this.el.style.padding = '0';

    // ── LEFT ──────────────────────────────────────────────────────────────
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:stretch;flex:1;min-width:0;';

    // section1 — operation/status text (30%)
    this._sec1Row = this._textRow(this.statusText, 'images/icons/coolicons/Interface/Check.png');
    this._sec1Label = this._sec1Row._label;
    left.appendChild(this._section('OPERATION', this._sec1Row, 'width:30%;max-width:30%'));

    // section3 — branch + lang (25%)
    this._sec3Row = this._textRow(`${this.branch}  ·  ${this.lang}`, 'images/icons/phosphor/git-branch.png');
    this._sec3Label = this._sec3Row._label;
    left.appendChild(this._section('STATUS', this._sec3Row, 'width:25%;max-width:25%'));

    // sectionRag — RAG status (13%)
    this._ragRow = this._textRow(this.ragText, 'images/icons/sync_done.png');
    this._ragLabel = this._ragRow._label;
    left.appendChild(this._section('RAG STATUS', this._ragRow, 'width:13%;max-width:13%'));

    // ── RIGHT ─────────────────────────────────────────────────────────────
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:stretch;flex-shrink:0;';

    // Support
    const supportRow = this._textRow('Contact us', 'images/icons/phosphor/headset.png', 14);
    right.appendChild(this._section('SUPPORT', supportRow, ''));

    // Profile
    this._profileRow = this._textRow(this.profileText, 'images/icons/phosphor/user-circle.png', 14);
    this._profileLabel = this._profileRow._label;
    right.appendChild(this._section('PROFILE', this._profileRow, ''));

    // Cluster state
    const clusterContent = document.createElement('div');
    clusterContent.style.cssText = 'display:flex;align-items:center;gap:4px;';
    this._stateBarEl = this._stateBar(this._stateColor(this.statusText), '65%');
    this._clusterTextEl = document.createElement('span');
    this._clusterTextEl.className = 'footer-text';
    this._clusterTextEl.style.cssText = 'font-size:11px;white-space:nowrap;';
    this._clusterTextEl.textContent = this.clusterText;
    clusterContent.appendChild(this._stateBarEl);
    clusterContent.appendChild(this._clusterTextEl);
    right.appendChild(this._section('CLUSTER', clusterContent, ''));

    // Collapse button
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'button-icon';
    collapseBtn.title = 'Toggle compact mode';
    collapseBtn.style.cssText = 'width:24px;height:24px;align-self:center;margin:0 4px;';
    collapseBtn.appendChild(this._icon('images/icons/coolicons/Arrow/Shrink.png', 12, 0.6));
    collapseBtn.addEventListener('click', () => this.toggleCompactMode());
    right.appendChild(collapseBtn);

    this.el.appendChild(left);
    this.el.appendChild(right);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  mountInto(wrapper) {
    wrapper.appendToWindow(this.el);
    this._wrapper = wrapper;
    return this;
  }

  mount(parent) {
    parent.appendChild(this.el);
    return this;
  }

  setCompactMode(compact) {
    compact = !!compact;
    if (this.isCompact === compact && this.el) return;
    this.isCompact = compact;
    if (this.el && this.el.parentNode) {
      const parent = this.el.parentNode;
      const nextSibling = this.el.nextSibling;
      this.el.remove();
      this._build();
      if (nextSibling) {
        parent.insertBefore(this.el, nextSibling);
      } else {
        parent.appendChild(this.el);
      }
    } else {
      this._build();
    }
    if (this._onCompactToggle) this._onCompactToggle(this.isCompact);
  }

  toggleCompactMode() {
    this.setCompactMode(!this.isCompact);
  }

  setStatus(s) {
    this.statusText = s;
    if (this._sec1Label) this._sec1Label.textContent = s;
    if (this._stateBarEl) this._stateBarEl.style.background = this._stateColor(s);
    return this;
  }

  setBranch(b) {
    this.branch = b;
    if (this._sec3Label) this._sec3Label.textContent = `${b}  ·  ${this.lang}`;
    return this;
  }

  setLang(l) {
    this.lang = l;
    if (this._sec3Label) this._sec3Label.textContent = `${this.branch}  ·  ${l}`;
    return this;
  }

  setProject(p) {
    this.project = p;
    return this;
  }

  setModel(m) {
    this.model = m;
    return this;
  }

  setRag(text) {
    this.ragText = text;
    if (this._ragLabel) this._ragLabel.textContent = text;
    return this;
  }

  setProfile(text) {
    this.profileText = text;
    if (this._profileLabel) this._profileLabel.textContent = text;
    return this;
  }

  setCluster(text) {
    this.clusterText = text;
    if (this._clusterTextEl) this._clusterTextEl.textContent = text;
    return this;
  }
}

if (typeof module !== 'undefined') module.exports = { IDEStatusBar };
