# motion_render_ide_video

**Type:** skill  
**Alias:** motion_render_ide_video  
**Subtype:** motion

## Purpose

HTML/JS toolkit for creating high-quality IDE emulation videos for demos and marketing.
Renders a pixel-perfect mock of the QuadCode AI IDE in the browser, animates it with
a scenario script, and records it to MP4 via the bridge recorder.

## What's inside (`files/`)

| File | Role |
|---|---|
| `message_box.html` | Standalone chat input panel — simplest demo unit |
| `whole_ide_render_mock.html` | Full IDE mock (header + panels + chat + browser) |
| `bg_animations.js` | Shared background effects library (Neural Net, Aurora, Gradient, Vortex, …) |
| `gui_parts/window_wrapper.js` | IDE window container with scale/resize |
| `gui_parts/header.js` | macOS-style header with panel toggle buttons |
| `gui_parts/status_bar.js` | Bottom status bar |
| `gui_parts/main_panel.js` | 3-column layout (left chat / center editor+browser / right tree) |
| `gui_parts/message_log.js` | Chat history with user/agent messages, tool calls, action rows |
| `gui_parts/message_box.js` | Chat input panel (agent selector, textarea, send buttons) |
| `gui_parts/action_row.js` | Tool-call progress row with timer and spinner |
| `gui_parts/fake_console.js` | `IDEFakeConsole` — animated terminal emulator: shell demo + Claude Code demo modes, typewriter output, blinking cursor |
| `gui_parts/subagents_list_panel.js` | `IDESubagentsListPanel` — Actions tab panel mimicking Python subagent call cards: dual avatars, status bar, tool text, spinner/checkmark/fail, animated transitions |
| `gui_parts/folder_tree.js` | File tree panel with tinted folder/file icons |
| `gui_parts/tab_holder.js` | Tab bar component (editor/browser tabs) |
| `gui_parts/browser.js` | Pseudo-browser panel (video or iframe content) |
| `gui_parts/camera.js` | 3D camera controller — zoom/pan/tilt + animation presets |
| `gui_parts/background.js` | Background panel UI (wraps bg_animations.js) |
| `gui_parts/scenario.js` | YAML-as-JS scenario runner (timed actions: send_message, begin_answer, camera_pan_to, …) |
| `gui_parts/labels.js` | Floating label overlay — text with gradient emphasis OR image, viewport/scene space, 9 animation effects |
| `gui_parts/custom_window.js` | `IDECustomWindow` — macOS-style floating window: traffic-light buttons, drag, resize, show/hide with fade, setPosition/setSize |
| `gui_parts/viewer_video.js` | `IDEViewerVideo` — video viewer via bridge `QC.media.VideoPlayer` or embedded HTML5 `<video>`; wraps into `IDECustomWindow` |
| `gui_parts/viewer_image.js` | `IDEViewerImage` — image viewer with fit modes (contain/cover/fill/actual), optional zoom+pan, wraps into `IDECustomWindow` |
| `gui_parts/viewer_sound.js` | `IDEViewerSound` — audio viewer via bridge `QC.media.SoundPlayer` or embedded HTML5 `<audio>` with waveform UI; wraps into `IDECustomWindow` |
| `assets/qcai_logo_text_only.png` | Quadcode.ai text-only wordmark — white on transparent |
| `assets/qcai_wordmark.png` | Quadcode.ai full wordmark — icon (left) + white text (right) |
| `assets/qcai_icon.png` | Quadcode.ai icon only — colored gradient mark |
| `gui_parts/recording.js` | Record button + bridge integration, auto-stop at scenario end |
| `scenarios/test_scenario.yaml` | Sample scenario YAML |

## Scenario actions reference

All actions are placed under `actions:` in the YAML, each with an `at:` timestamp.

#### `at:` time formats

| Format | Example | Description |
|---|---|---|
| Absolute ms | `at: 5000` | Fire at exactly 5000 ms from scenario start |
| Relative ms | `at: "+500"` | Fire 500 ms after the **previous** action's resolved time |
| Relative zero | `at: "+0"` | Fire at the same time as the previous action (parallel) |

Relative markers chain — each `+N` adds to the previously resolved time, not the original `at`.  
Mix absolute and relative freely in the same scenario.

```yaml
- at: 5000        # absolute — 5000ms
  type: camera_move
  zoom: 0.9

- at: "+500"      # → 5500ms
  type: camera_anim
  name: float

- at: "+1000"     # → 6500ms
  type: send_message
  text: Hello

- at: "+0"        # → 6500ms (parallel with previous)
  type: set_status
  status: Typing…
```

