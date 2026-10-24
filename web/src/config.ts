import type { TimelineOptions } from './room/mock/timeline'

// Reads ?speed= ?pauseAfterJoin= ?room=. Missing or invalid values are omitted.
export function readMockOptions(search: string): Omit<TimelineOptions, 'self'> & { inviteToken?: string } {
  const params = new URLSearchParams(search)
  const out: Omit<TimelineOptions, 'self'> & { inviteToken?: string } = {}
  const positive = (key: string): number | undefined => {
    const raw = params.get(key)
    if (raw === null || raw.trim() === '') return undefined
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const speed = positive('speed')
  if (speed !== undefined) out.speed = speed
  const pause = positive('pauseAfterJoin')
  if (pause !== undefined) out.pauseAfterJoinMs = pause
  const room = params.get('room')
  if (room) out.inviteToken = room
  return out
}
