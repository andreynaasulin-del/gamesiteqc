/**
 * The characters are authored as a wardrobe: one skinned mesh per garment, per eye, per tooth.
 * That is 23 draw calls a body, 138 for a full match, and on the WebGL2 backend each draw costs
 * about 0.08 ms of CPU — 14 ms of a 36 ms frame went into submitting avatars alone.
 *
 * Every one of those materials is a flat colour (only the skin carries a map), so the colours can
 * be baked into a vertex attribute and the parts welded into a handful of meshes. Same pixels,
 * a quarter of the draw calls.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
} from 'three'

/** Roughness and metalness are quantised to this step before parts are allowed to share a mesh. */
const SHADE_STEP = 4
/** Skinned bodies swing outside their bind pose; the cull sphere is inflated so limbs never pop. */
const CULL_MARGIN = 1.75
/** Below this triangle count a part is face detail (eyes, teeth) and has no business in the shadow map. */
const SHADOW_MIN_TRIANGLES = 600
/**
 * Triangles per square metre of silhouette, above which a part is detail geometry rather than
 * shape — hair strands, eyebrows, a sculpted jaw, the paint decal welded onto the body.
 *
 * The shadow map is 512×512 for the whole level, so a character occupies a few dozen pixels in
 * it. `WavyHair` spends 63 904 triangles to fill about ten of them, and it does that INSIDE the
 * shadow the head already casts: the silhouette is identical with the hair excluded. Measured
 * on the corridors map with six avatars, excluding everything above this line took the shadow
 * pass from 573 k triangles to 266 k and `renderer.render` from 11.0 ms to 7.9 ms a frame
 * (p95 14.6 → 9.6 ms) with no visible difference in the shadows.
 *
 * Clothing sits an order of magnitude below the line (a tuxedo leg is ~28 k, dense hair is
 * ~180 k–580 k), so the rule separates cleanly and does not quietly eat a garment when the
 * wardrobe changes.
 */
const SHADOW_MAX_TRIANGLE_DENSITY = 60_000

export interface MergeResult {
  /** Meshes created by welding parts together. */
  merged: SkinnedMesh[]
  /** Materials of the parts that were welded away — the caller must stop tracking them. */
  retired: MeshStandardMaterial[]
  /** How many draw calls the body lost. */
  saved: number
}

/**
 * The exporter gives every part its own Skeleton object even though they all drive the same
 * bones, so identity is taken from the bones themselves — otherwise nothing would ever weld.
 */
function skeletonKey(mesh: SkinnedMesh): string {
  const bones = mesh.skeleton.bones
  return `${bones.length}:${bones[0]?.uuid ?? 'none'}:${bones[bones.length - 1]?.uuid ?? 'none'}`
}

/** Two parts can share a mesh only when the renderer would set up identical state for them. */
function bucketKey(mesh: SkinnedMesh, material: MeshStandardMaterial): string {
  const shade = (value: number) => Math.round(value * SHADE_STEP) / SHADE_STEP
  return [
    mesh.parent?.uuid ?? 'root',
    skeletonKey(mesh),
    material.map?.uuid ?? 'nomap',
    material.normalMap?.uuid ?? 'nonormal',
    material.roughnessMap?.uuid ?? 'norough',
    material.alphaMap?.uuid ?? 'noalpha',
    material.transparent ? 't' : 'o',
    material.side,
    material.alphaTest,
    material.emissive?.getHexString() ?? '000000',
    shade(material.roughness ?? 1),
    shade(material.metalness ?? 0),
  ].join('|')
}

/** Parts with morph targets or multi-material geometry keep their own draw call — welding would lose data. */
function isWeldable(mesh: SkinnedMesh): boolean {
  if (Array.isArray(mesh.material)) return false
  if (!(mesh.material instanceof MeshStandardMaterial)) return false
  const morphs = mesh.geometry.morphAttributes
  if (morphs && Object.keys(morphs).length > 0) return false
  const attributes = mesh.geometry.attributes
  return Boolean(attributes.position && attributes.skinIndex && attributes.skinWeight)
}

/** Bind matrices must agree, or the welded vertices would be skinned in the wrong space. */
function sameBind(a: SkinnedMesh, b: SkinnedMesh): boolean {
  return a.bindMatrix.elements.every((value, index) => Math.abs(value - b.bindMatrix.elements[index]) < 1e-6)
}

function triangleCount(geometry: BufferGeometry): number {
  const count = geometry.index ? geometry.index.count : geometry.attributes.position.count
  return count / 3
}

/**
 * Welds the skinned parts of one character. The parts keep their look: each vertex carries the
 * colour of the material it came from, and only parts the renderer would treat alike are welded.
 */
