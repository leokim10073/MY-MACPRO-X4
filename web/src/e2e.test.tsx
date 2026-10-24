import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createRoomClient } from './room/createRoomClient'

const mock = (search: string) => ({ ...createRoomClient(search, {}), search })

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function chips(): HTMLElement[] {
  const popup = screen.getByRole('region', { name: 'Mentioned again' })
  return Array.from(popup.querySelectorAll('button')).filter(
    (b) => b.getAttribute('aria-label') !== 'Dismiss',
  )
}

describe('Phase 1 checkpoint', () => {
  it('replay as a latecomer pops up Kevin and moves the focus', async () => {
    vi.useFakeTimers()
    render(<App {...mock("?room=demo&speed=10")} />)
    fireEvent.change(screen.getByLabelText(/nickname/i), { target: { value: 'Leo' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Join room' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(screen.getByRole('region', { name: 'Mentioned again' }).textContent).toContain('Kevin')
    expect(chips().map((c) => c.textContent)).toEqual(['Cake', 'Airport', 'Landlord'])
    expect(chips().some((c) => c.getAttribute('aria-current') === 'true')).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    const current = () =>
      chips()
        .filter((c) => c.getAttribute('aria-current') === 'true')
        .map((c) => c.textContent)
    expect(current()).toEqual(['Cake'])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(current()).toEqual(['Airport'])
  })
})
