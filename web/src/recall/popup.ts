import type { Id, Member, Person, Recall, Story } from '../../../shared/schema'
import {
  RECALL_CHIP_TIMEOUT_MS,
  RECALL_COOLDOWN_MS,
  RECALL_MIN_CONFIDENCE,
  shouldShowRecall,
} from '../../../shared/schema'

// Web-only until the team agrees on schema changes.
export const RECALL_PENDING_MS = 6000

export interface VisiblePopup {
  recallId: Id
  personId: Id
  storyIds: Id[]
  focusStoryId?: Id
  expiresAt: number
}
export interface PopupState {
  visible: VisiblePopup | null
  closedAt: Record<Id, number>
  pending: { recall: Recall; receivedAt: number }[]
}
export interface PopupContext {
  self: Member
  stories: Story[]
  people: Person[]
  focusedBypassesCooldown: boolean
}
export type PopupInput =
  | { type: 'recall'; recall: Recall; now: number }
  | { type: 'tick'; now: number }
  | { type: 'dismiss'; now: number }
  | { type: 'chip_tapped'; now: number }

export const initialPopupState: PopupState = { visible: null, closedAt: {}, pending: [] }

function known(recall: Recall, ctx: PopupContext): boolean {
  return (
    ctx.people.some((p) => p.id === recall.personId) &&
    recall.storyIds.every((id) => ctx.stories.some((s) => s.id === id))
  )
}

function close(state: PopupState, now: number): PopupState {
  if (!state.visible) return state
  return {
    ...state,
    visible: null,
    closedAt: { ...state.closedAt, [state.visible.personId]: now },
  }
}

function present(state: PopupState, recall: Recall, now: number, ctx: PopupContext): PopupState {
  const v = state.visible
  if (v && v.personId === recall.personId) {
    const focusStoryId = recall.focusStoryId ?? v.focusStoryId
    const expiresAt = focusStoryId !== v.focusStoryId ? now + RECALL_CHIP_TIMEOUT_MS : v.expiresAt
    return {
      ...state,
      visible: { ...v, recallId: recall.id, storyIds: recall.storyIds, focusStoryId, expiresAt },
    }
  }
  const closed = state.closedAt[recall.personId]
  if (
    closed !== undefined &&
    now - closed < RECALL_COOLDOWN_MS &&
    !(ctx.focusedBypassesCooldown && recall.focusStoryId)
  ) {
    return state
  }
  const base = v ? close(state, now) : state
  return {
    ...base,
    visible: {
      recallId: recall.id,
      personId: recall.personId,
      storyIds: recall.storyIds,
      focusStoryId: recall.focusStoryId,
      expiresAt: now + RECALL_CHIP_TIMEOUT_MS,
    },
  }
}

export function popupReducer(state: PopupState, input: PopupInput, ctx: PopupContext): PopupState {
  switch (input.type) {
    case 'recall': {
      const { recall, now } = input
      if (recall.confidence < RECALL_MIN_CONFIDENCE) return state
      if (!known(recall, ctx)) {
        return { ...state, pending: [...state.pending, { recall, receivedAt: now }] }
      }
      if (!shouldShowRecall(ctx.self, recall, ctx.stories)) return state
      return present(state, recall, now, ctx)
    }
    case 'tick': {
      const { now } = input
      let next = state.visible && now >= state.visible.expiresAt ? close(state, now) : state
      if (next.pending.length === 0) return next
      const stillPending: PopupState['pending'] = []
      const ready: Recall[] = []
      for (const entry of next.pending) {
        if (now - entry.receivedAt >= RECALL_PENDING_MS) continue
        if (known(entry.recall, ctx)) {
          if (shouldShowRecall(ctx.self, entry.recall, ctx.stories)) ready.push(entry.recall)
        } else {
          stillPending.push(entry)
        }
      }
      next = { ...next, pending: stillPending }
      for (const recall of ready) next = present(next, recall, now, ctx)
      return next
    }
    case 'dismiss':
    case 'chip_tapped':
      return close(state, input.now)
  }
}

export function visibleChips(p: VisiblePopup, stories: Story[]): Story[] {
  return p.storyIds.flatMap((id) => stories.filter((s) => s.id === id))
}