| Action | Key params | Description |
|---|---|---|
| `append_chat_message` | `role?`, `name?`, `role_label?`, `text`, `model?`, `time?`, `avatar?` | Instantly append a message to the chat log **without** entrance animation or typewriter effect. `role`: `user`\|`agent`\|`status` (default `user`). Use at `at: 0` to pre-populate history before animated turns begin. |
| `clear_chat_log` | _(none)_ | Instantly clear all messages from the chat log. |
| `send_message` | `text`, `type_delay?` | Typewrite text into chat box, then submit |
| `begin_answer` | `tool_calls[]`, `answer`, `action_delay?`, `model?` | Agent turn: spinner → stream tool calls → typewrite reply |
| `switch_tab` | `tab_id` | Activate a browser tab by id |
| `switch_video` | `panel_id?`\|`tab_id?`, `video`, `fade?`, `loop?`, `muted?`, `controls?`, `fit?`, `fit_to_video?` | Replace video source in a browser tab or custom center panel. `fit_to_video: true` automatically resizes the IDE window to match the new video's aspect ratio immediately. |
| `bg_video_play` | `video` (required), `mode?` (`behind`\|`overlay`), `loop?`, `muted?`, `fade?` | Play a video that fills the viewport frame without any 3D rotation/scale. Aspect ratio preserved via `object-fit:cover`. `behind` (default) renders under the IDE; `overlay` covers the IDE — use for transitions. `fade` = fade-in ms. |
| `bg_video_stop` | `fade?` | Stop and hide the background video. `fade` = fade-out ms. |
| `clear_browser` | `panel_id?`\|`tab_id?`, `label?`, `icon?` | Remove content from a browser tab or custom center panel and show its placeholder. Defaults to `br-video`. |
| `fit_to_video` | `panel_id?`\|`tab_id?` | Resize the IDE window height so the selected video's content area matches its aspect ratio exactly. Requires a loaded video; use `switch_video.fit_to_video: true` or a following `at: "+0"` action for immediate fitting. |
| `set_status` | `status?`, `branch?` | Update status bar text / branch label |
| `shadow_gradient_show` | `id?`, `direction?`, `dx?`, `dy?`, `angle?`, `x?`, `y?`, `opacity?`, `radius?`, `duration?`, `color?` | Overlay a gradient shadow on the recording frame to improve text legibility. Direction priority: `x`+`y` → radial; `dx`+`dy` → vector (any angle); `angle` → degrees (0=top→down); `direction` → named preset (`top`\|`bottom`\|`left`\|`right`\|`top_left`\|`top_right`\|`bottom_left`\|`bottom_right`). `opacity` 0–1 (default `0.7`), `radius` falloff % (default `60`), `color` RGB string (default `'0,0,0'`). |
| `shadow_gradient_hide` | `id?`, `duration?` | Fade out and remove a gradient overlay. |
| `shadow_gradient_update` | `id?`, `opacity?`, `radius?`, `duration?`, + any direction param | Update opacity/radius/direction of an existing gradient with transition. |
| `camera_move` | `zoom?`, `tx?`, `ty?`, `rx?`, `ry?`, `rz?`, `duration?`, `easing?` | Smooth move to target camera state. `tx`/`ty` translate the IDE in screen pixels (positive `ty` = down, positive `tx` = right). `easing`: `linear`\|`ease_in`\|`ease_out`\|`ease_in_out`\|`spring`\|`bounce`. |
| `camera_anim` | `name` | Start animation preset (`float`\|`swing`\|`tilt`\|`breathe`\|`drift`\|`wobble`\|`pendulum`\|`none`) |
| `camera_reset` | `duration?` | Smooth reset camera to identity |
| `camera_viewport` | `mode` | Switch viewport mode (`free`\|`desktop`\|`r169`\|`r916`\|`mobile`) |
| `camera_pan_to` | `target`, `margin?`, `zoom?`, `duration?`, `tilt?`, `clamp?` | Auto-fit camera to a named container. **Built-in targets**: `message_box` \| `chat_log` \| `result_window` \| `video_result` \| `ide_full`. **Floating window**: `window:<viewer_id>` (e.g. `window:vw_video`). `margin` = fraction of viewport to leave as padding each side (default `0.12`). `zoom` overrides auto-computed zoom. `tilt: false` disables subtle 3D tilt. `clamp` (default `true`, IDE-internal targets only) slides the shot back so the frame never runs past the edge of the IDE window — centring on a narrow side panel otherwise fills a third of the frame with bare background; `clamp: false` restores the raw centring. |
| `camera_anim` `amplitude` | number | Scales a preset's motion: `1` = as authored, `0.4` = 40 %. Starting an anim no longer cancels a pan in progress — the two add up. |
| `ide_hide` | `duration?`, `record_while_hidden?` | Fade out (or instantly hide) the IDE window — background + labels stay visible |
| `ide_show` | `duration?` | Fade the IDE window back in. `duration > 0` always fades from `opacity:0` — works even if IDE was already visible. `duration: 0` = instant. |
| `viewer_open` | `id`, `viewer` (`video`\|`image`\|`sound`), `src?`, `mode?`, `autoplay?`, `loop?`, `muted?`, `controls?`, `volume?`, `fit?`, `window?` (title/width/height/x/y/…), `show?`, `show_duration?` | Open a floating viewer window (video/image/audio). Stored by `id` for later control. **Video `mode`**: `bridge` (QC.media.VideoPlayer with controls/progress bar), `embedded` (native HTML5 `<video>`), `fake` (raw video fills window, no controls, autoplay+muted+loop forced — use when window should look like app content, not a player). **Sound `mode`**: `bridge` (QC.media.SoundPlayer) or `embedded`. |
| `viewer_show` | `id`, `duration?` | Fade-in a previously opened viewer window |
| `viewer_hide` | `id`, `duration?` | Fade-out a previously opened viewer window |
| `viewer_set_source` | `id`, `src`, `name?` | Change the media source of an open viewer |
| `select_file` | `path` | Highlight a file in the right-panel folder tree by its relative path (e.g. `src/model/transformer.py`). Expands all parent folders automatically. |
| `set_background` | `effect?`, `video?`, `loop?`, `autoplay?`, `mute?`, `fit_to_viewport?`, `preserve_aspect?`, `mode?`, `fade?`, `dim?` | Change the background. Pass `effect` for a named animation, or `video` for a file that plays full-viewport (no 3D transform). `dim` (0–1) applies a black overlay on top of the video: `1.0` = fully opaque (default when `dim` is set), `0.5` = 50% dimming, `0` = no overlay. Omit `dim` to leave overlay unchanged. Cross-fades seamlessly when called again. Stops on scenario end. |
| `set_dim` | `dim`, `fade?` | Adjust the black dimming overlay on the background video at runtime. `dim`: 0 = transparent → 1 = fully black. `fade`: transition ms (default 400). Use to brighten/darken a running bg video mid-scenario. |
| `browser_open_tab` | `label`, `url?`, `video?`, `loop?`, `controls?`, `activate?`, `switch_panel?` | Open a new tab in the Web browsers section. Set `url` for a website or `video` for a video file. `label` sets the tab name. `switch_panel: false` skips switching the central panel (useful if already on Web browsers). |
| `open_file` | `path`, `label?`, `unsaved?`, `activate?`, `switch_panel?` | Open a file in the File editors tab. `path` is relative to project root. Also highlights the file in the folder tree. `unsaved: true` shows the unsaved dot. `switch_panel: false` skips switching the central panel. |
| `switch_main_tab` | `tab` | Switch the active tab in the central section. Values: `'Actions'` \| `'File editors'` \| `'Meta editors'` \| `'Web browsers'`. |
| `switch_left_tab` | `tab` | Switch the active tab in the left panel. Values: `'Chat'` \| any custom subpanel label (e.g. `'Planning'`). |
| `console_mode` | `mode` | Switch the bottom console between `'terminal'` and `'chat'` modes. |
| `terminal_type` | `text`, `delay?` | Type a line of text into the terminal (typewriter effect). `delay` = ms between chars (default 40). |
| `console_demo` | `demo` | Run a canned terminal animation. `demo: shell` — bash commands sequence; `demo: claude` — Claude Code session with tool calls and replies. |
| `add_subagent_call` | `id`, `caller`, `caller_name?`, `caller_role?`, `target`, `role`, `name`, `question`, `status?`, `switch_tab?` | Add a new subagent call card to the Actions tab. `id` is used to reference the card in later `update_subagent_call` actions. `caller`/`target` are avatar keys (e.g. `po`, `dev`, `designer`); `caller_name`/`caller_role` show the caller's own identity next to its avatar (mirrors the callee's `name`/`role`). `switch_tab: true` auto-switches to the Actions tab. |
| `update_subagent_call` | `id`, `tool?`, `elapsed?`, `finish?`, `fail?` | Update an existing subagent card. `tool` sets current tool text with fade animation. `finish: true` marks it completed (spinner → ✓, teal bar). `fail: true` marks it failed (spinner → ✗, red bar). `elapsed` sets the time string shown. |
| `show_right_panel` | _(none)_ | Show the right file-tree panel. |
| `hide_right_panel` | _(none)_ | Hide the right file-tree panel. |
| `set_main_window_size` | `width?`, `height?` | Set native IDE frame size in px. Absolute value or relative delta (`"+80"`/`"-80"`). Clamped to min `720×480`. |
| `set_side_panel_width` | `side`, `width` | Set left/right panel width (%). `side`: `left`\|`right`. `width`: absolute `%` or relative delta (`"+5"`/`"-5"`). Clamped to `10–50%`. |
| `stop_record` | _(none)_ | **Explicitly end the scenario and trigger recording stop immediately.** Place this as the last action with a precise `at` time. Without it, recording stops ~500ms after the last scheduled action (fallback). With it, stop fires within 200ms — no idle delay. |
| `audio_play` | `channel` (`narration`\|`soundtrack`\|custom), `src?`, `volume?`, `loop?`, `fade_in?` | Play or resume an audio channel. `src` swaps the source. `fade_in` = fade-in ms. |
| `audio_stop` | `channel`, `fade_out?` | Stop an audio channel. `fade_out` = fade-out ms before stopping. |
| `label_show` | `id`, `text`\|`image`, `style?`, `scale?`, `width?`, `max_width?`, `height?`, `space?`, `x?`, `y?`, `anchor?`, `anim_in?`, `anim_out?`, `duration?`, `bg?`, `bg_radius?`, `bg_padding?`, `final_position?`, `move_duration?`, `move_easing?` | Show (or create+show) a floating text or image label. `anchor: right` places the right edge of the label at `x` (grows leftward, never clips). Use `width` or `max_width` (CSS strings e.g. `'300px'`) to control line length and prevent short wrapped lines. Optional `final_position: {x, y}` glides the label to a new position after `anim_in` completes. |
| `label_move` | `id`, `x?`, `y?`, `move_duration?`, `move_easing?` | Smoothly move a visible label to a new position (CSS strings for viewport, px numbers for scene). |
| `label_hide` | `id`, `duration?` | Hide a label using its `anim_out` effect |
| `label_set` | `id`, `text?`, `x?`, `y?` | Update label text/position while visible (no animation) |

