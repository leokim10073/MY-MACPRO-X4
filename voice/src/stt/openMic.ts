import type { Id, NewTranscriptLine, TranscriptLine } from '../../../shared/schema'
import { CallSession, type CallEvents, type CallLike, type CallParticipant, type NoiseFilterKind } from '../call/callSession'
import { Chunker } from '../audio/chunker'
import { LoudnessGate } from '../audio/loudnessGate'
import type { LiveText } from '../call/liveText'
import { DUCK_VOLUME, LIVE_FINAL_HOLD_MS, LIVE_STALE_MS, STT_CHUNK_MS, STT_SAMPLE_RATE, TURN_START_THRESHOLD } from '../config'
import type { CallToken } from '../server/livekit'
import { LineSender, type FailedLine } from './lineSender'
import { openBrowserSocket, type OpenSocket } from './socket'
import { buildTurnsUrl } from './turns'
import { TurnSession } from './turnSession'
import { TurnSplitter } from './turnSplitter'

export type OpenMicStatus = 'idle' | 'joining' | 'in_call' | 'reconnecting' | 'left' | 'stopped' | 'error'

/** Live numbers for the voice test page. */
export interface OpenMicDebug {
  gateDb: number
  speechDb: number | null
  levelDb: number
  inkConnects: number
}

export interface OpenMicState {
  status: OpenMicStatus
  muted: boolean
  /** True exactly while this phone's audio is going to Ink: in the call and not muted. */
  isListening: boolean
  /** Everyone in the call, self first. */
  participants: readonly CallParticipant[]
  /** What Ink has heard so far in my current turn. */
  preview: string
  /**
   * What each friend is saying right now, by Member.id, as they speak. A `final` entry is their
   * finished turn, kept until its real line arrives (see noteLine) or 4 s pass.
   */
  live: Readonly<Record<Id, LiveText>>
  noiseFilter: NoiseFilterKind | null
  /** The browser blocked audio; show a button that calls `resume`. */
  needsTap: boolean
  /** Lines waiting for the backend to accept them. */
  sending: number
  failed: readonly FailedLine[]
  error: string | null
  debug: OpenMicDebug
}

export interface OpenMicOptions {
  roomId: Id
  speakerId: Id
  /** Returns a valid STT access token (see TokenSource). */
  getSttToken(): Promise<string>
  /** LiveKit URL and token for this room's call, from the backend. */
  getCallToken(): Promise<CallToken>
  /** Sends one finished line to the backend. Rejects on failure; LineSender retries. */
  sendLine(line: NewTranscriptLine): Promise<void>
  /** Names Ink should listen for, read fresh on every new Ink connection (see buildKeyterms). */
  keyterms?: () => string[]
  createCall?: () => CallLike
  openSocket?: OpenSocket
  now?: () => number
}

const MAYBE_MISSING = 'The end of that may be missing.'

/**
 * The live call for one phone (stage 2), the counterpart of PushToTalk:
 *
 *   "Join call" → LiveKit call with Krisp → the same cleaned mic → loudness gate → Ink turn detection → lines
 *
 * Each phone transcribes only its owner, so every line has the right speaker. Mute closes Ink
 * (D16); leave lets the last turn finish; stop (burn) drops everything. Read state with
 * `subscribe`/`getState` (shaped for React's useSyncExternalStore).
 */
export class OpenMic {
  private state: OpenMicState = {
    status: 'idle',
    muted: false,
    isListening: false,
    participants: [],
    preview: '',
    live: {},
    noiseFilter: null,
    needsTap: false,
    sending: 0,
    failed: [],
    error: null,
    debug: { gateDb: 0, speechDb: null, levelDb: -120, inkConnects: 0 },
  }
  private readonly listeners = new Set<() => void>()
  private readonly sender: LineSender
  private readonly openSocket: OpenSocket
  private readonly now: () => number
  private readonly createCall: () => CallLike
  /** Learns this phone's owner across mutes and reconnects; reset only for a new mic. */
  private readonly gate = new LoudnessGate()
  private readonly gateChunker = new Chunker((STT_SAMPLE_RATE * STT_CHUNK_MS) / 1000, (c) => this.gated(c))

