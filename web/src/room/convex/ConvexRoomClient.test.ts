import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member, Room, RoomEvent, TranscriptLine } from '../../../../shared/schema'
import type { ConnectionStatus } from '../RoomClient'
import { initialRoomState, roomReducer } from '../state'
import { ConvexRoomClient } from './ConvexRoomClient'

const room: Room = {
  id: 'room1',
  hostMemberId: 'm1',
  status: 'active',
  inviteToken: 'invite1',
  createdAt: 0,
  expiresAt: 1,
}
const alex: Member = { id: 'm1', roomId: 'room1', name: 'Alex', joinedAtSeq: 0, joinedAt: 0 }
const line = (seq: number): TranscriptLine => ({
  id: `l${seq}`,
  roomId: 'room1',
  speakerId: 'm1',
  speakerName: 'Alex',
  text: `line ${seq}`,
  seq,
  at: seq,
})

/** Stands in for ConvexClient: records calls and lets the test push query results. */
function fakeConvex() {
  const calls: Array<{ name: string; args: unknown }> = []
  const subscriptions: Array<{
    name: string
    args: unknown
    push: (v: unknown) => void
    fail: (e: Error) => void
    stopped: boolean
  }> = []
  const convex = {
    mutation: vi.fn(async (ref: unknown, args: unknown) => {
      const name = getFunctionName(ref as never)
      calls.push({ name, args })
      if (name === 'rooms:create' || name === 'rooms:join') return { room, member: alex, sessionToken: 'secret' }
      return null
    }),
    onUpdate: vi.fn((ref: unknown, args: unknown, callback: (v: unknown) => void, onError?: (e: Error) => void) => {
      const sub = {
        name: getFunctionName(ref as never),
        args,
        push: callback,
        fail: (e: Error) => onError?.(e),
        stopped: false,
      }
      subscriptions.push(sub)
      return () => {
        sub.stopped = true
      }
    }),
    close: vi.fn(async () => {}),
  }
  return { convex, calls, subscriptions }
}

interface ConnState {
  isWebSocketConnected: boolean
  hasEverConnected: boolean
}

/** `withConnectionState` adds a fake `subscribeToConnectionState` the test drives with `setConnection`. */
function setup({ withConnectionState = false } = {}) {
  const fake = fakeConvex()
  const connection = { listeners: [] as Array<(s: ConnState) => void>, unsubscribed: 0 }
  const convex = withConnectionState
    ? {
        ...fake.convex,
        subscribeToConnectionState: vi.fn((cb: (s: ConnState) => void) => {
          connection.listeners.push(cb)
          return () => {
            connection.unsubscribed += 1
            connection.listeners = connection.listeners.filter((l) => l !== cb)
          }
        }),
      }
    : fake.convex
  const client = new ConvexRoomClient(convex as never)
  const events: RoomEvent[] = []
  client.subscribe((e) => events.push(e))
  const statuses: ConnectionStatus[] = []
  const setConnection = (s: ConnState) => [...connection.listeners].forEach((l) => l(s))
  return { ...fake, client, events, statuses, connection, setConnection }
}

const lines = (from: number, to: number): Array<[number, RoomEvent]> =>
  Array.from({ length: to - from + 1 }, (_, i) => [from + i, { type: 'line_added', line: line(from + i) }])
const afterSeq = (sub: { args: unknown }) => (sub.args as { afterEventSeq: number }).afterEventSeq

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

const log = (...events: Array<[number, RoomEvent]>) => ({
  status: 'active' as const,
  events: events.map(([eventSeq, event]) => ({ eventSeq, event })),
})

