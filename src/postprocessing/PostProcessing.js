import {
  WebGLRenderTarget,
  MeshDepthMaterial,
  RGBADepthPacking,
  Vector2,
  Color,
  HalfFloatType
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GradeShader } from './GradeShader.js';
import { DistortionShader } from './DistortionShader.js';
import { LAYER } from '../core/Layers.js';
import { frame } from '../core/FrameUniforms.js';
import { settings } from '../config/settings.js';

const DISTORTION_CLEAR = new Color(0.5, 0.5, 0.0);

/** Bloom source resolution as a fraction of the CSS size. See constructor. */
const BLOOM_SCALE = 0.5;

/**
 * The full render pipeline.
 *
 * Per frame:
 *   1. depth prepass  — opaque WORLD layer into a packed-depth buffer, which
 *                       every VFX shader samples for soft intersections
 *   2. distortion     — DISTORTION layer into an offset buffer
 *   3. composer       — scene → refraction → bloom → tone map → grade
 *
 * Passes 1 and 2 run at half resolution: both are only ever read as smooth,
 * low-frequency data, so full resolution would be wasted fill rate.
 */
export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.gl = renderer.gl;
    this.scene = scene;
    this.camera = camera;

    const size = this.gl.getSize(new Vector2());
    const pixelRatio = this.gl.getPixelRatio();
    const width = Math.floor(size.x * pixelRatio);
    const height = Math.floor(size.y * pixelRatio);

    /* ---- auxiliary buffers ---- */
    this.depthTarget = new WebGLRenderTarget(Math.floor(width / 2), Math.floor(height / 2));
    this.depthTarget.texture.generateMipmaps = false;
    this.depthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });

    this.distortionTarget = new WebGLRenderTarget(Math.floor(width / 2), Math.floor(height / 2), {
      type: HalfFloatType
    });
    this.distortionTarget.texture.generateMipmaps = false;

    frame.uSceneDepth.value = this.depthTarget.texture;
    frame.uCameraNear.value = camera.near;
    frame.uCameraFar.value = camera.far;
    frame.uResolution.value.set(width, height);

    /* ---- composer ---- */
    this.composer = new EffectComposer(this.gl);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(size.x, size.y);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.distortionPass = new ShaderPass(DistortionShader);
    this.distortionPass.uniforms.tDistortion.value = this.distortionTarget.texture;
    this.composer.addPass(this.distortionPass);

    // Bloom at half the CSS size (a quarter of the pixels of a 2× canvas at
    // most). It is a soft halo of strength 0.03: everything in it is blurred
    // over five mips anyway, so the source resolution is invisible in the
    // result, and the mip chain plus the composite are ~4 ms cheaper for it.
    this.bloomPass = new UnrealBloomPass(
      new Vector2(Math.floor(size.x * BLOOM_SCALE), Math.floor(size.y * BLOOM_SCALE)),
      settings.post.bloomStrength,
      settings.post.bloomRadius,
      settings.post.bloomThreshold
    );
    this.composer.addPass(this.bloomPass);
    // addPass resizes to the composer buffer; restore the cheaper bloom budget.
    this.bloomPass.setSize(Math.max(2, Math.floor(size.x * BLOOM_SCALE)), Math.max(2, Math.floor(size.y * BLOOM_SCALE)));

    // Tone mapping + sRGB conversion + grading in one pass. The grade pass
    // renders to the canvas, so three compiles it with the renderer's tone
    // mapping operator and output transfer (see GradeShader). Everything
    // before it is linear HDR. This replaced a separate OutputPass: at 2×
    // pixel ratio that was a full-resolution read/write of ~4.5 MP per frame.
    this.gradePass = new ShaderPass(GradeShader);
    this.gradePass.material.toneMapped = true;
    this.gradePass.uniforms.uFlashColor.value = new Color(1, 1, 1);
    this.gradePass.renderToScreen = true;
    this.composer.addPass(this.gradePass);

    this._clearColor = new Color();
  }

  /** Opaque depth for soft particles. */
  _renderDepth() {
    const gl = this.gl;
    const scene = this.scene;
    const camera = this.camera;

    const previousBackground = scene.background;
    const previousOverride = scene.overrideMaterial;
    const mask = camera.layers.mask;
    gl.getClearColor(this._clearColor);
    const previousAlpha = gl.getClearAlpha();

    scene.background = null;
    scene.overrideMaterial = this.depthMaterial;
    camera.layers.set(LAYER.WORLD);

    gl.setRenderTarget(this.depthTarget);
    gl.setClearColor(0xffffff, 1); // "infinitely far"
    gl.clear();
    gl.render(scene, camera);

    scene.background = previousBackground;
    scene.overrideMaterial = previousOverride;
    camera.layers.mask = mask;
    gl.setClearColor(this._clearColor, previousAlpha);
  }

  /** Screen-space refraction offsets. */
  _renderDistortion() {
    const gl = this.gl;
    const scene = this.scene;
    const camera = this.camera;

    const previousBackground = scene.background;
    const mask = camera.layers.mask;
    gl.getClearColor(this._clearColor);
    const previousAlpha = gl.getClearAlpha();

    scene.background = null;
    camera.layers.set(LAYER.DISTORTION);

    gl.setRenderTarget(this.distortionTarget);
    gl.setClearColor(DISTORTION_CLEAR, 0); // 0.5 = "no offset", alpha 0 = no coverage
    gl.clear();
    const callsBefore = gl.info.render.calls;
    gl.render(scene, camera);
    // Nothing on the DISTORTION layer this frame → the buffer is all "no
    // offset" and the full-screen refraction pass would copy the image
    // unchanged. Skip it: that is one full-resolution pass saved on every idle
    // frame, which is most of them.
    this._distortionDrawn = gl.info.render.calls > callsBefore;

    scene.background = previousBackground;
    camera.layers.mask = mask;
    gl.setClearColor(this._clearColor, previousAlpha);
    gl.setRenderTarget(null);
  }

  /** Push editor values into the passes. Called once per frame. */
  sync(elapsed, flash) {
    const post = settings.post;

    this.bloomPass.strength = post.bloomStrength;
    this.bloomPass.radius = post.bloomRadius;
    this.bloomPass.threshold = post.bloomThreshold;
    this.bloomPass.enabled = post.enabled && post.bloomStrength > 0.001;

    const u = this.gradePass.uniforms;
    u.toneMappingExposure.value = this.gl.toneMappingExposure;
    u.uTime.value = elapsed;
    u.uAberration.value = post.enabled ? post.chromaticAberration : 0;
    u.uVignette.value = post.enabled ? post.vignette : 0;
    u.uContrast.value = post.enabled ? post.contrast : 1;
    u.uSaturation.value = post.enabled ? post.saturation : 1;
    u.uTemperature.value = post.enabled ? post.temperature : 0;
    u.uLift.value = post.lift;
    u.uGain.value = post.gain;
    u.uGrain.value = post.enabled ? post.grain : 0;
    u.uFlashStrength.value = flash.strength;
    u.uFlashColor.value.copy(flash.color);

    this.distortionPass.uniforms.uScale.value = post.enabled ? post.distortion : 0;
    this.distortionPass.enabled = post.enabled;
  }

  render() {
    this._renderDepth();
    this._renderDistortion();
    // `sync` decides whether the pass is wanted; this decides whether it has
    // anything to do. Note `gl.info.autoReset` is off and App resets it once per
    // frame, so the call count above is this frame's.
    if (!this._distortionDrawn) this.distortionPass.enabled = false;
    // Tone mapping is applied by OutputPass: three automatically disables the
    // in-material tone mapping while rendering into the composer's targets.
    this.composer.render();
    this.gl.setRenderTarget(null);
  }

  setSize(width, height, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(Math.floor(width * BLOOM_SCALE), Math.floor(height * BLOOM_SCALE));

    const w = Math.floor(width * pixelRatio);
    const h = Math.floor(height * pixelRatio);
    this.depthTarget.setSize(Math.max(2, Math.floor(w / 2)), Math.max(2, Math.floor(h / 2)));
    this.distortionTarget.setSize(Math.max(2, Math.floor(w / 2)), Math.max(2, Math.floor(h / 2)));
    frame.uResolution.value.set(w, h);
  }

  dispose() {
    this.depthTarget.dispose();
    this.distortionTarget.dispose();
    this.depthMaterial.dispose();
    this.composer.dispose();
  }
}
