import { describe, expect, it } from 'vitest'
import { buildTurnsUrl, parseTurnMessage } from './turns'

describe('buildTurnsUrl', () => {
  it('URL has the turns path, threshold 0.80 and %20 in keyterms', () => {
    const url = buildTurnsUrl('tok', ['Alex', 'Roommate Kevin'], 0.8)
    expect(url).toBe(
      'wss://api.cartesia.ai/stt/turns/websocket?model=ink-2&encoding=pcm_s16le&sample_rate=16000' +
        '&cartesia_version=2026-08-14&access_token=tok&turn_start_threshold=0.80&keyterm=Alex&keyterm=Roommate%20Kevin',
    )
  })
})

describe('parseTurnMessage', () => {
  const parse = (o: object) => parseTurnMessage(JSON.stringify(o))

  it('parses each turn event', () => {
    expect(parse({ type: 'turn.start' })).toEqual({ type: 'turn.start' })
    expect(parse({ type: 'turn.update', transcript: 'So Kevin', text: 'ignored' })).toEqual({ type: 'turn.update', text: 'So Kevin' })
    expect(parse({ type: 'turn.update', text: 'fallback' })).toEqual({ type: 'turn.update', text: 'fallback' })
    expect(parse({ type: 'turn.end', transcript: 'So Kevin walks.' })).toEqual({ type: 'turn.end', text: 'So Kevin walks.' })
    expect(parse({ type: 'turn.eager_end', transcript: 'x' })).toEqual({ type: 'turn.eager_end' })
    expect(parse({ type: 'turn.resume' })).toEqual({ type: 'turn.resume' })
  })

  it('error carries the message', () => {
    expect(parse({ type: 'error', message: 'bad token' })).toEqual({ type: 'error', message: 'bad token' })
    expect(parse({ type: 'error' })).toEqual({ type: 'error', message: 'Unknown Ink error' })
  })

  it('unknown, non-string and malformed frames return null', () => {
    expect(parse({ type: 'connected' })).toBeNull()
    expect(parseTurnMessage(new ArrayBuffer(2))).toBeNull()
    expect(parseTurnMessage('{not json')).toBeNull()
    expect(parseTurnMessage('null')).toBeNull()
  })
})
