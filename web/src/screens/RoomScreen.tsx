import { useState } from 'react'
import type { Member, Room } from '../../../shared/schema'
import BurnButton from '../components/BurnButton'
import ConnectionBanner from '../components/ConnectionBanner'
import ListeningIndicator from '../components/ListeningIndicator'
import PushToTalkButton from '../components/PushToTalkButton'
import RecapBanner from '../components/RecapBanner'
import Transcript from '../components/Transcript'
import StoryCard from '../components/StoryCard'
import RecallPopup from '../components/RecallPopup'
import { visibleChips } from '../recall/popup'
import { usePopup } from '../recall/usePopup'
import type { ConnectionStatus } from '../room/RoomClient'
import { personById, recapFor, storiesById, type RoomState } from '../room/state'

interface Props {
  state: RoomState
  self: Member
  room: Room
  onBurn: () => void
  /** Shown to the host so friends can join. Only set when running against the real backend. */
  inviteUrl?: string
  /** Only the Convex client reports this; null or absent shows nothing. */
  connection?: ConnectionStatus | null
  onRejoin?: () => void
}

const noop = () => {}

export default function RoomScreen({
  state,
  self,
  room,
  onBurn,
  inviteUrl,
  connection = null,
  onRejoin = noop,
}: Props) {
  // Phase 1: only tracked; the voice owner wires the mic to this later.
  const [, setTalking] = useState(false)
  const [peekedFor, setPeekedFor] = useState<string | null>(null)
  const [recapDismissed, setRecapDismissed] = useState(false)
  const { popup, dismiss, tapChip, openStoryId, closeStory } = usePopup(state, self)
  const popupPerson = popup ? personById(state, popup.personId) : undefined
  const openStory = openStoryId ? storiesById(state).get(openStoryId) : undefined

  return (
    <main className="room">
      <header className="room-header">
        <h1>Gossip Window</h1>
        <ListeningIndicator />
        {room.hostMemberId === self.id && <BurnButton onBurn={onBurn} />}
      </header>
      <ConnectionBanner status={connection} onRejoin={onRejoin} />
      {inviteUrl && room.hostMemberId === self.id && (
        <p className="room-invite">
          Invite: <a href={inviteUrl}>{inviteUrl}</a>
        </p>
      )}
      <div className="room-banner">
        {!recapDismissed && (
          <RecapBanner
            recap={recapFor(state, self)}
            isLatecomer={self.joinedAtSeq > 0}
            onDismiss={() => setRecapDismissed(true)}
            collapsed={!!openStory && peekedFor !== openStory.id}
            onExpand={() => openStory && setPeekedFor(openStory.id)}
          />
        )}
      </div>
      <div className="room-transcript">
        <Transcript lines={state.lines} fromSeq={self.joinedAtSeq} />
      </div>
      <div className="room-dock">
        <div className="room-popup-slot">
          {openStory ? (
            <StoryCard
              key={openStory.id}
              story={openStory}
              people={state.storyState?.people ?? []}
              self={self}
              onClose={closeStory}
            />
          ) : (
            popup &&
            popupPerson && (
              <RecallPopup
                key={popup.expiresAt}
                person={popupPerson}
                chips={visibleChips(popup, state.storyState?.stories ?? [])}
                focusStoryId={popup.focusStoryId}
                onChip={tapChip}
                onDismiss={dismiss}
              />
            )
          )}
        </div>
        <div className="room-talk">
          <PushToTalkButton onPressChange={setTalking} />
        </div>
      </div>
    </main>
  )
}
