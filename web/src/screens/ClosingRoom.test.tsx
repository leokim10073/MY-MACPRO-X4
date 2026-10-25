import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Room, RoomEvent } from '../../../shared/schema'
import type { VoiceTransport } from '../room/RoomClient'
import { initialRoomState, roomReducer, type RoomState } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import * as useVoiceModule from '../voice/useVoice'
import RoomScreen from './RoomScreen'

type Closing = { phase: 'ignite' | 'burning' | 'settle' | 'done'; startedAt: number; seed: number }
const ignite: Closing = { phase: 'ignite', startedAt: 0, seed: 7 }

const room: Room = { id: 'r1', hostMemberId: 'm_taylor', status: 'active', inviteToken: 'demo', createdAt: 0, expiresAt: 1 }
const events = fixtureEvents()
const base = events.filter((e) => e.type !== 'recall').reduce(roomReducer, initialRoomState)
const recall = (id: string) =>
  events.find((e): e is Extract<RoomEvent, { type: 'recall' }> => e.type === 'recall' && e.recall.id === id)!
const withPopup = roomReducer(base, recall('r2'))

function view(state: RoomState, closing: Closing | null = null, extra: Partial<Parameters<typeof RoomScreen>[0]> = {}) {
  const self = state.members.find((m) => m.id === 'm_taylor')!
  return <RoomScreen state={state} self={self} room={room} onBurn={() => {}} onLeave={() => {}} closing={closing} {...extra} />
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('closing room', () => {
  it('closes talk and shows that the room ended', () => {
    render(view(base, ignite))
    const closed = screen.getByRole('button', { name: 'Room closed' }) as HTMLButtonElement
    expect(closed.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Hold to talk' })).toBeNull()
    expect(screen.getByText('Room ended.')).toBeTruthy()
  })

  it('keeps the ended status through every closing phase, and the room closed', () => {
    for (const phase of ['burning', 'settle'] as const) {
      const { unmount } = render(view(base, { ...ignite, phase }))
      expect(screen.getByText('Room ended.')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Room closed' })).toBeTruthy()
      unmount()
    }
  })

  it('attributes the ending: the host sees "You", others see the host\'s name', () => {
    const { unmount } = render(view(base, ignite))
    expect(screen.getByText('You ended the room.')).toBeTruthy()
    unmount()
    const guest = base.members.find((m) => m.id !== 'm_taylor')!
    const host = base.members.find((m) => m.id === 'm_taylor')!
    render(<RoomScreen state={base} self={guest} room={room} onBurn={() => {}} closing={ignite} />)
    expect(screen.getByText(`${host.name} ended the room.`)).toBeTruthy()
  })

  it('hides the pop-up when closing starts', () => {
    const { rerender } = render(view(withPopup))
    expect(screen.getByRole('region', { name: 'Mentioned again' })).toBeTruthy()
    rerender(view(withPopup, ignite))
    expect(screen.queryByRole('region', { name: 'Mentioned again' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cake' })).toBeNull()
  })

  it('hides an open story card when closing starts', () => {
    const { rerender } = render(view(withPopup))
    fireEvent.click(screen.getByRole('button', { name: 'Cake' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    rerender(view(withPopup, ignite))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cake' })).toBeNull()
  })

  it('closes the Leave confirmation when closing starts, and Leave still works after', () => {
    const { rerender } = render(view(base))
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    rerender(view(base, ignite))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('closes the burn sheet when closing starts', () => {
    const { rerender } = render(view(base))
    fireEvent.click(screen.getByRole('button', { name: 'Last Sip' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    rerender(view(base, ignite))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy()
  })

  it('hides the typed line and the replay button', () => {
    const props = { showTypeLine: true, onAddLine: async () => {}, showReplay: true, onStartReplay: async () => {} }
    const { rerender } = render(view(base, null, props))
    expect(screen.getByRole('button', { name: 'Start Kevin replay' })).toBeTruthy()
    rerender(view(base, ignite, props))
    expect(screen.queryByRole('button', { name: 'Start Kevin replay' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('stops the mic by giving useVoice no transport', () => {
    const spy = vi.spyOn(useVoiceModule, 'useVoice')
    const transport: VoiceTransport = { sttToken: async () => ({ token: 't', expiresAt: 1 }), addLine: async () => {} }
    const { rerender } = render(view(base, null, { voice: transport }))
    expect(spy.mock.calls.at(-1)![0]).toBe(transport)
    rerender(view(base, ignite, { voice: transport }))
    expect(spy.mock.calls.at(-1)![0]).toBeUndefined()
  })

  it('shows no speaking or Listening indicator while closing', () => {
    const live = { status: 'talking', isListening: true, preview: '', sending: 0, failed: [], error: null } as const
    vi.spyOn(useVoiceModule, 'useVoice').mockReturnValue({ state: live, press: () => {} })
    const { rerender } = render(view(base))
    rerender(view(base, ignite))
    expect(screen.queryByText("You're speaking.")).toBeNull()
    expect(screen.queryByText('Listening')).toBeNull()
    expect(document.querySelector('.listening-dot')).toBeNull()
  })

  it('highlights no speaker while closing', () => {
    const { rerender } = render(view(base, null, { speaking: { speakerId: 'm_taylor' } }))
    expect(screen.getByLabelText(/, speaking$/)).toBeTruthy()
    rerender(view(base, ignite, { speaking: { speakerId: 'm_taylor' } }))
    expect(screen.queryByLabelText(/, speaking$/)).toBeNull()
  })

  it('hides the recap banner while closing', () => {
    const { container, rerender } = render(view(base))
    expect(container.querySelector('.recap-banner')).toBeTruthy()
    rerender(view(base, ignite))
    expect(container.querySelector('.recap-banner')).toBeNull()
  })

  it('keeps the closing live region mounted and fills it once closing starts', () => {
    const { container, rerender } = render(view(base))
    const region = container.querySelector('.lsc-closing-status')!
    expect(region.getAttribute('role')).toBe('status')
    expect(region.textContent).toBe('')
    rerender(view(base, ignite))
    expect(container.querySelector('.lsc-closing-status')).toBe(region)
    expect(region.textContent).toContain('Room ended.')
    rerender(view(base, { ...ignite, phase: 'burning' }))
    expect(region.textContent).toContain('Room ended.')
  })

  it('draws the cup over the board only while closing', () => {
    const { container, rerender } = render(view(base))
    expect(container.querySelector('.room-board .lsc-closing')).toBeNull()
    rerender(view(base, ignite))
    expect(container.querySelector('.room-board .lsc-closing')).toBeTruthy()
    expect(container.querySelector('.room-board.is-closing')).toBeTruthy()
  })

  it('keeps the header and banner outside the board, and the transcript and pop-up slot inside', () => {
    const { container } = render(view(withPopup, null, { connection: 'reconnecting' }))
    const board = container.querySelector('.room-board')!
    expect(board).toBeTruthy()
    expect(board.contains(container.querySelector('.room-header'))).toBe(false)
    const banner = container.querySelector('.connection-banner')
    expect(banner).toBeTruthy()
    expect(board.contains(banner)).toBe(false)
    expect(board.contains(container.querySelector('.room-transcript'))).toBe(true)
    expect(board.contains(container.querySelector('.room-popup-slot'))).toBe(true)
    expect(board.contains(container.querySelector('.room-banner'))).toBe(true)
  })
})
