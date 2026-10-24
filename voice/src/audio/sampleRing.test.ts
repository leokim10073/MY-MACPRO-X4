import { describe, expect, it } from 'vitest'
import { SampleRing } from './sampleRing'

const seq = (from: number, to: number) => Int16Array.from({ length: to - from }, (_, i) => from + i)

describe('SampleRing', () => {
  it('returns what was pushed while not full', () => {
    const r = new SampleRing(10)
    r.push(seq(0, 4))
    expect(Array.from(r.snapshot())).toEqual([0, 1, 2, 3])
  })

  it('keeps only the newest samples, oldest first, across wraps', () => {
    const r = new SampleRing(5)
    r.push(seq(0, 3))
    r.push(seq(3, 8))
    expect(Array.from(r.snapshot())).toEqual([3, 4, 5, 6, 7])
    r.push(seq(8, 10))
    expect(Array.from(r.snapshot())).toEqual([5, 6, 7, 8, 9])
  })

  it('handles a push larger than its capacity', () => {
    const r = new SampleRing(3)
    r.push(seq(0, 10))
    expect(Array.from(r.snapshot())).toEqual([7, 8, 9])
  })

  it('is empty after clear', () => {
    const r = new SampleRing(3)
    r.push(seq(0, 3))
    r.clear()
    expect(r.snapshot().length).toBe(0)
  })
})
