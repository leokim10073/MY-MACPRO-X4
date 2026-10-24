import { LIVE_MAX_CHARS } from '../config'

/**
 * What a phone's owner is saying right now, sent to the others in the call so everyone sees the
 * words as they're spoken. It goes over LiveKit only, to the people in the call, and is never
 * stored. `final` marks the turn's last text; the real line follows from the backend.
 */
export interface LiveText {
  text: string
  final: boolean
}

/** LiveKit data topic for live text. */
export const LIVE_TOPIC = 'live'

export function encodeLive(msg: LiveText): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify({ t: msg.text.slice(-LIVE_MAX_CHARS), f: msg.final }))
}

export function decodeLive(data: Uint8Array): LiveText | null {
  try {
    const raw: unknown = JSON.parse(new TextDecoder().decode(data))
    if (!raw || typeof raw !== 'object') return null
    const { t, f } = raw as { t?: unknown; f?: unknown }
    if (typeof t !== 'string') return null
    return { text: t.slice(-LIVE_MAX_CHARS), final: f === true }
  } catch {
    return null
  }
}
