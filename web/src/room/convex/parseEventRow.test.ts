import { describe, expect, it } from 'vitest'
import { initialRoomState, roomReducer } from '../state'
import { parseEventRow } from './parseEventRow'
import type { EventRow } from './parseEventRow'
import sampleJson from './__fixtures__/events.sample.json'

// TODO replace with real rows: the sample is generated from kevin.expected.json (see events.sample.README.md).
type Ev = Record<string, Record<string, unknown>>
const sample = sampleJson as unknown as { eventSeq: number; event: Record<string, unknown> }[]
const row = (type: string) => sample.find((r) => r.event.type === type)!
const withEvent = (type: string, patch: (e: Ev) => void) => {
  const copy = structuredClone(row(type))
  patch(copy.event as unknown as Ev)
  return copy
}
const reasonOf = (raw: unknown): string => {
  const p = parseEventRow(raw)
  if (p.ok) throw new Error('expected rejection')
  return p.reason
}

describe('parseEventRow', () => {
  it('parses every row in the sample', () => {
    for (const r of sample) expect(parseEventRow(r).ok).toBe(true)
    expect(new Set(sample.map((r) => r.event.type))).toEqual(
      new Set(['member_joined', 'line_added', 'story_state_updated', 'recall', 'recap_ready']),
    )
  })

  it('returns the original event object unchanged', () => {
    const r = sample[3]
    const p = parseEventRow(r)
    expect(p.ok && p.row.event).toBe(r.event)
    expect(p.ok && p.row.eventSeq).toBe(r.eventSeq)
  })

  it('folding the parsed events gives the same number of lines as the sample', () => {
    const events = sample.map((r) => (parseEventRow(r) as { ok: true; row: EventRow }).row.event)
    const state = events.reduce(roomReducer, initialRoomState)
    expect(state.lines).toHaveLength(sample.filter((r) => r.event.type === 'line_added').length)
    expect(state.recalls).toHaveLength(3)
  })

  it('parses room_burned with a roomId and passes extra fields through', () => {
    const raw = { eventSeq: 5, event: { type: 'room_burned', roomId: 'abc', extra: 1 }, _id: 'x' }
    const p = parseEventRow(raw)
    expect(p.ok && p.row.event).toBe(raw.event)
  })

  it('rejects non-objects without throwing', () => {
    for (const bad of [null, undefined, 3, 'x', []]) expect(parseEventRow(bad).ok).toBe(false)
  })

  it('rejects a missing event type', () => {
    const p = parseEventRow(withEvent('line_added', (e) => delete e.type))
    expect(p.ok).toBe(false)
    expect(!p.ok && p.eventSeq).toBe(sample.find((r) => r.event.type === 'line_added')!.eventSeq)
  })

  it('rejects an unknown event type', () => {
    expect(reasonOf({ eventSeq: 1, event: { type: 'nope' } })).toMatch(/unknown/i)
  })

  it('rejects a missing event', () => {
    expect(parseEventRow({ eventSeq: 1 }).ok).toBe(false)
  })

  it.each([0, -1, 1.5, NaN, '3', undefined, null])('rejects eventSeq %s with eventSeq null', (bad) => {
    const p = parseEventRow({ eventSeq: bad, event: row('line_added').event })
    expect(p.ok).toBe(false)
    expect(!p.ok && p.eventSeq).toBeNull()
  })

  it('rejects a recall without storyIds', () => {
    const p = parseEventRow(withEvent('recall', (e) => delete e.recall.storyIds))
    expect(p.ok).toBe(false)
    expect(!p.ok && p.reason).toBe('recall: recall.storyIds is not an array')
  })

  it('rejects a line_added with a non-numeric seq', () => {
    expect(reasonOf(withEvent('line_added', (e) => (e.line.seq = '4')))).toBe(
      'line_added: line.seq is not a number',
    )
  })

  it('rejects a non-finite number', () => {
    expect(reasonOf(withEvent('line_added', (e) => (e.line.seq = Infinity)))).toMatch(/line\.seq/)
  })

  it.each([
    ['member_joined', (e: Ev) => delete e.member, 'member_joined: member is not an object'],
    ['member_joined', (e: Ev) => (e.member.id = 3), 'member_joined: member.id is not a string'],
    ['member_joined', (e: Ev) => delete e.member.joinedAtSeq, 'member_joined: member.joinedAtSeq is not a number'],
    ['line_added', (e: Ev) => delete e.line, 'line_added: line is not an object'],
    ['line_added', (e: Ev) => delete e.line.text, 'line_added: line.text is not a string'],
    ['line_added', (e: Ev) => delete e.line.speakerName, 'line_added: line.speakerName is not a string'],
    ['story_state_updated', (e: Ev) => delete e.storyState.people, 'story_state_updated: storyState.people is not an array'],
    ['story_state_updated', (e: Ev) => (e.storyState.stories = {}), 'story_state_updated: storyState.stories is not an array'],
    ['story_state_updated', (e: Ev) => delete e.storyState.uptoSeq, 'story_state_updated: storyState.uptoSeq is not a number'],
    ['recall', (e: Ev) => delete e.recall.confidence, 'recall: recall.confidence is not a number'],
    ['recall', (e: Ev) => delete e.recall.personId, 'recall: recall.personId is not a string'],
    ['recap_ready', (e: Ev) => delete e.recap.text, 'recap_ready: recap.text is not a string'],
    ['recap_ready', (e: Ev) => delete e.recap.uptoSeq, 'recap_ready: recap.uptoSeq is not a number'],
  ])('rejects broken %s shape: %s', (type, patch, reason) => {
    expect(reasonOf(withEvent(type, patch))).toBe(reason)
  })

  it('rejects room_burned without a roomId', () => {
    expect(reasonOf({ eventSeq: 2, event: { type: 'room_burned' } })).toBe(
      'room_burned: roomId is not a string',
    )
  })

  it('never puts conversation text in a reason', () => {
    const bad = withEvent('line_added', (e) => {
      e.line.text = 'SECRET GOSSIP about Kevin'
      e.line.seq = 'oops'
    })
    const reason = reasonOf(bad)
    expect(reason).not.toContain('SECRET')
    expect(reason).not.toContain('oops')
  })
})
