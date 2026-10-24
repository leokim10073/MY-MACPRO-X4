import { describe, expect, it } from 'vitest'
import { decodeLive, encodeLive } from './liveText'

describe('liveText', () => {
  it('round-trips text and final', () => {
    expect(decodeLive(encodeLive({ text: 'Kevin ate', final: false }))).toEqual({ text: 'Kevin ate', final: false })
    expect(decodeLive(encodeLive({ text: '你好', final: true }))).toEqual({ text: '你好', final: true })
  })

  it('keeps only the last 1000 characters', () => {
    const long = 'a'.repeat(1500) + 'END'
    const got = decodeLive(encodeLive({ text: long, final: false }))!
    expect(got.text).toHaveLength(1000)
    expect(got.text.endsWith('END')).toBe(true)
  })

  it('rejects anything else', () => {
    const enc = new TextEncoder()
    expect(decodeLive(enc.encode('not json'))).toBeNull()
    expect(decodeLive(enc.encode('{"t":5}'))).toBeNull()
    expect(decodeLive(enc.encode('null'))).toBeNull()
  })
})
