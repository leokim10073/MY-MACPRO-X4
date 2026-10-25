import { BaseEdge, getStraightPath, ViewportPortal, type Edge, type EdgeProps } from '@xyflow/react'
import type { RelationshipEdgeData } from './types'

export type RelationshipEdgeType = Edge<
  RelationshipEdgeData & { label: string; isSelected: boolean; isDimmed: boolean; onOpen(): void },
  'relationship'
>

/** A little thicker for pairs who share more stories: 1 → 1.5px, 2–3 → 2px, 4+ → 2.5px. */
const widthFor = (weight: number) => (weight >= 4 ? 2.5 : weight >= 2 ? 2 : 1.5)

/** "<A> and <B>, <n> stories": the only pair information on the canvas. */
export function pairLabel(a: string, b: string, n: number) {
  return `${a} and ${b}, ${n === 1 ? '1 story' : `${n} stories`}`
}

/** A quiet straight line; a number badge only once a pair shares two or more stories. Never any other text. */
export default function RelationshipEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<RelationshipEdgeType>) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  if (!data) return null
  const state = data.isSelected ? ' is-selected' : data.isDimmed ? ' is-dimmed' : ''
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={28}
        className={`graph-edge${state}`}
        style={{ strokeWidth: data.isSelected ? 2.5 : widthFor(data.weight) }}
      />
      {data.weight >= 2 && (
        // The viewport portal draws after the nodes, so badges sit above them and come after them in tab order.
        <ViewportPortal>
          <CountBadge
            pair={id}
            count={data.weight}
            label={data.label}
            state={state}
            x={labelX}
            y={labelY}
            onOpen={data.onOpen}
          />
        </ViewportPortal>
      )}
    </>
  )
}

function CountBadge({
  pair,
  count,
  label,
  state,
  x,
  y,
  onOpen,
}: {
  pair: string
  count: number
  label: string
  state: string
  x: number
  y: number
  onOpen(): void
}) {
  return (
    <button
      type="button"
      className={`graph-badge nodrag nopan${state}`}
      style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
      aria-label={label}
      // The sheet returns focus here when it closes.
      data-pair={pair}
      onClick={onOpen}
    >
      <span className={count >= 10 ? 'graph-badge-face is-wide' : 'graph-badge-face'}>{count > 99 ? '99+' : count}</span>
    </button>
  )
}
