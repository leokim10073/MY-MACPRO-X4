import { describe, expect, it } from 'vitest'
import { Chunker } from './chunker'

describe('Chunker', () => {
  it('emits full chunks in order and the remainder on flush', () => {
    const chunks: number[][] = []
    const c = new Chunker(4, (chunk) => chunks.push(Array.from(chunk)))
    c.push(Int16Array.from([1, 2, 3]))
    c.push(Int16Array.from([4, 5, 6, 7, 8, 9, 10]))
    expect(chunks).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ])
    c.flush()
    expect(chunks.at(-1)).toEqual([9, 10])
  })

  it('does nothing on flush when empty', () => {
    const chunks: Int16Array[] = []
    const c = new Chunker(4, (chunk) => chunks.push(chunk))
    c.flush()
    expect(chunks).toHaveLength(0)
  })

  it('never reuses a chunk buffer it already handed out', () => {
    const chunks: Int16Array[] = []
    const c = new Chunker(2, (chunk) => chunks.push(chunk))
    c.push(Int16Array.from([1, 2, 3, 4]))
    expect(Array.from(chunks[0])).toEqual([1, 2])
  })
})
