import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeInkSocket } from './fakeInk'
import { PttSession } from './pttSession'

const samples = (n: number, v = 1) => new Int16Array(n).fill(v)

describe('PttSession', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('queues audio until the socket opens, then sends it in order in 100 ms chunks', async () => {
    const socket = new FakeInkSocket('u', { finalText: 'Hi.' })
    const s = new PttSession(async () => socket)
    s.push(samples(1600, 1))
    s.push(samples(800, 2))
    await vi.advanceTimersByTimeAsync(0)
    expect(socket.audio).toHaveLength(0)

    socket.open()
    expect(socket.audio).toEqual([...samples(1600, 1)])
    s.push(samples(800, 3))
    expect(socket.audio).toHaveLength(3200)
    expect(socket.audio.slice(1600)).toEqual([...samples(800, 2), ...samples(800, 3)])
  })

  it('finalizes, waits for flush_done and done, and returns the final text', async () => {
    const socket = new FakeInkSocket('u', { finalText: 'He ate the whole thing.' })
    const s = new PttSession(async () => socket)
    await vi.advanceTimersByTimeAsync(0)
    socket.open()
    s.push(samples(500))
    socket.serverSend({ type: 'transcript', is_final: false, text: 'He ate' })

    const result = await s.stop()
    expect(result).toEqual({ text: 'He ate the whole thing.', complete: true })
    // The partial chunk is flushed before finalize.
    expect(socket.audio).toHaveLength(500)
    expect(socket.commands).toEqual(['finalize', 'close'])
    // Closing finishes in the background after done.
    await vi.runAllTimersAsync()
    expect(socket.closedByClient).toBe(true)
  })

  it('sends audio pushed while connecting, even when stop comes before the socket opens', async () => {
    const socket = new FakeInkSocket('u', { finalText: 'Wait.' })
    const s = new PttSession(async () => socket)
    s.push(samples(300))
    const done = s.stop()
    await vi.advanceTimersByTimeAsync(100)
    socket.open()
    expect(await done).toMatchObject({ text: 'Wait.', complete: true })
    expect(socket.audio).toHaveLength(300)
    expect(socket.commands[0]).toBe('finalize')
  })

  it('ignores audio pushed after stop', async () => {
    const socket = new FakeInkSocket('u', { finalText: 'x' })
    const s = new PttSession(async () => socket)
    await vi.advanceTimersByTimeAsync(0)
    socket.open()
    const done = s.stop()
    s.push(samples(1600))
    await done
    expect(socket.audio).toHaveLength(0)
  })

  it('returns what it has, marked incomplete, when finalize is never acknowledged', async () => {
    const socket = new FakeInkSocket('u', { ackFinalize: false, ackClose: false })
    const s = new PttSession(async () => socket)
    await vi.advanceTimersByTimeAsync(0)
    socket.open()
    socket.serverSend({ type: 'transcript', is_final: true, text: 'Partial' })
    const done = s.stop()
    await vi.advanceTimersByTimeAsync(6000)
    expect(await done).toEqual({ text: 'Partial', complete: false })
    await vi.runAllTimersAsync()
    expect(socket.closedByClient).toBe(true)
  })

  it('reports a failed connection', async () => {
    const s = new PttSession(async () => {
      throw new Error('no token')
    })
    s.push(samples(100))
    expect(await s.stop()).toEqual({ text: '', complete: false, error: 'no token' })
  })

  it('reports a connection that never opens', async () => {
    const socket = new FakeInkSocket('u')
    const s = new PttSession(async () => socket)
    const done = s.stop()
    await vi.advanceTimersByTimeAsync(6000)
    expect(await done).toMatchObject({ complete: false, error: 'Connection timed out' })
    expect(socket.closedByClient).toBe(true)
  })

  it('keeps an Ink error message', async () => {
    const socket = new FakeInkSocket('u')
    const s = new PttSession(async () => socket)
    await vi.advanceTimersByTimeAsync(0)
    socket.open()
    socket.serverSend({ type: 'error', message: 'model_not_found' })
    socket.serverClose()
    expect(await s.stop()).toMatchObject({ complete: false, error: 'model_not_found' })
  })

  it('abort drops everything and closes at once', async () => {
    const socket = new FakeInkSocket('u', { finalText: 'secret' })
    const s = new PttSession(async () => socket)
    await vi.advanceTimersByTimeAsync(0)
    socket.open()
    s.push(samples(1600))
    s.abort()
    expect(socket.closedByClient).toBe(true)
    expect(await s.stop()).toMatchObject({ text: '', complete: false })
    expect(socket.commands).toEqual([])
  })

  it('passes the preview text to onPreview', async () => {
    const socket = new FakeInkSocket('u')
    const s = new PttSession(async () => socket)
    const previews: string[] = []
    s.onPreview = (t) => previews.push(t)
    await vi.advanceTimersByTimeAsync(0)
    socket.open()
    socket.serverSend({ type: 'transcript', is_final: true, text: 'Okay,' })
    socket.serverSend({ type: 'transcript', is_final: false, text: ' so' })
    expect(previews).toEqual(['Okay,', 'Okay, so'])
  })
})
