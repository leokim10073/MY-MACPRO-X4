import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import LastSipCup from './LastSipCup'

afterEach(cleanup)

describe('LastSipCup', () => {
  it('is decorative and sized', () => {
    const { container } = render(<LastSipCup size={120} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('width')).toBe('120')
  })

  it('waiting: tea in the cup, steam curls and a raised eyebrow', () => {
    const { container } = render(<LastSipCup mood="waiting" />)
    expect(container.querySelector('.lsc-tea')).toBeTruthy()
    expect(container.querySelectorAll('.lsc-steam-curl').length).toBe(2)
    expect(container.querySelector('.lsc-brow')).toBeTruthy()
    expect(container.querySelector('.lsc-steam-dots')).toBeNull()
  })

  it('pending: the steam becomes three dots', () => {
    const { container } = render(<LastSipCup mood="pending" />)
    expect(container.querySelectorAll('.lsc-steam-dots circle').length).toBe(3)
    expect(container.querySelector('.lsc-steam-curl')).toBeNull()
  })

  it('empty: no tea and no steam', () => {
    const { container } = render(<LastSipCup mood="empty" />)
    expect(container.querySelector('.lsc-tea')).toBeNull()
    expect(container.querySelector('.lsc-steam-curl')).toBeNull()
    expect(container.querySelector('.lsc-steam-dots')).toBeNull()
  })

  it('draws the pour arc inside the cup only when asked', () => {
    const { container, rerender } = render(<LastSipCup />)
    expect(container.querySelector('.lsc-pour')).toBeNull()
    rerender(<LastSipCup pour />)
    expect(container.querySelector('.lsc-cup .lsc-pour')).toBeTruthy()
  })

  it('carries its mood as a class for styling', () => {
    const { container } = render(<LastSipCup mood="failed" className="x" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('class')).toBe('lsc lsc--failed x')
  })
})