describe('ConvexRoomClient', () => {
  it('creates a room and subscribes to its event log from the start', async () => {
    const { client, calls, subscriptions } = setup()
    expect(await client.createRoom('Alex')).toEqual({ room, self: alex })
    expect(calls).toEqual([{ name: 'rooms:create', args: { name: 'Alex' } }])
    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0]).toMatchObject({
      name: 'events:listAfter',
      args: { roomId: 'room1', sessionToken: 'secret', afterEventSeq: 0 },
    })
  })

  it('joins with the invite token', async () => {
    const { client, calls } = setup()
    await client.joinRoom('invite1', 'Taylor')
    expect(calls).toEqual([{ name: 'rooms:join', args: { inviteToken: 'invite1', name: 'Taylor' } }])
  })

  it('passes each event on once, in eventSeq order, though every update resends the log', async () => {
    const { client, subscriptions, events } = setup()
    await client.createRoom('Alex')
    const joined: RoomEvent = { type: 'member_joined', member: alex }
    const first: RoomEvent = { type: 'line_added', line: line(1) }
    const second: RoomEvent = { type: 'line_added', line: line(2) }

    subscriptions[0].push(log([1, joined], [2, first]))
    subscriptions[0].push(log([1, joined], [2, first], [3, second]))
    expect(events).toEqual([joined, first, second])
  })

  it('turns a burned log into one room_burned event and stops listening', async () => {
    const { client, subscriptions, events } = setup()
    await client.createRoom('Alex')
    subscriptions[0].push({ status: 'burned', events: [] })
    subscriptions[0].push({ status: 'burned', events: [] })
    expect(events).toEqual([{ type: 'room_burned', roomId: 'room1' }])
    expect(subscriptions[0].stopped).toBe(true)
  })

  it('burns with the session it joined with', async () => {
    const { client, calls } = setup()
    await client.burn() // not in a room yet: nothing to do
    await client.createRoom('Alex')
    await client.burn()
    expect(calls.at(-1)).toEqual({ name: 'rooms:burn', args: { roomId: 'room1', sessionToken: 'secret' } })
    expect(calls.filter((c) => c.name === 'rooms:burn')).toHaveLength(1)
  })

  it('refuses a second room', async () => {
    const { client } = setup()
    await client.createRoom('Alex')
    await expect(client.joinRoom('invite1', 'Alex')).rejects.toThrow('already in a room')
  })

  it('feeds the same reducer the mock does', async () => {
    const { client, subscriptions, events } = setup()
    await client.createRoom('Alex')
    subscriptions[0].push(
      log([1, { type: 'member_joined', member: alex }], [2, { type: 'line_added', line: line(1) }]),
    )
    subscriptions[0].push({ status: 'burned', events: [] })

    const states = events.reduce(
      (acc, e) => [...acc, roomReducer(acc[acc.length - 1], e)],
      [initialRoomState],
    )
    expect(states[2].members).toEqual([alex])
    expect(states[2].lines.map((l) => l.text)).toEqual(['line 1'])
    expect(states[3]).toEqual({ ...initialRoomState, status: 'burned' })
  })

  it('dispose stops the subscription and closes the connection', async () => {
    const { client, convex, subscriptions } = setup()
    await client.createRoom('Alex')
    client.dispose()
    expect(subscriptions[0].stopped).toBe(true)
    expect(convex.close).toHaveBeenCalled()
  })
})

