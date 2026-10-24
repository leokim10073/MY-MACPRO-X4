import { describe, expect, it } from 'vitest'
import { closingPhase, seedFromRoomId } from './closing'

describe('closingPhase', () => {
  it.each([
    [0, 'ignite'],
    [599, 'ignite'],
    [600, 'burning'],
    [2559, 'burning'],
    [2560, 'settle'],
    [2899, 'settle'],
    [2900, 'done'],
    [99999, 'done'],
  ])('closingPhase(%i) is %s', (ms, phase) => expect(closingPhase(ms)).toBe(phase))

  it('treats a negative elapsed time as ignite', () => expect(closingPhase(-5)).toBe('ignite'))
})

describe('seedFromRoomId', () => {
  it('is stable, unsigned and differs by room', () => {
    expect(seedFromRoomId('demo')).toBe(seedFromRoomId('demo'))
    expect(seedFromRoomId('demo')).toBeGreaterThanOrEqual(0)
    expect(seedFromRoomId('demo')).not.toBe(seedFromRoomId('other'))
  })
})
