import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Room } from '../../../shared/schema'
import { initialRoomState, roomReducer } from '../room/state'
import { fixtureEvents } from '../room/testFixtures'
import RoomScreen from './RoomScreen'

const room: Room = {
  id: 'r1',
  hostMemberId: 'm_host',
  status: 'active',
  inviteToken: 'demo',
  createdAt: 0,
  expiresAt: 1,
}

function setup() {
  const state = fixtureEvents().reduce(roomReducer, initialRoomState)
  const self = state.members.find((m) => m.id === 'm_taylor')!
  return render(<RoomScreen state={state} self={self} room={room} onBurn={() => {}} />)
}

afterEach(cleanup)

describe('RoomScreen', () => {
  it('shows the recall board instead of a transcript: people, their stories in short, and what is on now', () => {
    setup()
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    const board = screen.getByRole('list', { name: 'People and their stories' })
    expect(board.textContent).toContain('Kevin')
    for (const s of state.storyState!.stories) {
      expect(within(board).getByRole('button', { name: new RegExp(s.keyword) })).toBeTruthy()
      expect(board.textContent).toContain(s.summary)
    }
    expect(document.body.textContent).toContain(state.storyState!.currentTopic)
    // No transcript: an early line isn't listed anywhere.
    expect(screen.queryByText(state.lines[0].text, { exact: false })).toBeNull()
  })

  it('everyone sees the board; a latecomer also sees which stories came before they joined', () => {
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    const { container, unmount } = setup()
    expect(container.querySelectorAll('.recall-story-missed').length).toBe(3)
    unmount()
    const alex = state.members.find((m) => m.id === 'm_alex')!
    const early = render(<RoomScreen state={state} self={alex} room={room} onBurn={() => {}} />)
    expect(screen.getByRole('list', { name: 'People and their stories' }).textContent).toContain('Kevin')
    expect(early.container.querySelectorAll('.recall-story-missed').length).toBe(0)
  })

  it('opens a story card from the board, and the board is still there after closing it', () => {
    setup()
    const board = screen.getByRole('list', { name: 'People and their stories' })
    fireEvent.click(within(board).getByRole('button', { name: /^Airport/ }))
    expect(document.querySelector('.story-card')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(document.querySelector('.story-card')).toBeNull()
    expect(screen.getByRole('list', { name: 'People and their stories' })).toBeTruthy()
  })

  it('story summaries on the board end with the summary itself, no "With ..." line', () => {
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    // A story about two people would have added "With <other>." before.
    const story = { ...state.storyState!.stories[0], personIds: ['p_kevin', 'p_kevin_work'] }
    const twoPeople = {
      ...state,
      storyState: {
        ...state.storyState!,
        people: [
          ...state.storyState!.people,
          { id: 'p_kevin_work', roomId: 'demo', name: 'Work Kevin', aliases: [], storyIds: [story.id] },
        ],
        stories: [story, ...state.storyState!.stories.slice(1)],
      },
    }
    const taylor = state.members.find((m) => m.id === 'm_taylor')!
    render(<RoomScreen state={twoPeople} self={taylor} room={room} onBurn={() => {}} />)
    const board = screen.getByRole('list', { name: 'People and their stories' })
    expect(board.textContent).not.toMatch(/With /)
    expect(board.textContent).toContain(story.summary)
  })

  it('each story on the board says it opens the details', () => {
    setup()
    const board = screen.getByRole('list', { name: 'People and their stories' })
    const stories = within(board).getAllByRole('button')
    expect(stories.length).toBe(3)
    for (const s of stories) expect(s.textContent).toContain('Details')
  })

  it('puts Copy invite next to Leave in the header, for the host only', () => {
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    const hostRoom = { ...room, hostMemberId: 'm_alex' }
    const alex = state.members.find((m) => m.id === 'm_alex')!
    const url = 'https://spill-the-tea-call.vercel.app/?client=convex&room=abc'
    const { container, unmount } = render(
      <RoomScreen state={state} self={alex} room={hostRoom} onBurn={() => {}} inviteUrl={url} onLeave={() => {}} />,
    )
    const actions = container.querySelector('.room-header .room-header-actions')!
    expect(within(actions as HTMLElement).getByRole('button', { name: 'Copy invite link' })).toBeTruthy()
    expect(within(actions as HTMLElement).getByRole('button', { name: 'Leave' })).toBeTruthy()
    expect(document.body.textContent).not.toContain(url)
    unmount()

    const sam = state.members.find((m) => m.id === 'm_sam')!
    render(<RoomScreen state={state} self={sam} room={hostRoom} onBurn={() => {}} inviteUrl={url} onLeave={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Copy invite link' })).toBeNull()
  })

  it('shows the newest line as a one-line caption', () => {
    const { container } = setup()
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    const newest = state.lines.at(-1)!
    expect(container.querySelector('.recall-caption')?.textContent).toContain(newest.text)
  })

  it('keeps the header to one row of controls: no Listening indicator or people count', () => {
    const { container } = setup()
    expect(document.body.textContent).not.toContain('Listening')
    expect(container.querySelector('.room-header-sub')).toBeNull()
    expect(container.querySelector('.room-count')).toBeNull()
    // The count still lives on the stage ("N in the room").
    expect(document.body.textContent).toMatch(/\d+ in the room/)
    // A guest's "Host ends room" chip sits with Leave at the top.
    expect(container.querySelector('.room-header-actions .shhh-badge')).toBeTruthy()
  })

  it('push-to-talk only releases for the pointer that pressed it', () => {
    setup()
    const btn = screen.getByRole('button', { name: 'Hold to talk' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.pointerDown(btn, { pointerId: 1 })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.textContent).toContain('Talking')
    fireEvent.pointerUp(btn, { pointerId: 2 })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    fireEvent.pointerUp(btn, { pointerId: 1 })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('shows a placeholder when there are no lines', () => {
    const state = initialRoomState
    render(
      <RoomScreen
        state={state}
        self={{ id: 'm', roomId: 'r1', name: 'A', joinedAtSeq: 0, joinedAt: 0 }}
        room={room}
        onBurn={() => {}}
      />,
    )
    expect(screen.getByText('Stories will show up here as people tell them.')).toBeTruthy()
  })

  it('shows the recap for a latecomer and none for an on-time member', () => {
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    const taylor = state.members.find((m) => m.id === 'm_taylor')!
    const recap = state.recaps.find((r) => r.uptoSeq === taylor.joinedAtSeq)!
    const { unmount } = render(
      <RoomScreen state={state} self={taylor} room={room} onBurn={() => {}} />,
    )
    expect(screen.getByRole('region', { name: 'Spill the tea' })).toBeTruthy()
    expect(screen.getByText(recap.text)).toBeTruthy()
    unmount()
    render(
      <RoomScreen
        state={state}
        self={{ ...taylor, id: 'm_alex', joinedAtSeq: 0 }}
        room={room}
        onBurn={() => {}}
      />,
    )
    expect(screen.queryByRole('region', { name: 'Spill the tea' })).toBeNull()
  })

  it('collapses the recap banner while a story card is open', () => {
    const state = fixtureEvents().reduce(roomReducer, initialRoomState)
    const taylor = state.members.find((m) => m.id === 'm_taylor')!
    const recap = state.recaps.find((r) => r.uptoSeq === taylor.joinedAtSeq)!
    render(<RoomScreen state={state} self={taylor} room={room} onBurn={() => {}} />)
    expect(screen.getByText(recap.text)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cake' }))
    expect(screen.queryByText(recap.text)).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Spill the tea' })
    fireEvent.click(toggle)
    expect(screen.getByText(recap.text)).toBeTruthy()
  })
})
