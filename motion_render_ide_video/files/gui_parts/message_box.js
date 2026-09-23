/**
 * IDEMessageBox
 * ─────────────────────────────────────────────────────────────────────────────
 * Chat input panel — mirrors the real IDE lower [panel-section] from chat_layout.lui:
 *
 *   lower [panel-section]
 *     buttonPanel2 (50px) — agent selector combo | brain | shapes | settings icons
 *     messageBox   [textarea]  — auto-expanding, placeholder text
 *     buttonPanel1 (40px) — attach/rewind | spacer | image/sound/video combos
 *                            | model combo | send-one | send-agent | send-build
 *
 * Palette (electric_dark theme — matches .textarea-borderless / .panel-container-
 * elevated-flat / .button-large(-secondary) in resources/styles/main.css):
 *   — messageBox + media/model combos: flat BG_SECONDARY3 (#212233), no border.
 *   — icon-only buttons (brain/shapes/attach/rewind): transparent bg always,
 *     icon gray-10 (#7b7b7b) → gray-11 (#b4b4b4) on hover. No hover fill.
 *   — send buttons: square (24×24, radius 4), NOT circular/color-coded.
 *       secondary (send-agent): bg BG_DROPDOWN_HOVER (#565764) → EMPHASE
 *         (#fff) + dark icon (#111) on hover.
 *       emphasis  (send-build): bg EMPHASE (#fff) + dark icon (#111) always
 *         — the standout CTA action, distinct from the neutral secondaries.
 *
 * Usage:
 *   const box = new IDEMessageBox({
 *     agentName:   'Cody',
 *     agentRole:   'Developer',
 *     agentAvatar: 'images/icons/qcai.png',
 *     modelName:   'sonnet',
 *     placeholder: 'Type your request here…',
 *     text:        'prefilled text',
 *     onSend:      function(text) { ... },
 *   });
 *   box.mount(parentEl);
 *   box.setText('new text');
 *   box.getText();
 */
class IDEMessageBox {
  constructor(opts) {
    opts = opts || {};
    this.agentName   = opts.agentName   || 'Cody';
    this.agentRole   = opts.agentRole   || 'Developer';
    this.agentAvatar = opts.agentAvatar || 'images/icons/qcai.png';
    this.modelName   = opts.modelName   || 'sonnet';
    this.placeholder = opts.placeholder || 'Type your request here… Shift + ↵ to send';
    this.initialText = opts.text        || '';
    this.onSend      = opts.onSend      || null;
    this._injectStyles();
    this._build();
    if (this.initialText) this.setText(this.initialText);
  }

