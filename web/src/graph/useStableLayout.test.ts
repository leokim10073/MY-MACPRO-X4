import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeLayout, NODE_RADIUS, structureKey, useStableLayout } from './useStableLayout'

const ids = ['a', 'b', 'c']
const links = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
]
const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y)

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('computeLayout', () => {
  it('is deterministic and never uses Math.random', () => {
    const random = vi.spyOn(Math, 'random')
    const one = computeLayout(ids, links, {})
    const two = computeLayout(ids, links, {})
    expect(one).toEqual(two)
    expect(random).not.toHaveBeenCalled()
  })

  it('spreads nodes out so they do not overlap', () => {
    const p = computeLayout(ids, links, {})
    expect(dist(p.a, p.b)).toBeGreaterThan(NODE_RADIUS * 2)
    expect(dist(p.a, p.c)).toBeGreaterThan(NODE_RADIUS * 2)
  })

  it('keeps saved nodes exactly where they were and places a new one near its neighbour', () => {
    const saved = { a: { x: 500, y: 500 }, b: { x: 700, y: 500 } }
    const p = computeLayout([...ids], links, saved)
    expect(p.a).toEqual(saved.a)
    expect(p.b).toEqual(saved.b)
    expect(dist(p.c, saved.b)).toBeLessThan(400)
  })

  it('skips the simulation when nothing is new', () => {
    const saved = { a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, c: { x: 5, y: 6 }, gone: { x: 0, y: 0 } }
    expect(computeLayout(ids, links, saved)).toEqual({ a: saved.a, b: saved.b, c: saved.c })
  })
})

describe('structureKey', () => {
  it('ignores order and link direction', () => {
    expect(structureKey(['b', 'a'], [{ source: 'b', target: 'a' }])).toBe(structureKey(['a', 'b'], [{ source: 'a', target: 'b' }]))
  })
})

describe('useStableLayout', () => {
  it('saves positions per room, keeps them on remount, and persists a drag', () => {
    const first = renderHook(() => useStableLayout('room1', ids, links))
    const laidOut = first.result.current.positions
    expect(Object.keys(laidOut).sort()).toEqual(ids)
    const stored = JSON.parse(localStorage.getItem('graph-layout:v1:room1')!)
    expect(stored).toEqual(laidOut)
    // Nothing but numbers keyed by id.
    expect(Object.values(stored).every((p) => Object.keys(p as object).sort().join() === 'x,y')).toBe(true)

    act(() => first.result.current.setNodePosition('a', { x: 42, y: 24 }))
    expect(first.result.current.positions.a).toEqual({ x: 42, y: 24 })
    first.unmount()

    const again = renderHook(() => useStableLayout('room1', ids, links))
    expect(again.result.current.positions.a).toEqual({ x: 42, y: 24 })
    expect(again.result.current.positions.b).toEqual(laidOut.b)
  })

  it('still lays out when storage throws or holds junk', () => {
    localStorage.setItem('graph-layout:v1:r2', '{not json')
    expect(Object.keys(renderHook(() => useStableLayout('r2', ids, links)).result.current.positions)).toHaveLength(3)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useStableLayout('r3', ids, links))
    expect(Object.keys(result.current.positions)).toHaveLength(3)
    act(() => result.current.setNodePosition('a', { x: 1, y: 1 }))
    expect(result.current.positions.a).toEqual({ x: 1, y: 1 })
  })

  it('does not recompute when the same structure arrives in a new array', () => {
    const { result, rerender } = renderHook(({ n, l }) => useStableLayout('r4', n, l), { initialProps: { n: ids, l: links } })
    const before = result.current.positions
    rerender({ n: [...ids].reverse(), l: links.map((x) => ({ ...x })) })
    expect(result.current.positions).toBe(before)
  })
})
