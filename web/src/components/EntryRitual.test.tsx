import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MockRoomClient } from '../room/mock/MockRoomClient'
import EntryRitual from './EntryRitual'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('EntryRitual', () => {
  it('renders the heading and the four rules in order, exactly', () => {
    const { container } = render(<EntryRitual onEnter={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Shhh. Keep it in the room.' })).toBeTruthy()
    const items = Array.from(container.querySelectorAll('ul > li')).map((li) => li.textContent)
    expect(items).toEqual([
      'This room stays private until the host burns it.',
      'When it burns, the transcript, stories and catch-ups are deleted for everyone.',
      "Only text is kept while it's open, never audio.",
      "Burning can't reach screenshots, recordings or memories.",
    ])
    expect(container.querySelector('.shhh-icon-animated')).toBeTruthy()
  })

  it('focuses Enter room on mount', () => {
    render(<EntryRitual onEnter={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Enter room' }))
  })

  it('Enter room is enabled at once and calls onEnter', () => {
    const onEnter = vi.fn()
    render(<EntryRitual onEnter={onEnter} />)
    const button = screen.getByRole('button', { name: 'Enter room' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(onEnter).toHaveBeenCalledTimes(1)
  })
})

describe('entry ritual in the app', () => {
  it('covers the room until Enter room, then reveals it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<App client={new MockRoomClient({ speed: 1000 })} kind="mock" search="" />)
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Leo' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    })
    expect(screen.getByText('Shhh. Keep it in the room.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Hold to talk' })).toBeNull()
    const room = document.querySelector('main.room')!
    expect(room.getAttribute('aria-hidden')).toBe('true')
    expect(room.hasAttribute('inert')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    expect(screen.queryByText('Shhh. Keep it in the room.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Hold to talk' })).toBeTruthy()
    expect(room.hasAttribute('aria-hidden')).toBe(false)
    expect(room.hasAttribute('inert')).toBe(false)
  })
})
