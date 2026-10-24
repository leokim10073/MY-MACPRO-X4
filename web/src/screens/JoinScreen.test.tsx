import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member, Room } from '../../../shared/schema'
import App from '../App'
import type { JoinResult, RoomClient } from '../room/RoomClient'

const AI_NOTICE =
  "An AI listens to this room and turns what's said into a transcript, stories and catch-ups. Only text is kept, never audio. The host can delete the room at any time."

function fakeClient(): RoomClient {
  const self: Member = { id: 'm_self', roomId: 'r1', name: 'Leo', joinedAtSeq: 0, joinedAt: 0 }
  const room: Room = {
    id: 'r1',
    hostMemberId: 'm_host',
    status: 'active',
    inviteToken: 'demo',
    createdAt: 0,
    expiresAt: 1,
  }
  const result: JoinResult = { room, self }
  return {
    subscribe: vi.fn(() => () => {}),
    createRoom: vi.fn().mockResolvedValue(result),
    joinRoom: vi.fn().mockResolvedValue(result),
    burn: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  }
}

afterEach(cleanup)

describe('JoinScreen', () => {
  it('shows the AI notice before typing anything', () => {
    render(<App client={fakeClient()} kind="mock" search="" />)
    expect(screen.getByText(AI_NOTICE)).toBeTruthy()
  })

  it('disables the button while the nickname is blank or spaces', async () => {
    const user = userEvent.setup()
    render(<App client={fakeClient()} kind="mock" search="" />)
    const button = screen.getByRole('button', { name: 'Create room' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByLabelText('Nickname'), '   ')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByLabelText('Nickname'), 'Leo')
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('labels the button by whether there is an invite', () => {
    const { unmount } = render(<App client={fakeClient()} kind="mock" search="?room=demo" />)
    expect(screen.getByRole('button', { name: 'Join room' })).toBeTruthy()
    unmount()
    render(<App client={fakeClient()} kind="mock" search="" />)
    expect(screen.getByRole('button', { name: 'Create room' })).toBeTruthy()
  })

  it('submitting calls joinRoom with the token and trimmed name', async () => {
    const user = userEvent.setup()
    const client = fakeClient()
    render(<App client={client} kind="mock" search="?room=demo" />)
    await user.type(screen.getByLabelText('Nickname'), '  Leo ')
    await user.click(screen.getByRole('button', { name: 'Join room' }))
    expect(client.joinRoom).toHaveBeenCalledWith('demo', 'Leo')
    expect(await screen.findByRole('status')).toBeTruthy()
  })
})
