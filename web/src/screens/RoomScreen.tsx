import { useState } from 'react'
import type { Member, Room } from '../../../shared/schema'
import ListeningIndicator from '../components/ListeningIndicator'
import PushToTalkButton from '../components/PushToTalkButton'
import RecapBanner from '../components/RecapBanner'
import Transcript from '../components/Transcript'
import { recapFor, type RoomState } from '../room/state'

interface Props {
  state: RoomState
  self: Member
  room: Room
}

export default function RoomScreen({ state, self }: Props) {
  // Phase 1: only tracked; the voice owner wires the mic to this later.
  const [, setTalking] = useState(false)
  const [recapDismissed, setRecapDismissed] = useState(false)

  return (
    <main className="room">
      <header className="room-header">
        <h1>Gossip Window</h1>
        <ListeningIndicator />
      </header>
      <div className="room-banner">
        {!recapDismissed && (
          <RecapBanner
            recap={recapFor(state, self)}
            isLatecomer={self.joinedAtSeq > 0}
            onDismiss={() => setRecapDismissed(true)}
          />
        )}
      </div>
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
