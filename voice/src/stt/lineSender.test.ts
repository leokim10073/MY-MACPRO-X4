import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewTranscriptLine } from '../../../shared/schema'
import { LineSender, hasSpeech } from './lineSender'

const line = (text: string): NewTranscriptLine => ({ roomId: 'r', speakerId: 'm_alex', text, at: 1000 })

describe('hasSpeech', () => {
  it('needs at least one letter or digit', () => {
    expect(hasSpeech('Kevin ate the cake.')).toBe(true)
    expect(hasSpeech('42')).toBe(true)
    expect(hasSpeech('')).toBe(false)
    expect(hasSpeech(' ... ?! ')).toBe(false)
  })
})

describe('LineSender', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends the text unchanged apart from trimming the ends', async () => {
    const send = vi.fn(async () => {})
    const s = new LineSender(send)
    expect(s.submit(line('  NO WAY he ate the entire cake.  '))).toBe(true)
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledWith(line('NO WAY he ate the entire cake.'))
  })

  it('drops lines with no speech', async () => {
    const send = vi.fn(async () => {})
    const s = new LineSender(send)
    expect(s.submit(line(' . '))).toBe(false)
    await vi.runAllTimersAsync()
    expect(send).not.toHaveBeenCalled()
  })

  it('retries with the same at, then keeps the line as failed, and can retry it', async () => {
    const send = vi.fn<(l: NewTranscriptLine) => Promise<void>>().mockRejectedValue(new Error('down'))
    const s = new LineSender(send)
    s.submit(line('hello'))
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledTimes(3)
    expect(send.mock.calls.every(([l]) => l.at === 1000)).toBe(true)
    expect(s.pending).toBe(0)
    expect(s.failedLines).toHaveLength(1)

    send.mockResolvedValue(undefined)
    s.failedLines[0].retry()
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledTimes(4)
    expect(s.failedLines).toHaveLength(0)
  })

  it('stops retrying and forgets failed lines after cancel', async () => {
    const send = vi.fn<(l: NewTranscriptLine) => Promise<void>>().mockRejectedValue(new Error('down'))
    const s = new LineSender(send)
    s.submit(line('hello'))
    await vi.advanceTimersByTimeAsync(0)
    s.cancel()
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledTimes(1)
    expect(s.failedLines).toHaveLength(0)
    s.submit(line('after burn'))
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('succeeds on a later attempt without reporting a failure', async () => {
    const send = vi.fn<(l: NewTranscriptLine) => Promise<void>>().mockRejectedValueOnce(new Error('blip')).mockResolvedValue()
    const s = new LineSender(send)
    s.submit(line('hello'))
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledTimes(2)
    expect(s.failedLines).toHaveLength(0)
  })
})
