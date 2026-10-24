import { describe, expect, it, vi } from 'vitest'
import { CartesiaError, countWords, mintSttToken, mp3Seconds, synthesizeRecap, synthesizeSpeech } from './cartesia'

function fakeFetch(response: Response) {
  return vi.fn<typeof fetch>(async () => response)
}

function sentBody(f: ReturnType<typeof fakeFetch>) {
  const init = f.mock.calls[0][1] as RequestInit
  return { init, body: JSON.parse(init.body as string), headers: init.headers as Record<string, string> }
}

describe('mintSttToken', () => {
  it('asks for an STT-only token and reports when it expires', async () => {
    const f = fakeFetch(Response.json({ token: 'tok' }))
    const t = await mintSttToken('sk_test', { fetchImpl: f, now: () => 1_000 })
    expect(t).toEqual({ token: 'tok', expiresAt: 121_000 })
    expect(f.mock.calls[0][0]).toBe('https://api.cartesia.ai/access-token')
    const { init, body, headers } = sentBody(f)
    expect(init.method).toBe('POST')
    expect(body).toEqual({ grants: { stt: true }, expires_in: 120 })
    expect(headers.Authorization).toBe('Bearer sk_test')
    expect(headers['Cartesia-Version']).toBe('2026-08-14')
  })

  it('throws a CartesiaError with the status and message', async () => {
    const f = fakeFetch(Response.json({ message: 'Invalid API key' }, { status: 401 }))
    const err = await mintSttToken('bad', { fetchImpl: f }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CartesiaError)
    expect((err as CartesiaError).status).toBe(401)
    expect((err as Error).message).toContain('Invalid API key')
  })
})

describe('synthesizeSpeech', () => {
  it('requests neutral MP3 narration of the exact text', async () => {
    const f = fakeFetch(new Response(new Uint8Array([1, 2, 3])))
    const mp3 = await synthesizeSpeech('sk', 'Alex has been telling stories.', { voiceId: 'v1', fetchImpl: f })
    expect(Array.from(mp3)).toEqual([1, 2, 3])
    expect(f.mock.calls[0][0]).toBe('https://api.cartesia.ai/tts/bytes')
    const { body } = sentBody(f)
    expect(body).toEqual({
      model_id: 'sonic-3.6-2026-08-27',
      transcript: 'Alex has been telling stories.',
      voice: { id: 'v1' },
      language: 'en',
      output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
    })
  })

  it('only sends generation_config when a speed is given, and never an emotion', async () => {
    const f = fakeFetch(new Response(new Uint8Array([0])))
    await synthesizeSpeech('sk', 'Hi.', { speed: 1.1, fetchImpl: f })
    expect(sentBody(f).body.generation_config).toEqual({ speed: 1.1 })
  })
})

describe('synthesizeRecap', () => {
  it('flags recaps over the word limit but still reads them in full', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ')
    const f = fakeFetch(new Response(new Uint8Array([9])))
    const r = await synthesizeRecap('sk', long, { fetchImpl: f })
    expect(r).toMatchObject({ words: 60, overLimit: true })
    expect(sentBody(f).body.transcript).toBe(long)
  })
})

describe('helpers', () => {
  it('counts words and estimates MP3 length', () => {
    expect(countWords('  Kevin ate\nthe cake. ')).toBe(4)
    expect(mp3Seconds(16_000)).toBe(1)
  })
})
