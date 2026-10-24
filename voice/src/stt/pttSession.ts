import { Chunker } from '../audio/chunker'
import {
  CLOSE_TIMEOUT_MS,
  CONNECT_TIMEOUT_MS,
  FINALIZE_TIMEOUT_MS,
  STT_CHUNK_MS,
  STT_SAMPLE_RATE,
} from '../config'
import { TranscriptAssembler, parseInkMessage } from './ink'
import { SOCKET_OPEN, type SocketLike } from './socket'

export interface SessionResult {
  /** Final text from Ink, exactly as received. May be partial when `complete` is false. */
  text: string
  /** False when the connection failed or Ink didn't acknowledge the finalize in time. */
  complete: boolean
  error?: string
}

/**
 * One Ink connection for one push-to-talk segment (manual finalize endpoint).
 *
 * Audio can be pushed before the socket is open; it's queued in 100 ms chunks and sent as
 * soon as the connection is up, so nothing said while connecting is lost. `stop` sends
 * "finalize" and returns the text once Ink answers `flush_done`; it then sends "close" and
 * keeps the socket until `done`, because Ink drops buffered words if it's closed early.
 */
export class PttSession {
  /** Called with the speaker's own preview text (committed + in-progress guess). */
  onPreview: ((text: string) => void) | null = null

  private socket: SocketLike | null = null
  private readonly queue: Int16Array<ArrayBuffer>[] = []
  private readonly chunker = new Chunker((STT_SAMPLE_RATE * STT_CHUNK_MS) / 1000, (c) => this.sendAudio(c))
  private readonly transcript = new TranscriptAssembler()
  private accepting = true
  private aborted = false
  private error: string | undefined
  private stopping: Promise<SessionResult> | null = null

  private readonly opened = deferred<boolean>()
  /** True when Ink acknowledged the finalize, false when the socket closed first. */
  private readonly flushed = deferred<boolean>()
  private readonly closed = deferred<void>()

  constructor(connect: () => Promise<SocketLike>) {
    connect().then(
      (socket) => this.attach(socket),
      (err: unknown) => this.fail(err instanceof Error ? err.message : 'Could not connect'),
    )
  }

  push(samples: Int16Array): void {
    if (!this.accepting || samples.length === 0) return
    this.chunker.push(samples)
  }

  stop(): Promise<SessionResult> {
    this.stopping ??= this.finish()
    return this.stopping
  }

  /** Drops everything said in this segment and closes at once. Used on burn. */
  abort(): void {
    this.aborted = true
    this.accepting = false
    this.queue.length = 0
    this.closeSocket()
    this.opened.resolve(false)
    this.flushed.resolve(false)
    this.closed.resolve()
  }

  private async finish(): Promise<SessionResult> {
    this.accepting = false
    this.chunker.flush()

    const open = (await withTimeout(this.opened.promise, CONNECT_TIMEOUT_MS)) === true
    if (this.aborted) return { text: '', complete: false, error: 'Aborted' }
    if (!open) {
      this.closeSocket()
      return { text: this.transcript.text, complete: false, error: this.error ?? 'Connection timed out' }
    }

    this.sendText('finalize')
    const flushed = (await withTimeout(this.flushed.promise, FINALIZE_TIMEOUT_MS)) === true
    if (this.aborted) return { text: '', complete: false, error: 'Aborted' }

    // The text is complete at flush_done, so return it now and close in the background
    // instead of making the line wait another round trip for "done".
    this.sendText('close')
    void withTimeout(this.closed.promise, CLOSE_TIMEOUT_MS).then(() => this.closeSocket())
    const complete = flushed && !this.error
    return { text: this.transcript.text, complete, ...(this.error ? { error: this.error } : {}) }
  }

  private attach(socket: SocketLike): void {
    if (this.aborted) {
      socket.close()
      return
    }
    this.socket = socket
    socket.binaryType = 'arraybuffer'
    socket.onopen = () => {
      for (const chunk of this.queue.splice(0)) socket.send(chunk)
      this.opened.resolve(true)
    }
    socket.onmessage = (ev) => {
      const msg = parseInkMessage(ev.data)
      if (!msg) return
      if (msg.type === 'transcript') {
        this.transcript.apply(msg)
        this.onPreview?.(this.transcript.preview)
      } else if (msg.type === 'flush_done') {
        this.flushed.resolve(true)
      } else if (msg.type === 'done') {
        this.closed.resolve()
      } else {
        this.error = msg.message
      }
    }
    socket.onerror = () => {
      this.error ??= 'Connection error'
    }
    socket.onclose = () => {
      this.opened.resolve(false)
      this.flushed.resolve(false)
      this.closed.resolve()
    }
    // The socket may already be open by the time it's handed over.
    if (socket.readyState === SOCKET_OPEN) socket.onopen(new Event('open'))
  }

  private fail(message: string): void {
    this.error = message
    this.opened.resolve(false)
  }

  private sendAudio(chunk: Int16Array<ArrayBuffer>): void {
    if (this.aborted) return
    if (this.socket?.readyState === SOCKET_OPEN) this.socket.send(chunk)
    else this.queue.push(chunk)
  }

  private sendText(text: string): void {
    if (this.socket?.readyState === SOCKET_OPEN) this.socket.send(text)
  }

  private closeSocket(): void {
    const s = this.socket
    if (!s) return
    s.onopen = s.onmessage = s.onerror = s.onclose = null
    try {
      s.close()
    } catch {
      // Already closed.
    }
  }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let done = false
  const promise = new Promise<T>((r) => (resolve = r))
  return {
    promise,
    resolve: (value) => {
      if (done) return
      done = true
      resolve(value)
    },
  }
}

/** Resolves with the promise's value, or with null if it takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then((v) => {
      clearTimeout(timer)
      resolve(v)
    })
  })
}
