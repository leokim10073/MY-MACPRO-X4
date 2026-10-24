import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewTranscriptLine } from '../../../shared/schema'
import type { CallEvents, CallLike, CallParticipant, NoiseFilterKind } from '../call/callSession'
import type { LiveText } from '../call/liveText'
import type { CallToken } from '../server/livekit'
import { FakeTurnsSocket } from './fakeTurns'
import { OpenMic } from './openMic'

class FakeCall implements CallLike {
  events: CallEvents | null = null
  joins = 0
  left = 0
  muted: boolean[] = []
  volumes: number[] = []
  resumed = 0
  live: LiveText[] = []
  private listener: ((f: Int16Array) => void) | null = null
  private settle: { resolve(k: NoiseFilterKind): void; reject(e: Error): void } | null = null

  constructor(private readonly mode: 'auto' | 'manual' | 'fail' = 'auto') {}

  join(token: Promise<CallToken>, events: CallEvents): Promise<NoiseFilterKind> {
    this.joins++
    this.events = events
    void token
    if (this.mode === 'fail') return Promise.reject(new Error('Permission denied'))
    if (this.mode === 'auto') return Promise.resolve('krisp')
    return new Promise((resolve, reject) => (this.settle = { resolve, reject }))
  }
  finishJoin() {
    this.settle?.resolve('krisp')
  }
  onFrame(l: (f: Int16Array) => void) {
    this.listener = l
    return () => (this.listener = null)
  }
  async setMuted(m: boolean) {
    this.muted.push(m)
  }
  setRemoteVolume(v: number) {
    this.volumes.push(v)
  }
  sendLive(msg: LiveText) {
    this.live.push(msg)
  }
  async resume() {
    this.resumed++
  }
  async leave() {
    this.left++
  }
  emit(n = 1600, v = 1000) {
    this.listener?.(new Int16Array(n).fill(v))
  }
}

function setup(opts: { call?: FakeCall; endOnClose?: string | null } = {}) {
  const call = opts.call ?? new FakeCall()
  const sockets: FakeTurnsSocket[] = []
  const lines: NewTranscriptLine[] = []
  let t = 1000
  let calls = 0
  const mic = new OpenMic({
    roomId: 'room1',
    speakerId: 'm_alex',
    getSttToken: async () => 'tok',
    getCallToken: async () => ({ url: 'wss://lk', token: 'jwt' }),
    sendLine: async (l) => {
      lines.push(l)
    },
    keyterms: () => ['Alex', `Kevin${sockets.length}`],
    createCall: () => {
      calls++
      return call
    },
    openSocket: (url) => {
      const s = new FakeTurnsSocket(url, { endOnClose: opts.endOnClose })
      sockets.push(s)
      return s
    },
    now: () => t,
  })
  return {
    mic,
    call,
    sockets,
    lines,
    calls: () => calls,
    setTime: (v: number) => (t = v),
    last: () => sockets[sockets.length - 1],
  }
}

const flush = () => vi.advanceTimersByTimeAsync(0)

