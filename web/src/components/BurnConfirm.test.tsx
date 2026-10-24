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
    const title = screen.getByText('Burn this room for everyone?')
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id)
    expect(
      screen.getByText(
        'This ends the conversation for everyone and deletes its transcript, stories and catch-ups. People may still remember what was said.',
      ),
    ).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep talking' }))
  })

  it('Keep talking, Escape and a scrim click each call onKeep once', () => {
    const a = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Keep talking' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Burn room' }))
    rerender(<BurnConfirm pending={true} onBurn={onBurn} onKeep={onKeep} />)
    const burning = screen.getByRole('button', { name: 'Burning…' }) as HTMLButtonElement
    expect(burning.disabled).toBe(true)
    fireEvent.click(burning)
    expect(onBurn).toHaveBeenCalledTimes(1)
  })
})
