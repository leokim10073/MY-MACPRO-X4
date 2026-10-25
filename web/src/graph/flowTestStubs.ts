// Test-only: jsdom has no layout, and React Flow needs these to measure nodes and draw edges.
import { afterAll, beforeAll, vi } from 'vitest'

export function stubReactFlowLayout() {
  const saved: PropertyDescriptor[] = []
  beforeAll(() => {
    class RO {
      constructor(private cb: ResizeObserverCallback) {}
      observe(el: Element) {
        this.cb([{ target: el, contentRect: { width: 400, height: 400 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', RO)
    vi.stubGlobal(
      'DOMMatrixReadOnly',
      class {
        m22 = 1
        constructor(t?: string) {
          const scale = t?.match(/scale\(([1-9.])\)/)?.[1]
          this.m22 = scale ? Number(scale) : 1
        }
      },
    )
    for (const prop of ['offsetHeight', 'offsetWidth'] as const) {
      saved.push(Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)!)
      Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => 80 })
    }
  })
  afterAll(() => {
    vi.unstubAllGlobals()
    for (const [i, prop] of (['offsetHeight', 'offsetWidth'] as const).entries()) {
      Object.defineProperty(HTMLElement.prototype, prop, saved[i])
    }
  })
}
