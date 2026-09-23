/**
 * IDETabHolder
 * ─────────────────────────────────────────────────────────────────────────────
 * Mirrors Python multi_tab_viewer_widget.py / FileViewerTabButton / UITabs.
 *
 * Features:
 *  • File tabs  — file-type icon (via IDEFolderTree.iconForFile), filename label,
 *                 close ×  /  unsaved ● toggle (right side)
 *  • Browser tabs — favicon (async load), URL as title, close ×
 *  • Active tab  — bridge .tab--active SVG corner badges (exact CSS from main.css)
 *  • Inactive    — .tab hover highlight, muted color
 *  • Close       — removes tab + pane; activates neighbour
 *  • Reorder     — drag-and-drop within the strip
 *  • Context menu — Close / Close others / Close to right / Close to left
 *  • Tab lifecycle — addTab(opts) / removeTab(id) / activateTab(id)
 *  • Integration  — onTabActivated(id, opts) callback
 *
 * Tab opts:
 *   { id, type:'file'|'browser', label, filePath, url,
 *     unsaved:bool, contentBuilder:fn(pane) }
 *
 * Usage:
 *   var th = new IDETabHolder({ onTabActivated: fn });
 *   th.mount(containerEl);
 *   th.addTab({ id:'f1', type:'file', label:'main.py',
 *               filePath:'src/main.py', contentBuilder: fn });
 */
