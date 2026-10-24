// Server-only LiveKit calls. These need the API secret, so they must never run in the browser.
// Written as plain functions so the backend can call them from a Convex action unchanged.
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import type { Id } from '../../../shared/schema'
import { CALL_TOKEN_TTL_SECONDS } from '../config'

export interface LiveKitConfig {
  /** The project's wss:// URL. */
  url: string
  apiKey: string
  apiSecret: string
}

/** What the phone needs to join the call. */
export interface CallToken {
  url: string
  token: string
}

/** The LiveKit room that belongs to one of our rooms. */
export function callRoomName(roomId: Id): string {
  return `gw-${roomId}`
}

/**
 * A token that can only join this room's call, publish audio and listen. No recording or admin
 * rights. The backend must check that the caller is a member of an active (not burned) room first.
 */
export async function mintCallToken(
  cfg: LiveKitConfig,
  who: { roomId: Id; memberId: Id; name: string },
  { ttlSeconds = CALL_TOKEN_TTL_SECONDS }: { ttlSeconds?: number } = {},
): Promise<CallToken> {
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, { identity: who.memberId, name: who.name, ttl: ttlSeconds })
  at.addGrant({ room: callRoomName(who.roomId), roomJoin: true, canPublish: true, canSubscribe: true })
  return { url: cfg.url, token: await at.toJwt() }
}

/** Ends the call on burn: deletes the LiveKit room, which removes everyone still in it. */
export async function endCall(
  cfg: LiveKitConfig,
  roomId: Id,
  { client }: { client?: { deleteRoom(name: string): Promise<void> } } = {},
): Promise<void> {
  const rooms = client ?? new RoomServiceClient(cfg.url.replace(/^ws/, 'http'), cfg.apiKey, cfg.apiSecret)
  try {
    await rooms.deleteRoom(callRoomName(roomId))
  } catch (err) {
    // Nobody ever joined the call, or it's already gone.
    const e = err as { status?: number; code?: string }
    if (e.status === 404 || e.code === 'not_found') return
    throw err
  }
}
