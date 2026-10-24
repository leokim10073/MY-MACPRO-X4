import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallEvents } from './callSession'

// CallSession against fakes of LiveKit, Krisp and the browser, for the join and leave races.

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

class FakeTrack {
  readyState: 'live' | 'ended' = 'live'
  clones: FakeTrack[] = []
  private listeners = new Map<string, () => void>()
  stop = vi.fn(() => {
    this.readyState = 'ended'
  })
  clone() {
    const c = new FakeTrack()
    this.clones.push(c)
    return c
  }
  addEventListener(type: string, l: () => void) {
    this.listeners.set(type, l)
  }
  removeEventListener(type: string) {
    this.listeners.delete(type)
  }
  fire(type: string) {
    this.listeners.get(type)?.()
  }
}

const h = vi.hoisted(() => ({
  connect: null as null | (() => Promise<void>),
  replaceTrack: null as null | (() => Promise<void>),
  published: [] as unknown[],
  tracks: [] as { mediaStreamTrack: unknown }[],
  processor: { destroy: () => Promise.resolve(), processedTrack: null as unknown },
}))

vi.mock('livekit-client', () => {
  class LocalAudioTrack {
    processor: unknown = null
    constructor(public mediaStreamTrack: { stop(): void }) {
      h.tracks.push(this)
    }
    async setProcessor(p: unknown) {
      this.processor = p
    }
    getProcessor() {
      return this.processor
    }
    stop() {
      this.mediaStreamTrack.stop()
    }
    async replaceTrack(t: { stop(): void }) {
      await h.replaceTrack?.()
      this.mediaStreamTrack = t
    }
  }
  class Room {
    remoteParticipants = new Map()
    canPlaybackAudio = true
    localParticipant = {
      identity: 'm_alex',
      isSpeaking: false,
      isMicrophoneEnabled: true,
      publishTrack: async (t: unknown) => void h.published.push(t),
    }
    on() {}
    connect() {
      return h.connect ? h.connect() : Promise.resolve()
    }
    async disconnect() {}
    async startAudio() {}
  }
  const RoomEvent = new Proxy({}, { get: (_t, k) => String(k) })
  return { LocalAudioTrack, Room, RoomEvent, Track: { Source: { Microphone: 'mic' }, Kind: { Audio: 'audio' } } }
})

vi.mock('./noiseFilter', () => ({
  loadNoiseFilter: async () => ({ kind: 'krisp', processor: h.processor }),
}))

vi.mock('../audio/trackSource', () => ({
  TrackSource: class {
    onFrame() {}
    async attach() {}
    detach() {}
  },
}))

const { CallSession } = await import('./callSession')

let gum: ReturnType<typeof deferred<{ getAudioTracks(): FakeTrack[] }>>
let mics: FakeTrack[]
const events: CallEvents = {
  onParticipants() {},
  onRemoteSpeakingStarted() {},
  onReconnecting() {},
  onDropped() {},
  onMicRestarted() {},
  onNeedsTap() {},
  onLive() {},
}
const token = { url: 'wss://lk', token: 'jwt' }
const flush = () => new Promise((r) => setTimeout(r, 0))

/** The next getUserMedia answers when `answer()` is called. */
function nextMic(auto = true) {
  gum = deferred()
  const mic = new FakeTrack()
  mics.push(mic)
  const answer = () => gum.resolve({ getAudioTracks: () => [mic] })
  if (auto) answer()
  return { mic, answer }
}

beforeEach(() => {
  mics = []
  h.connect = h.replaceTrack = null
  h.published = []
  h.tracks = []
  h.processor = { destroy: vi.fn(() => Promise.resolve()), processedTrack: new FakeTrack() }
  const el = () => ({ hidden: false, append() {}, replaceChildren() {}, remove() {} })
  vi.stubGlobal('document', {
    createElement: el,
    body: { append() {} },
    addEventListener() {},
    removeEventListener() {},
    visibilityState: 'visible',
  })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => gum.promise } })
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running'
      async resume() {}
      async close() {}
    },
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('CallSession join and leave', () => {
  it('a token failure before mic permission still stops the mic', async () => {
    const { mic, answer } = nextMic(false)
    const call = new CallSession()
    const joined = call.join(Promise.reject(new Error('Call token failed (500)')), events)
    joined.catch(() => {})
    await flush()
    answer() // the user taps Allow after the token already failed
    await expect(joined).rejects.toThrow('Call token failed (500)')
    expect(mic.stop).toHaveBeenCalled()
    expect(h.processor.destroy).toHaveBeenCalled()
  })

  it('leave during connect ends the join and publishes nothing', async () => {
    const { mic } = nextMic()
    const connected = deferred<void>()
    h.connect = () => connected.promise
    const call = new CallSession()
    const joined = call.join(Promise.resolve(token), events)
    joined.catch(() => {})
    await flush()
    await call.leave()
    connected.resolve()
    await expect(joined).rejects.toThrow()
    expect(h.published).toEqual([])
    expect(mic.stop).toHaveBeenCalled()
    for (const c of mic.clones) expect(c.stop).toHaveBeenCalled()
  })

  it('leave during a mic swap stops the new mic', async () => {
    nextMic()
    const call = new CallSession()
    await call.join(Promise.resolve(token), events)
    const first = mics[0]
    const { mic: second } = nextMic()
    const swapped = deferred<void>()
    h.replaceTrack = () => swapped.promise
    first.readyState = 'ended'
    first.fire('ended')
    await flush()
    await call.leave()
    swapped.resolve()
    await flush()
    expect(second.stop).toHaveBeenCalled()
    for (const c of second.clones) expect(c.stop).toHaveBeenCalled()
  })
})