  private call: CallLike | null = null
  private unsubscribeFrames: (() => void) | null = null
  private session: TurnSession | null = null
  /** The current connection's splitter; a connection still draining after mute keeps its own. */
  private splitter: TurnSplitter | null = null
  private joining: Promise<void> | null = null
  private stopped = false
  private callReconnecting = false
  private inkReconnecting = false
  private startThreshold = TURN_START_THRESHOLD
  private readonly liveTimers = new Map<Id, ReturnType<typeof setTimeout>>()
  private lastSentLive = ''
  private ducked = false

  constructor(private readonly opts: OpenMicOptions) {
    this.openSocket = opts.openSocket ?? openBrowserSocket
    this.now = opts.now ?? Date.now
    this.createCall = opts.createCall ?? (() => new CallSession())
    this.sender = new LineSender(opts.sendLine, () =>
      this.update({ sending: this.sender.pending, failed: this.sender.failedLines }),
    )
    this.state = { ...this.state, debug: { ...this.state.debug, gateDb: this.gate.thresholdDb } }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): OpenMicState => this.state

  /** Joins the call. Call it straight from the "Join call" tap: iOS only starts audio there. */
  join = (): Promise<void> => {
    if (this.stopped) return Promise.resolve()
    if (this.joining) return this.joining
    if (this.call) return Promise.resolve()
    const call = this.createCall()
    this.call = call
    // join runs first, with no await before it, so it stays inside the tap.
    const joined = call.join(this.opts.getCallToken(), this.callEvents(call))
    this.update({ status: 'joining', error: null, muted: false })
    this.joining = this.finishJoin(call, joined).finally(() => {
      this.joining = null
    })
    return this.joining
  }

  setMuted = async (muted: boolean): Promise<void> => {
    if (muted === this.state.muted || !this.inCall()) {
      this.update({ muted })
      return
    }
    this.update({ muted })
    if (muted) {
      const session = this.session
      this.session = null
      this.splitter = null
      this.inkReconnecting = false
      this.update({ isListening: false, preview: '' })
      this.refreshStatus()
      await Promise.all([this.call!.setMuted(true), session?.close()])
    } else {
      await this.call!.setMuted(false)
      // Muted again, or the call ended, while LiveKit was unmuting.
      if (this.state.muted || !this.inCall() || this.session) return
      this.startTurns()
    }
  }

  /** Leaves the call. The turn in progress is finished and sent; unsent lines keep retrying. */
  leave = async (): Promise<void> => {
    if (this.joining) {
      // Leaving ends the join right away; finishJoin sees it and settles on 'left'.
      const call = this.call
      this.call = null
      await call?.leave().catch(() => {})
      await this.joining
      return
    }
    if (!this.call) return
    await this.teardown('left')
  }

  /** Burn: ends everything at once. Nothing more is sent and unsent lines are forgotten. */
  stop = (): void => {
    if (this.stopped) return
    this.stopped = true
    this.session?.abort()
    this.session = null
    this.splitter = null
    this.unsubscribeFrames?.()
    this.unsubscribeFrames = null
    // Also while joining: leaving ends the join, and the call's events are ignored from now on.
    void this.call?.leave().catch(() => {})
    this.call = null
    this.sender.cancel()
    this.clearAllLive()
    this.update({ status: 'stopped', isListening: false, preview: '', failed: [], error: null, needsTap: false })
  }

  resume = async (): Promise<void> => {
    await this.call?.resume()
  }

  /** Lowers friends' voices while the recap plays in this phone's headset. */
  duck = (on: boolean): void => {
    this.ducked = on
    this.call?.setRemoteVolume(on ? DUCK_VOLUME : 1)
  }

