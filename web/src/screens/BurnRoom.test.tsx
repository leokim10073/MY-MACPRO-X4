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
    expect(screen.getByRole('button', { name: 'Burn room…' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a confirmation sheet, and only its Burn room button burns', () => {
    const onBurn = renderRoom('m_taylor')
    fireEvent.click(screen.getByRole('button', { name: 'Burn room…' }))
    expect(screen.getByRole('dialog', { name: 'Burn this room for everyone?' })).toBeTruthy()
    expect(onBurn).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Burn room' }))
    expect(onBurn).toHaveBeenCalledTimes(1)
  })

  it('Keep talking closes the sheet without burning', () => {
    const onBurn = renderRoom('m_taylor')
    fireEvent.click(screen.getByRole('button', { name: 'Burn room…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep talking' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onBurn).not.toHaveBeenCalled()
  })

  it('returns focus to Burn room… when the sheet closes by Keep talking, Escape or the scrim', () => {
    renderRoom('m_taylor')
    const control = screen.getByRole('button', { name: 'Burn room…' })
    const closers: Array<() => void> = [
      () => fireEvent.click(screen.getByRole('button', { name: 'Keep talking' })),
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      () => fireEvent.click(document.querySelector('.burn-scrim')!),
    ]
    for (const close of closers) {
      fireEvent.click(control)
      expect(document.activeElement).not.toBe(control)
      close()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(control)
    }
  })

  it('closes the sheet and shows the error when a burn fails', () => {
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    const self = state.members.find((m) => m.id === 'm_taylor')!
    const room = { ...baseRoom, hostMemberId: 'm_taylor' }
    const props = { state, self, room, onBurn: vi.fn() }
    const { rerender } = render(<RoomScreen {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Burn room…' }))
    rerender(<RoomScreen {...props} pending="burn" />)
    expect((screen.getByRole('button', { name: 'Burning…' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<RoomScreen {...props} pending={null} error={{ kind: 'unknown', message: 'Could not burn.' }} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe('Could not burn.')
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
      fireEvent.click(screen.getByRole('button', { name: 'Join room' }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
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
