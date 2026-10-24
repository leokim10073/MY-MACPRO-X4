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
}

export default function App({ client, kind, search = window.location.search }: Props) {
  const { state, self, room, pending, error, connection, create, join, burn, addLine, startReplay } = useRoom(client)
  const params = new URLSearchParams(search)

  if (!self) {
    return (
      <JoinScreen
        inviteToken={readInviteToken(search)}
        onCreate={(name) => void create(name)}
        onJoin={(token, name) => void join(token, name)}
        error={error}
        pending={pending === 'create' || pending === 'join'}
        offlineDemoHref={kind === 'convex' ? '?client=mock' : undefined}
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
      connection={connection}
      onRejoin={() => window.location.reload()}
      pending={pending}
      error={error}
      showTypeLine={params.get('type') === '1'}
      onAddLine={addLine}
      showReplay={params.get('replay') === '1' && !!startReplay}
      onStartReplay={startReplay}
      voice={client.voice}
    />
  )
}
