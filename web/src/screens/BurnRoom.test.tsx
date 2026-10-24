import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member, Room, RoomEvent } from '../../../shared/schema'
import App from '../App'
import type { JoinResult, RoomClient } from '../room/RoomClient'
import { initialRoomState, roomReducer } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import RoomScreen from './RoomScreen'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const baseRoom: Room = {
  id: 'demo',
  hostMemberId: 'm_host',
  status: 'active',
  inviteToken: 'demo',
  createdAt: 0,
  expiresAt: 1,
}

function renderRoom(hostId: string, onBurn = vi.fn()) {
  const state = fixtureEvents().reduce(roomReducer, initialRoomState)
  const self = state.members.find((m) => m.id === 'm_taylor')!
  render(
    <RoomScreen
      state={state}
      self={self}
      room={{ ...baseRoom, hostMemberId: hostId }}
      onBurn={onBurn}
    />,
  )
  return onBurn
}

describe('Burn button', () => {
  it('shows only to the host', () => {
    renderRoom('m_other')
    expect(screen.queryByRole('button', { name: /burn/i })).toBeNull()
    cleanup()
    renderRoom('m_taylor')
    expect(screen.getByRole('button', { name: 'Burn room' })).toBeTruthy()
  })

  it('needs two taps and resets after 4 seconds', () => {
    vi.useFakeTimers()
    const onBurn = renderRoom('m_taylor')
    fireEvent.click(screen.getByRole('button', { name: 'Burn room' }))
    expect(onBurn).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Tap again to burn' })).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByRole('button', { name: 'Burn room' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Burn room' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to burn' }))
    expect(onBurn).toHaveBeenCalledTimes(1)
  })
})

describe('Burned screen', () => {
  it('drops all room content, even with the pop-up and story card open', async () => {
    let listener: (e: RoomEvent) => void = () => {}
    const self: Member = {
      id: 'm_taylor',
      roomId: 'demo',
      name: 'Taylor',
      joinedAtSeq: 16,
      joinedAt: 0,
    }
    const result: JoinResult = { room: baseRoom, self }
    const client: RoomClient = {
      subscribe: vi.fn((l) => {
        listener = l
        return () => {}
      }),
      createRoom: vi.fn().mockResolvedValue(result),
      joinRoom: vi.fn().mockResolvedValue(result),
      burn: vi.fn().mockResolvedValue(undefined),
    addLine: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    }
    render(<App client={client} kind="mock" search="?room=demo" />)
    fireEvent.change(screen.getByLabelText(/nickname/i), {
      target: { value: 'Taylor' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Join the room' }))
    })
    await act(async () => {
      for (const e of fixtureEvents()) listener(e)
    })
    const popup = screen.getByRole('region', { name: 'Mentioned again' })
    const chip = Array.from(popup.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') !== 'Dismiss',
    )!
    fireEvent.click(chip)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(document.body.textContent).toContain('Kevin')
    await act(async () => {
      listener({ type: 'room_burned', roomId: 'demo' })
    })
    expect(screen.getByText('This room has ended.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    const text = document.body.textContent!
    expect(text.toLowerCase()).not.toContain('cake')
    expect(text).not.toContain('Kevin')
  })
})
