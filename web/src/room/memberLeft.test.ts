import { describe, expect, it } from 'vitest'
import type { Member, RoomEvent } from '../../../shared/schema'
import { parseEventRow } from './convex/parseEventRow'
import { peopleCount } from './derived'
import { initialRoomState, roomReducer } from './state'

const member = (id: string, name: string): Member => ({ id, roomId: 'r1', name, joinedAtSeq: 0, joinedAt: 0 })

describe('member_left', () => {
  it('drops the member, so the people count goes down', () => {
    const events: RoomEvent[] = [
      { type: 'member_joined', member: member('m1', 'Alex') },
      { type: 'member_joined', member: member('m2', 'Sam') },
      { type: 'member_left', memberId: 'm2' },
    ]
    const state = events.reduce(roomReducer, initialRoomState)
    expect(state.members.map((m) => m.name)).toEqual(['Alex'])
    expect(peopleCount(state)).toBe(1)
  })

  it('keeps the leaver\'s lines in the transcript', () => {
    const events: RoomEvent[] = [
      { type: 'member_joined', member: member('m2', 'Sam') },
      {
        type: 'line_added',
        line: { id: 'l1', roomId: 'r1', speakerId: 'm2', speakerName: 'Sam', text: 'hi', seq: 1, at: 1 },
      },
      { type: 'member_left', memberId: 'm2' },
    ]
    expect(events.reduce(roomReducer, initialRoomState).lines.map((l) => l.speakerName)).toEqual(['Sam'])
  })

  it('is accepted from the backend log, and malformed ones are rejected', () => {
    expect(parseEventRow({ eventSeq: 3, event: { type: 'member_left', memberId: 'm2' } })).toEqual({
      ok: true,
      row: { eventSeq: 3, event: { type: 'member_left', memberId: 'm2' } },
    })
    expect(parseEventRow({ eventSeq: 3, event: { type: 'member_left' } })).toMatchObject({
      ok: false,
      reason: 'member_left: memberId is not a string',
    })
  })
})
