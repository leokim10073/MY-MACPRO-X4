/** A microphone that hands out 16 kHz PCM frames. MicSource is the real one; tests use a fake. */
export interface AudioInput {
  /** Asks for the microphone. Must be called from a user gesture (iOS). Safe to call again. */
  start(): Promise<void>
  /** Subscribes to new frames. Returns an unsubscribe function. */
  onFrame(listener: (frame: Int16Array) => void): () => void
  /** The last PREROLL_MS of audio, oldest first. Held only in memory, never sent unless pressed. */
  preroll(): Int16Array
  /** Releases the microphone and forgets all held audio. */
  stop(): void
}
