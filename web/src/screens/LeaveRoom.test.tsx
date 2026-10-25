import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member, Room } from '../../../shared/schema'
import App from '../App'
import type { RoomClient } from '../room/RoomClient'
import { ConvexRoomClient } from '../room/convex/ConvexRoomClient'
import { MockRoomClient } from '../room/mock/MockRoomClient'
import { initialRoomState, roomReducer } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import JoinScreen from './JoinScreen'
import RoomScreen from './RoomScreen'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const room = (host: string): Room => ({
  id: 'r1',
  hostMemberId: host,
  status: 'active',
  inviteToken: 'demo',
  createdAt: 0,
  expiresAt: 1,
})

function roomScreen(host: string, handlers: { onLeave?: () => void; onBurn?: () => void } = {}) {
  const state = fixtureEvents().reduce(roomReducer, initialRoomState)
  const self = state.members.find((m) => m.id === 'm_taylor')!
  return render(
    <RoomScreen state={state} self={self} room={room(host)} onBurn={handlers.onBurn ?? (() => {})} onLeave={handlers.onLeave} />,
  )
}

describe('Leave on the room screen', () => {
  it('asks before leaving, and Stay keeps me in the room', () => {
    const onLeave = vi.fn()
    roomScreen('m_host', { onLeave })
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Leave this room?' })
    expect(dialog.textContent).toContain('rejoin with the invite link')
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onLeave).not.toHaveBeenCalled()
  })

  it('leaves on confirm and never burns', () => {
    const onLeave = vi.fn()
    const onBurn = vi.fn()
    roomScreen('m_taylor', { onLeave, onBurn })
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(onBurn).not.toHaveBeenCalled()
  })

  it('warns the host that nobody else can burn the room', () => {
    roomScreen('m_taylor', { onLeave: () => {} })
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.getByRole('alertdialog').textContent).toContain("You're the host")
  })

  it('does not warn a guest about hosting', () => {
    roomScreen('m_host', { onLeave: () => {} })
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.getByRole('alertdialog').textContent).not.toContain("You're the host")
  })

  it('keeps Burn and Leave as separate controls, both at the top', () => {
    roomScreen('m_taylor', { onLeave: () => {} })
    const burn = screen.getByRole('button', { name: 'Last Sip' })
    const leave = screen.getByRole('button', { name: 'Leave' })
    expect(burn.className).toContain('burn')
    expect(leave.className).toContain('leave')
    expect(leave.className).not.toContain('burn')
    expect(leave.closest('.room-header-top')).toBeTruthy()
    expect(burn.closest('.room-header-top .room-header-actions')).toBeTruthy()
  })

  it('hides Leave when the app cannot start a fresh session', () => {
    roomScreen('m_host')
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull()
  })
})

describe('Leave in the app', () => {
  async function createAndLeave(first: RoomClient, makeClient: () => RoomClient) {
    render(<App client={first} kind="mock" search="" makeClient={makeClient} />)
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Leo' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start the party' }))
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))
  }

  it('with the mock: disconnects, never burns, and returns to a clean join screen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const first = new MockRoomClient({ speed: 1000 })
    const dispose = vi.spyOn(first, 'dispose')
    const burn = vi.spyOn(first, 'burn')
    // A quiet client for the second session, so anything on screen after rejoining must be left over.
    const me: Member = { id: 'm_new', roomId: 'r2', name: 'Leo', joinedAtSeq: 0, joinedAt: 0 }
    const second: RoomClient = {
      subscribe: () => () => {},
      createRoom: async () => ({ room: room('m_new'), self: me }),
      joinRoom: async () => ({ room: room('m_new'), self: me }),
      burn: async () => {},
      addLine: async () => {},
      dispose: () => {},
    }
    const makeClient = vi.fn(() => second)
    render(<App client={first} kind="mock" search="" makeClient={makeClient} />)
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Leo' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start the party' }))
    })
    await act(async () => vi.advanceTimersByTimeAsync(60_000))
    expect(document.body.textContent).toContain('Kevin')

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(burn).not.toHaveBeenCalled()
    expect(makeClient).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Start the party' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('Kevin')

    // Joining again starts from an empty room on the fresh client.
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Leo' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start the party' }))
    })
    expect(await screen.findByRole('button', { name: 'Leave' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('Kevin')
    expect(screen.getByText('Stories will show up here as people tell them.')).toBeTruthy()
  })

  it('with the Convex client: tells the backend, closes the connection and never calls rooms:burn', async () => {
    const self: Member = { id: 'm1', roomId: 'r1', name: 'Leo', joinedAtSeq: 0, joinedAt: 0 }
    const convex = {
      onUpdate: vi.fn(() => () => {}),
      mutation: vi.fn<(ref: unknown, args: unknown) => Promise<unknown>>(async () => ({
        room: room('m1'),
        member: self,
        sessionToken: 'secret',
      })),
      close: vi.fn(async () => {}),
    }
    const first = new ConvexRoomClient(convex as never)
    await createAndLeave(first, () => new MockRoomClient())
    // The connection closes once rooms:leave has gone out, so other phones drop this member.
    await waitFor(() => expect(convex.close).toHaveBeenCalledTimes(1))
    const calledNames = convex.mutation.mock.calls.map((c) => getFunctionName(c[0] as never))
    expect(calledNames).toContain('rooms:leave')
    expect(calledNames).not.toContain('rooms:burn')
    expect(screen.getByRole('button', { name: 'Start the party' })).toBeTruthy()
  })
})

describe('Join screen after leaving an invite link', () => {
  it('offers to create a new room instead of rejoining', () => {
    const onJoin = vi.fn()
    const onCreate = vi.fn()
    render(<JoinScreen inviteToken="demo" onJoin={onJoin} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create a new room instead' }))
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Leo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start the party' }))
    expect(onCreate).toHaveBeenCalledWith('Leo')
    expect(onJoin).not.toHaveBeenCalled()
  })

  it('does not show the option without an invite link', () => {
    render(<JoinScreen onJoin={() => {}} onCreate={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Create a new room instead' })).toBeNull()
  })
})
