import { describe, expect, it } from 'vitest'
import type { Story as SchemaStory, StoryState } from '../../../shared/schema'
import { adaptStoryState } from './adapt'
import { deriveGraph } from './deriveGraph'
import { pairKey, type Character, type Story } from './types'

const people: Character[] = ['ann', 'bo', 'cy', 'di'].map((id) => ({ id, name: id.toUpperCase() }))

function story(id: string, participantIds: string[], createdAt: number, title = id): Story {
  const raw = { id, personIds: participantIds, keyword: title, summary: `${id} summary`, firstSeq: createdAt, lastSeq: createdAt } as SchemaStory
  return { id, title, summary: raw.summary, participantIds, createdAt, raw }
}

describe('deriveGraph', () => {
  it('a story about two people draws one edge between them', () => {
    const g = deriveGraph(people, [story('s1', ['ann', 'bo'], 1)])
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ id: pairKey('ann', 'bo'), weight: 1, isGroup: false, storyIds: ['s1'] })
  })

  it('a story about three people draws all three edges, each marked as a group', () => {
    const g = deriveGraph(people, [story('s1', ['ann', 'bo', 'cy'], 1)])
    expect(g.edges.map((e) => e.id).sort()).toEqual(
      [pairKey('ann', 'bo'), pairKey('ann', 'cy'), pairKey('bo', 'cy')].sort(),
    )
    expect(g.edges.every((e) => e.isGroup)).toBe(true)
  })

  it('two stories on the same pair give weight 2, and the chip shows the newest title', () => {
    const g = deriveGraph(people, [story('old', ['bo', 'ann'], 1, 'Coffee'), story('new', ['ann', 'bo'], 5, 'Texting')])
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ weight: 2, latestTitle: 'Texting', storyIds: ['new', 'old'] })
  })

  it('a solo story draws no edge and is listed with the solo stories', () => {
    const g = deriveGraph(people, [story('solo', ['di'], 1)])
    expect(g.edges).toHaveLength(0)
    expect(g.soloStories.map((s) => s.id)).toEqual(['solo'])
    expect(g.storiesByCharacter.get('di')!.map((s) => s.id)).toEqual(['solo'])
  })

  it('dedupes a participant listed twice', () => {
    const g = deriveGraph(people, [story('s1', ['ann', 'ann', 'bo', 'bo'], 1)])
    expect(g.edges).toHaveLength(1)
    expect(g.storiesById.get('s1')!.participantIds).toEqual(['ann', 'bo'])
    expect(g.storiesByCharacter.get('ann')).toHaveLength(1)
    // Only the same person twice is still a solo story, not a self-edge.
    const solo = deriveGraph(people, [story('s2', ['cy', 'cy'], 1)])
    expect(solo.edges).toHaveLength(0)
    expect(solo.soloStories).toHaveLength(1)
  })

  it('pairKey is the same either way round', () => {
    expect(pairKey('ann', 'bo')).toBe(pairKey('bo', 'ann'))
    expect(pairKey('x', 'y')).toBe('x~y')
  })
})

describe('adaptStoryState', () => {
  it('maps stories, names the teller, and keeps only people who are in a story', () => {
    const raw = {
      id: 's1',
      roomId: 'r',
      personIds: ['p1', 'p2', 'p_unknown'],
      keyword: 'Coffee',
      summary: 'They met.',
      tellerId: 'm1',
      reactions: [],
      speculation: [],
      sourceLineIds: [],
      firstSeq: 3,
      lastSeq: 7,
    } as SchemaStory
    const state = {
      roomId: 'r',
      uptoSeq: 7,
      people: [
        { id: 'p1', roomId: 'r', name: 'Ricky', aliases: [], storyIds: ['s1'] },
        { id: 'p2', roomId: 'r', name: 'Aaron', aliases: [], storyIds: ['s1'] },
        { id: 'p3', roomId: 'r', name: 'Nobody', aliases: [], storyIds: [] },
      ],
      stories: [raw],
      currentTopic: '',
      openQuestions: [],
      updatedAt: 0,
    } as unknown as StoryState
    const { characters, stories } = adaptStoryState(state, [{ id: 'm1', roomId: 'r', name: 'Jingo', joinedAtSeq: 0, joinedAt: 0 }])
    expect(characters.map((c) => c.name)).toEqual(['Ricky', 'Aaron'])
    expect(stories[0]).toMatchObject({ title: 'Coffee', summary: 'They met.', participantIds: ['p1', 'p2'], createdAt: 3, reportedBy: 'Jingo', raw })
    expect(adaptStoryState(null, [])).toEqual({ characters: [], stories: [] })
  })
})
