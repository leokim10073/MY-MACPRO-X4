import { useState } from 'react'
import { readMockOptions } from './config'
import type { RoomClient } from './room/RoomClient'
import { MockRoomClient } from './room/mock/MockRoomClient'
import { useRoom } from './room/useRoom'
import BurnedScreen from './screens/BurnedScreen'
import JoinScreen from './screens/JoinScreen'
import RoomScreen from './screens/RoomScreen'

interface Props {
  client?: RoomClient
  search?: string
}

export default function App({ client, search = window.location.search }: Props) {
  const [mockClient] = useState(() => (client ? null : new MockRoomClient(readMockOptions(search))))
  const { state, self, room, error, create, join, burn } = useRoom((client ?? mockClient)!)

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
  return <RoomScreen state={state} self={self} room={room!} onBurn={() => void burn()} />
}
