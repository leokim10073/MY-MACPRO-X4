import type {
  Id,
  Member,
  Person,
  Recall,
  Recap,
  RoomEvent,
  Story,
  StoryState,
  TranscriptLine,
} from '../../../shared/schema'

export interface RoomState {
  status: 'active' | 'burned'
  /** In join order, upserted by id. */
  members: Member[]
  /** Sorted by seq, unique by id. */
  lines: TranscriptLine[]
  storyState: StoryState | null
  /** Unique by id, in arrival order. */
  recalls: Recall[]
  /** Unique by id; a later event with the same id replaces the earlier one. */
  recaps: Recap[]
}

export const initialRoomState: RoomState = {
  status: 'active',
  members: [],
  lines: [],
  storyState: null,
  recalls: [],
  recaps: [],
}

function upsert<T extends { id: Id }>(items: T[], item: T): T[] {
  return items.some((x) => x.id === item.id)
    ? items.map((x) => (x.id === item.id ? item : x))
    : [...items, item]
}

export function roomReducer(state: RoomState, event: RoomEvent): RoomState {
  if (state.status === 'burned') return state
  switch (event.type) {
    case 'member_joined':
      return { ...state, members: upsert(state.members, event.member) }
    case 'line_added': {
      if (state.lines.some((l) => l.id === event.line.id)) return state
      return { ...state, lines: [...state.lines, event.line].sort((a, b) => a.seq - b.seq) }
    }
    case 'story_state_updated': {
      const stored = state.storyState
      if (stored && event.storyState.uptoSeq <= stored.uptoSeq) return state
      return { ...state, storyState: event.storyState }
    }
    case 'recall':
      if (state.recalls.some((r) => r.id === event.recall.id)) return state
      return { ...state, recalls: [...state.recalls, event.recall] }
    case 'recap_ready':
      return { ...state, recaps: upsert(state.recaps, event.recap) }
    case 'room_burned':
      return { ...initialRoomState, status: 'burned' }
  }
}

export function storiesById(state: RoomState): Map<Id, Story> {
  return new Map((state.storyState?.stories ?? []).map((s) => [s.id, s]))
}

export function personById(state: RoomState, id: Id): Person | undefined {
  return state.storyState?.people.find((p) => p.id === id)
}

// TEMPORARY: matching on uptoSeq === joinedAtSeq stands in until schema proposal P2
// (Recap.forMemberId) is agreed. This is the only place that matches recaps.
export function recapFor(state: RoomState, self: Member): Recap | undefined {
  if (self.joinedAtSeq <= 0) return undefined
  return state.recaps.find((r) => r.uptoSeq === self.joinedAtSeq)
}
