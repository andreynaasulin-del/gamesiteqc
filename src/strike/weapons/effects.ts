import {
  AdditiveBlending,
  Camera,
  Color,
  CylinderGeometry,
  DataTexture,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  Vector3,
} from 'three'
import { TEAMS } from '../config'
import type { TeamId } from '../types'

export interface Effects {
  muzzle(position: Vector3, direction: Vector3, team: TeamId): void
  /**
   * Someone else's shot, seen from outside: a bright team-coloured flash on their muzzle and a
   * small puff of smoke drifting up off the bore. Bigger and shorter than the first-person
   * `muzzle`, because this one is read across a room rather than at arm's length.
   */
  remoteMuzzle(position: Vector3, direction: Vector3, team: TeamId): void
  /** Thin additive streak from `origin` along `direction`; alive for ~2 frames. */
  tracer(origin: Vector3, direction: Vector3, team: TeamId): void
  impact(position: Vector3, normal: Vector3, team: TeamId): void
  splat(position: Vector3, normal: Vector3, team: TeamId): void
  /**
   * A paint grenade going off: one big flash plus paint thrown in EVERY direction. Spherical,
   * not hemispherical like `splat`, because a shell can burst mid-air and paint that only ever
   * falls downwards reads as a puddle rather than a burst.
   */
  burst(position: Vector3, team: TeamId): void
  update(dt: number): void
  dispose(): void
}

/**
 * One live puff/droplet/flash. Deliberately plain data: the whole pool is drawn as a single
 * `InstancedMesh`, so a particle owns no scene object of its own.
 */
interface Particle {
  position: Vector3
  velocity: Vector3
  /** Quad edge in metres. Billboards are square before the shrink/swell is applied. */
  size: number
  life: number
  maxLife: number
  gravity: number
  /** Billboards that stand in for a muzzle flash shrink instead of growing. */
  flash: boolean
  color: Color
}

interface Tracer {
  position: Vector3
  quaternion: Quaternion
  life: number
  color: Color
}

const PARTICLE_COUNT = 96
const TRACER_COUNT = 10
/** Metres of streak drawn behind the ball. */
const TRACER_LENGTH = 1.5
const TRACER_LIFE = 0.05
const TRACER_START = 0.12
/** Puff spawns this far down the bore: a sprite sitting on the eye fills the whole screen. */
const MUZZLE_STANDOFF = 0.12
/** A third-person flash sits right at the bore exit and can be as big as it really is. */
const REMOTE_STANDOFF = 0.06
const REMOTE_FLASH_LIFE = 0.04
const REMOTE_FLASH_SIZE = 0.3
/** Droplets thrown by one grenade burst, and the size of the flash at its centre. */
const BURST_DROPS = 26
const BURST_FLASH_SIZE = 1.5
/** Smoke, not paint: a dim grey that reads as a puff through the additive blend. */
const SMOKE_COLOR = 0x6e727c
const SMOKE_LIFE = 0.5
const scratchPoint = new Vector3()
const UP = new Vector3(0, 1, 0)
const tangent = new Vector3()
const bitangent = new Vector3()
const scratchDirection = new Vector3()
const scratchMatrix = new Matrix4()
const scratchColor = new Color()
const scratchScale = new Vector3()
const NO_ROTATION = new Quaternion()
/** Parked instances are scaled to nothing: an `InstancedMesh` has no per-instance `visible`. */
const HIDDEN = new Matrix4().makeScale(0, 0, 0)

