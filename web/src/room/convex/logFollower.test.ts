import { describe, expect, it } from 'vitest'
import type { RoomEvent } from '../../../../shared/schema'
import sampleJson from './__fixtures__/events.sample.json'
import { follow, WINDOW_SIZE, type FollowerState } from './logFollower'

// TODO replace with real rows: the sample is generated from kevin.expected.json (see events.sample.README.md).
const sample = sampleJson as unknown as Array<{ eventSeq: number; event: RoomEvent }>
const start: FollowerState = { lastEventSeq: 0, dropped: 0 }
const burned: RoomEvent = { type: 'room_burned', roomId: 'room1' }
/** A well-formed row; room_burned is the smallest event the parser accepts. */
const row = (eventSeq: number) => ({ eventSeq, event: { ...burned, roomId: `r${eventSeq}` } })
const bad = (eventSeq: number) => ({ eventSeq, event: { type: 'line_added' } })
const active = (events: unknown[]) => ({ status: 'active' as const, events })
const seqsOf = (events: RoomEvent[]) => events.map((e) => (e.type === 'room_burned' ? e.roomId : e.type))

describe('follow', () => {
  it('emits each event once when the full log is resent three times', () => {
    let state = start
    const seen: RoomEvent[] = []
    for (let i = 0; i < 3; i++) {
      const out = follow(state, active(sample))
      if (out.kind !== 'events') throw new Error(`expected events, got ${out.kind}`)
      seen.push(...out.events)
      state = out.next
    }
    expect(seen).toEqual(sample.map((r) => r.event))
    expect(state).toEqual({ lastEventSeq: sample.length, dropped: 0 })
  })

  it('sorts out-of-order rows in one update', () => {
    const out = follow(start, active([row(3), row(1), row(2)]))
    expect(out).toEqual({ kind: 'events', events: [row(1).event, row(2).event, row(3).event], next: { lastEventSeq: 3, dropped: 0 } })
  })

  it('ignores a seq repeated inside one update', () => {
    const out = follow(start, active([row(1), row(1), row(2)]))
    expect(out.kind === 'events' && seqsOf(out.events)).toEqual(['r1', 'r2'])
  })

  it('reports a gap when the first new row skips ahead, and emits nothing', () => {
    const out = follow({ lastEventSeq: 2, dropped: 0 }, active([row(1), row(2), row(5)]))
    expect(out).toEqual({
      kind: 'gap',
      events: [],
      expected: 3,
      got: 5,
      next: { lastEventSeq: 2, dropped: 0 },
      resubscribeFrom: 2,
    })
  })

  it('emits the contiguous prefix before a gap in the middle of a batch', () => {
    const out = follow(start, active([row(1), row(2), row(4), row(5)]))
    expect(out).toEqual({
      kind: 'gap',
      events: [row(1).event, row(2).event],
      expected: 3,
      got: 4,
      next: { lastEventSeq: 2, dropped: 0 },
      resubscribeFrom: 2,
    })
  })

  it(`asks to resubscribe when one update has more than ${WINDOW_SIZE} rows`, () => {
    const rows = Array.from({ length: WINDOW_SIZE + 1 }, (_, i) => row(i + 1))
    const out = follow(start, active(rows))
    expect(out.kind).toBe('events')
    if (out.kind !== 'events') return
    expect(out.events).toHaveLength(WINDOW_SIZE + 1)
    expect(out.next.lastEventSeq).toBe(WINDOW_SIZE + 1)
    expect(out.resubscribeFrom).toBe(WINDOW_SIZE + 1)
  })

  it(`does not resubscribe at exactly ${WINDOW_SIZE} rows`, () => {
    const rows = Array.from({ length: WINDOW_SIZE }, (_, i) => row(i + 1))
    const out = follow(start, active(rows))
    expect(out.kind === 'events' && out.resubscribeFrom).toBeUndefined()
  })

  it('skips and counts a rejected row', () => {
    const out = follow(start, active([row(1), 'not a row', row(2)]))
    expect(out).toEqual({ kind: 'events', events: [row(1).event, row(2).event], next: { lastEventSeq: 2, dropped: 1 } })
  })

  it('lets a rejected row with a valid seq consume that seq, so it causes no gap', () => {
    const out = follow(start, active([row(1), bad(2), row(3)]))
    expect(out).toEqual({ kind: 'events', events: [row(1).event, row(3).event], next: { lastEventSeq: 3, dropped: 1 } })
  })

  it('does not count a rejected row again when the log is resent', () => {
    const first = follow(start, active([row(1), bad(2)]))
    if (first.kind !== 'events') throw new Error('expected events')
    const second = follow(first.next, active([row(1), bad(2), row(3)]))
    expect(second).toEqual({ kind: 'events', events: [row(3).event], next: { lastEventSeq: 3, dropped: 1 } })
  })

  it('returns burned for a burned log, ignoring its events', () => {
    expect(follow(start, { status: 'burned', events: [row(1)] })).toEqual({ kind: 'burned' })
  })
})
