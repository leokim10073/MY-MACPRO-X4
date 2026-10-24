// Test double for an Ink turns socket. Only used by tests.
import { SOCKET_OPEN, type SocketLike } from './socket'

export class FakeTurnsSocket implements SocketLike {
  readyState = 0
  binaryType: BinaryType = 'blob'
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null

  /** Audio samples received, in order. */
  readonly audio: number[] = []
  /** Text commands received, parsed. */
  readonly commands: object[] = []
  closedByClient = false

  /**
   * `endOnClose`: how to answer {"type":"close"}. A string sends turn.end with that text, then
   * closes; null just closes; undefined (default) does nothing, like a server that never answers.
   */
  constructor(
    readonly url: string,
    private readonly opts: { endOnClose?: string | null } = {},
  ) {}

  open(): void {
    this.readyState = SOCKET_OPEN
    this.onopen?.(new Event('open'))
  }

  serverSend(msg: object): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(msg) }))
  }

  serverClose(): void {
    this.readyState = 3
    this.onclose?.(new CloseEvent('close'))
  }

  send(data: string | ArrayBufferView<ArrayBuffer>): void {
    if (this.readyState !== SOCKET_OPEN) throw new Error('send while not open')
    if (typeof data === 'string') {
      const cmd = JSON.parse(data) as { type?: string }
      this.commands.push(cmd)
      if (cmd.type === 'close' && this.opts.endOnClose !== undefined) {
        const text = this.opts.endOnClose
        queueMicrotask(() => {
          if (text !== null) this.serverSend({ type: 'turn.end', transcript: text })
          this.serverClose()
        })
      }
      return
    }
    this.audio.push(...Array.from(data as Int16Array))
  }

  close(): void {
    this.closedByClient = true
    this.readyState = 3
  }
}