### Console / Terminal

`IDEFakeConsole` (`gui_parts/fake_console.js`) powers the bottom console panel.  
Two modes: **terminal** (bash-style) and **chat** (message log).

| Action | Key params | Description |
|---|---|---|
| `console_mode` | `mode` | `'terminal'` or `'chat'` |
| `terminal_type` | `text`, `delay?` | Typewrite a single line. `delay` = ms/char (default 40). |
| `console_demo` | `demo` | `'shell'` — runs a bash session; `'claude'` — runs a Claude Code session with tool calls and streamed reply. |

**Example — terminal sequence:**
```yaml
  - at: 5000
    type: console_mode
    mode: terminal

  - at: 5200
    type: terminal_type
    text: "git status"

  - at: 6000
    type: terminal_type
    text: "npm run build"
    delay: 35

  # Or run the full canned Claude Code demo in one action:
  - at: 8000
    type: console_demo
    demo: claude
```

---

### Subagent call cards (Actions tab)

`IDESubagentsListPanel` (`gui_parts/subagents_list_panel.js`) renders animated subagent call cards in the **Actions** tab, mimicking the Python IDE panel.  
Each card shows: caller avatar + name/role → arrow → callee avatar + name/role, question text, current tool, elapsed time, and status bar. Both sides of the call are fully identified — not just the callee — matching the current caller/callee identity layout used across chat messages and the agent selector.

