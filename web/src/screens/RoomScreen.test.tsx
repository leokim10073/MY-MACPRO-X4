import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Room } from '../../../shared/schema'
import { initialRoomState, roomReducer } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import RoomScreen from './RoomScreen'

const room: Room = {
  id: 'r1',
  hostMemberId: 'm_host',
  status: 'active',
  inviteToken: 'demo',
  createdAt: 0,
  expiresAt: 1,
}

function setup() {
  const state = fixtureEvents().reduce(roomReducer, initialRoomState)
  const self = state.members.find((m) => m.id === 'm_taylor')!
  return render(<RoomScreen state={state} self={self} room={room} />)
}

afterEach(cleanup)

describe('RoomScreen', () => {
  it('shows only lines after the latecomer joined', () => {
    setup()
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBe(5)
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    expect(items[0].textContent).toContain(state.lines[16].text)
    expect(screen.queryByText(state.lines[0].text, { exact: false })).toBeNull()
  })

  it('shows the Listening indicator while active', () => {
    setup()
    expect(screen.getByRole('status').textContent).toContain('Listening')
  })

  it('push-to-talk only releases for the pointer that pressed it', () => {
    setup()
    const btn = screen.getByRole('button', { name: 'Hold to talk' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.pointerDown(btn, { pointerId: 1 })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.textContent).toContain('Talking')
    fireEvent.pointerUp(btn, { pointerId: 2 })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    fireEvent.pointerUp(btn, { pointerId: 1 })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('shows a placeholder when there are no lines', () => {
    const state = initialRoomState
    render(
      <RoomScreen
        state={state}
        self={{ id: 'm', roomId: 'r1', name: 'A', joinedAtSeq: 0, joinedAt: 0 }}
        room={room}
      />,
    )
    expect(screen.getByText('Waiting for someone to speak…')).toBeTruthy()
  })

  it('shows the recap for a latecomer and none for an on-time member', () => {
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    const taylor = state.members.find((m) => m.id === 'm_taylor')!
    const recap = state.recaps.find((r) => r.uptoSeq === taylor.joinedAtSeq)!
    const { unmount } = render(<RoomScreen state={state} self={taylor} room={room} />)
    expect(screen.getByRole('region', { name: 'Catch-up' })).toBeTruthy()
    expect(screen.getByText(recap.text)).toBeTruthy()
    unmount()
    render(
      <RoomScreen
        state={state}
        self={{ ...taylor, id: 'm_alex', joinedAtSeq: 0 }}
        room={room}
      />,
    )
    expect(screen.queryByRole('region', { name: 'Catch-up' })).toBeNull()
  })
})
