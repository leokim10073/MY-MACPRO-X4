import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Member } from '../../../shared/schema'
import RoomStage from './RoomStage'

afterEach(cleanup)

const member = (id: string, name: string): Member => ({ id, roomId: 'demo', name, joinedAtSeq: 0, joinedAt: 0 })
const alex = member('m_alex', 'Alex')
const sam = member('m_sam', 'Sam')
const leo = member('m_self', 'Leo')
const members = [alex, sam, leo]

describe('RoomStage', () => {
  it('shows the speaker in the big tile, marked as speaking', () => {
    render(<RoomStage members={members} self={leo} speaker={{ id: 'm_sam', name: 'Sam' }} lastSpeaker={null} />)
    const big = screen.getByTestId('stage-speaker')
    expect(big.textContent).toContain('Sam')
    expect(big.textContent).toContain('speaking')
    expect(screen.getByLabelText('Sam, speaking')).toBeTruthy()
  })

  it('shows the last speaker dimmed when nobody is speaking now', () => {
    render(<RoomStage members={members} self={leo} speaker={null} lastSpeaker={{ id: 'm_alex', name: 'Alex' }} />)
    const big = screen.getByTestId('stage-speaker')
    expect(big.textContent).toContain('Alex')
    expect(big.textContent).toContain('last spoke')
    expect(big.className).toContain('quiet')
  })

  it('invites the first line when nobody has spoken', () => {
    render(<RoomStage members={members} self={leo} speaker={null} lastSpeaker={null} />)
    expect(screen.getByTestId('stage-speaker').textContent).toContain('Nobody has spoken yet')
  })

  it('shows my name and marks my tile as me', () => {
    render(<RoomStage members={members} self={leo} speaker={null} lastSpeaker={null} />)
    expect(screen.getByText(/You're/).textContent).toBe("You're Leo")
    const mine = screen.getByLabelText('Leo, you')
    expect(mine.textContent).toContain('You')
  })

  it('counts everyone in the room', () => {
    render(<RoomStage members={members} self={leo} speaker={null} lastSpeaker={null} />)
    expect(screen.getByText('3 in the room')).toBeTruthy()
  })

  it('says "1 in the room" for a room of one', () => {
    render(<RoomStage members={[leo]} self={leo} speaker={null} lastSpeaker={null} />)
    expect(screen.getByText('1 in the room')).toBeTruthy()
  })

  it('compact mode keeps only the avatar row and a short count', () => {
    render(<RoomStage members={members} self={leo} speaker={{ id: 'm_sam', name: 'Sam' }} lastSpeaker={null} compact />)
    expect(screen.queryByTestId('stage-speaker')).toBeNull()
    expect(screen.getByText('3 here')).toBeTruthy()
    expect(screen.getByLabelText('Sam, speaking')).toBeTruthy()
  })

  it('puts every member in one scrollable row, speaker first then me', () => {
    const many = Array.from({ length: 12 }, (_, i) => member(`m${i}`, `Person ${i}`))
    render(<RoomStage members={[...many, leo]} self={leo} speaker={{ id: 'm5', name: 'Person 5' }} lastSpeaker={null} />)
    const row = screen.getByRole('group', { name: 'People in the room' })
    expect(row.className).toContain('stage-avatars')
    const labels = Array.from(row.querySelectorAll('[role="img"]')).map((el) => el.getAttribute('aria-label'))
    expect(labels).toHaveLength(13)
    expect(labels[0]).toBe('Person 5, speaking')
    expect(labels[1]).toBe('Leo, you')
  })

  it('shows each name under its avatar, with "You" for me', () => {
    render(<RoomStage members={members} self={leo} speaker={null} lastSpeaker={null} />)
    const row = screen.getByRole('group', { name: 'People in the room' })
    const names = Array.from(row.querySelectorAll('.stage-slot')).map((slot) => {
      const [avatar, name] = Array.from(slot.children)
      expect(avatar.className).toContain('avatar')
      return name.textContent
    })
    expect(names).toEqual(['You', 'Alex', 'Sam'])
    expect(row.querySelector('.stage-name.me')?.textContent).toBe('You')
  })

  it('labels each slot once: name, then host, then you', () => {
    render(<RoomStage members={members} self={leo} speaker={null} lastSpeaker={null} hostId="m_self" />)
    const row = screen.getByRole('group', { name: 'People in the room' })
    expect(within(row).getByRole('img', { name: 'Leo, host, you' })).toBeTruthy()
    expect(within(row).getByRole('img', { name: 'Alex' })).toBeTruthy()
    // The visible name is hidden from screen readers so it isn't read twice.
    for (const name of row.querySelectorAll('.stage-name')) expect(name.getAttribute('aria-hidden')).toBe('true')
  })

  it('keeps a long name whole in the label and on hover; CSS truncates what shows', () => {
    const long = member('m_long', 'Bartholomew Fitzgerald-Montgomery')
    render(<RoomStage members={[long, leo]} self={leo} speaker={null} lastSpeaker={null} />)
    const slot = screen.getByRole('img', { name: 'Bartholomew Fitzgerald-Montgomery' })
    expect(slot.getAttribute('title')).toBe('Bartholomew Fitzgerald-Montgomery')
    expect(slot.querySelector('.stage-name')?.textContent).toBe('Bartholomew Fitzgerald-Montgomery')
    expect(slot.className).toBe('stage-slot')
  })

  it('fades whichever edge of an overflowing row has people scrolled past it', () => {
    const many = Array.from({ length: 6 }, (_, i) => member(`m${i}`, `Person ${i}`))
    render(<RoomStage members={[...many, leo]} self={leo} speaker={null} lastSpeaker={null} />)
    const row = screen.getByRole('group', { name: 'People in the room' })
    expect(row.hasAttribute('data-fade-start') || row.hasAttribute('data-fade-end')).toBe(false)
    const size = { clientWidth: 291, scrollWidth: 532, scrollLeft: 0 }
    for (const [key, value] of Object.entries(size)) Object.defineProperty(row, key, { value, configurable: true })
    fireEvent.scroll(row)
    expect(row.hasAttribute('data-fade-start')).toBe(false)
    expect(row.hasAttribute('data-fade-end')).toBe(true)
    Object.defineProperty(row, 'scrollLeft', { value: 241, configurable: true })
    fireEvent.scroll(row)
    expect(row.hasAttribute('data-fade-start')).toBe(true)
    expect(row.hasAttribute('data-fade-end')).toBe(false)
  })

  it('keeps the Host chip on the avatar, above the name', () => {
    render(<RoomStage members={members} self={leo} speaker={null} lastSpeaker={null} hostId="m_alex" />)
    const slot = screen.getByRole('img', { name: 'Alex, host' })
    expect(slot.querySelector('.avatar > .avatar-host')?.textContent).toBe('Host')
  })
})
