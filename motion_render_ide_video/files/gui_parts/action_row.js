/**
 * IDEActionRow
 * ─────────────────────────────────────────────────────────────────────────────
 * Emulates the CollapsedExpanderWidget "proloader" row from the Python IDE.
 *
 * Layout (mirrors collapsed_expander_widget.py):
 *   [spinner] [status text ............] [timer] [action count] [unfold icon]
 *
 * States:
 *   - working  : spinner rotating, timer ticking, status text animating dots
 *   - done     : spinner stops, shows final "N actions done", unfold toggles content
 *
 * Usage:
 *   const row = new IDEActionRow({ label: 'Doing something', actions: [...] });
 *   row.mount(parentEl);
 *   row.start();          // begin working animation
 *   row.finish();         // stop and show done state
 */
class IDEActionRow {
  constructor(opts) {
    opts = opts || {};
    this._label       = opts.label    || 'Working';
    this._actions     = opts.actions  || [];   // array of { icon, text } for expanded content
    this._startTime   = null;
    this._timerRaf    = null;
    this._dotCount    = 0;
    this._dotTimer    = null;
    this._isWorking   = false;
    this._isExpanded  = false;
    this._actionCount = 0;
    this._build();
  }

  // ── Icon helper ──────────────────────────────────────────────────────────
  _icon(path, size, color) {
    var s = document.createElement('span');
    s.style.cssText = [
      'display:inline-block',
      'width:' + (size||14) + 'px',
      'height:' + (size||14) + 'px',
      'min-width:' + (size||14) + 'px',
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

  _build() {
    // Inject styles once
    if (!document.getElementById('_action-row-styles')) {
      var st = document.createElement('style');
      st.id = '_action-row-styles';
      st.textContent = [
        '@keyframes arSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
        '.ar-spinner{animation:arSpin 0.9s linear infinite}',
        '@keyframes arFadeIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}',
        '.ar-action-item{animation:arFadeIn 0.2s ease forwards}',
        /* new message subtle entrance */
        '@keyframes arMsgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
        '.ar-msg-new{animation:arMsgIn 0.25s ease forwards}',
      ].join('\n');
      document.head.appendChild(st);
    }

    // Root wrapper — left indent mirrors Python's main_layout margin (16px left)
    this.el = document.createElement('div');
    this.el.style.cssText = 'display:flex;flex-direction:column;padding:0 8px 0 58px;';

    // ── Header row (the proloader bar) ───────────────────────────────────
    this._headerEl = document.createElement('div');
    this._headerEl.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:6px',
      'height:26px',
      'padding:0 8px',
      'border-radius:6px',
      'cursor:pointer',
      'transition:background 0.12s',
      'background:var(--qc-color-bg-secondary2,rgba(255,255,255,0.05))',
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,0.06)',
    ].join(';');
    this._headerEl.addEventListener('mouseenter', function() {
      this.style.background = 'var(--qc-color-bg-secondary,rgba(255,255,255,0.08))';
    }.bind(this._headerEl));
    this._headerEl.addEventListener('mouseleave', function() {
      this.style.background = 'var(--qc-color-bg-secondary2,rgba(255,255,255,0.05))';
    }.bind(this._headerEl));
    this._headerEl.addEventListener('click', this._toggleExpand.bind(this));

    // Spinner icon (rotating reload arrow)
    this._spinnerEl = this._icon(
      'images/icons/coolicons/Arrow/Arrows_Reload_01.png', 13,
      'var(--qc-color-text-info,#555)'
    );
    this._headerEl.appendChild(this._spinnerEl);

    // Status text (label + animated dots)
    this._statusEl = document.createElement('span');
    this._statusEl.style.cssText = [
      'font-size:10px',
      'font-weight:600',
      'color:var(--qc-color-secondary,#00bcd4)',
      'flex:1',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'white-space:nowrap',
    ].join(';');
    this._statusEl.textContent = this._label;
    this._headerEl.appendChild(this._statusEl);

    // Right-side group: timer + counter (both dim, separated by space)
    var rightGroup = document.createElement('span');
    rightGroup.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'flex-shrink:0',
    ].join(';');

    // Timer label
    this._timerEl = document.createElement('span');
    this._timerEl.style.cssText = [
      'font-size:9px',
      'color:var(--qc-color-text-secondary,#666)',
      'white-space:nowrap',
    ].join(';');
    this._timerEl.textContent = '0:00s';
    rightGroup.appendChild(this._timerEl);

    // Action counter label — visible during working AND after finish
    this._counterEl = document.createElement('span');
    this._counterEl.style.cssText = [
      'font-size:9px',
      'color:var(--qc-color-text-secondary,#666)',
      'white-space:nowrap',
    ].join(';');
    this._counterEl.textContent = '';
    rightGroup.appendChild(this._counterEl);

    this._headerEl.appendChild(rightGroup);

    // Unfold icon
    this._unfoldEl = this._icon(
      'images/icons/coolicons/Arrow/Unfold_More.png', 13,
      'var(--qc-color-text-info,#555)'
    );
    this._headerEl.appendChild(this._unfoldEl);

    this.el.appendChild(this._headerEl);

