import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatSelection, parseSelection, useSelection } from './useSelection'
import { useViewMode } from './useViewMode'

beforeEach(() => window.history.replaceState(null, '', '/?client=convex&room=abc'))
afterEach(cleanup)

describe('parseSelection', () => {
  it('reads nodes and edges, ordering the pair', () => {
    expect(parseSelection('node:p1')).toEqual({ kind: 'node', id: 'p1' })
    expect(parseSelection('edge:p2~p1')).toEqual({ kind: 'edge', a: 'p1', b: 'p2' })
  })

  it('round-trips ids that need encoding', () => {
    const sel = { kind: 'edge', a: 'a b/c', b: 'ü%' } as const
    expect(parseSelection(formatSelection(sel))).toEqual(sel)
    expect(parseSelection(formatSelection({ kind: 'node', id: 'x&y=z' }))).toEqual({ kind: 'node', id: 'x&y=z' })
  })

  it('treats anything invalid as nothing selected', () => {
    for (const raw of [null, '', 'node:', 'edge:a', 'edge:a~b~c', 'edge:a~a', 'edge:~b', 'node:%E0%A4%A', 'person:p1']) {
      expect(parseSelection(raw)).toEqual({ kind: 'none' })
    }
  })
})

describe('useSelection', () => {
  it('opening from closed pushes one entry; changing what is open replaces it; other params stay', () => {
    const { result } = renderHook(() => useSelection())
    expect(result.current.selection).toEqual({ kind: 'none' })
    const before = window.history.length
    act(() => result.current.select({ kind: 'node', id: 'p1' }))
    expect(window.history.length).toBe(before + 1)
    expect(result.current.selection).toEqual({ kind: 'node', id: 'p1' })
    act(() => result.current.select({ kind: 'edge', a: 'p2', b: 'p1' }))
    expect(window.history.length).toBe(before + 1)
    expect(result.current.selection).toEqual({ kind: 'edge', a: 'p1', b: 'p2' })
    const params = new URLSearchParams(window.location.search)
    expect(params.get('room')).toBe('abc')
    expect(params.get('client')).toBe('convex')
  })

  it('closing a sheet opened here steps Back, so Back afterwards does not reopen it', async () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.select({ kind: 'node', id: 'p1' }))
    act(() => result.current.close())
    await waitFor(() => expect(result.current.selection).toEqual({ kind: 'none' }))
    expect(window.location.search).toBe('?client=convex&room=abc')
  })

  it('closing a deep link just drops sel, keeping the rest', () => {
    window.history.replaceState(null, '', '/?client=convex&room=abc&sel=node%3Ap1')
    const before = window.history.length
    const { result } = renderHook(() => useSelection())
    expect(result.current.selection).toEqual({ kind: 'node', id: 'p1' })
    act(() => result.current.close())
    expect(result.current.selection).toEqual({ kind: 'none' })
    expect(window.location.search).toBe('?client=convex&room=abc')
    expect(window.history.length).toBe(before)
  })

  it('follows Back and Forward (popstate)', () => {
    const { result } = renderHook(() => useSelection())
    act(() => {
      window.history.replaceState(null, '', '/?room=abc&sel=edge%3Ap1~p2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current.selection).toEqual({ kind: 'edge', a: 'p1', b: 'p2' })
  })

  it('does not crash on a garbled param', () => {
    window.history.replaceState(null, '', '/?sel=%25E0%25A4')
    const { result } = renderHook(() => useSelection())
    expect(result.current.selection).toEqual({ kind: 'none' })
  })
})

describe('useViewMode', () => {
  it('is the list unless the map is asked for, and switching keeps the room', () => {
    const { result } = renderHook(() => useViewMode())
    expect(result.current).toMatchObject({ view: 'list', explicit: false })
    act(() => result.current.setView('map'))
    expect(result.current).toMatchObject({ view: 'map', explicit: true })
    expect(new URLSearchParams(window.location.search).get('room')).toBe('abc')
    window.history.replaceState(null, '', '/?view=bogus')
    const other = renderHook(() => useViewMode())
    expect(other.result.current).toMatchObject({ view: 'list', explicit: false })
  })
})
