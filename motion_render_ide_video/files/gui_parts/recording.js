/**
 * IDERecording
 * ─────────────────────────────────────────────────────────────────────────────
 * Adds a ⏺ Record button to the IDE scenario player.
 * Reuses the same bridge recording pattern as message_box.html.
 *
 * Features:
 *  • Record button in demo-controls bar (next to Play)
 *  • Captures the viewport div (#vpCapture) when a viewport is active,
 *    otherwise captures the full IDE window element
 *  • Auto-starts scenario playback after recording begins
 *  • Auto-stops recording when scenario finishes (onDone callback)
 *  • Saves to .temp/recordings/ide_scenario_<timestamp>.mp4
 *  • Hides UI chrome (camera panel, viewport decor, bg panel) during recording
 *  • Pulsing rec-dot on Stop button during recording
 *
 * Usage:
 *   const rec = new IDERecording({
 *     camera,          // IDECamera instance (for vpCapture div)
 *     getScenario,     // () => IDEScenario — factory that creates a fresh scenario
 *     onRecordStart,   // optional () => called when recording starts
 *     onRecordStop,    // optional (filename) => called when file is saved
 *   });
 *   rec.mount(document.getElementById('demo-controls'));
 */
class IDERecording {
  constructor(opts) {
    opts = opts || {};
    this._camera       = opts.camera       || null;
    this._getScenario  = opts.getScenario  || null;
    this._onStart      = opts.onRecordStart || null;
    this._onStop       = opts.onRecordStop  || null;

    this._recording    = false;
    this._btn          = null;
    this._activeScenario = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Inject the Record button into a container (e.g. #demo-controls). */
  mount(container) {
    this._btn = this._buildBtn();
    container.appendChild(this._btn);

    // Register done callback once — fires when file is written to disk
    if (window.QC) {
      QC.ui.onBrowserRecordingDone((filename) => {
        console.log('[IDERecording] saved:', filename);
        this._setRecordState(false);
        this._btn.textContent = '✓ Saved';
        setTimeout(() => { this._btn.innerHTML = '⏺ Record'; }, 1800);
        if (this._onStop) this._onStop(filename);
      });

      // Recording now starts asynchronously (the sidecar launch is off the UI
      // thread so the IDE never freezes on Record).  Wait for the real "started"
      // signal before playing the scenario, otherwise the first frames record
      // before capture is live.
      QC.ui.onBrowserRecordingStarted((filename, ok) => {
        if (!ok) {
          console.warn('[IDERecording] sidecar failed to start');
          this._setRecordState(false);
          this._btn.textContent = '✗ Failed';
          setTimeout(() => { this._btn.innerHTML = '⏺ Record'; }, 1500);
          return;
        }
        console.log('[IDERecording] sidecar started:', filename);
        this._setRecordState(true);
        if (this._onStart) this._onStart();
        // Play the scenario pre-created in startRecording() during the 3s
        // precache countdown — do NOT recreate it here, that would discard
        // the prewarm and could double-instantiate the scenario.
        if (this._activeScenario) {
          this._activeScenario.play();
        } else if (this._getScenario) {
          // Fallback safety net — shouldn't normally trigger.
          this._activeScenario = this._getScenario({ onDone: () => this._autoStop() });
          this._activeScenario.play();
        }
      });
    }

    return this;
  }

  /** Programmatically start recording + scenario. */
  async startRecording() {
    if (this._recording) return;
    if (!window.QC) {
      alert('QC bridge not available — open this page inside the IDE.');
      return;
    }

    // ── 3s countdown before recording starts ─────────────────────────────
    // Pre-create scenario now so prewarming runs during countdown
    if (this._getScenario) {
      this._activeScenario = this._getScenario({
        onDone: () => this._autoStop(),
      });
    }

    await new Promise(resolve => {
      let cd = 3;
      this._btn.innerHTML = '… ' + cd + 's';
      this._btn.style.background = '#c53030';
      const _cid = setInterval(() => {
        cd--;
        if (cd > 0) { this._btn.innerHTML = '… ' + cd + 's'; return; }
        clearInterval(_cid);
        resolve();
      }, 1000);
    });

    // ── Pre-apply the scenario's opening viewport ─────────────────────────
    // The capture rect is measured NOW, but a scenario that starts with
    // `camera_viewport: r169` at t=0 only switches the frame once playback
    // begins — so the recorder used to lock onto the default 16:10 frame and
    // record a 16:9 scene inside it (letterboxed + off-centre). Apply that
    // first viewport switch up-front so the measured rect is the real one.
    try {
      const acts = this._activeScenario && this._activeScenario._data && this._activeScenario._data.actions;
      if (acts && this._camera) {
        const first = acts.find(a => a && a.type === 'camera_viewport' && (+a.at || 0) <= 100);
        if (first && first.mode) {
          this._camera.setViewport(first.mode);
          console.log('[IDERecording] pre-applied viewport:', first.mode);
        }
      }
    } catch (e) { console.warn('[IDERecording] viewport pre-apply skipped:', e.message); }

    // ── Determine capture element ─────────────────────────────────────────
    const vpCapture = document.getElementById('vpCapture');
    const captureEl = (vpCapture && vpCapture.style.display !== 'none')
      ? vpCapture
      : (this._camera ? this._camera._wrapper.window : document.querySelector('#page-root > *'));

    const cssRect = captureEl.getBoundingClientRect();
    const captureRect = {
      cssLeft: cssRect.left,
      cssTop:  cssRect.top,
      cssW:    cssRect.width,
      cssH:    cssRect.height,
    };

    const filename = '.temp/recordings/ide_scenario_' + Date.now() + '.mp4';
    console.log('[IDERecording] starting, captureRect=', JSON.stringify(captureRect));

    // startBrowserRecording only DISPATCHES the launch (returns immediately so
    // the UI never blocks).  `ok` here just means "dispatch accepted" — the real
    // start/fail outcome arrives via onBrowserRecordingStarted (wired in mount),
    // which is what actually plays the scenario or shows the failure state.
    const ok = await QC.ui.startBrowserRecording(filename, {
      fps:     25,
      quality: 'high',
      crf:     1,
      capture: captureRect,
    });

    if (!ok) {
      this._btn.textContent = '✗ Failed';
      this._btn.style.background = '#e53e3e';
      setTimeout(() => { this._btn.innerHTML = '⏺ Record'; }, 1500);
      return;
    }

    // Give immediate visual feedback that the press registered; the real
    // recording state (and scenario playback) is confirmed in
    // onBrowserRecordingStarted, which plays the scenario pre-created above.
    // Sidecar launch (spawn + encoder warm-up) runs off the UI thread.
    this._btn.innerHTML = 'preparing…';
  }

  /** Programmatically stop recording. */
  async stopRecording() {
    if (!this._recording) return;
    if (this._activeScenario) {
      this._activeScenario.stop();
      this._activeScenario = null;
    }
    // Transcode (raw .mov → normalized mp4) runs in the sidecar after stop;
    // show progress until onBrowserRecordingDone fires and restores the button.
    this._setConvertingState();
    await QC.ui.stopBrowserRecording();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  _buildBtn() {
    const btn = document.createElement('button');
    btn.id = 'btnRecord';
    btn.innerHTML = '⏺ Record';
    btn.style.cssText = [
      'height:26px;padding:0 12px;border:none;border-radius:5px;',
      'font-size:11px;font-family:inherit;cursor:pointer;',
      'background:#e53e3e;color:#fff;transition:opacity 0.15s;',
    ].join('');
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.8'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });

    btn.addEventListener('click', async () => {
      if (!window.QC) {
        alert('QC bridge not available — open this page inside the IDE.');
        return;
      }
      if (this._recording) {
        await this.stopRecording();
      } else {
        await this.startRecording();
      }
    });

    return btn;
  }

  _setRecordState(active) {
    this._recording = active;
    const btn = this._btn;
    if (!btn) return;

    if (active) {
      btn.style.background = '#c53030';
      btn.innerHTML = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#fff;margin-right:4px;vertical-align:middle;animation:recPulse 1s ease-in-out infinite"></span>Stop';
      // Inject pulse keyframes once
      if (!document.getElementById('__rec-pulse-css')) {
        const s = document.createElement('style');
        s.id = '__rec-pulse-css';
        s.textContent = '@keyframes recPulse{0%,100%{opacity:1}50%{opacity:0.3}}';
        document.head.appendChild(s);
      }
      // Hide UI chrome so it doesn't appear in video
      document.body.classList.add('is-recording');
    } else {
      btn.style.background = '#e53e3e';
      btn.innerHTML = '⏺ Record';
      document.body.classList.remove('is-recording');
    }
  }

  /** Called by scenario onDone (either explicit stop_record or fallback timer). */
  async _autoStop() {
    if (!this._recording) return;
    // Tiny pause to ensure the last rendered frame is captured before stopping
    await new Promise(r => setTimeout(r, 200));
    if (!this._recording) return;
    // Transcode runs after stop — show converting state until the file is ready.
    this._setConvertingState();
    await QC.ui.stopBrowserRecording();
    // UI restore happens in onBrowserRecordingDone callback
  }

  /**
   * Switch the button to the post-stop "converting" state: recording is over
   * (so a second click can't re-trigger stop) but the sidecar is still
   * transcoding the raw capture into the final mp4.  onBrowserRecordingDone
   * restores the idle "⏺ Record" button when the file is written.
   */
  _setConvertingState() {
    this._recording = false;
    document.body.classList.remove('is-recording');
    const btn = this._btn;
    if (!btn) return;
    btn.style.background = '#e53e3e';
    btn.innerHTML = 'converting…';
  }
}
