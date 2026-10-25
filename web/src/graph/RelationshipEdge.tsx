import { BaseEdge, EdgeLabelRenderer, getStraightPath, type Edge, type EdgeProps } from '@xyflow/react'
import type { RelationshipEdgeData } from './types'

export type RelationshipEdgeType = Edge<
  RelationshipEdgeData & { names: [string, string]; isSelected: boolean; onOpen(): void },
  'relationship'
>

/** A little thicker for pairs who share more stories: 1 → 1.5px, 2–3 → 2px, 4+ → 2.5px. */
const widthFor = (weight: number) => (weight >= 4 ? 2.5 : weight >= 2 ? 2 : 1.5)

export default function RelationshipEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<RelationshipEdgeType>) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  if (!data) return null
  const stories = data.weight === 1 ? '1 story' : `${data.weight} stories`
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={28}
        className={data.isSelected ? 'graph-edge is-selected' : 'graph-edge'}
        style={{ strokeWidth: data.isSelected ? 2.5 : widthFor(data.weight) }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={data.isSelected ? 'graph-edge-chip nodrag nopan is-selected' : 'graph-edge-chip nodrag nopan'}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          aria-label={`${data.names[0]} and ${data.names[1]}: ${stories}, latest ${data.latestTitle}`}
          onClick={data.onOpen}
        >
          {data.latestTitle}
          {data.weight > 1 && <span className="graph-edge-count">{data.weight}</span>}
        </button>
      </EdgeLabelRenderer>
    </>
  )
}
