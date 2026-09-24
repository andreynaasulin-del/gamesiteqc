/**
 * The room contract. Everything the rest of the game knows about "other players" goes
 * through this surface.
 *
 * This file used to wrap the netcode, and the whole game was written against that wrapper.
 * On the Quadcode AI landing there is no lobby, no invite link and no account: the visitor
 * clicks Play and is in a match a second later. So the contract stayed and the transport
 * left — `local-room.ts` implements the same interface against a room of one human and
 * five bots, with no socket and no third-party SDK in the bundle.
 *
 * Keeping the interface (instead of tearing the net layer out) is deliberate: `host.ts`,
 * `client.ts` and `sync.ts` are the game's authority and reconciliation logic, bugs and all
 * the fixes their comments describe. Rewriting them for a single player would be rewriting
 * the game. It also leaves the door open: a real transport can be dropped back in here.
 */
import type { RpcMode } from './protocol'

/**
 * One participant — a human or a bot. A trimmed `PlayerState`: the methods the game
 * actually calls, and nothing else.
 */
export interface Participant {
  id: string
  getState(key: string): unknown
  setState(key: string, value: unknown, reliable?: boolean): void
  getProfile(): { name: string }
  /** Runtime-only in the netcode's typings; every implementation must answer it. */
  isBot?(): boolean
  kick(): void
  onQuit(cb: () => void): () => void
}

export type RoomErrorCode =
  | 'ROOM_FULL'
  | 'KICKED'
  | 'NO_GAME_ID'
  | 'ALREADY_JOINED'
  | 'QUOTA_EXCEEDED'
  | 'CONNECT_FAILED'

export class RoomError extends Error {
  code: RoomErrorCode
  constructor(code: RoomErrorCode, message: string) {
    super(message)
    this.name = 'RoomError'
    this.code = code
  }
}

export interface Room {
  me: Participant
  isHost(): boolean
  roomCode: string
  /** Empty when the room cannot be shared — the HUD hides its invite affordances then. */
  inviteUrl: string
  /** Humans + bots currently in the room. */
  players(): Participant[]
  /** Fires for players already in the room too (replayed in join order). */
  onJoin(cb: (p: Participant) => void): () => void
  onLeave(cb: (id: string) => void): () => void
  onHostChange(cb: (isHost: boolean) => void): () => void
  getGlobal<T>(key: string): T | undefined
  setGlobal(key: string, value: unknown, reliable?: boolean): void
  addBot(): Promise<Participant>
  kick(id: string): void
  rpc: {
    register<T>(name: string, cb: (payload: T, sender: Participant) => void | Promise<unknown>): () => void
    call(name: string, payload: unknown, mode?: RpcMode): Promise<unknown>
  }
  leave(): void
}

/** Is this participant driven by the host's bot brain? */
export function isBotPlayer(p: Participant): boolean {
  return p.isBot?.() === true
}
