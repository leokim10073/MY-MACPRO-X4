/** The part of the browser WebSocket that a session uses, so tests can swap in a fake. */
export interface SocketLike {
  readonly readyState: number
  binaryType: BinaryType
  onopen: ((ev: Event) => void) | null
  onmessage: ((ev: MessageEvent) => void) | null
  onerror: ((ev: Event) => void) | null
  onclose: ((ev: CloseEvent) => void) | null
  send(data: string | ArrayBufferView<ArrayBuffer>): void
  close(code?: number, reason?: string): void
}

export const SOCKET_OPEN = 1

export type OpenSocket = (url: string) => SocketLike

export const openBrowserSocket: OpenSocket = (url) => new WebSocket(url)
