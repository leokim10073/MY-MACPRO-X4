import { useState, type FormEvent } from 'react'

export const AI_NOTICE =
  "An AI listens to this room and turns what's said into a transcript, stories and catch-ups. Only text is kept, never audio. The host can delete the room at any time."

interface Props {
  inviteToken?: string
  onCreate(name: string): void
  onJoin(token: string, name: string): void
  error?: string | null
}

export default function JoinScreen({ inviteToken, onCreate, onJoin, error }: Props) {
  const [name, setName] = useState('')
  const trimmed = name.trim()

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!trimmed) return
    if (inviteToken) onJoin(inviteToken, trimmed)
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
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="notice">{AI_NOTICE}</p>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" className="primary" disabled={!trimmed}>
          {inviteToken ? 'Join room' : 'Create room'}
        </button>
      </form>
    </main>
  )
}
