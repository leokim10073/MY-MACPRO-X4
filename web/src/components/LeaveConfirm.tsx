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
    <div className="leave-confirm" role="alertdialog" aria-labelledby="leave-title" aria-describedby="leave-text">
      <strong id="leave-title">Leave this room?</strong>
      <p id="leave-text">
        You can rejoin with the invite link, and you'll get a new catch-up.
        {isHost && " You're the host: if you leave, nobody can burn this room until it expires."}
      </p>
      <div className="leave-confirm-actions">
        <button type="button" ref={stay} onClick={onStay}>
          Stay
        </button>
        <button type="button" className="leave-go" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </div>
  )
}
