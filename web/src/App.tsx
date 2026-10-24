import { useState } from 'react'
import { readInviteToken } from './config'
import type { RoomClient } from './room/RoomClient'
import { inviteUrl, type ClientKind } from './room/createRoomClient'
import { useRoom } from './room/useRoom'
import BurnedScreen from './screens/BurnedScreen'
import JoinScreen from './screens/JoinScreen'
import RoomScreen from './screens/RoomScreen'

interface Props {
  client: RoomClient
  kind: ClientKind
  search?: string
  /** Makes a fresh client after Leave. Without it, the Leave button isn't offered. */
  makeClient?: () => RoomClient
}

// Leaving disposes this phone's client and remounts everything under a new key,
// so the reducer, pop-up and recap state all start clean on a fresh client.
export default function App({ client, kind, search = window.location.search, makeClient }: Props) {
  const [session, setSession] = useState({ key: 0, client })

  function leave() {
    if (!makeClient) return
    session.client.dispose()
    setSession({ key: session.key + 1, client: makeClient() })
  }

  return (
    <RoomSession
      key={session.key}
      client={session.client}
      kind={kind}
      search={search}
      onLeave={makeClient ? leave : undefined}
    />
  )
}

interface SessionProps {
  client: RoomClient
  kind: ClientKind
  search: string
  onLeave?: () => void
}

function RoomSession({ client, kind, search, onLeave }: SessionProps) {
  const { state, self, room, error, create, join, burn } = useRoom(client)

  if (!self) {
    return (
      <JoinScreen
        inviteToken={readInviteToken(search)}
        onCreate={(name) => void create(name)}
        onJoin={(token, name) => void join(token, name)}
        error={error}
      />
    )
  }
  if (state.status === 'burned') return <BurnedScreen />
  const invite =
    kind === 'convex' && room
      ? inviteUrl(window.location.origin, window.location.pathname, kind, room.inviteToken)
      : undefined
  return (
    <RoomScreen
      state={state}
      self={self}
      room={room!}
      onBurn={() => void burn()}
      inviteUrl={invite}
      onLeave={onLeave}
    />
  )
}
