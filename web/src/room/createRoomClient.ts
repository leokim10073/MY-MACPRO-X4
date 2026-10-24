// The one place that chooses the room client. The real backend is used whenever
// VITE_CONVEX_URL is set; ?mock or ?client=mock forces the mock (and wins over
// everything else); ?client=convex asks for the backend explicitly. With no URL
// set, the mock is used.
import { readMockOptions } from '../config'
import { ConvexRoomClient } from './convex/ConvexRoomClient'
import { MockRoomClient } from './mock/MockRoomClient'
import type { RoomClient } from './RoomClient'

export type ClientKind = 'mock' | 'convex'
export interface ClientChoice {
  kind: ClientKind
  client: RoomClient
}

/** ?client=convex was requested but VITE_CONVEX_URL is not set. */
export class ClientConfigError extends Error {}

export function createRoomClient(search: string, env: { VITE_CONVEX_URL?: string }): ClientChoice {
  const params = new URLSearchParams(search)
  const forceMock = params.has('mock') || params.get('client') === 'mock'
  const url = env.VITE_CONVEX_URL
  if (!forceMock && params.get('client') === 'convex' && !url) {
    throw new ClientConfigError('VITE_CONVEX_URL is not set')
  }
  if (!forceMock && url) return { kind: 'convex', client: new ConvexRoomClient(url) }
  return { kind: 'mock', client: new MockRoomClient(readMockOptions(search)) }
}

export function inviteUrl(origin: string, pathname: string, kind: ClientKind, token: string): string {
  return `${origin}${pathname}?client=${kind}&room=${token}`
}
