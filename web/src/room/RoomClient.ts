// The boundary the whole UI talks to. MockRoomClient and ConvexRoomClient implement it.
import type { Member, Room, RoomEvent } from '../../../shared/schema'

export interface JoinResult {
  room: Room
  self: Member
}

/** `lost` means the room can't be reached any more; only a rejoin (page reload) recovers. */
export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'lost'

/** What push-to-talk needs from the backend once the phone is in a room. */
export interface VoiceTransport {
  addLine(text: string, at: number): Promise<void>
  /** A short-lived speech-to-text token; the Cartesia key stays on the server. */
  sttToken(): Promise<{ token: string; expiresAt: number }>
}

export interface RoomClient {
  subscribe(listener: (event: RoomEvent) => void): () => void
  createRoom(name: string): Promise<JoinResult>
  joinRoom(inviteToken: string, name: string): Promise<JoinResult>
  burn(): Promise<void>
  /** Adds a typed line to the room. A no-op before a join or after a burn. */
  addLine(text: string, at: number): Promise<void>
  /** Starts the scripted Kevin replay (host only). Absent on the mock. */
  startReplay?(): Promise<void>
  /** Tells the backend this phone left, so other phones' people count drops. Absent on the mock. */
  leave?(): Promise<void>
  dispose(): void
  /** Calls the listener with the current status at once, then on each change. Optional: the mock has none. */
  onConnectionChange?(listener: (status: ConnectionStatus) => void): () => void
  /** Only the real backend has voice; the mock leaves it out and the talk button does nothing. */
  readonly voice?: VoiceTransport
}
