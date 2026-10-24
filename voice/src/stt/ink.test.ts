import { describe, expect, it } from 'vitest'
import { TranscriptAssembler, buildSttUrl, parseInkMessage } from './ink'

describe('buildSttUrl', () => {
  it('has the required parameters and repeats keyterm with %20 for spaces', () => {
    const url = buildSttUrl('tok/en+1', ['Kevin', 'Roommate Kevin'])
    expect(url.startsWith('wss://api.cartesia.ai/stt/websocket?')).toBe(true)
    expect(url).toContain('model=ink-2')
    expect(url).toContain('encoding=pcm_s16le')
    expect(url).toContain('sample_rate=16000')
    expect(url).toContain('cartesia_version=2026-08-14')
    expect(url).toContain('access_token=tok%2Fen%2B1')
    expect(url).toContain('keyterm=Kevin&keyterm=Roommate%20Kevin')
    expect(url).not.toContain('+')
  })
})

describe('parseInkMessage', () => {
  it('reads transcript, flush_done, done and error frames', () => {
    expect(parseInkMessage('{"type":"transcript","is_final":true,"text":" hi","request_id":"r"}')).toEqual({
      type: 'transcript',
      isFinal: true,
      text: ' hi',
    })
    expect(parseInkMessage('{"type":"flush_done","request_id":"r"}')).toEqual({ type: 'flush_done' })
    expect(parseInkMessage('{"type":"done"}')).toEqual({ type: 'done' })
    expect(parseInkMessage('{"type":"error","message":"bad"}')).toEqual({ type: 'error', message: 'bad' })
  })

  it('ignores binary, malformed and unknown frames', () => {
    expect(parseInkMessage(new ArrayBuffer(2))).toBeNull()
    expect(parseInkMessage('not json')).toBeNull()
    expect(parseInkMessage('{"type":"something_new"}')).toBeNull()
  })
})

describe('TranscriptAssembler', () => {
  it('appends final deltas exactly as received and keeps the guess separate', () => {
    const a = new TranscriptAssembler()
    a.apply({ type: 'transcript', isFinal: false, text: 'Okay I' })
    expect(a.text).toBe('')
    expect(a.preview).toBe('Okay I')
    a.apply({ type: 'transcript', isFinal: true, text: 'Okay, I have to' })
    a.apply({ type: 'transcript', isFinal: true, text: ' tell you about Kevin.' })
    a.apply({ type: 'transcript', isFinal: false, text: ' He' })
    expect(a.text).toBe('Okay, I have to tell you about Kevin.')
    expect(a.preview).toBe('Okay, I have to tell you about Kevin. He')
  })
})
