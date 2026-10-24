import type { Id, NewTranscriptLine, TranscriptLine } from '../../../shared/schema'
import { CallSession, type CallEvents, type CallLike, type CallParticipant, type NoiseFilterKind } from '../call/callSession'
import { Chunker } from '../audio/chunker'
import { LoudnessGate } from '../audio/loudnessGate'
import { STT_CHUNK_MS, STT_SAMPLE_RATE, TURN_START_THRESHOLD } from '../config'
import type { CallToken } from '../server/livekit'
import { LineSender, type FailedLine } from './lineSender'
import { openBrowserSocket, type OpenSocket } from './socket'
import { buildTurnsUrl } from './turns'
import { TurnSession } from './turnSession'

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
  /** What Ink has heard so far in my current turn. Shown only on my own phone. */
  preview: string
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
  private joining: Promise<void> | null = null
  private wantLeave = false
  private stopped = false
  private callReconnecting = false
  private inkReconnecting = false
  private startThreshold = TURN_START_THRESHOLD

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
    this.wantLeave = false
    const call = this.createCall()
    this.call = call
    // join runs first, with no await before it, so it stays inside the tap.
    const joined = call.join(this.opts.getCallToken(), this.callEvents())
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
      this.wantLeave = true
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
    this.unsubscribeFrames?.()
    this.unsubscribeFrames = null
    // Still joining: finishJoin leaves once the call is up.
    if (!this.joining) {
      void this.call?.leave()
      this.call = null
    }
    this.sender.cancel()
    this.update({ status: 'stopped', isListening: false, preview: '', failed: [], error: null, needsTap: false })
  }

  resume = async (): Promise<void> => {
    await this.call?.resume()
  }

  /** Lowers friends' voices while the recap plays in this phone's headset. */
  duck = (on: boolean): void => {
    void on
  }

  /** Every line_added from the backend. Used to split my open turn when someone cuts in. */
  noteLine = (line: TranscriptLine): void => {
    void line
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
      this.call = null
      await call.leave().catch(() => {})
      if (this.stopped) return
      this.update({
        status: 'error',
        isListening: false,
        error: err instanceof Error && err.message ? err.message : 'Could not join the call.',
      })
      return
    }
    if (this.stopped || this.wantLeave) {
      this.call = null
      await call.leave().catch(() => {})
      if (!this.stopped) this.update({ status: 'left', isListening: false })
      return
    }
    this.unsubscribeFrames = call.onFrame((frame) => {
      // Muted: nothing goes to Ink and nothing is learned.
      if (this.session) this.gateChunker.push(frame)
    })
    this.update({ noiseFilter: kind })
    this.startTurns()
  }

  private startTurns(): void {
    // Each connection keeps its own turn start time, so a connection still draining after a
    // quick mute and unmute sends its line with the right `at` and leaves the new one alone.
    let at = 0
    const session: TurnSession = new TurnSession(
      async (threshold) => {
        const token = await this.opts.getSttToken()
        return this.openSocket(buildTurnsUrl(token, this.opts.keyterms?.() ?? [], threshold))
      },
      {
        onStart: () => {
          at = this.now()
          this.gate.turnStarted()
        },
        onUpdate: (text) => {
          if (this.session === session) this.update({ preview: text })
        },
        onEnd: (text, complete) => {
          this.gate.turnEnded()
          this.updateDebug()
          if (this.stopped) return
          this.sender.submit({ roomId: this.opts.roomId, speakerId: this.opts.speakerId, text, at: at || this.now() })
          at = 0
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
    session.start()
    this.update({ isListening: true })
    this.refreshStatus()
  }

  private callEvents(): CallEvents {
    return {
      onParticipants: (participants) => this.update({ participants }),
      onRemoteSpeakingStarted: () => {},
      onReconnecting: (reconnecting) => {
        this.callReconnecting = reconnecting
        this.refreshStatus()
      },
      onDropped: (message) => void this.teardown('error', message),
      onMicRestarted: () => {
        this.gate.reset()
        this.updateDebug()
      },
      onNeedsTap: (needsTap) => this.update({ needsTap }),
    }
  }

  /** Ends the call: Ink is finished first (the last turn is sent), then LiveKit is left. */
  private async teardown(status: 'left' | 'error', error: string | null = null): Promise<void> {
    const call = this.call
    const session = this.session
    this.call = null
    this.session = null
    this.unsubscribeFrames?.()
    this.unsubscribeFrames = null
    this.callReconnecting = this.inkReconnecting = false
    this.update({ status, isListening: false, preview: '', participants: [], needsTap: false, error })
    await session?.close()
    await call?.leave().catch(() => {})
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