  /** Every line_added from the backend. Used to split my open turn when someone cuts in. */
  noteLine = (line: TranscriptLine): void => {
    // A friend's split part arrives while they're still talking: keep showing their live text.
    if (this.state.live[line.speakerId]?.final) this.clearLive(line.speakerId)
    // Backup trigger: LiveKit's speaking event may have been missed or come late.
    if (line.speakerId !== this.opts.speakerId) this.split()
  }

  /** Ink's turn_start_threshold, applied live. */
  setStartThreshold = (value: number): void => {
    this.startThreshold = value
    this.session?.setStartThreshold(value)
  }

  private async finishJoin(call: CallLike, joined: Promise<NoiseFilterKind>): Promise<void> {
    let kind: NoiseFilterKind
    try {
      kind = await joined
    } catch (err) {
      // Stop or leave during the join already left the call.
      if (this.call !== call) {
        if (!this.stopped) this.update({ status: 'left', isListening: false })
        return
      }
      this.call = null
      await call.leave().catch(() => {})
      this.update({
        status: 'error',
        isListening: false,
        error: err instanceof Error && err.message ? err.message : 'Could not join the call.',
      })
      return
    }
    if (this.call !== call) {
      if (!this.stopped) this.update({ status: 'left', isListening: false })
      return
    }
    if (this.state.muted) {
      // Muted while joining: the track goes quiet and Ink isn't opened until unmute.
      await call.setMuted(true)
      if (this.call !== call) return
    }
    this.unsubscribeFrames = call.onFrame((frame) => {
      // Muted: nothing goes to Ink and nothing is learned.
      if (this.session) this.gateChunker.push(frame)
    })
    // The recap may have started while we were joining.
    if (this.ducked) call.setRemoteVolume(DUCK_VOLUME)
    this.update({ noiseFilter: kind })
    if (this.state.muted) this.refreshStatus()
    else this.startTurns()
  }

  private startTurns(): void {
    // Each connection keeps its own turn (start time, what a split already sent), so one still
    // draining after a quick mute and unmute sends its line right and leaves the new one alone.
    const splitter = new TurnSplitter(this.now)
    const session: TurnSession = new TurnSession(
      async (threshold) => {
        const token = await this.opts.getSttToken()
        return this.openSocket(buildTurnsUrl(token, this.opts.keyterms?.() ?? [], threshold))
      },
      {
        onStart: () => {
          splitter.start(this.now())
          this.gate.turnStarted()
        },
        onUpdate: (text) => {
          splitter.update(text)
          if (this.session !== session) return
          // After a split, the part already sent is a line of its own.
          const rest = splitter.unsent(text)
          this.update({ preview: rest })
          if (rest !== this.lastSentLive) {
            this.lastSentLive = rest
            this.call?.sendLive({ text: rest, final: false })
          }
        },
        onEnd: (text, complete) => {
          this.gate.turnEnded()
          this.updateDebug()
          if (this.stopped) return
          // A turn.end without a turn.start is still a line.
          const part = splitter.open ? splitter.end(text) : text.trim() ? { text, at: this.now() } : null
          this.lastSentLive = ''
          this.call?.sendLive({ text: part?.text ?? '', final: true })
          if (part) this.submit(part)
          if (!complete) this.update({ error: MAYBE_MISSING })
          if (this.session === session) this.update({ preview: '' })
        },
        onStatus: (status) => {
          if (this.session !== session) return
          if (status === 'open') {
            this.update({ debug: { ...this.state.debug, inkConnects: this.state.debug.inkConnects + 1 } })
          }
          this.inkReconnecting = status === 'reconnecting'
          this.refreshStatus()
        },
      },
      { startThreshold: this.startThreshold },
    )
    this.session = session
    this.splitter = splitter
    session.start()
    this.update({ isListening: true })
    this.refreshStatus()
  }

