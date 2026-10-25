import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { Member, Room } from '../../../shared/schema'
import type { ConnectionStatus, JoinResult, RoomClient } from './RoomClient'
import { BackendError, type BackendErrorKind } from './convex/callBackend'
import { initialRoomState, roomReducer, type RoomState } from './state'

export interface UseRoom {
  state: RoomState
  self: Member | null
  room: Room | null
  pending: 'create' | 'join' | 'burn' | null
  error: { kind: BackendErrorKind; message: string } | null
  /** null for clients that don't report it (the mock). */
  connection: ConnectionStatus | null
  /** True once this phone's burn() call resolved: the server has burned the room. Never reset. */
  burnConfirmed: boolean
  create(name: string): Promise<void>
  join(token: string, name: string): Promise<void>
  burn(): Promise<void>
  addLine(text: string, at: number): Promise<void>
  /** Absent unless the client can start a replay (Convex). */
  startReplay: (() => Promise<void>) | undefined
}

type Pending = UseRoom['pending']
type UiError = NonNullable<UseRoom['error']>

// Subscribes on mount, before the user can create or join, so no events are missed.
// Never disposes the client: StrictMode mounts twice in dev and the client lives as long as the page.
export function useRoom(client: RoomClient): UseRoom {
  const [state, dispatch] = useReducer(roomReducer, initialRoomState)
  const [joined, setJoined] = useState<JoinResult | null>(null)
  const [error, setError] = useState<UiError | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [burnConfirmed, setBurnConfirmed] = useState(false)
  const [offline, setOffline] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => client.subscribe(dispatch), [client])
  useEffect(() => client.onConnectionChange?.(setConnection), [client])
  useEffect(() => client.onPresenceChange?.((ids) => setOffline(new Set(ids))), [client])

  // Shows the pending label while the call runs, and a readable error if it fails. Never leaves pending set.
  const run = useCallback(async (kind: NonNullable<Pending>, action: () => Promise<JoinResult | void>) => {
    setError(null)
    setPending(kind)
    try {
      const result = await action()
      if (result) setJoined(result)
    } catch (e) {
      setError(
        e instanceof BackendError
          ? { kind: e.kind, message: e.message }
          : { kind: 'unknown', message: 'Something went wrong. Try again.' },
      )
    } finally {
      setPending(null)
    }
  }, [])

  const create = useCallback((name: string) => run('create', () => client.createRoom(name)), [client, run])
  const join = useCallback(
    (token: string, name: string) => run('join', () => client.joinRoom(token, name)),
    [client, run],
  )
  const roomId = joined?.room.id
  const burn = useCallback(
    () =>
      run('burn', async () => {
        await client.burn()
        setBurnConfirmed(true)
        // Drop the conversation now, even if the server's room_burned event never arrives.
        if (roomId) dispatch({ type: 'room_burned', roomId })
      }),
    [client, run, roomId],
  )
  const addLine = useCallback((text: string, at: number) => client.addLine(text, at), [client])
  const startReplay = useCallback(() => client.startReplay!(), [client])

  // Members whose phones closed the room without Leave drop out of the people count and the stage.
  // Members with no heartbeat at all (replay speakers, a phone that just joined) still show.
  const selfId = joined?.self.id
  const shown = useMemo(
    () =>
      offline.size === 0
        ? state
        : { ...state, members: state.members.filter((m) => m.id === selfId || !offline.has(m.id)) },
    [state, offline, selfId],
  )

  return {
    state: shown,
    self: joined?.self ?? null,
    room: joined?.room ?? null,
    pending,
    error,
    connection,
    burnConfirmed,
    create,
    join,
    burn,
    addLine,
    startReplay: client.startReplay ? startReplay : undefined,
  }
}
