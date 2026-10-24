import { useState } from 'react'
import type { Member, Room } from '../../../shared/schema'
import BurnButton from '../components/BurnButton'
import LeaveConfirm from '../components/LeaveConfirm'
import ListeningIndicator from '../components/ListeningIndicator'
import PushToTalkButton from '../components/PushToTalkButton'
import RecapBanner from '../components/RecapBanner'
import Transcript from '../components/Transcript'
import StoryCard from '../components/StoryCard'
import RecallPopup from '../components/RecallPopup'
import RoomStage from '../components/RoomStage'
import { visibleChips } from '../recall/popup'
import { usePopup } from '../recall/usePopup'
import { useLineSpeaking, type SpeakingSignal } from '../room/speaking'
import { personById, recapFor, storiesById, type RoomState } from '../room/state'
import { latestLine } from '../room/derived'

interface Props {
  state: RoomState
  self: Member
  room: Room
  onBurn: () => void
  /** Shown to the host so friends can join. Only set when running against the real backend. */
  inviteUrl?: string
  /** A real "who is speaking" signal (e.g. push-to-talk). Without it, the speaker of each new line is shown. */
  speaking?: SpeakingSignal
  /** Leave this phone's session (not a burn). Without it there's no Leave button. */
  onLeave?: () => void
}

export default function RoomScreen({ state, self, room, onBurn, inviteUrl, speaking, onLeave }: Props) {
  const [confirmLeave, setConfirmLeave] = useState(false)
  const isHost = room.hostMemberId === self.id
  // Phase 1: only tracked; the voice owner wires the mic to this later.
  const [, setTalking] = useState(false)
  const [peekedFor, setPeekedFor] = useState<string | null>(null)
  const [recapDismissed, setRecapDismissed] = useState(false)
  const { popup, dismiss, tapChip, openStoryId, closeStory } = usePopup(state, self)
  const popupPerson = popup ? personById(state, popup.personId) : undefined
  const openStory = openStoryId ? storiesById(state).get(openStoryId) : undefined
  const lineSpeaking = useLineSpeaking(state.lines, self.joinedAtSeq)
  const { speakerId } = speaking ?? lineSpeaking
  const newest = latestLine(state)
  const lastLine = newest && newest.seq > self.joinedAtSeq ? newest : undefined
  const nameOf = (id: string) =>
    state.members.find((m) => m.id === id)?.name ?? state.lines.find((l) => l.speakerId === id)?.speakerName ?? '?'

  return (
    <main className="room">
      <header className="room-header">
        <h1>Gossip Window</h1>
        <ListeningIndicator />
        {(isHost || onLeave) && (
          <div className="room-actions">
            {isHost && <BurnButton onBurn={onBurn} />}
            {isHost && onLeave && <span className="actions-divider" aria-hidden="true" />}
            {onLeave && (
              <button type="button" className="leave" onClick={() => setConfirmLeave(true)}>
                Leave
              </button>
            )}
          </div>
        )}
      </header>
      {confirmLeave && onLeave && (
        <LeaveConfirm isHost={isHost} onLeave={onLeave} onStay={() => setConfirmLeave(false)} />
      )}
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
      <RoomStage
        members={state.members}
        self={self}
        speaker={speakerId ? { id: speakerId, name: nameOf(speakerId) } : null}
        lastSpeaker={lastLine ? { id: lastLine.speakerId, name: lastLine.speakerName } : null}
        compact={!!openStory}
      />
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