  /** Events from a call we've left (stop or leave while joining) are ignored. */
  private callEvents(call: CallLike): CallEvents {
    const current = () => this.call === call
    return {
      onParticipants: (participants) => {
        if (!current()) return
        this.update({ participants })
        const here = new Set(participants.map((p) => p.id))
        for (const id of Object.keys(this.state.live)) if (!here.has(id)) this.clearLive(id)
      },
      onLive: (id, live) => current() && this.showLive(id, live),
      onRemoteSpeakingStarted: () => current() && this.split(),
      onReconnecting: (reconnecting) => {
        if (!current()) return
        this.callReconnecting = reconnecting
        this.refreshStatus()
      },
      onDropped: (message) => current() && void this.teardown('error', message),
      onMicRestarted: () => {
        if (!current()) return
        this.gate.reset()
        this.updateDebug()
      },
      onNeedsTap: (needsTap) => current() && this.update({ needsTap }),
    }
  }

  /** Ends the call: Ink is finished first (the last turn is sent), then LiveKit is left. */
  private async teardown(status: 'left' | 'error', error: string | null = null): Promise<void> {
    const call = this.call
    const session = this.session
    this.call = null
    this.session = null
    this.splitter = null
    this.unsubscribeFrames?.()
    this.unsubscribeFrames = null
    this.callReconnecting = this.inkReconnecting = false
    this.clearAllLive()
    this.update({ status, isListening: false, preview: '', participants: [], needsTap: false, error })
    await session?.close()
    await call?.leave().catch(() => {})
  }

  /** Someone cut in: what I've said so far in this turn becomes a line now. */
  private split(): void {
    if (this.stopped || this.state.muted || !this.session || !this.splitter) return
    const part = this.splitter.split()
    if (part) this.submit(part)
  }

  private submit(part: { text: string; at: number }): void {
    this.sender.submit({ roomId: this.opts.roomId, speakerId: this.opts.speakerId, ...part })
  }

  private showLive(id: Id, live: LiveText): void {
    const timer = this.liveTimers.get(id)
    if (timer) clearTimeout(timer)
    this.liveTimers.delete(id)
    if (!live.text) {
      this.clearLive(id)
      return
    }
    this.update({ live: { ...this.state.live, [id]: live } })
    // A final waits for its line; a running guess that stops updating (their message lost, their
    // phone locked mid-turn) goes away too.
    const hold = live.final ? LIVE_FINAL_HOLD_MS : LIVE_STALE_MS
    this.liveTimers.set(id, setTimeout(() => this.clearLive(id), hold))
  }

  private clearLive(id: Id): void {
    const timer = this.liveTimers.get(id)
    if (timer) clearTimeout(timer)
    this.liveTimers.delete(id)
    if (!(id in this.state.live)) return
    const { [id]: _gone, ...rest } = this.state.live
    this.update({ live: rest })
  }

  private clearAllLive(): void {
    for (const t of this.liveTimers.values()) clearTimeout(t)
    this.liveTimers.clear()
    this.update({ live: {} })
  }

  private gated(chunk: Int16Array<ArrayBuffer>): void {
    const out = this.gate.process(chunk)
    this.updateDebug()
    if (out) this.session?.push(out)
  }

  private updateDebug(): void {
    const { thresholdDb, speechDb, levelDb } = this.gate
    const d = this.state.debug
    if (d.gateDb === thresholdDb && d.speechDb === speechDb && d.levelDb === levelDb) return
    this.update({ debug: { ...d, gateDb: thresholdDb, speechDb, levelDb } })
  }

  private inCall(): boolean {
    return !!this.call && !this.joining && (this.state.status === 'in_call' || this.state.status === 'reconnecting')
  }

  private refreshStatus(): void {
    if (!this.call) return
    if (this.state.status !== 'in_call' && this.state.status !== 'reconnecting' && this.state.status !== 'joining') return
    const reconnecting = this.callReconnecting || (this.inkReconnecting && !!this.session)
    this.update({ status: reconnecting ? 'reconnecting' : 'in_call' })
  }

  private update(patch: Partial<OpenMicState>): void {
    const next = { ...this.state, ...patch }
    const changed = (Object.keys(patch) as (keyof OpenMicState)[]).some((k) => next[k] !== this.state[k])
    if (!changed) return
    this.state = next
    for (const l of this.listeners) l()
  }
}
