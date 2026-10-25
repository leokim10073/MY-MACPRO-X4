import { describe, expect, it } from 'vitest'
import type { StoryState } from '../../../shared/schema'
import expectedJson from '../../../shared/fixtures/kevin.expected.json'
import { findMentions, mentionToRecall } from './instant'

const kevinState = (expectedJson as { storyState: StoryState }).storyState

describe('findMentions', () => {
  it('finds a known person by name, mid-sentence', () => {
    expect(findMentions('so Kevin just', kevinState)).toEqual([
      { personId: 'p_kevin', matchedText: 'Kevin', confidence: 0.95 },
    ])
  })

  it('finds aliases, possessives and any case', () => {
    expect(findMentions("you know alex's old roommate", kevinState)[0]).toMatchObject({ personId: 'p_kevin' })
    expect(findMentions("KEVIN's back", kevinState)[0]).toMatchObject({ personId: 'p_kevin' })
  })

  it('never matches part of another word', () => {
    expect(findMentions('Kevinson called', kevinState)).toEqual([])
  })

  it('highlights a story when its keyword is in the same words', () => {
    expect(findMentions('Kevin and the cake again', kevinState)[0]).toMatchObject({
      personId: 'p_kevin',
      focusStoryId: 's_cake',
      confidence: 0.95,
    })
  })

  it('a distinctive story keyword alone is enough; a short common one is not', () => {
    expect(findMentions('remember the airport thing', kevinState)).toEqual([
      { personId: 'p_kevin', matchedText: 'airport', focusStoryId: 's_airport', confidence: 0.9 },
    ])
    expect(findMentions('I made a cake', kevinState)).toEqual([])
  })

  it('skips names two known people share (left to the AI)', () => {
    const twoKevins: StoryState = {
      ...kevinState,
      people: [
        ...kevinState.people,
        { id: 'p_kevin_work', roomId: 'demo', name: 'Kevin', aliases: ['Kevin from work'], storyIds: ['s_cake'] },
      ],
    }
    expect(findMentions('Kevin texted', twoKevins)).toEqual([])
    // A distinct alias still works.
    expect(findMentions('Kevin from work texted', twoKevins).map((m) => m.personId)).toEqual(['p_kevin_work'])
  })

  it('never matches people who are in the room', () => {
    const inRoom: StoryState = {
      ...kevinState,
      people: kevinState.people.map((p) => ({ ...p, memberId: 'm_kevin' })),
    }
    expect(findMentions('Kevin and the airport', inRoom)).toEqual([])
  })

  it('finds nothing before the AI knows anyone', () => {
    expect(findMentions('Kevin', null)).toEqual([])
  })
})

describe('mentionToRecall', () => {
  it('becomes a recall the pop-up rules can use, for the line being spoken now', () => {
    const recall = mentionToRecall(
      { personId: 'p_kevin', matchedText: 'Kevin', focusStoryId: 's_cake', confidence: 0.95 },
      { roomId: 'demo', speakerId: 'm_sam', latestSeq: 18, storyState: kevinState },
    )
    expect(recall).toEqual({
      id: 'instant:m_sam:18:p_kevin',
      roomId: 'demo',
      lineId: '',
      seq: 19,
      personId: 'p_kevin',
      storyIds: ['s_cake', 's_airport', 's_landlord'],
      focusStoryId: 's_cake',
      matchedText: 'Kevin',
      confidence: 0.95,
    })
  })
})
