/**
 * Adaptive render quality for the arena.
 *
 * The pitch is a big, mostly-empty room, so the frame cost here is almost
 * entirely *fill rate*: shaded pixels, the shadow map, and the bloom chain.
 * None of that is fixed by drawing fewer objects — it is fixed by drawing
 * fewer pixels. So this governor moves three dials and nothing else:
 *
 *   scale       fraction of the pixel budget the main pass is allowed
 *   shadowMap   texels of the one shadow-casting light
 *   bloomDiv    the bloom chain runs at 1/n of the render size
 *
 * A tier change is a step, not a slide: sliding the resolution every frame
 * reads as breathing blur, whereas a step that happens twice a match does not
 * register at all.
 */

/** Hard ceiling on pixels rendered per frame at `scale: 1`.
 *
 * 2.1 MP ≈ 1080p. A 4K display asking for devicePixelRatio 2 would otherwise
 * shade four times that for a picture the eye cannot resolve at desk distance;
 * rendering above the budget and letting the browser downsample also gives
 * cheaper edge antialiasing than MSAA on the default framebuffer. */
export const PIXEL_BUDGET = 2.1e6;

/** Floor on pixels shaded per frame, whatever the tier says.
 *
 * ~0.55 MP is 900×600 — below it the car's wheels alias into mush and the
 * picture, not the frame rate, becomes the thing the player complains about. */
export const MIN_PIXELS = 0.55e6;

export type Tier = {
  id: string;
  scale: number;
  shadowMap: number;
  bloomDiv: number;
};

export const TIERS: readonly Tier[] = Object.freeze([
  Object.freeze({ id: 'eco', scale: 0.4, shadowMap: 1024, bloomDiv: 3 }),
  Object.freeze({ id: 'low', scale: 0.55, shadowMap: 1024, bloomDiv: 2 }),
  Object.freeze({ id: 'medium', scale: 0.75, shadowMap: 2048, bloomDiv: 2 }),
  Object.freeze({ id: 'high', scale: 1, shadowMap: 2048, bloomDiv: 1 }),
]);

const START = 3; // start at `high` and fall back; starting low looks broken
const SLOW_MS = 20.5; // a frame this long missed vsync on a 60 Hz display
/** Average interval that still counts as headroom.
 *
 *  Must sit *above* the vsync floor, not below it: a game pinned at a perfect
 *  60 fps averages 16.7 ms, so a 15.5 ms threshold means the governor can
 *  never step back up — it would sit in `eco` forever on a machine that had
 *  one bad second. 18 ms passes 60 Hz-locked and 144 Hz alike, while a
 *  genuinely struggling frame (>25% late) is caught by LATE_DOWN first. */
const FAST_MS = 18;
const WINDOW = 1; // seconds per decision; shorter reacts to noise, not load
const LATE_DOWN = 0.25; // >25% late frames in a window: step down
// 8%, not 4%: a browser holding a steady 60 still hands out the odd 21 ms
// frame (compositor, GC), and measured runs at `high` sit at ~4% late.
const LATE_UP = 0.08;
const GOOD_WINDOWS = 3;
const BAD_WINDOWS = 2; // two bad seconds in a row, so one stutter is not "load"
const LATE_PANIC = 0.6; // most of the window late: step immediately, no vote
const SETTLE = 0.6; // ignore samples right after a change (resize reallocates)
const WARMUP = 5; // shader compiles and the first physics steps, not the game
/** Above this, a frame is an event (shader compile, GC, tab switch), not load.
 *  Counting those would strip the game to `eco` before the kickoff whistle. */
const OUTLIER_MS = 120;

export class Quality {
  index = START;
  locked = false;
  frameMs = 16.7;
  private windowTime = 0;
  private windowFrames = 0;
  private windowSum = 0;
  private windowLate = 0;
  private goodWindows = 0;
  private badWindows = 0;
  private settle = WARMUP;
  private dirty = true;

