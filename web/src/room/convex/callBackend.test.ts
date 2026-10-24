import { ConvexError } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendError, callBackend, MUTATION_TIMEOUT_MS } from './callBackend'

afterEach(() => vi.useRealTimers())

const fails = (e: unknown) => callBackend(() => Promise.reject(e)).catch((x: unknown) => x as BackendError)

describe('callBackend', () => {
  it('returns the result on success', async () => {
    expect(await callBackend(() => Promise.resolve(5))).toBe(5)
  })

  it.each([
    ['This room has ended', 'room_ended', 'This room has ended or the invite link is wrong.'],
    ['Nickname must be 1 to 30 characters', 'bad_name', 'Nickname must be 1 to 30 characters'],
    ['Not a member of this room', 'not_member', "You're not in this room anymore."],
    ['Only the host can do that', 'not_host', 'Only the host can do that.'],
    ['Line is too long', 'unknown', 'Something went wrong. Try again.'],
  ])('maps %s', async (msg, kind, copy) => {
    const err = await fails(new Error(msg))
    expect(err).toBeInstanceOf(BackendError)
    expect(err).toMatchObject({ kind, message: copy })
  })

  it('reads ConvexError.data when it is a string', async () => {
    const err = await fails(new ConvexError('Not a member of this room'))
    expect(err.kind).toBe('not_member')
  })

  it('maps an unknown message to unknown without leaking it', async () => {
    const err = await fails(new Error('secret server detail'))
    expect(err).toMatchObject({ kind: 'unknown', message: 'Something went wrong. Try again.' })
  })

  it('times out as unreachable after 10 s', async () => {
    vi.useFakeTimers()
    const p = callBackend(() => new Promise<never>(() => {})).catch((x: unknown) => x as BackendError)
    await vi.advanceTimersByTimeAsync(MUTATION_TIMEOUT_MS - 1)
    let settled = false
    void p.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await p).toMatchObject({ kind: 'unreachable', message: "Can't reach the server." })
  })

  it('clears the timer after success and after failure', async () => {
    vi.useFakeTimers()
    await callBackend(() => Promise.resolve(1))
    expect(vi.getTimerCount()).toBe(0)
    await fails(new Error('x'))
    expect(vi.getTimerCount()).toBe(0)
  })
})
