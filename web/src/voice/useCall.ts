// The always-on voice call for the room screen, built on voice/'s OpenMic controller.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Member, Room } from '../../../shared/schema'
import { buildKeyterms } from '../../../voice/src/stt/keyterms'
import { OpenMic, type OpenMicState } from '../../../voice/src/stt/openMic'
import { TokenSource } from '../../../voice/src/stt/tokenSource'
import type { VoiceTransport } from '../room/RoomClient'
import type { RoomState } from '../room/state'

export interface Call {
  state: OpenMicState
  /** Call straight from the "Join call" tap: iOS only starts audio inside it. */
  join(): void
  leave(): void
  setMuted(muted: boolean): void
  resume(): void
  /** Lowers friends' voices while the recap plays. */
  duck(on: boolean): void
}

const noSubscribe = () => () => {}

/**
 * One OpenMic per room and member, created only when the backend offers a call. Stopped, with
 * its token forgotten, when the room screen goes away, which includes the burn. Every new
 * transcript line is passed to noteLine so a turn that someone cuts into is split in order.
 */
export function useCall(transport: VoiceTransport | undefined, room: Room, self: Member, state: RoomState): Call | null {
  const [mic, setMic] = useState<OpenMic | null>(null)
  const latest = useRef(state)
  useEffect(() => {
    latest.current = state
  }, [state])

  useEffect(() => {
    const callToken = transport?.callToken
    if (!transport || !callToken) return
    const tokens = new TokenSource(() => transport.sttToken())
    const controller = new OpenMic({
      roomId: room.id,
      speakerId: self.id,
      getSttToken: () => tokens.get(),
      getCallToken: () => callToken(),
      sendLine: (line) => transport.addLine(line.text, line.at),
      keyterms: () => buildKeyterms(latest.current.members, latest.current.storyState?.people ?? []),
    })
    // Created here, not during render, so StrictMode's second mount gets a fresh controller.
    setMic(controller)
    return () => {
      controller.stop()
      tokens.dispose()
    }
  }, [transport, room.id, self.id])

  // Lines already in the room when a controller starts don't count as interruptions.
  const seen = useRef<{ mic: OpenMic; seq: number } | null>(null)
  useEffect(() => {
    if (!mic) return
    const top = state.lines.at(-1)?.seq ?? 0
    if (seen.current?.mic !== mic) {
      seen.current = { mic, seq: top }
      return
    }
    for (const line of state.lines) {
      if (line.seq > seen.current.seq) mic.noteLine(line)
    }
    seen.current.seq = Math.max(seen.current.seq, top)
  }, [mic, state.lines])

  const callState = useSyncExternalStore(mic?.subscribe ?? noSubscribe, mic?.getState ?? (() => null))
  if (!mic || !callState) return null
  return {
    state: callState,
    join: () => void mic.join(),
    leave: () => void mic.leave(),
    setMuted: (muted) => void mic.setMuted(muted),
    resume: () => void mic.resume(),
    duck: mic.duck,
  }
}

/** True while the phone is in, or getting into, the call. */
export function inCall(call: Call | null): boolean {
  const s = call?.state.status
  return s === 'joining' || s === 'in_call' || s === 'reconnecting'
}