    // ── Expanded content area ─────────────────────────────────────────────
    this._contentEl = document.createElement('div');
    this._contentEl.style.cssText = [
      'display:none',
      'flex-direction:column',
      'gap:2px',
      'padding:4px 0 4px 8px',
      'margin-top:2px',
    ].join(';');
    this.el.appendChild(this._contentEl);
  }

  // ── Timer ────────────────────────────────────────────────────────────────
  _elapsed() {
    if (!this._startTime) return '0:00s';
    var s = Math.floor((Date.now() - this._startTime) / 1000);
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec + 's';
  }

  _tickTimer() {
    if (!this._isWorking) return;
    this._timerEl.textContent = this._elapsed();
    this._timerRaf = setTimeout(this._tickTimer.bind(this), 1000);
  }

  // ── Dot animation ────────────────────────────────────────────────────────
  _tickDots() {
    if (!this._isWorking) return;
    this._dotCount = (this._dotCount + 1) % 4;
    var dots = '.'.repeat(this._dotCount + 1);
    // pad to fixed width so text doesn't jump
    var pad = '\u00a0'.repeat(3 - this._dotCount);
    this._statusEl.textContent = this._label + ' ' + dots + pad;
    this._dotTimer = setTimeout(this._tickDots.bind(this), 400);
  }

  // ── Expand / collapse ────────────────────────────────────────────────────
  _toggleExpand() {
    this._isExpanded = !this._isExpanded;
    this._contentEl.style.display = this._isExpanded ? 'flex' : 'none';
    // swap unfold icon
    var newIcon = this._isExpanded
      ? 'images/icons/coolicons/Arrow/Unfold_Less.png'
      : 'images/icons/coolicons/Arrow/Unfold_More.png';
    var color = this._isExpanded
      ? 'var(--qc-color-text-primary,#ccc)'
      : 'var(--qc-color-text-info,#555)';
    this._unfoldEl.style.webkitMaskImage = "url('/_ide/" + newIcon + "')";
    this._unfoldEl.style.maskImage       = "url('/_ide/" + newIcon + "')";
    this._unfoldEl.style.backgroundColor = color;
  }

  // ── Add an action item row (animated) ────────────────────────────────────
  _addActionItem(text, isDone) {
    var item = document.createElement('div');
    item.className = 'ar-action-item';
    item.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:6px',
      'padding:2px 4px',
      'border-radius:4px',
    ].join(';');

    // Status dot
    var dot = document.createElement('span');
    dot.style.cssText = [
      'width:6px',
      'height:6px',
      'min-width:6px',
      'border-radius:50%',
      'flex-shrink:0',
      'background:' + (isDone
        ? 'var(--qc-color-text-secondary,#666)'
        : 'var(--qc-color-secondary,#00bcd4)'),
    ].join(';');
    item.appendChild(dot);

    var lbl = document.createElement('span');
    lbl.style.cssText = [
      'font-size:10px',
      'color:' + (isDone
        ? 'var(--qc-color-text-secondary,#666)'
        : 'var(--qc-color-text-primary,#ccc)'),
      'overflow:hidden',
      'text-overflow:ellipsis',
      'white-space:nowrap',
    ].join(';');
    lbl.textContent = text;
    item.appendChild(lbl);

    this._contentEl.appendChild(item);
    return item;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  mount(parent) {
    parent.appendChild(this.el);
    return this;
  }

  /** Start working animation */
  start() {
    this._isWorking = true;
    this._startTime = Date.now();
    this._spinnerEl.classList.add('ar-spinner');
    this._tickTimer();
    this._tickDots();
    return this;
  }

  /** Update status label while working */
  setStatus(text) {
    this._label = text;
    if (this._isWorking) {
      // dots will pick it up on next tick
    } else {
      this._statusEl.textContent = text;
    }
    return this;
  }

  /** Add an action to the expanded list and increment counter */
  addAction(text, isDone) {
    this._actionCount++;
    this._addActionItem(text, isDone !== false);
    var n = this._actionCount;
    this._counterEl.textContent = n + ' action' + (n !== 1 ? 's' : '') + ' done';
    // Also update status to show current action description while working
    if (this._isWorking) {
      this._label = text;
    }
    return this;
  }

  /** Stop working, show final done state */
  finish(finalLabel) {
    this._isWorking = false;
    clearTimeout(this._timerRaf);
    clearTimeout(this._dotTimer);

    // Stop spinner
    this._spinnerEl.classList.remove('ar-spinner');
    // Switch spinner to a small grey dot (done state)
    this._spinnerEl.style.webkitMaskImage = "url('/_ide/images/icons/coolicons/Interface/Dummy_Circle_Small.png')";
    this._spinnerEl.style.maskImage       = "url('/_ide/images/icons/coolicons/Interface/Dummy_Circle_Small.png')";
    this._spinnerEl.style.backgroundColor = 'var(--qc-color-text-secondary,#666)';

    // Final status text — show action count in status
    var n = this._actionCount;
    var label = finalLabel || (n + ' action' + (n !== 1 ? 's' : '') + ' done');
    this._statusEl.textContent = label;
    this._statusEl.style.color = 'var(--qc-color-text-info,#555)';

    // Final timer stays
    this._timerEl.textContent = this._elapsed();

    // Counter — hide (count is now in status label)
    this._counterEl.textContent = '';

    // Dim header
    this._headerEl.style.background = 'transparent';
    this._headerEl.style.boxShadow = 'none';

    return this;
  }
}

if (typeof module !== 'undefined') module.exports = { IDEActionRow };
