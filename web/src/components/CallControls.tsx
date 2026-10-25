import type { Call } from '../voice/useCall'
import { inCall } from '../voice/useCall'

interface Props {
  call: Call
}

// Shown before joining, at the moment of choice (the join screen's notice covers transcripts).
export const CALL_NOTICE =
  "Joining shares your voice live with friends in this room. Nothing is recorded, and live text isn't stored."

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
      {joined && state.participants.length > 0 && (
        <ul className="call-people" aria-label="In the call">
          {state.participants.map((p, i) => (
            <li key={p.id} className={p.speaking ? 'is-speaking' : undefined}>
              {i === 0 ? 'You' : p.name}
              {p.muted && <span className="call-muted"> (muted)</span>}
            </li>
          ))}
        </ul>
      )}
      {STATUS[state.status] && <p className="call-status">{STATUS[state.status]}</p>}
      {state.error && (
        <p role="alert" className="talk-error">
          {state.error}
        </p>
      )}
      {joined ? (
        <div className="call-buttons">
          <button
            type="button"
            className="ptt"
            aria-pressed={state.muted}
            onClick={() => call.setMuted(!state.muted)}
          >
            {state.muted ? 'Unmute' : 'Mute'}
          </button>
          <button type="button" className="call-leave gw-btn gw-btn--quiet" onClick={call.leave}>
            Leave call
          </button>
        </div>
      ) : (
        <>
          <p className="call-note">{CALL_NOTICE}</p>
          <button type="button" className="ptt" onClick={call.join}>
            Join call
          </button>
        </>
      )}
    </div>
  )
}
