/**
 * Adaptive rendering budgets. Character geometry, lighting and grading stay intact.
 *
 * `eco` is the floor for weak GPUs (older integrated graphics, busy laptops):
 * 0.85 canvas pixels per CSS pixel is soft but the bloom/grade pipeline hides
 * most of it, and a stable 50–60 FPS reads as far higher quality than a sharp
 * 30. It is only reached after sustained slow frames on `low`.
 */
export const TIERS = Object.freeze([
  // volumeSteps multiplies the per-ability base step counts in settings
  // (nebula 24 / mist 18 / ink 16); the materials floor the result at 6, so
  // eco still marches ≥ 6 samples and stays a volume rather than a flat sprite.
  // 6 is the shader's own clamp; the old JS floor of 10 silently overrode
  // everything below `low` and cost ~10 ms per volume on an M1.
  //
  // particleSize scales every soft sprite (dust, smoke, mist, gas). Measured on
  // an M1 at eco: the quake's dust alone was 25-30 ms of GPU time — not from
  // the count (~400 live) but from each quad covering a tenth of the screen
  // with a noise-and-light fragment shader. 0.6 size = 0.36 of the fill, and
  // the frame dropped from 46 ms to 22 ms. Count was already at 0.35.
  //
  // maxDecals caps the ground marks alive at once (oldest retire first). The
  // rift alone laid forty, up to sixteen metres wide, and they were half its
  // GPU time. surfaceDetail (0/1) is the octave switch in the weathering
  // shaders — see settings.global.surfaceDetail.
  Object.freeze({ id: 'eco', pixelRatio: 0.85, shadowMap: 512, particleCount: 0.35,
    particleSize: 0.6, dustAmount: 0.2, maxConcurrent: 2, contactEvery: 2, volumeSteps: 0.25,
    maxDecals: 10, surfaceDetail: 0 }),
  Object.freeze({ id: 'low', pixelRatio: 1, shadowMap: 1024, particleCount: 0.45,
    particleSize: 0.75, dustAmount: 0.3, maxConcurrent: 2, contactEvery: 2, volumeSteps: 0.4,
    maxDecals: 16, surfaceDetail: 0 }),
  Object.freeze({ id: 'medium', pixelRatio: 1.25, shadowMap: 2048, particleCount: 0.7,
    particleSize: 0.9, dustAmount: 0.55, maxConcurrent: 3, contactEvery: 1, volumeSteps: 0.75,
    maxDecals: 28, surfaceDetail: 1 }),
  // 2048, not 4096: the canvas is at most ~1 MP (Renderer.PIXEL_BUDGET), so a
  // 16 MP shadow map would be resolved into a hundredth of its texels.
  Object.freeze({ id: 'high', pixelRatio: 1.5, shadowMap: 2048, particleCount: 1,
    particleSize: 1, dustAmount: 0.85, maxConcurrent: 4, contactEvery: 1, volumeSteps: 1,
    maxDecals: 48, surfaceDetail: 1 })
]);

const SLOW_MS = 22;
/** Below ~33 FPS the stutter is obvious; evidence accrues 2.5× faster there. */
const VERY_SLOW_MS = 30;
const VERY_SLOW_WEIGHT = 2.5;
const FAST_MS = 17.2;
const SLOW_HOLD = 1.5;
const FAST_HOLD = 8;
const SETTLE = 2;

export class QualityGovernor {
  constructor({ onChange, gpu = '' } = {}) {
    this.onChange = onChange ?? null;
    const forced = QualityGovernor.forcedTier();
    this.locked = forced !== null;
    this.index = forced ?? QualityGovernor.guessInitialIndex({ gpu });
    this.frameMs = 1000 / 60;
    this._slowFor = 0;
    this._fastFor = 0;
    this._settle = SETTLE;
    this._climbHold = TIERS.map(() => FAST_HOLD);
    this.downgrades = 0;
  }

  get tier() { return TIERS[this.index]; }

  apply(reason = 'init') { this.onChange?.(this.tier, null, reason); }

  /** Discard stale evidence after returning from a hidden tab. */
  resetSamples() {
    this._slowFor = this._fastFor = 0;
    this._settle = SETTLE;
    this.frameMs = 1000 / 60;
  }