**Status values:** `executing` (blue bar + spinning icon) → `completed` (teal bar + ✓) or `failed` (red bar + ✗).

**`add_subagent_call` params:**

| Param | Type | Description |
|---|---|---|
| `id` | string | Unique handle for subsequent `update_subagent_call` |
| `caller` | string | Caller avatar key: `po`, `dev`, `designer`, `creative`, … |
| `caller_name` | string | Caller display name (e.g. `PO`). Defaults to a title-cased `caller` key if omitted |
| `caller_role` | string | Role label shown under the caller avatar (e.g. `Product Owner`). Omit to hide the role line |
| `target` | string | Callee avatar key |
| `role` | string | Role label shown under callee avatar (e.g. `Developer`) |
| `name` | string | Agent display name (e.g. `Cody`) |
| `question` | string | Task description text |
| `status` | string | Initial status (default `executing`) |
| `switch_tab` | boolean | Auto-switch central panel to Actions tab (default `false`) |

**`update_subagent_call` params:**

| Param | Type | Description |
|---|---|---|
| `id` | string | Card handle from `add_subagent_call` |
| `tool` | string | Update current tool text with fade animation |
| `elapsed` | string | Override elapsed time label (e.g. `'0:05s'`) |
| `finish` | boolean | Mark completed: teal bar, spinner → ✓, card flash |
| `fail` | boolean | Mark failed: red bar, spinner → ✗, card flash |

**Example — parallel subagent calls:**
```yaml
  # Switch to Actions tab and spawn Cody
  - at: 20000
    type: add_subagent_call
    id: call_cody
    caller: po
    caller_name: PO
    caller_role: Product Owner
    target: dev
    role: Developer
    name: Cody
    question: "Implement boss encounter trigger in DungeonGen.cpp"
    status: executing
    switch_tab: true

  # Cody searches, then edits
  - at: 20800
    type: update_subagent_call
    id: call_cody
    tool: "ToolVectorSearch  boss encounter"

  - at: 21800
    type: update_subagent_call
    id: call_cody
    tool: "ToolTextFileEdit  game/world/DungeonGen.cpp"

  # Spawn Lumi in parallel
  - at: 22000
    type: add_subagent_call
    id: call_lumi
    caller: po
    target: designer
    role: Designer
    name: Lumi
    question: "Generate boss room concept art"
    status: executing

  - at: 22800
    type: update_subagent_call
    id: call_lumi
    tool: "Generating dungeon boss room…"

  # Both finish
  - at: 23800
    type: update_subagent_call
    id: call_cody
    finish: true
    elapsed: "0:03s"

  - at: 24600
    type: update_subagent_call
    id: call_lumi
    finish: true
    elapsed: "0:02s"

  # Sonic fails
  - at: 25200
    type: add_subagent_call
    id: call_sonic
    caller: dev
    target: creative
    role: Sound Designer
    name: Sonic
    question: "Add boss battle music trigger"
    status: executing

  - at: 26600
    type: update_subagent_call
    id: call_sonic
    fail: true
```

---

### IDE visibility — title cards & transitions

`ide_hide` / `ide_show` let you toggle the IDE window on/off during playback.
The background animation and all viewport-space labels remain visible regardless.

| Param | Type | Default | Description |
|---|---|---|---|
| `duration` | number (ms) | `500` | Fade duration. `0` = instant. |
| `record_while_hidden` | boolean | `true` | `true` (default) — IDE stays in DOM at `opacity:0`, recording continues. `false` — also sets `visibility:hidden` + `pointer-events:none` after fade. |

