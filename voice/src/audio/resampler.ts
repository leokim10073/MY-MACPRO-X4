/**
 * Turns the browser's float audio (usually 48 kHz) into 16-bit PCM at a lower rate for Ink.
 * Each output sample is the average of the input samples it covers, which also filters out
 * most of the high frequencies that would otherwise alias. Keeps state between calls, so
 * frames of any size can be fed in a row without clicks at the edges.
 */
export class Resampler {
  private readonly ratio: number
  private pending = new Float32Array(0)
  /** Where the next output sample starts inside `pending`, in input samples. Can be fractional. */
  private start = 0

  constructor(inputRate: number, outputRate: number) {
    if (!(inputRate > 0 && outputRate > 0)) throw new Error('Sample rates must be positive')
    if (outputRate > inputRate) throw new Error('Resampler only downsamples')
    this.ratio = inputRate / outputRate
  }

  process(input: Float32Array): Int16Array {
    const buf = new Float32Array(this.pending.length + input.length)
    buf.set(this.pending)
    buf.set(input, this.pending.length)

    const out = new Int16Array(Math.max(0, Math.floor((buf.length - this.start) / this.ratio)))
    let n = 0
    let start = this.start
    while (start + this.ratio <= buf.length + 1e-9 && n < out.length) {
      const end = start + this.ratio
      let sum = 0
      for (let i = Math.floor(start); i < end && i < buf.length; i++) {
        const overlap = Math.min(i + 1, end) - Math.max(i, start)
        sum += buf[i] * overlap
      }
      out[n++] = toInt16(sum / this.ratio)
      start = end
    }

    const consumed = Math.floor(start)
    this.pending = buf.slice(consumed)
    this.start = start - consumed
    return n === out.length ? out : out.slice(0, n)
  }
}

export function toInt16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample))
  return Math.round(s < 0 ? s * 0x8000 : s * 0x7fff)
}
