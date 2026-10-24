import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Room, RoomEvent } from '../../../shared/schema'
import { initialRoomState, roomReducer, type RoomState } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import RoomScreen from './RoomScreen'

const HINT = 'Tap a word to see the story'
const room: Room = { id: 'r1', hostMemberId: 'm_host', status: 'active', inviteToken: 'demo', createdAt: 0, expiresAt: 1 }
const events = fixtureEvents()
const base = events.filter((e) => e.type !== 'recall').reduce(roomReducer, initialRoomState)
const recall = (id: string) =>
  events.find((e): e is Extract<RoomEvent, { type: 'recall' }> => e.type === 'recall' && e.recall.id === id)!

function view(state: RoomState) {
  const self = state.members.find((m) => m.id === 'm_taylor')!
  return <RoomScreen state={state} self={self} room={room} onBurn={() => {}} />
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('first pop-up hint', () => {
  it('shows on the first pop-up and stays while it updates in place', () => {
    const { rerender } = render(view(base))
    expect(screen.queryByText(HINT)).toBeNull()
    const withR2 = roomReducer(base, recall('r2'))
    rerender(view(withR2))
    expect(screen.getByText(HINT)).toBeTruthy()
    rerender(view(roomReducer(withR2, recall('r3'))))
    expect(screen.getByText(HINT)).toBeTruthy()
  })

  it('is gone for good after a chip is tapped', () => {
    const { rerender } = render(view(base))
    const withR2 = roomReducer(base, recall('r2'))
    rerender(view(withR2))
    fireEvent.click(screen.getByRole('button', { name: 'Cake' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    // Past the cooldown, a new pop-up for Kevin shows, without the hint.
    act(() => vi.advanceTimersByTime(20_000))
    rerender(view(roomReducer(withR2, recall('r3'))))
    expect(screen.getByRole('region', { name: 'Mentioned again' })).toBeTruthy()
    expect(screen.queryByText(HINT)).toBeNull()
  })

  it('is gone for good after the first pop-up fades on its own', () => {
    const { rerender } = render(view(base))
    const withR2 = roomReducer(base, recall('r2'))
    rerender(view(withR2))
    act(() => vi.advanceTimersByTime(7_000))
    expect(screen.queryByRole('region', { name: 'Mentioned again' })).toBeNull()
    act(() => vi.advanceTimersByTime(20_000))
    rerender(view(roomReducer(withR2, recall('r3'))))
    expect(screen.getByRole('region', { name: 'Mentioned again' })).toBeTruthy()
    expect(screen.queryByText(HINT)).toBeNull()
  })
})
