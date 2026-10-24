import { Chunker } from '../audio/chunker'
import {
  CLOSE_DRAIN_MS,
  CONNECT_QUEUE_MS,
  INK_ROTATE_MS,
  RECONNECT_BACKOFF_MS,
  STT_CHUNK_MS,
  STT_SAMPLE_RATE,
  TURN_START_THRESHOLD,
} from '../config'
import { SOCKET_OPEN, type SocketLike } from './socket'
import { parseTurnMessage } from './turns'

export type TurnSessionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface TurnEvents {
  onStart(): void
  /** Ink's running guess for the open turn (cumulative). */
  onUpdate(text: string): void
  /** `complete` is false when the turn was cut short and `text` is the last guess. */
  onEnd(text: string, complete: boolean): void
  onStatus(status: TurnSessionStatus): void
}

const MAX_QUEUED = CONNECT_QUEUE_MS / STT_CHUNK_MS

/**
 * One Ink turn-detection connection for the whole call (stage 2).
 *
 * Audio is chunked to 100 ms and sent continuously; while connecting it's queued (up to 3 s).
 * A lost connection is reopened with backoff, and a turn cut off by it is reported with its
 * last guess. Every 10 minutes, between turns, a fresh connection replaces the old one so the
 * token and keyterms are current. `close` lets Ink finish the open turn; `abort` drops it.
 */
export class TurnSession {
  private socket: SocketLike | null = null
  private readonly queue: Int16Array<ArrayBuffer>[] = []
  private readonly chunker = new Chunker((STT_SAMPLE_RATE * STT_CHUNK_MS) / 1000, (c) => this.send(c))
  private startThreshold: number
  private turnOpen = false
  private lastUpdate = ''
  private attempt = 0
  private rotateDue = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private rotateTimer: ReturnType<typeof setTimeout> | null = null
  private closing: (() => void) | null = null
  private ended = false

  constructor(
    private readonly connect: (startThreshold: number) => Promise<SocketLike>,
    private readonly events: TurnEvents,
    opts: { startThreshold?: number } = {},
  ) {
    this.startThreshold = opts.startThreshold ?? TURN_START_THRESHOLD
  }

  start(): void {
    this.events.onStatus('connecting')
    void this.open()
  }

  push(samples: Int16Array): void {
    if (this.ended || samples.length === 0) return
    this.chunker.push(samples)
  }

  setStartThreshold(value: number): void {
    this.startThreshold = value
    this.sendText({ type: 'config', turn: { start_threshold: value } })
  }

  /** Mute or leave: asks Ink to finish the open turn, then closes. */
  async close(): Promise<void> {
    if (this.ended) return
    // The last partial chunk goes out before anything stops accepting audio.
    this.chunker.flush()
    this.ended = true
    this.clearTimers()
    const socket = this.socket
    if (socket?.readyState === SOCKET_OPEN) {
      const drained = new Promise<void>((resolve) => {
        this.closing = resolve
        setTimeout(resolve, CLOSE_DRAIN_MS)
      })
      this.sendText({ type: 'close' })
      await drained
    }
    this.closing = null
    this.cutTurn()
    this.drop(socket)
    this.socket = null
    this.events.onStatus('closed')
  }

  /** Burn: closes at once. Nothing more is reported. */
  abort(): void {
    this.ended = true
    this.clearTimers()
    this.queue.length = 0
    this.drop(this.socket)
    this.socket = null
  }

  private async open(): Promise<void> {
    let socket: SocketLike
    try {
      socket = await this.connect(this.startThreshold)
    } catch {
      this.retry()
      return
    }
    if (this.ended) {
      socket.close()
      return
    }
    this.socket = socket
    socket.binaryType = 'arraybuffer'
    socket.onopen = () => {
      this.attempt = 0
      for (const chunk of this.queue.splice(0)) socket.send(chunk)
      this.scheduleRotation()
      this.events.onStatus('open')
    }
    socket.onmessage = (ev) => this.onMessage(ev.data)
    socket.onclose = () => this.onClose(socket)
    // The socket may already be open by the time it's handed over.
    if (socket.readyState === SOCKET_OPEN) socket.onopen(new Event('open'))
  }

  private onMessage(data: unknown): void {
    const msg = parseTurnMessage(data)
    if (!msg) return
    switch (msg.type) {
      case 'turn.start':
        this.turnOpen = true
        this.lastUpdate = ''
        this.events.onStart()
        break
      case 'turn.update':
        this.lastUpdate = msg.text
        this.events.onUpdate(msg.text)
        break
      case 'turn.end':
        this.turnOpen = false
        this.lastUpdate = ''
        this.events.onEnd(msg.text, true)
        if (this.rotateDue && !this.ended) this.rotate()
        break
      default:
        // eager_end and resume are ignored (D14). Errors are followed by a close.
        break
    }
  }

  private onClose(socket: SocketLike): void {
    if (socket !== this.socket) return
    this.socket = null
    if (this.closing) {
      this.closing()
      return
    }
    if (this.ended) return
    this.cutTurn()
    this.retry()
  }

  /** A turn that never got its turn.end: report the last guess, unchanged. */
  private cutTurn(): void {
    if (this.turnOpen && this.lastUpdate) this.events.onEnd(this.lastUpdate, false)
    this.turnOpen = false
    this.lastUpdate = ''
  }

  private retry(): void {
    if (this.ended) return
    this.events.onStatus('reconnecting')
    const wait = RECONNECT_BACKOFF_MS[Math.min(this.attempt, RECONNECT_BACKOFF_MS.length - 1)]
    this.attempt++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.open()
    }, wait)
  }

  private scheduleRotation(): void {
    if (this.rotateTimer) clearTimeout(this.rotateTimer)
    this.rotateDue = false
    this.rotateTimer = setTimeout(() => {
      this.rotateTimer = null
      this.rotateDue = true
      if (!this.turnOpen) this.rotate()
    }, INK_ROTATE_MS)
  }

  /** Swaps in a fresh connection between turns. The old one has no open turn, so it's just closed. */
  private rotate(): void {
    this.rotateDue = false
    const old = this.socket
    this.socket = null
    if (old?.readyState === SOCKET_OPEN) {
      try {
        old.send(JSON.stringify({ type: 'close' }))
      } catch {
        // Already closing.
      }
    }
    this.drop(old)
    void this.open()
  }

  private send(chunk: Int16Array<ArrayBuffer>): void {
    if (this.ended) return
    if (this.socket?.readyState === SOCKET_OPEN) {
      this.socket.send(chunk)
      return
    }
    this.queue.push(chunk)
    if (this.queue.length > MAX_QUEUED) this.queue.shift()
  }

  private sendText(msg: object): void {
    if (this.socket?.readyState === SOCKET_OPEN) this.socket.send(JSON.stringify(msg))
  }

  private drop(socket: SocketLike | null): void {
    if (!socket) return
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
    try {
      socket.close()
    } catch {
      // Already closed.
    }
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.rotateTimer) clearTimeout(this.rotateTimer)
    this.retryTimer = this.rotateTimer = null
  }
}
