/**
 * Paint grenades (W6).
 *
 * A thrown shell that bounces off the house, waits out its fuse and bursts into paint. Two
 * things make it worth its own module rather than a flag on `projectiles.ts`:
 *
 * - it is the only thing in the game that keeps travelling after it touches a wall, so it needs
 *   a bounce integrator (reflect, keep `restitution` of the normal component, scrub the tangent
 *   by `friction`) instead of the paintball's "first hit ends it";
 * - it damages an AREA, so a single throw can score several hits at once. Each one carries its
 *   own `shotId` (`<grenade id>:<victim id>`) because the host's replay protection remembers a
 *   shot id exactly once — one id for the whole burst would have paid out for the first victim
 *   and silently dropped the rest.
 *
 * Authority, exactly as for paintballs: EVERY client simulates the arc (same origin, same
 * velocity, same fuse — see `GrenadeEvent`), and only the thrower's copy resolves damage and
 * reports it to the host. A receiver's copy is paint, sound and a shell to run away from.
 */
import {
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Vector3,
} from 'three'
import { GRENADE, TEAMS } from '../config'
import type { Audio } from '../engine/audio'
import type { GrenadeEvent, HitEvent, Hittable, TeamId, WorldQuery } from '../types'
import type { Decals } from './decals'
import type { Effects } from './effects'

export interface ThrowOptions {
  /**
   * Resolve the burst against `hittables` and report the hits. True only on the client that
   * threw it (the host, for a bot): two clients resolving the same burst would claim the same
   * hits twice, and the second claim is rejected by the host anyway.
   */
  resolveDamage: boolean
}

export interface Grenades {
  /** Put a thrown grenade into the simulation. `event` is what goes over the wire verbatim. */
  spawn(event: GrenadeEvent, opts: ThrowOptions): void
  update(dt: number, hittables: readonly Hittable[]): void
  /** Hits scored by a burst this client resolved. Wired to the same host path as paintballs. */
  onPlayerHit(callback: (hit: HitEvent) => void): () => void
  readonly liveCount: number
  dispose(): void
}

interface Shell {
  active: boolean
  event: GrenadeEvent | null
  resolveDamage: boolean
  position: Vector3
  velocity: Vector3
  /** Seconds left on the fuse. */
  fuse: number
  /** Stopped rolling: still fused, no longer integrated. */
  resting: boolean
  /** Spin, for the mesh only. */
  spin: number
}

/** More than this in the air at once means something is very wrong; the oldest is recycled. */
const MAX_LIVE = 24
/** Never integrate more than this far in one sub-step, or a fast shell tunnels through a wall. */
const MAX_STEP_DISTANCE = 0.25
/** Catch-up on a shell that reached us late, capped: past this the arc is a guess, not a replay. */
const MAX_CATCHUP_S = 0.5
const CATCHUP_STEP_S = 1 / 120
/** Skin left between the shell and the surface it bounced off, so the next ray clears it. */
const SKIN = 1e-3
/** Below this impact speed a bounce makes no sound (a shell settling, not a shell landing). */
const BOUNCE_AUDIBLE_SPEED = 2.5
/** A bounce off a surface at least this upright can put the shell to rest. */
const FLOOR_NORMAL_Y = 0.7

const _direction = new Vector3()
const _next = new Vector3()
const _delta = new Vector3()
const _normal = new Vector3()
const _tangent = new Vector3()
const _closest = new Vector3()
const _chest = new Vector3()
const _toVictim = new Vector3()
const _rayDirection = new Vector3()

