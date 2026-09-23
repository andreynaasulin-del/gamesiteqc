import type { PostPatch } from './post'

export type GraphicsQuality = 'low' | 'medium' | 'high'
export type GraphicsPreference = 'auto' | GraphicsQuality
export const GRAPHICS_KEY = 'ps.graphics'

export const GRAPHICS_PROFILES = {
  // The floor profile is aimed at an integrated GPU: half-resolution shadows (the map is lit by
  // one low sun, so its shadows are long and soft anyway) and a 1024x576 pixel budget.
  low: { pixelRatio: 1, pixels: 1024 * 576, shadowSize: 512, shadowHz: 20, sky: false,
    post: { enabled: false, ao: { enabled: false }, bloom: { enabled: false }, grain: { enabled: false }, aa: 'fxaa' } },
  medium: { pixelRatio: 1.25, pixels: 1920 * 1080, shadowSize: 2048, shadowHz: 24, sky: true,
    post: { enabled: true, ao: { enabled: false }, bloom: { enabled: false }, grain: { enabled: false }, aa: 'fxaa' } },
  high: { pixelRatio: 2, pixels: 2560 * 1440, shadowSize: 4096, shadowHz: 30, sky: true,
    post: { enabled: true, ao: { enabled: true }, bloom: { enabled: true }, grain: { enabled: true }, aa: 'smaa' } },
} satisfies Record<GraphicsQuality, { pixelRatio: number; pixels: number; shadowSize: number; shadowHz: number; sky: boolean; post: PostPatch }>

export function readGraphicsPreference(): GraphicsPreference {
  try {
    const value = localStorage.getItem(GRAPHICS_KEY)
    if (value === 'low' || value === 'medium' || value === 'high') return value
  } catch { /* Storage can be unavailable in private/embedded browsing. */ }
  return 'auto'
}

export function saveGraphicsPreference(value: GraphicsPreference): void {
  try { localStorage.setItem(GRAPHICS_KEY, value) } catch { /* Session setting still works. */ }
}

export function initialAutoQuality(device: { backend: string; cores?: number; memory?: number }): GraphicsQuality {
  return device.backend === 'webgl2' || (device.cores !== undefined && device.cores <= 4) ||
    (device.memory !== undefined && device.memory <= 4) ? 'low' : 'medium'
}

export function graphicsPixelRatio(quality: GraphicsQuality, dpr: number, width: number, height: number, scale = 1): number {
  const profile = GRAPHICS_PROFILES[quality]
  return Math.min(dpr || 1, profile.pixelRatio, Math.sqrt(profile.pixels / Math.max(1, width * height))) * scale
}

/**
 * Resolution rungs the frame can fall back to once the quality ladder has bottomed out. Dropping
 * a rung costs sharpness; missing 60 Hz costs aim. 0.62 is roughly half the pixels of 1.0 and is
 * as far down as the picture stays readable at a playable window size.
 */
export const RENDER_SCALES = [1, 0.85, 0.72, 0.62] as const
/**
 * Frame budget the scaler defends: 20 ms is 50 fps, the floor we promise. Anything tighter
 * mistakes ordinary vsync jitter for a struggling GPU and taxes the picture for nothing.
 */
const SLOW_FRAME = 0.020
/**
 * A frame this quick means the rung above is affordable again. It has to sit *above* the 16.7 ms
 * vsync slot: a display-locked 60 fps frame is 16.7 ms, so a stricter bar would mark a perfect
 * frame as merely adequate and the scaler could never climb back — measured on this map, full
 * resolution and the bottom rung both ran at 58 fps while the player was shown the blurry one.
 */
const FAST_FRAME = 0.0175

export interface Graphics {
  readonly preference: GraphicsPreference
  readonly quality: GraphicsQuality
  /** Multiplier on the profile's pixel ratio, chosen from RENDER_SCALES by the frame budget. */
  readonly renderScale: number
  set(value: GraphicsPreference): void
  onChange(fn: () => void): () => void
  sample(dt: number, active: boolean): void
  reset(): void
}

/** Auto only steps down: no quality oscillation or expensive rebuilds while FPS recovers. */
export function createGraphics(preference: GraphicsPreference, autoQuality: GraphicsQuality): Graphics {
  let quality = preference === 'auto' ? autoQuality : preference
  let warmup = 10, elapsed = 0, slow = 0
  // Resolution scaling runs on its own, shorter clock: it is cheap to change and cheap to undo,
  // unlike a quality step which rebuilds shadow maps and post passes.
  let rung = 0, window_ = 0, missed = 0, met = 0, climbs = 0, scaleWarm = 5
  const listeners = new Set<() => void>()
  const reset = () => { warmup = 10; elapsed = 0; slow = 0; window_ = 0; missed = 0; met = 0; scaleWarm = 5 }
  const announce = () => { for (const fn of listeners) fn() }
  const scaleWindow = (dt: number) => {
    window_ += dt
    if (dt > SLOW_FRAME) missed += dt
    else if (dt < FAST_FRAME) met += dt
    if (window_ < 2) return
    // Half the window has to be genuinely slow before the player loses pixels: a scaler that
    // reacts to a third of the frames will chase every passing hitch down the ladder.
    if (missed / window_ >= .5 && rung < RENDER_SCALES.length - 1) { rung++; window_ = 0; missed = 0; met = 0; announce() }
    // Climbing back needs a near-perfect window, and is capped per session. Every resize
    // reallocates render targets, so a machine that has already proven it cannot hold the rung
    // above keeps its pixels where they are instead of breathing in and out.
    else if (met / window_ >= .9 && rung > 0 && climbs < 4) { rung--; climbs++; window_ = 0; missed = 0; met = 0; announce() }
    else { window_ = 0; missed = 0; met = 0 }
  }
  return {
    get preference() { return preference },
    get quality() { return quality },
    get renderScale() { return RENDER_SCALES[rung] },
    set(value) {
      if (value === preference) return
      preference = value
      quality = value === 'auto' ? autoQuality : value
      saveGraphicsPreference(value)
      reset()
      for (const fn of listeners) fn()
    },
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    reset,
    sample(dt, active) {
      if (preference !== 'auto') return
      // Loading, tab throttling and isolated stalls are not evidence of a weak GPU.
      if (!active || !Number.isFinite(dt) || dt <= 0 || dt > .25) { reset(); return }
      // Resolution first: two seconds of frames is enough to tell a rung that fits from one
      // that does not, and the change is invisible next to a dropped quality profile. It gets a
      // short warm-up of its own — a swap of render targets is cheap, so there is no reason to
      // make the player suffer ten seconds of stutter the way a quality rebuild would.
      if (scaleWarm > 0) scaleWarm -= dt
      else scaleWindow(dt)

      // The quality ladder has no rung below `low`; from here on only resolution moves.
      if (quality === 'low') return
      if (warmup > 0) { warmup -= dt; return }

      elapsed += dt
      if (dt > 1 / 48) slow += dt
      if (elapsed < 6) return
      if (slow / elapsed >= .6) {
        quality = quality === 'high' ? 'medium' : 'low'
        reset()
        for (const fn of listeners) fn()
      } else { elapsed = 0; slow = 0 }
    },
  }
}
