import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member, Recap, Room, RoomEvent } from '../../../../shared/schema'
import App from '../../App'
import { DONE_MS } from '../closing'
import { fakeConvex } from '../../test/fakeConvex'
import { ConvexRoomClient } from './ConvexRoomClient'
import sample from './__fixtures__/events.sample.json'

type Row = { eventSeq: number; event: RoomEvent }
const rows = sample as Row[]
const upToR2 = rows.filter((r) => r.eventSeq <= 30)
const taylor = rows.find((r) => r.eventSeq === 27)!.event as Extract<RoomEvent, { type: 'member_joined' }>
const recapRow = rows.find((r) => r.event.type === 'recap_ready')!.event as Extract<RoomEvent, { type: 'recap_ready' }>
const roomId = taylor.member.roomId
const joinedRoom: Room = {
  id: roomId,
  hostMemberId: rows[0].event.type === 'member_joined' ? rows[0].event.member.id : '',
  status: 'active',
  inviteToken: 'invite1',
  createdAt: 0,
  expiresAt: 1,
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function joinViaUi(joinAs: { room: Room; member: Member }) {
  const fake = fakeConvex(joinAs)
  const client = new ConvexRoomClient(fake.convex as never)
  render(<App client={client} kind="convex" search="?room=invite1" />)
  fireEvent.change(screen.getByLabelText(/nickname/i), { target: { value: 'Taylor' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }))
  })
  fireEvent.click(screen.getByRole('button', { name: 'Enter room' }))
  const sub = fake.subscriptions[0]
  const push = (v: { status: 'active' | 'burned'; events: Row[] }) =>
    act(async () => {
      sub.push(v)
    })
  return { fake, client, sub, push }
}

describe('Convex path: late join and burn', () => {
  it('shows the recap for the latecomer, the pop-up and card, then burns cleanly', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { fake, client, sub, push } = await joinViaUi({ room: joinedRoom, member: taylor.member })
    expect(sub).toBeDefined()

    await push({ status: 'active', events: upToR2.filter((r) => r.eventSeq <= 28) })
    const banner = screen.getByRole('region', { name: 'Catch-up' })
    expect(banner.textContent).toContain(recapRow.recap.text)

    // A recap for someone else (uptoSeq 12, different id) is ignored.
    const other: Recap = { ...recapRow.recap, id: 'other-recap', uptoSeq: 12, text: 'Recap meant for someone else.' }
    await push({
      status: 'active',
      events: [...upToR2, { eventSeq: 31, event: { type: 'recap_ready', recap: other } }],
    })
    expect(document.body.textContent).not.toContain(other.text)
    expect(document.body.textContent).toContain(recapRow.recap.text)
    expect(screen.getAllByRole('region', { name: 'Catch-up' })).toHaveLength(1)

    // r1 and r2 are in: the pop-up shows Kevin.
    expect(screen.getByRole('region', { name: 'Mentioned again' }).textContent).toContain('Kevin')

    fireEvent.click(screen.getByRole('button', { name: 'Cake' }))
    expect(screen.getByRole('dialog', { name: 'Cake' })).toBeTruthy()

    await push({ status: 'burned', events: [] })
    // The closing plays over the frozen room first, then the clean slate.
    expect(screen.getByRole('button', { name: 'Room closed' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => void (await vi.advanceTimersByTimeAsync(DONE_MS)))
    expect(screen.getByText('This room has ended.')).toBeTruthy()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/kevin/i)
    expect(text).not.toMatch(/cake/i)
    expect(sub.stopped).toBe(true)

    const before = fake.calls.length
    await client.addLine('x', 0)
    expect(fake.calls.slice(before).some((c) => c.name === 'lines:add')).toBe(false)
  })
})

describe('storage guard on the Convex path', () => {
  it('the same flow never writes to browser storage', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    if (typeof indexedDB === 'undefined') vi.stubGlobal('indexedDB', { open: vi.fn() })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const open = vi.spyOn(indexedDB, 'open')
    const { push } = await joinViaUi({ room: joinedRoom, member: taylor.member })
    await push({ status: 'active', events: upToR2 })
    fireEvent.click(screen.getByRole('button', { name: 'Cake' }))
    await push({ status: 'burned', events: [] })
    await act(async () => void (await vi.advanceTimersByTimeAsync(DONE_MS)))
    expect(screen.getByText('This room has ended.')).toBeTruthy()
    expect(setItem).toHaveBeenCalledTimes(0)
    expect(open).toHaveBeenCalledTimes(0)
  })
})