export function createGrenades(
  scene: Scene,
  world: WorldQuery,
  decals: Pick<Decals, 'add'>,
  effects: Pick<Effects, 'splat' | 'burst'>,
  audio: Pick<Audio, 'play'>,
): Grenades {
  const geometry = new IcosahedronGeometry(GRENADE.radius, 1)
  const materials: Record<TeamId, MeshStandardMaterial> = {
    a: makeMaterial('a'),
    b: makeMaterial('b'),
  }
  const shells: Shell[] = Array.from({ length: MAX_LIVE }, () => {
    const shell: Shell = {
      active: false,
      event: null,
      resolveDamage: false,
      position: new Vector3(),
      velocity: new Vector3(),
      fuse: 0,
      resting: false,
      spin: 0,
    }
    return shell
  })
  const meshes: Mesh[] = shells.map(() => {
    const mesh = new Mesh(geometry, materials.a)
    mesh.visible = false
    mesh.frustumCulled = false
    scene.add(mesh)
    return mesh
  })
  const callbacks = new Set<(hit: HitEvent) => void>()
  let cursor = 0
  let liveCount = 0
  let targets: readonly Hittable[] = []

  function makeMaterial(team: TeamId): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: TEAMS[team].colorHex,
      emissive: TEAMS[team].colorHex,
      // Brighter than a paintball: a live grenade on the floor has to be spotted in a hurry.
      emissiveIntensity: 0.6,
      roughness: 0.5,
    })
  }

  function deactivate(shell: Shell): void {
    if (!shell.active) return
    shell.active = false
    shell.event = null
    liveCount--
  }

  /** Random in 0..1 from a seed, so every client sprays the same burst. */
  function seededRandom(seed: number): () => number {
    let value = seed >>> 0
    return () => {
      value = Math.imul(value ^ value >>> 15, value | 1)
      return ((value ^ value >>> 13) >>> 0) / 4294967296
    }
  }

  /**
   * Paint the room. Rays leave the burst in a deterministic spherical spread and whatever they
   * land on gets a decal — floor, ceiling, the underside of a table. The victims are handled
   * separately (`resolveBlast`): paint on a player is the avatar's job, not a decal's.
   */
  function paintBurst(shell: Shell): void {
    const event = shell.event!
    const random = seededRandom(event.seed)
    for (let index = 0; index < GRENADE.splats; index++) {
      const theta = random() * Math.PI * 2
      const z = random() * 2 - 1
      const radius = Math.sqrt(Math.max(0, 1 - z * z))
      _rayDirection.set(Math.cos(theta) * radius, z, Math.sin(theta) * radius)
      if (_rayDirection.lengthSq() < 1e-8) continue
      _rayDirection.normalize()
      const hit = world.raycast(shell.position, _rayDirection, GRENADE.splatRange)
      if (!hit) continue
      decals.add(
        hit.object as Parameters<Decals['add']>[0],
        hit.point,
        hit.normal,
        event.team,
        event.seed + index,
      )
      // Droplets on the two nearest surfaces only: sixteen puffs of particles is a framerate
      // problem, and `effects.burst` already threw paint in every direction.
      if (index < 2) effects.splat(hit.point, hit.normal, event.team)
    }
  }

  /**
   * Who was caught in it. Distance is measured to the victim's CAPSULE, not to their feet, so
   * standing behind the corner of your own hitbox does not save you; walls do, through the
   * line-of-sight test — a grenade in the next room is a sound, not damage.
   */
  function resolveBlast(shell: Shell): void {
    const event = shell.event!
    for (const target of targets) {
      if (!target.alive || target.id === event.by || target.team === event.team) continue
      closestPointOnSegment(target.capsuleStart, target.capsuleEnd, shell.position, _closest)
      const surfaceDistance = Math.max(0, _closest.distanceTo(shell.position) - target.capsuleRadius)
      if (surfaceDistance >= GRENADE.blastRadius) continue
      // Aim the sight test at the middle of the capsule: the closest point can be an ankle
      // behind a step, and "the blast could see your ankle" is not how a room reads.
      _chest.addVectors(target.capsuleStart, target.capsuleEnd).multiplyScalar(0.5)
      if (!world.lineOfSight(shell.position, _chest)) continue
      _toVictim.subVectors(_closest, shell.position)
      if (_toVictim.lengthSq() < 1e-8) _toVictim.set(0, 1, 0)
      else _toVictim.normalize()
      const hit: HitEvent = {
        // One id per victim: the host remembers a shot id exactly once (`SEEN_SHOTS`), so a
        // shared id would pay out for whoever was resolved first and drop everyone else.
        shotId: `${event.id}:${target.id}`,
        by: event.by,
        target: target.id,
        point: [_closest.x, _closest.y, _closest.z],
        normal: [_toVictim.x, _toVictim.y, _toVictim.z],
        // A blast has no body part. It is priced by distance and the host knows it.
        part: 'torso',
        weapon: 'grenade',
        falloff: 1 - surfaceDistance / GRENADE.blastRadius,
      }
      for (const callback of callbacks) callback(hit)
    }
  }

  function detonate(shell: Shell): void {
    if (!shell.event) return
    effects.burst(shell.position, shell.event.team)
    // No bespoke sample for this yet: a loud wet `splat` with a `land` thump under it is a
    // convincing paint burst and costs nothing. Swap in a real one-shot when we have it.
    audio.play('splat', shell.position, undefined, 1.8)
    audio.play('land', shell.position, undefined, 0.9)
    paintBurst(shell)
    if (shell.resolveDamage) resolveBlast(shell)
    deactivate(shell)
  }

  /** One bounce: reflect, keep `restitution` of the normal, scrub the tangent by `friction`. */
  function bounce(shell: Shell, normal: Vector3): void {
    const normalSpeed = shell.velocity.dot(normal)
    _tangent.copy(shell.velocity).addScaledVector(normal, -normalSpeed)
    shell.velocity
      .copy(_tangent)
      .multiplyScalar(GRENADE.friction)
      .addScaledVector(normal, -normalSpeed * GRENADE.restitution)
    const impact = Math.abs(normalSpeed)
    if (impact > BOUNCE_AUDIBLE_SPEED) {
      audio.play('land', shell.position, undefined, Math.min(1, impact / 12))
    }
    // Settled on something walkable: stop integrating so it does not creep across the floor
    // for the rest of its fuse (and so the shell you are about to run from stays put).
    if (normal.y > FLOOR_NORMAL_Y && shell.velocity.length() < GRENADE.restSpeed) {
      shell.velocity.set(0, 0, 0)
      shell.resting = true
    }
  }

  /** Integrate one shell for `dt`, detonating it if the fuse runs out inside the step. */
  function step(shell: Shell, dt: number): void {
    if (!shell.active || !shell.event) return
    if (dt <= 0) return
    if (shell.fuse <= dt) {
      // Burn the rest of the fuse before going off, so the burst is where the arc put it.
      const remainder = Math.max(0, shell.fuse)
      if (remainder > 0) integrate(shell, remainder)
      if (shell.active) detonate(shell)
      return
    }
    shell.fuse -= dt
    integrate(shell, dt)
  }

  function integrate(shell: Shell, dt: number): void {
    if (shell.resting) return
    let remaining = dt
    let guard = 0
    while (remaining > 1e-8 && shell.active && !shell.resting && guard++ < 16) {
      const speed = shell.velocity.length()
      const subDt = Math.min(remaining, MAX_STEP_DISTANCE / Math.max(speed, 1e-3))
      _next.copy(shell.position).addScaledVector(shell.velocity, subDt)
      _delta.subVectors(_next, shell.position)
      const distance = _delta.length()
      if (distance > 1e-9) {
        _direction.copy(_delta).multiplyScalar(1 / distance)
        // Cast a shell's radius further than it travels: the sphere touches the wall before
        // its centre reaches it, and a shell that ends the step inside geometry never leaves.
        const hit = world.raycast(shell.position, _direction, distance + GRENADE.radius)
        if (hit) {
          const stop = Math.max(0, hit.distance - GRENADE.radius - SKIN)
          shell.position.addScaledVector(_direction, stop)
          _normal.copy(hit.normal)
          // A ray can come back with the normal of the back face when the shell starts flush
          // against a surface; flip it so a bounce always pushes away from the wall.
          if (_normal.dot(_direction) > 0) _normal.negate()
          bounce(shell, _normal)
        } else {
          shell.position.copy(_next)
        }
      }
      shell.velocity.y -= GRENADE.gravity * subDt
      shell.spin += subDt * (4 + shell.velocity.length() * 0.6)
      remaining -= subDt
    }
  }

  return {
    spawn(event, opts) {
      let shell: Shell | undefined
      for (let offset = 0; offset < MAX_LIVE; offset++) {
        const candidate = shells[(cursor + offset) % MAX_LIVE]
        if (!candidate.active) {
          shell = candidate
          cursor = (cursor + offset + 1) % MAX_LIVE
          break
        }
      }
      if (!shell) {
        shell = shells[cursor]
        cursor = (cursor + 1) % MAX_LIVE
      } else {
        liveCount++
      }
      shell.active = true
      shell.event = event
      shell.resolveDamage = opts.resolveDamage
      shell.position.fromArray(event.origin)
      shell.velocity.fromArray(event.velocity)
      shell.fuse = Math.max(0, (event.fuseMs ?? GRENADE.fuseMs) / 1000)
      shell.resting = false
      shell.spin = 0
      // Late arrival: replay the flight it already had on the thrower's screen instead of
      // dropping a fresh shell at the origin a third of a second after it left their hand.
      const age = Math.min(MAX_CATCHUP_S, Math.max(0, (Date.now() - event.t) / 1000))
      for (let elapsed = 0; elapsed < age && shell.active; elapsed += CATCHUP_STEP_S) {
        step(shell, Math.min(CATCHUP_STEP_S, age - elapsed))
      }
    },

    update(dt, hittables) {
      targets = hittables
      const clamped = Math.max(0, dt)
      for (const shell of shells) step(shell, clamped)
      for (let index = 0; index < shells.length; index++) {
        const shell = shells[index]
        const mesh = meshes[index]
        if (!shell.active || !shell.event) {
          mesh.visible = false
          continue
        }
        mesh.visible = true
        mesh.material = materials[shell.event.team]
        mesh.position.copy(shell.position)
        mesh.rotation.set(shell.spin * 0.7, shell.spin, shell.spin * 0.4)
        // The tell: it swells over the last third of the fuse. You are meant to be able to
        // look at a shell and know whether there is time to get out of the room.
        const fuseLeft = shell.fuse / Math.max(1e-3, (shell.event.fuseMs ?? GRENADE.fuseMs) / 1000)
        mesh.scale.setScalar(fuseLeft > 0.35 ? 1 : 1 + (0.35 - fuseLeft) * 2.4)
      }
    },

    onPlayerHit(callback) {
      callbacks.add(callback)
      return () => callbacks.delete(callback)
    },

    get liveCount() {
      return liveCount
    },

    dispose() {
      for (const shell of shells) {
        shell.active = false
        shell.event = null
      }
      for (const mesh of meshes) scene.remove(mesh)
      geometry.dispose()
      materials.a.dispose()
      materials.b.dispose()
      callbacks.clear()
      targets = []
      liveCount = 0
    },
  }
}

