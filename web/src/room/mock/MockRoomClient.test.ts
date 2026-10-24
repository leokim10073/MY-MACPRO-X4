import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomEvent } from '../../../../shared/schema'
import { MockRoomClient } from './MockRoomClient'

const collect = (client: MockRoomClient) => {
  const events: RoomEvent[] = []
  client.subscribe((e) => events.push(e))
  return events
}
const lines = (events: RoomEvent[]) => events.filter((e) => e.type === 'line_added')

describe('MockRoomClient', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('joinRoom emits nothing until timers run', async () => {
    const client = new MockRoomClient()
    const events = collect(client)
    const { room, self } = await client.joinRoom('demo', 'Sam')
    expect(events).toEqual([])
    expect(room.id).toBe('demo')
    expect(room.hostMemberId).toBe('m_alex')
    expect(self).toMatchObject({ id: 'm_self', name: 'Sam' })
  })

  it('advancing 0 ms delivers lines 1-16, Taylor and m_self; the recap follows after recapLatencyMs', async () => {
    const client = new MockRoomClient()
    const events = collect(client)
    await client.joinRoom('demo', 'Sam')
    vi.advanceTimersByTime(0)
    expect(lines(events)).toHaveLength(16)
    const joined = events.flatMap((e) => (e.type === 'member_joined' ? [e.member.id] : []))
    expect(joined).toContain('m_self')
    expect(events.some((e) => e.type === 'recap_ready')).toBe(false)
    vi.advanceTimersByTime(1500)
    expect(events.some((e) => e.type === 'recap_ready')).toBe(true)
  })

  it('advancing to the end delivers 21 lines', async () => {
    const client = new MockRoomClient()
    const events = collect(client)
    await client.joinRoom('demo', 'Sam')
    vi.runAllTimers()
    expect(lines(events)).toHaveLength(21)
  })

  it('createRoom makes self the host', async () => {
    const client = new MockRoomClient()
    const { room, self } = await client.createRoom('Sam')
    expect(room.hostMemberId).toBe(self.id)
    expect(room.expiresAt - room.createdAt).toBe(6 * 60 * 60 * 1000)
  })

  it('rejects a second createRoom/joinRoom on the same client', async () => {
    const client = new MockRoomClient()
    await client.joinRoom('demo', 'Sam')
    await expect(client.joinRoom('demo', 'Sam')).rejects.toBeInstanceOf(Error)
    await expect(client.createRoom('Sam')).rejects.toBeInstanceOf(Error)
  })

  it('burn emits room_burned and nothing after it', async () => {
    const client = new MockRoomClient()
    const events = collect(client)
    await client.joinRoom('demo', 'Sam')
    vi.advanceTimersByTime(0)
    const before = events.length
    await client.burn()
    expect(events).toHaveLength(before + 1)
    expect(events.at(-1)).toEqual({ type: 'room_burned', roomId: 'demo' })
    vi.runAllTimers()
    expect(events).toHaveLength(before + 1)
  })

  it('dispose stops all events', async () => {
    const client = new MockRoomClient()
    const events = collect(client)
    await client.joinRoom('demo', 'Sam')
    client.dispose()
    vi.runAllTimers()
    expect(events).toEqual([])
  })

  it('unsubscribe stops delivery to that listener', async () => {
    const client = new MockRoomClient()
    const events: RoomEvent[] = []
    const off = client.subscribe((e) => events.push(e))
    await client.joinRoom('demo', 'Sam')
    off()
    vi.runAllTimers()
    expect(events).toEqual([])
  })
})
