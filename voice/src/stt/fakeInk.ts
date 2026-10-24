// Test double for an Ink manual-finalize socket. Only used by tests.
import { SOCKET_OPEN, type SocketLike } from './socket'

export class FakeInkSocket implements SocketLike {
  readyState = 0
  binaryType: BinaryType = 'blob'
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null

  /** Audio samples received, in order. */
  readonly audio: number[] = []
  /** Text commands received, in order. */
  readonly commands: string[] = []
  closedByClient = false

  /** When set, answers "finalize" with this final text then flush_done, and "close" with done. */
  constructor(
    readonly url: string,
    private readonly reply: { finalText?: string; ackFinalize?: boolean; ackClose?: boolean } = {},
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
      this.commands.push(data)
      if (data === 'finalize' && this.reply.ackFinalize !== false) {
        queueMicrotask(() => {
          if (this.reply.finalText) this.serverSend({ type: 'transcript', is_final: true, text: this.reply.finalText })
          this.serverSend({ type: 'flush_done' })
        })
      }
      if (data === 'close' && this.reply.ackClose !== false) {
        queueMicrotask(() => {
          this.serverSend({ type: 'done' })
          this.serverClose()
        })
      }
      return
    }
    const view = data as Int16Array
    this.audio.push(...Array.from(view))
  }

  close(): void {
    this.closedByClient = true
    this.readyState = 3
  }
}
