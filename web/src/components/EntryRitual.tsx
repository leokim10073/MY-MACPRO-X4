import { useEffect, useRef } from 'react'
import ShhhIcon from './ShhhIcon'

const RULES = [
  'This room stays private until the host burns it.',
  'When it burns, the transcript, stories and catch-ups are deleted for everyone.',
  "Only text is kept while it's open, never audio.",
  "Burning can't reach screenshots, recordings or memories.",
]

/** The first thing anyone sees in a room. A full-screen overlay; the room behind is inert until Enter. */
export default function EntryRitual({ onEnter }: { onEnter: () => void }) {
  const enter = useRef<HTMLButtonElement>(null)
  useEffect(() => enter.current?.focus(), [])
  return (
    <div className="entry-ritual">
      <ShhhIcon size={96} animated />
      <h2>Shhh. Keep it in the room.</h2>
      <ul>
        {RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <button type="button" ref={enter} className="entry-ritual-enter" onClick={onEnter}>
        Enter room
      </button>
    </div>
  )
}
