import { useRef, useState } from 'react'
import type { Member, Room } from '../../../shared/schema'
import BurnConfirm from '../components/BurnConfirm'
import EntryRitual from '../components/EntryRitual'
import ShhhIcon from '../components/ShhhIcon'
import ConnectionBanner from '../components/ConnectionBanner'
import LeaveConfirm from '../components/LeaveConfirm'
import ListeningIndicator from '../components/ListeningIndicator'
import PushToTalkButton from '../components/PushToTalkButton'
import RecapBanner from '../components/RecapBanner'
import ShhhBadge from '../components/ShhhBadge'
import Transcript from '../components/Transcript'
import TypeLine from '../components/TypeLine'
import StoryCard from '../components/StoryCard'
import RecallPopup from '../components/RecallPopup'
import RoomStage from '../components/RoomStage'
import { visibleChips } from '../recall/popup'
import { usePopup } from '../recall/usePopup'
import type { ConnectionStatus, VoiceTransport } from '../room/RoomClient'
import { useLineSpeaking, type SpeakingSignal } from '../room/speaking'
import { personById, recapFor, storiesById, type RoomState } from '../room/state'
import { latestLine } from '../room/derived'
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
  /** A real "who is speaking" signal (e.g. push-to-talk). Without it, the speaker of each new line is shown. */
  speaking?: SpeakingSignal
  /** Leave this phone's session (not a burn). Without it there's no Leave button. */
  onLeave?: () => void
  /** False shows the entry ritual over the room. Defaults to true so the room renders directly. */
  entered?: boolean
  onEnter?: () => void
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
  speaking,
  onLeave,
  entered = true,
  onEnter = noop,
}: Props) {
  const voice = useVoice(transport, room, self, state)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmBurn, setConfirmBurn] = useState(false)
  const burnControl = useRef<HTMLButtonElement>(null)
  // A failed burn closes the sheet so the error line underneath shows; a successful one ends this screen anyway.
  const [wasBurning, setWasBurning] = useState(false)
  if (wasBurning !== (pending === 'burn')) {
    setWasBurning(pending === 'burn')
    if (wasBurning && error) setConfirmBurn(false)
  }
  // After Enter, a decorative icon shrinks toward the badge once, then goes away.
  const [ritualSeen, setRitualSeen] = useState(!entered)
  const [exitDone, setExitDone] = useState(false)
  if (!entered && !ritualSeen) setRitualSeen(true)
  const isHost = room.hostMemberId === self.id
  const [peekedFor, setPeekedFor] = useState<string | null>(null)
  const [recapDismissed, setRecapDismissed] = useState(false)
  const [replayStarted, setReplayStarted] = useState(false)
  const { popup, dismiss, tapChip, openStoryId, closeStory } = usePopup(state, self)
  const popupPerson = popup ? personById(state, popup.personId) : undefined
  const openStory = openStoryId ? storiesById(state).get(openStoryId) : undefined
  // The first pop-up of this session carries a hint; once it closes (tap, dismiss or fade) the hint is done.
  // Kept in memory only: leaving or reloading starts a new session.
  const [hint, setHint] = useState<'waiting' | 'showing' | 'done'>('waiting')
  if (hint === 'waiting' && popup) setHint('showing')
  if (hint === 'showing' && !popup) setHint('done')
  const lineSpeaking = useLineSpeaking(state.lines, self.joinedAtSeq)
  const { speakerId } = speaking ?? lineSpeaking
  const newest = latestLine(state)
  const lastLine = newest && newest.seq > self.joinedAtSeq ? newest : undefined
  const nameOf = (id: string) =>
    state.members.find((m) => m.id === id)?.name ?? state.lines.find((l) => l.speakerId === id)?.speakerName ?? '?'

  return (
    <>
    <main className="room" aria-hidden={entered ? undefined : true} inert={!entered}>
      <header className="room-header">
        <ShhhBadge />
        <h1>Gossip Window</h1>
        <ListeningIndicator micLive={voice?.state.isListening} />
        {(isHost || onLeave) && (
          <div className="room-actions">
            {isHost && (
              <button type="button" className="burn" ref={burnControl} onClick={() => setConfirmBurn(true)}>
                <svg viewBox="0 0 12 11" width="12" height="11" aria-hidden="true">
                  <path d="M6 0.6c.6 1.9 2.9 3.1 2.9 5.8A2.9 2.9 0 0 1 6 9.3a2.9 2.9 0 0 1-2.9-2.9c0-1.3.6-2.1 1.2-2.7.1 1 .5 1.5 1.1 1.7C5.2 4.2 5.4 2.3 6 .6Z" />
                </svg>
                Burn room…
              </button>
            )}
            {isHost && onLeave && <span className="actions-divider" aria-hidden="true" />}
            {onLeave && (
              <button type="button" className="leave" onClick={() => setConfirmLeave(true)}>
                Leave
              </button>
            )}
          </div>
        )}
      </header>
      <ConnectionBanner status={connection} onRejoin={onRejoin} />
      {error && (
        <p role="alert" className="error">
          {error.message}
        </p>
      )}
      {confirmLeave && onLeave && (
        <LeaveConfirm isHost={isHost} onLeave={onLeave} onStay={() => setConfirmLeave(false)} />
      )}
      {isHost && confirmBurn && (
        <BurnConfirm pending={pending === 'burn'} onBurn={onBurn} onKeep={() => {
            setConfirmBurn(false)
            burnControl.current?.focus()
          }} />
      )}
      {showReplay && onStartReplay && !replayStarted && isHost && (
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
                hint={hint !== 'done'}
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
    {!entered && <EntryRitual onEnter={onEnter} />}
    {entered && ritualSeen && !exitDone && (
      <div className="entry-ritual-exit" aria-hidden="true" onAnimationEnd={() => setExitDone(true)}>
        <ShhhIcon size={96} />
      </div>
    )}
    </>
  )
}
