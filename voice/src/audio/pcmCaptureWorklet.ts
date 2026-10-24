// Source of the AudioWorklet that runs on the audio thread. Kept as a string and loaded from a
// Blob URL, so it works the same in this test page, in web's bundle and on iOS Safari.
// It collects mono float samples and posts them in batches of about 20 ms. Its output is
// silent; it only keeps the node running.
const source = `
const BATCH = 1024
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(BATCH)
    this.filled = 0
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel) {
      let offset = 0
      while (offset < channel.length) {
        const take = Math.min(BATCH - this.filled, channel.length - offset)
        this.buf.set(channel.subarray(offset, offset + take), this.filled)
        this.filled += take
        offset += take
        if (this.filled === BATCH) {
          this.port.postMessage(this.buf, [this.buf.buffer])
          this.buf = new Float32Array(BATCH)
          this.filled = 0
        }
      }
    }
    return true
  }
}
registerProcessor('pcm-capture', PcmCapture)
`

export const PCM_CAPTURE_PROCESSOR = 'pcm-capture'

export function pcmCaptureWorkletUrl(): string {
  return URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))
}
