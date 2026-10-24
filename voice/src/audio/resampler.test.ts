import { describe, expect, it } from 'vitest'
import { Resampler, toInt16 } from './resampler'

describe('toInt16', () => {
  it('maps the float range onto 16-bit integers and clamps', () => {
    expect(toInt16(0)).toBe(0)
    expect(toInt16(1)).toBe(32767)
    expect(toInt16(-1)).toBe(-32768)
    expect(toInt16(2)).toBe(32767)
    expect(toInt16(-2)).toBe(-32768)
  })
})

describe('Resampler', () => {
  it('keeps a constant level and divides the length by the ratio', () => {
    const r = new Resampler(48000, 16000)
    const out = r.process(new Float32Array(4800).fill(0.5))
    expect(out.length).toBe(1600)
    expect(new Set(out)).toEqual(new Set([toInt16(0.5)]))
  })

  it('gives the same total length whether fed in one frame or many odd-sized ones (44.1 kHz)', () => {
    const input = new Float32Array(44100).map((_, i) => Math.sin(i / 10))
    const whole = new Resampler(44100, 16000).process(input)

    const r = new Resampler(44100, 16000)
    const parts: Int16Array[] = []
    for (let i = 0; i < input.length; i += 127) parts.push(r.process(input.subarray(i, i + 127)))
    const joined = Int16Array.from(parts.flatMap((p) => Array.from(p)))

    expect(whole.length).toBe(16000)
    expect(joined.length).toBe(whole.length)
    expect(Array.from(joined)).toEqual(Array.from(whole))
  })

  it('keeps a speech-range tone at its frequency', () => {
    const freq = 440
    const input = new Float32Array(48000).map((_, i) => Math.sin((2 * Math.PI * freq * i) / 48000))
    const out = new Resampler(48000, 16000).process(input)
    let crossings = 0
    for (let i = 1; i < out.length; i++) if (out[i - 1] < 0 !== out[i] < 0) crossings++
    // A 440 Hz tone crosses zero about 880 times a second.
    expect(crossings).toBeGreaterThan(860)
    expect(crossings).toBeLessThan(900)
  })

  it('refuses to upsample', () => {
    expect(() => new Resampler(8000, 16000)).toThrow()
  })
})
