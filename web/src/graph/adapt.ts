import type { Member, StoryState } from '../../../shared/schema'
import type { Character, Story } from './types'

/** Reads the room's story state into the map's shapes. Only people who are in at least one story become characters. */
export function adaptStoryState(storyState: StoryState | null, members: Member[]): { characters: Character[]; stories: Story[] } {
  const people = storyState?.people ?? []
  const known = new Set(people.map((p) => p.id))
  const stories: Story[] = (storyState?.stories ?? []).map((s) => ({
    id: s.id,
    title: s.keyword,
    summary: s.summary,
    // A person id the state doesn't know (yet) can't be drawn, so it's left out.
    participantIds: s.personIds.filter((id) => known.has(id)),
    createdAt: s.firstSeq,
    reportedBy: members.find((m) => m.id === s.tellerId)?.name,
    raw: s,
  }))
  const inAStory = new Set(stories.flatMap((s) => s.participantIds))
  const characters = people.filter((p) => inAStory.has(p.id)).map((p) => ({ id: p.id, name: p.name }))
  return { characters, stories }
}
