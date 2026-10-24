import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function spies() {
  if (typeof indexedDB === 'undefined') vi.stubGlobal('indexedDB', { open: vi.fn() })
  return {
    setItem: vi.spyOn(Storage.prototype, 'setItem'),
    open: vi.spyOn(indexedDB, 'open'),
  }
}

async function enter(button: string) {
  fireEvent.change(screen.getByLabelText(/nickname/i), {
    target: { value: 'Leo' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: button }))
    await vi.advanceTimersByTimeAsync(0)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000)
  })
}

describe('storage guard', () => {
  it('latecomer path never writes to browser storage', async () => {
    vi.useFakeTimers()
    const { setItem, open } = spies()
    render(<App search="?room=demo&speed=1000" />)
    await enter('Join room')
    expect(setItem).toHaveBeenCalledTimes(0)
    expect(open).toHaveBeenCalledTimes(0)
  })

  it('host path, through burning, never writes to browser storage', async () => {
    vi.useFakeTimers()
    const { setItem, open } = spies()
    render(<App search="?speed=1000" />)
    await enter('Create room')
    fireEvent.click(screen.getByRole('button', { name: 'Burn room' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tap again to burn' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('This room has ended.')).toBeTruthy()
    expect(setItem).toHaveBeenCalledTimes(0)
    expect(open).toHaveBeenCalledTimes(0)
  })
})
