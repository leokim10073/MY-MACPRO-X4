import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recall, Room, RoomEvent } from '../../../shared/schema'
import { SPEAKING_HOLD_MS } from '../room/speaking'
import { initialRoomState, roomReducer, type RoomState } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import RoomScreen from './RoomScreen'

const room: Room = { id: 'r1', hostMemberId: 'm_host', status: 'active', inviteToken: 'demo', createdAt: 0, expiresAt: 1 }

// Everything up to line 20, so line 21 can arrive live in a test.
const events = fixtureEvents()
const upTo20 = events.filter((e) => !(e.type === 'line_added' && e.line.seq === 21))
const line21 = events.find((e): e is Extract<RoomEvent, { type: 'line_added' }> => e.type === 'line_added' && e.line.seq === 21)!

function stateFrom(list: RoomEvent[], recalls?: Recall[]): RoomState {
  const s = list.filter((e) => e.type !== 'recall').reduce(roomReducer, initialRoomState)
  return recalls ? recalls.reduce((acc, r) => roomReducer(acc, { type: 'recall', recall: r }), s) : s
}

function screenFor(state: RoomState) {
  const self = state.members.find((m) => m.id === 'm_taylor')!
  return <RoomScreen state={state} self={self} room={room} onBurn={() => {}} />
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('room stage on the room screen', () => {
  it('sits in its own row between the recap and the transcript, never in the dock or banner', () => {
    const { container } = render(screenFor(stateFrom(events)))
    const stage = container.querySelector('.room-stage')!
    expect(stage).toBeTruthy()
    expect(stage.closest('.room-dock')).toBeNull()
    expect(stage.closest('.room-banner')).toBeNull()
    const board = container.querySelector('.room-board')!
    const order = Array.from(board.children).map((el) => el.className.split(' ')[0])
    expect(order.indexOf('room-banner')).toBeLessThan(order.indexOf('room-stage'))
    expect(order.indexOf('room-stage')).toBeLessThan(order.indexOf('room-transcript'))
    expect(order.indexOf('room-transcript')).toBeLessThan(order.indexOf('room-popup-slot'))
    const top = Array.from(container.querySelector('.room')!.children).map((el) => el.className.split(' ')[0])
    expect(top.indexOf('room-board')).toBeLessThan(top.indexOf('room-dock'))
  })

  it('shows my name and how many people are in the room', () => {
    const state = stateFrom(events)
    render(screenFor(state))
    expect(screen.getByText(/You're/).textContent).toBe("You're Taylor")
    expect(screen.getByText(`${state.members.length} in the room`)).toBeTruthy()
    expect(screen.getByLabelText('Taylor, you')).toBeTruthy()
  })

  it('highlights whoever said a new line, for the hold time', () => {
    const { rerender } = render(screenFor(stateFrom(upTo20)))
    expect(screen.queryByLabelText(/, speaking$/)).toBeNull()
    rerender(screenFor(stateFrom([...upTo20, line21])))
    expect(screen.getByLabelText('Taylor, you, speaking')).toBeTruthy()
    act(() => vi.advanceTimersByTime(SPEAKING_HOLD_MS))
    expect(screen.queryByLabelText(/, speaking$/)).toBeNull()
    expect(screen.getByTestId('stage-speaker').textContent).toContain('last spoke')
  })

  it('goes compact while a story card is open, and the card stays above hold-to-talk', () => {
    const state = stateFrom(events)
    const { container, rerender } = render(screenFor(state))
    const r2 = events.find((e): e is Extract<RoomEvent, { type: 'recall' }> => e.type === 'recall' && e.recall.id === 'r2')!
    rerender(screenFor(roomReducer(state, r2)))
    expect(container.querySelector('.room-stage')!.className).not.toContain('compact')
    fireEvent.click(screen.getByRole('button', { name: 'Cake' }))
    expect(container.querySelector('.room-stage')!.className).toContain('compact')
    const board = container.querySelector('.room-board')!
    const dock = container.querySelector('.room-dock')!
    expect(board.querySelector('[role="dialog"]')).toBeTruthy()
    expect(dock.querySelector('.room-talk')!.textContent).toContain('Hold to talk')
  })
})
