// Follows the room's append-only event log safely. Pure: no Convex import.
// Every `events:listAfter` update resends the whole log after `afterEventSeq`,
// so each update is checked, deduplicated, ordered and checked for gaps here.
import type { RoomEvent } from '../../../../shared/schema'
import { parseEventRow } from './parseEventRow'

export interface FollowerState {
  /** The highest eventSeq this phone has consumed (emitted or stepped over as rejected). */
  lastEventSeq: number
  /** Rows rejected by parseEventRow so far. */
  dropped: number
}

export type FollowerOutput =
  | { kind: 'events'; events: RoomEvent[]; next: FollowerState; resubscribeFrom?: number }
  | { kind: 'burned' }
  | {
      kind: 'gap'
      /** The contiguous rows emitted before the missing seq. */
      events: RoomEvent[]
      expected: number
      got: number
      next: FollowerState
      resubscribeFrom: number
    }

/** An update with more rows than this asks for a fresh subscription from the last seq, to keep updates small. */
export const WINDOW_SIZE = 200

export function follow(
  state: FollowerState,
  log: { status: 'active' | 'burned'; events: unknown[] },
): FollowerOutput {
  if (log.status === 'burned') return { kind: 'burned' }

  let dropped = state.dropped
  // A null event marks a rejected row whose seq is still valid: it consumes that seq.
  const fresh: Array<{ seq: number; event: RoomEvent | null }> = []
  for (const raw of log.events) {
    const parsed = parseEventRow(raw)
    if (parsed.ok) fresh.push({ seq: parsed.row.eventSeq, event: parsed.row.event })
    else if (parsed.eventSeq === null) dropped += 1
    else fresh.push({ seq: parsed.eventSeq, event: null })
  }
  fresh.sort((a, b) => a.seq - b.seq)

  let last = state.lastEventSeq
  const events: RoomEvent[] = []
  for (const { seq, event } of fresh) {
    if (seq <= last) continue // already seen, or repeated in this update
    if (seq !== last + 1) {
      const next = { lastEventSeq: last, dropped }
      return { kind: 'gap', events, expected: last + 1, got: seq, next, resubscribeFrom: last }
    }
    last = seq
    if (event) events.push(event)
    else dropped += 1
  }

  const next = { lastEventSeq: last, dropped }
  return log.events.length > WINDOW_SIZE
    ? { kind: 'events', events, next, resubscribeFrom: last }
    : { kind: 'events', events, next }
}
