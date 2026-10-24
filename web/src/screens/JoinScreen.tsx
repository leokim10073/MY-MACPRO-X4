import { useState, type FormEvent } from 'react'

export const AI_NOTICE =
  "An AI listens to this room and turns what's said into a transcript, stories and catch-ups. Only text is kept, never audio. The host can delete the room at any time."

interface Props {
  inviteToken?: string
  onCreate(name: string): void
  onJoin(token: string, name: string): void
  error?: { kind: string; message: string } | null
  pending?: boolean
  /** Where "Try the offline demo" goes; set only when running on the real backend. */
  offlineDemoHref?: string
}

export default function JoinScreen({ inviteToken, onCreate, onJoin, error, pending = false, offlineDemoHref }: Props) {
  const [name, setName] = useState('')
  // After leaving, the invite link is often still in the URL; let people start their own room instead.
  const [createInstead, setCreateInstead] = useState(false)
  const joining = !!inviteToken && !createInstead
  const trimmed = name.trim()

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!trimmed) return
    if (joining) onJoin(inviteToken, trimmed)
    else onCreate(trimmed)
  }

  return (
    <main className="app join">
      <h1>Gossip Window</h1>
      <form onSubmit={submit}>
        <label htmlFor="nickname">Nickname</label>
        <input
          id="nickname"
          type="text"
          autoComplete="off"
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="notice">{AI_NOTICE}</p>
        {error && (
          <p role="alert" className="error">
            {error.message}
            {error.kind === 'unreachable' && offlineDemoHref && (
              <>
                {' '}
                <a href={offlineDemoHref}>Try the offline demo</a>
              </>
            )}
          </p>
        )}
        <button type="submit" className="primary" disabled={!trimmed || pending}>
          {pending ? 'Connecting…' : joining ? 'Join room' : 'Create room'}
        </button>
        {joining && (
          <button type="button" className="link-button" onClick={() => setCreateInstead(true)}>
            Create a new room instead
          </button>
        )}
      </form>
    </main>
  )
}
