import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptLine } from '../../../shared/schema'
import { SPEAKING_HOLD_MS, nextSpeaker, useLineSpeaking } from './speaking'

const line = (seq: number, speakerId: string): TranscriptLine => ({
  id: `l${seq}`,
  roomId: 'demo',
  speakerId,
  speakerName: speakerId,
  text: 'hi',
  seq,
  at: 0,
})

describe('nextSpeaker', () => {
  it('only records the newest line on first look, so a catch-up burst flashes nobody', () => {
    const r = nextSpeaker(null, [line(1, 'a'), line(2, 'b')], 0)
    expect(r).toEqual({ watch: { newestId: 'l2' }, startSpeaking: null })
  })
  it('starts the speaker of a new newest line', () => {
    const r = nextSpeaker({ newestId: 'l2' }, [line(1, 'a'), line(2, 'b'), line(3, 'c')], 0)
    expect(r).toEqual({ watch: { newestId: 'l3' }, startSpeaking: 'c' })
  })
  it('does nothing when the newest line is unchanged', () => {
    const r = nextSpeaker({ newestId: 'l3' }, [line(3, 'c')], 0)
    expect(r.startSpeaking).toBeNull()
  })
  it('ignores lines said before I joined', () => {
    const r = nextSpeaker({ newestId: null }, [line(16, 'a')], 16)
    expect(r).toEqual({ watch: { newestId: 'l16' }, startSpeaking: null })
  })
  it('handles an empty room', () => {
    expect(nextSpeaker(null, [], 0)).toEqual({ watch: { newestId: null }, startSpeaking: null })
  })
})

describe('useLineSpeaking', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup(initial: TranscriptLine[], joinedAtSeq = 0) {
    return renderHook(({ lines }) => useLineSpeaking(lines, joinedAtSeq), { initialProps: { lines: initial } })
  }

  it('highlights the speaker of a new line, then clears after the hold time', () => {
    const { result, rerender } = setup([line(1, 'a')])
    expect(result.current.speakerId).toBeNull()
    rerender({ lines: [line(1, 'a'), line(2, 'b')] })
    expect(result.current.speakerId).toBe('b')
    act(() => vi.advanceTimersByTime(SPEAKING_HOLD_MS - 1))
    expect(result.current.speakerId).toBe('b')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.speakerId).toBeNull()
  })

  it('moves the highlight to the next speaker and restarts the hold time', () => {
    const { result, rerender } = setup([])
    rerender({ lines: [line(1, 'a')] })
    act(() => vi.advanceTimersByTime(2000))
    rerender({ lines: [line(1, 'a'), line(2, 'b')] })
    expect(result.current.speakerId).toBe('b')
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current.speakerId).toBe('b')
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.speakerId).toBeNull()
  })

  it('does not flash anyone for lines already there when the screen opens', () => {
    const { result } = setup([line(17, 'a'), line(18, 'b')], 16)
    expect(result.current.speakerId).toBeNull()
  })
})
