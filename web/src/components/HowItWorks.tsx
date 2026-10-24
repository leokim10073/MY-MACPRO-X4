import { useEffect, useRef } from 'react'

interface Props {
  id: string
  onClose: () => void
}

const STEPS = [
  {
    title: 'Talk',
    text: 'Hold the talk button and tell your story. What you say becomes text as you talk.',
  },
  {
    title: 'Catch up',
    text: 'Arrive late? Hear a short recap, then tap a word when an old story comes up again.',
  },
  {
    title: 'Last Sip',
    text: "When you're done, the host calls the last sip and the conversation is deleted for everyone.",
  },
]

// A small in-page panel; no new route. Escape or Close hides it, and focus starts on its heading.
export default function HowItWorks({ id, onClose }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])

  return (
    <section
      id={id}
      className="gw-how"
      aria-labelledby={`${id}-title`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="gw-how__head">
        <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
          How it works
        </h2>
        <button type="button" className="gw-how__close" onClick={onClose}>
          Close
        </button>
      </div>
      <ol className="gw-how__steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="gw-how__step">
            <span className="gw-how__num" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <strong>{s.title}</strong> {s.text}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