function closestPointOnSegment(a: Vector3, b: Vector3, point: Vector3, out: Vector3): Vector3 {
  _delta.subVectors(b, a)
  const lengthSq = _delta.lengthSq()
  const t = lengthSq > 0
    ? Math.max(0, Math.min(1, _delta.dot(_next.subVectors(point, a)) / lengthSq))
    : 0
  return out.copy(a).addScaledVector(_delta, t)
}

/**
 * The throw itself: where the shell starts and how fast it leaves, from an eye and a look
 * direction. Lives here rather than in `local-player.ts` so the numbers a bot would use are the
 * player's numbers, and so the arc can be unit-tested without a camera.
 *
 * `GRENADE.throwPitchDeg` above the crosshair, because a grenade thrown exactly where you are
 * looking lands short of it. `inheritVelocity` adds the thrower's own movement: running throws
 * further, which is what every player expects and nobody thinks about.
 */
export function throwVelocity(
  look: Vector3,
  out: Vector3,
  inheritVelocity?: Vector3,
): Vector3 {
  out.copy(look).normalize()
  // Rotate up around the axis perpendicular to the look direction, in the vertical plane.
  const pitch = (GRENADE.throwPitchDeg * Math.PI) / 180
  const horizontal = Math.hypot(out.x, out.z)
  const currentPitch = Math.atan2(out.y, horizontal)
  const yaw = Math.atan2(out.x, out.z)
  const target = Math.min(Math.PI / 2 - 1e-3, currentPitch + pitch)
  const cos = Math.cos(target)
  out.set(Math.sin(yaw) * cos, Math.sin(target), Math.cos(yaw) * cos)
  out.multiplyScalar(GRENADE.throwSpeed)
  if (inheritVelocity) out.addScaledVector(inheritVelocity, 0.5)
  return out
}
