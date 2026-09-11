import type { MoveInput } from '../types'

export interface Input {
  readonly move: MoveInput
  readonly fire: boolean
  readonly reload: boolean
  /** E pressed this frame (edge): open/close the door or window under the crosshair. */
  readonly interact: boolean
  /**
   * Weapon slot picked this frame (edge, 1 = rifle, 2 = pistol, 3 = knife), 0 = no change.
   * Keys 1/2/3 select directly; the wheel cycles through the slots.
   */
  readonly weaponSlot: number
  readonly scoreboard: boolean
  readonly locked: boolean
  readonly pointerReleased: boolean
  /**
   * True while the game is driven WITHOUT pointer lock. Some browsers refuse the capture
   * outright (Safari), and so does Chrome for a frame it does not consider valid for it — and
   * the match used to be unreachable there, because only `pointerlockchange` ever started it.
   * In this mode the keyboard works as usual and looking around comes from mouse drags.
   */
  readonly engaged: boolean
  /** Enter the no-capture fallback. Called when a lock request is refused. */
  engage(): void
  releasePointer(): void
  consumeLook(): { dx: number; dy: number }
  /**
   * Re-sync the wheel's idea of the held slot (the weapon is owned by the player, not by the
   * input: a respawn or a forced switch must not leave the wheel cycling from a stale slot).
   */
  setWeaponSlot(slot: number): void
  requestLock(): void
  onLockError(callback: (message: string) => void): () => void
  onLockChange(callback: (locked: boolean) => void): () => void
  /** Clear frame-edge inputs after the caller has consumed them. */
  update(): void
  dispose(): void
}

/** Slots the wheel cycles through, in order. */
const SLOT_COUNT = 3
/**
 * Wheel notches vary wildly between mice and trackpads (a mouse notch is ~120 px in Chrome, a
 * trackpad flick is dozens of events of a few px), so the delta is integrated and one event
 * can only ever move one slot: a single notch is a single weapon.
 */
const WHEEL_STEP = 40
/**
 * Drag-look gain in the no-capture fallback. A locked mouse reports raw movement and can keep
 * going forever; a drag runs out of desk at the window edge, so it turns a little faster.
 */
const DRAG_GAIN = 1.6
/**
 * What the HUD says once the capture is refused. Exported so the game and the tests use the
 * one string: it is the only instruction the player gets in the fallback.
 */
export const LOCK_BLOCKED_HINT =
  'Mouse capture blocked · hold a mouse button and drag to aim · left click shoots · ESC menu'

