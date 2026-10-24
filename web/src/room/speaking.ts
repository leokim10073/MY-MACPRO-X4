// "Who is speaking now" for the room stage. RoomScreen reads only a SpeakingSignal, so a real
// push-to-talk signal from voice can replace useLineSpeaking later without touching the UI.
import { useEffect, useState } from 'react'
import type { Id, TranscriptLine } from '../../../shared/schema'

export interface SpeakingSignal {
  speakerId: Id | null
}

/** How long the speaker of a new line stays highlighted. */
export const SPEAKING_HOLD_MS = 3000

export interface LineWatch {
  newestId: Id | null
}

function newest(lines: TranscriptLine[]): TranscriptLine | undefined {
  return lines.reduce<TranscriptLine | undefined>((a, l) => (a === undefined || l.seq > a.seq ? l : a), undefined)
}

/**
 * Compares the newest line with the one seen last time. The first look only records it, so
 * lines already on screen (a latecomer's catch-up burst, a reconnect) don't flash anyone.
 */
export function nextSpeaker(
  watch: LineWatch | null,
  lines: TranscriptLine[],
  joinedAtSeq: number,
): { watch: LineWatch; startSpeaking: Id | null } {
  const top = newest(lines)
  const next = { newestId: top?.id ?? null }
  const isNew = watch !== null && top !== undefined && top.id !== watch.newestId
  return { watch: next, startSpeaking: isNew && top.seq > joinedAtSeq ? top.speakerId : null }
}

/**
 * Highlights the speaker of each new line for SPEAKING_HOLD_MS, timed from when this phone
 * received it. line.at isn't used: it's script time in the mock and another device's clock on Convex.
 */
export function useLineSpeaking(lines: TranscriptLine[], joinedAtSeq: number): SpeakingSignal {
  const [tracked, setTracked] = useState<{ watch: LineWatch | null; speakerId: Id | null; epoch: number }>({
    watch: null,
    speakerId: null,
    epoch: 0,
  })

  // Adjust state while rendering when the newest line changes (React's pattern for derived state).
  const newestId = newest(lines)?.id ?? null
  if (tracked.watch === null || tracked.watch.newestId !== newestId) {
    const r = nextSpeaker(tracked.watch, lines, joinedAtSeq)
    setTracked({
      watch: r.watch,
      speakerId: r.startSpeaking ?? tracked.speakerId,
      epoch: r.startSpeaking ? tracked.epoch + 1 : tracked.epoch,
    })
  }

  const { epoch, speakerId } = tracked
  const speaking = speakerId !== null
  useEffect(() => {
    if (!speaking) return
    const timer = setTimeout(() => setTracked((t) => ({ ...t, speakerId: null })), SPEAKING_HOLD_MS)
    return () => clearTimeout(timer)
  }, [epoch, speaking])

  return { speakerId }
}
