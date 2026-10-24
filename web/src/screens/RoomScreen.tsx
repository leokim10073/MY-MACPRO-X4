import { useCallback, useEffect, useRef, useState } from 'react'
import type { Member, Room } from '../../../shared/schema'
import BurnConfirm from '../components/BurnConfirm'
import BurnIgnition from '../components/BurnIgnition'
import EntryRitual from '../components/EntryRitual'
import LastSipCup from '../components/art/LastSipCup'
import WindowLogo from '../components/art/WindowLogo'
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
import BurnOverlay from '../components/BurnOverlay'
import { BURN_DURATION_MS, BURN_START_MS, type ClosingPhase } from '../room/closing'
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
  /** Set once the room is closing (burning). Talk is closed, and pop-ups, stories and typing go away. */
  closing?: { phase: ClosingPhase; startedAt: number; seed: number } | null
}

const noop = () => {}

// Window.matchMedia is missing in jsdom, so a missing API means motion is fine.
function motionOk() {
  return typeof window.matchMedia !== 'function' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

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
  closing = null,
}: Props) {
  const isClosing = closing !== null
  const motion = motionOk()
  // No transport once closing: useVoice stops the mic.
  const voice = useVoice(isClosing ? undefined : transport, room, self, state)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmBurn, setConfirmBurn] = useState(false)
  const burnControl = useRef<HTMLButtonElement>(null)
  const keepRoom = useCallback(() => {
    setConfirmBurn(false)
    burnControl.current?.focus()
  }, [])
  // Counts failed burns; the effect below returns focus to "Burn room…" once the sheet has unmounted.
  const [burnFailures, setBurnFailures] = useState(0)
  useEffect(() => {
    if (burnFailures > 0) burnControl.current?.focus()
  }, [burnFailures])
  // When closing starts, any open sheet closes once. Leave can be opened again afterwards.
  const [wasClosing, setWasClosing] = useState(isClosing)
  if (wasClosing !== isClosing) {
    setWasClosing(isClosing)
    if (isClosing) {
      setConfirmLeave(false)
      setConfirmBurn(false)
    }
  }
  // A failed burn closes the sheet so the error line underneath shows; a successful one ends this screen anyway.
  const [wasBurning, setWasBurning] = useState(false)
  if (wasBurning !== (pending === 'burn')) {
    setWasBurning(pending === 'burn')
    if (wasBurning && error) {
      setConfirmBurn(false)
      setBurnFailures((n) => n + 1)
    }
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
  const shownPopup = isClosing ? null : popup
  const popupPerson = shownPopup ? personById(state, shownPopup.personId) : undefined
  const openStory = openStoryId && !isClosing ? storiesById(state).get(openStoryId) : undefined
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
          <div className="room-header-top">
            <div className="room-brand">
              <WindowLogo size={34} />
              <h1>Gossip Window</h1>
            </div>
            {onLeave && (
              <button type="button" className="leave gw-btn gw-btn--quiet" onClick={() => setConfirmLeave(true)}>
                Leave
              </button>
            )}
          </div>
          <div className="room-header-sub">
            <span className="room-count gw-chip">{state.members.length} here</span>
            {!isClosing && <ListeningIndicator micLive={voice?.state.isListening} />}
            {isHost ? (
              !isClosing && (
                <div className="room-actions">
                  <button
                    type="button"
                    className="burn"
                    ref={burnControl}
                    aria-describedby="last-sip-hint"
                    onClick={() => setConfirmBurn(true)}
                  >
                    <LastSipCup size={24} mood="waiting" />
                    Last Sip…
                  </button>
                  <span id="last-sip-hint" className="sr-only">
                    End this room for everyone.
                  </span>
                </div>
              )
            ) : (
              <ShhhBadge />
            )}
          </div>
        </header>
        <ConnectionBanner status={connection} onRejoin={onRejoin} />
        {error && (
          <p role="alert" className="error">
            Couldn't end the room. Please try again.
          </p>
        )}
        {confirmLeave && onLeave && (
          <LeaveConfirm isHost={isHost} onLeave={onLeave} onStay={() => setConfirmLeave(false)} />
        )}
        {isHost && confirmBurn && (
          <BurnConfirm pending={pending === 'burn'} onBurn={onBurn} onKeep={keepRoom} />
        )}
        {!isClosing && showReplay && onStartReplay && !replayStarted && isHost && (
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
        <div className="room-board">
          <div className="room-banner">
            {!recapDismissed && !isClosing && (
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
            speaker={!isClosing && speakerId ? { id: speakerId, name: nameOf(speakerId) } : null}
            lastSpeaker={lastLine ? { id: lastLine.speakerId, name: lastLine.speakerName } : null}
            compact={!!openStory}
          />
          <div className="room-transcript">
            <Transcript lines={state.lines} fromSeq={self.joinedAtSeq} />
          </div>
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
              shownPopup &&
              popupPerson && (
                <RecallPopup
                  key={shownPopup.expiresAt}
                  person={popupPerson}
                  chips={visibleChips(shownPopup, state.storyState?.stories ?? [])}
                  focusStoryId={shownPopup.focusStoryId}
                  onChip={tapChip}
                  onDismiss={dismiss}
                  hint={hint !== 'done'}
                />
              )
            )}
          </div>
          {closing && (
            <BurnOverlay
              startAt={closing.startedAt + BURN_START_MS}
              durationMs={BURN_DURATION_MS}
              seed={closing.seed}
              reducedMotion={!motion}
            />
          )}
          <BurnIgnition animated={motion} active={closing?.phase === 'ignite'} />
        </div>
        <div className="room-dock">
          {!isClosing && showTypeLine && onAddLine && <TypeLine onAddLine={onAddLine} />}
          <div className="room-talk">
            {!isClosing && voice?.state.preview && <p className="talk-preview">{voice.state.preview}</p>}
            {!isClosing && voice?.state.error && (
              <p role="alert" className="talk-error">
                {voice.state.error}
              </p>
            )}
            {!isClosing && voice?.state.failed.map((f, i) => (
              <button key={i} type="button" className="talk-retry" onClick={f.retry}>
                Not sent: “{f.line.text}” · tap to retry
              </button>
            ))}
            {isClosing ? (
              <button type="button" className="ptt" disabled>
                Room closed
              </button>
            ) : (
              <PushToTalkButton onPressChange={voice?.press ?? noop} />
            )}
          </div>
        </div>
      </main>
      {!entered && <EntryRitual onEnter={onEnter} />}
      {entered && ritualSeen && !exitDone && closing === null && (
        <div className="entry-ritual-exit" aria-hidden="true" onAnimationEnd={() => setExitDone(true)}>
          <LastSipCup size={96} mood="waiting" />
        </div>
      )}
    </>
  )
}
