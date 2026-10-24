import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TokenSource } from './tokenSource'

describe('TokenSource', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reuses a token until it is about to expire', async () => {
    let n = 0
    const fetchToken = vi.fn(async () => ({ token: `t${++n}`, expiresAt: Date.now() + 120_000 }))
    const s = new TokenSource(fetchToken)
    expect(await s.get()).toBe('t1')
    expect(await s.get()).toBe('t1')
    expect(fetchToken).toHaveBeenCalledTimes(1)
    s.dispose()
  })

  it('shares one request between callers that ask at the same time', async () => {
    const fetchToken = vi.fn(async () => ({ token: 't', expiresAt: Date.now() + 120_000 }))
    const s = new TokenSource(fetchToken)
    const [a, b] = await Promise.all([s.get(), s.get()])
    expect([a, b]).toEqual(['t', 't'])
    expect(fetchToken).toHaveBeenCalledTimes(1)
    s.dispose()
  })

  it('refreshes in the background 10 s before expiry', async () => {
    let n = 0
    const fetchToken = vi.fn(async () => ({ token: `t${++n}`, expiresAt: Date.now() + 120_000 }))
    const s = new TokenSource(fetchToken)
    await s.get()
    await vi.advanceTimersByTimeAsync(110_000)
    expect(fetchToken).toHaveBeenCalledTimes(2)
    expect(await s.get()).toBe('t2')
    s.dispose()
  })

  it('retries on the next get after a failed prefetch', async () => {
    const fetchToken = vi
      .fn<() => Promise<{ token: string; expiresAt: number }>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ token: 'ok', expiresAt: Date.now() + 120_000 })
    const s = new TokenSource(fetchToken)
    s.prefetch()
    await vi.advanceTimersByTimeAsync(0)
    expect(await s.get()).toBe('ok')
    s.dispose()
  })

  it('refuses to hand out tokens after dispose', async () => {
    const s = new TokenSource(async () => ({ token: 't', expiresAt: Date.now() + 120_000 }))
    await s.get()
    s.dispose()
    await expect(s.get()).rejects.toThrow()
  })
})
