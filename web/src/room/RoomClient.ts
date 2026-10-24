// The boundary the whole UI talks to. A Convex client will implement it later.
import type { Member, Room, RoomEvent } from '../../../shared/schema'

export interface JoinResult {
  room: Room
  self: Member
}

export interface RoomClient {
  subscribe(listener: (event: RoomEvent) => void): () => void
  createRoom(name: string): Promise<JoinResult>
  joinRoom(inviteToken: string, name: string): Promise<JoinResult>
  burn(): Promise<void>
  dispose(): void
}
