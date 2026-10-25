import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
