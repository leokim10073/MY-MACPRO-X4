import { useState } from 'react'
import { readMockOptions } from './config'
import type { RoomClient } from './room/RoomClient'
import { MockRoomClient } from './room/mock/MockRoomClient'
import { useRoom } from './room/useRoom'
import JoinScreen from './screens/JoinScreen'

interface Props {
  client?: RoomClient
  search?: string
}

export default function App({ client, search = window.location.search }: Props) {
  const [mockClient] = useState(() => (client ? null : new MockRoomClient(readMockOptions(search))))
  const { state, self, error, create, join } = useRoom((client ?? mockClient)!)

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
  if (state.status === 'burned') return <p>This room has ended.</p>
  return (
    <main className="app">
      <h1>Room</h1>
      <p>{state.members.length} members</p>
    </main>
  )
}
