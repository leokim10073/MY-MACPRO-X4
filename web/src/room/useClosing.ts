// The closing (burn) timeline for one phone. It keeps an in-memory copy of the last live room
// so the burn can play over it, then drops that copy at DONE_MS. Nothing here is persisted.
import { useEffect, useState } from 'react'
import { BURN_DURATION_MS, BURN_START_MS, DONE_MS, IGNITE_MS, closingPhase, seedFromRoomId, type ClosingPhase } from './closing'
import type { RoomState } from './state'

export interface Closing {
  phase: ClosingPhase
  startedAt: number
  seed: number
}

export interface UseClosing {
  closing: Closing | null
  /** The last active state, kept until DONE_MS. Null once done, or if no active state was seen. */
  frozen: RoomState | null
  done: boolean
}

interface Tracked {
  frozen: RoomState | null
  startedAt: number | null
  phase: ClosingPhase | null
}

/** The moments the phase changes, in ms from the start. */
const STEPS = [IGNITE_MS, BURN_START_MS + BURN_DURATION_MS, DONE_MS]

/**
 * Starts once, when the room is burned or this phone's burn call succeeded, whichever comes first.
 * A later signal is ignored, so the closing never restarts.
 */
export function useClosing(state: RoomState, roomId: string | null, burnConfirmed: boolean): UseClosing {
  const [tracked, setTracked] = useState<Tracked>({ frozen: null, startedAt: null, phase: null })

  // Adjust state while rendering (React's pattern for derived state), as room/speaking.ts does.
  const started = tracked.startedAt !== null
  if (!started && (state.status === 'burned' || burnConfirmed)) {
    const frozen = state.status === 'active' ? state : tracked.frozen
    // The clock is read in the updater, which also keeps the start once-only if React replays it.
    setTracked((t) => (t.startedAt !== null ? t : { frozen, startedAt: Date.now(), phase: frozen ? 'ignite' : 'done' }))
  } else if (!started && state.status === 'active' && tracked.frozen !== state) {
    setTracked({ ...tracked, frozen: state })
  }

  const { startedAt, phase } = tracked
  const running = startedAt !== null && phase !== 'done'
  useEffect(() => {
    if (!running || startedAt === null) return
    const elapsed = Date.now() - startedAt
    const timers = STEPS.filter((at) => at > elapsed).map((at) =>
      setTimeout(() => {
        const next = closingPhase(at)
        setTracked((t) => (next === 'done' ? { ...t, frozen: null, phase: next } : { ...t, phase: next }))
      }, at - elapsed),
    )
    return () => timers.forEach(clearTimeout)
  }, [running, startedAt])

  const done = phase === 'done'
  return {
    closing: startedAt !== null && phase !== null ? { phase, startedAt, seed: roomId ? seedFromRoomId(roomId) : 0 } : null,
    frozen: done ? null : tracked.frozen,
    done,
  }
}
