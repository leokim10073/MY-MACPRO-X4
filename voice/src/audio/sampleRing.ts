/** Fixed-size buffer that always holds the most recent samples. Used for the push-to-talk pre-roll. */
export class SampleRing {
  private readonly buf: Int16Array
  private writeAt = 0
  private filled = 0

  constructor(capacity: number) {
    this.buf = new Int16Array(capacity)
  }

  push(samples: Int16Array): void {
    const cap = this.buf.length
    if (cap === 0) return
    const src = samples.length > cap ? samples.subarray(samples.length - cap) : samples
    const first = Math.min(src.length, cap - this.writeAt)
    this.buf.set(src.subarray(0, first), this.writeAt)
    this.buf.set(src.subarray(first), 0)
    this.writeAt = (this.writeAt + src.length) % cap
    this.filled = Math.min(cap, this.filled + src.length)
  }

  /** A copy of what's held, oldest first. */
  snapshot(): Int16Array {
    const out = new Int16Array(this.filled)
    const start = (this.writeAt - this.filled + this.buf.length) % this.buf.length
    const first = Math.min(this.filled, this.buf.length - start)
    out.set(this.buf.subarray(start, start + first))
    out.set(this.buf.subarray(0, this.filled - first), first)
    return out
  }

  clear(): void {
    this.buf.fill(0)
    this.writeAt = 0
    this.filled = 0
  }
}
