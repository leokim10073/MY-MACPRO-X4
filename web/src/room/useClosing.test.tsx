import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedFromRoomId } from './closing'
import { initialRoomState, roomReducer, type RoomState } from './state'
import { fixtureEvents } from './testFixtures'
import { useClosing } from './useClosing'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const active = (): RoomState => fixtureEvents().reduce(roomReducer, initialRoomState)
const burned = (): RoomState => roomReducer(active(), { type: 'room_burned', roomId: 'demo' })

interface Props {
  state: RoomState
  burnConfirmed: boolean
}

function setup(initial: Props, roomId = 'demo') {
  return renderHook((p: Props) => useClosing(p.state, roomId, p.burnConfirmed), { initialProps: initial })
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))

describe('useClosing', () => {
  it('is idle while the room is live', () => {
    const live = active()
    const { result } = setup({ state: live, burnConfirmed: false })
    expect(result.current.closing).toBeNull()
    expect(result.current.done).toBe(false)
    expect(result.current.frozen).toBe(live)
  })

  it('plays ignite, burning, settle, then done over the frozen copy', () => {
    const live = active()
    const { result, rerender } = setup({ state: live, burnConfirmed: false })
    rerender({ state: burned(), burnConfirmed: false })

    expect(result.current.closing?.phase).toBe('ignite')
    expect(result.current.frozen).toBe(live)
    expect(result.current.frozen?.lines.map((l) => l.id)).toEqual(live.lines.map((l) => l.id))
    expect(result.current.done).toBe(false)

    advance(599)
    expect(result.current.closing?.phase).toBe('ignite')
    advance(1)
    expect(result.current.closing?.phase).toBe('burning')
    advance(1959)
    expect(result.current.closing?.phase).toBe('burning')
    advance(1)
    expect(result.current.closing?.phase).toBe('settle')
    expect(result.current.frozen).toBe(live)
    advance(339)
    expect(result.current.done).toBe(false)
    advance(1)
    expect(result.current.done).toBe(true)
    expect(result.current.frozen).toBeNull()
    expect(result.current.closing?.phase).toBe('done')
  })

  it('records startedAt as Date.now() when closing starts', () => {
    vi.setSystemTime(1_000_000)
    const { result, rerender } = setup({ state: active(), burnConfirmed: false })
    advance(250)
    rerender({ state: burned(), burnConfirmed: false })
    expect(result.current.closing?.startedAt).toBe(1_000_250)
  })

  it('starts on burnConfirmed, and a later room_burned does not restart it (Review Focus 5)', () => {
    vi.setSystemTime(5_000)
    const live = active()
    const { result, rerender } = setup({ state: live, burnConfirmed: false })
    rerender({ state: live, burnConfirmed: true })
    expect(result.current.closing?.phase).toBe('ignite')
    expect(result.current.frozen).toBe(live)
    const startedAt = result.current.closing!.startedAt
    expect(startedAt).toBe(5_000)

    advance(1000)
    rerender({ state: burned(), burnConfirmed: true })
    expect(result.current.closing?.startedAt).toBe(startedAt)
    expect(result.current.closing?.phase).toBe('burning')
    expect(result.current.frozen).toBe(live)

    advance(1899)
    expect(result.current.done).toBe(false)
    advance(1)
    expect(result.current.done).toBe(true)
    expect(result.current.frozen).toBeNull()
  })

  it('room_burned first, then burnConfirmed, is still one closing', () => {
    const { result, rerender } = setup({ state: active(), burnConfirmed: false })
    rerender({ state: burned(), burnConfirmed: false })
    const startedAt = result.current.closing!.startedAt
    advance(700)
    rerender({ state: burned(), burnConfirmed: true })
    expect(result.current.closing?.startedAt).toBe(startedAt)
    expect(result.current.closing?.phase).toBe('burning')
    advance(2200)
    expect(result.current.done).toBe(true)
  })

  it('seeds the burn from the room id', () => {
    const { result, rerender } = setup({ state: active(), burnConfirmed: false }, 'room-42')
    rerender({ state: burned(), burnConfirmed: false })
    expect(result.current.closing?.seed).toBe(seedFromRoomId('room-42'))
  })

  it('reports done at once when no active state was ever seen', () => {
    const { result } = setup({ state: burned(), burnConfirmed: false })
    expect(result.current.done).toBe(true)
    expect(result.current.frozen).toBeNull()
  })

  it('clears its timers on unmount mid-closing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, rerender, unmount } = setup({ state: active(), burnConfirmed: false })
    rerender({ state: burned(), burnConfirmed: false })
    advance(1000)
    const last = result.current
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    advance(5000)
    expect(result.current).toBe(last)
    expect(error).not.toHaveBeenCalled()
  })
})