class IDETabHolder {
  constructor(opts) {
    opts = opts || {};
    this._onTabActivated = opts.onTabActivated || null;
    this._tabs      = [];   // [{id, opts, btnEl, paneEl}]
    this._activeId  = null;
    this._dragSrc   = null;
    this.el         = null;
    this._strip     = null;
    this._body      = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  mount(parent) {
    this._injectStyles();
    this.el = this._buildRoot();
    parent.appendChild(this.el);
  }

  /** Add a tab. If first tab, activates it automatically. */
  addTab(opts) {
    var id = opts.id || ('tab-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    opts.id = id;

    var btnEl  = this._buildTabBtn(opts);
    var paneEl = this._buildPane(opts);

    this._strip.appendChild(btnEl);
    this._body.appendChild(paneEl);
    this._tabs.push({ id: id, opts: opts, btnEl: btnEl, paneEl: paneEl });

    if (this._tabs.length === 1) {
      this.activateTab(id);
    }
    return id;
  }

  /** Remove tab by id */
  removeTab(id) {
    var idx = this._indexById(id);
    if (idx < 0) return;
    var entry = this._tabs[idx];

    entry.btnEl.remove();
    entry.paneEl.remove();
    this._tabs.splice(idx, 1);

    // Activate neighbour
    if (this._activeId === id) {
      this._activeId = null;
      var next = this._tabs[Math.min(idx, this._tabs.length - 1)];
      if (next) this.activateTab(next.id);
    }
  }

  /** Activate tab by id */
  activateTab(id) {
    var self = this;
    this._tabs.forEach(function(t) {
      var active = t.id === id;
      t.btnEl.classList.toggle('tab--active', active);
      if (active) {
        // Lazy-build content on first activation
        if (!t.paneEl._contentBuilt && t.opts.contentBuilder) {
          t.paneEl.style.display = 'flex';   // show first so iframes load properly
          t.opts.contentBuilder(t.paneEl);
          t.paneEl._contentBuilt = true;
        } else {
          t.paneEl.style.display = 'flex';
        }
      } else {
        t.paneEl.style.display = 'none';
      }
    });
    this._activeId = id;
    if (this._onTabActivated) {
      var entry = this._tabs[this._indexById(id)];
      if (entry) this._onTabActivated(id, entry.opts);
    }
  }

  /** Mark tab as unsaved (shows ● instead of ×) */
  setUnsaved(id, unsaved) {
    var entry = this._tabs[this._indexById(id)];
    if (!entry) return;
    entry.opts.unsaved = unsaved;
    var closeBtn   = entry.btnEl.querySelector('.ith-close');
    var unsavedBtn = entry.btnEl.querySelector('.ith-unsaved');
    if (closeBtn)   closeBtn.style.display   = unsaved ? 'none'         : 'inline-flex';
    if (unsavedBtn) unsavedBtn.style.display = unsaved ? 'inline-flex'  : 'none';
  }

  /** Update browser tab favicon */
  setFavicon(id, iconUrl) {
    var entry = this._tabs[this._indexById(id)];
    if (!entry) return;
    var img = entry.btnEl.querySelector('.ith-favicon');
    if (img) { img.src = iconUrl; img.style.display = 'inline-block'; }
    var ico = entry.btnEl.querySelector('.ith-icon');
    if (ico) ico.style.display = 'none';
  }

  // ── Build root ─────────────────────────────────────────────────────────────

  _buildRoot() {
    var root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;width:100%;height:100%;';

    // Tab strip
    var strip = document.createElement('div');
    strip.className = 'tabs-header';
    strip.style.cssText = 'flex-shrink:0;display:flex;flex-direction:row;align-items:flex-end;overflow-x:auto;overflow-y:visible;padding:4px 6px 0;gap:1px;scrollbar-width:none;';
    strip.style.setProperty('--webkit-scrollbar', 'none');
    this._strip = strip;

    // Tab body
    var body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;';
    this._body = body;

    root.appendChild(strip);
    root.appendChild(body);
    return root;
  }

  // ── Tab button ─────────────────────────────────────────────────────────────

  _buildTabBtn(opts) {
    var self = this;
    var isBrowser = opts.type === 'browser';

    var btn = document.createElement('div');
    btn.className = 'tab ith-tab';
    btn.setAttribute('draggable', 'true');
    btn.dataset.tabId = opts.id;
    btn.style.cssText = [
      'position:relative',
      'display:inline-flex',
      'align-items:center',
      'gap:5px',
      'height:28px',
      'padding:0 6px 0 8px',
      'font-size:12px',
      'cursor:pointer',
      'user-select:none',
      'white-space:nowrap',
      'flex-shrink:0',
      'box-sizing:border-box',
    ].join(';') + ';';

    // Icon (file-type or browser globe)
    var iconEl = this._buildIcon(opts);
    btn.appendChild(iconEl);

    // Favicon img (browser tabs — hidden until loaded)
    if (isBrowser) {
      var favicon = document.createElement('img');
      favicon.className = 'ith-favicon';
      favicon.style.cssText = 'width:14px;height:14px;object-fit:contain;display:none;border-radius:2px;';
      btn.appendChild(favicon);
    }

    // Label
    var lbl = document.createElement('span');
    lbl.className = 'ith-label';
    lbl.style.cssText = 'max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    lbl.textContent = opts.label || (opts.filePath ? opts.filePath.split('/').pop() : 'Tab');
    btn.appendChild(lbl);

    // Unsaved dot ●
    var unsavedBtn = document.createElement('span');
    unsavedBtn.className = 'ith-unsaved button-icon button-icon--small';
    unsavedBtn.title = 'Unsaved changes';
    unsavedBtn.style.cssText = 'display:none;width:14px;height:14px;min-width:14px;min-height:14px;align-items:center;justify-content:center;border-radius:50%;font-size:10px;line-height:1;';
    unsavedBtn.innerHTML = '<span class="icon" style="width:8px;height:8px;min-width:8px;min-height:8px;--icon:url(\'/_ide/images/icons/coolicons/Interface/Dummy_Circle_Small.png\');opacity:0.7;"></span>';
    btn.appendChild(unsavedBtn);

    // Close ×
    var closeBtn = document.createElement('button');
    closeBtn.className = 'ith-close button-icon button-icon--small';
    closeBtn.title = 'Close tab';
    closeBtn.style.cssText = 'width:14px;height:14px;min-width:14px;min-height:14px;padding:0;display:inline-flex;align-items:center;justify-content:center;opacity:0;transition:opacity 120ms;';
    closeBtn.innerHTML = '<span class="icon" style="width:10px;height:10px;min-width:10px;min-height:10px;--icon:url(\'/_ide/images/icons/coolicons/Menu/Close_SM.png\');"></span>';
    btn.appendChild(closeBtn);

    // Show close on hover
    btn.addEventListener('mouseenter', function() { closeBtn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', function() { closeBtn.style.opacity = '0'; });

    // Activate on click
    btn.addEventListener('click', function(e) {
      if (e.target === closeBtn || closeBtn.contains(e.target)) return;
      self.activateTab(opts.id);
    });

    // Close
    closeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      self.removeTab(opts.id);
    });

    // Context menu
    btn.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      self._showContextMenu(opts.id, e.clientX, e.clientY);
    });

    // Drag-and-drop reorder
    btn.addEventListener('dragstart', function(e) {
      self._dragSrc = opts.id;
      e.dataTransfer.effectAllowed = 'move';
      btn.style.opacity = '0.5';
    });
    btn.addEventListener('dragend', function() {
      btn.style.opacity = '';
      self._dragSrc = null;
      self._strip.querySelectorAll('.ith-tab').forEach(function(b) {
        b.classList.remove('ith-drag-over');
      });
    });
    btn.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (self._dragSrc && self._dragSrc !== opts.id) {
        btn.classList.add('ith-drag-over');
      }
    });
    btn.addEventListener('dragleave', function() {
      btn.classList.remove('ith-drag-over');
    });
    btn.addEventListener('drop', function(e) {
      e.preventDefault();
      btn.classList.remove('ith-drag-over');
      if (self._dragSrc && self._dragSrc !== opts.id) {
        self._reorderTab(self._dragSrc, opts.id);
      }
    });

    // Apply unsaved state if set
    if (opts.unsaved) {
      unsavedBtn.style.display = 'inline-flex';
      closeBtn.style.display   = 'none';
    }

    return btn;
  }

  _buildIcon(opts) {
    var isBrowser = opts.type === 'browser';
    var iconPath;

    if (isBrowser) {
      iconPath = 'images/icons/file_extensions/webpack.png';
    } else {
      // Use IDEFolderTree icon logic if available
      iconPath = (typeof IDEFolderTree !== 'undefined')
        ? IDEFolderTree.iconForFile(opts.filePath || opts.label || '')
        : 'images/icons/coolicons/File/Note.png';
    }

    var ico = document.createElement('span');
    ico.className = 'icon ith-icon';
    ico.style.cssText = 'width:14px;height:14px;min-width:14px;min-height:14px;--icon:url(\'/_ide/' + iconPath + '\');opacity:0.6;flex-shrink:0;';
    return ico;
  }

  // ── Pane ───────────────────────────────────────────────────────────────────

  _buildPane(opts) {
    var pane = document.createElement('div');
    pane.className = 'ith-pane';
    pane.dataset.tabId = opts.id;
    pane.style.cssText = 'flex:1;overflow:hidden;display:none;flex-direction:column;min-height:0;';
    pane._contentBuilt = false;

    if (!opts.contentBuilder) {
      // Default placeholder — build immediately
      var ph = document.createElement('div');
      ph.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;color:var(--qc-color-text-dark,#444);font-size:12px;';
      ph.textContent = opts.label || opts.id;
      pane.appendChild(ph);
      pane._contentBuilt = true;
    }
    // contentBuilder tabs are built lazily on first activation (see activateTab)

    return pane;
  }

  // ── Reorder ────────────────────────────────────────────────────────────────

  _reorderTab(srcId, targetId) {
    var srcIdx = this._indexById(srcId);
    var tgtIdx = this._indexById(targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    // Swap in data array
    var srcEntry = this._tabs.splice(srcIdx, 1)[0];
    this._tabs.splice(tgtIdx, 0, srcEntry);

    // Re-append buttons in new order
    var self = this;
    this._tabs.forEach(function(t) { self._strip.appendChild(t.btnEl); });
  }

  // ── Context menu ───────────────────────────────────────────────────────────

  _showContextMenu(id, x, y) {
    var self = this;
    // Remove any existing menu
    var old = document.getElementById('_ith-ctx-menu');
    if (old) old.remove();

    var idx   = this._indexById(id);
    var total = this._tabs.length;

    var menu = document.createElement('div');
    menu.id = '_ith-ctx-menu';
    menu.className = 'panel-popup';
    menu.style.cssText = 'position:fixed;z-index:9999;padding:4px;min-width:160px;font-size:12px;';
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';

    var items = [
      { label: 'Close',            fn: function() { self.removeTab(id); } },
    ];
    if (total > 1) {
      items.push({ label: 'Close others', fn: function() {
        self._tabs.slice().forEach(function(t) { if (t.id !== id) self.removeTab(t.id); });
      }});
    }
    if (idx < total - 1) {
      items.push({ label: 'Close to the right', fn: function() {
        self._tabs.slice(idx + 1).forEach(function(t) { self.removeTab(t.id); });
      }});
    }
    if (idx > 0) {
      items.push({ label: 'Close to the left', fn: function() {
        self._tabs.slice(0, idx).forEach(function(t) { self.removeTab(t.id); });
      }});
    }

    items.forEach(function(item) {
      var row = document.createElement('div');
      row.className = 'menu-item-panel';
      row.style.cssText = 'padding:5px 10px;cursor:pointer;border-radius:6px;';
      row.textContent = item.label;
      row.addEventListener('click', function() { menu.remove(); item.fn(); });
      menu.appendChild(row);
    });

    document.body.appendChild(menu);

    // Close on outside click
    setTimeout(function() {
      document.addEventListener('click', function _close() {
        menu.remove();
        document.removeEventListener('click', _close);
      });
    }, 0);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _indexById(id) {
    for (var i = 0; i < this._tabs.length; i++) {
      if (this._tabs[i].id === id) return i;
    }
    return -1;
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('_ith-styles')) return;
    var st = document.createElement('style');
    st.id = '_ith-styles';
    st.textContent = [
      /* Hide scrollbar on strip */
      '.ith-tab::-webkit-scrollbar { display:none; }',
      /* Drag-over highlight */
      '.ith-drag-over { box-shadow: inset 0 0 0 1px var(--qc-color-secondary, #e8a44a) !important; }',
      /* Active tab — underline indicator, no background fill, no rounded top */
      '.tab.tab--active.ith-tab {',
      '  color: var(--qc-color-text-primary, #ccc);',
      '  background: transparent;',
      '  border-bottom: 1px solid color-mix(in srgb, var(--qc-color-secondary, #e8a44a) 80%, transparent);',
      '  border-radius: 0;',
      '}',
      /* Remove SVG corner decorations — only for ith-tab instances */
      '.tab.tab--active.ith-tab::before, .tab.tab--active.ith-tab::after { display: none !important; }',
      /* Active tab icon — full opacity */
      '.tab.tab--active.ith-tab .ith-icon { opacity: 1.0 !important; }',
      /* Inactive tab — muted text, transparent underline placeholder */
      '.tab.ith-tab {',
      '  color: var(--qc-color-text-info, #666);',
      '  background: transparent;',
      '  border-bottom: 1px solid transparent;',
      '  border-radius: 0;',
      '  box-sizing: border-box;',
      '  transition: color 120ms, border-color 120ms;',
      '}',
      /* Inactive tab icon — muted opacity */
      '.tab.ith-tab .ith-icon { opacity: 0.6; }',
      /* Hover — brighten text */
      '.tab.ith-tab:hover { color: var(--qc-color-text-primary, #ccc); }',
    ].join('\n');
    document.head.appendChild(st);
  }
}

// ── Static helper: expose iconForFile so tab_holder can use it standalone ──
// (IDEFolderTree.iconForFile is defined in folder_tree.js)
// Fallback if folder_tree.js not loaded:
if (typeof IDEFolderTree === 'undefined') {
  window.IDEFolderTree = window.IDEFolderTree || {};
}
if (typeof IDEFolderTree.iconForFile !== 'function') {
  IDEFolderTree.iconForFile = function(filePath) {
    var ext = (filePath || '').split('.').pop().toLowerCase();
    var map = {
      py:'images/icons/file_extensions/python.png',
      js:'images/icons/file_extensions/javascript.png',
      ts:'images/icons/file_extensions/typescript.png',
      html:'images/icons/file_extensions/html.png',
      css:'images/icons/file_extensions/css.png',
      json:'images/icons/file_extensions/json.png',
      md:'images/icons/coolicons/File/File_Document.png',
      yaml:'images/icons/coolicons/File/File_Settings.png',
      yml:'images/icons/coolicons/File/File_Settings.png',
    };
    return map[ext] || 'images/icons/coolicons/File/Note.png';
  };
}

if (typeof module !== 'undefined') module.exports = { IDETabHolder };
