import { useState } from 'react'

interface Props {
  url: string
}

/** How long "Link copied" shows before the button reads "Copy invite link" again. */
const COPIED_MS = 2000

// The host's invite: a button that copies the link instead of showing the long URL. If the
// browser refuses the clipboard, the link is shown as selectable text instead.
export default function CopyInvite({ url }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
      setTimeout(() => setState('idle'), COPIED_MS)
    } catch {
      setState('manual')
    }
  }

  return (
    <div className="room-invite">
      <button type="button" className="room-invite-copy gw-btn gw-btn--quiet" onClick={() => void copy()}>
        {state === 'copied' ? 'Link copied' : 'Copy invite link'}
      </button>
      {state === 'manual' && (
        <input
          className="room-invite-url"
          readOnly
          value={url}
          aria-label="Invite link"
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
        />
      )}
    </div>
  )
}