**Typical title card pattern:**
```yaml
actions:
  # 0s: hide IDE instantly — show title card over background only
  - at: 0
    type: ide_hide
    duration: 0

  # 0.4s: logo fades in
  - at: 400
    type: label_show
    id: title_logo
    image: assets/qcai_wordmark.png
    width: 240px
    x: "50%"
    y: "36%"
    anchor: center
    space: viewport
    anim_in: fade
    anim_out: fade
    duration: 700

  # 1.2s: tagline rises in
  - at: 1200
    type: label_show
    id: title_caption
    text: "Create *real-world* impressive apps"
    style: caption
    x: "50%"
    y: "56%"
    anchor: center
    space: viewport
    anim_in: rise
    anim_out: fade
    duration: 600

  # 3.5s: hide labels
  - at: 3500
    type: label_hide
    id: title_caption
    duration: 400

  - at: 3700
    type: label_hide
    id: title_logo
    duration: 500

  # 4.3s: fade IDE back in
  - at: 4300
    type: ide_show
    duration: 700

  # 5s: main scenario begins
  - at: 5000
    type: camera_move
    zoom: 0.9
    rx: 3
    ry: -5
    duration: 1000
```

---

### Custom Window & Viewers

`IDECustomWindow` (`gui_parts/custom_window.js`) is a macOS-style floating panel that wraps any content element.  
`IDEViewerVideo`, `IDEViewerImage`, `IDEViewerSound` (`gui_parts/viewer_*.js`) are media viewers that can be used standalone or wrapped in a custom window.

**Viewer modes:**
- `'bridge'` — uses `QC.media.VideoPlayer` / `QC.media.SoundPlayer` (bridge-styled, requires quadcode-ide.js). Auto-falls back to `'embedded'` if bridge API is unavailable.
- `'embedded'` — pure HTML5 `<video>` / `<audio>` / `<img>`, zero dependencies.

**Scenario YAML — open a floating video window:**
```yaml
  - at: 3000
    type: viewer_open
    id: result_video
    viewer: video
    src: /.temp/recordings/demo.mp4
    mode: embedded
    autoplay: true
    loop: true
    muted: true
    window:
      title: Result Preview
      width: 640
      height: 400
      x: 120
      y: 80
      resizable: true
      draggable: true
    show: true
    show_duration: 400

  - at: 8000
    type: viewer_set_source
    id: result_video
    src: /.temp/recordings/stage2.mp4
    name: Stage 2 Result

  - at: 12000
    type: viewer_hide
    id: result_video
    duration: 300
```

**Scenario YAML — open a floating image window:**
```yaml
  - at: 5000
    type: viewer_open
    id: screenshot
    viewer: image
    src: /assets/screenshot.png
    fit: contain
    window:
      title: Screenshot
      width: 800
      height: 600
      x: 60
      y: 60
```

**Scenario YAML — open a floating audio player:**
```yaml
  - at: 1000
    type: viewer_open
    id: narration
    viewer: sound
    src: /.temp/recordings/narration.mp3
    autoplay: true
    window:
      title: Narration
      width: 480
      height: 180
      x: 200
      y: 400
```

**JS API (direct use without scenario):**
```js
// Video in floating window
var viewer = new IDEViewerVideo({ src: '/demo.mp4', autoplay: true, mode: 'embedded' });
var win = viewer.openInWindow({ title: 'Demo', width: 640, height: 400, x: 100, y: 80 });
win.mount(document.body);
win.show();

// Image standalone
var img = new IDEViewerImage({ src: '/screenshot.png', fit: 'contain', zoom: true });
img.mount(document.getElementById('preview'));

// Custom window wrapping any element
var myEl = document.createElement('div');
var win = IDECustomWindow.wrap(myEl, { title: 'My Panel', width: 400, height: 300 }, document.body);
win.show();
win.setPosition(200, 150);
win.setSize(500, 350);
```

**`IDECustomWindow` API:**
- `win.show(duration?)` / `win.hide(duration?)` / `win.toggle()`
- `win.setTitle(str)` / `win.setPosition(x, y)` / `win.setSize(w, h)`
- `win.setContent(el)` — replace inner content
- `win.mount(parent)` / `win.destroy()`
- `win.contentEl` — inner content area (use as recording rect)
- `win.isVisible` — boolean

**`IDEViewerVideo` / `IDEViewerImage` / `IDEViewerSound` API:**
- `viewer.mount(parent)` — mount into DOM
- `viewer.play()` / `viewer.pause()` / `viewer.seek(seconds)`
- `viewer.setVolume(0..1)` (video/sound)
- `viewer.setSource(src, name?)` — hot-swap media
- `viewer.setFit(mode)` (image only) — `'contain'|'cover'|'fill'|'actual'`
- `viewer.resetZoom()` (image only)
- `viewer.openInWindow(winOpts)` → `IDECustomWindow`
- `viewer.destroy()`
- `viewer.el` — root element

---

### Labels — floating text overlays

`IDELabels` (`gui_parts/labels.js`) renders styled text labels over the recording frame.
Labels support two coordinate spaces, 9 animation effects, and gradient-emphasis markup.

#### Label spaces

| `space` | Parent element | `x` / `y` units | Affected by camera? | Captured in recording? |
|---|---|---|---|---|
| `viewport` (default) | `#vpCapture` (recording frame div) | CSS strings: `'50%'`, `'4%'`, `'200px'` | ✗ — always flat over the frame | ✅ yes |
| `scene` | `win.window` (the 3D-transformed IDE element) | Native IDE px: `720`, `450` (0–1440 × 0–900) | ✅ — rotates/scales/pans with the IDE | ✅ yes |

