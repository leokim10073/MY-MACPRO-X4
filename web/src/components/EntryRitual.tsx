import { useEffect, useRef } from 'react'
import LastSipCup from './art/LastSipCup'

/** The first thing anyone sees in a room: a compact welcome over the room, which stays inert until Enter. */
export default function EntryRitual({ onEnter }: { onEnter: () => void }) {
  const enter = useRef<HTMLButtonElement>(null)
  useEffect(() => enter.current?.focus(), [])
  return (
    <div className="entry-ritual">
      <div className="entry-welcome gw-panel">
        <LastSipCup size={104} mood="waiting" />
        <h2>Your seat's ready.</h2>
        <p>The host can end and delete this room for everyone with Last Sip.</p>
        <button type="button" ref={enter} className="entry-ritual-enter gw-btn gw-btn--primary" onClick={onEnter}>
          Enter room
        </button>
      </div>
    </div>
  )
}