describe('ConvexRoomClient following the log', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    // setVisibility shadows jsdom's prototype getter with an own property; removing it restores the default.
    delete (document as { visibilityState?: unknown }).visibilityState
  })

  it('on a gap, emits the prefix, resubscribes from the last seq and stops the old subscription', async () => {
    const { client, subscriptions, events } = setup()
    await client.createRoom('Alex')
    subscriptions[0].push(log(...lines(1, 2)))
    subscriptions[0].push(log(...lines(1, 2), ...lines(5, 5)))

    expect(events).toHaveLength(2)
    expect(subscriptions).toHaveLength(2)
    expect(subscriptions[0].stopped).toBe(true)
    expect(subscriptions[1]).toMatchObject({
      name: 'events:listAfter',
      args: { roomId: 'room1', sessionToken: 'secret', afterEventSeq: 2 },
    })

    subscriptions[1].push(log(...lines(3, 5)))
    expect(events.map((e) => e.type === 'line_added' && e.line.seq)).toEqual([1, 2, 3, 4, 5])
  })

  it('a gap that persists after one resubscribe from the same seq ends in lost (R4)', async () => {
    const { client, subscriptions, statuses } = setup()
    client.onConnectionChange((s) => statuses.push(s))
    await client.createRoom('Alex')
    subscriptions[0].push(log(...lines(1, 2), ...lines(5, 5)))
    expect(subscriptions).toHaveLength(2)
    subscriptions[1].push(log(...lines(5, 5)))
    expect(subscriptions).toHaveLength(2)
    expect(subscriptions[1].stopped).toBe(true)
    expect(statuses.at(-1)).toBe('lost')
  })

  it('a gap on the very first subscription goes straight to lost (R5)', async () => {
    const { client, subscriptions, statuses, events } = setup()
    client.onConnectionChange((s) => statuses.push(s))
    await client.createRoom('Alex')
    subscriptions[0].push(log(...lines(5, 6)))
    expect(events).toEqual([])
    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0].stopped).toBe(true)
    expect(statuses.at(-1)).toBe('lost')
  })

  it('a window update skipped by the guard stays harmless: no lost, subscription kept', async () => {
    const { client, subscriptions, statuses, events } = setup()
    client.onConnectionChange((s) => statuses.push(s))
    await client.createRoom('Alex')
    subscriptions[0].push(log(...lines(1, 201)))
    expect(afterSeq(subscriptions[1])).toBe(201)
    // A server ignoring afterEventSeq resends 201 old rows: window-sized, nothing new.
    subscriptions[1].push(log(...lines(1, 201)))
    expect(subscriptions).toHaveLength(2)
    expect(subscriptions[1].stopped).toBe(false)
    expect(statuses).not.toContain('lost')
    expect(events).toHaveLength(201)
  })

  it('on a window-sized update, emits everything then resubscribes from the last seq', async () => {
    const { client, subscriptions, events } = setup()
    await client.createRoom('Alex')
    subscriptions[0].push(log(...lines(1, 201)))
    expect(events).toHaveLength(201)
    expect(subscriptions[0].stopped).toBe(true)
    expect(afterSeq(subscriptions[1])).toBe(201)
  })

  it('ignores a late callback from a replaced subscription', async () => {
    const { client, subscriptions, events } = setup()
    await client.createRoom('Alex')
    subscriptions[0].push(log(...lines(1, 1), ...lines(3, 3)))
    expect(subscriptions).toHaveLength(2)
    subscriptions[0].push(log(...lines(1, 3)))
    subscriptions[0].fail(new Error('stale'))
    expect(events).toHaveLength(1)
    expect(subscriptions).toHaveLength(2)
  })

  it('emits nothing twice when a fresh subscription resends the log from 0', async () => {
    const { client, subscriptions, events } = setup()
    await client.createRoom('Alex')
    subscriptions[0].push(log(...lines(1, 201)))
    // A server that ignored afterEventSeq would resend everything on the new subscription.
    subscriptions[1].push(log(...lines(1, 202)))
    expect(events.map((e) => e.type === 'line_added' && e.line.seq)).toEqual(
      Array.from({ length: 202 }, (_, i) => i + 1),
    )
  })

  it('resubscribes from the last seq when the page comes back after more than 30 s hidden', async () => {
    vi.useFakeTimers()
    const { client, subscriptions } = setup()
    await client.createRoom('Alex')
    subscriptions[0].push(log(...lines(1, 3)))

    setVisibility('hidden')
    vi.advanceTimersByTime(10_000)
    setVisibility('visible')
    expect(subscriptions).toHaveLength(1)

    setVisibility('hidden')
    vi.advanceTimersByTime(31_000)
    setVisibility('visible')
    expect(subscriptions).toHaveLength(2)
    expect(subscriptions[0].stopped).toBe(true)
    expect(afterSeq(subscriptions[1])).toBe(3)

    client.dispose()
    setVisibility('hidden')
    vi.advanceTimersByTime(31_000)
    setVisibility('visible')
    expect(subscriptions).toHaveLength(2)
  })

  it('a subscription error gives lost and stops the subscription, without logging the error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, subscriptions, statuses } = setup()
    client.onConnectionChange((s) => statuses.push(s))
    await client.createRoom('Alex')
    subscriptions[0].fail(new Error('Not a member of this room'))
    expect(statuses).toEqual(['connecting', 'lost'])
    expect(subscriptions[0].stopped).toBe(true)
    expect(consoleError).not.toHaveBeenCalled()
  })
})

