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
  it('renders the compact welcome: heading, Last Sip line and the cup', () => {
    const { container } = render(<EntryRitual onEnter={() => {}} />)
    expect(screen.getByRole('heading', { name: "Your seat's ready." })).toBeTruthy()
    expect(screen.getByText('The host can end and delete this room for everyone with Last Sip.')).toBeTruthy()
    expect(container.querySelector('.entry-welcome .lsc')).toBeTruthy()
    expect(container.querySelector('ul')).toBeNull()
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
      fireEvent.click(screen.getByRole('button', { name: 'Start the party' }))
    })
    expect(screen.getByText("Your seat's ready.")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Hold to talk' })).toBeNull()
    const room = document.querySelector('main.room')!
    expect(room.getAttribute('aria-hidden')).toBe('true')
    expect(room.hasAttribute('inert')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    expect(screen.queryByText("Your seat's ready.")).toBeNull()
    expect(screen.getByRole('button', { name: 'Hold to talk' })).toBeTruthy()
    expect(room.hasAttribute('aria-hidden')).toBe(false)
    expect(room.hasAttribute('inert')).toBe(false)
  })
})
