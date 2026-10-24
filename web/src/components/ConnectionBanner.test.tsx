import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConnectionBanner from './ConnectionBanner'

afterEach(cleanup)

describe('ConnectionBanner', () => {
  it('shows a quiet reconnecting strip', () => {
    render(<ConnectionBanner status="reconnecting" onRejoin={() => {}} />)
    expect(screen.getByRole('status').textContent).toBe('Reconnecting…')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the lost message with a Rejoin button that calls onRejoin', () => {
    const onRejoin = vi.fn()
    render(<ConnectionBanner status="lost" onRejoin={onRejoin} />)
    expect(screen.getByText('Lost connection to the room')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rejoin' }))
    expect(onRejoin).toHaveBeenCalledTimes(1)
  })

  it('announces politely', () => {
    render(<ConnectionBanner status="lost" onRejoin={() => {}} />)
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
  })

  it.each(['online', 'connecting', null] as const)('renders nothing when the status is %s', (status) => {
    const { container } = render(<ConnectionBanner status={status} onRejoin={() => {}} />)
    expect(container.innerHTML).toBe('')
  })
})
