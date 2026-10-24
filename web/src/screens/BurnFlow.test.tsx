import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member, Room, RoomEvent } from '../../../shared/schema'
import App from '../App'
import { BackendError } from '../room/convex/callBackend'
import { MockRoomClient } from '../room/mock/MockRoomClient'
import type { RoomClient } from '../room/RoomClient'
import { fixtureEvents } from '../room/testFixtures'

// The clean-slate heading of BurnedScreen.
const BURNED = "Tea's gone."

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
    createRoom: async (name) => ({ room, self: { ...self, name } }),
    joinRoom: async () => ({ room, self }),
    burn: opts.burn ?? (async () => {}),
    addLine: async () => {},
    dispose: () => {},
  }
  return { client, emit: (e: RoomEvent) => act(() => listener(e)) }
}

async function joinWith(client: RoomClient, button: 'Start the party' | 'Join the room', makeClient?: () => RoomClient) {
  render(
    <App client={client} kind="mock" search={button === 'Join the room' ? '?room=demo' : ''} makeClient={makeClient} />,
  )
  fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Leo' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: button }))
    await vi.advanceTimersByTimeAsync(0)
  })
}

async function tapBurn() {
  fireEvent.click(screen.getByRole('button', { name: 'Last Sip…' }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'End & delete room' }))
    await vi.advanceTimersByTimeAsync(0)
  })
}

