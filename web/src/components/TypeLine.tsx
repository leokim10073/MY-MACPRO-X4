import { useState, type FormEvent } from 'react'

interface Props {
  onAddLine(text: string, at: number): Promise<void>
}

// Dev-only (?type=1): adds a human line without voice.
export default function TypeLine({ onAddLine }: Props) {
  const [text, setText] = useState('')
  const [failed, setFailed] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setFailed(false)
    setText('')
    try {
      await onAddLine(trimmed, Date.now())
    } catch {
      setFailed(true)
    }
  }

  return (
    <form className="type-line" onSubmit={(e) => void submit(e)}>
      <label htmlFor="type-line">Type a line</label>
      <input id="type-line" type="text" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="submit">Send</button>
      {failed && (
        <p role="alert" className="error">
          Couldn't send.
        </p>
      )}
    </form>
  )
}