  // ── One-time global style injection (::placeholder can't be set inline) ──
  _injectStyles() {
    if (document.getElementById('ide-message-box-style')) return;
    var style = document.createElement('style');
    style.id = 'ide-message-box-style';
    style.textContent = [
      '.ide-msgbox-textarea::placeholder {',
      '  color: var(--qc-color-gray-9,#6e6e6e);',
      '  opacity: 1;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Icon helper ───────────────────────────────────────────────────────────
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

  // ── Flat icon button (24×24) — mirrors .button-with-icon +
  // .panel-container-elevated-flat-icon: background is ALWAYS transparent,
  // only the icon color shifts gray-10 → gray-11 on hover. ───────────────────
  _ibtn(iconPath, size) {
    var btn = document.createElement('button');
    btn.style.cssText = [
      'width:24px',
      'height:24px',
      'border:none',
      'background:transparent',
      'cursor:pointer',
      'border-radius:4px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'transition:color 0.12s',
      'color:var(--qc-color-gray-10,#7b7b7b)',
      'flex-shrink:0',
      'padding:0',
    ].join(';');
    btn.addEventListener('mouseenter', function() { btn.style.color = 'var(--qc-color-gray-11,#b4b4b4)'; });
    btn.addEventListener('mouseleave', function() { btn.style.color = 'var(--qc-color-gray-10,#7b7b7b)'; });
    btn.appendChild(this._icon(iconPath, size || 16));
    return btn;
  }

  // ── Media combo (image/sound/video) — flat chip, mirrors .combobox-up +
  // .panel-container-elevated-flat: solid BG_SECONDARY3, no border/opacity
  // fade, subtle brighten on hover. ───────────────────────────────────────────
  _mediaCombo(iconPath, label) {
    var btn = document.createElement('button');
    btn.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:4px',
      'height:28px',
      'padding:0 8px',
      'border-radius:8px',
      'border:none',
      'background:var(--qc-color-bg-elevated,#212233)',
      'cursor:pointer',
      'transition:filter 0.12s',
      'color:var(--qc-color-text-light,#fff)',
      'flex-shrink:0',
      'font-size:11px',
      'font-family:inherit',
    ].join(';');
    btn.addEventListener('mouseenter', function() { btn.style.filter = 'brightness(1.3)'; });
    btn.addEventListener('mouseleave', function() { btn.style.filter = 'none'; });
    btn.appendChild(this._icon(iconPath, 12));
    var lbl = document.createElement('span');
    lbl.textContent = label;
    btn.appendChild(lbl);
    // caret up
    var caret = document.createElement('span');
    caret.style.cssText = [
      'display:inline-block',
      'width:10px',
      'height:10px',
      'background-color:currentColor',
      'opacity:0.5',
      '-webkit-mask-image:url(\'/_ide/images/icons/coolicons/Arrow/Caret_Up_MD.png\')',
      'mask-image:url(\'/_ide/images/icons/coolicons/Arrow/Caret_Up_MD.png\')',
      '-webkit-mask-size:contain',
      'mask-size:contain',
      '-webkit-mask-repeat:no-repeat',
      'mask-repeat:no-repeat',
    ].join(';');
    btn.appendChild(caret);
    return btn;
  }

  // ── LLM model combo — flat chip, same treatment as _mediaCombo ────────────
  _modelCombo(modelName) {
    var btn = document.createElement('button');
    btn.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:6px',
      'height:28px',
      'padding:0 8px',
      'border-radius:8px',
      'border:none',
      'background:var(--qc-color-bg-elevated,#212233)',
      'cursor:pointer',
      'transition:filter 0.12s',
      'color:var(--qc-color-text-light,#fff)',
      'flex-shrink:0',
      'max-width:180px',
      'font-family:inherit',
    ].join(';');
    btn.addEventListener('mouseenter', function() { btn.style.filter = 'brightness(1.3)'; });
    btn.addEventListener('mouseleave', function() { btn.style.filter = 'none'; });

    // Model provider logo — plain <img> (branded, multi-color mark; not a
    // mask-able single-color icon like the rest of the toolbar). Mirrors
    // .llm-logo-img from the original message_box.html reference.
    var logo = document.createElement('img');
    logo.src = '/_ide/images/icons/logos/anthropic.png';
    logo.alt = 'Anthropic';
    logo.style.cssText = 'width:14px;height:14px;object-fit:contain;flex-shrink:0;opacity:0.8;';
    logo.onerror = function() { logo.style.display = 'none'; };
    btn.appendChild(logo);

    var name = document.createElement('span');
    name.style.cssText = 'font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;';
    name.textContent = modelName;
    btn.appendChild(name);

    var caret = document.createElement('span');
    caret.style.cssText = [
      'display:inline-block',
      'width:10px',
      'height:10px',
      'background-color:currentColor',
      'opacity:0.5',
      'flex-shrink:0',
      '-webkit-mask-image:url(\'/_ide/images/icons/coolicons/Arrow/Caret_Up_MD.png\')',
      'mask-image:url(\'/_ide/images/icons/coolicons/Arrow/Caret_Up_MD.png\')',
      '-webkit-mask-size:contain',
      'mask-size:contain',
      '-webkit-mask-repeat:no-repeat',
      'mask-repeat:no-repeat',
    ].join(';');
    btn.appendChild(caret);
    return btn;
  }

  // ── Square send button (24×24, radius 4) — mirrors .button-large /
  // .button-large-secondary. NOT circular, NOT color-coded per action.
  //   variant 'secondary' (default): bg BG_DROPDOWN_HOVER → turns EMPHASE
  //     (white) with a dark icon on hover.
  //   variant 'emphasis': bg EMPHASE (white) + dark icon, ALWAYS — the one
  //     standout CTA action (e.g. send-build), distinct from the neutrals.
  _sendBtn(iconPath, variant) {
    var isEmphasis = variant === 'emphasis';
    var restBg   = isEmphasis ? 'var(--qc-color-emphase,#fff)'   : 'var(--qc-color-dropdown-hover,#565764)';
    var restIcon = isEmphasis ? 'var(--qc-color-gray-1,#111)'    : 'var(--qc-color-text-primary,#bdbdbd)';

    var btn = document.createElement('button');
    btn.style.cssText = [
      'width:24px',
      'height:24px',
      'border:none',
      'cursor:pointer',
      'border-radius:4px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'transition:background-color 0.12s,color 0.12s,transform 0.1s',
      'flex-shrink:0',
      'background-color:' + restBg,
      'color:' + restIcon,
      'padding:0',
    ].join(';');
    if (!isEmphasis) {
      btn.addEventListener('mouseenter', function() {
        btn.style.backgroundColor = 'var(--qc-color-emphase,#fff)';
        btn.style.color           = 'var(--qc-color-gray-1,#111)';
      });
      btn.addEventListener('mouseleave', function() {
        btn.style.backgroundColor = restBg;
        btn.style.color           = restIcon;
      });
    }
    btn.addEventListener('mousedown', function() { btn.style.transform = 'scale(0.93)'; });
    btn.addEventListener('mouseup',   function() { btn.style.transform = 'scale(1)'; });

    btn.appendChild(this._icon(iconPath, 14, 'currentColor'));
    return btn;
  }

