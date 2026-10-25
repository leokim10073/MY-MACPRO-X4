import { useState } from 'react'
import type { Id, Recall } from '../../../shared/schema'
import type { LiveText } from '../../../voice/src/call/liveText'
import type { RoomState } from '../room/state'
import { findMentions, mentionToRecall } from './instant'

/** Kept so a long call doesn't grow the list forever; older ones have long been shown or skipped. */
const KEEP = 50

type Live = Readonly<Record<Id, LiveText>> | undefined

/** New recalls in `live`, skipping any already in `known`. */
function freshRecalls(live: Live, state: RoomState, selfId: Id, known: Recall[]): Recall[] {
  const storyState = state.storyState
  if (!live || !storyState) return []
  const latestSeq = state.lines.at(-1)?.seq ?? 0
  const fresh: Recall[] = []
  for (const [speakerId, entry] of Object.entries(live)) {
    if (speakerId === selfId) continue
    for (const m of findMentions(entry.text, storyState)) {
      const recall = mentionToRecall(m, { roomId: storyState.roomId, speakerId, latestSeq, storyState })
      if (!known.some((r) => r.id === recall.id) && !fresh.some((r) => r.id === recall.id)) fresh.push(recall)
    }
  }
  return fresh
}

/**
 * Recalls from friends' live text in the call (see instant.ts). Each speaker's turn yields at
 * most one recall per person; the list only grows, and keeps its identity when nothing new is
 * found, so the pop-up rules see each recall once.
 */
export function useInstantRecalls(live: Live, state: RoomState, selfId: Id): Recall[] {
  const [recalls, setRecalls] = useState<Recall[]>([])
  const [seenInputs, setSeenInputs] = useState({ live, storyState: state.storyState, lines: state.lines, status: state.status })
  // Updated during render when the inputs change (React's "adjust state on prop change" pattern).
  if (
    seenInputs.live !== live ||
    seenInputs.storyState !== state.storyState ||
    seenInputs.lines !== state.lines ||
    seenInputs.status !== state.status
  ) {
    setSeenInputs({ live, storyState: state.storyState, lines: state.lines, status: state.status })
    if (state.status === 'burned') {
      if (recalls.length > 0) setRecalls([])
    } else {
      const fresh = freshRecalls(live, state, selfId, recalls)
      if (fresh.length > 0) setRecalls([...recalls, ...fresh].slice(-KEEP))
    }
  }
  return recalls
}
