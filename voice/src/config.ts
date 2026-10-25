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
// Live call (stage 2, see voice/stage2-design.md)
// ---------------------------------------------------------------------------

/** Ink's turn_start_threshold (0.5–0.9). Higher means background sound starts fewer turns. */
export const TURN_START_THRESHOLD = 0.8

/** The loudness gate starts this loose and never gets looser. */
export const GATE_START_DB = -55

/** The gate never gets stricter than this. */
export const GATE_MAX_DB = -30

/** The learned threshold sits this far below the owner's speech level. */
export const GATE_MARGIN_DB = 15

/** The threshold moves at most this much after each turn. */
export const GATE_STEP_DB = 6

/** The gate only learns after this much of the owner's speech. */
export const GATE_MIN_SPEECH_MS = 3000

/** Speech older than this is forgotten when learning. */
export const GATE_LEARN_WINDOW_MS = 30_000

/** The gate looks this far ahead, so a word's soft start isn't clipped. Adds this much delay. */
export const GATE_LOOKAHEAD_MS = 200

/** The gate stays open this long after the last loud chunk. */
export const GATE_HANG_MS = 500

/** Audio kept while the Ink connection opens. Older audio is dropped. */
export const CONNECT_QUEUE_MS = 3000

/** A fresh Ink connection (new token, current keyterms) is opened between turns this often. */
export const INK_ROTATE_MS = 600_000

/** Waits before each reconnect attempt. The last value repeats. */
export const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 10_000]

/** How long mute and leave wait for Ink to send back the turn in progress. */
export const CLOSE_DRAIN_MS = 2000

/** An open turn is split at most this often when others cut in. */
export const SPLIT_MIN_GAP_MS = 1500

/** Friends' volume while the recap plays. */
export const DUCK_VOLUME = 0.3

export const KRISP_QUALITY = 'medium' as const

/** LiveKit tokens only need to last until the call is joined; LiveKit refreshes them after that. */
export const CALL_TOKEN_TTL_SECONDS = 3600

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
export const RECAP_OPENER_TEXT = 'Previously, on Spill the Tea.'

/** Live text over the call: a friend's finished turn stays this long if their line hasn't come. */
export const LIVE_FINAL_HOLD_MS = 4000
/** A friend's running live text with no update for this long is cleared. */
export const LIVE_STALE_MS = 10_000
/** Live text sent per update is cut to its last this-many characters. */
export const LIVE_MAX_CHARS = 1000
