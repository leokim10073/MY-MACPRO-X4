// Every Cartesia setting and voice tuning number in one place. See voice/process.md for the reasoning.

export const CARTESIA_API_BASE = 'https://api.cartesia.ai'
export const CARTESIA_WS_BASE = 'wss://api.cartesia.ai'
export const CARTESIA_VERSION = '2026-08-14'

// ---------------------------------------------------------------------------
// Speech-to-text (Ink)
// ---------------------------------------------------------------------------

export const STT_MODEL = 'ink-2'
export const STT_ENCODING = 'pcm_s16le'
export const STT_SAMPLE_RATE = 16000

/** Audio goes to Ink in chunks of this length (Cartesia recommends about 100 ms). */
export const STT_CHUNK_MS = 100

/** Browser tokens only grant STT and live this long. Covers one full 60 s segment. */
export const STT_TOKEN_TTL_SECONDS = 120

/** A cached token is replaced when it has less than this long left. */
export const TOKEN_REFRESH_MARGIN_MS = 10_000

/** Ink accepts at most this many keyterms per connection, and this many characters in total. */
export const KEYTERM_MAX_COUNT = 100
export const KEYTERM_MAX_CHARS = 1200

// ---------------------------------------------------------------------------
// Push-to-talk
// ---------------------------------------------------------------------------

/** Audio kept in memory while the button is up, so the first word isn't cut off. Never sent unless pressed. */
export const PREROLL_MS = 300

/** Audio still sent after release, because people let go before their last word ends. */
export const TAIL_MS = 300

/** A press longer than this is split into several lines. */
export const MAX_SEGMENT_MS = 60_000

/** How long to wait for the socket to open, for "finalize" to be acknowledged and for "close" to finish. */
export const CONNECT_TIMEOUT_MS = 5000
export const FINALIZE_TIMEOUT_MS = 3000
export const CLOSE_TIMEOUT_MS = 2000

/** Sending a finished line to the backend: retries after these waits, then gives up and shows it as failed. */
export const SEND_RETRY_DELAYS_MS = [500, 1500]

// ---------------------------------------------------------------------------
// Text-to-speech (Sonic)
// ---------------------------------------------------------------------------

/** Dated snapshot so the voice can't change before the demo. */
export const TTS_MODEL = 'sonic-3.6-2026-08-27'
export const TTS_LANGUAGE = 'en'
export const TTS_MP3_FORMAT = { container: 'mp3', sample_rate: 44100, bit_rate: 128000 } as const

/** Narrator candidates from Cartesia's recommended stable voices. The team picks one with `npm run tts:audition`. */
export const NARRATOR_CANDIDATES = {
  daniel: '47c38ca4-5f35-497b-b1a3-415245fb35e1',
  skylar: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',
  archie: 'ef191366-f52f-447a-a398-ed8c0f2943a1',
  gemma: '62ae83ad-4f6a-430b-af41-a9bede9286ca',
} as const

/** Placeholder until the team picks a voice. Change only this line. */
export const NARRATOR_VOICE_ID: string = NARRATOR_CANDIDATES.daniel

/** Fixed intro played while the real recap is being generated. Contains no conversation content. */
export const RECAP_OPENER_TEXT = 'Previously, on Gossip Window.'
