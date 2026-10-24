// The Last Sip teacup: an original cartoon cup on a saucer, in the Tea Party style.
// Moods are presentational only; the caller picks one from state it already has.
import { useId } from 'react'

export type CupMood = 'waiting' | 'pending' | 'failed' | 'empty'

const INK = 'var(--gw-color-ink)'

interface Props {
  size?: number
  mood?: CupMood
  className?: string
}

/** Decorative: the surrounding copy carries the meaning. Drawn in a 160×140 box. */
export default function LastSipCup({ size = 120, mood = 'waiting', className }: Props) {
  const clip = useId()
  const hasTea = mood !== 'empty'
  return (
    <svg
      className={['lsc', `lsc--${mood}`, className].filter(Boolean).join(' ')}
      width={size}
      height={(size * 140) / 160}
      viewBox="0 0 160 140"
      aria-hidden="true"
      focusable="false"
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        <ellipse className="lsc-saucer" cx="78" cy="124" rx="62" ry="11" fill="var(--gw-color-lavender)" stroke={INK} strokeWidth="4" />
        <g className="lsc-cup">
          <path d="M120 60 q28 -2 26 22 q-2 22 -30 20" fill="none" stroke={INK} strokeWidth="6" />
          <path d="M28 44 h96 v8 q0 62 -48 62 q-48 0 -48 -62 z" fill="var(--gw-surface-raised)" stroke={INK} strokeWidth="4.5" />
          <clipPath id={clip}>
            <path d="M32 50 h88 q0 58 -44 58 q-44 0 -44 -58 z" />
          </clipPath>
          {hasTea && (
            <g clipPath={`url(#${clip})`}>
              <rect className="lsc-tea" x="28" y="48" width="96" height="70" fill="var(--gw-tea-liquid)" />
            </g>
          )}
          <ellipse cx="76" cy="46" rx="48" ry="7" fill={hasTea ? 'var(--gw-tea-liquid)' : 'var(--gw-surface-sunken)'} stroke={INK} strokeWidth="4" />
          <circle cx="62" cy="80" r="4" fill={INK} />
          <circle cx="90" cy="80" r="4" fill={INK} />
          {mood === 'waiting' && <path className="lsc-brow" d="M83 69 q7 -6 14 -2" fill="none" stroke={INK} strokeWidth="3.5" />}
          <path d={mood === 'failed' ? 'M68 95 q8 -5 16 0' : 'M68 92 q8 6 16 0'} fill="none" stroke={INK} strokeWidth="3.5" />
        </g>
        {(mood === 'waiting' || mood === 'failed') && (
          <g className="lsc-steam" fill="none" stroke={INK} strokeWidth="3.5" opacity="0.55">
            <path className="lsc-steam-curl" d="M64 34 q-8 -8 0 -16 q8 -8 0 -16" />
            <path className="lsc-steam-curl" d="M88 34 q-8 -8 0 -16 q8 -8 0 -16" />
          </g>
        )}
        {mood === 'pending' && (
          <g className="lsc-steam-dots" fill={INK} opacity="0.6">
            <circle cx="62" cy="22" r="4" />
            <circle cx="76" cy="22" r="4" />
            <circle cx="90" cy="22" r="4" />
          </g>
        )}
      </g>
    </svg>
  )
}
