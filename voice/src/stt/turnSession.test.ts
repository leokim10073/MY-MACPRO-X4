import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeTurnsSocket } from './fakeTurns'
import { TurnSession, type TurnSessionStatus } from './turnSession'

const CHUNK = 1600 // 100 ms at 16 kHz

function setup(opts: { endOnClose?: string | null; failFirst?: number } = {}) {
  const sockets: FakeTurnsSocket[] = []
  const thresholds: number[] = []
  const ends: { text: string; complete: boolean }[] = []
  const updates: string[] = []
  const statuses: TurnSessionStatus[] = []
  let starts = 0
  let failures = opts.failFirst ?? 0
  const session = new TurnSession(
    async (threshold) => {
      thresholds.push(threshold)
      if (failures > 0) {
        failures--
        throw new Error('token failed')
      }
      const s = new FakeTurnsSocket(`ws://fake/${sockets.length}`, { endOnClose: opts.endOnClose })
      sockets.push(s)
      return s
    },
    {
      onStart: () => starts++,
      onUpdate: (t) => updates.push(t),
      onEnd: (text, complete) => ends.push({ text, complete }),
      onStatus: (s) => statuses.push(s),
    },
    { startThreshold: 0.8 },
  )
  return { session, sockets, thresholds, ends, updates, statuses, starts: () => starts }
}

