import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Room } from '../../../shared/schema'
import { initialRoomState, roomReducer } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import RoomScreen from '../screens/RoomScreen'
import ShhhBadge from './ShhhBadge'

afterEach(cleanup)

const LINE = 'The host calls the last sip. They can end this room and delete its conversation for everyone.'

describe('ShhhBadge', () => {
  it('hides the line at first', () => {
    render(<ShhhBadge />)
    const button = screen.getByRole('button', { name: 'About this room' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(LINE)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('shows the line on one click and hides it on the second', () => {
    render(<ShhhBadge />)
    const button = screen.getByRole('button', { name: 'About this room' })
    fireEvent.click(button)
    expect(screen.getByRole('status').textContent).toBe(LINE)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(button)
    expect(screen.queryByText(LINE)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('appears in the room header', () => {
    const room: Room = {
      id: 'r1',
      hostMemberId: 'm_host',
      status: 'active',
      inviteToken: 'demo',
      createdAt: 0,
      expiresAt: 1,
    }
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    const self = state.members.find((m) => m.id === 'm_taylor')!
    render(<RoomScreen state={state} self={self} room={room} onBurn={() => {}} />)
    expect(screen.getByRole('button', { name: 'About this room' })).toBeTruthy()
  })
})
