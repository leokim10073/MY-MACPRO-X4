import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member, Room, RoomEvent } from '../../../shared/schema'
import App from '../App'
import { BackendError } from '../room/convex/callBackend'
import { MockRoomClient } from '../room/mock/MockRoomClient'
import type { RoomClient } from '../room/RoomClient'
import { fixtureEvents } from '../room/testFixtures'

// The clean-slate heading of today's BurnedScreen. Task 8 rewrites the screen to "Room burned.".
const BURNED = 'This room has ended.'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
const text = () => document.body.textContent ?? ''
const hasRoomClosed = () => screen.queryByRole('button', { name: 'Room closed' }) !== null

/** A client a test drives by hand: it delivers events and never times anything itself. */
function fakeClient(opts: { host: boolean; burn?: () => Promise<void> }) {
  let listener: (e: RoomEvent) => void = () => {}
  const self: Member = { id: 'm_taylor', roomId: 'demo', name: 'Taylor', joinedAtSeq: 0, joinedAt: 0 }
  const room: Room = {
    id: 'demo',
    hostMemberId: opts.host ? 'm_taylor' : 'm_host',
    status: 'active',
    inviteToken: 'demo',
    createdAt: 0,
    expiresAt: 1,
  }
  const client: RoomClient = {
    subscribe: (l) => {
      listener = l
      return () => {
        listener = () => {}
      }
    },
    createRoom: async () => ({ room, self }),
    joinRoom: async () => ({ room, self }),
    burn: opts.burn ?? (async () => {}),
    addLine: async () => {},
    dispose: () => {},
  }
  return { client, emit: (e: RoomEvent) => act(() => listener(e)) }
}

async function joinWith(client: RoomClient, button: 'Create room' | 'Join room', makeClient?: () => RoomClient) {
  render(
    <App client={client} kind="mock" search={button === 'Join room' ? '?room=demo' : ''} makeClient={makeClient} />,
  )
  fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Leo' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: button }))
    await vi.advanceTimersByTimeAsync(0)
  })
}

async function tapBurn() {
  fireEvent.click(screen.getByRole('button', { name: 'Burn room…' }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Burn room' }))
    await vi.advanceTimersByTimeAsync(0)
  })
}

/** "That's between us." shows only while igniting (the first 600 ms). */
function expectClosingOverFrozenRoom(igniting = false) {
  expect(hasRoomClosed()).toBe(true)
  expect(screen.queryByText("That's between us.") !== null).toBe(igniting)
  expect(text()).toContain('Kevin')
  expect(text()).not.toContain(BURNED)
}

function expectCleanSlate() {
  expect(screen.getByText(BURNED)).toBeTruthy()
  expect(text()).not.toContain('Kevin')
  expect(text().toLowerCase()).not.toContain('cake')
  expect(hasRoomClosed()).toBe(false)
}

describe('Burn flow in the app', () => {
  it('host on the mock: closes over the frozen room, then shows the clean slate at 2900 ms', async () => {
    await joinWith(new MockRoomClient({ speed: 1000 }), 'Create room')
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    await advance(60_000)
    expect(text()).toContain('Kevin')

    await tapBurn()
    expectClosingOverFrozenRoom(true)

    await advance(2899)
    expectClosingOverFrozenRoom()
    await advance(1)
    expectCleanSlate()
  })

  it('non-host: room_burned with no tap plays the same closing', async () => {
    const { client, emit } = fakeClient({ host: false })
    await joinWith(client, 'Join room')
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    for (const e of fixtureEvents()) emit(e)
    expect(text()).toContain('Kevin')
    expect(screen.queryByRole('button', { name: 'Burn room…' })).toBeNull()

    emit({ type: 'room_burned', roomId: 'demo' })
    expectClosingOverFrozenRoom(true)
    await advance(2900)
    expectCleanSlate()
  })

  it('a failed burn shows the error and never animates', async () => {
    const { client, emit } = fakeClient({
      host: true,
      burn: () => Promise.reject(new BackendError('unknown', 'Could not burn.')),
    })
    await joinWith(client, 'Create room')
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    for (const e of fixtureEvents()) emit(e)

    await tapBurn()
    expect(screen.getByRole('alert').textContent).toBe('Could not burn.')
    expect(hasRoomClosed()).toBe(false)
    expect(screen.queryByText("That's between us.")).toBeNull()

    await advance(3000)
    expect(hasRoomClosed()).toBe(false)
    expect(text()).toContain('Kevin')
    expect(text()).not.toContain(BURNED)
    expect(screen.getByRole('button', { name: 'Burn room…' })).toBeTruthy()
  })

  it('a successful burn() starts closing even before room_burned arrives, and room_burned does not restart it', async () => {
    const { client, emit } = fakeClient({ host: true })
    await joinWith(client, 'Create room')
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    for (const e of fixtureEvents()) emit(e)

    await tapBurn()
    expectClosingOverFrozenRoom(true)
    await advance(1500)
    emit({ type: 'room_burned', roomId: 'demo' })
    expectClosingOverFrozenRoom()
    await advance(1399)
    expectClosingOverFrozenRoom()
    await advance(1)
    expectCleanSlate()
  })

  it('a burn during the entry ritual dismisses the ritual and burns the room behind it', async () => {
    const { client, emit } = fakeClient({ host: false })
    await joinWith(client, 'Join room')
    for (const e of fixtureEvents()) emit(e)
    expect(screen.getByRole('button', { name: 'Enter room' })).toBeTruthy()

    emit({ type: 'room_burned', roomId: 'demo' })
    expect(screen.queryByRole('button', { name: 'Enter room' })).toBeNull()
    expect(screen.queryByText('Shhh. Keep it in the room.')).toBeNull()
    expectClosingOverFrozenRoom(true)
    await advance(2900)
    expectCleanSlate()
  })

  it('reduced motion still reaches the clean slate at 2900 ms, with the overlay told to reduce (Review Focus 4)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    try {
      const { client, emit } = fakeClient({ host: true })
      await joinWith(client, 'Create room')
      fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
      for (const e of fixtureEvents()) emit(e)

      await tapBurn()
      expectClosingOverFrozenRoom(true)
      expect(document.querySelector('canvas.burn-overlay')?.getAttribute('data-reduced')).toBe('true')
      await advance(2899)
      expectClosingOverFrozenRoom()
      await advance(1)
      expectCleanSlate()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('Leave during closing goes to a fresh Join screen and never shows the clean slate (Review Focus 3)', async () => {
    const quiet = fakeClient({ host: false }).client
    await joinWith(new MockRoomClient({ speed: 1000 }), 'Create room', () => quiet)
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    await advance(60_000)

    await tapBurn()
    await advance(1000)
    expectClosingOverFrozenRoom()
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))

    for (let i = 0; i < 10; i++) {
      await advance(500)
      expect(screen.getByRole('button', { name: 'Create room' })).toBeTruthy()
      expect(text()).not.toContain(BURNED)
      expect(text()).not.toContain('Kevin')
      expect(hasRoomClosed()).toBe(false)
    }
  })
})
