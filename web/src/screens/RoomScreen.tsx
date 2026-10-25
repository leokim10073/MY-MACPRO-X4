import { useCallback, useMemo, useRef, useState } from 'react'
import type { Member, Room } from '../../../shared/schema'
import BurnConfirm from '../components/BurnConfirm'
import LastSipClosing from '../components/LastSipClosing'
import EntryRitual from '../components/EntryRitual'
import LastSipCup from '../components/art/LastSipCup'
import type { AvatarLook } from '../components/art/Avatar'
import WindowLogo from '../components/art/WindowLogo'
import ConnectionBanner from '../components/ConnectionBanner'
import LeaveConfirm from '../components/LeaveConfirm'
import PushToTalkButton from '../components/PushToTalkButton'
import RecapBanner from '../components/RecapBanner'
import ShhhBadge from '../components/ShhhBadge'
import RecallBoard, { type Caption } from '../components/RecallBoard'
import TypeLine from '../components/TypeLine'
import StoryCard from '../components/StoryCard'
import RecallPopup from '../components/RecallPopup'
import RoomStage from '../components/RoomStage'
import { visibleChips } from '../recall/popup'
import { usePopup } from '../recall/usePopup'
import type { ConnectionStatus, VoiceTransport } from '../room/RoomClient'
import type { ClosingPhase } from '../room/closing'
import { useLineSpeaking, type SpeakingSignal } from '../room/speaking'
import { personById, recapFor, storiesById, type RoomState } from '../room/state'
import { latestLine } from '../room/derived'
import CallControls from '../components/CallControls'
import CopyInvite from '../components/CopyInvite'
import { useInstantRecalls } from '../recall/useInstantRecalls'
import { inCall, useCall } from '../voice/useCall'
import { useVoice } from '../voice/useVoice'
import DetailSheet from '../graph/DetailSheet'
import MapPanel from '../graph/MapPanel'
import ViewToggle from '../graph/ViewToggle'
import { useGraphModel } from '../graph/useGraphModel'
import { useSelection } from '../graph/useSelection'
import { useViewMode } from '../graph/useViewMode'

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
  /** The avatar picked on Join, kept on this phone only. */
  selfAvatar?: AvatarLook
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
  selfAvatar,
}: Props) {
  const isClosing = closing !== null
  const motion = motionOk()
  // No transport once closing: useVoice stops the mic.
  const voice = useVoice(isClosing ? undefined : transport, room, self, state)
  const call = useCall(isClosing ? undefined : transport, room, self, state)
  // The call is the only way to talk when the backend offers one; push-to-talk is left for the mock.
  const callMode = call !== null
  const inTheCall = callMode && inCall(call)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmBurn, setConfirmBurn] = useState(false)
  const burnControl = useRef<HTMLButtonElement>(null)
  const keepRoom = useCallback(() => {
    setConfirmBurn(false)
    burnControl.current?.focus()
  }, [])
  // The last end attempt failed: the sheet stays open and shows it (cleared on a new attempt or a fresh open).
  const [burnFailed, setBurnFailed] = useState(false)
  // When closing starts, any open sheet closes once. Leave can be opened again afterwards.
  const [wasClosing, setWasClosing] = useState(isClosing)
  if (wasClosing !== isClosing) {
    setWasClosing(isClosing)
    if (isClosing) {
      setConfirmLeave(false)
      setConfirmBurn(false)
    }
  }
  // A failed burn keeps the sheet open with the failure; a successful one ends this screen anyway.
  const [wasBurning, setWasBurning] = useState(false)
  if (wasBurning !== (pending === 'burn')) {
    setWasBurning(pending === 'burn')
    setBurnFailed(wasBurning && !!error)
  }
  // After Enter, a decorative icon shrinks toward the badge once, then goes away.
  const [ritualSeen, setRitualSeen] = useState(!entered)
  const [exitDone, setExitDone] = useState(false)
  if (!entered && !ritualSeen) setRitualSeen(true)
  const isHost = room.hostMemberId === self.id
  // Who ended the room, from data already here (the frozen state's members during closing).
  const hostName = state.members.find((m) => m.id === room.hostMemberId)?.name
  const endedBy = isHost ? 'You ended the room.' : hostName ? `${hostName} ended the room.` : 'The host ended the room.'
  const [peekedFor, setPeekedFor] = useState<string | null>(null)
  const [recapDismissed, setRecapDismissed] = useState(false)
  // The narrated recap plays by itself once; reopening the banner after a story card doesn't replay it.
  const [playedRecapId, setPlayedRecapId] = useState<string | null>(null)
  const myRecap = recapFor(state, self)
  const [replayStarted, setReplayStarted] = useState(false)
  // Friends' words in the call can trigger a pop-up mid-sentence; the AI's recalls still follow.
  const instantRecalls = useInstantRecalls(inTheCall ? call.state.live : undefined, state, self.id)
  const popupInput = useMemo(
    () => (instantRecalls.length > 0 ? { ...state, recalls: [...state.recalls, ...instantRecalls] } : state),
    [state, instantRecalls],
  )
  const { popup, dismiss, tapChip, openStoryId, openStory: openStoryCard, closeStory } = usePopup(popupInput, self)
  const shownPopup = isClosing ? null : popup
  const popupPerson = shownPopup ? personById(state, shownPopup.personId) : undefined
  const openStory = openStoryId && !isClosing ? storiesById(state).get(openStoryId) : undefined
  // The first pop-up of this session carries a hint; once it closes (tap, dismiss or fade) the hint is done.
  // Kept in memory only: leaving or reloading starts a new session.
  const [hint, setHint] = useState<'waiting' | 'showing' | 'done'>('waiting')
  if (hint === 'waiting' && popup) setHint('showing')
  if (hint === 'showing' && !popup) setHint('done')
  const lineSpeaking = useLineSpeaking(state.lines, self.joinedAtSeq)
  // In the call, the speaking signal comes from the call itself, not from the newest line.
  const callSpeaker = inTheCall ? call.state.participants.find((p) => p.speaking) : undefined
  const speakerId = callSpeaker?.id ?? (speaking ?? lineSpeaking).speakerId
  const newest = latestLine(state)
  const lastLine = newest && newest.seq > self.joinedAtSeq ? newest : undefined
  const nameOf = (id: string) =>
    state.members.find((m) => m.id === id)?.name ?? state.lines.find((l) => l.speakerId === id)?.speakerName ?? '?'
  // One caption instead of a transcript: a friend's words right now (in the call), else the newest line.
  const liveNow = inTheCall
    ? Object.entries(call.state.live).find(([id, l]) => id !== self.id && l.text.trim())
    : undefined
  const caption: Caption | null = liveNow
    ? { name: nameOf(liveNow[0]), text: liveNow[1].text, live: true }
    : lastLine
      ? { name: lastLine.speakerName, text: lastLine.text, live: false }
      : null
  // The relationship map (POC): only offered once ?view= is in the address, so the room is unchanged without it.
  const { view, explicit: offerMap, setView } = useViewMode()
  const { selection, select, close: clearSelection } = useSelection()
  const graph = useGraphModel(state.storyState, state.members)

  return (
    <>
      <main className="room" aria-hidden={entered ? undefined : true} inert={!entered}>
        <header className="room-header">
          <div className="room-header-top">
            <div className="room-brand">
              <WindowLogo size={34} />
              {/* The icon stands for the name so the three buttons fit beside it; screen readers still get it. */}
              <h1 className="sr-only">Gossip Window</h1>
            </div>
            <div className="room-header-actions">
              {inviteUrl && isHost && <CopyInvite url={inviteUrl} />}
              {isHost ? (
                !isClosing && (
                  <div className="room-actions">
                    <button
                      type="button"
                      className="burn"
                      ref={burnControl}
                      aria-describedby="last-sip-hint"
                      onClick={() => {
                        setBurnFailed(false)
                        setConfirmBurn(true)
                      }}
                    >
                      <LastSipCup size={24} mood="waiting" />
                      Last Sip
                    </button>
                    <span id="last-sip-hint" className="sr-only">
                      End this room for everyone.
                    </span>
                  </div>
                )
              ) : (
                <ShhhBadge />
              )}
              {onLeave && (
                <button type="button" className="leave gw-btn gw-btn--quiet" onClick={() => setConfirmLeave(true)}>
                  Leave
                </button>
              )}
            </div>
          </div>
        </header>
        <ConnectionBanner status={connection} onRejoin={onRejoin} />
        {error && !(isHost && confirmBurn) && (
          <p role="alert" className="error gw-alert">
            Couldn't end the room. Please try again.
          </p>
        )}
        {confirmLeave && onLeave && (
          <LeaveConfirm isHost={isHost} onLeave={onLeave} onStay={() => setConfirmLeave(false)} />
        )}
        {isHost && confirmBurn && (
          <BurnConfirm pending={pending === 'burn'} onBurn={onBurn} onKeep={keepRoom} failed={burnFailed} />
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
        <div className={isClosing ? 'room-board is-closing' : 'room-board'}>
          <div className="room-banner">
            {!recapDismissed && !isClosing && (
              <RecapBanner
                recap={myRecap}
                autoPlay={myRecap?.id !== playedRecapId}
                isLatecomer={self.joinedAtSeq > 0}
                onDismiss={() => setRecapDismissed(true)}
                collapsed={!!openStory && peekedFor !== openStory.id}
                onExpand={() => openStory && setPeekedFor(openStory.id)}
                onPlayingChange={(playing) => {
                  if (playing && myRecap) setPlayedRecapId(myRecap.id)
                  call?.duck(playing)
                }}
              />
            )}
          </div>
          <RoomStage
            members={state.members}
            self={self}
            speaker={!isClosing && speakerId ? { id: speakerId, name: nameOf(speakerId) } : null}
            lastSpeaker={lastLine ? { id: lastLine.speakerId, name: lastLine.speakerName } : null}
            compact={!!openStory}
            selfLook={selfAvatar}
            hostId={room.hostMemberId}
          />
          {/* The layout slot keeps its name; it now holds the shared recall board, not a transcript. */}
          <div className="room-transcript room-recalls">
            {offerMap && <ViewToggle view={view} onChange={setView} />}
            {offerMap && view === 'map' ? (
              <MapPanel
                roomId={room.id}
                model={graph}
                currentTopic={state.storyState?.currentTopic}
                caption={isClosing ? null : caption}
                selection={selection}
                onSelect={select}
                onClear={clearSelection}
                onShowList={() => setView('list')}
              />
            ) : (
              <RecallBoard
                storyState={state.storyState}
                recalls={state.recalls}
                self={self}
                latestSeq={newest?.seq ?? 0}
                caption={isClosing ? null : caption}
                onOpenStory={openStoryCard}
              />
            )}
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
          <LastSipClosing active={isClosing} animated={motion} endedBy={endedBy} />
        </div>
        <div className="room-dock">
          {!isClosing && showTypeLine && onAddLine && <TypeLine onAddLine={onAddLine} />}
          <div className="room-talk">
            {!isClosing && inTheCall && call.state.preview && <p className="talk-preview">{call.state.preview}</p>}
            {!isClosing && inTheCall && call.state.failed.map((f, i) => (
              <button key={`call-${i}`} type="button" className="talk-retry" onClick={f.retry}>
                Not sent: “{f.line.text}” · tap to retry
              </button>
            ))}
            {!isClosing && !callMode && voice?.state.preview && <p className="talk-preview">{voice.state.preview}</p>}
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
            ) : callMode ? (
              <CallControls call={call} />
            ) : (
              <PushToTalkButton onPressChange={voice?.press ?? noop} />
            )}
          </div>
        </div>
        {!isClosing && (
          <DetailSheet
            model={graph}
            selection={selection}
            onSelect={select}
            onClose={clearSelection}
            people={state.storyState?.people ?? []}
            self={self}
          />
        )}
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
