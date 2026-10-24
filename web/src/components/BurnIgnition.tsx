import ShhhIcon from './ShhhIcon'

interface Props {
  /** False (reduced motion) leaves the ember at the bottom with no movement. */
  animated: boolean
}

// The first beat of a burn: the Shhh icon, one line, and a single ember that drops to the bottom of the board.
export default function BurnIgnition({ animated }: Props) {
  return (
    <div className="burn-ignition" role="status">
      <div className="burn-ignition-copy">
        <ShhhIcon size={88} />
        <span>That's between us.</span>
      </div>
      <span className={animated ? 'burn-ember burn-ember-drop' : 'burn-ember'} aria-hidden="true" />
    </div>
  )
}
