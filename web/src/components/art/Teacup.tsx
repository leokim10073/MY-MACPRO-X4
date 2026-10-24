// An original, cheerful teacup character mid-spill: the "spilling the tea" motif.
const INK = 'var(--gw-color-ink)'

/** Drawn in a 120×110 box; place it with a transform. */
export function TeacupShape() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* steam */}
      <path d="M44 14 q-6 -7 0 -14 M60 16 q-6 -8 0 -16" fill="none" stroke={INK} strokeWidth="3" opacity="0.55" />
      <g transform="rotate(-14 60 64)">
        {/* saucer */}
        <ellipse cx="60" cy="96" rx="46" ry="9" fill="var(--gw-color-lavender)" stroke={INK} strokeWidth="3.5" />
        {/* handle */}
        <path d="M92 52 q20 2 16 18 q-4 14 -22 10" fill="none" stroke={INK} strokeWidth="7" />
        <path d="M92 52 q20 2 16 18 q-4 14 -22 10" fill="none" stroke="var(--gw-color-card)" strokeWidth="2.5" />
        {/* cup */}
        <path d="M22 40 h76 q-2 44 -38 50 q-36 -6 -38 -50 z" fill="var(--gw-color-card)" stroke={INK} strokeWidth="4" />
        <path d="M30 70 q30 22 60 0 q-6 18 -30 20 q-24 -2 -30 -20z" fill="rgba(41,36,61,0.1)" />
        {/* tea surface */}
        <ellipse cx="60" cy="40" rx="38" ry="8" fill="var(--gw-color-tea)" stroke={INK} strokeWidth="4" />
        {/* stripe */}
        <path d="M27 56 q33 10 66 0" fill="none" stroke="var(--gw-color-coral)" strokeWidth="5" />
        {/* face */}
        <path d="M48 64 q4 -5 8 0 M66 64 q4 -5 8 0" fill="none" stroke={INK} strokeWidth="3.2" />
        <path d="M53 71 q8 9 16 0" fill={INK} stroke={INK} strokeWidth="2.5" />
        <ellipse cx="45" cy="72" rx="4" ry="2.6" fill="var(--gw-color-pink)" />
        <ellipse cx="78" cy="72" rx="4" ry="2.6" fill="var(--gw-color-pink)" />
      </g>
      {/* the spill */}
      <path d="M22 44 q-10 8 -8 20 q2 6 7 2 q4 -8 1 -22z" fill="var(--gw-color-tea)" stroke={INK} strokeWidth="3" />
      <ellipse cx="10" cy="80" rx="6" ry="7" fill="var(--gw-color-tea)" stroke={INK} strokeWidth="3" />
      <ellipse cx="18" cy="98" rx="4" ry="4.5" fill="var(--gw-color-tea)" stroke={INK} strokeWidth="2.5" />
    </g>
  )
}
