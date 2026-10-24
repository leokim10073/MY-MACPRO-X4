import { describe, expect, it } from 'vitest'
import type { DemoFixture, ReplayScript, RoomEvent } from '../../../../shared/schema'
import replayJson from '../../../../shared/fixtures/kevin.replay.json'
import expectedJson from '../../../../shared/fixtures/kevin.expected.json'
import { initialRoomState, roomReducer } from '../state'
import { expectFixtureState } from '../testFixtures'
import { buildReplayTimeline, snapshotAt } from './timeline'

const script = replayJson as ReplayScript
const fixture = expectedJson as DemoFixture

const timeOfLine = (tl: ReturnType<typeof buildReplayTimeline>, id: string) =>
  tl.find((t) => t.event.type === 'line_added' && t.event.line.id === id)!.atMs
const selfJoin = (tl: ReturnType<typeof buildReplayTimeline>) =>
  tl.find((t) => t.event.type === 'member_joined' && t.event.member.id === 'm_self')!

describe('buildReplayTimeline', () => {
  it('with no options, folding the timeline through roomReducer equals the fixture', () => {
    const events = buildReplayTimeline(script, fixture).map((t) => t.event)
    expectFixtureState(events.reduce<ReturnType<typeof roomReducer>>(roomReducer, initialRoomState))
  })

  it('line 17 is at 45500 ms and r1 at 46300 ms', () => {
    const tl = buildReplayTimeline(script, fixture)
    expect(timeOfLine(tl, 'l16')).toBe(39500)
    expect(timeOfLine(tl, 'l17')).toBe(45500)
    const r1 = tl.find((t) => t.event.type === 'recall' && t.event.recall.id === 'r1')!
    expect(r1.atMs).toBe(46300)
  })

  it('is sorted by atMs', () => {
    const tl = buildReplayTimeline(script, fixture)
    for (let i = 1; i < tl.length; i++) expect(tl[i].atMs).toBeGreaterThanOrEqual(tl[i - 1].atMs)
  })

  it('speed 2 halves every atMs', () => {
    const a = buildReplayTimeline(script, fixture)
    const b = buildReplayTimeline(script, fixture, { speed: 2 })
    expect(b.map((t) => t.atMs)).toEqual(a.map((t) => t.atMs / 2))
  })

  it('latecomer self', () => {
    const tl = buildReplayTimeline(script, fixture, { self: { name: 'Me', mode: 'latecomer' } })
    const me = selfJoin(tl)
    expect((me.event as Extract<RoomEvent, { type: 'member_joined' }>).member.joinedAtSeq).toBe(16)
    expect(me.atMs).toBe(0)
    expect(timeOfLine(tl, 'l16')).toBe(0)
    expect(timeOfLine(tl, 'l17')).toBe(6000)
    const taylorIdx = tl.findIndex((t) => t.event.type === 'member_joined' && t.event.member.id === 'm_taylor')
    expect(tl.indexOf(me)).toBe(taylorIdx + 1)
  })

  it('host self', () => {
    const tl = buildReplayTimeline(script, fixture, { self: { name: 'Me', mode: 'host' } })
    const me = selfJoin(tl)
    expect((me.event as Extract<RoomEvent, { type: 'member_joined' }>).member.joinedAtSeq).toBe(0)
    expect(me.atMs).toBe(0)
    expect(timeOfLine(tl, 'l17')).toBe(45500)
  })

  it('pauseAfterJoinMs: 15000 moves l17 by 15000 ms', () => {
    const tl = buildReplayTimeline(script, fixture, { pauseAfterJoinMs: 15000 })
    expect(timeOfLine(tl, 'l16')).toBe(39500)
    expect(timeOfLine(tl, 'l17')).toBe(60500)
    const taylor = tl.find((t) => t.event.type === 'member_joined' && t.event.member.id === 'm_taylor')!
    expect(taylor.atMs).toBe(39500)
    const recap = tl.find((t) => t.event.type === 'recap_ready')!
    expect(recap.atMs).toBe(39500 + 1500)
  })

  it('latecomer with pauseAfterJoinMs: recap at 1500, l17 at 21000, r1 at 21800', () => {
    const tl = buildReplayTimeline(script, fixture, {
      self: { name: 'Me', mode: 'latecomer' },
      pauseAfterJoinMs: 15000,
    })
    expect(tl.find((t) => t.event.type === 'recap_ready')!.atMs).toBe(1500)
    expect(timeOfLine(tl, 'l17')).toBe(21000)
    const r1 = tl.find((t) => t.event.type === 'recall' && t.event.recall.id === 'r1')!
    expect(r1.atMs).toBe(21800)
  })
})

describe('snapshotAt', () => {
  it('at 7 has only s_cake and no topic', () => {
    const s = snapshotAt(fixture, 7)
    expect(s.stories.map((x) => x.id)).toEqual(['s_cake'])
    expect(s.people[0].storyIds).toEqual(['s_cake'])
    expect(s.currentTopic).toBe('')
    expect(s.openQuestions).toEqual([])
    expect(s.uptoSeq).toBe(7)
  })

  it('at 21 deep-equals fixture.storyState', () => {
    expect(snapshotAt(fixture, 21)).toEqual(fixture.storyState)
  })
})
