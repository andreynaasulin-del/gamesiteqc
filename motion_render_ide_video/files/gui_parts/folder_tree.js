/**
 * IDEFolderTree
 * ─────────────────────────────────────────────────────────────────────────────
 * File tree component matching bridge file-selection.js icon approach:
 *   - Folders: CSS mask on /_ide/images/icons/folder.png tinted with --qc-color-emphase
 *   - Files:   /_ide/images/icons/file_extensions/{icon} via getIconForFilename()
 *   - Chevrons: coolicons Arrow/Chevron_Right + Chevron_Down
 *
 * Usage:
 *   const tree = new IDEFolderTree({ nodes: [...] });
 *   tree.mount(containerEl);
 */

// ── Icon map (mirrors file-selection.js getIconForFilename exactly) ──────────
function _getIconForFilename(filename) {
  var lower = filename.toLowerCase();

  var exact = {
    'dockerfile': 'docker.png', 'docker-compose.yml': 'dockercompose.png',
    'docker-compose.yaml': 'dockercompose.png', 'package.json': 'npm.png',
    'package-lock.json': 'npmlock.png', 'yarn.lock': 'yarnlock.png',
    'requirements.txt': 'python.png', 'setup.py': 'python.png',
    'pyproject.toml': 'python.png', 'pipfile': 'pipfile.png',
    'makefile': 'makefile.png', 'readme.md': 'readme.png',
    'license': 'license.png', 'changelog.md': 'changelog.png',
    'go.mod': 'go.png', 'go.sum': 'go.png',
    'cargo.toml': 'cargo.png', 'cargo.lock': 'cargo.png',
    'pom.xml': 'maven.png', 'build.gradle': 'gradle.png',
    'cmakelists.txt': 'cmakelists.png',
  };
  if (exact[lower]) return exact[lower];
  if (lower.startsWith('dockerfile')) return 'docker.png';
  if (lower.startsWith('makefile')) return 'makefile.png';

  var ext = lower.lastIndexOf('.') !== -1 ? lower.substring(lower.lastIndexOf('.') + 1) : '';
  var extMap = {
    py: 'python.png', js: 'js.png', ts: 'typeScript.png',
    jsx: 'jsx.png', tsx: 'typeScript.png', java: 'java.png',
    c: 'c.png', cpp: 'cpp.png', cc: 'cpp.png', h: 'c.png', hpp: 'cpp.png',
    cs: 'csharp.png', php: 'php.png', rb: 'ruby.png', go: 'go.png',
    rs: 'rust.png', swift: 'swift.png', kt: 'kotlin.png', lua: 'lua.png',
    html: 'html.png', htm: 'html.png', css: 'css.png', scss: 'scss.png',
    sass: 'sass.png', less: 'less.png', vue: 'vue.png', svelte: 'svelte.png',
    md: 'markdown.png', markdown: 'markdown.png',
    json: 'json.png', yaml: 'yaml.png', yml: 'yaml.png', toml: 'toml.png',
    ini: 'config.png', cfg: 'config.png', conf: 'config.png', env: 'config.png',
    xml: 'xml.png', sql: 'sql.png', sh: 'shell.png', bash: 'shell.png',
    png: 'png.png', jpg: 'jpg.png', jpeg: 'jpg.png', gif: 'gif.png',
    svg: 'svg.png', ico: 'favicon.png', webp: 'webp.png',
    pdf: 'pdf.png', txt: 'text.png',
    zip: 'archive.png', rar: 'archive.png', gz: 'archive.png', tar: 'archive.png',
    mp3: 'audio.png', wav: 'audio.png',
    mp4: 'video.png', mov: 'video.png', mkv: 'video.png', webm: 'video.png',
    ttf: 'font.png', otf: 'font.png', woff: 'font.png', woff2: 'font.png',
    r: 'r.png', scala: 'scala.png',
  };
  return extMap[ext] || 'default.png';
}

