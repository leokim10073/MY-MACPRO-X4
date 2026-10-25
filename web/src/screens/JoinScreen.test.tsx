import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member, Room } from '../../../shared/schema'
import App from '../App'
import type { JoinResult, RoomClient } from '../room/RoomClient'
import { BackendError } from '../room/convex/callBackend'

const AI_NOTICE =
  "AI processes the conversation to create transcripts and catch-ups. Your voice becomes text as you talk; the recording isn't saved. The host can delete the conversation anytime."

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
    addLine: vi.fn().mockResolvedValue(undefined),
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
    const button = screen.getByRole('button', { name: 'Start the party' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByLabelText('Nickname'), '   ')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByLabelText('Nickname'), 'Leo')
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('labels the button by whether there is an invite', () => {
    const { unmount } = render(<App client={fakeClient()} kind="mock" search="?room=demo" />)
    expect(screen.getByRole('button', { name: 'Join the room' })).toBeTruthy()
    unmount()
    render(<App client={fakeClient()} kind="mock" search="" />)
    expect(screen.getByRole('button', { name: 'Start the party' })).toBeTruthy()
  })

  it('submitting calls joinRoom with the token and trimmed name', async () => {
    const user = userEvent.setup()
    const client = fakeClient()
    render(<App client={client} kind="mock" search="?room=demo" />)
    await user.type(screen.getByLabelText('Nickname'), '  Leo ')
    await user.click(screen.getByRole('button', { name: 'Join the room' }))
    expect(client.joinRoom).toHaveBeenCalledWith('demo', 'Leo')
    expect(await screen.findByText('Stories will show up here as people tell them.')).toBeTruthy()
  })

  it('shows Joining… and disables the button while the call is pending', async () => {
    const user = userEvent.setup()
    const client = fakeClient()
    client.joinRoom = vi.fn(() => new Promise<JoinResult>(() => {}))
    render(<App client={client} kind="mock" search="?room=demo" />)
    await user.type(screen.getByLabelText('Nickname'), 'Leo')
    await user.click(screen.getByRole('button', { name: 'Join the room' }))
    const button = await screen.findByRole('button', { name: 'Joining…' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('limits the nickname to 30 characters', () => {
    render(<App client={fakeClient()} kind="mock" search="" />)
    expect((screen.getByLabelText('Nickname') as HTMLInputElement).maxLength).toBe(30)
  })

  it('joining while unreachable shows the message and the offline-demo link (convex only)', async () => {
    const user = userEvent.setup()
    const client = fakeClient()
    client.joinRoom = vi.fn().mockRejectedValue(new BackendError('unreachable', "Can't reach the server."))
    render(<App client={client} kind="convex" search="?client=convex&room=demo" />)
    await user.type(screen.getByLabelText('Nickname'), 'Leo')
    await user.click(screen.getByRole('button', { name: 'Join the room' }))
    expect((await screen.findByRole('alert')).textContent).toContain("Can't reach the server.")
    const link = screen.getByRole('link', { name: 'Try the offline demo' })
    expect(link.getAttribute('href')).toBe('?client=mock')
  })

  it('shows readable copy for other errors, with no offline link on the mock', async () => {
    const user = userEvent.setup()
    const client = fakeClient()
    client.joinRoom = vi.fn().mockRejectedValue(new Error('boom'))
    render(<App client={client} kind="mock" search="?room=demo" />)
    await user.type(screen.getByLabelText('Nickname'), 'Leo')
    await user.click(screen.getByRole('button', { name: 'Join the room' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Try again.')
    expect(screen.queryByRole('link', { name: 'Try the offline demo' })).toBeNull()
  })
})
