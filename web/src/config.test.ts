import { describe, expect, it } from 'vitest'
import { readMockOptions } from './config'

describe('readMockOptions', () => {
  it('reads speed, pauseAfterJoin and room', () => {
    expect(readMockOptions('?speed=2&pauseAfterJoin=15000&room=demo')).toEqual({
      speed: 2,
      pauseAfterJoinMs: 15000,
      inviteToken: 'demo',
    })
  })
  it('ignores values that are not numbers or are <= 0, omitting the keys', () => {
    expect(readMockOptions('?speed=abc')).toEqual({})
    expect('speed' in readMockOptions('?speed=abc')).toBe(false)
    expect(readMockOptions('?speed=0&pauseAfterJoin=-5')).toEqual({})
    expect(readMockOptions('')).toEqual({})
  })
})