const chunk = (v: number) => new Int16Array(CHUNK).fill(v)
const flush = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('TurnSession', () => {
  it('queues audio while connecting and flushes on open', async () => {
    const { session, sockets } = setup()
    session.start()
    for (let i = 1; i <= 10; i++) session.push(chunk(i))
    await flush()
    sockets[0].open()
    expect(sockets[0].audio.length).toBe(10 * CHUNK)
    expect(sockets[0].audio[0]).toBe(1)
    expect(sockets[0].audio[9 * CHUNK]).toBe(10)
  })

  it('drops the oldest audio beyond 3 s of queue', async () => {
    const { session, sockets } = setup()
    session.start()
    for (let i = 1; i <= 35; i++) session.push(chunk(i))
    await flush()
    sockets[0].open()
    expect(sockets[0].audio.length).toBe(30 * CHUNK)
    expect(sockets[0].audio[0]).toBe(6)
  })

  it('turn.end emits onEnd with complete=true', async () => {
    const t = setup()
    t.session.start()
    await flush()
    t.sockets[0].open()
    t.sockets[0].serverSend({ type: 'turn.start' })
    t.sockets[0].serverSend({ type: 'turn.update', transcript: 'So Kevin' })
    t.sockets[0].serverSend({ type: 'turn.eager_end' })
    t.sockets[0].serverSend({ type: 'turn.resume' })
    t.sockets[0].serverSend({ type: 'turn.end', transcript: 'So Kevin walks.' })
    expect(t.starts()).toBe(1)
    expect(t.updates).toEqual(['So Kevin'])
    expect(t.ends).toEqual([{ text: 'So Kevin walks.', complete: true }])
  })

  it('unexpected close mid-turn emits the last update with complete=false', async () => {
    const t = setup()
    t.session.start()
    await flush()
    t.sockets[0].open()
    t.sockets[0].serverSend({ type: 'turn.start' })
    t.sockets[0].serverSend({ type: 'turn.update', transcript: 'So Kevin walks' })
    t.sockets[0].serverClose()
    expect(t.ends).toEqual([{ text: 'So Kevin walks', complete: false }])
    expect(t.statuses.at(-1)).toBe('reconnecting')
  })

  it('reconnects with backoff 500, 1000, 2000, 4000, 10000, then 10000', async () => {
    const t = setup()
    t.session.start()
    await flush()
    for (const wait of [500, 1000, 2000, 4000, 10_000, 10_000]) {
      const before = t.sockets.length
      t.sockets.at(-1)!.serverClose()
      await vi.advanceTimersByTimeAsync(wait - 1)
      expect(t.sockets.length).toBe(before)
      await vi.advanceTimersByTimeAsync(1)
      expect(t.sockets.length).toBe(before + 1)
    }
    // A successful open resets the backoff.
    t.sockets.at(-1)!.open()
    t.sockets.at(-1)!.serverClose()
    await vi.advanceTimersByTimeAsync(500)
    expect(t.sockets.length).toBe(8)
  })

  it('token failure keeps backing off', async () => {
    const t = setup({ failFirst: 3 })
    t.session.start()
    await flush()
    expect(t.statuses).toContain('reconnecting')
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000)
    expect(t.sockets.length).toBe(1)
    t.sockets[0].open()
    expect(t.statuses.at(-1)).toBe('open')
  })

  it('rotation happens only right after turn.end', async () => {
    const t = setup()
    t.session.start()
    await flush()
    t.sockets[0].open()
    await vi.advanceTimersByTimeAsync(9 * 60_000)
    t.sockets[0].serverSend({ type: 'turn.start' })
    await vi.advanceTimersByTimeAsync(2 * 60_000)
    expect(t.sockets.length).toBe(1)
    t.sockets[0].serverSend({ type: 'turn.end', transcript: 'Done.' })
    await flush()
    expect(t.sockets.length).toBe(2)
    expect(t.sockets[0].commands).toContainEqual({ type: 'close' })
    t.sockets[1].open()
    t.session.push(chunk(5))
    expect(t.sockets[1].audio.length).toBe(CHUNK)
    expect(t.sockets[0].audio.length).toBe(0)
    expect(t.ends).toEqual([{ text: 'Done.', complete: true }])
  })

  it('setStartThreshold sends config when open and is used by the next connection', async () => {
    const t = setup()
    t.session.start()
    await flush()
    t.sockets[0].open()
    t.session.setStartThreshold(0.9)
    expect(t.sockets[0].commands).toContainEqual({ type: 'config', turn: { start_threshold: 0.9 } })
    t.sockets[0].serverClose()
    await vi.advanceTimersByTimeAsync(500)
    expect(t.thresholds).toEqual([0.8, 0.9])
  })

  it('close drains: turn.end after close is emitted', async () => {
    const t = setup({ endOnClose: 'Last words.' })
    t.session.start()
    await flush()
    t.sockets[0].open()
    t.sockets[0].serverSend({ type: 'turn.start' })
    t.sockets[0].serverSend({ type: 'turn.update', transcript: 'Last' })
    await t.session.close()
    expect(t.sockets[0].commands).toContainEqual({ type: 'close' })
    expect(t.ends).toEqual([{ text: 'Last words.', complete: true }])
    expect(t.statuses.at(-1)).toBe('closed')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(t.sockets.length).toBe(1)
  })

  it('close sends the last partial chunk before closing', async () => {
    const t = setup({ endOnClose: null })
    t.session.start()
    await flush()
    t.sockets[0].open()
    t.session.push(new Int16Array(400).fill(3))
    await t.session.close()
    expect(t.sockets[0].audio.length).toBe(400)
  })

  it('close without turn.end emits the last update with complete=false after 2 s', async () => {
    const t = setup()
    t.session.start()
    await flush()
    t.sockets[0].open()
    t.sockets[0].serverSend({ type: 'turn.start' })
    t.sockets[0].serverSend({ type: 'turn.update', transcript: 'Half a' })
    const closing = t.session.close()
    await vi.advanceTimersByTimeAsync(1999)
    expect(t.ends).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await closing
    expect(t.ends).toEqual([{ text: 'Half a', complete: false }])
    expect(t.sockets[0].closedByClient).toBe(true)
  })

  it('abort sends nothing', async () => {
    const t = setup()
    t.session.start()
    await flush()
    t.sockets[0].open()
    t.sockets[0].serverSend({ type: 'turn.start' })
    t.sockets[0].serverSend({ type: 'turn.update', transcript: 'secret' })
    t.session.abort()
    t.sockets[0].serverSend({ type: 'turn.end', transcript: 'secret' })
    t.sockets[0].serverClose()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(t.ends).toEqual([])
    expect(t.sockets.length).toBe(1)
  })
})
