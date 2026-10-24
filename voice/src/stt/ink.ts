// The Ink realtime STT protocol (manual finalize): connection URL, incoming messages and
// turning transcript deltas into one line. https://docs.cartesia.ai/api-reference/stt/websocket.md
import {
  CARTESIA_VERSION,
  CARTESIA_WS_BASE,
  STT_ENCODING,
  STT_MODEL,
  STT_SAMPLE_RATE,
} from '../config'

/** Builds the WebSocket URL. Keyterms are encoded with %20 for spaces, as the docs require. */
export function buildSttUrl(token: string, keyterms: readonly string[] = []): string {
  const params: [string, string][] = [
    ['model', STT_MODEL],
    ['encoding', STT_ENCODING],
    ['sample_rate', String(STT_SAMPLE_RATE)],
    ['cartesia_version', CARTESIA_VERSION],
    ['access_token', token],
    ...keyterms.map((k): [string, string] => ['keyterm', k]),
  ]
  const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  return `${CARTESIA_WS_BASE}/stt/websocket?${query}`
}

export type InkMessage =
  | { type: 'transcript'; isFinal: boolean; text: string }
  | { type: 'flush_done' }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** Parses one text frame from Ink. Unknown or malformed frames return null. */
export function parseInkMessage(data: unknown): InkMessage | null {
  if (typeof data !== 'string') return null
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const msg = raw as Record<string, unknown>
  switch (msg.type) {
    case 'transcript':
      return {
        type: 'transcript',
        isFinal: msg.is_final === true,
        text: typeof msg.text === 'string' ? msg.text : '',
      }
    case 'flush_done':
      return { type: 'flush_done' }
    case 'done':
      return { type: 'done' }
    case 'error':
      return { type: 'error', message: typeof msg.message === 'string' ? msg.message : 'Unknown Ink error' }
    default:
      return null
  }
}

/**
 * Joins Ink's transcript deltas. Final pieces are appended exactly as received, with no
 * trimming or added spaces (Cartesia's rule). The latest non-final piece is only shown locally.
 */
export class TranscriptAssembler {
  private finalText = ''
  private pendingText = ''

  apply(msg: InkMessage): void {
    if (msg.type !== 'transcript') return
    if (msg.isFinal) {
      this.finalText += msg.text
      this.pendingText = ''
    } else {
      this.pendingText = msg.text
    }
  }

  /** Text Ink has committed to. This is what becomes the transcript line. */
  get text(): string {
    return this.finalText
  }

  /** Committed text plus the guess in progress, for the speaker's own screen only. */
  get preview(): string {
    return this.finalText + this.pendingText
  }
}
