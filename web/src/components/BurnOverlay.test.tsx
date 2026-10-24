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
    // Give the canvas a size so begin reaches getContext, which the setup stub answers with null.
    const rect = vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      toJSON: () => ({}),
    })
    const { container, unmount } = render(<BurnOverlay {...props} />)
    expect(rect).toHaveBeenCalled()
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
