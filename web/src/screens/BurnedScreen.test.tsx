import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BurnedScreen from './BurnedScreen'

afterEach(cleanup)

describe('BurnedScreen', () => {
  it('renders the clean-slate copy', () => {
    render(<BurnedScreen onNewRoom={() => {}} onHome={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Room burned.' })).toBeTruthy()
    expect(screen.getByText('Conversation deleted.')).toBeTruthy()
    expect(
      screen.getByText("Deleted from Gossip Window. Screenshots or recordings people made aren't affected."),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start a new room' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back home' })).toBeTruthy()
  })

  it('calls the handlers', () => {
    const onNewRoom = vi.fn()
    const onHome = vi.fn()
    render(<BurnedScreen onNewRoom={onNewRoom} onHome={onHome} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start a new room' }))
    expect(onNewRoom).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Back home' }))
    expect(onHome).toHaveBeenCalledTimes(1)
  })

  it('renders no buttons without handlers', () => {
    render(<BurnedScreen />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Room burned.')).toBeTruthy()
  })
})
