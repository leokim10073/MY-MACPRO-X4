import type { Call } from '../voice/useCall'
import { inCall } from '../voice/useCall'

interface Props {
  call: Call
}

const STATUS: Partial<Record<Call['state']['status'], string>> = {
  joining: 'Joining the call…',
  reconnecting: 'Reconnecting…',
}

export default function CallControls({ call }: Props) {
  const { state } = call
  const joined = inCall(call)

  return (
    <div className="call-controls">
      {state.needsTap && (
        <button type="button" className="call-resume gw-btn" onClick={call.resume}>
          Tap to resume the call
        </button>
      )}
      {STATUS[state.status] && <p className="call-status">{STATUS[state.status]}</p>}
      {state.error && (
        <p role="alert" className="talk-error">
          {state.error}
        </p>
      )}
      {/* Who is in the room and speaking is on the stage above; leaving is the header's Leave. */}
      {joined ? (
        <button type="button" className="ptt" aria-pressed={state.muted} onClick={() => call.setMuted(!state.muted)}>
          {/* The visible listening indicator: a red dot while this phone's mic is going to transcription. */}
          {state.isListening && <span className="listening-dot ptt-mic-dot" title="Mic on" aria-hidden="true" />}
          {state.muted ? 'Unmute' : 'Mute'}
        </button>
      ) : (
        <button type="button" className="ptt" onClick={call.join}>
          Join call
        </button>
      )}
    </div>
  )
}
