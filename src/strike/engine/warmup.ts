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
  try {
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera)
    else renderer.compile?.(scene, camera)
  } catch {
    // A failed warm-up costs frames, never the match: fall through and let the frame loop compile.
  }
}

/**
 * Compile one object against an existing scene, for players and props that appear after the
 * loading screen is gone. Fire-and-forget: the object stays drawable while the build runs.
 */
export function warmUpObject(renderer: CompilingRenderer, object: Object3D, scene: Scene, camera: Camera): void {
  try {
    if (renderer.compileAsync) void renderer.compileAsync(object, camera, scene).catch(() => {})
    else renderer.compile?.(object, camera, scene)
  } catch {
    // Same rule as above: a warm-up is an optimisation, never a failure path.
  }
}
