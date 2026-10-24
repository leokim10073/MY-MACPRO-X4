import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Room } from '../../../shared/schema'
import { initialRoomState, roomReducer } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import RoomScreen from '../screens/RoomScreen'

afterEach(cleanup)

const room: Room = { id: 'demo', hostMemberId: 'm_taylor', status: 'active', inviteToken: 'demo', createdAt: 0, expiresAt: 1 }

function renderRoom(extra: Partial<React.ComponentProps<typeof RoomScreen>> = {}, hostId = 'm_taylor') {
  const state = fixtureEvents().reduce(roomReducer, initialRoomState)
  const self = state.members.find((m) => m.id === 'm_taylor')!
  render(<RoomScreen state={state} self={self} room={{ ...room, hostMemberId: hostId }} onBurn={vi.fn()} {...extra} />)
}

describe('typed line', () => {
  it('is hidden by default', () => {
    renderRoom()
    expect(screen.queryByLabelText('Type a line')).toBeNull()
  })

  it('sends the text with a timestamp and clears the field', async () => {
    const onAddLine = vi.fn().mockResolvedValue(undefined)
    renderRoom({ showTypeLine: true, onAddLine })
    const input = screen.getByLabelText('Type a line') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'hello there' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(onAddLine).toHaveBeenCalledWith('hello there', expect.any(Number))
    expect(input.value).toBe('')
  })

  it('blocks empty text', async () => {
    const onAddLine = vi.fn().mockResolvedValue(undefined)
    renderRoom({ showTypeLine: true, onAddLine })
    fireEvent.change(screen.getByLabelText('Type a line'), { target: { value: '   ' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(onAddLine).not.toHaveBeenCalled()
  })

  it("shows \"Couldn't send.\" when the send fails", async () => {
    renderRoom({ showTypeLine: true, onAddLine: vi.fn().mockRejectedValue(new Error('x')) })
    fireEvent.change(screen.getByLabelText('Type a line'), { target: { value: 'hi' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(screen.getByText("Couldn't send.")).toBeTruthy()
  })
})

describe('replay button', () => {
  it('shows for the host when enabled, calls startReplay once, then hides', async () => {
    const onStartReplay = vi.fn().mockResolvedValue(undefined)
    renderRoom({ showReplay: true, onStartReplay })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start Kevin replay' }))
    })
    expect(onStartReplay).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Start Kevin replay' })).toBeNull()
  })

  it('is hidden for a non-host or when not enabled', () => {
    renderRoom({ showReplay: true, onStartReplay: vi.fn() }, 'm_other')
    expect(screen.queryByRole('button', { name: 'Start Kevin replay' })).toBeNull()
    cleanup()
    renderRoom({ onStartReplay: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Start Kevin replay' })).toBeNull()
  })
})

describe('burn state', () => {
  it('shows Burning… while pending and the error alert, keeping the room', () => {
    renderRoom({ pending: 'burn', error: { kind: 'unreachable', message: "Can't reach the server." } })
    expect(screen.getByRole('alert').textContent).toBe("Couldn't end the room. Please try again.")
    fireEvent.click(screen.getByRole('button', { name: 'Last Sip…' }))
    const b = screen.getByRole('button', { name: 'Ending room…' }) as HTMLButtonElement
    expect(b.disabled).toBe(true)
  })
})
