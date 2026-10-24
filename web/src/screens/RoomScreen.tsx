import { useState } from 'react'
import type { Member, Room } from '../../../shared/schema'
import ListeningIndicator from '../components/ListeningIndicator'
import PushToTalkButton from '../components/PushToTalkButton'
import Transcript from '../components/Transcript'
import type { RoomState } from '../room/state'

interface Props {
  state: RoomState
  self: Member
  room: Room
}

export default function RoomScreen({ state, self }: Props) {
  // Phase 1: only tracked; the voice owner wires the mic to this later.
  const [, setTalking] = useState(false)

  return (
    <main className="room">
      <header className="room-header">
        <h1>Gossip Window</h1>
        <ListeningIndicator />
      </header>
      <div className="room-banner" />
      <div className="room-transcript">
        <Transcript lines={state.lines} fromSeq={self.joinedAtSeq} />
      </div>
      <div className="room-dock">
        <div className="room-popup-slot" />
        <div className="room-talk">
          <PushToTalkButton onPressChange={setTalking} />
        </div>
      </div>
    </main>
  )
}
