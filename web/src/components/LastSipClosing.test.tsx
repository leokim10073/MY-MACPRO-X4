import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import LastSipClosing from './LastSipClosing'

afterEach(cleanup)

describe('LastSipClosing', () => {
  it('keeps an empty live region mounted while the room is open', () => {
    const { container } = render(<LastSipClosing active={false} animated endedBy="You ended the room." />)
    const status = container.querySelector('[role="status"]')!
    expect(status.textContent).toBe('')
    expect(container.querySelector('.lsc-closing')).toBeNull()
  })

  it('announces the room ended and who ended it, once closing starts', () => {
    const { container, rerender } = render(<LastSipClosing active={false} animated endedBy="Taylor ended the room." />)
    const status = container.querySelector('[role="status"]')!
    rerender(<LastSipClosing active animated endedBy="Taylor ended the room." />)
    expect(container.querySelector('[role="status"]')).toBe(status)
    expect(status.textContent).toBe('Room ended. Taylor ended the room.')
  })

  it('animated: the cup starts full and the strokes are drawn, all decorative', () => {
    const { container } = render(<LastSipClosing active animated endedBy="You ended the room." />)
    const art = container.querySelector('.lsc-closing.is-animated')!
    expect(art.getAttribute('aria-hidden')).toBe('true')
    expect(art.querySelector('.lsc--waiting')).toBeTruthy()
    expect(art.querySelectorAll('.lsc-stroke').length).toBe(3)
  })

  it('reduced motion: a plain crossfade to the empty cup, no strokes', () => {
    const { container } = render(<LastSipClosing active animated={false} endedBy="You ended the room." />)
    expect(container.querySelector('.lsc-closing.is-animated')).toBeNull()
    expect(container.querySelector('.lsc-closing .lsc--empty')).toBeTruthy()
    expect(container.querySelector('.lsc-stroke')).toBeNull()
  })
})
