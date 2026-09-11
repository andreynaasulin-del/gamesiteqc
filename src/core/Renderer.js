import {
  WebGLRenderer,
  PCFSoftShadowMap,
  ACESFilmicToneMapping,
  SRGBColorSpace
} from 'three';
import { settings } from '../config/settings.js';

/**
 * Thin wrapper around WebGLRenderer that owns canvas sizing, pixel-ratio
 * budgeting and the render-quality knobs the rest of the app never touches.
 */
export class Renderer {
  constructor(canvas) {
    this.gl = new WebGLRenderer({
      canvas,
      // The scene is rendered into the composer's targets; the canvas only ever
      // receives a full-screen quad. MSAA on it would be resolved every frame
      // for nothing — and it smooths not a single scene edge.
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false
    });

    this.gl.setPixelRatio(this.targetPixelRatio());
    this.gl.setSize(window.innerWidth, window.innerHeight, false);

    // Unmasked GPU name ("ANGLE (Apple, ANGLE Metal Renderer: Apple M1, ...)")
    // for the quality governor's first guess. Empty when the browser hides it.
    this.gpuName = Renderer.readGpuName(this.gl.getContext());

    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFSoftShadowMap;
    // The frame renders the scene several times (depth prepass, distortion,
    // contact shadows, main pass). Automatic updates would rebuild the cascade
    // shadow maps for every one of them, so the app flags a single update per
    // frame instead.
    this.gl.shadowMap.autoUpdate = false;

    // Tone mapping is executed by the post pipeline's final grade pass, which
    // three compiles against these two properties because it renders to screen.
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = settings.post.exposure;
    this.gl.outputColorSpace = SRGBColorSpace;

    this.gl.info.autoReset = false;

    this._onResize = null;
  }

  /**
   * Upper bound on the device pixel ratio actually rendered. Owned by the
   * quality governor: dropping it from 1.75 to 1.0 on a 2× screen is roughly a
   * 3× cut in fill rate, and fill is where this pipeline spends its time.
   */
  pixelRatioCap = 1.75;

  /**
   * Upper bound on rendered pixels per frame, whatever the tier says.
   *
   * The volumetric casts are raymarched per pixel, so their cost is close to
   * linear in this number. Measured on an M1 (Chrome, 944×648 CSS canvas):
   * 0.96 MP (ratio 1.25) held 56–60 FPS with two casts and six stacked;
   * 1.38 MP (ratio 1.5) fell to 35 and 23. Above roughly one megapixel the
   * governor would climb to `high`, stall, drop, climb again — visible as a
   * periodic stutter. The budget removes that oscillation: `high` still buys
   * sharper shadows and denser particles, never more pixels than this.
   *
   * Editor-exposed so a stronger machine can lift it.
   */
  static PIXEL_BUDGET = 1_050_000;

  /** Unmasked GPU string, or '' when the browser withholds it. Never throws. */
  static readGpuName(context) {
    try {
      const info = context?.getExtension?.('WEBGL_debug_renderer_info');
      const name = info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : context?.getParameter?.(context.RENDERER);
      return typeof name === 'string' ? name : '';
    } catch {
      return '';
    }
  }

  /**
   * The ratio actually rendered: the device's, then the tier cap, then the
   * pixel budget for the current canvas size.
   */
  targetPixelRatio() {
    const device = window.devicePixelRatio || 1;
    const budget = settings.quality?.pixelBudget ?? Renderer.PIXEL_BUDGET;
    const area = Math.max(1, window.innerWidth * window.innerHeight);
    const fits = Math.sqrt(budget / area);
    // Never below 0.75: the image must stay legible on a small phone canvas.
    return Math.max(0.75, Math.min(device, this.pixelRatioCap, fits));
  }

  /** Change the cap and re-run the resize path so every buffer follows. */
  setPixelRatioCap(cap) {
    if (cap === this.pixelRatioCap) return;
    this.pixelRatioCap = cap;
    this.handleResize();
  }

  get domElement() {
    return this.gl.domElement;
  }

  get size() {
    return this.gl.getSize({ width: 0, height: 0 });
  }

  onResize(callback) {
    this._onResize = callback;
    window.addEventListener('resize', this.handleResize, { passive: true });
  }

  handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setPixelRatio(this.targetPixelRatio());
    this.gl.setSize(w, h, false);
    this._onResize?.(w, h, this.gl.getPixelRatio());
  };

  /** Called once per frame before rendering so the editor can drive exposure. */
  syncSettings() {
    this.gl.toneMappingExposure = settings.post.exposure;
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
    this.gl.dispose();
  }
}
