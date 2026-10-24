/** Collects samples and hands them on in fixed-size chunks. `flush` sends whatever is left. */
export class Chunker {
  private buf: Int16Array<ArrayBuffer>
  private filled = 0

  constructor(
    chunkSamples: number,
    private readonly onChunk: (chunk: Int16Array<ArrayBuffer>) => void,
  ) {
    this.buf = new Int16Array(chunkSamples)
  }

  push(samples: Int16Array): void {
    let offset = 0
    while (offset < samples.length) {
      const take = Math.min(this.buf.length - this.filled, samples.length - offset)
      this.buf.set(samples.subarray(offset, offset + take), this.filled)
      this.filled += take
      offset += take
      if (this.filled === this.buf.length) {
        this.onChunk(this.buf)
        this.buf = new Int16Array(this.buf.length)
        this.filled = 0
      }
    }
  }

  flush(): void {
    if (this.filled === 0) return
    this.onChunk(this.buf.slice(0, this.filled))
    this.filled = 0
  }
}