  get tier(): Tier {
    return TIERS[this.index];
  }

  /** True once per change; the caller reads it and re-applies the tier. */
  consumeDirty() {
    const was = this.dirty;
    this.dirty = false;
    return was;
  }

  /**
   * Feed one frame interval, in milliseconds.
   *
   * Interval — not the time spent inside `frame()`. A GPU-bound frame returns
   * from JS in 3 ms and still misses vsync, so CPU timing would report a game
   * running at a comfortable 60 while the player watches 25.
   */
  sample(ms: number) {
    // A tab that was backgrounded, or a first frame behind a shader compile,
    // arrives as one enormous interval. Treat those as no information.
    if (!(ms > 0)) return;

    const dt = ms / 1000;
    if (ms > OUTLIER_MS) {
      // Let the clock run — a 300 ms compile still burns 0.3 s of warmup —
      // but keep it out of the average and the counters.
      this.settle = Math.max(this.settle, SETTLE);
      return;
    }

    this.frameMs += (ms - this.frameMs) * Math.min(1, dt * 3.5);

    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }

    this.windowTime += dt;
    this.windowFrames++;
    this.windowSum += ms;
    if (ms > SLOW_MS) this.windowLate++;
    if (this.windowTime < WINDOW) return;

    // Decide on the *share* of late frames, not on an average and not on the
    // last frame. A goal explosion drops two frames in a otherwise perfect
    // second; that is a hitch to leave alone, while a machine that genuinely
    // cannot keep up is late in most of the window.
    const late = this.windowLate / Math.max(1, this.windowFrames);
    const avg = this.windowSum / Math.max(1, this.windowFrames);
    this.windowTime = 0;
    this.windowFrames = 0;
    this.windowSum = 0;
    this.windowLate = 0;

    if (this.locked) return;

    if (late > LATE_DOWN) {
      this.goodWindows = 0;
      this.badWindows++;
      const panic = late > LATE_PANIC;
      if ((panic || this.badWindows >= BAD_WINDOWS) && this.index > 0) {
        this.step(-1);
        return;
      }
      return;
    }
    this.badWindows = 0;

    if (late < LATE_UP && avg < FAST_MS) this.goodWindows++;
    else this.goodWindows = 0;

    if (this.goodWindows >= GOOD_WINDOWS && this.index < TIERS.length - 1) this.step(1);
  }

  /** Pin a tier (debug / QA). Measurement keeps running. */
  set(id: string) {
    const i = TIERS.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.index = i;
    this.locked = true;
    this.mark();
  }

  private step(dir: number) {
    this.index += dir;
    this.mark();
  }

  private mark() {
    this.windowTime = 0;
    this.windowFrames = 0;
    this.windowSum = 0;
    this.windowLate = 0;
    this.goodWindows = 0;
    this.badWindows = 0;
    this.settle = SETTLE;
    this.frameMs = 16.7;
    this.dirty = true;
  }

  /**
   * Device pixel ratio for a CSS viewport, inside the budget.
   *
   * The legibility floor is an absolute pixel count, not a ratio: 0.6 on a
   * 940×610 hero card is a blurry mess, while 0.6 on a 4K viewport is a clean
   * 1080p image. Expressing the floor as "never fewer than MIN_PIXELS shaded"
   * gets both right — and keeps the budget intact on big displays, which a
   * ratio floor quietly broke (a 4K box clamped to 0.6 shaded 3 MP).
   */
  pixelRatio(cssWidth: number, cssHeight: number) {
    const device = Math.min(window.devicePixelRatio || 1, 2);
    const area = Math.max(1, cssWidth * cssHeight);
    const fits = Math.sqrt((PIXEL_BUDGET * this.tier.scale) / area);
    const floor = Math.min(device, Math.sqrt(MIN_PIXELS / area));
    return Math.max(floor, Math.min(device, fits));
  }
}
