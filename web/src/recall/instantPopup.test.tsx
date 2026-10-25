import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member, Recall, Room, RoomEvent } from '../../../shared/schema'
import type { VoiceTransport } from '../room/RoomClient'
import { initialRoomState, roomReducer, type RoomState } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import RoomScreen from '../screens/RoomScreen'

// Stand-in for voice/'s OpenMic: the test sets the call state, including friends' live text.
const made = vi.hoisted(() => [] as Array<{ set(s: object): void }>)
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
    constructor() {
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

const room: Room = { id: 'demo', hostMemberId: 'm_alex', status: 'active', inviteToken: 'i', createdAt: 0, expiresAt: 1 }
// The Kevin room up to line 16 (when Taylor joins), with the AI's people and stories but no recalls yet.
const upTo16: RoomState = fixtureEvents()
  .filter((e: RoomEvent) => e.type !== 'recall' && e.type !== 'recap_ready')
  .filter((e) => !(e.type === 'line_added' && e.line.seq > 16))
  .reduce(roomReducer, initialRoomState)
const member = (id: string): Member => upTo16.members.find((m) => m.id === id)!
const transport: VoiceTransport = {
  addLine: async () => {},
  sttToken: async () => ({ token: 'stt', expiresAt: Date.now() + 120_000 }),
  callToken: async () => ({ url: 'wss://x', token: 'call' }),
}

function inCallSaying(text: string) {
  act(() =>
    made.at(-1)!.set({
      status: 'in_call',
      participants: [{ id: 'm_sam', name: 'Sam', speaking: true, muted: false }],
      live: { m_sam: { text, final: false } },
    }),
  )
}
const popupText = () => screen.queryByRole('region', { name: 'Mentioned again' })?.textContent ?? null

afterEach(() => {
  cleanup()
  made.length = 0
})

describe('instant pop-ups from live text', () => {
  it('a latecomer sees the pop-up while the friend is still mid-sentence', () => {
    render(<RoomScreen state={upTo16} self={member('m_taylor')} room={room} onBurn={() => {}} voice={transport} />)
    expect(popupText()).toBeNull()
    inCallSaying('honestly after the cake thing Kevin is')
    expect(popupText()).toContain('Kevin')
    expect(popupText()).toContain('Cake')
    // No line has arrived yet: this came from the live words alone.
    expect(upTo16.lines.at(-1)!.seq).toBe(16)
  })

  it('someone who heard the stories gets nothing', () => {
    render(<RoomScreen state={upTo16} self={member('m_alex')} room={room} onBurn={() => {}} voice={transport} />)
    inCallSaying('Kevin is lucky anyone talks to him')
    expect(popupText()).toBeNull()
  })

  it("the AI's recall for the same person updates the pop-up instead of adding a second", () => {
    const { rerender } = render(
      <RoomScreen state={upTo16} self={member('m_taylor')} room={room} onBurn={() => {}} voice={transport} />,
    )
    inCallSaying('so Kevin')
    expect(screen.getAllByRole('region', { name: 'Mentioned again' })).toHaveLength(1)

    const aiRecall: Recall = {
      id: 'r_ai',
      roomId: 'demo',
      lineId: 'l17',
      seq: 17,
      personId: 'p_kevin',
      storyIds: ['s_cake', 's_airport', 's_landlord'],
      focusStoryId: 's_airport',
      matchedText: 'the wrong restaurant',
      confidence: 0.9,
    }
    rerender(
      <RoomScreen
        state={roomReducer(upTo16, { type: 'recall', recall: aiRecall })}
        self={member('m_taylor')}
        room={room}
        onBurn={() => {}}
        voice={transport}
      />,
    )
    expect(screen.getAllByRole('region', { name: 'Mentioned again' })).toHaveLength(1)
    const current = screen
      .getByRole('region', { name: 'Mentioned again' })
      .querySelector('[aria-current="true"]')?.textContent
    expect(current).toBe('Airport')
  })

  it('nothing happens outside the call (push-to-talk shares no live text)', () => {
    render(<RoomScreen state={upTo16} self={member('m_taylor')} room={room} onBurn={() => {}} voice={transport} />)
    act(() => made.at(-1)!.set({ status: 'left', live: { m_sam: { text: 'Kevin', final: false } } }))
    expect(popupText()).toBeNull()
  })
})
