import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Room } from '../../../shared/schema'
import { initialRoomState, roomReducer, type RoomState } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import RoomScreen from '../screens/RoomScreen'
import { stubReactFlowLayout } from './flowTestStubs'

stubReactFlowLayout()

const room: Room = { id: 'r1', hostMemberId: 'm_host', status: 'active', inviteToken: 'demo', createdAt: 0, expiresAt: 1 }
const base = fixtureEvents().reduce(roomReducer, initialRoomState)
// The Kevin fixture only has Kevin; give the Cake story a second person so there's a pair to draw.
const state: RoomState = {
  ...base,
  storyState: {
    ...base.storyState!,
    people: [...base.storyState!.people, { id: 'p_sam', roomId: 'demo', name: 'Sam', aliases: [], storyIds: [] }],
    stories: base.storyState!.stories.map((s) => (s.keyword === 'Cake' ? { ...s, personIds: ['p_kevin', 'p_sam'] } : s)),
  },
}
const self = state.members.find((m) => m.id === 'm_taylor')!

function screenAt(search: string, s: RoomState = state) {
  window.history.replaceState(null, '', `/${search}`)
  return render(<RoomScreen state={s} self={self} room={room} onBurn={() => {}} />)
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('relationship map in the room', () => {
  it('without ?view= the room is exactly the list it was: no switch, no map', () => {
    const { container } = screenAt('?client=convex&room=abc')
    expect(screen.queryByRole('group', { name: 'Show stories as' })).toBeNull()
    expect(container.querySelector('.react-flow')).toBeNull()
    expect(screen.getByRole('list', { name: 'People and their stories' })).toBeTruthy()
  })

  it('?view=list shows the switch with List pressed; Map swaps in the map and keeps the stage and NOW line', async () => {
    const { container } = screenAt('?room=abc&view=list')
    const toggle = screen.getByRole('group', { name: 'Show stories as' })
    expect(within(toggle).getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(toggle).getByRole('button', { name: 'Map' }).getAttribute('aria-pressed')).toBe('false')
    await act(async () => fireEvent.click(within(toggle).getByRole('button', { name: 'Map' })))
    expect(new URLSearchParams(window.location.search).get('view')).toBe('map')
    expect(new URLSearchParams(window.location.search).get('room')).toBe('abc')
    expect(screen.queryByRole('list', { name: 'People and their stories' })).toBeNull()
    expect(container.querySelector('.react-flow')).toBeTruthy()
    expect(screen.getByRole('region', { name: "Who's here" })).toBeTruthy()
    expect(container.querySelector('.recall-board-now')!.textContent).toContain(state.storyState!.currentTopic)
  })

  it('clicking a person opens their profile in the sheet; closing drops ?sel=', async () => {
    screenAt('?room=abc&view=map')
    await act(async () => {})
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sam, 1 story' })))
    expect(new URLSearchParams(window.location.search).get('sel')).toBe('node:p_sam')
    expect(screen.getByRole('dialog', { name: 'Sam' })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Close details' })))
    // Opened here, so closing steps Back over the entry it pushed.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sam' })).toBeNull())
    expect(window.location.search).toBe('?room=abc&view=map')
  })

  it('picking the open person again closes; a different pick swaps in place; others dim', async () => {
    screenAt('?room=abc&view=map')
    await act(async () => {})
    const sam = () => screen.getByRole('button', { name: 'Sam, 1 story' })
    await act(async () => fireEvent.click(sam()))
    expect(document.querySelector('[data-id="p_sam"] .graph-node')!.className).toContain('is-selected')
    expect(document.querySelector('[data-id="p_kevin"] .graph-node')!.className).not.toContain('is-dimmed')
    const depth = window.history.length
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Kevin, 3 stories' })))
    expect(window.history.length).toBe(depth)
    expect(screen.getByRole('dialog', { name: 'Kevin' })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Kevin, 3 stories' })))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(new URLSearchParams(window.location.search).get('sel')).toBeNull()
  })

  it('Escape closes the sheet and focus goes back to the person on the map', async () => {
    screenAt('?room=abc&view=map&sel=node%3Ap_sam')
    await act(async () => {})
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Sam' }))
    await act(async () => fireEvent.keyDown(screen.getByRole('dialog', { name: 'Sam' }), { key: 'Escape' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sam, 1 story' }))
  })

  it('a shared ?sel= link opens the pair, even in the list', () => {
    screenAt('?room=abc&view=list&sel=edge%3Ap_kevin~p_sam')
    expect(screen.getByRole('dialog', { name: 'Kevin & Sam' })).toBeTruthy()
  })

  it('one person is not a map: the empty state goes back to the list', async () => {
    screenAt('?room=abc&view=map', base)
    expect(screen.getByText('Not enough people for a map yet')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Show the list' })))
    expect(screen.getByRole('list', { name: 'People and their stories' })).toBeTruthy()
  })

  it('hides the sheet while the room is closing', () => {
    window.history.replaceState(null, '', '/?sel=node%3Ap_sam')
    render(<RoomScreen state={state} self={self} room={room} onBurn={() => {}} closing={{ phase: 'ignite', startedAt: 0, seed: 1 }} />)
    expect(screen.queryByRole('dialog', { name: 'Sam' })).toBeNull()
  })
})
