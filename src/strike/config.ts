/**
 * Tuning constants and environment. Keep gameplay numbers here so balancing is one file.
 */
import { assetUrl } from './asset-url'
import type { TeamId, TeamInfo } from './types'

/** The shipped build plays offline against bots; no room service or asset host is configured. */
export const ENV = {
  realtimeGameId: undefined as string | undefined,
  storageUrl: undefined as string | undefined,
  storageKey: undefined as string | undefined,
  storageMapsBucket: 'maps',
}

export const TEAMS: Record<TeamId, TeamInfo> = {
  a: { id: 'a', name: 'Orange', color: '#f97316', colorHex: 0xf97316 },
  b: { id: 'b', name: 'Teal', color: '#14b8a6', colorHex: 0x14b8a6 },
}

export const BUILTIN_MAPS = [
  { id: 'iceyard', name: 'Ice Yard', url: assetUrl('maps/iceyard.glb'), tintTerrain: false },
  { id: 'corridors', name: 'Corridors', url: assetUrl('maps/corridors.glb'), tintTerrain: false },
] as const

export const MATCH = {
  teamSize: 3,
  maxPlayers: 6,
  killTarget: 30,
  durationMs: 5 * 60_000,
  warmupMs: 5_000,
  endScreenMs: 10_000,
}

export const PLAYER = {
  maxHp: 100,
  hitDamage: 34, // 3 hits
  respawnDelayMs: 2_500,
  invincibleMs: 3_000,
  // Capsule
  radius: 0.3,
  height: 1.75,
  crouchHeight: 1.15,
  eyeHeight: 1.6,
  crouchEyeHeight: 1.0,
  // Movement (m/s, m/s^2). Default movement is running; Shift walks (slow, precise).
  runSpeed: 5.5,
  walkSpeed: 2.8,
  crouchSpeed: 1.8,
  airControl: 0.35,
  accel: 45,
  decel: 55,
  jumpVelocity: 4.8,
  gravity: 20,
  /** Max step height the controller can climb without jumping. The editor's v7 stair ends with a 0.50 m riser. */
  stepHeight: 0.52,
  /** Max slope angle (degrees) considered walkable ground. */
  maxSlopeDeg: 55,
  lookSensitivity: 0.0022,
  fov: 75,
}

export const WEAPON = {
  /** shots per second while holding fire (legacy; WEAPONS.rifle.fireRate is the live value) */
  fireRate: 12,
  /**
   * Gaussian spread sigma in degrees by motion state. Standing/walking/crouching is
   * precise; running and airborne pay a penalty. Blend by speed between walk and run.
   */
  spreadStandingDeg: 0.12,
  spreadWalkingDeg: 0.3,
  spreadRunningDeg: 1.6,
  spreadAirDeg: 2.8,
  /**
   * Extra sigma added right after a shot, decays with `spreadRecoveryPerSec`. Recovery
   * outpaces the fire rate (9/s × 0.25° < 4°/s) so sustained fire while standing stays
   * precise; the cap only matters while moving.
   */
  spreadPerShotDeg: 0.25,
  spreadRecoveryPerSec: 4.0,
  spreadBloomMaxDeg: 1.0,
  projectileSpeed: 95,
  projectileGravity: 9.8,
  projectileRadius: 0.025,
  /** metres before the projectile is discarded */
  maxRange: 80,
  hopperSize: 30,
  reloadMs: 1_400,
  /** Recoil kick in radians applied to pitch per shot, recovers quickly. */
  recoilPitch: 0.0045,
}

/**
 * Per-weapon tuning. Slot keys 1/2/3. `damageScale` multiplies DAMAGE[part]; the knife uses
 * `damage` flat (60 = two swings, one from behind). Spread values are gaussian sigmas in degrees.
 */
