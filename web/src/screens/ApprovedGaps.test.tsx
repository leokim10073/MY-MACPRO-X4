import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member, Room } from '../../../shared/schema'
import App from '../App'
import BurnConfirm from '../components/BurnConfirm'
import RoomStage from '../components/RoomStage'
import { MockRoomClient } from '../room/mock/MockRoomClient'
import { initialRoomState, roomReducer } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import BurnedScreen from './BurnedScreen'
import JoinScreen from './JoinScreen'
import RoomScreen from './RoomScreen'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const member = (id: string, name: string): Member => ({ id, roomId: 'demo', name, joinedAtSeq: 0, joinedAt: 0 })
const MINT = { color: 'var(--gw-color-mint)', expression: 'curious', accessory: 'glasses' } as const

describe('G1: the avatar chosen on Join is the one shown in the room', () => {
  it('JoinScreen reports the picked avatar', async () => {
    const user = userEvent.setup()
    const onAvatarChange = vi.fn()
    render(<JoinScreen onCreate={() => {}} onJoin={() => {}} onAvatarChange={onAvatarChange} />)
    await user.click(screen.getByRole('button', { name: /Change avatar/ }))
    await user.click(screen.getByRole('radio', { name: 'Mint, curious, with glasses' }))
    expect(onAvatarChange).toHaveBeenLastCalledWith('mint')
  })

  it('RoomStage draws my own tile with my look; others keep their illustrated fallback', () => {
    const leo = member('m_self', 'Leo')
    const { container } = render(
      <RoomStage members={[member('m_alex', 'Alex'), leo]} self={leo} speaker={null} lastSpeaker={null} selfLook={MINT} />,
    )
    const mine = container.querySelector('.avatar.me')!
    expect(mine.querySelector('circle[fill="var(--gw-color-mint)"]')).toBeTruthy()
  })

  it('end to end: pick Mint on Join, enter, and the room shows Mint for me', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<App client={new MockRoomClient({ speed: 1000 })} kind="mock" search="" />)
    fireEvent.click(screen.getByRole('button', { name: /Change avatar/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Mint, curious, with glasses' }))
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Leo' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start the party' }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    const mine = document.querySelector('.avatar.me')!
    expect(mine.querySelector('circle[fill="var(--gw-color-mint)"]')).toBeTruthy()
  })
})

describe('G9: the host gets a Host badge on the stage', () => {
  it('marks only the host tile, visibly and in its label', () => {
    const alex = member('m_alex', 'Alex')
    const leo = member('m_self', 'Leo')
    render(<RoomStage members={[alex, leo]} self={leo} speaker={null} lastSpeaker={null} hostId="m_alex" />)
    const row = screen.getByRole('group', { name: 'People in the room' })
    const host = within(row).getByRole('img', { name: 'Alex, host' })
    expect(host.querySelector('.avatar-host')?.textContent).toBe('Host')
    expect(within(row).getByRole('img', { name: 'Leo (you)' }).querySelector('.avatar-host')).toBeNull()
  })

  it('RoomScreen passes the room host through', () => {
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    const self = state.members.find((m) => m.id === 'm_taylor')!
    const room: Room = { id: 'r1', hostMemberId: 'm_taylor', status: 'active', inviteToken: 'demo', createdAt: 0, expiresAt: 1 }
    const { container } = render(<RoomScreen state={state} self={self} room={room} onBurn={() => {}} />)
    expect(container.querySelectorAll('.avatar-host').length).toBe(1)
    expect(container.querySelector('.avatar.me .avatar-host')).toBeTruthy()
  })
})

describe('G3: final-screen actions follow the role', () => {
  const order = () => screen.getAllByRole('button').map((b) => [b.textContent, b.className.includes('gw-btn--primary')])

  it('host: Start a new room is primary, Back home secondary', () => {
    render(<BurnedScreen onNewRoom={() => {}} onHome={() => {}} isHost />)
    expect(order()).toEqual([
      ['Start a new room', true],
      ['Back home', false],
    ])
  })

  it('participant: Back home is primary, Start a new room secondary, same handlers', () => {
    const onNewRoom = vi.fn()
    const onHome = vi.fn()
    render(<BurnedScreen onNewRoom={onNewRoom} onHome={onHome} isHost={false} />)
    expect(order()).toEqual([
      ['Back home', true],
      ['Start a new room', false],
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Back home' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start a new room' }))
    expect(onHome).toHaveBeenCalledTimes(1)
    expect(onNewRoom).toHaveBeenCalledTimes(1)
  })
})

describe('G10: a failed end keeps the dialog open with the failure', () => {
  it('BurnConfirm shows the failure alert and the failed cup, and focuses Keep chatting', () => {
    const { rerender, container } = render(<BurnConfirm pending={false} onBurn={() => {}} onKeep={() => {}} />)
    rerender(<BurnConfirm pending={false} onBurn={() => {}} onKeep={() => {}} failed />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('alert').textContent).toBe("Couldn't end the room. Please try again.")
    expect(container.querySelector('.lsc--failed')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep chatting' }))
  })

  it('RoomScreen: the sheet stays open, retry works, and Escape still closes it', () => {
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    const self = state.members.find((m) => m.id === 'm_taylor')!
    const room: Room = { id: 'r1', hostMemberId: 'm_taylor', status: 'active', inviteToken: 'demo', createdAt: 0, expiresAt: 1 }
    const onBurn = vi.fn()
    const props = { state, self, room, onBurn }
    const { rerender } = render(<RoomScreen {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Last Sip…' }))
    fireEvent.click(screen.getByRole('button', { name: 'End & delete room' }))
    rerender(<RoomScreen {...props} pending="burn" />)
    rerender(<RoomScreen {...props} pending={null} error={{ kind: 'unknown', message: 'Could not burn.' }} />)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('alert').textContent).toBe("Couldn't end the room. Please try again.")
    expect(screen.getAllByRole('alert').length).toBe(1)
    const retry = screen.getByRole('button', { name: 'End & delete room' }) as HTMLButtonElement
    expect(retry.disabled).toBe(false)
    fireEvent.click(retry)
    fireEvent.click(retry)
    expect(onBurn).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe("Couldn't end the room. Please try again.")
  })
})
