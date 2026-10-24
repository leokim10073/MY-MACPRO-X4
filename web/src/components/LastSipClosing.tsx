import LastSipCup from './art/LastSipCup'

interface Props {
  /** True from the moment the room starts closing (the existing `closing` state). */
  active: boolean
  /** False under reduced motion: a plain crossfade to the empty cup. */
  animated: boolean
  /** "You ended the room." or "<host> ended the room." */
  endedBy: string
}

/**
 * The Last Sip closing over the conversation board: a lavender wash, the board gathering into soft strokes
 * that spiral into the tea, the cup draining, tipping and settling on its saucer. All timing is CSS keyframes
 * that start when this mounts, inside the existing closing window; nothing here schedules or changes state.
 * The live region stays mounted for the whole session and is filled once, when closing starts.
 */
export default function LastSipClosing({ active, animated, endedBy }: Props) {
  return (
    <div className="lsc-closing-layer">
      {active && (
        <div className={animated ? 'lsc-closing is-animated' : 'lsc-closing'} aria-hidden="true">
          <div className="lsc-closing-wash" />
          {animated && (
            <svg className="lsc-strokes" viewBox="0 0 300 300" preserveAspectRatio="xMidYMid meet" focusable="false">
              <path className="lsc-stroke lsc-stroke--lavender" d="M40 230 C 70 120, 190 90, 250 150 S 190 250, 150 200" />
              <path className="lsc-stroke lsc-stroke--peach" d="M260 70 C 200 40, 90 80, 80 150 S 160 230, 170 180" />
              <path className="lsc-stroke lsc-stroke--ink" d="M60 90 C 120 60, 230 110, 220 190 S 120 230, 140 170" />
            </svg>
          )}
          <div className="lsc-closing-stage">
            <LastSipCup size={150} mood={animated ? 'waiting' : 'empty'} className="lsc-closing-cup" />
          </div>
        </div>
      )}
      <div className="lsc-closing-status" role="status">
        {active && (
          <>
            <strong>Room ended.</strong> <span>{endedBy}</span>
          </>
        )}
      </div>
    </div>
  )
}
