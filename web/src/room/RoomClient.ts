// The boundary the whole UI talks to. A Convex client will implement it later.
import type { Member, Room, RoomEvent } from '../../../shared/schema'

export interface JoinResult {
  room: Room
  self: Member
}

/** `lost` means the room can't be reached any more; only a rejoin (page reload) recovers. */
export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'lost'

export interface RoomClient {
  subscribe(listener: (event: RoomEvent) => void): () => void
  createRoom(name: string): Promise<JoinResult>
  joinRoom(inviteToken: string, name: string): Promise<JoinResult>
  burn(): Promise<void>
  dispose(): void
  /** Calls the listener with the current status at once, then on each change. Optional: the mock has none. */
  onConnectionChange?(listener: (status: ConnectionStatus) => void): () => void
}
