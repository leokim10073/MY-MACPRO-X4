import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Story } from '../../../shared/schema'
import { initialRoomState, roomReducer } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import StoryCard from './StoryCard'

const state = fixtureEvents().reduce(roomReducer, initialRoomState)
const people = state.storyState!.people
const cake = state.storyState!.stories.find((s) => s.id === 's_cake')!
const taylor = state.members.find((m) => m.id === 'm_taylor')!

function renderCard(story: Story = cake, onClose = vi.fn(), joinedAtSeq = taylor.joinedAtSeq) {
  render(
    <StoryCard story={story} people={people} self={{ ...taylor, joinedAtSeq }} onClose={onClose} />,
  )
  return screen.getByRole('dialog', { name: 'Cake' })
}

afterEach(cleanup)

describe('StoryCard', () => {
  it('shows the keyword, who it is about, and the summary', () => {
    const card = renderCard()
    expect(card.textContent).toContain(cake.summary)
    expect(card.textContent).toContain('About Kevin')
  })

  it('shows friends reactions in their own words', () => {
    const card = renderCard()
    expect(card.textContent).toContain('Sam: "NO WAY he ate the entire cake."')
    expect(card.textContent).toContain('Jamie: "Honestly that\'s kind of impressive."')
  })

  it('says when the story came up relative to joining', () => {
    renderCard(cake, vi.fn(), 10)
    expect(screen.getByText('Came up before you joined')).toBeTruthy()
    cleanup()
    renderCard(cake, vi.fn(), 1)
    expect(screen.getByText('Came up after you joined')).toBeTruthy()
  })

  it('puts guesses under a visible Guess label, with the open question', () => {
    const story: Story = {
      ...cake,
      openQuestion: 'Did he replace it?',
      speculation: [
        { memberId: 'm_sam', memberName: 'Sam', text: 'Maybe he was hungry.', lineId: 'l5' },
      ],
    }
    const card = renderCard(story)
    expect(card.textContent).toContain('Did he replace it?')
    const label = screen.getByText('Guess')
    expect(label).toBeTruthy()
    const guess = screen.getByText('Sam: Maybe he was hungry.')
    expect(guess.closest('[data-kind="guess"]')?.contains(label)).toBe(true)
  })

  it('renders neither section without an open question or guesses', () => {
    const card = renderCard({
      ...cake,
      openQuestion: undefined,
      speculation: [],
    })
    expect(card.textContent).not.toContain('Still open')
    expect(screen.queryByText('Guess')).toBeNull()
  })

  it('closes from the Close button and on Escape, and focuses the heading', () => {
    const onClose = vi.fn()
    const card = renderCard(cake, onClose)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /Cake/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(card, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