export const WEAPONS = {
  rifle: {
    slot: 1,
    label: 'Marker',
    auto: true,
    fireRate: 10,
    ammo: 30,
    reloadMs: 1_400,
    projectileSpeed: 95,
    damageScale: 1,
    spreadScale: 1,
    moveSpeedScale: 1,
  },
  pistol: {
    slot: 2,
    label: 'Pistol',
    auto: false,
    fireRate: 12,
    ammo: 12,
    reloadMs: 1_100,
    projectileSpeed: 110,
    damageScale: 1,
    /** Tighter than the rifle in every motion state. */
    spreadScale: 0.5,
    moveSpeedScale: 1.05,
  },
  knife: {
    slot: 3,
    label: 'Knife',
    auto: false,
    /** Swings per second. */
    fireRate: 2.2,
    ammo: Infinity,
    reloadMs: 0,
    projectileSpeed: 0,
    damageScale: 0,
    spreadScale: 0,
    moveSpeedScale: 1.12,
    /** Melee reach (m) from the eye along the look direction, and the hit cone half-angle. */
    range: 1.7,
    coneDeg: 25,
    damage: 60,
    backstabScale: 2,
  },
} as const

/**
 * Paint grenades (W6) — the answer to "every fight is decided by whoever peeks first".
 *
 * A paint grenade is not a frag: it cannot kill from full health from any distance, and that is
 * deliberate. `maxDamage` at the centre leaves a full-health player standing (and painted), so a
 * grenade opens a fight instead of ending it — it flushes a corner, covers a push and takes a
 * camper to half, then the markers decide it.
 *
 * Not in `WEAPONS`: it is thrown with G whatever is in your hands, so it has no slot, no
 * magazine and no `damageScale` (the host prices a grenade hit straight off these numbers).
 */
export const GRENADE = {
  /** Carried per life. No pickups: the pouch refills on respawn, like the hopper. */
  carried: 2,
  /** Fuse from the moment it leaves the hand (ms). Long enough to be thrown back at you. */
  fuseMs: 1_500,
  /** One throw per this long, so G is not a second trigger. */
  cooldownMs: 800,
  /** Launch speed (m/s) and how far above the crosshair it is lobbed (degrees). */
  throwSpeed: 12.5,
  throwPitchDeg: 9,
  /** Spawns this far down the look direction: a grenade must not clip into our own camera. */
  throwOffset: 0.45,
  /** Its own gravity: heavier than a paintball so the arc reads as a lob. */
  gravity: 18,
  /** Speed kept across a bounce, and how much of the slide along the surface survives it. */
  restitution: 0.4,
  friction: 0.7,
  /** Collision radius of the shell (m). */
  radius: 0.08,
  /** Below this speed on the ground the shell stops rolling and waits out its fuse. */
  restSpeed: 0.6,
  /** Nothing outside this radius (m) is painted or damaged, and walls block the blast. */
  blastRadius: 4,
  /** Damage at the centre of the burst, falling off to `minDamage` at `blastRadius`. */
  maxDamage: 45,
  minDamage: 10,
  /** Paint splats sprayed onto the geometry around the burst. */
  splats: 16,
  /** How far the paint reaches when it looks for a surface to stick to (m). */
  splatRange: 5,
}

/** Damage per body part. 100 hp: head = 2 hits, torso = 3, limbs = 5. */
export const DAMAGE: Record<'head' | 'torso' | 'arm' | 'leg', number> = {
  head: 50,
  torso: 34,
  arm: 20,
  leg: 20,
}

export const ARMOR = {
  max: 50,
  absorption: 0.35,
}

export const TAGGING = {
  speedScale: 0.55,
  holdMs: 120,
  recoveryMs: 380,
}

export const DECALS = {
  maxCount: 400,
  minSize: 0.16,
  maxSize: 0.3,
  /** Push decal geometry off the surface to avoid z-fighting. */
  offset: 0.004,
  /**
   * Decal geometries built per frame; the rest wait in a queue.
   *
   * Projecting one splat costs ~0.24 ms (a BVH shapecast plus a `DecalGeometry` build), which is
   * invisible for a paintball — one hit, one decal. A grenade asks for 16 at once: measured at
   * 3.9 ms in a single frame, which is a guaranteed dropped frame on every throw. Four a frame
   * spreads that burst over ~66 ms, keeps single shots instant, and nobody can see paint arrive
   * four frames late.
   */
  buildsPerFrame: 4,
  /**
   * Deferred splats waiting to be built. Two simultaneous bursts plus gunfire is the realistic
   * worst case; beyond that the oldest requests are dropped, because paint that lands half a
   * second after the explosion is worse than paint that never lands.
   */
  maxQueued: 48,
}

