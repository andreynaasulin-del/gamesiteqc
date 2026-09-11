/**
 * An offline `Room`: one human, bots for the rest, no socket.
 *
 * The game is written as host + clients talking over RPCs. Here the human IS the host and
 * there are no clients, so the transport collapses into three rules:
 *
 *   'host'   → deliver locally (I am the host)
 *   'all'    → deliver locally (the netcode's ALL includes the caller)
 *   'others' → drop (there is nobody else; the caller already applied its own effect)
 *
 * Delivery is synchronous but through a microtask, so a handler that fires during a call
 * can never re-enter the caller's own stack — the same ordering guarantee a socket gives
 * for free, and the reason `host.ts` can call an RPC from inside a handler.
 */
import { DEFAULT_PLAYER_STATES, DEFAULT_STATES, GS, PS, botsFillValue, type RpcMode } from './protocol'
import type { CharacterSelection, MapSelection } from '../types'
import type { Participant, Room } from './room'

export interface LocalRoomOptions {
  name: string
  character?: CharacterSelection
  /** The map everyone loads. */
  map?: MapSelection | null
  /** Fill the empty seats with bots. Off leaves the player alone in the house. */
  botsFill?: boolean
}

/** A participant backed by a plain Map. Reliability flags are meaningless without a wire. */
class LocalParticipant implements Participant {
  readonly id: string
  private readonly state = new Map<string, unknown>()
  private readonly bot: boolean
  private readonly quitListeners = new Set<() => void>()
  private onKick: (id: string) => void

  constructor(id: string, bot: boolean, onKick: (id: string) => void) {
    this.id = id
    this.bot = bot
    this.onKick = onKick
    for (const [key, value] of Object.entries(DEFAULT_PLAYER_STATES)) this.state.set(key, value)
  }

  getState(key: string): unknown {
    return this.state.get(key)
  }

  setState(key: string, value: unknown): void {
    this.state.set(key, value)
  }

  getProfile(): { name: string } {
    return { name: (this.state.get(PS.name) as string) || 'Player' }
  }

  isBot(): boolean {
    return this.bot
  }

  kick(): void {
    this.onKick(this.id)
  }

  onQuit(cb: () => void): () => void {
    this.quitListeners.add(cb)
    return () => this.quitListeners.delete(cb)
  }

  /** Called by the room when this participant is removed. */
  quit(): void {
    for (const cb of [...this.quitListeners]) cb()
    this.quitListeners.clear()
  }
}

export function createLocalRoom(opts: LocalRoomOptions): Room {
  const globals = new Map<string, unknown>(Object.entries(DEFAULT_STATES))
  if (opts.map) globals.set(GS.map, opts.map)
  globals.set(GS.botsFill, botsFillValue(opts.botsFill ?? true))

  const roster: LocalParticipant[] = []
  const joinListeners = new Set<(p: Participant) => void>()
  const leaveListeners = new Set<(id: string) => void>()
  const handlers = new Map<string, Set<(payload: unknown, sender: Participant) => void | Promise<unknown>>>()
  let botSeq = 0
  let left = false

  const remove = (id: string) => {
    const index = roster.findIndex((p) => p.id === id)
    if (index < 0) return
    const [gone] = roster.splice(index, 1)
    gone.quit()
    for (const cb of [...leaveListeners]) cb(id)
  }

  const me = new LocalParticipant('me', false, remove)
  me.setState(PS.name, opts.name)
  if (opts.character) me.setState(PS.character, opts.character)
  roster.push(me)

  const deliver = (name: string, payload: unknown, sender: Participant) => {
    const set = handlers.get(name)
    if (!set?.size) return Promise.resolve(undefined)
    // A microtask, not a straight call: a handler that answers with another RPC must not
    // run inside the caller's frame (`host.ts` does exactly that — `hit` replies `damage`).
    return Promise.resolve().then(async () => {
      for (const cb of [...set]) await cb(payload, sender)
      return undefined
    })
  }

  return {
    me,
    isHost: () => true,
    roomCode: '',
    // No transport, no room to share. Empty is the signal the HUD and the Esc menu read to
    // hide "Copy invite link" — showing a link that leads nowhere would be worse than none.
    inviteUrl: '',
    players: () => [...roster],
    onJoin(cb) {
      joinListeners.add(cb)
      // Replay, like the netcode does: the host itself is already in the room when the game
      // registers its listener, and `client.ts` builds its registry from these calls only.
      for (const p of [...roster]) cb(p)
      return () => joinListeners.delete(cb)
    },
    onLeave(cb) {
      leaveListeners.add(cb)
      return () => leaveListeners.delete(cb)
    },
    onHostChange(cb) {
      // Authority never moves in a room of one. Registering is still valid; it just never fires.
      void cb
      return () => {}
    },
    getGlobal<T>(key: string) {
      return (globals.get(key) ?? undefined) as T | undefined
    },
    setGlobal(key, value) {
      globals.set(key, value)
    },
    async addBot() {
      if (left) throw new Error('room left')
      const bot = new LocalParticipant(`bot${++botSeq}`, true, remove)
      roster.push(bot)
      for (const cb of [...joinListeners]) cb(bot)
      return bot
    },
    kick(id) {
      remove(id)
    },
    rpc: {
      register(name, cb) {
        const set = handlers.get(name) ?? new Set()
        handlers.set(name, set)
        const typed = cb as (payload: unknown, sender: Participant) => void | Promise<unknown>
        set.add(typed)
        return () => set.delete(typed)
      },
      call(name, payload, mode: RpcMode = 'all') {
        if (left || mode === 'others') return Promise.resolve(undefined)
        return deliver(name, payload, me)
      },
    },
    leave() {
      left = true
      handlers.clear()
      joinListeners.clear()
      leaveListeners.clear()
      roster.length = 0
    },
  }
}
