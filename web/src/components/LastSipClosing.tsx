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
 * The Last Sip closing over the conversation board: a lavender wash, the board's cards stacking away behind the
 * cup, a small "cheers", then the cup tips, pours its tea out, swings back empty and settles. All timing is CSS keyframes
 * that start when this mounts, inside the existing closing window; nothing here schedules or changes state.
 * The live region stays mounted for the whole session and is filled once, when closing starts.
 */
export default function LastSipClosing({ active, animated, endedBy }: Props) {
  return (
    <div className="lsc-closing-layer">
      {active && (
        <div className={animated ? 'lsc-closing is-animated' : 'lsc-closing'} aria-hidden="true">
          <div className="lsc-closing-wash" />
          <div className="lsc-closing-stage">
            <LastSipCup size={150} mood={animated ? 'waiting' : 'empty'} pour={animated} className="lsc-closing-cup" />
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