export function createEffects(scene: Scene, camera?: Camera): Effects {
  const texture = makeSoftTexture()

  // One draw call for every puff, droplet and flash in the game.
  //
  // These were 96 `Sprite`s, each with its own `SpriteMaterial` — 96 materials, 96 draw calls,
  // and no batching possible because three sees 96 distinct materials. A single grenade burst
  // lights 27 of them at once. Measured with the pool fully visible: 0.9 ms a frame of pure
  // driver overhead, gone entirely once the pool became one instanced quad.
  //
  // The per-particle tint (team colour, smoke grey) and fade live in `instanceColor`, which is
  // why this can be one material at all. Additive blending makes that exact rather than
  // approximate: `dst + src.rgb * src.a`, so folding the alpha into the colour is the same
  // arithmetic the sprite material was doing, one multiply earlier.
  const particleGeometry = new PlaneGeometry(1, 1)
  const particleMaterial = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
  const particleMesh = new InstancedMesh(particleGeometry, particleMaterial, PARTICLE_COUNT)
  // Particles are spread across the whole level, so the pool's bounds are the level's bounds:
  // culling it as one object would pop the far half of a burst out of existence.
  particleMesh.frustumCulled = false
  particleMesh.renderOrder = 5
  particleMesh.count = 0
  scene.add(particleMesh)

  const particles: Particle[] = []
  for (let index = 0; index < PARTICLE_COUNT; index++) {
    particleMesh.setMatrixAt(index, HIDDEN)
    // Allocating `instanceColor` NOW, before the warm-up runs, is not tidiness: three only
    // creates that buffer on the first `setColorAt`, and its presence is a shader define. Leave
    // it null and `warmUpScene` compiles a program with no per-instance colour, then the first
    // gunshot allocates the buffer, invalidates that program and compiles a second one mid-frame
    // — a ~40 ms freeze on the opening shot of every match.
    particleMesh.setColorAt(index, scratchColor.setRGB(0, 0, 0))
    particles.push({
      position: new Vector3(),
      velocity: new Vector3(),
      size: 0,
      life: 0,
      maxLife: 0,
      gravity: 0,
      flash: false,
      color: new Color(),
    })
  }

  // One tapered cylinder per live tracer, base at the muzzle, tip 1.5 m downrange. Instanced for
  // the same reason as the particles, and it also lets a burst of fire draw as one call.
  const tracerGeometry = new CylinderGeometry(0.002, 0.007, 1, 6, 1, true)
  tracerGeometry.translate(0, 0.5, 0)
  const tracerMaterial = new MeshBasicMaterial({
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  const tracerMesh = new InstancedMesh(tracerGeometry, tracerMaterial, TRACER_COUNT)
  tracerMesh.frustumCulled = false
  tracerMesh.renderOrder = 5
  tracerMesh.count = 0
  scene.add(tracerMesh)

  const tracers: Tracer[] = []
  for (let index = 0; index < TRACER_COUNT; index++) {
    tracerMesh.setMatrixAt(index, HIDDEN)
    // Same reason as the particle pool: `instanceColor` has to exist before the warm-up, or the
    // first tracer recompiles the program mid-shot.
    tracerMesh.setColorAt(index, scratchColor.setRGB(0, 0, 0))
    tracers.push({ position: new Vector3(), quaternion: new Quaternion(), life: 0, color: new Color() })
  }
  let tracerCursor = 0
  /** Highest index ever used, so `update` never walks 96 slots to animate three droplets. */
  let particleHighWater = 0
  let tracerHighWater = 0

  let cursor = 0
  let randomState = 0x6d2b79f5
  const random = () => {
    randomState = Math.imul(randomState ^ randomState >>> 15, randomState | 1)
    return ((randomState ^ randomState >>> 13) >>> 0) / 4294967296
  }
  const nextParticle = () => {
    const particle = particles[cursor]
    if (cursor >= particleHighWater) {
      particleHighWater = cursor + 1
      particleMesh.count = particleHighWater
    }
    cursor = (cursor + 1) % particles.length
    return particle
  }
  const launch = (
    particle: Particle,
    position: Vector3,
    velocity: Vector3,
    team: TeamId,
    life: number,
    size: number,
    gravity: number,
    flash = false,
    colorHex?: number,
  ) => {
    particle.position.copy(position)
    particle.size = size
    particle.color.setHex(colorHex ?? TEAMS[team].colorHex)
    particle.velocity.copy(velocity)
    particle.life = particle.maxLife = life
    particle.gravity = gravity
    particle.flash = flash
  }

  const effects: Effects = {
    muzzle(position, direction, team) {
      scratchDirection.copy(direction).normalize()
      tangent.set(0, 1, 0).cross(scratchDirection)
      if (tangent.lengthSq() < 1e-5) tangent.set(1, 0, 0)
      else tangent.normalize()
      bitangent.crossVectors(scratchDirection, tangent).normalize()
      // One bright, short-lived core so the shot reads even in daylight. Kept small: the
      // caller's `position` can be a hand's length from the eye, and an additive sprite that
      // close fills the screen.
      scratchPoint.copy(position).addScaledVector(scratchDirection, MUZZLE_STANDOFF)
      const core = nextParticle()
      core.velocity.copy(scratchDirection).multiplyScalar(0.35)
      launch(core, scratchPoint, core.velocity, team, 0.045, 0.10, 0, true)
      // ...then the soft puff drifting off the muzzle.
      for (let index = 0; index < 3; index++) {
        const particle = nextParticle()
        particle.velocity.copy(scratchDirection).multiplyScalar(0.6 + random())
          .addScaledVector(tangent, (random() - 0.5) * 0.5)
          .addScaledVector(bitangent, (random() - 0.5) * 0.5)
        launch(particle, scratchPoint, particle.velocity, team, 0.16, 0.07 + random() * 0.05, 0)
      }
      effects.tracer(position, scratchDirection, team)
    },
    remoteMuzzle(position, direction, team) {
      scratchDirection.copy(direction).normalize()
      tangent.set(0, 1, 0).cross(scratchDirection)
      if (tangent.lengthSq() < 1e-5) tangent.set(1, 0, 0)
      else tangent.normalize()
      bitangent.crossVectors(scratchDirection, tangent).normalize()
      scratchPoint.copy(position).addScaledVector(scratchDirection, REMOTE_STANDOFF)
      const core = nextParticle()
      core.velocity.copy(scratchDirection).multiplyScalar(0.5)
      launch(core, scratchPoint, core.velocity, team, REMOTE_FLASH_LIFE, REMOTE_FLASH_SIZE, 0, true)
      // Three puffs that rise off the bore (negative gravity) and swell as they thin out.
      for (let index = 0; index < 3; index++) {
        const particle = nextParticle()
        particle.velocity.copy(scratchDirection).multiplyScalar(0.35 + random() * 0.4)
          .addScaledVector(UP, 0.45 + random() * 0.35)
          .addScaledVector(tangent, (random() - 0.5) * 0.35)
          .addScaledVector(bitangent, (random() - 0.5) * 0.35)
        launch(particle, scratchPoint, particle.velocity, team, SMOKE_LIFE,
          0.05 + random() * 0.05, -0.25, false, SMOKE_COLOR)
      }
      effects.tracer(position, scratchDirection, team)
    },
    tracer(origin, direction, team) {
      const entry = tracers[tracerCursor]
      if (tracerCursor >= tracerHighWater) {
        tracerHighWater = tracerCursor + 1
        tracerMesh.count = tracerHighWater
      }
      tracerCursor = (tracerCursor + 1) % tracers.length
      scratchDirection.copy(direction).normalize()
      // Start a little downrange: at the eye the base of the cone would smear across the
      // near plane and read as a blob on the crosshair.
      entry.position.copy(origin).addScaledVector(scratchDirection, TRACER_START)
      entry.quaternion.setFromUnitVectors(UP, scratchDirection)
      entry.color.setHex(TEAMS[team].colorHex)
      entry.life = TRACER_LIFE
    },
    impact(position, normal, team) {
      // A readable central splash plus droplets. Uses the existing particle pool.
      const core = nextParticle()
      scratchDirection.set(0, .2, 0)
      launch(core, position, scratchDirection, team, .24, .28, 0, false)
      effects.splat(position, normal, team)
    },
    splat(position, normal, team) {
      tangent.set(0, 1, 0).cross(normal)
      if (tangent.lengthSq() < 1e-5) tangent.set(1, 0, 0)
      else tangent.normalize()
      bitangent.crossVectors(normal, tangent).normalize()
      const count = 6 + Math.floor(random() * 5)
      for (let index = 0; index < count; index++) {
        const particle = nextParticle()
        particle.velocity.copy(normal).multiplyScalar(0.5 + random() * 1.7)
          .addScaledVector(tangent, (random() - 0.5) * 2)
          .addScaledVector(bitangent, (random() - 0.5) * 2)
        launch(particle, position, particle.velocity, team, 0.45, 0.04 + random() * 0.04, 5.5)
      }
    },
    burst(position, team) {
      // The flash first: short, bright and large, so a burst behind you still registers in
      // peripheral vision — a grenade you did not notice going off is a bug report.
      const core = nextParticle()
      scratchDirection.set(0, 0, 0)
      launch(core, position, scratchDirection, team, 0.14, BURST_FLASH_SIZE, 0, true)
      for (let index = 0; index < BURST_DROPS; index++) {
        const particle = nextParticle()
        // Evenly distributed on the sphere (z uniform, not the angle: picking both angles
        // uniformly bunches the paint at the poles).
        const theta = random() * Math.PI * 2
        const z = random() * 2 - 1
        const radius = Math.sqrt(Math.max(0, 1 - z * z))
        particle.velocity
          .set(Math.cos(theta) * radius, z, Math.sin(theta) * radius)
          .multiplyScalar(3 + random() * 5)
        launch(particle, position, particle.velocity, team,
          0.5 + random() * 0.35, 0.07 + random() * 0.07, 7)
      }
    },
    update(dt) {
      // Billboarding by hand, because these are quads rather than sprites: every particle takes
      // the camera's orientation, which is exactly what `Sprite` did in the renderer. Without a
      // camera (headless tests, the sandbox before its first frame) they stay axis-aligned —
      // the simulation is identical, only the facing differs.
      const facing = camera ? camera.quaternion : NO_ROTATION
      let particlesMoved = false
      for (let index = 0; index < particleHighWater; index++) {
        const particle = particles[index]
        if (particle.life <= 0) continue
        particle.life -= dt
        particlesMoved = true
        if (particle.life <= 0) {
          particleMesh.setMatrixAt(index, HIDDEN)
          continue
        }
        particle.velocity.y -= particle.gravity * dt
        particle.position.addScaledVector(particle.velocity, dt)
        particle.size *= 1 + dt * (particle.flash ? -6 : 1.6)
        const alpha = particle.life / particle.maxLife
        // The sprite material multiplied by opacity twice over (once into the colour, once as
        // the blend's source factor), so the fade was quadratic. Squaring here keeps the look
        // the artists signed off on instead of quietly brightening every puff.
        const fade = particle.flash ? alpha * alpha : alpha * alpha * 0.7225
        scratchScale.setScalar(particle.size)
        scratchMatrix.compose(particle.position, facing, scratchScale)
        particleMesh.setMatrixAt(index, scratchMatrix)
        particleMesh.setColorAt(index, scratchColor.copy(particle.color).multiplyScalar(fade))
      }
      if (particlesMoved) {
        particleMesh.instanceMatrix.needsUpdate = true
        if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true
      }

      let tracersMoved = false
      for (let index = 0; index < tracerHighWater; index++) {
        const entry = tracers[index]
        if (entry.life <= 0) continue
        entry.life -= dt
        tracersMoved = true
        if (entry.life <= 0) {
          tracerMesh.setMatrixAt(index, HIDDEN)
          continue
        }
        const alpha = entry.life / TRACER_LIFE
        scratchScale.set(1, TRACER_LENGTH, 1)
        scratchMatrix.compose(entry.position, entry.quaternion, scratchScale)
        tracerMesh.setMatrixAt(index, scratchMatrix)
        tracerMesh.setColorAt(index, scratchColor.copy(entry.color).multiplyScalar(alpha * alpha * 0.7225))
      }
      if (tracersMoved) {
        tracerMesh.instanceMatrix.needsUpdate = true
        if (tracerMesh.instanceColor) tracerMesh.instanceColor.needsUpdate = true
      }
    },
    dispose() {
      scene.remove(particleMesh)
      scene.remove(tracerMesh)
      particleMesh.dispose()
      tracerMesh.dispose()
      particleGeometry.dispose()
      particleMaterial.dispose()
      tracerGeometry.dispose()
      tracerMaterial.dispose()
      texture.dispose()
    },
  }
  return effects
}

function makeSoftTexture(): DataTexture {
  const size = 32
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1
      const dy = (y + 0.5) / size * 2 - 1
      const alpha = Math.max(0, 1 - Math.hypot(dx, dy)) ** 2
      const offset = (y * size + x) * 4
      data[offset] = data[offset + 1] = data[offset + 2] = 255
      data[offset + 3] = Math.round(alpha * 255)
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.needsUpdate = true
  return texture
}
