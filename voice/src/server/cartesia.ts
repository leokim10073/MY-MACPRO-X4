// Server-only Cartesia calls. These need the API key, so they must never run in the browser.
// Written as plain functions so the backend can call them from a Convex action unchanged.
import { RECAP_MAX_WORDS } from '../../../shared/schema'
import {
  CARTESIA_API_BASE,
  CARTESIA_VERSION,
  NARRATOR_VOICE_ID,
  STT_TOKEN_TTL_SECONDS,
  TTS_LANGUAGE,
  TTS_MODEL,
  TTS_MP3_FORMAT,
} from '../config'
import type { SttToken } from '../stt/tokenSource'

type Fetch = typeof fetch

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Cartesia-Version': CARTESIA_VERSION,
    'Content-Type': 'application/json',
  }
}

/** Error from Cartesia, without any of the request text. */
export class CartesiaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function failure(res: Response, what: string): Promise<CartesiaError> {
  let detail = ''
  try {
    const body = (await res.json()) as { message?: string; title?: string }
    detail = body.message ?? body.title ?? ''
  } catch {
    // Not JSON.
  }
  return new CartesiaError(res.status, `${what} failed (${res.status})${detail ? `: ${detail}` : ''}`)
}

/**
 * Mints a short-lived token that only allows speech-to-text. The backend must check that the
 * caller is a member of an active (not burned) room before calling this.
 */
export async function mintSttToken(
  apiKey: string,
  { fetchImpl = fetch, ttlSeconds = STT_TOKEN_TTL_SECONDS, now = Date.now }: { fetchImpl?: Fetch; ttlSeconds?: number; now?: () => number } = {},
): Promise<SttToken> {
  // Counted from before the request, so the client never thinks the token lives longer than it does.
  const issuedAt = now()
  const res = await fetchImpl(`${CARTESIA_API_BASE}/access-token`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ grants: { stt: true }, expires_in: ttlSeconds }),
  })
  if (!res.ok) throw await failure(res, 'Token request')
  const body = (await res.json()) as { token?: unknown }
  if (typeof body.token !== 'string') throw new CartesiaError(502, 'Token response had no token')
  return { token: body.token, expiresAt: issuedAt + ttlSeconds * 1000 }
}

export interface SpeechOptions {
  voiceId?: string
  /** generation_config.speed, 0.6–1.5. Leave unset unless the team tuned it. Emotion is never set. */
  speed?: number
  fetchImpl?: Fetch
}

/**
 * Reads text aloud with Sonic and returns MP3 bytes. The text is read exactly as given:
 * no emotion, no added sounds, so the narrator stays neutral.
 */
export async function synthesizeSpeech(apiKey: string, text: string, opts: SpeechOptions = {}): Promise<Uint8Array> {
  const { voiceId = NARRATOR_VOICE_ID, speed, fetchImpl = fetch } = opts
  const res = await fetchImpl(`${CARTESIA_API_BASE}/tts/bytes`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model_id: TTS_MODEL,
      transcript: text,
      voice: { id: voiceId },
      language: TTS_LANGUAGE,
      output_format: TTS_MP3_FORMAT,
      ...(speed !== undefined ? { generation_config: { speed } } : {}),
    }),
  })
  if (!res.ok) throw await failure(res, 'Speech request')
  return new Uint8Array(await res.arrayBuffer())
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Turns a recap into narrator audio. A recap over RECAP_MAX_WORDS is still read in full
 * (cutting it could change its meaning), but `overLimit` tells the caller to report it to
 * the AI owner so the prompt can be fixed.
 */
export async function synthesizeRecap(
  apiKey: string,
  recapText: string,
  opts: SpeechOptions = {},
): Promise<{ mp3: Uint8Array; words: number; overLimit: boolean }> {
  const words = countWords(recapText)
  const mp3 = await synthesizeSpeech(apiKey, recapText, opts)
  return { mp3, words, overLimit: words > RECAP_MAX_WORDS }
}

/** Approximate length of MP3 audio at the bit rate we request. */
export function mp3Seconds(bytes: number): number {
  return (bytes * 8) / TTS_MP3_FORMAT.bit_rate
}