describe('ConvexRoomClient connection status', () => {
  it('without the connection API, is connecting until the first log, then online', async () => {
    const { client, subscriptions, statuses } = setup()
    const unsubscribe = client.onConnectionChange((s) => statuses.push(s))
    await client.createRoom('Alex')
    subscriptions[0].push(log(...lines(1, 1)))
    subscriptions[0].push(log(...lines(1, 2)))
    expect(statuses).toEqual(['connecting', 'online'])
    unsubscribe()
  })

  it('maps the Convex connection state: connecting, online, reconnecting, online', () => {
    const { client, statuses, setConnection } = setup({ withConnectionState: true })
    client.onConnectionChange((s) => statuses.push(s))
    setConnection({ hasEverConnected: false, isWebSocketConnected: false })
    setConnection({ hasEverConnected: true, isWebSocketConnected: true })
    setConnection({ hasEverConnected: true, isWebSocketConnected: true })
    setConnection({ hasEverConnected: true, isWebSocketConnected: false })
    setConnection({ hasEverConnected: true, isWebSocketConnected: true })
    expect(statuses).toEqual(['connecting', 'online', 'reconnecting', 'online'])
  })

  it('a new listener hears the current status at once, and stops hearing after unsubscribing', () => {
    const { client, setConnection } = setup({ withConnectionState: true })
    setConnection({ hasEverConnected: true, isWebSocketConnected: true })
    const heard: ConnectionStatus[] = []
    const unsubscribe = client.onConnectionChange((s) => heard.push(s))
    unsubscribe()
    setConnection({ hasEverConnected: true, isWebSocketConnected: false })
    expect(heard).toEqual(['online'])
  })

  it('lost is sticky', async () => {
    const { client, subscriptions, statuses, setConnection } = setup({ withConnectionState: true })
    client.onConnectionChange((s) => statuses.push(s))
    await client.createRoom('Alex')
    setConnection({ hasEverConnected: true, isWebSocketConnected: true })
    subscriptions[0].fail(new Error('Not a member of this room'))
    setConnection({ hasEverConnected: true, isWebSocketConnected: false })
    setConnection({ hasEverConnected: true, isWebSocketConnected: true })
    expect(statuses).toEqual(['connecting', 'online', 'lost'])
  })

  it('emits nothing more after a burn', async () => {
    const { client, subscriptions, statuses, setConnection } = setup({ withConnectionState: true })
    client.onConnectionChange((s) => statuses.push(s))
    await client.createRoom('Alex')
    setConnection({ hasEverConnected: true, isWebSocketConnected: true })
    subscriptions[0].push({ status: 'burned', events: [] })
    setConnection({ hasEverConnected: true, isWebSocketConnected: false })
    expect(statuses).toEqual(['connecting', 'online'])
  })

  it('dispose unsubscribes from the connection state', () => {
    const { client, connection } = setup({ withConnectionState: true })
    client.dispose()
    expect(connection.unsubscribed).toBe(1)
  })

  it('addLine calls lines:add with the session token, text and time', async () => {
    const { client, calls } = setup()
    await client.createRoom('Alex')
    await client.addLine('hello', 42)
    expect(calls.at(-1)).toEqual({ name: 'lines:add', args: { sessionToken: 'secret', text: 'hello', at: 42 } })
  })

  it('addLine and startReplay do nothing before a join', async () => {
    const { client, calls } = setup()
    await client.addLine('hello', 1)
    await client.startReplay()
    expect(calls).toEqual([])
  })

  it('startReplay calls replay:start with the session token', async () => {
    const { client, calls } = setup()
    await client.createRoom('Alex')
    await client.startReplay()
    expect(calls.at(-1)).toEqual({ name: 'replay:start', args: { sessionToken: 'secret' } })
  })

  it('maps a backend rejection to a BackendError', async () => {
    const { client, convex } = setup()
    convex.mutation.mockRejectedValueOnce(new Error('This room has ended'))
    await expect(client.joinRoom('x', 'Sam')).rejects.toMatchObject({ kind: 'room_ended' })
  })

  it('a mutation that never answers rejects as unreachable after 10 s', async () => {
    vi.useFakeTimers()
    try {
      const { client, convex } = setup()
      convex.mutation.mockImplementationOnce(() => new Promise<never>(() => {}))
      const p = client.createRoom('Alex').catch((e: unknown) => e)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await p).toMatchObject({ kind: 'unreachable' })
    } finally {
      vi.useRealTimers()
    }
  })
})
