import {
  GATE_HANG_MS,
  GATE_LEARN_WINDOW_MS,
  GATE_LOOKAHEAD_MS,
  GATE_MARGIN_DB,
  GATE_MAX_DB,
  GATE_MIN_SPEECH_MS,
  GATE_START_DB,
  GATE_STEP_DB,
  STT_CHUNK_MS,
} from '../config'

/** Loudness of a chunk in dBFS. Silence is -120. */
export function rmsDb(chunk: Int16Array): number {
  let sum = 0
  for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
  if (sum === 0 || chunk.length === 0) return -120
  return 20 * Math.log10(Math.sqrt(sum / chunk.length) / 32768)
}

/**
 * Blocks what's too quiet to be the owner (design 6.4): a passerby a metre away is quieter in
 * this phone's mic than its owner. Blocked audio becomes silence, since Ink needs a steady stream.
 *
 * Output lags input by a 200 ms look-ahead, so a word's soft start isn't cut, and the gate stays
 * open 500 ms after the last loud chunk. The threshold starts loose and learns from the owner's
 * own turns: 15 dB under their speech, kept between -55 and -30 dB, moved at most 6 dB per turn.
 */
export class LoudnessGate {
  private readonly lookahead: number
  private readonly hang: number
  private readonly windowChunks: number
  private readonly minSpeechChunks: number
  private readonly pending: { chunk: Int16Array<ArrayBuffer>; db: number; open: boolean }[] = []
  private index = 0
  private openUntil = -1
  private inTurn = false
  private heard: number[] = []
  private threshold = GATE_START_DB
  private speech: number | null = null
  private level = -120

  constructor(chunkMs = STT_CHUNK_MS) {
    this.lookahead = Math.round(GATE_LOOKAHEAD_MS / chunkMs)
    this.hang = Math.round(GATE_HANG_MS / chunkMs)
    this.windowChunks = Math.round(GATE_LEARN_WINDOW_MS / chunkMs)
    this.minSpeechChunks = Math.round(GATE_MIN_SPEECH_MS / chunkMs)
  }

  get thresholdDb(): number {
    return this.threshold
  }

  get speechDb(): number | null {
    return this.speech
  }

  get levelDb(): number {
    return this.level
  }

  /** Takes one chunk, returns the chunk from 200 ms ago (or zeros if blocked). Null while filling. */
  process(chunk: Int16Array<ArrayBuffer>): Int16Array<ArrayBuffer> | null {
    const db = rmsDb(chunk)
    this.level = db
    const loud = db >= this.threshold
    if (loud) {
      this.openUntil = this.index + this.hang
      for (const p of this.pending) p.open = true
    }
    this.pending.push({ chunk, db, open: loud || this.index <= this.openUntil })
    this.index++
    if (this.pending.length <= this.lookahead) return null
    const out = this.pending.shift()!
    if (!out.open) return new Int16Array(out.chunk.length)
    if (this.inTurn) {
      this.heard.push(out.db)
      if (this.heard.length > this.windowChunks) this.heard.shift()
    }
    return out.chunk
  }

  turnStarted(): void {
    this.inTurn = true
  }

  turnEnded(): void {
    if (!this.inTurn) return
    this.inTurn = false
    if (this.heard.length < this.minSpeechChunks) return
    const loudest = [...this.heard].sort((a, b) => b - a).slice(0, Math.ceil(this.heard.length / 3))
    this.speech = loudest[Math.floor(loudest.length / 2)]
    const target = Math.min(GATE_MAX_DB, Math.max(GATE_START_DB, this.speech - GATE_MARGIN_DB))
    const step = Math.max(-GATE_STEP_DB, Math.min(GATE_STEP_DB, target - this.threshold))
    this.threshold += step
  }

  /** A new mic (design 6.8): what was learned may not fit it. */
  reset(): void {
    this.pending.length = 0
    this.heard = []
    this.index = 0
    this.openUntil = -1
    this.inTurn = false
    this.threshold = GATE_START_DB
    this.speech = null
  }
}