export function createInput(canvas: HTMLCanvasElement): Input {
  const keys = new Set<string>()
  const errorCallbacks = new Set<(message: string) => void>()
  let disposed = false
  let pendingLock = false
  let lockTimer = 0
  let lockAttempt = 0
  const clearLockRequest = () => {
    pendingLock = false
    lockAttempt++
    window.clearTimeout(lockTimer)
  }
  const failLock = () => {
    if (disposed || !pendingLock) return
    clearLockRequest()
    // The refusal is not the end of the match any more: drag-look takes over immediately, so
    // the message describes the controls the player now has instead of an error to retry.
    engage()
    const message = LOCK_BLOCKED_HINT
    for (const callback of errorCallbacks) callback(message)
  }
  const lockCallbacks = new Set<(locked: boolean) => void>()
  const move: MoveInput = { forward: 0, right: 0, jump: false, crouch: false, walk: false }
  const look = { dx: 0, dy: 0 }
  const consumedLook = { dx: 0, dy: 0 }
  let fire = false
  let reload = false
  let interact = false
  let weaponSlot = 0
  let heldSlot = 1
  let wheelAccumulator = 0
  let locked = document.pointerLockElement === canvas
  let pointerReleased = false
  /** No-capture fallback: the game is live, the mouse is not captured. */
  let engaged = false
  /** A mouse button is down on the canvas in the fallback: this drag is a look. */
  let dragging = false
  let dragX = 0
  let dragY = 0
  /** The keyboard and the look are live in either mode: real capture, or the drag fallback. */
  const isActive = () => locked || engaged

  const selectSlot = (slot: number) => {
    if (slot < 1 || slot > SLOT_COUNT || slot === heldSlot) return
    heldSlot = slot
    weaponSlot = slot
  }

  const syncMove = () => {
    move.forward = Number(keys.has('KeyW') || keys.has('ArrowUp'))
      - Number(keys.has('KeyS') || keys.has('ArrowDown'))
    move.right = Number(keys.has('KeyD') || keys.has('ArrowRight'))
      - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
    move.jump = keys.has('Space')
    move.crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC')
    move.walk = keys.has('ShiftLeft') || keys.has('ShiftRight')
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (target instanceof Element && target.matches('input, textarea, select, [contenteditable=true]')) return
    if (event.code === 'KeyP' && !event.repeat) {
      event.preventDefault()
      if (isActive()) releasePointer()
      else if (pointerReleased) requestLock()
      return
    }
    if (event.code === 'Escape' && isActive()) {
      pointerReleased = false
      onBlur()
      if (locked) {
        document.exitPointerLock()
        // The menu opens from `pointerlockchange`; the game's own Escape handler must not
        // also run and close it again.
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      // No capture to give back: drop out of the fallback and let the game's Escape handler
      // (registered after this one) open the menu.
      disengage()
      event.preventDefault()
      return
    }
    if (!isActive()) return
    if (/^(Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Tab)$/.test(event.code)) event.preventDefault()
    if (event.code === 'KeyR' && !event.repeat) reload = true
    if (event.code === 'KeyE' && !event.repeat) interact = true
    if (!event.repeat) {
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)
      if (digit) selectSlot(Number(digit[1]))
    }
    keys.add(event.code)
    syncMove()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (isActive() && event.code === 'Tab') event.preventDefault()
    keys.delete(event.code)
    syncMove()
  }
  const onMouseDown = (event: MouseEvent) => {
    // Without a capture the game only owns the canvas: a click on the menu is a click on the
    // menu, not a burst of paint through it.
    const onCanvas = event.target === canvas
    if (event.button === 0 && (locked || (engaged && onCanvas))) fire = true
    if (!engaged || locked || !onCanvas) return
    // Any button starts a look-drag, so the right one aims without shooting.
    dragging = true
    dragX = event.clientX
    dragY = event.clientY
  }
  const onMouseUp = (event: MouseEvent) => {
    if (event.button === 0) fire = false
    dragging = false
  }
  const onWheel = (event: WheelEvent) => {
    if (!isActive()) return
    event.preventDefault()
    // deltaMode 1 = lines, 2 = pages; normalise both to pixels.
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1)
    // A direction change starts a fresh notch, or a flick back the other way feels sticky.
    if (Math.sign(delta) !== Math.sign(wheelAccumulator)) wheelAccumulator = 0
    wheelAccumulator += delta
    if (Math.abs(wheelAccumulator) < WHEEL_STEP) return
    const step = wheelAccumulator > 0 ? 1 : -1
    wheelAccumulator = 0
    selectSlot(((heldSlot - 1 + step + SLOT_COUNT) % SLOT_COUNT) + 1)
  }
  const onMouseMove = (event: MouseEvent) => {
    if (locked) {
      look.dx += event.movementX
      look.dy += event.movementY
      return
    }
    if (!engaged || !dragging) return
    // `movementX` is unreliable outside a lock (0 in Safari, absent in synthetic events), so
    // the drag is measured from the previous position and the raw movement is only a hint.
    const dx = event.clientX - dragX || event.movementX || 0
    const dy = event.clientY - dragY || event.movementY || 0
    dragX = event.clientX
    dragY = event.clientY
    look.dx += dx * DRAG_GAIN
    look.dy += dy * DRAG_GAIN
  }
  const onBlur = () => {
    keys.clear()
    fire = false
    reload = interact = false
    weaponSlot = 0
    wheelAccumulator = 0
    dragging = false
    look.dx = look.dy = 0
    syncMove()
  }
  const engage = () => {
    if (disposed || locked || engaged) return
    engaged = true
    pointerReleased = false
  }
  const disengage = () => {
    if (!engaged) return
    engaged = false
    onBlur()
  }
  const onLock = () => {
    if (disposed) return
    clearLockRequest()
    locked = document.pointerLockElement === canvas
    if (!locked) onBlur()
    else {
      pointerReleased = false
      // A real capture supersedes the fallback: one look source at a time, or a drag would
      // add its delta on top of the locked movement.
      engaged = false
      dragging = false
    }
    for (const callback of lockCallbacks) callback(locked)
  }
  const requestLock = () => {
    if (disposed || pendingLock || document.pointerLockElement === canvas) return
    pendingLock = true
    const attempt = ++lockAttempt
    lockTimer = window.setTimeout(failLock, 1500)
    try {
      if (typeof canvas.requestPointerLock !== 'function') return failLock()
      // Must run synchronously within the originating user gesture.
      const request = canvas.requestPointerLock() as unknown as Promise<void> | undefined
      request?.catch?.(() => {
        if (attempt === lockAttempt) failLock()
      })
    } catch {
      if (attempt === lockAttempt) failLock()
    }
  }
  const releasePointer = () => {
    pointerReleased = true
    engaged = false
    onBlur()
    if (document.pointerLockElement === canvas) document.exitPointerLock()
  }
  const onCanvasClick = () => requestLock()
  const onContextMenu = (event: Event) => event.preventDefault()

  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onLock)
  document.addEventListener('pointerlockerror', failLock)
  window.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('blur', onBlur)
  canvas.addEventListener('click', onCanvasClick)
  canvas.addEventListener('contextmenu', onContextMenu)

  return {
    move,
    get fire() { return fire },
    get reload() { return reload },
    get interact() { return interact },
    get weaponSlot() { return weaponSlot },
    get scoreboard() { return keys.has('Tab') },
    get locked() { return locked },
    get pointerReleased() { return pointerReleased },
    get engaged() { return engaged },
    engage,
    releasePointer,
    consumeLook() {
      consumedLook.dx = look.dx
      consumedLook.dy = look.dy
      look.dx = 0
      look.dy = 0
      return consumedLook
    },
    setWeaponSlot(slot) {
      if (slot >= 1 && slot <= SLOT_COUNT) heldSlot = slot
      wheelAccumulator = 0
    },
    requestLock,
    onLockError(callback) {
      errorCallbacks.add(callback)
      return () => errorCallbacks.delete(callback)
    },
    onLockChange(callback) {
      lockCallbacks.add(callback)
      return () => lockCallbacks.delete(callback)
    },
    update() {
      reload = false
      interact = false
      weaponSlot = 0
    },
    dispose() {
      disposed = true
      engaged = false
      clearLockRequest()
      onBlur()
      errorCallbacks.clear()
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLock)
      document.removeEventListener('pointerlockerror', failLock)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('blur', onBlur)
      canvas.removeEventListener('click', onCanvasClick)
      canvas.removeEventListener('contextmenu', onContextMenu)
      lockCallbacks.clear()
    },
  }
}
