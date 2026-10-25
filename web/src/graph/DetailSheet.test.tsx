import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member, Person, Story as SchemaStory } from '../../../shared/schema'
import DetailSheet from './DetailSheet'
import { deriveGraph } from './deriveGraph'
import type { Story } from './types'

afterEach(cleanup)

const self: Member = { id: 'm1', roomId: 'r', name: 'Leo', joinedAtSeq: 0, joinedAt: 0 }
const people: Person[] = [
  { id: 'ricky', roomId: 'r', name: 'Ricky', aliases: [], storyIds: [] },
  { id: 'aaron', roomId: 'r', name: 'Aaron', aliases: [], storyIds: [] },
  { id: 'cass', roomId: 'r', name: 'Cass', aliases: [], storyIds: [] },
]

function story(id: string, ids: string[], at: number): Story {
  const raw = {
    id,
    roomId: 'r',
    personIds: ids,
    keyword: id,
    summary: `${id} happened.`,
    tellerId: 'm1',
    reactions: [],
    speculation: [],
    sourceLineIds: [],
    firstSeq: at,
    lastSeq: at,
  } as SchemaStory
  return { id, title: id, summary: raw.summary, participantIds: ids, createdAt: at, reportedBy: 'Leo', raw }
}

const model = deriveGraph(
  people.map((p) => ({ id: p.id, name: p.name })),
  [story('Coffee', ['ricky', 'aaron'], 1), story('Texting', ['ricky', 'aaron'], 4), story('Gym', ['ricky'], 2), story('Party', ['ricky', 'aaron', 'cass'], 3)],
)

function sheet(selection: Parameters<typeof DetailSheet>[0]['selection'], handlers = { onSelect: vi.fn(), onClose: vi.fn() }) {
  render(<DetailSheet model={model} selection={selection} people={people} self={self} {...handlers} />)
  return handlers
}

describe('DetailSheet', () => {
  it('shows nothing with no selection or an unknown id', () => {
    for (const sel of [{ kind: 'none' }, { kind: 'node', id: 'ghost' }, { kind: 'edge', a: 'ricky', b: 'ghost' }] as const) {
      const { container, unmount } = render(
        <DetailSheet model={model} selection={sel} people={people} self={self} onSelect={() => {}} onClose={() => {}} />,
      )
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })

  it('profiles a character: connections with counts, solo stories, then all stories; a connection opens that pair', () => {
    const { onSelect } = sheet({ kind: 'node', id: 'ricky' })
    const dialog = screen.getByRole('dialog', { name: 'Ricky' })
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Ricky' }))
    const connections = within(screen.getByRole('region', { name: 'Connections' })).getAllByRole('button')
    expect(connections.map((b) => b.textContent)).toEqual(['Aaron3 stories›', 'Cass1 story›'])
    expect(within(screen.getByRole('region', { name: 'Just about Ricky' })).getByText('Gym')).toBeTruthy()
    const all = within(screen.getByRole('region', { name: 'All stories' })).getAllByRole('button')
    expect(all.map((b) => b.querySelector('.recall-story-keyword')!.textContent)).toEqual(['Texting', 'Party', 'Gym', 'Coffee'])
    fireEvent.click(connections[0])
    expect(onSelect).toHaveBeenCalledWith({ kind: 'edge', a: 'aaron', b: 'ricky' })
    expect(dialog).toBeTruthy()
  })

  it('shows a pair newest first, with a group badge only for group-only pairs', () => {
    sheet({ kind: 'edge', a: 'ricky', b: 'aaron' })
    expect(screen.getByRole('heading', { name: 'Aaron & Ricky' })).toBeTruthy()
    expect(screen.queryByText('Group stories')).toBeNull()
    const rows = within(screen.getByRole('region', { name: 'Their stories' })).getAllByRole('button')
    expect(rows.map((b) => b.querySelector('.recall-story-keyword')!.textContent)).toEqual(['Texting', 'Party', 'Coffee'])
    cleanup()
    sheet({ kind: 'edge', a: 'cass', b: 'aaron' })
    expect(screen.getByText('Group stories')).toBeTruthy()
  })

  it('opens a story as the usual StoryCard; Escape closes the card and keeps the sheet', () => {
    const { onClose } = sheet({ kind: 'edge', a: 'ricky', b: 'aaron' })
    fireEvent.click(screen.getByRole('button', { name: /^Texting/ }))
    const card = document.querySelector('.story-card') as HTMLElement
    expect(card.textContent).toContain('Texting happened.')
    fireEvent.keyDown(card, { key: 'Escape' })
    expect(document.querySelector('.story-card')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes from the button, Escape and the backdrop, but not from a click inside', () => {
    const { onClose } = sheet({ kind: 'node', id: 'ricky' })
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(document.querySelector('.graph-sheet-scrim')!)
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
