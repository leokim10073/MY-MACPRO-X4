import type { Id, NewTranscriptLine } from '../../../shared/schema'
import type { AudioInput } from '../audio/audioInput'
import { MAX_SEGMENT_MS, TAIL_MS } from '../config'
import { buildSttUrl } from './ink'
import { LineSender, type FailedLine } from './lineSender'
import { PttSession } from './pttSession'
import { openBrowserSocket, type OpenSocket } from './socket'

export type PushToTalkStatus = 'idle' | 'starting' | 'talking' | 'error' | 'stopped'

export interface PushToTalkState {
  status: PushToTalkStatus
  /** True exactly while audio is being sent to Ink, including the short tail after release. */
  isListening: boolean
  /** What Ink has heard so far in the current press. Shown only on the speaker's own phone. */
  preview: string
  /** Lines waiting for the backend to accept them. */
  sending: number
  failed: readonly FailedLine[]
  error: string | null
}

export interface PushToTalkOptions {
  roomId: Id
  speakerId: Id
  mic: AudioInput
  /** Returns a valid STT access token (see TokenSource). */
  getToken(): Promise<string>
  /** Sends one finished line to the backend. Rejects on failure; LineSender retries. */
  sendLine(line: NewTranscriptLine): Promise<void>
  /** Names Ink should listen for, read fresh at the start of every press (see buildKeyterms). */
  keyterms?: () => string[]
  openSocket?: OpenSocket
  now?: () => number
}

interface Segment {
  session: PttSession
  at: number
}

/**
 * Push-to-talk for one phone. Each press becomes one Ink connection and one transcript line:
 *
 *   press → pre-roll + live audio → release → 300 ms tail → finalize → NewTranscriptLine
 *
 * A press longer than 60 s is split into several lines without a gap. Wire `press` to the
 * button's onPressChange and read state with `subscribe`/`getState` (shaped for React's
 * useSyncExternalStore).
 */
export class PushToTalk {
  private state: PushToTalkState = { status: 'idle', isListening: false, preview: '', sending: 0, failed: [], error: null }
  private readonly listeners = new Set<() => void>()
  private readonly sender: LineSender
  private readonly openSocket: OpenSocket
  private readonly now: () => number

  private pressed = false
  private micReady = false
  private unsubscribeMic: (() => void) | null = null
  private current: Segment | null = null
  private readonly finishing = new Set<PttSession>()
  private splitTimer: ReturnType<typeof setTimeout> | null = null
  private tailTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  constructor(private readonly opts: PushToTalkOptions) {
    this.openSocket = opts.openSocket ?? openBrowserSocket
    this.now = opts.now ?? Date.now
    this.sender = new LineSender(opts.sendLine, () =>
      this.update({ sending: this.sender.pending, failed: this.sender.failedLines }),
    )
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): PushToTalkState => this.state

  press = (down: boolean): void => {
    if (this.stopped) return
    this.pressed = down
    if (down) void this.onDown()
    else this.onUp()
  }

  /**
   * Ends everything at once, for burn or leaving the room: open connections are dropped
   * without finalizing, unsent lines are forgotten and the microphone is released.
   */
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.pressed = false
    this.clearTimers()
    this.current?.session.abort()
    this.current = null
    for (const s of this.finishing) s.abort()
    this.finishing.clear()
    this.unsubscribeMic?.()
    this.unsubscribeMic = null
    this.opts.mic.stop()
    this.sender.cancel()
    this.update({ status: 'stopped', isListening: false, preview: '', failed: [], error: null })
  }

  private async onDown(): Promise<void> {
    if (!this.micReady) {
      this.update({ status: 'starting', error: null })
      try {
        await this.opts.mic.start()
      } catch {
        this.update({ status: 'error', error: 'Microphone unavailable. Allow mic access, or type instead.' })
        return
      }
      if (this.stopped) return
      // Two quick presses can both wait on the same start; subscribe only once.
      if (!this.micReady) {
        this.micReady = true
        this.unsubscribeMic = this.opts.mic.onFrame((frame) => this.current?.session.push(frame))
      }
      // Released while the permission prompt was up: nothing to record.
      if (!this.pressed) {
        this.update({ status: 'idle' })
        return
      }
    }

    // Pressed again during the tail of the previous press: end that one now.
    if (this.tailTimer) {
      clearTimeout(this.tailTimer)
      this.tailTimer = null
      this.endSegment()
    }
    if (this.current) return

    this.beginSegment(this.opts.mic.preroll())
    this.update({ status: 'talking', isListening: true, preview: '', error: null })
  }

  private onUp(): void {
    if (!this.current || this.tailTimer) return
    this.clearSplitTimer()
    this.tailTimer = setTimeout(() => {
      this.tailTimer = null
      this.endSegment()
    }, TAIL_MS)
  }

  private beginSegment(preroll: Int16Array): void {
    const session = new PttSession(async () => {
      const token = await this.opts.getToken()
      return this.openSocket(buildSttUrl(token, this.opts.keyterms?.() ?? []))
    })
    session.onPreview = (text) => {
      if (this.current?.session === session) this.update({ preview: text })
    }
    session.push(preroll)
    this.current = { session, at: this.now() }
    this.splitTimer = setTimeout(() => this.split(), MAX_SEGMENT_MS)
  }

  /** Still held after 60 s: finish this line in the background and keep recording into a new one. */
  private split(): void {
    this.splitTimer = null
    const old = this.current
    if (!old) return
    this.current = null
    this.beginSegment(new Int16Array(0))
    this.update({ preview: '' })
    this.finish(old)
  }

  private endSegment(): void {
    const seg = this.current
    if (!seg) return
    this.current = null
    this.clearSplitTimer()
    this.update({ status: 'idle', isListening: false })
    this.finish(seg)
  }

  private finish(seg: Segment): void {
    this.finishing.add(seg.session)
    void seg.session.stop().then((result) => {
      this.finishing.delete(seg.session)
      if (this.stopped) return
      if (result.error && !result.text) {
        this.update({ error: 'Could not transcribe that. Please try again.' })
        return
      }
      this.sender.submit({ roomId: this.opts.roomId, speakerId: this.opts.speakerId, text: result.text, at: seg.at })
      if (!result.complete) this.update({ error: 'The end of that may be missing.' })
      if (!this.current) this.update({ preview: '' })
    })
  }

  private clearSplitTimer(): void {
    if (this.splitTimer) clearTimeout(this.splitTimer)
    this.splitTimer = null
  }

  private clearTimers(): void {
    this.clearSplitTimer()
    if (this.tailTimer) clearTimeout(this.tailTimer)
    this.tailTimer = null
  }

  private update(patch: Partial<PushToTalkState>): void {
    const next = { ...this.state, ...patch }
    const changed = (Object.keys(patch) as (keyof PushToTalkState)[]).some((k) => next[k] !== this.state[k])
    if (!changed) return
    this.state = next
    for (const l of this.listeners) l()
  }
}
