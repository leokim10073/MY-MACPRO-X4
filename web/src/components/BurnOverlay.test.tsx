import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BurnOverlay from './BurnOverlay'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const props = { startAt: 560, durationMs: 2000, seed: 42, reducedMotion: false }

describe('BurnOverlay', () => {
  it('renders a hidden canvas and mounts and unmounts quietly with no 2d context', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container, unmount } = render(<BurnOverlay {...props} />)
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(canvas?.getAttribute('aria-hidden')).toBe('true')
    expect(canvas?.getAttribute('data-reduced')).toBe('false')
    expect(() => unmount()).not.toThrow()
    expect(error).not.toHaveBeenCalled()
  })

  it('reports reduced motion on the canvas', () => {
    const { container } = render(<BurnOverlay {...props} reducedMotion />)
    expect(container.querySelector('canvas')?.getAttribute('data-reduced')).toBe('true')
  })

  it('retries on the next frame while the canvas has no size, and cancels on unmount', () => {
    const raf = vi.fn(() => 7)
    const caf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', caf)
    const { unmount } = render(<BurnOverlay {...props} />)
    expect(raf).toHaveBeenCalledTimes(1)
    unmount()
    expect(caf).toHaveBeenCalledWith(7)
  })
})
