import { startPcmCapture } from './pcmCapture'

/**
 * 16 kHz PCM frames from whatever track is attached: the call's processed mic. `attach` again
 * with a new track after the system restarts the mic; listeners stay subscribed.
 */
export class TrackSource {
  private readonly listeners = new Set<(frame: Int16Array) => void>()
  private disconnect: (() => void) | null = null
  private generation = 0

  constructor(private readonly ctx: AudioContext) {}

  async attach(track: MediaStreamTrack): Promise<void> {
    this.detach()
    const gen = this.generation
    const stop = await startPcmCapture(this.ctx, track, (frame) => {
      for (const l of this.listeners) l(frame)
    })
    // Detached or re-attached while the worklet was loading.
    if (gen !== this.generation) stop()
    else this.disconnect = stop
  }

  onFrame(listener: (frame: Int16Array) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  detach(): void {
    this.generation++
    this.disconnect?.()
    this.disconnect = null
  }
}
