// The Ink turn-detection protocol (stage 2): connection URL and incoming messages.
// https://docs.cartesia.ai/api-reference/stt/turns/websocket.md
import {
  CARTESIA_VERSION,
  CARTESIA_WS_BASE,
  STT_ENCODING,
  STT_MODEL,
  STT_SAMPLE_RATE,
} from '../config'

/** Builds the WebSocket URL. Keyterms are encoded with %20 for spaces, as the docs require. */
export function buildTurnsUrl(token: string, keyterms: readonly string[], startThreshold: number): string {
  const params: [string, string][] = [
    ['model', STT_MODEL],
    ['encoding', STT_ENCODING],
    ['sample_rate', String(STT_SAMPLE_RATE)],
    ['cartesia_version', CARTESIA_VERSION],
    ['access_token', token],
    ['turn_start_threshold', startThreshold.toFixed(2)],
    ...keyterms.map((k): [string, string] => ['keyterm', k]),
  ]
  const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  return `${CARTESIA_WS_BASE}/stt/turns/websocket?${query}`
}

export type TurnMessage =
  | { type: 'turn.start' }
  | { type: 'turn.update'; text: string }
  | { type: 'turn.end'; text: string }
  | { type: 'turn.eager_end' }
  | { type: 'turn.resume' }
  | { type: 'error'; message: string }

/** Parses one text frame from Ink. Unknown or malformed frames return null. */
export function parseTurnMessage(data: unknown): TurnMessage | null {
  if (typeof data !== 'string') return null
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const msg = raw as Record<string, unknown>
  const text = typeof msg.transcript === 'string' ? msg.transcript : typeof msg.text === 'string' ? msg.text : ''
  switch (msg.type) {
    case 'turn.start':
    case 'turn.eager_end':
    case 'turn.resume':
      return { type: msg.type }
    case 'turn.update':
    case 'turn.end':
      return { type: msg.type, text }
    case 'error':
      return { type: 'error', message: typeof msg.message === 'string' ? msg.message : 'Unknown Ink error' }
    default:
      return null
  }
}
