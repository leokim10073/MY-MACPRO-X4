import { useState } from 'react'
import { readMockOptions } from './config'
import type { RoomClient } from './room/RoomClient'
import { ConvexRoomClient } from './room/convex/ConvexRoomClient'
import { MockRoomClient } from './room/mock/MockRoomClient'
import { useRoom } from './room/useRoom'
import BurnedScreen from './screens/BurnedScreen'
import JoinScreen from './screens/JoinScreen'
import RoomScreen from './screens/RoomScreen'

interface Props {
  client?: RoomClient
  search?: string
}

// The real backend when VITE_CONVEX_URL is set (add ?mock to force the mock).
// Tests always use the mock, even if a developer's .env.local sets the URL.
function defaultClient(search: string): RoomClient {
  const url = import.meta.env.VITE_CONVEX_URL as string | undefined
  const useConvex = url && import.meta.env.MODE !== 'test' && !new URLSearchParams(search).has('mock')
  return useConvex ? new ConvexRoomClient(url) : new MockRoomClient(readMockOptions(search))
}

export default function App({ client, search = window.location.search }: Props) {
  const [ownClient] = useState(() => (client ? null : defaultClient(search)))
  const roomClient = (client ?? ownClient)!
  const { state, self, room, error, create, join, burn } = useRoom(roomClient)

  if (!self) {
    return (
      <JoinScreen
        inviteToken={readMockOptions(search).inviteToken}
        onCreate={(name) => void create(name)}
        onJoin={(token, name) => void join(token, name)}
        error={error}
      />
    )
  }
  if (state.status === 'burned') return <BurnedScreen />
  const inviteUrl =
    roomClient instanceof ConvexRoomClient && room
      ? `${window.location.origin}${window.location.pathname}?room=${room.inviteToken}`
      : undefined
  return <RoomScreen state={state} self={self} room={room!} onBurn={() => void burn()} inviteUrl={inviteUrl} voice={roomClient.voice} />
}
