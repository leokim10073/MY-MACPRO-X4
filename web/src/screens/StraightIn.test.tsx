import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Room } from '../../../shared/schema'
import App from '../App'
import { createRoomClient } from '../room/createRoomClient'
import { initialRoomState, roomReducer } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import RoomScreen from './RoomScreen'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('joining', () => {
  it('goes straight into the room, with no separate entry step', async () => {
    vi.useFakeTimers()
    render(<App {...createRoomClient('?room=demo&speed=10', {})} search="?room=demo&speed=10" />)
    fireEvent.change(screen.getByLabelText(/nickname/i), { target: { value: 'Leo' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Join the room' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.queryByText("Your seat's ready.")).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enter room' })).toBeNull()
    const room = document.querySelector('main.room')!
    expect(room.getAttribute('aria-hidden')).toBeNull()
    expect(room.hasAttribute('inert')).toBe(false)
  })
})

describe('narrated recap', () => {
  const room: Room = { id: 'demo', hostMemberId: 'm_alex', status: 'active', inviteToken: 'i', createdAt: 0, expiresAt: 1 }

  it('plays by itself once; opening and closing a story card does not replay it', () => {
    const base = fixtureEvents().reduce(roomReducer, initialRoomState)
    const taylor = base.members.find((m) => m.id === 'm_taylor')!
    // Give Taylor's recap its narrated audio.
    const state = {
      ...base,
      recalls: [],
      recaps: base.recaps.map((r) => (r.uptoSeq === taylor.joinedAtSeq ? { ...r, audioUrl: 'https://x/recap.mp3' } : r)),
    }
    render(<RoomScreen state={state} self={taylor} room={room} onBurn={() => {}} />)
    const first = document.querySelector('audio')!
    expect(first.autoplay).toBe(true)
    fireEvent.play(first)

    const board = screen.getByRole('list', { name: 'People and their stories' })
    fireEvent.click(within(board).getByRole('button', { name: /^Cake/ }))
    // The banner collapses while the card is open, which removes the player.
    expect(document.querySelector('audio')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    const again = document.querySelector('audio')!
    expect(again).toBeTruthy()
    expect(again.autoplay).toBe(false)
  })
})
