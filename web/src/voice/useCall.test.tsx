import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member, Room, RoomEvent, TranscriptLine } from '../../../shared/schema'
import RecapBanner from '../components/RecapBanner'
import type { VoiceTransport } from '../room/RoomClient'
import { initialRoomState, roomReducer, type RoomState } from '../room/state'
import RoomScreen from '../screens/RoomScreen'
import { useCall } from './useCall'

// The real OpenMic needs LiveKit, a microphone and Cartesia; this stand-in records what the app does.
const made = vi.hoisted(
  () =>
    [] as Array<{
      opts: Record<string, unknown>
      join: ReturnType<typeof vi.fn>
      leave: ReturnType<typeof vi.fn>
      setMuted: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      duck: ReturnType<typeof vi.fn>
      noteLine: ReturnType<typeof vi.fn>
      set(s: object): void
    }>,
)
vi.mock('../../../voice/src/stt/openMic', () => ({
  OpenMic: class {
    private state = {
      status: 'idle',
      muted: false,
      isListening: false,
      participants: [],
      preview: '',
      live: {},
      noiseFilter: null,
      needsTap: false,
      sending: 0,
      failed: [],
      error: null,
      debug: { gateDb: 0, speechDb: null, levelDb: 0, inkConnects: 0 },
    }
    private listeners = new Set<() => void>()
    join = vi.fn(async () => {})
    leave = vi.fn(async () => {})
    setMuted = vi.fn(async () => {})
    stop = vi.fn()
    resume = vi.fn(async () => {})
    duck = vi.fn()
    noteLine = vi.fn()
    constructor(public opts: Record<string, unknown>) {
      made.push(this as never)
    }
    subscribe = (l: () => void) => {
      this.listeners.add(l)
      return () => this.listeners.delete(l)
    }
    getState = () => this.state
    set(s: object) {
      this.state = { ...this.state, ...s }
      this.listeners.forEach((l) => l())
    }
  },
}))
vi.mock('../../../voice/src/audio/micSource', () => ({
  MicSource: class {
    start = async () => {}
    stop() {}
    onFrame = () => () => {}
    preroll = () => new Int16Array(0)
  },
}))

const room: Room = { id: 'room1', hostMemberId: 'm1', status: 'active', inviteToken: 'i', createdAt: 0, expiresAt: 1 }
const alex: Member = { id: 'm1', roomId: 'room1', name: 'Alex', joinedAtSeq: 0, joinedAt: 0 }
const sam: Member = { id: 'm2', roomId: 'room1', name: 'Sam', joinedAtSeq: 0, joinedAt: 0 }
const line = (seq: number, speaker = sam): TranscriptLine => ({
  id: `l${seq}`,
  roomId: 'room1',
  speakerId: speaker.id,
  speakerName: speaker.name,
  text: `line ${seq}`,
  seq,
  at: seq,
})
const stateWith = (...events: RoomEvent[]): RoomState => events.reduce(roomReducer, initialRoomState)
const base = stateWith({ type: 'member_joined', member: alex }, { type: 'member_joined', member: sam })

function transport(withCall = true) {
  return {
    addLine: vi.fn(async () => {}),
    sttToken: vi.fn(async () => ({ token: 'stt', expiresAt: Date.now() + 120_000 })),
    ...(withCall ? { callToken: vi.fn(async () => ({ url: 'wss://x', token: 'call' })) } : {}),
  } satisfies VoiceTransport
}

afterEach(() => {
  cleanup()
  made.length = 0
})