/**
 * Does sound come up by itself on the first team pick?
 *
 * `false` keeps every match silent until someone asks for sound in the Esc menu. Nothing else
 * changes — the context, the sample bank and the mixer are all still built the moment they are
 * asked for, so turning it on mid-match costs nothing and loses nothing.
 *
 * Off on purpose while the mix is being reworked: the current one is loud enough to be a
 * distraction in playtests, and "mute it every time you reload the page" is not a workflow.
 * Flip to `true` to restore the first-gesture start.
 */
export const AUDIO_AUTOSTART = false

export const DOORS = {
  /** Players toggle doors/windows with E when the crosshair is on one within this range (m). */
  interactRange: 2.5,
  /** Bots open a closed door on their path when within this distance of it (m). */
  botOpenRadius: 2.4,
  /** Playback speed of the baked 1 s clip. */
  openTimeScale: 3,
}

export const NET = {
  /** Local player snapshot send rate (Hz), unreliable channel. */
  snapshotHz: 20,
  /** Interpolation delay for remote players (ms). */
  interpDelayMs: 110,
  /** Host bot snapshot rate (Hz). */
  botSnapshotHz: 15,
}

/**
 * Bot skill, dialled DOWN 20 % from the numbers this shipped with (W6).
 *
 * The complaint was not that bots were unbeatable, it was that a fight was over in a third of
 * a second either way: a bot saw you across the whole house, reacted in 320 ms and held a
 * four-shot burst on a 2.6° cone. Every number below is the old one moved 20 % towards
 * "human": the senses are 20 % shorter/narrower, the delays 25 % longer (= 20 % less of the
 * time spent shooting) and the aim cone 25 % wider. Nothing about the shooting itself changed,
 * so a bot still kills you — it just has to work for it, and you get the seconds back.
 *
 * Previous values are kept in the comments: this is a balance dial, not a rewrite.
 */
export const BOTS = {
  /** 120 → 150: a snapped-on target is not shot at instantly. */
  aimSettleMs: 150,
  fireSpeedThreshold: 0.7,
  /** 8 → 6.4 Hz: re-plans a fifth less often, so it commits to bad positions like a player. */
  decisionHz: 6.4,
  /** 28 → 22.4 m (−20 %): no more cross-house spotting the moment you leave spawn. */
  viewDistance: 22.4,
  /** 130° → 104° (−20 %): flanking actually works now. */
  fovDeg: 104,
  /** Standard deviation of aim error in degrees. 2.6 → 3.25 (+25 % cone). */
  aimErrorDeg: 3.25,
  /** 320 → 400 ms: a quarter-second of peek is yours before it shoots. */
  reactionMs: 400,
  /** 4 s → 3.2 s of chasing a target it cannot see any more. */
  memoryMs: 3_200,
  /** 4 → 3 balls a burst: less chance a single burst finishes you. */
  burstShots: 3,
  /** 450 → 560 ms between bursts: the gap you trade shots in. */
  burstPauseMs: 560,
  names: ['Pixel', 'Voxel', 'Bezier', 'Mesh', 'Shader', 'Quad', 'Splat', 'Lumen', 'Vertex', 'Brush'],
}

export const NAVMESH = {
  cs: 0.08, // 0.15 severed 0.25 m stair treads; 0.08 connects floors (+15 ms gen)
  ch: 0.1,
  /** Below the 0.3 m capsule on purpose: curved treads are only ~0.25 m² and 0.3 m erosion severs them. */
  walkableRadius: 0.22,
  walkableHeight: 1.7,
  walkableClimb: 0.52,
  walkableSlopeAngle: 50,
}

export const SPAWN = {
  /** Zone label regex → team. Case-insensitive. */
  zonePattern: /spawn/i,
  teamAPattern: /\b(a|1|orange|red)\b/i,
  teamBPattern: /\b(b|2|teal|blue)\b/i,
  /** Points sampled per spawn zone. */
  pointsPerZone: 12,
}