async function inCall(opts: Parameters<typeof setup>[0] = {}) {
  const s = setup(opts)
  await s.mic.join()
  await flush()
  s.last().open()
  return s
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('OpenMic', () => {
  it('join goes joining → in_call and opens one Ink connection', async () => {
    const s = setup({ call: new FakeCall('manual') })
    const joining = s.mic.join()
    expect(s.mic.getState().status).toBe('joining')
    s.call.finishJoin()
    await joining
    await flush()
    const st = s.mic.getState()
    expect(st.status).toBe('in_call')
    expect(st.isListening).toBe(true)
    expect(st.noiseFilter).toBe('krisp')
    expect(s.sockets).toHaveLength(1)
    expect(s.sockets[0].url).toContain('/stt/turns/websocket')
  })

  it('turn.end becomes a line', async () => {
    const s = await inCall()
    s.setTime(5000)
    s.last().serverSend({ type: 'turn.start' })
    s.setTime(9000)
    s.last().serverSend({ type: 'turn.end', transcript: 'Kevin ate the cake.' })
    await flush()
    expect(s.lines).toEqual([{ roomId: 'room1', speakerId: 'm_alex', text: 'Kevin ate the cake.', at: 5000 }])
  })

  it('preview follows turn.update and clears on turn.end', async () => {
    const s = await inCall()
    s.last().serverSend({ type: 'turn.start' })
    s.last().serverSend({ type: 'turn.update', transcript: 'Kevin ate' })
    expect(s.mic.getState().preview).toBe('Kevin ate')
    s.last().serverSend({ type: 'turn.end', transcript: 'Kevin ate it.' })
    expect(s.mic.getState().preview).toBe('')
  })

  it('frames reach Ink while in the call', async () => {
    const s = await inCall()
    // The gate holds 200 ms back, so the first chunk comes out after the third.
    for (let i = 0; i < 3; i++) s.call.emit(1600, 1000)
    expect(s.last().audio.length).toBe(1600)
  })

  it('quiet frames reach Ink as zeros', async () => {
    const s = await inCall()
    for (let i = 0; i < 3; i++) s.call.emit(1600, 10)
    const sent = s.last().audio
    expect(sent.length).toBe(1600)
    expect(sent.every((v) => v === 0)).toBe(true)
  })

  it('join failure leaves nothing running', async () => {
    const s = setup({ call: new FakeCall('fail') })
    await s.mic.join()
    await flush()
    const st = s.mic.getState()
    expect(st.status).toBe('error')
    expect(st.isListening).toBe(false)
    expect(st.error).toBeTruthy()
    expect(s.call.left).toBe(1)
    expect(s.sockets).toHaveLength(0)
  })

  it('double join creates one call', async () => {
    const s = setup({ call: new FakeCall('manual') })
    const a = s.mic.join()
    const b = s.mic.join()
    s.call.finishJoin()
    await Promise.all([a, b])
    await flush()
    expect(s.calls()).toBe(1)
    expect(s.call.joins).toBe(1)
    expect(s.sockets).toHaveLength(1)
  })

  it('leave during join tears down after join resolves', async () => {
    const s = setup({ call: new FakeCall('manual') })
    const joining = s.mic.join()
    const leaving = s.mic.leave()
    s.call.finishJoin()
    await Promise.all([joining, leaving])
    await flush()
    expect(s.mic.getState().status).toBe('left')
    expect(s.call.left).toBe(1)
    expect(s.sockets).toHaveLength(0)
  })

  it('stop during join opens no socket', async () => {
    const s = setup({ call: new FakeCall('manual') })
    const joining = s.mic.join()
    s.mic.stop()
    s.call.finishJoin()
    await joining
    await flush()
    expect(s.mic.getState().status).toBe('stopped')
    expect(s.call.left).toBe(1)
    expect(s.sockets).toHaveLength(0)
  })

  it('mute closes Ink and unpublishes', async () => {
    const s = await inCall({ endOnClose: null })
    const sock = s.last()
    await s.mic.setMuted(true)
    expect(s.call.muted).toEqual([true])
    expect(sock.commands).toContainEqual({ type: 'close' })
    expect(s.mic.getState().isListening).toBe(false)
    expect(s.mic.getState().muted).toBe(true)
    const before = sock.audio.length
    s.call.emit(1600, 1000)
    expect(sock.audio.length).toBe(before)
    expect(s.sockets).toHaveLength(1)
  })

  it('unmute opens a fresh connection with current keyterms', async () => {
    const s = await inCall({ endOnClose: null })
    await s.mic.setMuted(true)
    await s.mic.setMuted(false)
    await flush()
    expect(s.call.muted).toEqual([true, false])
    expect(s.sockets).toHaveLength(2)
    expect(s.sockets[1].url).toContain('keyterm=Kevin1')
    expect(s.mic.getState().isListening).toBe(true)
  })

  it('fast mute-unmute sends the open turn once', async () => {
    const s = await inCall()
    const old = s.last()
    old.serverSend({ type: 'turn.start' })
    old.serverSend({ type: 'turn.update', transcript: 'Wait for' })
    const muting = s.mic.setMuted(true)
    const unmuting = s.mic.setMuted(false)
    await flush()
    s.last().open()
    old.serverSend({ type: 'turn.end', transcript: 'Wait for it.' })
    old.serverClose()
    await Promise.all([muting, unmuting])
    await vi.advanceTimersByTimeAsync(3000)
    expect(s.lines.map((l) => l.text)).toEqual(['Wait for it.'])
  })

  it('leave sends the last turn; stop does not', async () => {
    const a = await inCall({ endOnClose: 'Bye now.' })
    a.last().serverSend({ type: 'turn.start' })
    await a.mic.leave()
    await flush()
    expect(a.lines.map((l) => l.text)).toEqual(['Bye now.'])
    expect(a.mic.getState().status).toBe('left')
    expect(a.call.left).toBe(1)

    const b = await inCall({ endOnClose: 'Secret.' })
    b.last().serverSend({ type: 'turn.start' })
    b.last().serverSend({ type: 'turn.update', transcript: 'Secret' })
    b.mic.stop()
    b.last().serverSend({ type: 'turn.end', transcript: 'Secret.' })
    await vi.advanceTimersByTimeAsync(3000)
    expect(b.lines).toEqual([])
    expect(b.mic.getState().status).toBe('stopped')
    expect(b.call.left).toBe(1)
  })

  it('call drop stops transcription', async () => {
    const s = await inCall({ endOnClose: null })
    s.call.events!.onDropped('The call was disconnected.')
    await flush()
    const st = s.mic.getState()
    expect(st.status).toBe('error')
    expect(st.isListening).toBe(false)
    expect(st.error).toBe('The call was disconnected.')
    expect(s.last().commands).toContainEqual({ type: 'close' })
  })

  it('participants come from the call', async () => {
    const s = await inCall()
    const list: CallParticipant[] = [{ id: 'm_alex', name: 'Alex', speaking: true, muted: false }]
    s.call.events!.onParticipants(list)
    expect(s.mic.getState().participants).toEqual(list)
  })

  it('my turn.update goes to friends as live text, turn.end as final', async () => {
    const s = await inCall()
    s.last().serverSend({ type: 'turn.start' })
    s.last().serverSend({ type: 'turn.update', transcript: 'Kevin' })
    s.last().serverSend({ type: 'turn.update', transcript: 'Kevin' })
    s.last().serverSend({ type: 'turn.update', transcript: 'Kevin ate' })
    s.last().serverSend({ type: 'turn.end', transcript: 'Kevin ate it.' })
    expect(s.call.live).toEqual([
      { text: 'Kevin', final: false },
      { text: 'Kevin ate', final: false },
      { text: 'Kevin ate it.', final: true },
    ])
  })

  it("friends' live text shows by speaker until their line arrives", async () => {
    const s = await inCall()
    s.call.events!.onLive('m_sam', { text: 'So I', final: false })
    expect(s.mic.getState().live).toEqual({ m_sam: { text: 'So I', final: false } })
    s.call.events!.onLive('m_sam', { text: 'So I went.', final: true })
    expect(s.mic.getState().live.m_sam).toEqual({ text: 'So I went.', final: true })
    s.mic.noteLine({ id: 'l1', roomId: 'room1', speakerId: 'm_sam', speakerName: 'Sam', text: 'So I went.', seq: 1, at: 1 })
    expect(s.mic.getState().live).toEqual({})
  })

  it('a final live text clears itself after 4 s without a line', async () => {
    const s = await inCall()
    s.call.events!.onLive('m_sam', { text: 'Hi.', final: true })
    await vi.advanceTimersByTimeAsync(3900)
    expect(s.mic.getState().live.m_sam).toBeDefined()
    await vi.advanceTimersByTimeAsync(200)
    expect(s.mic.getState().live).toEqual({})
  })

  it('live text of someone who left is cleared', async () => {
    const s = await inCall()
    s.call.events!.onLive('m_sam', { text: 'So', final: false })
    s.call.events!.onParticipants([{ id: 'm_alex', name: 'Alex', speaking: false, muted: false }])
    expect(s.mic.getState().live).toEqual({})
  })

  it('mic restart resets the gate', async () => {
    const s = await inCall()
    s.last().serverSend({ type: 'turn.start' })
    for (let i = 0; i < 40; i++) s.call.emit(1600, 3277) // -20 dB for 4 s
    s.last().serverSend({ type: 'turn.end', transcript: 'Loud and clear.' })
    expect(s.mic.getState().debug.gateDb).toBeGreaterThan(-55)
    s.call.events!.onMicRestarted()
    expect(s.mic.getState().debug.gateDb).toBe(-55)
    expect(s.mic.getState().debug.speechDb).toBeNull()
  })

  it('needsTap mirrors the call and resume forwards', async () => {
    const s = await inCall()
    s.call.events!.onNeedsTap(true)
    expect(s.mic.getState().needsTap).toBe(true)
    await s.mic.resume()
    expect(s.call.resumed).toBe(1)
    s.call.events!.onNeedsTap(false)
    expect(s.mic.getState().needsTap).toBe(false)
  })

  it('remote speaking splits the open turn', async () => {
    const s = await inCall()
    s.setTime(1000)
    s.last().serverSend({ type: 'turn.start' })
    s.last().serverSend({ type: 'turn.update', transcript: 'So Kevin walks into the kitchen' })
    s.setTime(4000)
    s.call.events!.onRemoteSpeakingStarted('m_sam')
    await flush()
    s.setTime(7000)
    s.last().serverSend({ type: 'turn.end', transcript: 'So Kevin walks into the kitchen and eats the whole cake' })
    await flush()
    expect(s.lines.map((l) => [l.text, l.at])).toEqual([
      ['So Kevin walks into the kitchen', 1000],
      ['and eats the whole cake', 4000],
    ])
  })

  it('noteLine from someone else splits; my own line does not', async () => {
    const s = await inCall()
    const line = (speakerId: string) => ({ id: 'x', roomId: 'room1', speakerId, speakerName: '', text: 'Hm.', seq: 1, at: 1 })
    s.setTime(1000)
    s.last().serverSend({ type: 'turn.start' })
    s.last().serverSend({ type: 'turn.update', transcript: 'Wait so' })
    s.setTime(3000)
    s.mic.noteLine(line('m_alex'))
    await flush()
    expect(s.lines).toEqual([])
    s.mic.noteLine(line('m_sam'))
    await flush()
    expect(s.lines.map((l) => l.text)).toEqual(['Wait so'])
  })

  it('no split while muted', async () => {
    const s = await inCall({ endOnClose: null })
    s.last().serverSend({ type: 'turn.start' })
    s.last().serverSend({ type: 'turn.update', transcript: 'Wait so' })
    await s.mic.setMuted(true)
    s.lines.length = 0
    s.call.events!.onRemoteSpeakingStarted('m_sam')
    await flush()
    expect(s.lines).toEqual([])
  })

  it('a cut-off turn is sent and flagged', async () => {
    const s = await inCall()
    s.last().serverSend({ type: 'turn.start' })
    s.last().serverSend({ type: 'turn.update', transcript: 'So Kevin' })
    s.last().serverClose()
    await flush()
    expect(s.lines.map((l) => l.text)).toEqual(['So Kevin'])
    expect(s.mic.getState().error).toBe('The end of that may be missing.')
    expect(s.mic.getState().status).toBe('reconnecting')
  })
})
