// Push-to-talk for the room screen, built on voice/'s PushToTalk controller.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Member, Room } from '../../../shared/schema'
import { MicSource } from '../../../voice/src/audio/micSource'
import { buildKeyterms } from '../../../voice/src/stt/keyterms'
import { PushToTalk, type PushToTalkState } from '../../../voice/src/stt/pushToTalk'
import { TokenSource } from '../../../voice/src/stt/tokenSource'
import type { VoiceTransport } from '../room/RoomClient'
import type { RoomState } from '../room/state'

export interface Voice {
  state: PushToTalkState
  press(down: boolean): void
}

const idle: PushToTalkState = { status: 'idle', isListening: false, preview: '', sending: 0, failed: [], error: null }
const noSubscribe = () => () => {}

/**
 * One PushToTalk per room and member. Stopped, with its token forgotten, when the room screen
 * goes away, which includes the burn. Returns null when the client has no voice (the mock).
 */
export function useVoice(transport: VoiceTransport | undefined, room: Room, self: Member, state: RoomState): Voice | null {
  const [ptt, setPtt] = useState<PushToTalk | null>(null)
  const latest = useRef(state)
  useEffect(() => {
    latest.current = state
  }, [state])

  useEffect(() => {
    if (!transport) return
    const tokens = new TokenSource(() => transport.sttToken())
    tokens.prefetch()
    const controller = new PushToTalk({
      roomId: room.id,
      speakerId: self.id,
      mic: new MicSource(),
      getToken: () => tokens.get(),
      sendLine: (line) => transport.addLine(line.text, line.at),
      keyterms: () => buildKeyterms(latest.current.members, latest.current.storyState?.people ?? []),
    })
    // Created here, not during render, so StrictMode's second mount gets a fresh controller.
    setPtt(controller)
    return () => {
      controller.stop()
      tokens.dispose()
    }
  }, [transport, room.id, self.id])

  const voiceState = useSyncExternalStore(ptt?.subscribe ?? noSubscribe, ptt?.getState ?? (() => idle))
  return ptt ? { state: voiceState, press: ptt.press } : null
}
