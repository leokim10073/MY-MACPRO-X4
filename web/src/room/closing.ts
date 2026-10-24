export type ClosingPhase = 'ignite' | 'burning' | 'settle' | 'done'

/** All times are ms from the moment closing starts. */
export const IGNITE_MS = 600
export const BURN_START_MS = 560
export const BURN_DURATION_MS = 2000
export const DONE_MS = 2900

export function closingPhase(elapsedMs: number): ClosingPhase {
  if (elapsedMs < IGNITE_MS) return 'ignite'
  if (elapsedMs < BURN_START_MS + BURN_DURATION_MS) return 'burning'
  if (elapsedMs < DONE_MS) return 'settle'
  return 'done'
}

/** Unsigned 32-bit FNV-1a hash of the room id. */
export function seedFromRoomId(roomId: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < roomId.length; i++) {
    hash ^= roomId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
