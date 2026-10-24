import { PREROLL_MS, STT_SAMPLE_RATE } from '../config'
import type { AudioInput } from './audioInput'
import { PCM_CAPTURE_PROCESSOR, pcmCaptureWorkletUrl } from './pcmCaptureWorklet'
import { Resampler } from './resampler'
import { SampleRing } from './sampleRing'

/**
 * The phone's microphone, turned into 16 kHz 16-bit mono frames.
 *
 * The stream stays open after the first press so later presses don't lose their first word
 * to getUserMedia start-up. Frames only leave this class through `onFrame` listeners and
 * `preroll`; the controller forwards them to Ink only while the button is held. Audio is
 * never written anywhere.
 */
export class MicSource implements AudioInput {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private starting: Promise<void> | null = null
  private readonly ring = new SampleRing((STT_SAMPLE_RATE * PREROLL_MS) / 1000)
  private readonly listeners = new Set<(frame: Int16Array) => void>()

  start(): Promise<void> {
    this.starting ??= this.open().catch((err: unknown) => {
      this.starting = null
      this.stop()
      throw err
    })
    return this.starting
  }

  onFrame(listener: (frame: Int16Array) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  preroll(): Int16Array {
    return this.ring.snapshot()
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.ctx?.close().catch(() => {})
    this.ctx = null
    this.starting = null
    this.ring.clear()
  }

  private async open(): Promise<void> {
    // iOS only lets audio start inside the user's tap, so the context is created and resumed
    // before the first await.
    const ctx = new AudioContext()
    this.ctx = ctx
    const resumed = ctx.resume()

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    })
    await resumed
    const workletUrl = pcmCaptureWorkletUrl()
    try {
      await ctx.audioWorklet.addModule(workletUrl)
    } finally {
      URL.revokeObjectURL(workletUrl)
    }

    const resampler = new Resampler(ctx.sampleRate, STT_SAMPLE_RATE)
    const source = ctx.createMediaStreamSource(this.stream)
    const capture = new AudioWorkletNode(ctx, PCM_CAPTURE_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1 })
    const mute = ctx.createGain()
    mute.gain.value = 0
    source.connect(capture).connect(mute).connect(ctx.destination)

    capture.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      const frame = resampler.process(ev.data)
      if (frame.length === 0) return
      this.ring.push(frame)
      for (const l of this.listeners) l(frame)
    }
  }
}
