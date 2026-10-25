import { BaseEdge, EdgeLabelRenderer, getStraightPath, type Edge, type EdgeProps } from '@xyflow/react'
import type { RelationshipEdgeData } from './types'

export type RelationshipEdgeType = Edge<
  RelationshipEdgeData & { names: [string, string]; isSelected: boolean; onOpen(): void },
  'relationship'
>

/** Thicker for pairs who share more stories, capped so a busy pair doesn't swamp the map. */
const widthFor = (weight: number) => 2 + Math.min(weight - 1, 4) * 1.5

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
        style={{ strokeWidth: widthFor(data.weight), strokeDasharray: data.isGroup ? '6 6' : undefined }}
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
