import { describe, expect, it, vi } from 'vitest'

vi.mock('convex/browser', () => ({
  ConvexClient: vi.fn(function () {
    return { onUpdate: vi.fn(), mutation: vi.fn(), close: vi.fn() }
  }),
}))

import { ConvexClient } from 'convex/browser'
import { readInviteToken } from '../config'
import { ConvexRoomClient } from './convex/ConvexRoomClient'
import { ClientConfigError, createRoomClient, inviteUrl } from './createRoomClient'
import { MockRoomClient } from './mock/MockRoomClient'

const URL = 'https://example.convex.cloud'

describe('createRoomClient', () => {
  it.each(['', '?room=abc', '?client=bogus'])('gives Convex by default when VITE_CONVEX_URL is set (%j)', (search) => {
    const choice = createRoomClient(search, { VITE_CONVEX_URL: URL })
    expect(choice.kind).toBe('convex')
    expect(choice.client).toBeInstanceOf(ConvexRoomClient)
    expect(ConvexClient).toHaveBeenCalledWith(URL)
  })

  it.each(['?mock', '?client=mock', '?client=convex&mock', '?mock&room=demo'])(
    'gives the mock for %j even when VITE_CONVEX_URL is set',
    (search) => {
      const choice = createRoomClient(search, { VITE_CONVEX_URL: URL })
      expect(choice.kind).toBe('mock')
      expect(choice.client).toBeInstanceOf(MockRoomClient)
    },
  )

  it('gives Convex for ?client=convex with a URL', () => {
    const choice = createRoomClient('?client=convex', { VITE_CONVEX_URL: URL })
    expect(choice.kind).toBe('convex')
    expect(choice.client).toBeInstanceOf(ConvexRoomClient)
  })

  it.each(['', '?mock', '?client=mock', '?room=demo'])('gives the mock for %j when VITE_CONVEX_URL is not set', (search) => {
    const choice = createRoomClient(search, {})
    expect(choice.kind).toBe('mock')
    expect(choice.client).toBeInstanceOf(MockRoomClient)
  })

  it('throws ClientConfigError for ?client=convex without a URL', () => {
    expect(() => createRoomClient('?client=convex', {})).toThrow(ClientConfigError)
  })
})

describe('invite helpers', () => {
  it('reads the invite token', () => {
    expect(readInviteToken('?room=abc&speed=2')).toBe('abc')
    expect(readInviteToken('?speed=2')).toBeUndefined()
  })

  it('keeps client=convex in the invite URL', () => {
    expect(inviteUrl('https://x.app', '/play', 'convex', 'tok')).toBe('https://x.app/play?client=convex&room=tok')
  })
})