Use **`viewport`** for hero captions, step tags, HUD overlays.  
Use **`scene`** for labels that should appear "inside" the IDE, attached to a UI element.

#### Animation effects

| Effect | Appear | Disappear | Easing |
|---|---|---|---|
| `fade` | opacity only | opacity only | ease |
| `rise` ← default | slides up from below | slides down | spring |
| `drop` | slides down from above | slides up | spring |
| `slide_left` | slides in from the right | slides out to the right | spring |
| `slide_right` | slides in from the left | slides out to the left | spring |
| `scale` / `zoom_out` | scales up from 0.72× (overshoot) | scales down | overshoot |
| `zoom_in` | scales down from 1.22× | scales up | overshoot |
| `blur` | fades in from `blur(12px)` | fades out to `blur(12px)` | ease |
| `none` | instant | instant | — |

#### Label styles

Styles match the quadcode.ai landing page typography exactly.

| `style` | Font | Size | Color | Emphasis (`*word*`) |
|---|---|---|---|---|
| `caption` | Lexend 500 | `clamp(24px, 5cqw, 72px)` | white | Lexend 500, no italic, `#F18024 → #F85A6A` gradient |
| `subcaption` | Lexend 500 | `clamp(11px, 1.8cqw, 22px)` | `#787878` | same gradient, no italic |

Scene-space labels use fixed px sizes (52px caption, 18px subcaption) since the scene is already scaled.

#### Background rect (`bg`)

Add a semi-transparent rounded-rectangle behind a label for better contrast over busy backgrounds (IDE panels, video, animations).

| Param | Type | Default | Description |
|---|---|---|---|
| `bg` | `true` \| CSS color string | — | `true` → `rgba(0,0,0,0.55)`. Any CSS color/rgba string for custom color+opacity. |
| `bg_radius` | string | `'8px'` | `border-radius` of the rect |
| `bg_padding` | string | `'6px 16px'` | Padding inside the rect (space between text and edge) |

For centered viewport labels (`anchor: center`) the rect shrinks to hug the text width automatically.

**Example:**
```yaml
- at: 1200
  type: label_show
  id: tag
  text: "Step 1 — *Enter prompt*"
  x: "4%"
  y: "88%"
  anchor: left
  anim_in: slide_left
  bg: true            # default rgba(0,0,0,0.55), 8px radius
  bg_padding: "5px 12px"

- at: 2000
  type: label_show
  id: hero
  text: "Create *real-world* impressive apps"
  style: caption
  x: "50%"
  y: "38%"
  anchor: center
  anim_in: rise
  bg: "rgba(0,0,0,0.65)"   # custom opacity
  bg_radius: "12px"
  bg_padding: "10px 24px"
```

#### Image labels

Set `image` instead of `text` to render an `<img>` element. All animation effects, spaces, and positioning work identically.

| Param | Type | Default | Description |
|---|---|---|---|
| `image` | string | — | Path (relative to HTML file) or URL to image |
| `width` | string | `'auto'` | CSS width of the image (`'220px'`, `'30%'`, …) |
| `height` | string | `'auto'` | CSS height of the image |

`style` is ignored for image labels. `anchor: center` uses `translateX(-50%)` for centering (no fixed width needed).

**Assets included:**

| File | Description |
|---|---|
| `assets/qcai_wordmark.png` | Full wordmark — icon (left) + white text (right) |
| `assets/qcai_logo_text_only.png` | Text-only wordmark — white on transparent |
| `assets/qcai_icon.png` | Icon only — colored gradient mark |

**Example — show logo at top-center, scale in, blur out:**

```yaml
- at: 200
  type: label_show
  id: logo
  image: assets/qcai_logo_text.png
  width: 220px
  x: "50%"
  y: "6%"
  anchor: center
  anim_in: scale
  anim_out: blur
  duration: 600

- at: 1800
  type: label_hide
  id: logo
  duration: 500
```

#### `label_defaults` — scenario-level defaults

Set once at the top level of the scenario; every `label_show` inherits these unless overridden:

```yaml
label_defaults:
  style:    subcaption   # 'caption' | 'subcaption'
  space:    viewport     # 'viewport' | 'scene'
  anchor:   center       # 'center' | 'left' | 'right'
  anim_in:  rise         # see effects table above
  anim_out: fade
  duration: 400          # transition ms
```

#### Example

```yaml
label_defaults:
  style: subcaption
  anim_in: rise
  anim_out: fade
  duration: 400

actions:
  # Step tag — slides in from right, exits left. Inherits style/duration from defaults.
  - at: 1200
    type: label_show
    id: tag
    text: "Step 1 — *Enter prompt*"
    x: "4%"
    y: "88%"
    anchor: left
    anim_in: slide_left
    anim_out: slide_right

  # Update text while visible — no animation
  - at: 4200
    type: label_set
    id: tag
    text: "Step 2 — *Agent working*"

  # Hide with its anim_out
  - at: 12500
    type: label_hide
    id: tag

  # Hero caption — rise in, blur out
  - at: 13200
    type: label_show
    id: hero
    text: "Where *imagination* meets execution"
    style: caption
    x: "50%"
    y: "38%"
    anim_in: rise
    anim_out: blur
    duration: 500

  # Scene label — inside IDE, moves with 3D camera
  - at: 2000
    type: label_show
    id: hint
    text: "*Type* your request here"
    space: scene
    x: 720
    y: 820
    anchor: center
    anim_in: rise
    duration: 400

  # final_position — label appears centered, then glides to top-left corner
  - at: 5000
    type: label_show
    id: hero
    text: "Where *imagination* meets execution"
    style: caption
    x: "50%"
    y: "42%"
    anchor: center
    anim_in: rise
    duration: 500
    final_position:
      x: "4%"
      y: "10%"
      move_duration: 900    # ms to glide (default 800)
      # move_easing: cubic-bezier(0.22,1,0.36,1)  # optional

  # label_move — move a visible label to a new position at any time
  - at: 8000
    type: label_move
    id: tag
    y: "82%"
    move_duration: 600
```

