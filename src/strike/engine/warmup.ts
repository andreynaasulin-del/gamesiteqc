/**
 * A GPU program is only built when the renderer first meets the material that needs it, and the
 * build happens on the frame that wanted to draw it. In a match that means the opening seconds
 * pay for every wall, every avatar and every paint splat the player happens to look at first:
 * measured on this map, the first twenty seconds ran at 17-19 fps and the same scene settled at
 * 58 once every program existed.
 *
 * So we build them while the loading veil is still up, and again for anything that joins the
 * match late — a bot spawning mid-round should not cost the player a 300 ms freeze.
 */
import type { Camera, Object3D, Scene } from 'three'

/** The subset of the renderer this module needs; keeps the helpers testable without a GPU. */
export interface CompilingRenderer {
  compileAsync?(scene: Object3D, camera: Camera, targetScene?: Scene | null): Promise<unknown>
  compile?(scene: Object3D, camera: Camera, targetScene?: Scene | null): unknown
}

/**
 * Compile every program the current scene needs. Resolves when the GPU is ready to draw it,
 * or immediately when the renderer offers no compilation hook (headless tests, older backends).
 */
export async function warmUpScene(renderer: CompilingRenderer, scene: Scene, camera: Camera): Promise<void> {
  if (!renderer.compileAsync) {
    try { renderer.compile?.(scene, camera) } catch { /* the frame loop compiles instead */ }
    return
  }
  const restore = hideSprites(scene)
  try {
    await renderer.compileAsync(scene, camera)
  } catch {
    // A failed warm-up costs frames, never the match: fall through and let the frame loop compile.
  } finally {
    restore()
  }
}

/**
 * Compile one object against an existing scene, for players and props that appear after the
 * loading screen is gone. Fire-and-forget: the object stays drawable while the build runs.
 */
export function warmUpObject(renderer: CompilingRenderer, object: Object3D, scene: Scene, camera: Camera): void {
  if (!renderer.compileAsync) {
    try { renderer.compile?.(object, camera, scene) } catch { /* same rule as above */ }
    return
  }
  const restore = hideSprites(object)
  try {
    // Same rule as above: a warm-up is an optimisation, never a failure path.
    void renderer.compileAsync(object, camera, scene).catch(() => {}).finally(restore)
  } catch {
    restore()
  }
}

/**
 * Sprites stay out of the async compile. three r185-r187 `compileAsync` yields to the frame loop
 * between registering a material's bindings and writing their `@binding` indices
 * (mrdoob/three.js#34632). A sprite's fresh `CanvasTexture` (name tag, death splat) is uploaded by
 * the real frame in that gap, the two passes disagree, and WebGPU rejects the pipeline:
 * "renderPipeline_SpriteMaterial_*: Binding doesn't exist in [BindGroupLayout]". A sprite program
 * is tiny, so the frame loop builds it synchronously once the sprite is shown again.
 *
 * Sprites are parked by clearing their layer mask, not `visible`: the game drives `visible`
 * (name tag range, death splat) and may flip it while the compile runs, but never touches layers,
 * so restoring the mask cannot undo a game decision. Returns the restore function.
 */
function hideSprites(root: Object3D): () => void {
  const parked: { object: Object3D; mask: number }[] = []
  root.traverse((object) => {
    if ((object as { isSprite?: boolean }).isSprite && object.layers.mask !== 0) {
      parked.push({ object, mask: object.layers.mask })
      object.layers.mask = 0
    }
  })
  let done = false
  return () => {
    if (done) return
    done = true
    for (const { object, mask } of parked) object.layers.mask = mask
  }
}
