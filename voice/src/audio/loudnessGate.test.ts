import { describe, expect, it } from 'vitest'
import { LoudnessGate, rmsDb } from './loudnessGate'

const N = 1600 // 100 ms at 16 kHz

/** A square wave whose RMS is `db` dBFS. */
function chunk(db: number): Int16Array<ArrayBuffer> {
  const a = Math.round(32768 * 10 ** (db / 20))
  const c = new Int16Array(N)
  for (let i = 0; i < N; i++) c[i] = i % 2 ? a : -a
  return c
}

const isZeros = (c: Int16Array | null) => !!c && c.every((v) => v === 0)

/** One turn of `seconds` of speech at `db`, as Ink would bracket it. */
function speak(gate: LoudnessGate, db: number, seconds: number) {
  gate.turnStarted()
  // Plus the look-ahead, so `seconds` of it comes out of the gate inside the turn.
  for (let i = 0; i < seconds * 10 + 2; i++) gate.process(chunk(db))
  gate.turnEnded()
}

describe('rmsDb', () => {
  it('rmsDb of full-scale square is about 0, of zeros is -120', () => {
    expect(rmsDb(new Int16Array(N).fill(32767))).toBeCloseTo(0, 1)
    expect(rmsDb(new Int16Array(N))).toBe(-120)
  })
})

describe('LoudnessGate', () => {
  it('loud chunk passes, quiet chunk becomes zeros', () => {
    const loud = new LoudnessGate()
    const outs = [chunk(-20), chunk(-20), chunk(-20)].map((c) => loud.process(c))
    expect(outs[0]).toBeNull()
    expect(outs[1]).toBeNull()
    expect(rmsDb(outs[2]!)).toBeCloseTo(-20, 0)

    const quiet = new LoudnessGate()
    const q = [chunk(-70), chunk(-70), chunk(-70)].map((c) => quiet.process(c))
    expect(isZeros(q[2])).toBe(true)
  })

  it('look-ahead opens 200 ms before a loud chunk', () => {
    const gate = new LoudnessGate()
    const outs = [-70, -70, -70, -70, -20, -70, -70].map((db) => gate.process(chunk(db)))
    // outs[k] is input k-2. Inputs 2 and 3 are the 200 ms before the loud input 4.
    expect(isZeros(outs[2])).toBe(true) // input 0
    expect(isZeros(outs[3])).toBe(true) // input 1
    expect(isZeros(outs[4])).toBe(false) // input 2
    expect(isZeros(outs[5])).toBe(false) // input 3
    expect(isZeros(outs[6])).toBe(false) // input 4
  })

  it('hang keeps 500 ms open after the last loud chunk', () => {
    const gate = new LoudnessGate()
    const inputs = [-20, ...Array(7).fill(-70)]
    const outs = [...inputs, -70, -70].map((db) => gate.process(chunk(db)))
    // Input 0 is loud; inputs 1..5 are held open, input 6 is closed.
    const out = (input: number) => outs[input + 2]
    for (let i = 1; i <= 5; i++) expect(isZeros(out(i))).toBe(false)
    expect(isZeros(out(6))).toBe(true)
  })

  it('no learning outside a turn', () => {
    const gate = new LoudnessGate()
    for (let i = 0; i < 100; i++) gate.process(chunk(-20))
    gate.turnEnded()
    expect(gate.thresholdDb).toBe(-55)
    expect(gate.speechDb).toBeNull()
  })

  it('no change before 3 s of speech', () => {
    const gate = new LoudnessGate()
    speak(gate, -20, 2.5)
    expect(gate.thresholdDb).toBe(-55)
  })

  it('learns speech − 15 dB in steps of at most 6 dB', () => {
    const gate = new LoudnessGate()
    const seen: number[] = []
    for (let t = 0; t < 4; t++) {
      speak(gate, -20, 3)
      seen.push(gate.thresholdDb)
    }
    expect(gate.speechDb).toBeCloseTo(-20, 0)
    expect(seen.map(Math.round)).toEqual([-49, -43, -37, -35])
  })

  it('never looser than -55 and never stricter than -30', () => {
    const soft = new LoudnessGate()
    for (let t = 0; t < 5; t++) speak(soft, -45, 3)
    expect(soft.thresholdDb).toBe(-55)

    const loud = new LoudnessGate()
    for (let t = 0; t < 10; t++) speak(loud, -3, 3)
    expect(loud.thresholdDb).toBe(-30)
  })

  it('reset returns to -55', () => {
    const gate = new LoudnessGate()
    for (let t = 0; t < 3; t++) speak(gate, -20, 3)
    expect(gate.thresholdDb).toBeGreaterThan(-55)
    gate.reset()
    expect(gate.thresholdDb).toBe(-55)
    expect(gate.speechDb).toBeNull()
    // Learning data is gone too: one short turn doesn't move it.
    speak(gate, -20, 1)
    expect(gate.thresholdDb).toBe(-55)
  })
})