### Empty initial browser state

A browser tab can start with no video — showing a subtle placeholder — and receive
a video later via `switch_video`. This is the recommended pattern when the recording
doesn't exist yet at page load time.

**In `browser_tabs` YAML:**

```yaml
browser_tabs:
  - id: br-video
    label: Result          # tab label
    # video: omitted       # no video field → showEmpty() is called
    empty_label: No content yet   # optional placeholder text
```

**Fit to video behavior:**
- While the tab is empty, `Fit to video` falls back to the first `switch_video` action
  in the scenario that has a `video` field — reads its dimensions without loading it visually.
- Once `switch_video` has fired and the video is live, `_videoSrc` is set and `Fit to video`
  uses the actual loaded src directly.
- If no video is declared anywhere in the scenario, the button logs a warning and does nothing.

**Typical flow:**
```
page load  → br-video shows "No content yet" placeholder
             Fit to video already works — reads dims from first switch_video in scenario
t=13.5s    → switch_video fires → placeholder fades out, video fades in
t=any      → Fit to video uses live _videoSrc from the loaded tab
```

### `switch_video` — in-place video replacement

Replaces the video source inside a browser tab without switching tabs or rebuilding the viewport.
Use this to show different recording stages as the demo progresses.

**YAML parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `tab_id` | string | `br-video` | ID of the browser tab containing the video |
| `video` | string | — | Path or URL to the new video file |
| `fade` | number (ms) | `300` | Crossfade duration. `0` = instant swap |
| `loop` | boolean | _(keep existing)_ | Override loop setting |
| `muted` | boolean | _(keep existing)_ | Override muted setting |
| `controls` | boolean | _(keep existing)_ | Override controls visibility |
| `fit` | string | _(keep existing)_ | `contain` \| `cover` \| `fill` |

**Example:**

```yaml
- at: 20000
  type: switch_video
  tab_id: br-video
  video: /.temp/recordings/stage2.mp4
  fade: 400        # crossfade duration in ms (0 = instant)
  loop: true
  muted: true
```

### Custom panels

A scenario can add one generic center tab after **Web browsers**. It can show a video or URL; `id` is used by actions and `label` is the visible tab title.

```yaml
main_panel:
  custom:
    id: app-preview
    label: App Preview
    video: /.temp/recordings/preview.mp4 # or: url: http://localhost:9187/...
    # scale: x0.9 # URL/HTML iframe only; accepts x0.9 or 0.9 (0 < scale <= 1)
    loop: true
    muted: true

actions:
  - at: 1200
    type: switch_video
    panel_id: app-preview
    video: /.temp/recordings/next.mp4
    fit_to_video: true # preferred: fits immediately, no delay

  # Equivalent explicit form:
  - at: "+0"
    type: fit_to_video
    panel_id: app-preview

  - at: 2000
    type: show_subpanel
    side: center # left | center | right
    label: Architecture
    url: subpanels/game_structure.html
    scale: x0.9 # optional; HTML iframes only, accepts x0.9 or 0.9
```

`scale` defaults to `1`; invalid values and values outside `0 < scale <= 1` fall back to `1`. It never affects video panels.

`switch_video`, `clear_browser`, and `fit_to_video` support both legacy browser `tab_id` and custom `panel_id`. The manual **Fit to video** button fits the selected video panel. See `scenarios/custom_ui_sample.yaml` for left, center, and right panel examples.

**Where to place video files:**  
Put recordings in `.temp/recordings/` — this is the default output folder for the bridge recorder.
Reference them with the absolute path prefix `/.temp/recordings/your_file.mp4`.

**How it works:**
1. Looks up the `IDEBrowser` instance registered for `tab_id` in `mainPanel._browsers`.
2. Fades the `<video>` element out (half of `fade` ms).
3. Swaps `video.src`, calls `video.load()` + `video.play()`.
4. Fades back in.

If no video is currently playing in that tab, falls back to a full `playVideoFile()` call.

## Global scenario settings

Top-level keys in the scenario YAML (or inline `SCENARIO` object):

