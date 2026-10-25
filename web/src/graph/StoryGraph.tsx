import {
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type NodeChange,
  type NodeOrigin,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import CharacterNode, { type CharacterNodeType } from './CharacterNode'
import RelationshipEdge, { type RelationshipEdgeType } from './RelationshipEdge'
import { pairKey, type GraphModel } from './types'
import type { Selection } from './useSelection'
import { useStableLayout } from './useStableLayout'
import './graph.css'

// Module scope, so React Flow doesn't see new types on every render.
const nodeTypes = { character: CharacterNode }
const edgeTypes = { relationship: RelationshipEdge }
// Layout positions are node centers.
const nodeOrigin: NodeOrigin = [0.5, 0.5]
const fitViewOptions = { padding: 0.2 }
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
          data: { character: c, isSelected: c.id === selectedNode },
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
      // The chip is the keyboard stop for an edge.
      focusable: false,
      ariaLabel: `${name(e.source)} and ${name(e.target)}`,
      data: {
        ...e,
        names: [name(e.source), name(e.target)],
        isSelected: e.id === selectedEdge,
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
    <div className="graph-canvas" style={{ height: 'min(70vh, 560px)' }} onKeyDown={onKeyDown}>
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
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      )}
    </div>
  )
}
