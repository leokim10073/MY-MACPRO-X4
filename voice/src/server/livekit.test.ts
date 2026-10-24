import { describe, expect, it } from 'vitest'
import { callRoomName, endCall, mintCallToken, type LiveKitConfig } from './livekit'

const cfg: LiveKitConfig = { url: 'wss://example.livekit.cloud', apiKey: 'APIkey123', apiSecret: 'secret'.repeat(8) }

function payloadOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
}

describe('callRoomName', () => {
  it('prefixes the room id', () => {
    expect(callRoomName('r1')).toBe('gw-r1')
  })
})

describe('mintCallToken', () => {
  it('mintCallToken token is limited to one room', async () => {
    const { url, token } = await mintCallToken(cfg, { roomId: 'r1', memberId: 'm_alex', name: 'Alex' })
    expect(url).toBe(cfg.url)
    const payload = payloadOf(token)
    expect(payload.sub).toBe('m_alex')
    expect(payload.name).toBe('Alex')
    expect(payload.video).toEqual({ room: 'gw-r1', roomJoin: true, canPublish: true, canSubscribe: true })
    expect((payload.exp as number) - (payload.nbf as number)).toBe(3600)
  })
})

describe('endCall', () => {
  it('endCall deletes the room', async () => {
    const deleted: string[] = []
    await endCall(cfg, 'r1', { client: { deleteRoom: async (name) => void deleted.push(name) } })
    expect(deleted).toEqual(['gw-r1'])
  })

  it('endCall tolerates a missing room', async () => {
    const missing = Object.assign(new Error('requested room does not exist'), { status: 404 })
    await expect(endCall(cfg, 'r1', { client: { deleteRoom: () => Promise.reject(missing) } })).resolves.toBeUndefined()
  })

  it('endCall rejects other errors', async () => {
    const down = Object.assign(new Error('unavailable'), { status: 503 })
    await expect(endCall(cfg, 'r1', { client: { deleteRoom: () => Promise.reject(down) } })).rejects.toThrow('unavailable')
  })
})
