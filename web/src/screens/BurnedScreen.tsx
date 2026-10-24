import { useEffect, useRef } from 'react'

interface Props {
  onNewRoom?: () => void
  onHome?: () => void
}

// The clean slate after a burn: nothing about the room is shown here.
export default function BurnedScreen({ onNewRoom, onHome }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  // Focus the heading so screen readers announce it and keyboard users start here.
  useEffect(() => heading.current?.focus(), [])
  return (
    <main className="burned">
      <h1 ref={heading} tabIndex={-1}>
        Room burned.
      </h1>
      <p className="burned-lead">Conversation deleted.</p>
      <p className="burned-note">
        Deleted from Gossip Window. Screenshots or recordings people made aren't affected.
      </p>
      {(onNewRoom || onHome) && (
        <div className="burned-actions">
          {onNewRoom && (
            <button type="button" className="burned-primary" onClick={onNewRoom}>
              Start a new room
            </button>
          )}
          {onHome && (
            <button type="button" className="burned-secondary" onClick={onHome}>
              Back home
            </button>
          )}
        </div>
      )}
    </main>
  )
}