// ── Styles (injected once) ───────────────────────────────────────────────────
(function _ensureFolderTreeStyles() {
  if (document.getElementById('__ide-folder-tree-css')) return;
  var s = document.createElement('style');
  s.id = '__ide-folder-tree-css';
  s.textContent = `
.ift-root {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  height: 100%;
  padding: 2px 0;
  user-select: none;
}

.ift-row {
  display: flex;
  align-items: center;
  height: 22px;
  padding: 0 4px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 100ms;
  gap: 2px;
}
.ift-row:hover { background: rgba(255,255,255,0.05); }
.ift-row--active { background: var(--qc-color-bg-secondary2, rgba(255,255,255,0.09)) !important; }

/* Indent spacer */
.ift-indent { width: 14px; flex-shrink: 0; }

/* Chevron — same mask approach as file-selection.js */
.ift-chevron {
  width: 14px; height: 14px;
  flex-shrink: 0;
  background-color: var(--qc-color-text-secondary, #888);
  -webkit-mask-size: 10px;
  mask-size: 10px;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  transition: transform 120ms;
}
.ift-chevron--expanded {
  -webkit-mask-image: url('/_ide/images/icons/coolicons/Arrow/Chevron_Down.png');
  mask-image: url('/_ide/images/icons/coolicons/Arrow/Chevron_Down.png');
}
.ift-chevron--collapsed {
  -webkit-mask-image: url('/_ide/images/icons/coolicons/Arrow/Chevron_Right.png');
  mask-image: url('/_ide/images/icons/coolicons/Arrow/Chevron_Right.png');
}
.ift-chevron--empty { opacity: 0; pointer-events: none; }

/* Folder icon — tinted with emphase color (orange), same as file-selection.js */
.ift-icon {
  width: 14px; height: 14px;
  flex-shrink: 0;
  margin-right: 4px;
}
.ift-icon--folder {
  background-color: var(--qc-color-emphase, #ff8c00);
  -webkit-mask-image: url('/_ide/images/icons/folder.png');
  mask-image: url('/_ide/images/icons/folder.png');
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}
.ift-icon--file {
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

/* Label */
.ift-label {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--qc-color-text-primary, #ccc);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ift-row--active .ift-label { color: var(--qc-color-text-light, #fff); }
`;
  document.head.appendChild(s);
})();

// ── IDEFolderTree class ──────────────────────────────────────────────────────
class IDEFolderTree {
  /**
   * @param {object} opts
   * @param {Array}  opts.nodes    - Flat node list or nested tree (overrides scenario)
   *   Flat format:   { name, path, type:'folder'|'file', depth, active? }
   *   Nested format: { name, type:'folder'|'file', active?, children:[] }
   * @param {object} opts.scenario - Raw scenario YAML object; if it has a
   *   `project` key the tree is built from it (ignored when opts.nodes is set).
   *
   * Scenario `project` format:
   *   project:
   *     project_name: NeuralForge        # root folder label
   *     root_path: /projects/NeuralForge # optional — shown in status bar etc.
   *     files:                           # relative paths from project root
   *       - src/main.py                  # active file (first one by default)
   *       - src/model/transformer.py
   *       - src/config/model_config.yaml
   *       - README.md
   *     selected: src/main.py            # optional — which file starts active
   */
  constructor(opts) {
    opts = opts || {};
    var nodes = opts.nodes;
    if (!nodes && opts.scenario && opts.scenario.project) {
      nodes = IDEFolderTree.parseProjectFromScenario(opts.scenario.project);
    }
    this._rawNodes = nodes || _defaultProjectTree();
    this._expanded = new Set();
    this._active = null;
    this._el = null;

    // Pre-expand top-level folders and their first-level children
    this._rawNodes.forEach(function(n) {
      if (n.type === 'folder') {
        this._expanded.add(n.path || n.name);
        if (n.children) n.children.forEach(function(c) {
          if (c.type === 'folder') this._expanded.add(c.path || c.name);
        }, this);
      }
    }, this);
  }