  // ── Agent selector (top bar) ──────────────────────────────────────────────
  // Mirrors AgentComboBox collapsed paint (agent_combo_delegate.py / chat.py):
  // avatar 32px (AVATAR_SIZE) + two-line identity stack — name (bold, 13px,
  // TOP) / role (12px gray, BELOW) — then chevron. Same order/sizing as the
  // chat message header (message_log.js create_top_row) for visual consistency.
  _buildTopBar() {
    var bar = document.createElement('div');
    bar.style.cssText = [
      'display:flex',
      'align-items:center',
      'height:54px',
      'padding:6px 10px 0',
      'gap:6px',
      'flex-shrink:0',
    ].join(';');

    // Agent avatar + name/role stack + caret
    var agentRow = document.createElement('div');
    agentRow.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';

    var av = document.createElement('div');
    av.style.cssText = 'width:32px;height:32px;border-radius:50%;overflow:hidden;flex-shrink:0;background:rgba(255,255,255,0.06);';
    var avImg = document.createElement('img');
    avImg.src = '/_ide/' + this.agentAvatar;
    avImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    avImg.onerror = function() { avImg.style.display = 'none'; };
    av.appendChild(avImg);
    agentRow.appendChild(av);

    // Name (TOP, bold) + role (BELOW, gray) — matches chat identity order
    var nameCol = document.createElement('div');
    nameCol.style.cssText = 'display:flex;flex-direction:column;gap:0;align-items:flex-start;justify-content:center;';

    this._agentNameEl = document.createElement('span');
    this._agentNameEl.style.cssText = 'font-size:13px;font-weight:600;color:var(--qc-color-text-light,#fff);line-height:1.3;';
    this._agentNameEl.textContent = this.agentName;
    nameCol.appendChild(this._agentNameEl);

    this._agentRoleEl = document.createElement('span');
    this._agentRoleEl.style.cssText = 'font-size:12px;color:var(--qc-color-text-secondary,#888);line-height:1.2;';
    this._agentRoleEl.textContent = this.agentRole;
    nameCol.appendChild(this._agentRoleEl);

    agentRow.appendChild(nameCol);

    var chevron = this._icon('images/icons/coolicons/Arrow/Caret_Down_MD.png', 12);
    chevron.style.opacity = '0.4';
    agentRow.appendChild(chevron);

    bar.appendChild(agentRow);

    // Spacer
    var spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Right icons: brain + catalog
    bar.appendChild(this._ibtn('images/icons/phosphor/brain.png', 16));
    bar.appendChild(this._ibtn('images/icons/phosphor/shapes.png', 16));

    return bar;
  }

  // ── Textarea — flat, mirrors .textarea-borderless + .textarea-in-container
  // + .panel-container-elevated-flat: solid BG_SECONDARY3 fill, zero border,
  // radius 8. The flat bg lives on the textarea itself (not just a wrapper),
  // matching the real widget where the whole input surface is one flat card. ─
  _buildTextarea() {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;padding:0 10px;flex-shrink:0;';

    this._textarea = document.createElement('textarea');
    this._textarea.className = 'ide-msgbox-textarea';
    this._textarea.placeholder = this.placeholder;
    this._textarea.style.cssText = [
      'width:100%',
      'min-height:56px',
      'resize:none',
      'border:none',
      'outline:none',
      'background:var(--qc-color-bg-elevated,#212233)',
      'color:var(--qc-color-text-light,#fff)',
      'font-family:inherit',
      'font-size:13px',
      'line-height:1.55',
      'border-radius:8px',
      'padding:8px 34px 8px 10px',
      'overflow-y:hidden',
      'display:block',
      'box-sizing:border-box',
    ].join(';');

    // Auto-expand
    var ta = this._textarea;
    function autoResize() {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 300) + 'px';
    }
    ta.addEventListener('input', autoResize);

