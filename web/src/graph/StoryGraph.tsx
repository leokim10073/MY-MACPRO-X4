import {
  applyNodeChanges,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeChange,
  type NodeOrigin,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import CharacterNode, { type CharacterNodeType } from './CharacterNode'
import RelationshipEdge, { pairLabel, type RelationshipEdgeType } from './RelationshipEdge'
import { pairKey, type GraphModel } from './types'
import type { Selection } from './useSelection'
import { useStableLayout } from './useStableLayout'
import './graph.css'

// Module scope, so React Flow doesn't see new types on every render.
const nodeTypes = { character: CharacterNode }
const edgeTypes = { relationship: RelationshipEdge }
// Layout positions are node centers.
const nodeOrigin: NodeOrigin = [0.5, 0.5]
// Fit once after the first layout; a small cast never zooms past 1.
const fitViewOptions = { padding: 0.3, maxZoom: 1 }
/** The canvas grows with the cast instead of always taking most of the screen. */
const heightFor = (people: number) => (people <= 3 ? 320 : people <= 6 ? 420 : 520)
const storyCount = (n: number) => (n === 1 ? '1 story' : `${n} stories`)

interface Props {
  roomId: string
  model: GraphModel
  selection: Selection
  onSelect(sel: Selection): void
  onClear(): void
  onShowList(): void
}

/** People as nodes, shared stories as edges. Below two people there's nothing to connect, so it offers the list. */
export default function StoryGraph(props: Props) {
  if (props.model.characters.length < 2) {
    return (
      <div className="graph-empty">
        <p>Not enough people for a map yet</p>
        <button type="button" className="gw-btn gw-btn--quiet" onClick={props.onShowList}>
          Show the list
        </button>
      </div>
    )
  }
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}

function Canvas({ roomId, model, selection, onSelect, onClear }: Props) {
  const nodeIds = useMemo(() => model.characters.map((c) => c.id), [model])
  const links = useMemo(() => model.edges.map((e) => ({ source: e.source, target: e.target })), [model])
  const { positions, setNodePosition } = useStableLayout(roomId, nodeIds, links)
  const selectedNode = selection.kind === 'node' ? selection.id : null
  const selectedEdge = selection.kind === 'edge' ? pairKey(selection.a, selection.b) : null

  const laidOut = useMemo<CharacterNodeType[]>(
    () =>
      model.characters
        .filter((c) => positions[c.id])
        .map((c) => ({
          id: c.id,
          type: 'character',
          position: positions[c.id],
          data: { character: c, isSelected: c.id === selectedNode, isDimmed: false },
          ariaRole: 'button',
          ariaLabel: `${c.name}, ${storyCount(model.storiesByCharacter.get(c.id)?.length ?? 0)}`,
        })),
    [model, positions, selectedNode],
  )
  // React Flow owns nodes while they're dragged; a new layout or selection is merged in, keeping its measurements.
  const [nodes, setNodes] = useState(laidOut)
  const [syncedFrom, setSyncedFrom] = useState(laidOut)
  if (syncedFrom !== laidOut) {
    setSyncedFrom(laidOut)
    setNodes(laidOut.map((n) => ({ ...nodes.find((o) => o.id === n.id), ...n })))
  }
  const onNodesChange = useCallback(
    (changes: NodeChange<CharacterNodeType>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  )

  const edges = useMemo<RelationshipEdgeType[]>(() => {
    const name = (id: string) => model.characters.find((c) => c.id === id)?.name ?? '?'
    return model.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'relationship',
      // The count badge is the keyboard stop for an edge; a one-story line is reached through the sheet.
      focusable: false,
      ariaLabel: pairLabel(name(e.source), name(e.target), e.weight),
      data: {
        ...e,
        label: pairLabel(name(e.source), name(e.target), e.weight),
        isSelected: e.id === selectedEdge,
        isDimmed: false,
        onOpen: () => onSelect({ kind: 'edge', a: e.source, b: e.target }),
      },
    }))
  }, [model, selectedEdge, onSelect])

  // Nodes are focusable divs; Enter or Space opens one, like a click.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const id = (e.target as HTMLElement).closest<HTMLElement>('.react-flow__node')?.dataset.id
    if (!id) return
    e.preventDefault()
    onSelect({ kind: 'node', id })
  }

  return (
    <div className="graph-canvas" style={{ height: heightFor(model.characters.length) }} onKeyDown={onKeyDown}>
      {/* Laid out before paint, so fitView only ever runs once, on the real positions. */}
      {nodes.length > 0 && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodeOrigin={nodeOrigin}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, node) => setNodePosition(node.id, node.position)}
          onNodeClick={(_, node) => onSelect({ kind: 'node', id: node.id })}
          onEdgeClick={(_, edge) => onSelect({ kind: 'edge', a: edge.source, b: edge.target })}
          onPaneClick={onClear}
          nodesConnectable={false}
          elementsSelectable={false}
          minZoom={0.4}
          maxZoom={2}
          fitView
          fitViewOptions={fitViewOptions}
        >
          <Panel position="bottom-right" className="graph-fit-panel">
            <FitButton />
          </Panel>
        </ReactFlow>
      )}
    </div>
  )
}

/** The only zoom control: desktop pointers get it, touch has pinch. Hidden on coarse pointers by CSS. */
function FitButton() {
  const { fitView } = useReactFlow()
  return (
    <button type="button" className="graph-fit" aria-label="Fit map to view" onClick={() => void fitView(fitViewOptions)}>
      <span className="graph-fit-face" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
        </svg>
      </span>
    </button>
  )
}
