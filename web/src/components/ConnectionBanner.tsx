import type { ConnectionStatus } from '../room/RoomClient'

interface Props {
  status: ConnectionStatus | null
  /** Reloads the page, which joins again as a new member and gets a fresh recap (D2). */
  onRejoin: () => void
}

/** A one-line strip, shown only while reconnecting or once the room is lost. */
export default function ConnectionBanner({ status, onRejoin }: Props) {
  if (status !== 'reconnecting' && status !== 'lost') return null
  return (
    <div role="status" aria-live="polite" className={`connection-banner connection-banner--${status}`}>
      {status === 'reconnecting' ? (
        'Reconnecting…'
      ) : (
        <>
          <span>Lost connection to the room</span>
          <button type="button" className="connection-banner-rejoin" onClick={onRejoin}>
            Rejoin
          </button>
        </>
      )}
    </div>
  )
}