/** "Room ended." shows for the whole closing, over the frozen room. */
function expectClosingOverFrozenRoom() {
  expect(hasRoomClosed()).toBe(true)
  expect(screen.getByText('Room ended.')).toBeTruthy()
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
    await joinWith(new MockRoomClient({ speed: 1000 }), 'Start the party')
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    await advance(60_000)
    expect(text()).toContain('Kevin')

    await tapBurn()
    expectClosingOverFrozenRoom()

    await advance(2899)
    expectClosingOverFrozenRoom()
    await advance(1)
    expectCleanSlate()
  })

  it('non-host: room_burned with no tap plays the same closing', async () => {
    const { client, emit } = fakeClient({ host: false })
    await joinWith(client, 'Join the room')
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    for (const e of fixtureEvents()) emit(e)
    expect(text()).toContain('Kevin')
    expect(screen.queryByRole('button', { name: 'Last Sip…' })).toBeNull()

    emit({ type: 'room_burned', roomId: 'demo' })
    expectClosingOverFrozenRoom()
    await advance(2900)
    expectCleanSlate()
  })

  it('a failed burn shows the error and never animates', async () => {
    const { client, emit } = fakeClient({
      host: true,
      burn: () => Promise.reject(new BackendError('unknown', 'Could not burn.')),
    })
    await joinWith(client, 'Start the party')
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    for (const e of fixtureEvents()) emit(e)

    await tapBurn()
    expect(screen.getByRole('alert').textContent).toBe("Couldn't end the room. Please try again.")
    expect(hasRoomClosed()).toBe(false)
    expect(screen.queryByText('Room ended.')).toBeNull()

    await advance(3000)
    expect(hasRoomClosed()).toBe(false)
    expect(text()).toContain('Kevin')
    expect(text()).not.toContain(BURNED)
    expect(screen.getByRole('button', { name: 'Last Sip…' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Last Sip…' }))
  })

  it('a successful burn() starts closing even before room_burned arrives, and room_burned does not restart it', async () => {
    const { client, emit } = fakeClient({ host: true })
    await joinWith(client, 'Start the party')
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    for (const e of fixtureEvents()) emit(e)

    await tapBurn()
    expectClosingOverFrozenRoom()
    await advance(1500)
    emit({ type: 'room_burned', roomId: 'demo' })
    expectClosingOverFrozenRoom()
    await advance(1399)
    expectClosingOverFrozenRoom()
    await advance(1)
    expectCleanSlate()
  })

  it('a host burn whose room_burned event never arrives still ends at the clean slate with nothing left in the DOM', async () => {
    const { client, emit } = fakeClient({ host: true })
    await joinWith(client, 'Start the party')
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    for (const e of fixtureEvents()) emit(e)
    expect(text()).toContain('Kevin')

    await tapBurn()
    expectClosingOverFrozenRoom()
    await advance(2900)
    expectCleanSlate()
    expect(document.body.innerHTML).not.toContain('Kevin')
    expect(document.body.innerHTML.toLowerCase()).not.toContain('cake')
  })

  it('a burn during the entry ritual dismisses the ritual and burns the room behind it', async () => {
    const { client, emit } = fakeClient({ host: false })
    await joinWith(client, 'Join the room')
    for (const e of fixtureEvents()) emit(e)
    expect(screen.getByRole('button', { name: 'Enter room' })).toBeTruthy()

    emit({ type: 'room_burned', roomId: 'demo' })
    expect(screen.queryByRole('button', { name: 'Enter room' })).toBeNull()
    expect(screen.queryByText("Your seat's ready.")).toBeNull()
    expectClosingOverFrozenRoom()
    await advance(2900)
    expectCleanSlate()
  })

  it('reduced motion still reaches the clean slate at 2900 ms, with the plain crossfade (Review Focus 4)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    try {
      const { client, emit } = fakeClient({ host: true })
      await joinWith(client, 'Start the party')
      fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
      for (const e of fixtureEvents()) emit(e)

      await tapBurn()
      expectClosingOverFrozenRoom()
      expect(document.querySelector('.lsc-closing.is-animated')).toBeNull()
      expect(document.querySelector('.lsc-closing .lsc--empty')).toBeTruthy()
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
    await joinWith(new MockRoomClient({ speed: 1000 }), 'Start the party', () => quiet)
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    await advance(60_000)

    await tapBurn()
    await advance(1000)
    expectClosingOverFrozenRoom()
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))

    for (let i = 0; i < 10; i++) {
      await advance(500)
      expect(screen.getByRole('button', { name: 'Start the party' })).toBeTruthy()
      expect(text()).not.toContain(BURNED)
      expect(text()).not.toContain('Kevin')
      expect(hasRoomClosed()).toBe(false)
    }
  })

  it('Back home after a host burn shows Join with Start the party and drops room= from the URL', async () => {
    window.history.replaceState(null, '', '/play?room=demo&client=mock')
    const second = fakeClient({ host: false }).client
    const makeClient = vi.fn(() => second)
    await joinWith(fakeClient({ host: true }).client, 'Start the party', makeClient)
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    await tapBurn()
    await advance(2900)
    fireEvent.click(screen.getByRole('button', { name: 'Back home' }))
    expect(makeClient).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Start the party' })).toBeTruthy()
    expect(window.location.search).not.toContain('room=')
    expect(window.location.search).toContain('client=mock')
    expect(window.location.pathname).toBe('/play')
    window.history.replaceState(null, '', '/')
  })

  it('Back home disposes the old client once', async () => {
    const first = fakeClient({ host: true }).client
    const dispose = vi.fn()
    first.dispose = dispose
    await joinWith(first, 'Start the party', () => fakeClient({ host: false }).client)
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    await tapBurn()
    await advance(2900)
    expect(dispose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back home' }))
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('Start a new room disposes the old client once', async () => {
    const first = fakeClient({ host: true }).client
    const dispose = vi.fn()
    first.dispose = dispose
    const fresh: RoomClient = { ...fakeClient({ host: true }).client, createRoom: newRoomCreator() }
    await joinWith(first, 'Start the party', () => fresh)
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    await tapBurn()
    await advance(2900)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start a new room' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('Start a new room creates once on a fresh client with the same nickname and shows the ritual', async () => {
    const createRoom = newRoomCreator()
    const fresh: RoomClient = { ...fakeClient({ host: true }).client, createRoom }
    const makeClient = vi.fn(() => fresh)
    await joinWith(fakeClient({ host: true }).client, 'Start the party', makeClient)
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    await tapBurn()
    await advance(2900)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start a new room' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(makeClient).toHaveBeenCalledTimes(1)
    expect(createRoom).toHaveBeenCalledTimes(1)
    expect(createRoom).toHaveBeenCalledWith('Leo')
    expect(screen.getByRole('button', { name: 'Enter room' })).toBeTruthy()
    expect(text()).not.toContain(BURNED)
  })

  it('Start a new room shows a Creating room status while the new room is made', async () => {
    const fresh: RoomClient = { ...fakeClient({ host: true }).client, createRoom: () => new Promise(() => {}) }
    await joinWith(fakeClient({ host: true }).client, 'Start the party', () => fresh)
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    await tapBurn()
    await advance(2900)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start a new room' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByRole('status').textContent).toBe('Creating room…')
  })

  it('Start a new room creates exactly one room under StrictMode', async () => {
    const createRoom = newRoomCreator()
    const fresh: RoomClient = { ...fakeClient({ host: true }).client, createRoom }
    render(
      <StrictMode>
        <App client={fakeClient({ host: true }).client} kind="mock" search="" makeClient={() => fresh} />
      </StrictMode>,
    )
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Leo' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start the party' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
    await tapBurn()
    await advance(2900)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start a new room' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(createRoom).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Enter room' })).toBeTruthy()
  })
})

function newRoomCreator() {
  return vi.fn(async (name: string) => ({
    room: { id: 'r2', hostMemberId: 'm2', status: 'active' as const, inviteToken: 'r2', createdAt: 0, expiresAt: 1 },
    self: { id: 'm2', roomId: 'r2', name, joinedAtSeq: 0, joinedAt: 0 },
  }))
}
