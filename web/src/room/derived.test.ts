import { describe, expect, it } from 'vitest'
import type { Member, TranscriptLine } from '../../../shared/schema'
import { initialRoomState, type RoomState } from './state'
import { initials, isMe, latestLine, orderMembersForStage, peopleCount } from './derived'

const member = (id: string, name: string, joinedAtSeq = 0): Member => ({
  id,
  roomId: 'demo',
  name,
  joinedAtSeq,
  joinedAt: 0,
})
const line = (seq: number, speakerId: string): TranscriptLine => ({
  id: `l${seq}`,
  roomId: 'demo',
  speakerId,
  speakerName: speakerId,
  text: 'hi',
  seq,
  at: 0,
})
const withMembers = (members: Member[], lines: TranscriptLine[] = []): RoomState => ({
  ...initialRoomState,
  members,
  lines,
})

const alex = member('m_alex', 'Alex')
const sam = member('m_sam', 'Sam')
const leo = member('m_self', 'Leo', 16)

describe('peopleCount', () => {
  it('is 0 in an empty room', () => {
    expect(peopleCount(initialRoomState)).toBe(0)
  })
  it('counts every member in room state', () => {
    expect(peopleCount(withMembers([alex, sam, leo]))).toBe(3)
  })
})

describe('isMe', () => {
  it('matches on id, not name', () => {
    expect(isMe(leo, leo)).toBe(true)
    expect(isMe(member('other', 'Leo'), leo)).toBe(false)
  })
})

describe('initials', () => {
  it('takes the first letter of one word', () => {
    expect(initials('Leo')).toBe('L')
  })
  it('takes the first letters of the first two words', () => {
    expect(initials('Mary Jane Watson')).toBe('MJ')
  })
  it('uppercases and trims', () => {
    expect(initials('  sam  ')).toBe('S')
  })
  it('keeps an emoji whole instead of splitting it', () => {
    expect(initials('🦄 Kim')).toBe('🦄K')
  })
  it('falls back to ? for a blank name', () => {
    expect(initials('   ')).toBe('?')
  })
})

describe('latestLine', () => {
  it('is undefined with no lines', () => {
    expect(latestLine(initialRoomState)).toBeUndefined()
  })
  it('is the line with the highest seq', () => {
    expect(latestLine(withMembers([], [line(1, 'a'), line(3, 'b'), line(2, 'c')]))?.seq).toBe(3)
  })
})

describe('orderMembersForStage', () => {
  it('puts the speaker first, then me, then the rest in join order', () => {
    const jamie = member('m_jamie', 'Jamie')
    expect(orderMembersForStage([alex, sam, jamie, leo], leo, 'm_jamie').map((m) => m.id)).toEqual([
      'm_jamie',
      'm_self',
      'm_alex',
      'm_sam',
    ])
  })
  it('puts me first when nobody is speaking', () => {
    expect(orderMembersForStage([alex, leo, sam], leo, null).map((m) => m.id)).toEqual([
      'm_self',
      'm_alex',
      'm_sam',
    ])
  })
  it('does not duplicate me when I am the speaker', () => {
    expect(orderMembersForStage([alex, leo], leo, 'm_self').map((m) => m.id)).toEqual(['m_self', 'm_alex'])
  })
  it('ignores a speaker id that is not a member', () => {
    expect(orderMembersForStage([alex, leo], leo, 'ghost').map((m) => m.id)).toEqual(['m_self', 'm_alex'])
  })
})