| Key | Type | Default | Description |
|---|---|---|---|
| `project` | string | — | Project name shown in IDE header |
| `topic` | string | `''` | Chat topic displayed in the top bar of the chat log. Omit or set to `''` to hide. |
| `initial_zoom` | number | `1` | Camera zoom at startup (multiplied by `initial_vp_scale`) |
| `initial_vp_scale` | number | `1.0` | Global viewport scale — same as the Scale slider in the Viewport panel. Set to `0.6` to zoom out and see the full IDE. Applied before any scenario action runs. |
| `camera_smoothness` | number | `0.6` | Controls CSS transition duration for camera moves. `0` = instant, `1` = very slow (2 s). Affects all `camera_move`, `camera_reset`, and `stopAnim` transitions. |
| `camera_move_duration` | number | `700` | Default duration (ms) for all `camera_move` actions. Per-action `duration:` overrides this. |
| `camera_move_easing` | string | `ease_in_out` | Default easing for all `camera_move` actions. Values: `linear` \| `ease_in` \| `ease_out` \| `ease_in_out` \| `spring` \| `bounce`. Per-action `easing:` overrides this. |
| `background` | string | — | Background animation to start on load. Values: `none` \| `gradient` \| `neural_net` \| `aurora` \| `neuro_noise` \| `grid` \| `nebula` \| `god_rays` \| `stars` \| `waves` \| `scanlines` \| `vortex` \| `particles` \| `north_lights`. Calls `bg.apply(value)` before the scenario plays. |
| `hide_right_panel` | boolean | `false` | If `true`, hides the right file-tree panel on init. Calls `mainPanel.hideRightPanel()`. |
| `project` | object | — | Project context for the file tree. Sets root folder name, file list, and initially selected file. See **Project section** below. |

#### Project section

Sets the file tree content, header project name, and status bar. Replaces the default hardcoded tree.

```yaml
project:
  project_name: NeuralForge          # root folder label in file tree + header
  root_path: /projects/NeuralForge   # absolute path (informational, shown in status bar)
  selected: src/model/transformer.py # file highlighted at scenario start (default: first file)
  files:                             # relative paths from project root — builds tree automatically
    - src/main.py
    - src/model/transformer.py
    - src/model/attention.py
    - src/config/model_config.yaml
    - tests/test_transformer.py
    - README.md
    - requirements.txt
```

Folders are inferred automatically from the path structure. Files are sorted folders-first, then alphabetically. All parent folders are pre-expanded.
| `narration` | object | — | Voice-over audio. Starts playing when scenario plays, stops on stop. Fields: `src` (required), `volume` (0–1, default `1.0`), `loop` (default `false`). For precise action timing that matches the voice-over, use **WhisperX** to get word-level timestamps from the narration file and align `at:` values in the scenario accordingly. |
| `soundtrack` | object | — | Background music. Same fields as `narration` but `loop` defaults to `true`. Use a low `volume` (e.g. `0.3`) to keep it under narration. |

**Audio example:**
```yaml
narration:
  src: /.temp/audio/narration.mp3
  volume: 0.9
  loop: false

soundtrack:
  src: /.temp/audio/bg_music.mp3
  volume: 0.3
  loop: true

actions:
  # Duck soundtrack when narration is prominent
  - at: 7000
    type: audio_play
    channel: soundtrack
    volume: 0.1
    fade_in: 500

  # Restore after narration ends
  - at: 16000
    type: audio_play
    channel: soundtrack
    volume: 0.3

  # Fade out at the end
  - at: 43000
    type: audio_stop
    channel: soundtrack
    fade_out: 2000
```

**Example:**
```yaml
initial_zoom: 0.9
initial_vp_scale: 0.6      # zoomed out to fit IDE in viewport
camera_smoothness: 0.7     # smooth but not sluggish
background: gradient       # start with gradient animation
hide_right_panel: true     # hide file-tree panel on init
```

## Key concepts

- **Bridge** (`QC` / `quadcode-ide.js`) provides styles, icons, avatars and the MP4 recorder.
- **Scenario** drives the whole animation: typed messages, agent answers with tool calls,
  camera moves, background changes — all time-coded in ms.
- **Camera** (`IDECamera`) applies 3D transforms additively: `_base` (set by scenario) +
  `_animDelta` (running animation preset like `float` or `drift`).
- **Recording** captures the `#vpCapture` div rect via `QC.ui.startBrowserRecording()`.
  Quality: `high` + `crf:1` for gradient-safe output.

## Usage

1. Open `whole_ide_render_mock.html` in the IDE browser panel.
2. Pass a scenario via URL param (see below) or use the default `scenarios/test_scenario.yaml`.
3. Press **▶ Play** to preview, **⏺ Record** to capture to `.temp/recordings/`.

### Loading a scenario via URL

`whole_ide_render_mock.html` accepts a `?scenario=` query param to load any YAML file:

| URL | Resolves to |
|---|---|
| *(no param)* | `scenarios/test_scenario.yaml` (default, relative to HTML) |
| `?scenario=scenarios/my.yaml` | relative to the HTML file |
| `?scenario=skills/motion_render_ide_video/files/scenarios/my.yaml` | absolute from server root |
| `?scenario=/skills/motion_render_ide_video/files/scenarios/my.yaml` | absolute from server root (leading `/`) |

**Examples:**
```
http://localhost:9230/.../whole_ide_render_mock.html?scenario=scenarios/my_demo.yaml
http://localhost:9230/.../whole_ide_render_mock.html?scenario=/skills/motion_render_ide_video/files/scenarios/product_launch.yaml
```

YAML is parsed with **js-yaml** (loaded from CDN) — full YAML spec supported including inline comments.  
Top-level numeric fields (`initial_zoom`, `initial_vp_scale`, `camera_smoothness`) are coerced to `float` after parse.
