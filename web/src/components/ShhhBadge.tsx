import { useState } from 'react'
import LastSipCup from './art/LastSipCup'

/** The non-host's "Host ends room" chip; tapping it explains who can end the room. */
export default function ShhhBadge() {
  const [open, setOpen] = useState(false)
  return (
    <span className="shhh-badge">
      <button
        type="button"
        className="shhh-badge-button gw-chip"
        aria-label="About this room"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <LastSipCup size={22} mood="waiting" />
        Host ends room
      </button>
      <p role="status">
        {open ? (
          <>
            <strong>The host calls the last sip.</strong> They can end this room and delete its conversation for
            everyone.
          </>
        ) : (
          ''
        )}
      </p>
    </span>
  )
}
