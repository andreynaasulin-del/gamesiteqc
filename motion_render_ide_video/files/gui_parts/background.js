/**
 * IDEBackground — Background selection panel
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a bottom panel with selectable background effects, matching the
 * behavior of .test/ide_emulation/message_box.html's background panel.
 *
 * Requires bg_animations.js to be loaded first (BgAnimations global).
 *
 * Usage:
 *   const bg = new IDEBackground({ container: document.querySelector('.page-wrap') });
 *   bg.mount(document.body);   // injects the panel into the page
 *   bg.apply('aurora');        // programmatic selection
 *   bg.stop();                 // clear background
 *   bg.current();              // → 'aurora' | null
 */
class IDEBackground {
  constructor(opts = {}) {
    // The element to apply background animations to
    this._container = opts.container || document.body;
    this._current   = null;
    this._el        = null;

    // Effect definitions: key → label
    this._effects = [
      { key: 'none',      label: 'None'        },
      { key: 'neuro',     label: 'Neuro Noise' },
      { key: 'neural',    label: 'Neural Net'  },
      { key: 'gradient',  label: 'Gradient'    },
      { key: 'aurora',    label: 'North Lights'},
      { key: 'grid',      label: 'Grid'        },
      { key: 'nebula',    label: 'Nebula'      },
      { key: 'rain',      label: 'God Rays'    },
      { key: 'stars',     label: 'Stars'       },
      { key: 'waves',     label: 'Waves'       },
      { key: 'scanlines', label: 'Scanlines'   },
      { key: 'vortex',    label: 'Vortex'      },
    ];

    this._build();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  _build() {
    const panel = document.createElement('div');
    panel.className = 'btm-panel';
    Object.assign(panel.style, {
      background:     'rgba(13,13,21,0.88)',
      border:         '1px solid rgba(255,255,255,0.07)',
      borderRadius:   '10px',
      backdropFilter: 'blur(8px)',
      padding:        '7px 14px',
      display:        'flex',
      alignItems:     'center',
      gap:            '8px',
      fontSize:       '11px',
      color:          'var(--qc-color-text-primary, #868a91)',
      whiteSpace:     'nowrap',
      userSelect:     'none',
    });

    // Title
    const title = document.createElement('span');
    title.textContent = 'BACKGROUND';
    Object.assign(title.style, {
      fontSize:      '10px',
      fontWeight:    '600',
      letterSpacing: '0.08em',
      opacity:       '0.45',
      textTransform: 'uppercase',
      flexShrink:    '0',
    });
    panel.appendChild(title);

    // Divider
    panel.appendChild(this._divider());

    // Buttons
    this._btns = {};
    this._effects.forEach(({ key, label }) => {
      const btn = this._makeBtn(label, key === 'none');
      btn.addEventListener('click', () => this._onBtnClick(key));
      this._btns[key] = btn;
      panel.appendChild(btn);
    });

    this._el = panel;
  }

  _divider() {
    const d = document.createElement('div');
    Object.assign(d.style, {
      width:      '1px',
      height:     '16px',
      background: 'rgba(255,255,255,0.08)',
      flexShrink: '0',
    });
    return d;
  }

  _makeBtn(label, active = false) {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      height:      '22px',
      padding:     '0 8px',
      border:      '1px solid rgba(255,255,255,0.1)',
      borderRadius:'4px',
      background:  'rgba(255,255,255,0.04)',
      color:       'var(--qc-color-text-primary, #868a91)',
      fontSize:    '10px',
      fontFamily:  'inherit',
      cursor:      'pointer',
      transition:  'background 0.12s, border-color 0.12s',
      whiteSpace:  'nowrap',
      flexShrink:  '0',
    });
    btn.addEventListener('mouseenter', () => {
      if (!btn._active) {
        btn.style.background   = 'rgba(255,255,255,0.09)';
        btn.style.borderColor  = 'rgba(255,255,255,0.2)';
      }
    });
    btn.addEventListener('mouseleave', () => {
      if (!btn._active) {
        btn.style.background   = 'rgba(255,255,255,0.04)';
        btn.style.borderColor  = 'rgba(255,255,255,0.1)';
      }
    });
    this._setBtnActive(btn, active);
    return btn;
  }

  _setBtnActive(btn, active) {
    btn._active = active;
    if (active) {
      btn.style.borderColor = 'var(--qc-color-primary, #56a8f5)';
      btn.style.color       = 'var(--qc-color-primary, #56a8f5)';
      btn.style.background  = 'rgba(86,168,245,0.06)';
    } else {
      btn.style.borderColor = 'rgba(255,255,255,0.1)';
      btn.style.color       = 'var(--qc-color-text-primary, #868a91)';
      btn.style.background  = 'rgba(255,255,255,0.04)';
    }
  }

  _setActive(key) {
    Object.entries(this._btns).forEach(([k, btn]) => {
      this._setBtnActive(btn, k === key);
    });
  }

  _onBtnClick(key) {
    if (!window.BgAnimations) {
      console.warn('IDEBackground: BgAnimations not loaded');
      return;
    }

    const isSame = this._current === key || (key === 'none' && !this._current);

    if (isSame && key !== 'none') {
      // Toggle off — clicking active effect stops it
      BgAnimations.stop();
      this._current = null;
      this._setActive('none');
    } else {
      this._current = key === 'none' ? null : key;
      this._setActive(key);
      if (key === 'none') {
        BgAnimations.stop();
      } else {
        BgAnimations.apply(key, this._container);
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Mount the panel into a parent element.
   * Typically called with the bottom-panels wrapper div.
   */
  mount(parent) {
    // Wrap in a fixed-position row so it sits above the camera panel
    if (!this._wrapper) {
      const wrap = document.createElement('div');
      Object.assign(wrap.style, {
        position:       'fixed',
        bottom:         '61px',   // above camera panel (14px + ~42px panel height) + 5px gap
        left:           '0',
        right:          '0',
        display:        'flex',
        justifyContent: 'center',
        pointerEvents:  'none',
        zIndex:         '200',
      });
      this._el.style.pointerEvents = 'auto';
      wrap.appendChild(this._el);
      this._wrapper = wrap;
    }
    parent.appendChild(this._wrapper);
    // Init BgAnimations with the target container
    if (window.BgAnimations) BgAnimations.init(this._container);
    return this;
  }

  /**
   * Mount into a bottom-panels wrapper (same as mount but returns this).
   */
  mountInto(bottomPanelsEl) {
    return this.mount(bottomPanelsEl);
  }

  /**
   * Programmatically apply a background effect by key.
   * @param {string} key — effect name or 'none'
   */
  apply(key) {
    this._onBtnClick(key);
    return this;
  }

  /**
   * Stop the current background animation.
   */
  stop() {
    if (window.BgAnimations) BgAnimations.stop();
    this._current = null;
    this._setActive('none');
    return this;
  }

  /**
   * Returns the currently active effect key, or null if none.
   */
  current() {
    return this._current;
  }

  /**
   * Set the container element that animations are applied to.
   * Call before mount() if you need to change the target.
   */
  setContainer(el) {
    this._container = el;
    return this;
  }
}

if (typeof module !== 'undefined') module.exports = { IDEBackground };
