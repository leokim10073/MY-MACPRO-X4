import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Room } from '../../../shared/schema'
import { initialRoomState, roomReducer } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import RoomScreen from '../screens/RoomScreen'

const room: Room = {
  id: 'r1',
  hostMemberId: 'm_host',
  status: 'active',
  inviteToken: 'demo',
  createdAt: 0,
  expiresAt: 1,
}

function setup() {
  const full = fixtureEvents().reduce(roomReducer, initialRoomState)
  // Only the cake-focused recall (r2), so the focus is deterministic.
  const state = { ...full, recalls: full.recalls.filter((r) => r.id === 'r2') }
  const self = state.members.find((m) => m.id === 'm_taylor')!
  return render(<RoomScreen state={state} self={self} room={room} onBurn={() => {}} />)
}

afterEach(cleanup)

describe('RecallPopup', () => {
  it('shows Kevin with three chips and marks the focused one', () => {
    setup()
    const popup = screen.getByRole('region', { name: 'Mentioned again' })
    expect(popup.textContent).toContain('Kevin')
    const names = ['Cake', 'Airport', 'Landlord']
    for (const n of names) expect(within(popup, n)).toBeTruthy()
    const cake = within(popup, 'Cake')
    expect(cake.getAttribute('aria-current')).toBe('true')
    expect(within(popup, 'Airport').getAttribute('aria-current')).toBeNull()
  })

  it('opens the card on chip tap while push-to-talk stays pressed', () => {
    setup()
    const ptt = screen.getByRole('button', { name: 'Hold to talk' })
    fireEvent.pointerDown(ptt, { pointerId: 1 })
    expect(ptt.getAttribute('aria-pressed')).toBe('true')
    const popup = screen.getByRole('region', { name: 'Mentioned again' })
    fireEvent.click(within(popup, 'Cake'))
    expect(screen.getByRole('dialog', { name: 'Cake' })).toBeTruthy()
    expect(ptt.getAttribute('aria-pressed')).toBe('true')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the pop-up in its own container above the push-to-talk container', () => {
    const { container } = setup()
    const popup = screen.getByRole('region', { name: 'Mentioned again' })
    const slot = container.querySelector('.room-popup-slot')!
    const talk = container.querySelector('.room-talk')!
    expect(slot.contains(popup)).toBe(true)
    expect(talk.contains(popup)).toBe(false)
    expect(slot.parentElement).toBe(container.querySelector('.room-board'))
    expect(slot.compareDocumentPosition(talk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders the story card in the board, above and outside push-to-talk', () => {
    const { container } = setup()
    fireEvent.click(within(screen.getByRole('region', { name: 'Mentioned again' }), 'Cake'))
    const dialog = screen.getByRole('dialog', { name: 'Cake' })
    const board = container.querySelector('.room-board')!
    const talk = container.querySelector('.room-talk')!
    expect(board.contains(dialog)).toBe(true)
    expect(talk.contains(dialog)).toBe(false)
    expect(dialog.compareDocumentPosition(talk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

function within(root: HTMLElement, name: string): HTMLElement {
  const el = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === name)
  if (!el) throw new Error(`no button ${name}`)
  return el as HTMLElement
}
