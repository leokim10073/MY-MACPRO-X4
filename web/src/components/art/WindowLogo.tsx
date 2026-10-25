// A small cartoon window with a speech bubble peeking through: the Spill the Tea mark.
const INK = 'var(--gw-color-ink)'

export default function WindowLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="42" height="38" rx="10" fill="var(--gw-color-violet)" stroke={INK} strokeWidth="3" />
      <rect x="9" y="11" width="30" height="26" rx="5" fill="var(--gw-color-room)" stroke={INK} strokeWidth="2.5" />
      <path d="M24 11 v26 M9 24 h30" stroke={INK} strokeWidth="2.5" />
      <path d="M27 15 h9 q2 0 2 2 v4 q0 2 -2 2 h-5 l-3 3 v-3 q-1 0 -1 -2 v-4 q0 -2 2 -2z" fill="var(--gw-color-yellow)" stroke={INK} strokeWidth="2" />
      <circle cx="16" cy="30" r="3" fill="var(--gw-color-coral)" stroke={INK} strokeWidth="2" />
    </svg>
  )
}
