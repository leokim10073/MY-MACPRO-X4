import { describe, expect, it } from 'vitest'
import type { DemoFixture, RoomEvent } from '../../../shared/schema'
import expectedJson from '../../../shared/fixtures/kevin.expected.json'
import { initialRoomState, personById, recapFor, roomReducer, storiesById } from './state'
import { expectFixtureState, fixtureEvents, fixtureLines } from './testFixtures'

const fixture = expectedJson as DemoFixture
const fold = (events: RoomEvent[]) => events.reduce(roomReducer, initialRoomState)
const lineEvent = (n: number): RoomEvent => ({ type: 'line_added', line: fixtureLines()[n - 1] })
const snapshot = (uptoSeq: number): RoomEvent => ({
  type: 'story_state_updated',
  storyState: { ...fixture.storyState, uptoSeq },
})

describe('roomReducer', () => {
  it('folds the fixture into the expected state', () => {
    expectFixtureState(fold(fixtureEvents()))
  })

  it('ignores a story snapshot with an older or equal uptoSeq', () => {
    const newer = fold([snapshot(21), snapshot(16)])
    expect(newer.storyState?.uptoSeq).toBe(21)
    expect(fold([snapshot(21), snapshot(21)]).storyState).toEqual(newer.storyState)
    expect(roomReducer(newer, snapshot(21))).toBe(newer)
    expect(roomReducer(newer, snapshot(16))).toBe(newer)
  })

  it('deduplicates and sorts lines', () => {
    const state = fold([3, 1, 3, 2].map(lineEvent))
    expect(state.lines.map((l) => l.id)).toEqual(['l1', 'l2', 'l3'])
  })

  it('upserts members by id and keeps join order', () => {
    const [alex, sam] = fixture.members
    const state = fold([
      { type: 'member_joined', member: alex },
      { type: 'member_joined', member: sam },
      { type: 'member_joined', member: { ...alex, name: 'Alexandra' } },
    ])
    expect(state.members.map((m) => m.name)).toEqual(['Alexandra', 'Sam'])
  })

  it('deduplicates recalls by id', () => {
    const recall = fixture.recalls[0]
    const state = fold([
      { type: 'recall', recall },
      { type: 'recall', recall },
    ])
    expect(state.recalls).toEqual([recall])
  })

  it('replaces a recap with the same id', () => {
    const state = fold([
      { type: 'recap_ready', recap: fixture.recap },
      { type: 'recap_ready', recap: { ...fixture.recap, audioUrl: 'http://x/a.mp3' } },
    ])
    expect(state.recaps).toHaveLength(1)
    expect(state.recaps[0].audioUrl).toBeDefined()
  })

  it('room_burned clears everything and ignores later events', () => {
    const burned = fold([...fixtureEvents(), { type: 'room_burned', roomId: 'demo' }])
    expect(burned).toEqual({ ...initialRoomState, status: 'burned' })
    expect(roomReducer(burned, lineEvent(1))).toBe(burned)
  })

  it('does not mutate the previous state', () => {
    const before = fold([lineEvent(1)])
    roomReducer(before, lineEvent(2))
    expect(before.lines).toHaveLength(1)
  })
})

describe('selectors', () => {
  const state = fold(fixtureEvents())
  const taylor = fixture.members.find((m) => m.name === 'Taylor')!
  const alex = fixture.members.find((m) => m.name === 'Alex')!

  it('recapFor gives the late joiner their recap and nobody else', () => {
    expect(recapFor(state, taylor)?.id).toBe('recap_16')
    expect(recapFor(state, alex)).toBeUndefined()
  })

  it('storiesById and personById read the story state', () => {
    expect(storiesById(state).get('s_cake')?.id).toBe('s_cake')
    const person = fixture.storyState.people[0]
    expect(personById(state, person.id)).toEqual(person)
    expect(personById(state, 'nobody')).toBeUndefined()
  })

  it('selectors cope with a null story state', () => {
    expect(storiesById(initialRoomState).size).toBe(0)
    expect(personById(initialRoomState, 'p_kevin')).toBeUndefined()
  })
})