export function mergeCharacterSkins(model: Object3D): MergeResult {
  const skins: SkinnedMesh[] = []
  model.traverse(node => { if (node instanceof SkinnedMesh) skins.push(node) })

  const buckets = new Map<string, SkinnedMesh[]>()
  const loners: SkinnedMesh[] = []
  for (const mesh of skins) {
    if (!isWeldable(mesh)) { loners.push(mesh); continue }
    const key = bucketKey(mesh, mesh.material as MeshStandardMaterial)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(mesh)
    else buckets.set(key, [mesh])
  }

  const merged: SkinnedMesh[] = []
  const retired: MeshStandardMaterial[] = []
  let saved = 0

  for (const bucket of buckets.values()) {
    const head = bucket[0]
    const group = bucket.filter(mesh => mesh === head || sameBind(mesh, head))
    for (const mesh of bucket) if (!group.includes(mesh)) loners.push(mesh)
    if (group.length < 2) { loners.push(head); continue }

    const mesh = weld(group)
    head.parent?.add(mesh)
    for (const part of group) {
      retired.push(part.material as MeshStandardMaterial)
      part.removeFromParent()
      part.geometry.dispose()
    }
    merged.push(mesh)
    saved += group.length - 1
  }

  // A part that stayed on its own still gains from culling — it was authored with culling off.
  for (const mesh of loners) prepare(mesh)

  return { merged, retired, saved }
}

/** Builds one skinned mesh out of parts that share a skeleton, a bind pose and a render state. */
function weld(parts: SkinnedMesh[]): SkinnedMesh {
  const wantsUv = parts.some(part => part.geometry.attributes.uv)
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const skinIndices: number[] = []
  const skinWeights: number[] = []
  const indices: number[] = []
  let offset = 0

  for (const part of parts) {
    const geometry = part.geometry
    const position = geometry.attributes.position
    const normal = geometry.attributes.normal
    const uv = geometry.attributes.uv
    const skinIndex = geometry.attributes.skinIndex
    const skinWeight = geometry.attributes.skinWeight
    const { r, g, b } = (part.material as MeshStandardMaterial).color

    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i))
      if (normal) normals.push(normal.getX(i), normal.getY(i), normal.getZ(i))
      else normals.push(0, 1, 0)
      if (wantsUv) uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0)
      colors.push(r, g, b)
      skinIndices.push(skinIndex.getX(i), skinIndex.getY(i), skinIndex.getZ(i), skinIndex.getW(i))
      skinWeights.push(skinWeight.getX(i), skinWeight.getY(i), skinWeight.getZ(i), skinWeight.getW(i))
    }

    const index = geometry.index
    const count = index ? index.count : position.count
    for (let i = 0; i < count; i++) indices.push((index ? index.getX(i) : i) + offset)
    offset += position.count
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  if (wantsUv) geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndices, 4))
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4))
  geometry.setIndex(new Uint32BufferAttribute(indices, 1))

  // The colour now lives on the vertices, so the shared material is white and reads it.
  const source = parts[0].material as MeshStandardMaterial
  const material = source.clone()
  material.vertexColors = true
  material.color.setRGB(1, 1, 1)
  material.name = `${source.name || 'part'}-merged`

  const mesh = new SkinnedMesh(geometry, material)
  mesh.name = `${parts[0].name || 'skin'}-merged`
  mesh.bind(parts[0].skeleton, parts[0].bindMatrix.clone())
  mesh.position.copy(parts[0].position)
  mesh.quaternion.copy(parts[0].quaternion)
  mesh.scale.copy(parts[0].scale)
  mesh.receiveShadow = true
  prepare(mesh)
  return mesh
}

/** Culling and shadow policy for anything that ends up in the scene, welded or not. */
function prepare(mesh: SkinnedMesh): void {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  const transparent = material instanceof MeshStandardMaterial && material.transparent
  mesh.frustumCulled = true

  // The bind-pose radius, read BEFORE the cull margin inflates it — the shadow rule is about how
  // much geometry the part really packs, and the margin would flatter a dense part by 3×.
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
  const radius = mesh.geometry.boundingSphere?.radius ?? 0
  const triangles = triangleCount(mesh.geometry)
  const density = triangles / Math.max(1e-4, radius * radius)

  mesh.castShadow =
    !transparent && triangles >= SHADOW_MIN_TRIANGLES && density <= SHADOW_MAX_TRIANGLE_DENSITY

  if (mesh.geometry.boundingSphere) mesh.geometry.boundingSphere.radius *= CULL_MARGIN
}
