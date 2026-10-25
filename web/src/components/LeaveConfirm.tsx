import { useEffect, useRef } from 'react'

interface Props {
  isHost: boolean
  onLeave: () => void
  onStay: () => void
}

// Asks before leaving. Stay gets focus, so a stray second tap or Enter keeps you in the room.
export default function LeaveConfirm({ isHost, onLeave, onStay }: Props) {
  const stay = useRef<HTMLButtonElement>(null)
  useEffect(() => stay.current?.focus(), [])

  return (
    <div className="leave-confirm gw-panel" role="alertdialog" aria-labelledby="leave-title" aria-describedby="leave-text">
      <strong id="leave-title">Leave this room?</strong>
      <p id="leave-text">
        You can rejoin with the invite link, and we'll spill the tea again.
        {isHost && " You're the host: if you leave, nobody else can end this room."}
      </p>
      <div className="leave-confirm-actions">
        <button type="button" ref={stay} className="gw-btn gw-btn--quiet" onClick={onStay}>
          Stay
        </button>
        <button type="button" className="leave-go gw-btn gw-btn--primary" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </div>
  )
}
