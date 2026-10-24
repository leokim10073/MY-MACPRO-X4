import { useEffect, useRef } from 'react'
import LastSipCup from '../components/art/LastSipCup'
import WindowLogo from '../components/art/WindowLogo'

interface Props {
  onNewRoom?: () => void
  onHome?: () => void
}

// The final screen after the last sip. It only appears once the server has confirmed the burn (useClosing starts on
// room_burned or a resolved burn(), and the backend deletes in one transaction), so the deletion copy is backed.
// Nothing about the room is shown here.
export default function BurnedScreen({ onNewRoom, onHome }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  // Focus the heading so screen readers announce it and keyboard users start here.
  useEffect(() => heading.current?.focus(), [])
  return (
    <main className="burned">
      <div className="burned-top">
        <WindowLogo size={32} />
        <span className="burned-brand">Gossip Window</span>
      </div>
      <div className="burned-card gw-panel">
        <LastSipCup size={150} mood="empty" />
        <h1 ref={heading} tabIndex={-1}>
          Tea's gone.
        </h1>
        <p className="burned-lead">This room, its conversation, and AI catch-ups have been deleted.</p>
        <p className="burned-note">Screenshots or recordings people made aren't affected.</p>
        {(onNewRoom || onHome) && (
          <div className="burned-actions">
            {onNewRoom && (
              <button type="button" className="burned-primary gw-btn gw-btn--primary" onClick={onNewRoom}>
                Start a new room
              </button>
            )}
            {onHome && (
              <button type="button" className="burned-secondary gw-btn gw-btn--quiet" onClick={onHome}>
                Back home
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
