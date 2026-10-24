import { describe, expect, it } from 'vitest'
import { newSpeakers, toParticipants } from './callSession'

describe('toParticipants', () => {
  it('toParticipants puts self first and maps muted', () => {
    const list = toParticipants({ identity: 'm_a', name: 'Alex', isSpeaking: true, isMicrophoneEnabled: true }, [
      { identity: 'm_b', name: 'Sam', isSpeaking: false, isMicrophoneEnabled: false },
      { identity: 'm_c', isSpeaking: false, isMicrophoneEnabled: true },
    ])
    expect(list).toEqual([
      { id: 'm_a', name: 'Alex', speaking: true, muted: false },
      { id: 'm_b', name: 'Sam', speaking: false, muted: true },
      { id: 'm_c', name: 'm_c', speaking: false, muted: false },
    ])
  })
})

describe('newSpeakers', () => {
  it('newSpeakers returns only remote ids that just started', () => {
    expect(newSpeakers(new Set(['b']), ['a', 'b', 'c'], 'a')).toEqual(['c'])
    expect(newSpeakers(new Set(), [], 'a')).toEqual([])
  })
})
