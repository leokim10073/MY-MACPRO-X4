import { afterEach, describe, expect, it, vi } from 'vitest'
import { setup } from '../../test/fakeConvex'
import { PRESENCE_INTERVAL_MS } from './ConvexRoomClient'

afterEach(() => vi.useRealTimers())

const heartbeats = (calls: Array<{ name: string; args: unknown }>) => calls.filter((c) => c.name === 'presence:heartbeat')
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('ConvexRoomClient presence', () => {
  it('sends nothing until someone listens and the phone is in a room', async () => {
    vi.useFakeTimers()
    const { client, calls } = setup()
    await client.createRoom('Alex')
    await vi.advanceTimersByTimeAsync(PRESENCE_INTERVAL_MS * 2)
    expect(heartbeats(calls)).toHaveLength(0)
  })

  it('heartbeats with the session token and watches who is offline', async () => {
    vi.useFakeTimers()
    const { client, calls, subscriptions } = setup()
    const offline: string[][] = []
    client.onPresenceChange((ids) => offline.push(ids))
    await client.createRoom('Alex')
    await flush()
    expect(heartbeats(calls)).toHaveLength(1)
    expect(heartbeats(calls)[0].args).toMatchObject({ sessionToken: 'secret', interval: PRESENCE_INTERVAL_MS })

    await vi.advanceTimersByTimeAsync(PRESENCE_INTERVAL_MS)
    expect(heartbeats(calls)).toHaveLength(2)
    // The same tab keeps one session id.
    const [a, b] = heartbeats(calls).map((c) => (c.args as { sessionId: string }).sessionId)
    expect(a).toBe(b)

    const list = subscriptions.filter((s) => s.name === 'presence:list')
    expect(list).toHaveLength(1)
    expect(list[0].args).toEqual({ roomToken: 'room-token' })
    list[0].push([
      { memberId: 'm1', online: true },
      { memberId: 'm2', online: false },
    ])
    expect(offline).toEqual([['m2']])
  })

  it('stops on leave and when the last listener goes', async () => {
    vi.useFakeTimers()
    const { client, calls, subscriptions } = setup()
    const stop = client.onPresenceChange(() => {})
    await client.createRoom('Alex')
    await flush()
    stop()
    await vi.advanceTimersByTimeAsync(PRESENCE_INTERVAL_MS * 3)
    expect(heartbeats(calls)).toHaveLength(1)
    expect(subscriptions.find((s) => s.name === 'presence:list')?.stopped).toBe(true)

    client.onPresenceChange(() => {})
    await flush()
    expect(heartbeats(calls)).toHaveLength(2)
    await client.leave()
    await vi.advanceTimersByTimeAsync(PRESENCE_INTERVAL_MS * 3)
    expect(heartbeats(calls)).toHaveLength(2)
  })

  it('a failed heartbeat is retried on the next beat', async () => {
    vi.useFakeTimers()
    const { client, convex, calls } = setup()
    client.onPresenceChange(() => {})
    await client.createRoom('Alex')
    convex.mutation.mockRejectedValueOnce(new Error('offline'))
    await vi.advanceTimersByTimeAsync(PRESENCE_INTERVAL_MS)
    await vi.advanceTimersByTimeAsync(PRESENCE_INTERVAL_MS)
    expect(heartbeats(calls).length).toBeGreaterThanOrEqual(2)
  })
})
