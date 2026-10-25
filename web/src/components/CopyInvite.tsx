import { useEffect, useRef, useState } from 'react'
import InviteQr from './InviteQr'

interface Props {
  url: string
}

/** How long "Copied" shows on the button before it reads "Invite" again. */
const COPIED_MS = 2000

// The host's invite: a button that copies the link and shows it as a QR code, so a friend
// in the same room can scan the host's screen. If the browser refuses the clipboard, the
// link is shown as selectable text under the code instead.
export default function CopyInvite({ url }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)

  async function invite() {
    setOpen(true)
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
      setTimeout(() => setState((s) => (s === 'copied' ? 'idle' : s)), COPIED_MS)
    } catch {
      setState('manual')
    }
  }

  function hide() {
    setOpen(false)
    button.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="room-invite">
      <button
        type="button"
        ref={button}
        className="room-invite-copy gw-btn gw-btn--quiet"
        aria-label={state === 'copied' ? 'Link copied' : 'Copy invite link'}
        onClick={() => void invite()}
      >
        {state === 'copied' ? 'Copied' : 'Invite'}
      </button>
      {open && (
        <div className="invite-scrim" onClick={hide}>
          <div
            className="invite-sheet gw-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            onClick={(e) => e.stopPropagation()}
          >
            <strong id="invite-title">Scan to join</strong>
            <InviteQr url={url} />
            {state === 'manual' ? (
              <input
                className="room-invite-url"
                readOnly
                value={url}
                aria-label="Invite link"
                onFocus={(e) => e.currentTarget.select()}
              />
            ) : (
              <p className="invite-status" role="status">
                {state === 'copied' ? 'Link copied. Send it, or let friends scan this.' : 'Let friends scan this.'}
              </p>
            )}
            <button type="button" ref={close} className="gw-btn gw-btn--primary invite-done" onClick={hide}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
