import { useEffect, useRef } from 'react'
import LastSipCup from '../components/art/LastSipCup'
import WindowLogo from '../components/art/WindowLogo'

interface Props {
  onNewRoom?: () => void
  onHome?: () => void
  /** The host leads with Start a new room; everyone else leads with Back home. Defaults to the host order. */
  isHost?: boolean
}

// The final screen after the last sip. It only appears once the server has confirmed the burn (useClosing starts on
// room_burned or a resolved burn(), and the backend deletes in one transaction), so the deletion copy is backed.
// Nothing about the room is shown here.
export default function BurnedScreen({ onNewRoom, onHome, isHost = true }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  // Focus the heading so screen readers announce it and keyboard users start here.
  useEffect(() => heading.current?.focus(), [])
  const newRoom = (variant: string) =>
    onNewRoom && (
      <button type="button" className={`burned-new gw-btn ${variant}`} onClick={onNewRoom}>
        Start a new room
      </button>
    )
  const home = (variant: string) =>
    onHome && (
      <button type="button" className={`burned-home gw-btn ${variant}`} onClick={onHome}>
        Back home
      </button>
    )
  return (
    <main className="burned">
      <div className="burned-top">
        <WindowLogo size={32} />
        <span className="burned-brand">Spill the Tea</span>
      </div>
      <div className="burned-card gw-panel">
        <LastSipCup size={150} mood="empty" />
        <h1 ref={heading} tabIndex={-1}>
          Tea's gone.
        </h1>
        <p className="burned-lead">This room, its conversation, and AI recaps have been deleted.</p>
        <p className="burned-note">Screenshots or recordings people made aren't affected.</p>
        {(onNewRoom || onHome) && (
          <div className="burned-actions">
            {isHost ? (
              <>
                {newRoom('gw-btn--primary')}
                {home('gw-btn--quiet')}
              </>
            ) : (
              <>
                {home('gw-btn--primary')}
                {newRoom('gw-btn--quiet')}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
