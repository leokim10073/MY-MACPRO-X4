import { useCallback, useEffect, useReducer, useState } from 'react'
import type { Member, Room } from '../../../shared/schema'
import type { ConnectionStatus, JoinResult, RoomClient } from './RoomClient'
import { initialRoomState, roomReducer, type RoomState } from './state'

export interface UseRoom {
  state: RoomState
  self: Member | null
  room: Room | null
  error: string | null
  /** null for clients that don't report it (the mock). */
  connection: ConnectionStatus | null
  create(name: string): Promise<void>
  join(token: string, name: string): Promise<void>
  burn(): Promise<void>
}

// Subscribes on mount, before the user can create or join, so no events are missed.
// Never disposes the client: StrictMode mounts twice in dev and the client lives as long as the page.
export function useRoom(client: RoomClient): UseRoom {
  const [state, dispatch] = useReducer(roomReducer, initialRoomState)
  const [joined, setJoined] = useState<JoinResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)

  useEffect(() => client.subscribe(dispatch), [client])
  useEffect(() => client.onConnectionChange?.(setConnection), [client])

  const run = useCallback(async (action: () => Promise<JoinResult>) => {
    setError(null)
    try {
      setJoined(await action())
    } catch {
      setError('Could not join the room. Please try again.')
    }
  }, [])

  const create = useCallback((name: string) => run(() => client.createRoom(name)), [client, run])
  const join = useCallback(
    (token: string, name: string) => run(() => client.joinRoom(token, name)),
    [client, run],
  )
  const burn = useCallback(() => client.burn(), [client])

  return { state, self: joined?.self ?? null, room: joined?.room ?? null, error, connection, create, join, burn }
}
