import type { Id, Story as SchemaStory } from '../../../shared/schema'

/** A person the room has told stories about: one node on the map. */
export interface Character {
  id: Id
  name: string
}

/** A story as the map sees it. `raw` is the original, for the existing StoryCard. */
export interface Story {
  id: Id
  title: string
  summary: string
  /** Deduped; the first is the story's main subject. */
  participantIds: Id[]
  /** When it first came up (the room's line seq), so newer stories sort higher. */
  createdAt: number
  /** Who told it, when that member is known. */
  reportedBy?: string
  raw: SchemaStory
}

/** Joins two ids into one order-independent key for an edge. */
export const PAIR_SEP = '~'

export function pairKey(a: Id, b: Id): string {
  return a < b ? `${a}${PAIR_SEP}${b}` : `${b}${PAIR_SEP}${a}`
}

// A type alias, not an interface, so it fits React Flow's Record<string, unknown> edge data.
export type RelationshipEdgeData = {
  /** pairKey(source, target); source sorts before target. */
  id: string
  source: Id
  target: Id
  /** Every story the two of them are in, newest first. */
  storyIds: Id[]
  /** How many stories they share: drives the line's width. */
  weight: number
  latestTitle: string
  /** True when they only ever came up together in stories about three or more people. */
  isGroup: boolean
}

export interface GraphModel {
  characters: Character[]
  edges: RelationshipEdgeData[]
  storiesById: Map<Id, Story>
  /** Each character's stories, newest first. */
  storiesByCharacter: Map<Id, Story[]>
  /** Stories about one person only, newest first. They draw no edge. */
  soloStories: Story[]
}
