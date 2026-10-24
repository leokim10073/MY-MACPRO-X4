import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JoinScreen from './JoinScreen'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function invited(props: Partial<Parameters<typeof JoinScreen>[0]> = {}) {
  return render(<JoinScreen inviteToken="demo" onJoin={vi.fn()} onCreate={vi.fn()} {...props} />)
}
function creating(props: Partial<Parameters<typeof JoinScreen>[0]> = {}) {
  return render(<JoinScreen onJoin={vi.fn()} onCreate={vi.fn()} {...props} />)
}

describe('Join screen, invited variant', () => {
  it('shows the invite copy and the "Join the room" button', () => {
    invited()
    expect(screen.getByRole('heading', { name: "You've got an invite" })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Join the room' })).toBeTruthy()
  })

  it('shows no room name, member count or other people before joining (none is known)', () => {
    const { container } = invited()
    expect(container.textContent).not.toMatch(/\d+ here|\d+ in the room|The Tea Table/)
    expect(container.querySelectorAll('.gw-seat')).toHaveLength(0)
  })

  it('shows a stable "Joining…" while the join is pending', () => {
    invited({ pending: true })
    const button = screen.getByRole('button', { name: 'Joining…' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })
})

describe('Join screen, create variant', () => {
  it('says the room starts with you and offers "Start the party"', () => {
    creating()
    expect(screen.getByRole('heading', { name: 'Your room starts with you' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start the party' })).toBeTruthy()
  })

  it('shows your avatar plus empty guest seats, nothing invented', () => {
    const { container } = creating()
    expect(container.querySelectorAll('.gw-seat--me')).toHaveLength(1)
    expect(container.querySelectorAll('.gw-seat--empty')).toHaveLength(3)
  })

  it('shows "Starting…" while the room is being created', () => {
    creating({ pending: true })
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeTruthy()
  })
})

describe('Nickname validation', () => {
  it('says what is missing after the nickname is cleared, and marks the field', async () => {
    const user = userEvent.setup()
    creating()
    const input = screen.getByLabelText('Nickname')
    expect(screen.queryByText("Add a nickname so friends know who's talking.")).toBeNull()
    await user.type(input, 'L')
    await user.clear(input)
    expect(screen.getByText("Add a nickname so friends know who's talking.")).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain('nickname-error')
  })

  it('keeps the disclosure linked to the field for screen readers', () => {
    creating()
    expect(screen.getByLabelText('Nickname').getAttribute('aria-describedby')).toContain('disclosure')
  })
})

describe('Avatar choice', () => {
  it('is optional: you can create a room without opening the picker', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    creating({ onCreate })
    await user.type(screen.getByLabelText('Nickname'), 'Leo')
    await user.click(screen.getByRole('button', { name: 'Start the party' }))
    expect(onCreate).toHaveBeenCalledWith('Leo')
  })

  it('lets you pick another avatar, kept in memory only (never in browser storage)', async () => {
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    creating()
    const toggle = screen.getByRole('button', { name: /Change avatar/ })
    expect(toggle.getAttribute('aria-label')).toContain('Sunny')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await user.click(screen.getByRole('radio', { name: 'Mint, curious, with glasses' }))
    expect(screen.getByRole('button', { name: /Change avatar/ }).getAttribute('aria-label')).toContain('Mint')
    expect(setItem).not.toHaveBeenCalled()
  })
})

describe('How it works', () => {
  it('opens a small in-page panel with three steps, and Escape closes it', async () => {
    const user = userEvent.setup()
    creating()
    const trigger = screen.getByRole('button', { name: 'How it works' })
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const panel = screen.getByRole('region', { name: 'How it works' })
    expect(panel.querySelectorAll('li')).toHaveLength(3)
    expect(panel.textContent).toContain('Talk')
    expect(panel.textContent).toContain('Catch up')
    expect(panel.textContent).toContain('Last Sip')
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'How it works' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('Decoration', () => {
  it('keeps every illustration hidden from screen readers', () => {
    const { container } = creating()
    const svgs = Array.from(container.querySelectorAll('svg'))
    expect(svgs.length).toBeGreaterThan(0)
    for (const svg of svgs) {
      expect(svg.closest('[aria-hidden="true"]')).toBeTruthy()
    }
  })
})
