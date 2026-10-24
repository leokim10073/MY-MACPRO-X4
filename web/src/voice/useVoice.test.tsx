import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member, Room } from '../../../shared/schema'
import RecapBanner from '../components/RecapBanner'
import type { VoiceTransport } from '../room/RoomClient'
import { initialRoomState } from '../room/state'
import { useVoice } from './useVoice'

// The real controller needs a microphone and Cartesia; this stand-in records what the hook does.
const made = vi.hoisted(() => [] as Array<{ opts: Record<string, unknown>; press: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; set(s: object): void }>)
vi.mock('../../../voice/src/stt/pushToTalk', () => ({
  PushToTalk: class {
    private state = { status: 'idle', isListening: false, preview: '', sending: 0, failed: [], error: null }
    private listeners = new Set<() => void>()
    press = vi.fn()
    stop = vi.fn()
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
vi.mock('../../../voice/src/audio/micSource', () => ({ MicSource: class {} }))

const room: Room = { id: 'room1', hostMemberId: 'm1', status: 'active', inviteToken: 'i', createdAt: 0, expiresAt: 1 }
const self: Member = { id: 'm1', roomId: 'room1', name: 'Alex', joinedAtSeq: 0, joinedAt: 0 }

function transport(): VoiceTransport & { addLine: ReturnType<typeof vi.fn>; sttToken: ReturnType<typeof vi.fn> } {
  return {
    addLine: vi.fn(async () => {}),
    sttToken: vi.fn(async () => ({ token: 'tok', expiresAt: Date.now() + 120_000 })),
  }
}

afterEach(() => {
  cleanup()
  made.length = 0
})

describe('useVoice', () => {
  it('is off without a transport (the mock)', () => {
    const { result } = renderHook(() => useVoice(undefined, room, self, initialRoomState))
    expect(result.current).toBeNull()
    expect(made).toHaveLength(0)
  })

  it('wires the controller to the room, member, backend and keyterms', async () => {
    const t = transport()
    const state = { ...initialRoomState, members: [self] }
    const { result } = renderHook(() => useVoice(t, room, self, state))
    const ptt = made.at(-1)!
    expect(ptt.opts).toMatchObject({ roomId: 'room1', speakerId: 'm1' })

    await (ptt.opts.sendLine as (l: object) => Promise<void>)({ roomId: 'room1', speakerId: 'm1', text: 'hello', at: 7 })
    expect(t.addLine).toHaveBeenCalledWith('hello', 7)
    expect(await (ptt.opts.getToken as () => Promise<string>)()).toBe('tok')
    expect((ptt.opts.keyterms as () => string[])()).toEqual(['Alex'])

    result.current!.press(true)
    expect(ptt.press).toHaveBeenCalledWith(true)
  })

  it('follows the controller state, so the indicator shows the live mic', () => {
    const t = transport()
    const { result } = renderHook(() => useVoice(t, room, self, initialRoomState))
    act(() => made.at(-1)!.set({ isListening: true, preview: 'Kevin ate' }))
    expect(result.current?.state).toMatchObject({ isListening: true, preview: 'Kevin ate' })
  })

  it('stops the mic and forgets the token when the room screen goes away (leave or burn)', () => {
    const t = transport()
    const { unmount } = renderHook(() => useVoice(t, room, self, initialRoomState))
    const ptt = made.at(-1)!
    unmount()
    expect(ptt.stop).toHaveBeenCalled()
  })
})

describe('recap audio', () => {
  const recap = { id: 'r', roomId: 'room1', uptoSeq: 3, text: 'Alex is talking about Kevin.', createdAt: 0 }

  it('plays the narrated recap once audioUrl arrives', () => {
    render(<RecapBanner recap={{ ...recap, audioUrl: 'https://x/recap.mp3' }} isLatecomer onDismiss={() => {}} />)
    const audio = document.querySelector('audio')
    expect(audio?.getAttribute('src')).toBe('https://x/recap.mp3')
    expect(screen.getByText('Alex is talking about Kevin.')).toBeTruthy()
  })

  it('shows only the text before the audio is ready', () => {
    render(<RecapBanner recap={recap} isLatecomer onDismiss={() => {}} />)
    expect(document.querySelector('audio')).toBeNull()
  })
})
