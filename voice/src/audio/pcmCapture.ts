import { STT_SAMPLE_RATE } from '../config'
import { PCM_CAPTURE_PROCESSOR, pcmCaptureWorkletUrl } from './pcmCaptureWorklet'
import { Resampler } from './resampler'

const loaded = new WeakMap<AudioContext, Promise<void>>()

/** Loads the capture worklet into a context once, however many tracks it captures. */
function loadWorklet(ctx: AudioContext): Promise<void> {
  let p = loaded.get(ctx)
  if (!p) {
    const url = pcmCaptureWorkletUrl()
    p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))
    p.catch(() => loaded.delete(ctx))
    loaded.set(ctx, p)
  }
  return p
}

/**
 * Turns one audio track into 16 kHz PCM16 frames. The worklet's output goes to a muted gain,
 * which only keeps it running, so nothing is played back. Returns a function that disconnects.
 */
export async function startPcmCapture(
  ctx: AudioContext,
  track: MediaStreamTrack,
  onFrame: (frame: Int16Array) => void,
): Promise<() => void> {
  await loadWorklet(ctx)
  const resampler = new Resampler(ctx.sampleRate, STT_SAMPLE_RATE)
  const source = ctx.createMediaStreamSource(new MediaStream([track]))
  const node = new AudioWorkletNode(ctx, PCM_CAPTURE_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1 })
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(node).connect(mute).connect(ctx.destination)
  node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
    const frame = resampler.process(ev.data)
    if (frame.length) onFrame(frame)
  }
  return () => {
    node.port.onmessage = null
    source.disconnect()
    node.disconnect()
    mute.disconnect()
  }
}
