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
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import CharacterNode, { type CharacterNodeType } from './CharacterNode'
import RelationshipEdge, { pairLabel, type RelationshipEdgeType } from './RelationshipEdge'
import { pairKey, type GraphModel } from './types'
import { sameSelection, type Selection } from './useSelection'
import { useStableLayout } from './useStableLayout'
import './graph.css'

// Module scope, so React Flow doesn't see new types on every render.
const nodeTypes = { character: CharacterNode }
const edgeTypes = { relationship: RelationshipEdge }
// Layout positions are node centers.
const nodeOrigin: NodeOrigin = [0.5, 0.5]
// Fit after the first layout (and as the cast grows, until the user moves the map); a small cast never zooms past 1.
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
  // Everything below reads the selection from the URL; nothing here keeps its own copy.
  const selectedNode = selection.kind === 'node' && model.characters.some((c) => c.id === selection.id) ? selection.id : null
  const selectedEdge =
    selection.kind === 'edge' && model.edges.some((e) => e.id === pairKey(selection.a, selection.b))
      ? pairKey(selection.a, selection.b)
      : null
  // The selected item and its neighbours stay at full strength; the rest dims. Nothing dims with no selection.
  const lit = useMemo(() => {
    if (selectedNode) {
      const edges = model.edges.filter((e) => e.source === selectedNode || e.target === selectedNode)
      return { nodes: new Set([selectedNode, ...edges.flatMap((e) => [e.source, e.target])]), edges: new Set(edges.map((e) => e.id)) }
    }
    const edge = model.edges.find((e) => e.id === selectedEdge)
    if (edge) return { nodes: new Set([edge.source, edge.target]), edges: new Set([edge.id]) }
    return null
  }, [model, selectedNode, selectedEdge])
  // Picking what's already open closes it.
  const choose = useCallback(
    (sel: Selection) => (sameSelection(sel, selection) ? onClear() : onSelect(sel)),
    [selection, onSelect, onClear],
  )

  const laidOut = useMemo<CharacterNodeType[]>(
    () =>
      // Name order is tab order.
      [...model.characters]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((c) => positions[c.id])
        .map((c) => ({
          id: c.id,
          type: 'character',
          position: positions[c.id],
          data: { character: c, isSelected: c.id === selectedNode, isDimmed: !!lit && !lit.nodes.has(c.id) },
          ariaRole: 'button',
          ariaLabel: `${c.name}, ${storyCount(model.storiesByCharacter.get(c.id)?.length ?? 0)}`,
        })),
    [model, positions, selectedNode, lit],
  )
  // React Flow owns node positions while they're dragged. New data or a new selection is merged in, keeping each
  // node's measurements and live position; a position is only taken from the layout when the layout moved that node.
  // (Live room updates rebuild the model often; resetting positions then would yank a node out from under the pointer.)
  const [nodes, setNodes] = useState(laidOut)
  const [syncedFrom, setSyncedFrom] = useState(laidOut)
  if (syncedFrom !== laidOut) {
    setSyncedFrom(laidOut)
    setNodes(
      laidOut.map((n) => {
        const live = nodes.find((o) => o.id === n.id)
        if (!live) return n
        // The node under the pointer always stays there, even if the cast changed and the layout was recomputed.
        const layoutMoved = !live.dragging && syncedFrom.find((o) => o.id === n.id)?.position !== n.position
        return { ...live, ...n, position: layoutMoved ? n.position : live.position }
      }),
    )
  }
  // Someone new is talked about: fit again so they aren't left off-screen, unless the user has already panned, zoomed
  // or dragged, in which case the view is theirs and never moves on its own. (fitView waits for the new nodes' size.)
  const { fitView } = useReactFlow()
  const userMoved = useRef(false)
  const castKey = useMemo(() => [...nodeIds].sort().join(' '), [nodeIds])
  const fittedCast = useRef(castKey)
  useEffect(() => {
    const before = new Set(fittedCast.current.split(' '))
    fittedCast.current = castKey
    const grew = castKey.split(' ').some((id) => !before.has(id))
    if (grew && !userMoved.current) void fitView(fitViewOptions)
  }, [castKey, fitView])

  const onNodesChange = useCallback(
    (changes: NodeChange<CharacterNodeType>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  )

  const edges = useMemo<RelationshipEdgeType[]>(() => {
    const name = (id: string) => model.characters.find((c) => c.id === id)?.name ?? '?'
    return model.edges.map((e) => ({
      // Behind the nodes, always.
      zIndex: 0,
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
        isDimmed: !!lit && !lit.edges.has(e.id),
        onOpen: () => choose({ kind: 'edge', a: e.source, b: e.target }),
      },
    }))
  }, [model, selectedEdge, lit, choose])

  // Nodes are focusable divs; Enter or Space picks one, like a click. Escape closes whatever is open.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClear()
      return
    }
    if (e.key !== 'Enter' && e.key !== ' ') return
    const id = (e.target as HTMLElement).closest<HTMLElement>('.react-flow__node')?.dataset.id
    if (!id) return
    e.preventDefault()
    choose({ kind: 'node', id })
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
          onNodeDragStart={() => {
            userMoved.current = true
          }}
          onNodeDragStop={(_, node) => setNodePosition(node.id, node.position)}
          // Only a person's pan or zoom carries an event; the map's own fits don't.
          onMoveStart={(event) => {
            if (event) userMoved.current = true
          }}
          onNodeClick={(_, node) => choose({ kind: 'node', id: node.id })}
          onEdgeClick={(_, edge) => choose({ kind: 'edge', a: edge.source, b: edge.target })}
          onPaneClick={onClear}
          // The node follows the pointer 1:1: the grab point is fixed at press (no drag threshold, which would make it
          // trail by the threshold), and the view never auto-pans under a drag (which carried nodes off at speed near
          // the edge of this small canvas).
          nodeDragThreshold={0}
          autoPanOnNodeDrag={false}
          // A press that moves more than 4px is a drag (or a pan), never a pick.
          nodeClickDistance={4}
          paneClickDistance={4}
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