  mount(container) {
    this._el = document.createElement('div');
    this._el.className = 'ift-root';
    container.appendChild(this._el);
    this._render();
  }

  _render() {
    if (!this._el) return;
    this._el.innerHTML = '';
    var self = this;
    var nodes = this._flattenNodes();
    nodes.forEach(function(node) {
      self._el.appendChild(self._buildRow(node));
    });
  }

  // Flatten nested tree into visible rows respecting expanded state
  _flattenNodes() {
    var result = [];
    var self = this;

    function walk(nodes, depth) {
      // Sort: folders first, then files, alphabetically
      var sorted = nodes.slice().sort(function(a, b) {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      sorted.forEach(function(n) {
        var path = n.path || (depth + ':' + n.name);
        var hasChildren = n.type === 'folder' && n.children && n.children.length > 0;
        result.push({ name: n.name, type: n.type, path: path, depth: depth,
          hasChildren: hasChildren, active: !!n.active });
        if (n.type === 'folder' && hasChildren && self._expanded.has(path)) {
          walk(n.children, depth + 1);
        }
      });
    }

    walk(this._rawNodes, 0);
    return result;
  }

  _buildRow(node) {
    var self = this;
    var row = document.createElement('div');
    row.className = 'ift-row' + (node.active ? ' ift-row--active' : '');

    // Indent spacers
    for (var i = 0; i < node.depth; i++) {
      var sp = document.createElement('div');
      sp.className = 'ift-indent';
      row.appendChild(sp);
    }

    // Chevron
    var chev = document.createElement('div');
    if (node.type === 'folder') {
      chev.className = 'ift-chevron ' + (node.hasChildren
        ? (this._expanded.has(node.path) ? 'ift-chevron--expanded' : 'ift-chevron--collapsed')
        : 'ift-chevron--empty');
    } else {
      chev.className = 'ift-chevron ift-chevron--empty';
    }
    row.appendChild(chev);

    // Icon
    var icon = document.createElement('div');
    icon.className = 'ift-icon';
    if (node.type === 'folder') {
      icon.classList.add('ift-icon--folder');
    } else {
      icon.classList.add('ift-icon--file');
      icon.style.backgroundImage = "url('/_ide/images/icons/file_extensions/" + _getIconForFilename(node.name) + "')";
    }
    row.appendChild(icon);

    // Label
    var lbl = document.createElement('div');
    lbl.className = 'ift-label';
    lbl.textContent = node.name;
    row.appendChild(lbl);

    // Click
    row.addEventListener('click', function() {
      if (node.type === 'folder' && node.hasChildren) {
        if (self._expanded.has(node.path)) {
          self._expanded.delete(node.path);
        } else {
          self._expanded.add(node.path);
        }
        self._render();
      } else if (node.type === 'file') {
        // Mark active
        self._rawNodes = _setActive(self._rawNodes, node.path);
        self._render();
      }
    });

    return row;
  }

  /**
   * Programmatically select (highlight) a file by its relative path.
   * Expands all parent folders so the file is visible.
   * @param {string} relPath - e.g. 'src/model/transformer.py'
   */
  selectFile(relPath) {
    if (!relPath) return;
    var parts = relPath.split('/');
    for (var i = 1; i < parts.length; i++) {
      this._expanded.add(parts.slice(0, i).join('/'));
    }
    this._rawNodes = _setActive(this._rawNodes, relPath);
    this._render();
  }

  /**
   * Replace the current tree with a new project from a scenario project config.
   * @param {object} projectCfg - same shape as YAML `project:` key
   */
  setProject(projectCfg) {
    this._rawNodes = IDEFolderTree.parseProjectFromScenario(projectCfg);
    this._expanded = new Set();
    this._rawNodes.forEach(function(n) {
      if (n.type === 'folder') {
        this._expanded.add(n.path || n.name);
        if (n.children) n.children.forEach(function(c) {
          if (c.type === 'folder') this._expanded.add(c.path || c.name);
        }, this);
      }
    }, this);
    this._render();
  }

  /**
   * Build a nested tree from a scenario `project` config object.
   *
   * @param {object} cfg
   * @param {string}   cfg.project_name  - root folder display name
   * @param {string}   [cfg.root_path]   - absolute path (informational only)
   * @param {string[]} cfg.files         - relative paths from project root
   * @param {string}   [cfg.selected]    - relative path of initially active file
   * @returns {Array} nested node tree ready for IDEFolderTree
   */
  static parseProjectFromScenario(cfg) {
    if (!cfg) return _defaultProjectTree();
    var rootName = cfg.project_name || 'Project';
    var files    = cfg.files || [];
    var selected = cfg.selected || (files.length ? files[0] : null);

    // Build nested map from flat file paths
    var rootChildren = {};

    files.forEach(function(relPath) {
      var parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
      var cur = rootChildren;
      parts.forEach(function(part, idx) {
        var isLast = idx === parts.length - 1;
        if (!cur[part]) {
          cur[part] = {
            name: part,
            type: isLast ? 'file' : 'folder',
            children: {},
            _relPath: parts.slice(0, idx + 1).join('/'),
          };
        }
        cur = cur[part].children;
      });
    });

    function mapToNodes(map) {
      return Object.values(map).map(function(n) {
        var node = {
          name:   n.name,
          type:   n.type,
          path:   n._relPath,
          active: !!(selected && n._relPath === selected),
        };
        if (n.type === 'folder') {
          node.children = mapToNodes(n.children);
        }
        return node;
      }).sort(function(a, b) {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }

    return [{
      name:     rootName,
      type:     'folder',
      path:     rootName,
      children: mapToNodes(rootChildren),
    }];
  }
}

// Mark a node active by path (recursive)
function _setActive(nodes, activePath) {
  return nodes.map(function(n) {
    var path = n.path || n.name;
    var updated = Object.assign({}, n, { active: path === activePath });
    if (n.children) updated.children = _setActive(n.children, activePath);
    return updated;
  });
}

// Default NeuralForge project tree
function _defaultProjectTree() {
  return [
    { name: 'NeuralForge', type: 'folder', path: 'NeuralForge', children: [
      { name: 'src', type: 'folder', path: 'NeuralForge/src', children: [
        { name: 'main.py',    type: 'file', path: 'NeuralForge/src/main.py', active: true },
        { name: 'model.py',   type: 'file', path: 'NeuralForge/src/model.py' },
        { name: 'utils.py',   type: 'file', path: 'NeuralForge/src/utils.py' },
        { name: 'trainer.py', type: 'file', path: 'NeuralForge/src/trainer.py' },
      ]},
      { name: 'resources', type: 'folder', path: 'NeuralForge/resources', children: [
        { name: 'config.yaml',  type: 'file', path: 'NeuralForge/resources/config.yaml' },
        { name: 'schema.json',  type: 'file', path: 'NeuralForge/resources/schema.json' },
      ]},
      { name: 'tests', type: 'folder', path: 'NeuralForge/tests', children: [
        { name: 'test_model.py',   type: 'file', path: 'NeuralForge/tests/test_model.py' },
        { name: 'test_trainer.py', type: 'file', path: 'NeuralForge/tests/test_trainer.py' },
      ]},
      { name: 'README.md',      type: 'file', path: 'NeuralForge/README.md' },
      { name: 'requirements.txt', type: 'file', path: 'NeuralForge/requirements.txt' },
      { name: 'pyproject.toml', type: 'file', path: 'NeuralForge/pyproject.toml' },
      { name: 'Makefile',       type: 'file', path: 'NeuralForge/Makefile' },
      { name: 'Dockerfile',     type: 'file', path: 'NeuralForge/Dockerfile' },
    ]},
  ];
}

if (typeof module !== 'undefined') module.exports = { IDEFolderTree };
