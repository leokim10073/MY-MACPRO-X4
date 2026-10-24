// The one place that chooses the room client: ?client=convex for the real
// backend, anything else (including no param and the legacy ?mock) for the mock.
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
  if (new URLSearchParams(search).get('client') === 'convex') {
    if (!env.VITE_CONVEX_URL) throw new ClientConfigError('VITE_CONVEX_URL is not set')
    return { kind: 'convex', client: new ConvexRoomClient(env.VITE_CONVEX_URL) }
  }
  return { kind: 'mock', client: new MockRoomClient(readMockOptions(search)) }
}

export function inviteUrl(origin: string, pathname: string, kind: ClientKind, token: string): string {
  return `${origin}${pathname}?client=${kind}&room=${token}`
}
