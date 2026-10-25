import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { DONE_MS } from './room/closing'
import { createRoomClient } from './room/createRoomClient'
import { fixtureLines } from './room/testFixtures'

const line21 = () => fixtureLines()[20].text

const mock = (search: string) => ({ ...createRoomClient(search, {}), search })

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
    render(<App {...mock("?room=demo&speed=1000")} />)
    await enter('Join the room')
    expect(document.body.textContent).toContain(line21())
    expect(setItem).toHaveBeenCalledTimes(0)
    expect(open).toHaveBeenCalledTimes(0)
  })

  it('host path, through burning, never writes to browser storage', async () => {
    vi.useFakeTimers()
    const { setItem, open } = spies()
    render(<App {...mock("?speed=1000")} />)
    await enter('Start the party')
    expect(document.body.textContent).toContain(line21())
    fireEvent.click(screen.getByRole('button', { name: 'Last Sip…' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'End & delete room' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DONE_MS)
    })
    expect(screen.getByText("Tea's gone.")).toBeTruthy()
    expect(setItem).toHaveBeenCalledTimes(0)
    expect(open).toHaveBeenCalledTimes(0)
  })
})
