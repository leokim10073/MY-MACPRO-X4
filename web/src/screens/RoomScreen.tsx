import { useState } from 'react'
import type { Member, Room } from '../../../shared/schema'
import BurnButton from '../components/BurnButton'
import ConnectionBanner from '../components/ConnectionBanner'
import ListeningIndicator from '../components/ListeningIndicator'
import PushToTalkButton from '../components/PushToTalkButton'
import RecapBanner from '../components/RecapBanner'
import Transcript from '../components/Transcript'
import TypeLine from '../components/TypeLine'
import StoryCard from '../components/StoryCard'
import RecallPopup from '../components/RecallPopup'
import { visibleChips } from '../recall/popup'
import { usePopup } from '../recall/usePopup'
import type { ConnectionStatus, VoiceTransport } from '../room/RoomClient'
import { personById, recapFor, storiesById, type RoomState } from '../room/state'
import { useVoice } from '../voice/useVoice'

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
  /** The pending action; only 'burn' matters here. */
  pending?: 'create' | 'join' | 'burn' | null
  /** The last action's error, shown here only as a failed burn. */
  error?: { kind: string; message: string } | null
  /** Dev-only typed line (?type=1). */
  showTypeLine?: boolean
  onAddLine?: (text: string, at: number) => Promise<void>
  /** Host-only "Start Kevin replay" (?replay=1, Convex). */
  showReplay?: boolean
  onStartReplay?: () => Promise<void>
  /** Push-to-talk to the backend. Absent on the mock, where the button only animates. */
  voice?: VoiceTransport
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
  pending = null,
  error = null,
  showTypeLine = false,
  onAddLine,
  showReplay = false,
  onStartReplay,
  voice: transport,
}: Props) {
  const voice = useVoice(transport, room, self, state)
  const [peekedFor, setPeekedFor] = useState<string | null>(null)
  const [recapDismissed, setRecapDismissed] = useState(false)
  const [replayStarted, setReplayStarted] = useState(false)
  const { popup, dismiss, tapChip, openStoryId, closeStory } = usePopup(state, self)
  const popupPerson = popup ? personById(state, popup.personId) : undefined
  const openStory = openStoryId ? storiesById(state).get(openStoryId) : undefined

  return (
    <main className="room">
      <header className="room-header">
        <h1>Gossip Window</h1>
        <ListeningIndicator micLive={voice?.state.isListening} />
        {room.hostMemberId === self.id && <BurnButton onBurn={onBurn} pending={pending === 'burn'} />}
      </header>
      <ConnectionBanner status={connection} onRejoin={onRejoin} />
      {error && (
        <p role="alert" className="error">
          {error.message}
        </p>
      )}
      {showReplay && onStartReplay && !replayStarted && room.hostMemberId === self.id && (
        <button
          type="button"
          className="replay"
          onClick={() => {
            setReplayStarted(true)
            void onStartReplay().catch(() => setReplayStarted(false))
          }}
        >
          Start Kevin replay
        </button>
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
        {showTypeLine && onAddLine && <TypeLine onAddLine={onAddLine} />}
        <div className="room-talk">
          {voice?.state.preview && <p className="talk-preview">{voice.state.preview}</p>}
          {voice?.state.error && (
            <p role="alert" className="talk-error">
              {voice.state.error}
            </p>
          )}
          {voice?.state.failed.map((f, i) => (
            <button key={i} type="button" className="talk-retry" onClick={f.retry}>
              Not sent: “{f.line.text}” · tap to retry
            </button>
          ))}
          <PushToTalkButton onPressChange={voice?.press ?? noop} />
        </div>
      </div>
    </main>
  )
}
