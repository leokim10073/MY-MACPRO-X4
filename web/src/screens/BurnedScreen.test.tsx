import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BurnedScreen from './BurnedScreen'

afterEach(cleanup)

describe('BurnedScreen', () => {
  it('renders the clean-slate copy', () => {
    render(<BurnedScreen onNewRoom={() => {}} onHome={() => {}} />)
    expect(screen.getByRole('heading', { name: "Tea's gone." })).toBeTruthy()
    expect(screen.getByText('This room, its conversation, and AI recaps have been deleted.')).toBeTruthy()
    expect(screen.getByText("Screenshots or recordings people made aren't affected.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start a new room' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back home' })).toBeTruthy()
  })

  it('shows the brand mark and the empty cup', () => {
    const { container } = render(<BurnedScreen />)
    expect(container.querySelector('.burned-brand')?.textContent).toBe('Gossip Window')
    expect(container.querySelector('.lsc--empty')).toBeTruthy()
  })

  it('focuses the heading on mount', () => {
    render(<BurnedScreen />)
    const h1 = screen.getByRole('heading', { name: "Tea's gone." })
    expect(h1.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(h1)
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
    expect(screen.getByText("Tea's gone.")).toBeTruthy()
  })
})
