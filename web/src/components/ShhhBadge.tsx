import { useState } from 'react'
import ShhhIcon from './ShhhIcon'

export default function ShhhBadge() {
  const [open, setOpen] = useState(false)
  return (
    <span className="shhh-badge">
      <button
        type="button"
        className="shhh-badge-button"
        aria-label="About this room"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ShhhIcon size={34} />
      </button>
      <p role="status">{open ? 'This room stays private until the host burns it.' : ''}</p>
    </span>
  )
}
