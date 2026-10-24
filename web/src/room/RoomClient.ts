// The boundary the whole UI talks to. MockRoomClient and ConvexRoomClient implement it.
import type { Member, Room, RoomEvent } from '../../../shared/schema'

export interface JoinResult {
  room: Room
  self: Member
}

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
  dispose(): void
  /** Only the real backend has voice; the mock leaves it out and the talk button does nothing. */
  readonly voice?: VoiceTransport
}
