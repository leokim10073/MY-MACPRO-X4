import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewTranscriptLine } from '../../../shared/schema'
import type { AudioInput } from '../audio/audioInput'
import { FakeInkSocket } from './fakeInk'
import { PushToTalk } from './pushToTalk'

class FakeMic implements AudioInput {
  started = 0
  stopped = false
  failStart = false
  private listener: ((f: Int16Array) => void) | null = null
  async start() {
    this.started++
    if (this.failStart) throw new Error('denied')
  }
  onFrame(l: (f: Int16Array) => void) {
    this.listener = l
    return () => (this.listener = null)
  }
  preroll() {
    return new Int16Array(4800).fill(7)
  }
  stop() {
    this.stopped = true
  }
  emit(n: number, v = 1) {
    this.listener?.(new Int16Array(n).fill(v))
  }
}

function setup(finalTexts: string[] = ['Hello there.']) {
  const mic = new FakeMic()
  const sockets: FakeInkSocket[] = []
  const lines: NewTranscriptLine[] = []
  let t = 1000
  const ptt = new PushToTalk({
    roomId: 'room1',
    speakerId: 'm_alex',
    mic,
    getToken: async () => 'tok',
    sendLine: async (l) => {
      lines.push(l)
    },
    keyterms: () => ['Alex', 'Kevin'],
    openSocket: (url) => {
      const s = new FakeInkSocket(url, { finalText: finalTexts[sockets.length] ?? '' })
      sockets.push(s)
      queueMicrotask(() => s.open())
      return s
    },
    now: () => t,
  })
  return { mic, sockets, lines, ptt, setNow: (v: number) => (t = v) }
}

describe('PushToTalk', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('turns one press into one line with the press time, sending the pre-roll first', async () => {
    const { mic, sockets, lines, ptt, setNow } = setup()
    ptt.press(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(ptt.getState()).toMatchObject({ status: 'talking', isListening: true })
    expect(sockets).toHaveLength(1)
    expect(sockets[0].url).toContain('keyterm=Alex&keyterm=Kevin')
    expect(sockets[0].url).toContain('access_token=tok')

    setNow(5000)
    mic.emit(1600, 2)
    ptt.press(false)
    // Still listening during the tail.
    expect(ptt.getState().isListening).toBe(true)
    mic.emit(1600, 3)
    await vi.advanceTimersByTimeAsync(300)
    expect(ptt.getState()).toMatchObject({ status: 'idle', isListening: false })
    await vi.runAllTimersAsync()

    expect(lines).toEqual([{ roomId: 'room1', speakerId: 'm_alex', text: 'Hello there.', at: 1000 }])
    const audio = sockets[0].audio
    expect(audio.slice(0, 4800).every((v) => v === 7)).toBe(true)
    expect(audio.slice(4800, 6400).every((v) => v === 2)).toBe(true)
    expect(audio.slice(6400).every((v) => v === 3)).toBe(true)
    expect(sockets[0].commands).toEqual(['finalize', 'close'])
  })

  it('does not send audio from between presses', async () => {
    const { mic, sockets, ptt } = setup(['One.', 'Two.'])
    ptt.press(true)
    await vi.advanceTimersByTimeAsync(0)
    ptt.press(false)
    await vi.runAllTimersAsync()
    mic.emit(16000, 9)
    expect(sockets[0].audio.includes(9)).toBe(false)
  })

  it('drops a press with no speech', async () => {
    const { lines, ptt } = setup([''])
    ptt.press(true)
    await vi.advanceTimersByTimeAsync(0)
    ptt.press(false)
    await vi.runAllTimersAsync()
    expect(lines).toEqual([])
  })

  it('splits a press longer than 60 s into two lines without a gap', async () => {
    const { mic, sockets, lines, ptt, setNow } = setup(['First part.', 'Second part.'])
    ptt.press(true)
    await vi.advanceTimersByTimeAsync(0)
    setNow(61_000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sockets).toHaveLength(2)
    expect(ptt.getState().isListening).toBe(true)
    mic.emit(1600, 5)
    ptt.press(false)
    await vi.runAllTimersAsync()
    expect(lines.map((l) => [l.text, l.at])).toEqual([
      ['First part.', 1000],
      ['Second part.', 61_000],
    ])
    expect(sockets[1].audio.every((v) => v === 5)).toBe(true)
  })

  it('ends the previous press at once when pressed again during its tail', async () => {
    const { sockets, lines, ptt } = setup(['One.', 'Two.'])
    ptt.press(true)
    await vi.advanceTimersByTimeAsync(0)
    ptt.press(false)
    await vi.advanceTimersByTimeAsync(100)
    ptt.press(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(sockets).toHaveLength(2)
    expect(sockets[0].commands[0]).toBe('finalize')
    ptt.press(false)
    await vi.runAllTimersAsync()
    expect(lines.map((l) => l.text)).toEqual(['One.', 'Two.'])
  })

  it('subscribes to the mic once, even on a quick double press while it starts', async () => {
    const { mic, sockets, ptt } = setup()
    ptt.press(true)
    ptt.press(false)
    ptt.press(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(sockets).toHaveLength(1)
    mic.emit(1600, 4)
    ptt.press(false)
    await vi.runAllTimersAsync()
    // Each frame is sent once, not once per pending press.
    expect(sockets[0].audio.filter((v) => v === 4)).toHaveLength(1600)
  })

  it('records nothing if released while the mic permission was being asked', async () => {
    const { sockets, ptt } = setup()
    ptt.press(true)
    ptt.press(false)
    await vi.runAllTimersAsync()
    expect(sockets).toHaveLength(0)
    expect(ptt.getState().status).toBe('idle')
  })

  it('reports a denied microphone', async () => {
    const { mic, ptt } = setup()
    mic.failStart = true
    ptt.press(true)
    await vi.runAllTimersAsync()
    expect(ptt.getState()).toMatchObject({ status: 'error', isListening: false })
    expect(ptt.getState().error).toMatch(/Microphone/)
  })

  it('stop drops the current press without sending it and releases the mic', async () => {
    const { mic, sockets, lines, ptt } = setup(['Secret.'])
    ptt.press(true)
    await vi.advanceTimersByTimeAsync(0)
    ptt.stop()
    await vi.runAllTimersAsync()
    expect(lines).toEqual([])
    expect(sockets[0].commands).toEqual([])
    expect(sockets[0].closedByClient).toBe(true)
    expect(mic.stopped).toBe(true)
    expect(ptt.getState()).toMatchObject({ status: 'stopped', isListening: false })
    ptt.press(true)
    await vi.runAllTimersAsync()
    expect(sockets).toHaveLength(1)
  })

  it('notifies subscribers and keeps the same state object when nothing changed', async () => {
    const { ptt } = setup()
    const seen: string[] = []
    ptt.subscribe(() => seen.push(ptt.getState().status))
    const before = ptt.getState()
    ptt.press(false)
    expect(ptt.getState()).toBe(before)
    ptt.press(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toContain('talking')
    ptt.press(false)
    await vi.runAllTimersAsync()
  })
})
