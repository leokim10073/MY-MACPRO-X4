import { getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'
import type { Member, Room, RoomEvent, TranscriptLine } from '../../../../shared/schema'
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
  const subscriptions: Array<{ name: string; args: unknown; push: (v: unknown) => void; stopped: boolean }> = []
  const convex = {
    mutation: vi.fn(async (ref: unknown, args: unknown) => {
      const name = getFunctionName(ref as never)
      calls.push({ name, args })
      if (name === 'rooms:create' || name === 'rooms:join') return { room, member: alex, sessionToken: 'secret' }
      return null
    }),
    onUpdate: vi.fn((ref: unknown, args: unknown, callback: (v: unknown) => void) => {
      const sub = { name: getFunctionName(ref as never), args, push: callback, stopped: false }
      subscriptions.push(sub)
      return () => {
        sub.stopped = true
      }
    }),
    action: vi.fn(async (ref: unknown, args: unknown) => {
      calls.push({ name: getFunctionName(ref as never), args })
      return { token: 'stt', expiresAt: 99 }
    }),
    close: vi.fn(async () => {}),
  }
  return { convex, calls, subscriptions }
}

function setup() {
  const fake = fakeConvex()
  const client = new ConvexRoomClient(fake.convex as never)
  const events: RoomEvent[] = []
  client.subscribe((e) => events.push(e))
  return { ...fake, client, events }
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

  it('voice adds lines and fetches speech-to-text tokens with the session', async () => {
    const { client, calls } = setup()
    await expect(client.voice.addLine('hi', 1)).rejects.toThrow('not in a room')
    await client.createRoom('Alex')
    await client.voice.addLine('Kevin ate my cake', 42)
    expect(await client.voice.sttToken()).toEqual({ token: 'stt', expiresAt: 99 })
    expect(calls.slice(-2)).toEqual([
      { name: 'lines:add', args: { sessionToken: 'secret', text: 'Kevin ate my cake', at: 42 } },
      { name: 'voice:sttToken', args: { sessionToken: 'secret' } },
    ])
  })

  it('dispose stops the subscription and closes the connection', async () => {
    const { client, convex, subscriptions } = setup()
    await client.createRoom('Alex')
    client.dispose()
    expect(subscriptions[0].stopped).toBe(true)
    expect(convex.close).toHaveBeenCalled()
  })
})
