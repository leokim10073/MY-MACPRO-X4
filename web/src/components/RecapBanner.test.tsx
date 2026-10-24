import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Recap } from '../../../shared/schema'
import RecapBanner from './RecapBanner'

const recap: Recap = {
  id: 'recap_16',
  roomId: 'r1',
  uptoSeq: 16,
  text: 'Alex and Sam planned the road trip.',
  createdAt: 0,
}

afterEach(cleanup)

describe('RecapBanner', () => {
  it('shows a loading message for a latecomer with no recap yet', () => {
    render(<RecapBanner recap={undefined} isLatecomer onDismiss={() => {}} />)
    expect(screen.getByText('Catching you up…')).toBeTruthy()
  })

  it('shows the recap text right away', () => {
    render(<RecapBanner recap={recap} isLatecomer onDismiss={() => {}} />)
    expect(screen.getByText(recap.text)).toBeTruthy()
    expect(screen.queryByText('Catching you up…')).toBeNull()
  })

  it('renders nothing for a non-latecomer', () => {
    const { container } = render(
      <RecapBanner recap={recap} isLatecomer={false} onDismiss={() => {}} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('calls onDismiss when Dismiss is pressed', () => {
    const onDismiss = vi.fn()
    render(<RecapBanner recap={recap} isLatecomer onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