    // Mic button — right side, aligned with first text line. Same flat
    // gray-10 → gray-11 treatment as _ibtn (no hover background fill).
    var mic = document.createElement('button');
    mic.style.cssText = [
      'position:absolute',
      'right:8px',
      'top:8px',
      'width:24px',
      'height:24px',
      'border:none',
      'background:transparent',
      'cursor:pointer',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'transition:color 0.12s',
      'color:var(--qc-color-gray-10,#7b7b7b)',
      'border-radius:4px',
      'padding:0',
    ].join(';');
    mic.addEventListener('mouseenter', function() { mic.style.color = 'var(--qc-color-gray-11,#b4b4b4)'; });
    mic.addEventListener('mouseleave', function() { mic.style.color = 'var(--qc-color-gray-10,#7b7b7b)'; });
    mic.appendChild(this._icon('images/icons/phosphor/microphone.png', 16));

    wrap.appendChild(this._textarea);
    wrap.appendChild(mic);
    return wrap;
  }

  // ── Bottom button bar ─────────────────────────────────────────────────────
  _buildBottomBar() {
    var bar = document.createElement('div');
    bar.style.cssText = [
      'display:flex',
      'align-items:center',
      'height:44px',
      'padding:0 8px',
      'gap:4px',
      'flex-shrink:0',
    ].join(';');

    // Attach + rewind
    bar.appendChild(this._ibtn('images/icons/coolicons/Edit/Add_Plus.png', 16));
    bar.appendChild(this._ibtn('images/icons/coolicons/Media/Rewind.png', 16));

    // Spacer
    var spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Media combos
    bar.appendChild(this._mediaCombo('images/icons/phosphor/image.png',        ''));
    bar.appendChild(this._mediaCombo('images/icons/phosphor/waveform.png',      ''));
    bar.appendChild(this._mediaCombo('images/icons/phosphor/video-camera.png',  ''));

    // Model combo
    bar.appendChild(this._modelCombo(this.modelName));

    // Small gap
    var gap = document.createElement('div');
    gap.style.width = '4px';
    bar.appendChild(gap);

    // Send agent (head-circuit) — neutral secondary, turns white on hover
    var self = this;
    var btnAgent = this._sendBtn('images/icons/phosphor/head-circuit.png', 'secondary');
    btnAgent.addEventListener('click', function() {
      if (self.onSend) self.onSend(self.getText());
    });
    bar.appendChild(btnAgent);

    // Send build (hammer) — emphasis CTA, always white
    var btnBuild = this._sendBtn('images/icons/phosphor/hammer3.png', 'emphasis');
    bar.appendChild(btnBuild);

    return bar;
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  _build() {
    // Root — lower <panel-section panel-container-elevated> (chat_layout.lui).
    // panel-container-elevated overrides panel-section's bg: whole panel is
    // flat BG_SECONDARY3 (#212233), same tone as the textarea/combos inside —
    // that's the "flat" look: no seam between panel and its inner controls.
    // (className kept for docs; bg set inline since it must win regardless.)
    this.el = document.createElement('div');
    this.el.className = 'panel-section panel-container-elevated';
    this.el.style.cssText = 'display:flex;flex-direction:column;flex-shrink:0;' +
      'background:var(--qc-color-bg-elevated,#212233);border-radius:10px;';

    this.el.appendChild(this._buildTopBar());
    this.el.appendChild(this._buildTextarea());
    this.el.appendChild(this._buildBottomBar());
  }

  // ── Public API ────────────────────────────────────────────────────────────

  mount(parent) {
    parent.appendChild(this.el);
    return this;
  }

  getText() {
    return this._textarea ? this._textarea.value : '';
  }

  setText(text) {
    if (!this._textarea) return this;
    this._textarea.value = text;
    // Trigger auto-resize
    var ev = new Event('input');
    this._textarea.dispatchEvent(ev);
    return this;
  }

  setAgentName(name) {
    this.agentName = name;
    if (this._agentNameEl) this._agentNameEl.textContent = name;
    return this;
  }

  setAgentRole(role) {
    this.agentRole = role;
    if (this._agentRoleEl) this._agentRoleEl.textContent = role;
    return this;
  }

  setModelName(name) {
    this.modelName = name;
    return this;
  }

  focus() {
    if (this._textarea) this._textarea.focus();
    return this;
  }
}

if (typeof module !== 'undefined') module.exports = { IDEMessageBox };
