import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BurnConfirm from './BurnConfirm'

afterEach(cleanup)

function setup(pending = false) {
  const onBurn = vi.fn()
  const onKeep = vi.fn()
  const view = render(<BurnConfirm pending={pending} onBurn={onBurn} onKeep={onKeep} />)
  return { onBurn, onKeep, view }
}

describe('BurnConfirm', () => {
  it('renders an accessible dialog with the exact copy and focuses Keep talking', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const title = screen.getByText('Ready for the last sip?')
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id)
    expect(
      screen.getByText(
        "End this room for everyone and permanently delete its conversation, transcript, and AI recaps. This can't be undone.",
      ),
    ).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep chatting' }))
  })

  it('shows the full waiting cup, and the three-dot steam while ending', () => {
    const { rerender, container } = render(<BurnConfirm pending={false} onBurn={() => {}} onKeep={() => {}} />)
    expect(container.querySelector('.lsc--waiting')).toBeTruthy()
    rerender(<BurnConfirm pending={true} onBurn={() => {}} onKeep={() => {}} />)
    expect(container.querySelector('.lsc--pending')).toBeTruthy()
  })

  it('Keep talking, Escape and a scrim click each call onKeep once', () => {
    const a = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Keep chatting' }))
    expect(a.onKeep).toHaveBeenCalledTimes(1)
    cleanup()
    const b = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(b.onKeep).toHaveBeenCalledTimes(1)
    cleanup()
    const c = setup()
    fireEvent.click(c.view.container.querySelector('.burn-scrim')!)
    expect(c.onKeep).toHaveBeenCalledTimes(1)
  })

  it('does not treat a click inside the sheet as a scrim click', () => {
    const { onKeep } = setup()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onKeep).not.toHaveBeenCalled()
  })

  it('Burn room calls onBurn once, even on a double tap while pending flips', () => {
    const onBurn = vi.fn()
    const onKeep = vi.fn()
    const { rerender } = render(<BurnConfirm pending={false} onBurn={onBurn} onKeep={onKeep} />)
    fireEvent.click(screen.getByRole('button', { name: 'End & delete room' }))
    rerender(<BurnConfirm pending={true} onBurn={onBurn} onKeep={onKeep} />)
    const burning = screen.getByRole('button', { name: 'Ending room…' }) as HTMLButtonElement
    expect(burning.disabled).toBe(true)
    fireEvent.click(burning)
    expect(onBurn).toHaveBeenCalledTimes(1)
  })

  it('latches: two clicks on the enabled button with no rerender call onBurn once', () => {
    const { onBurn } = setup()
    const button = screen.getByRole('button', { name: 'End & delete room' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onBurn).toHaveBeenCalledTimes(1)
  })

  it('re-arms the latch when pending goes back to false', () => {
    const onBurn = vi.fn()
    const onKeep = vi.fn()
    const { rerender } = render(<BurnConfirm pending={false} onBurn={onBurn} onKeep={onKeep} />)
    fireEvent.click(screen.getByRole('button', { name: 'End & delete room' }))
    rerender(<BurnConfirm pending={true} onBurn={onBurn} onKeep={onKeep} />)
    rerender(<BurnConfirm pending={false} onBurn={onBurn} onKeep={onKeep} />)
    fireEvent.click(screen.getByRole('button', { name: 'End & delete room' }))
    expect(onBurn).toHaveBeenCalledTimes(2)
  })

  it('keeps Tab and Shift+Tab inside the sheet', () => {
    setup()
    const keep = screen.getByRole('button', { name: 'Keep chatting' })
    const burn = screen.getByRole('button', { name: 'End & delete room' })
    expect(document.activeElement).toBe(keep)
    fireEvent.keyDown(keep, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(burn)
    fireEvent.keyDown(burn, { key: 'Tab' })
    expect(document.activeElement).toBe(keep)
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Tab' })
    expect(document.activeElement).toBe(keep)
  })
})
