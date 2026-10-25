import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Story as SchemaStory } from '../../../shared/schema'
import { deriveGraph } from './deriveGraph'
import { stubReactFlowLayout } from './flowTestStubs'
import StoryGraph from './StoryGraph'
import type { Story } from './types'

stubReactFlowLayout()
beforeEach(() => localStorage.clear())
afterEach(cleanup)

function story(id: string, ids: string[], at: number): Story {
  const raw = { id, personIds: ids, keyword: id, summary: id, firstSeq: at, lastSeq: at } as SchemaStory
  return { id, title: id, summary: id, participantIds: ids, createdAt: at, raw }
}
const chars = [
  { id: 'ricky', name: 'Ricky' },
  { id: 'aaron', name: 'Aaron' },
]
const model = deriveGraph(chars, [story('Coffee', ['ricky', 'aaron'], 1), story('Texting', ['ricky', 'aaron'], 2)])

function graph(m = model) {
  const handlers = { onSelect: vi.fn(), onClear: vi.fn(), onShowList: vi.fn() }
  render(<StoryGraph roomId="r1" model={m} selection={{ kind: 'none' }} {...handlers} />)
  return handlers
}

describe('StoryGraph', () => {
  it('offers the list when there are fewer than two people', () => {
    const { onShowList } = graph(deriveGraph([chars[0]], [story('Gym', ['ricky'], 1)]))
    expect(screen.getByText('Not enough people for a map yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show the list' }))
    expect(onShowList).toHaveBeenCalled()
  })

  it('draws a node per person; clicking or pressing Enter on one selects it', async () => {
    const { onSelect } = graph()
    await act(async () => {})
    const ricky = screen.getByRole('button', { name: 'Ricky, 2 stories' })
    expect(screen.getByRole('button', { name: 'Aaron, 2 stories' })).toBeTruthy()
    fireEvent.click(ricky)
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'node', id: 'ricky' })
    onSelect.mockClear()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Aaron, 2 stories' }), { key: 'Enter' })
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'node', id: 'aaron' })
  })

  it('shows only a count on a pair with 2+ stories; the badge selects the edge', async () => {
    const { onSelect } = graph()
    await act(async () => {})
    const badge = screen.getByRole('button', { name: 'Aaron and Ricky, 2 stories' })
    expect(badge.textContent).toBe('2')
    // No story titles anywhere on the canvas.
    expect(document.querySelector('.graph-canvas')!.textContent).not.toMatch(/Coffee|Texting/)
    fireEvent.click(badge)
    expect(onSelect).toHaveBeenCalledWith({ kind: 'edge', a: 'aaron', b: 'ricky' })
  })

  it('draws a one-story pair as a bare line, and caps big counts at 99+', async () => {
    const one = deriveGraph(chars, [story('Coffee', ['ricky', 'aaron'], 1)])
    graph(one)
    await act(async () => {})
    expect(document.querySelector('.graph-badge')).toBeNull()
    expect(document.querySelector('.graph-canvas')!.textContent).not.toContain('Coffee')
    cleanup()
    graph(deriveGraph(chars, Array.from({ length: 120 }, (_, i) => story(`s${i}`, ['ricky', 'aaron'], i))))
    await act(async () => {})
    expect(document.querySelector('.graph-badge')!.textContent).toBe('99+')
  })

  it('keeps React Flow attribution; the only control is a fit button', async () => {
    graph()
    await act(async () => {})
    expect(document.querySelector('.react-flow__attribution')).toBeTruthy()
    expect(document.querySelector('.react-flow__controls')).toBeNull()
    expect(screen.getByRole('button', { name: 'Fit map to view' })).toBeTruthy()
    expect(localStorage.getItem('graph-layout:v1:r1')).toContain('ricky')
  })
})
