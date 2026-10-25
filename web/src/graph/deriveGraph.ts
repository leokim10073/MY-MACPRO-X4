import type { Id } from '../../../shared/schema'
import { pairKey, type Character, type GraphModel, type RelationshipEdgeData, type Story } from './types'

const newestFirst = (a: Story, b: Story) => b.createdAt - a.createdAt || b.raw.lastSeq - a.raw.lastSeq || (a.id < b.id ? 1 : -1)

/** Characters become nodes; every pair of people in the same story gets one edge. Pure. */
export function deriveGraph(characters: Character[], stories: Story[]): GraphModel {
  const known = new Set(characters.map((c) => c.id))
  const cleaned = stories
    .map((s) => ({ ...s, participantIds: [...new Set(s.participantIds)].filter((id) => known.has(id)) }))
    .sort(newestFirst)

  const storiesById = new Map<Id, Story>()
  const storiesByCharacter = new Map<Id, Story[]>(characters.map((c) => [c.id, []]))
  const soloStories: Story[] = []
  const pairs = new Map<string, { source: Id; target: Id; stories: Story[] }>()

  for (const s of cleaned) {
    storiesById.set(s.id, s)
    for (const id of s.participantIds) storiesByCharacter.get(id)!.push(s)
    if (s.participantIds.length === 1) soloStories.push(s)
    const ids = s.participantIds
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i], ids[j])
        const [source, target] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]]
        const pair = pairs.get(key) ?? { source, target, stories: [] }
        pair.stories.push(s)
        pairs.set(key, pair)
      }
    }
  }

  const edges: RelationshipEdgeData[] = [...pairs].map(([id, p]) => ({
    id,
    source: p.source,
    target: p.target,
    storyIds: p.stories.map((s) => s.id),
    weight: p.stories.length,
    latestTitle: p.stories[0].title,
    isGroup: p.stories.every((s) => s.participantIds.length > 2),
  }))

  return { characters, edges, storiesById, storiesByCharacter, soloStories }
}
