import { getFunctionName } from 'convex/server'
import { vi } from 'vitest'
import type { Member, Room, RoomEvent } from '../../../shared/schema'
import type { ConnectionStatus } from '../room/RoomClient'
import { ConvexRoomClient } from '../room/convex/ConvexRoomClient'

export const room: Room = {
  id: 'room1',
  hostMemberId: 'm1',
  status: 'active',
  inviteToken: 'invite1',
  createdAt: 0,
  expiresAt: 1,
}
export const alex: Member = { id: 'm1', roomId: 'room1', name: 'Alex', joinedAtSeq: 0, joinedAt: 0 }

/** Stands in for ConvexClient: records calls and lets the test push query results. */
export function fakeConvex(joinAs: { room: Room; member: Member } = { room, member: alex }) {
  const calls: Array<{ name: string; args: unknown }> = []
  const subscriptions: Array<{
    name: string
    args: unknown
    push: (v: unknown) => void
    fail: (e: Error) => void
    stopped: boolean
  }> = []
  const convex = {
    mutation: vi.fn(async (ref: unknown, args: unknown) => {
      const name = getFunctionName(ref as never)
      calls.push({ name, args })
      if (name === 'rooms:create') return { room, member: alex, sessionToken: 'secret' }
      if (name === 'rooms:join') return { room: joinAs.room, member: joinAs.member, sessionToken: 'secret' }
      return null
    }),
    onUpdate: vi.fn((ref: unknown, args: unknown, callback: (v: unknown) => void, onError?: (e: Error) => void) => {
      const sub = {
        name: getFunctionName(ref as never),
        args,
        push: callback,
        fail: (e: Error) => onError?.(e),
        stopped: false,
      }
      subscriptions.push(sub)
      return () => {
        sub.stopped = true
      }
    }),
    close: vi.fn(async () => {}),
  }
  return { convex, calls, subscriptions }
}

interface ConnState {
  isWebSocketConnected: boolean
  hasEverConnected: boolean
}

/** `withConnectionState` adds a fake `subscribeToConnectionState` the test drives with `setConnection`. */
export function setup({ withConnectionState = false } = {}) {
  const fake = fakeConvex()
  const connection = { listeners: [] as Array<(s: ConnState) => void>, unsubscribed: 0 }
  const convex = withConnectionState
    ? {
        ...fake.convex,
        subscribeToConnectionState: vi.fn((cb: (s: ConnState) => void) => {
          connection.listeners.push(cb)
          return () => {
            connection.unsubscribed += 1
            connection.listeners = connection.listeners.filter((l) => l !== cb)
          }
        }),
      }
    : fake.convex
  const client = new ConvexRoomClient(convex as never)
  const events: RoomEvent[] = []
  client.subscribe((e) => events.push(e))
  const statuses: ConnectionStatus[] = []
  const setConnection = (s: ConnState) => [...connection.listeners].forEach((l) => l(s))
  return { ...fake, client, events, statuses, connection, setConnection }
}