describe('useCall', () => {
  it('is off when the backend offers no call', () => {
    const t = transport(false)
    const { result } = renderHook(() => useCall(t, room, alex, base))
    expect(result.current).toBeNull()
    expect(made).toHaveLength(0)
  })

  it('wires the call to the room, member, backend and keyterms', async () => {
    const t = transport()
    renderHook(() => useCall(t, room, alex, base))
    const mic = made.at(-1)!
    expect(mic.opts).toMatchObject({ roomId: 'room1', speakerId: 'm1' })
    expect(await (mic.opts.getCallToken as () => Promise<unknown>)()).toEqual({ url: 'wss://x', token: 'call' })
    expect(await (mic.opts.getSttToken as () => Promise<string>)()).toBe('stt')
    await (mic.opts.sendLine as (l: object) => Promise<void>)({ roomId: 'room1', speakerId: 'm1', text: 'hi', at: 7 })
    expect(t.addLine).toHaveBeenCalledWith('hi', 7)
    expect((mic.opts.keyterms as () => string[])()).toEqual(['Alex', 'Sam'])
  })

  it('passes only lines that arrive after it started to noteLine', () => {
    const t = transport()
    const { rerender } = renderHook(({ s }) => useCall(t, room, alex, s), {
      initialProps: { s: stateWith({ type: 'line_added', line: line(1) }) },
    })
    const mic = made.at(-1)!
    expect(mic.noteLine).not.toHaveBeenCalled()
    rerender({ s: stateWith({ type: 'line_added', line: line(1) }, { type: 'line_added', line: line(2) }) })
    expect(mic.noteLine.mock.calls.map((c) => (c[0] as TranscriptLine).seq)).toEqual([2])
  })

  it('stops the call when the room screen goes away (leave or burn)', () => {
    const t = transport()
    const { unmount } = renderHook(() => useCall(t, room, alex, base))
    const mic = made.at(-1)!
    unmount()
    expect(mic.stop).toHaveBeenCalled()
  })
})

describe('the call on the room screen', () => {
  const t = transport()
  const roomScreen = (state = base) => <RoomScreen state={state} self={alex} room={room} onBurn={() => {}} voice={t} />

  it('offers Join call by default, with the privacy note and a switch to push-to-talk', () => {
    render(roomScreen())
    expect(screen.getByRole('button', { name: 'Join call' })).toBeTruthy()
    expect(document.body.textContent).toContain('Nothing is recorded')
    expect(screen.getByRole('button', { name: 'Use push-to-talk instead' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Hold to talk' })).toBeNull()
  })

  it('joins from the tap, then shows who is in the call, mute and leave', () => {
    render(roomScreen())
    fireEvent.click(screen.getByRole('button', { name: 'Join call' }))
    const mic = made.at(-1)!
    expect(mic.join).toHaveBeenCalledTimes(1)

    act(() =>
      mic.set({
        status: 'in_call',
        participants: [
          { id: 'm1', name: 'Alex', speaking: false, muted: false },
          { id: 'm2', name: 'Sam', speaking: true, muted: false },
        ],
      }),
    )
    const people = screen.getByRole('list', { name: 'In the call' })
    expect(people.textContent).toContain('You')
    expect(people.textContent).toContain('Sam')
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(mic.setMuted).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'Leave call' }))
    expect(mic.leave).toHaveBeenCalled()
  })

  it("shows friends' words while they speak, but not my own as a transcript line", () => {
    const { container } = render(roomScreen())
    const mic = made.at(-1)!
    act(() =>
      mic.set({
        status: 'in_call',
        live: { m2: { text: 'so Kevin ate the', final: false }, m1: { text: 'me talking', final: false } },
        preview: 'me talking',
      }),
    )
    const live = container.querySelectorAll('.line-live')
    expect(live).toHaveLength(1)
    expect(live[0].textContent).toContain('Sam')
    expect(live[0].textContent).toContain('so Kevin ate the')
    expect(container.querySelector('.talk-preview')?.textContent).toBe('me talking')
  })

  it('switching to push-to-talk leaves the call, and switching back offers the call again', () => {
    render(roomScreen())
    const mic = made.at(-1)!
    fireEvent.click(screen.getByRole('button', { name: 'Use push-to-talk instead' }))
    expect(mic.leave).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Hold to talk' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use the voice call instead' }))
    expect(screen.getByRole('button', { name: 'Join call' })).toBeTruthy()
  })

  it('without a call (the mock), only push-to-talk is shown', () => {
    render(<RoomScreen state={base} self={alex} room={room} onBurn={() => {}} />)
    expect(screen.getByRole('button', { name: 'Hold to talk' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Join call' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Use the voice call instead' })).toBeNull()
  })
})

describe('recap and the call', () => {
  it("reports when the narrated recap plays and stops, so the call can lower friends' voices", () => {
    const onPlayingChange = vi.fn()
    const recap = { id: 'r', roomId: 'room1', uptoSeq: 3, text: 'Catch-up.', createdAt: 0, audioUrl: 'https://x/a.mp3' }
    render(<RecapBanner recap={recap} isLatecomer onDismiss={() => {}} onPlayingChange={onPlayingChange} />)
    const audio = document.querySelector('audio')!
    fireEvent.play(audio)
    fireEvent.ended(audio)
    expect(onPlayingChange.mock.calls).toEqual([[true], [false]])
  })
})
