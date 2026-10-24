// @vitest-environment node
// Runs ConvexRoomClient against a real backend. Skipped unless LIVE_CONVEX_URL is set:
//   (in backend/) npx convex dev
//   (in web/)     LIVE_CONVEX_URL=http://127.0.0.1:3210 npx vitest run src/room/convex/live.test.ts
import { ConvexClient } from 'convex/browser'
import { afterAll, describe, expect, it } from 'vitest'
import type { RoomEvent } from '../../../../shared/schema'
import { initialRoomState, recapFor, roomReducer } from '../state'
import { backendApi as api } from './backendApi'
import { ConvexRoomClient } from './ConvexRoomClient'

// Read without Node types, which the app's tsconfig leaves out.
const url = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .LIVE_CONVEX_URL

/** Resolves once `check` passes on the events received so far, or fails after 10 s. */
function waitFor(events: RoomEvent[], check: (events: RoomEvent[]) => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (check(events)) return resolve()
      if (Date.now() - started > 10_000) return reject(new Error(`timed out; got ${events.map((e) => e.type)}`))
      setTimeout(tick, 50)
    }
    tick()
  })
}

describe.skipIf(!url)('ConvexRoomClient against a live backend', () => {
  const closers: Array<() => void> = []
  afterAll(() => closers.forEach((c) => c()))

  it('late join, live lines, recap and burn reach the phone', async () => {
    // "Voice" and the host act through a plain client, so the test can add lines.
    const raw = new ConvexClient(url!)
    closers.push(() => void raw.close())
    const host = await raw.mutation(api.rooms.create, { name: 'Alex' })
    await raw.mutation(api.lines.add, { sessionToken: host.sessionToken, text: 'Kevin ate my cake', at: Date.now() })
    await raw.mutation(api.lines.add, { sessionToken: host.sessionToken, text: 'The whole thing', at: Date.now() })

    // The latecomer's phone uses the real adapter.
    const phone = new ConvexRoomClient(url!)
    closers.push(() => phone.dispose())
    const events: RoomEvent[] = []
    phone.subscribe((e) => events.push(e))
    const { room, self } = await phone.joinRoom(host.room.inviteToken, 'Taylor')
    expect(room.id).toBe(host.room.id)
    expect(self.joinedAtSeq).toBe(2)

    await waitFor(events, (es) => es.some((e) => e.type === 'recap_ready'))
    await raw.mutation(api.lines.add, { sessionToken: host.sessionToken, text: 'Wait, what?', at: Date.now() })
    await waitFor(events, (es) => es.filter((e) => e.type === 'line_added').length === 3)

    const state = events.reduce(roomReducer, initialRoomState)
    expect(state.members.map((m) => m.name)).toEqual(['Alex', 'Taylor'])
    expect(state.lines.map((l) => [l.seq, l.text])).toEqual([
      [1, 'Kevin ate my cake'],
      [2, 'The whole thing'],
      [3, 'Wait, what?'],
    ])
    expect(recapFor(state, self)?.uptoSeq).toBe(2)

    // Check-in 1: the size of the largest listAfter update. Prints only the number, never the payload.
    let largestBytes = 0
    const stopMeasuring = raw.onUpdate(
      api.events.listAfter,
      { roomId: host.room.id, sessionToken: host.sessionToken, afterEventSeq: 0 },
      (log) => {
        largestBytes = Math.max(largestBytes, new TextEncoder().encode(JSON.stringify(log)).length)
      },
    )
    await new Promise<void>((resolve) => {
      const tick = () => (largestBytes > 0 ? resolve() : setTimeout(tick, 50))
      tick()
    })
    stopMeasuring()
    console.log(`largest listAfter payload: ${largestBytes} bytes`)

    await raw.mutation(api.rooms.burn, { roomId: host.room.id, sessionToken: host.sessionToken })
    await waitFor(events, (es) => es.some((e) => e.type === 'room_burned'))
    expect(events.reduce(roomReducer, initialRoomState)).toEqual({ ...initialRoomState, status: 'burned' })
  })

  it('push-to-talk lines and speech-to-text tokens go through the backend', async () => {
    const phone = new ConvexRoomClient(url!)
    closers.push(() => phone.dispose())
    const events: RoomEvent[] = []
    phone.subscribe((e) => events.push(e))
    await phone.createRoom('Alex')

    await phone.voice.addLine('Said into the mic', Date.now())
    await waitFor(events, (es) => es.some((e) => e.type === 'line_added'))
    const line = events.find((e) => e.type === 'line_added')
    expect(line?.type === 'line_added' && line.line.text).toBe('Said into the mic')

    const token = await phone.voice.sttToken()
    expect(token.token.length).toBeGreaterThan(20)
    expect(token.expiresAt).toBeGreaterThan(Date.now())
    await phone.burn()
  })

  it('a host phone sees its own room and can burn it', async () => {
    const phone = new ConvexRoomClient(url!)
    closers.push(() => phone.dispose())
    const events: RoomEvent[] = []
    phone.subscribe((e) => events.push(e))
    const { room, self } = await phone.createRoom('Alex')
    expect(room.hostMemberId).toBe(self.id)

    await waitFor(events, (es) => es.some((e) => e.type === 'member_joined'))
    await phone.burn()
    await waitFor(events, (es) => es.some((e) => e.type === 'room_burned'))
  })
})