  /**
   * Unclamped wall seconds, NOT simulation delta. Pausing must not earn
   * upgrades — and neither must standing still. `idle` means nothing is being
   * cast: an empty arena renders in 6 ms on any tier, so those frames prove
   * nothing about headroom. Before this gate an M1 climbed low → medium during
   * the onboarding screen, then spent the first six seconds of real play
   * falling back down through 40 fps.
   */
  sample(dt, { paused = false, idle = false } = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return false;
    // One long visible frame alone cannot trigger a downgrade, but sustained
    // sub-4 FPS must still count. Hidden-tab gaps are removed by App instead.
    const evidence = Math.min(dt, 0.25);
    this.frameMs += (Math.min(dt, 1) * 1000 - this.frameMs) * 0.08;
    if (this.locked) return false;
    if (this._settle > 0) {
      this._settle -= evidence;
      return false;
    }
    if (this.frameMs > SLOW_MS) {
      this._slowFor += evidence * (this.frameMs > VERY_SLOW_MS ? VERY_SLOW_WEIGHT : 1);
      this._fastFor = 0;
    } else if (this.frameMs < FAST_MS && !paused && !idle) {
      this._fastFor += evidence;
      this._slowFor = 0;
    } else if (this.frameMs < FAST_MS && idle) {
      // Fast but unloaded: keep whatever headroom evidence the last cast
      // earned, just do not add to it.
      this._slowFor = 0;
    } else {
      this._slowFor = this._fastFor = 0;
    }
    if (this.index > 0 && this._slowFor >= SLOW_HOLD) {
      this._climbHold[this.index] = Math.min(120, this._climbHold[this.index] * 2);
      this.downgrades++;
      this._move(this.index - 1, 'slow');
      return true;
    }
    const above = this.index + 1;
    if (above < TIERS.length && this._fastFor >= this._climbHold[above]) {
      this._move(above, 'headroom');
      return true;
    }
    return false;
  }

  /** Manual debug override; ?quality=low|medium|high does the same at boot. */
  set(id, { lock = true } = {}) {
    const index = TIERS.findIndex(tier => tier.id === id);
    if (index < 0) return;
    this.locked = lock;
    if (index === this.index) { this.resetSamples(); return; }
    this._move(index, 'manual');
  }

  _move(index, reason) {
    const previous = this.tier;
    this.index = index;
    this.resetSamples();
    this.onChange?.(this.tier, previous, reason);
  }

  static forcedTier() {
    const wanted = new URLSearchParams(globalThis.window?.location?.search ?? '').get('quality');
    const index = TIERS.findIndex(tier => tier.id === wanted?.toLowerCase());
    return index >= 0 ? index : null;
  }

  /**
   * Hints only: measurements take over after startup. Also safe in Node tests.
   *
   * `gpu` is the unmasked renderer string when the host can provide one. The
   * first guess used to be `high` for any 8-core desktop, which put an M1 or an
   * Intel Iris on a 72 ms frame for the ten seconds the governor needed to
   * climb down — the player's first impression of the game was 14 fps. Cores
   * say nothing about the GPU; the renderer string does. Integrated parts start
   * on `low` and earn `medium` in eight seconds if they have the headroom.
   */
  static guessInitialIndex({ gpu = '' } = {}) {
    const win = globalThis.window;
    const nav = globalThis.navigator;
    const coarse = win?.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    const cores = nav?.hardwareConcurrency ?? 4;
    const memory = nav?.deviceMemory ?? 8;
    const ratio = Math.min(win?.devicePixelRatio || 1, 1.5);
    const pixels = (win?.innerWidth ?? 1280) * (win?.innerHeight ?? 720) * ratio * ratio;
    const tier = (id) => TIERS.findIndex(t => t.id === id);
    // Nobody starts on `eco`: it is earned by measurements, never assumed.
    if (coarse) return tier(memory <= 3 || cores <= 4 ? 'low' : 'medium');
    if (QualityGovernor.isIntegratedGpu(gpu)) return tier('low');
    if (cores <= 4 || memory <= 4 || pixels > 3840 * 2160 * 0.8) return tier('medium');
    // Discrete or unknown GPU: `medium` is a safe first frame, and a GPU with
    // real headroom promotes itself to `high` before the player has cast twice.
    return tier('medium');
  }

  /** Apple silicon, Intel HD/Iris/UHD/Xe, AMD Vega APUs, Mali/Adreno on ChromeOS. */
  static isIntegratedGpu(renderer) {
    const s = String(renderer || '').toLowerCase();
    if (!s) return false;
    if (/apple (m\d|gpu)/.test(s)) return true;
    if (/intel/.test(s) && !/arc/.test(s)) return true;
    if (/radeon.*(vega|graphics)|amd.*graphics/.test(s) && !/rx\s?\d/.test(s)) return true;
    return /mali|adreno|powervr|videocore|swiftshader|llvmpipe/.test(s);
  }
}
