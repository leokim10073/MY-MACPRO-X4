import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'
import Avatar from '../components/art/Avatar'
import { lookForCharacter } from './look'
import type { Character } from './types'

export type CharacterNodeType = Node<{ character: Character; isSelected: boolean; isDimmed: boolean }, 'character'>

// Both handles sit hidden at the avatar's center, so straight edges run center to center.
const centered: CSSProperties = {
  top: '50%',
  left: '50%',
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 0,
  opacity: 0,
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
}

/** Avatar plus name, as one unit. The node box is the avatar; the name hangs below it. */
export default function CharacterNode({ data }: NodeProps<CharacterNodeType>) {
  const state = data.isSelected ? ' is-selected' : data.isDimmed ? ' is-dimmed' : ''
  return (
    <div className={`graph-node${state}`}>
      <Handle type="target" position={Position.Top} style={centered} isConnectable={false} />
      {/* Drawn at 64 and scaled by CSS: 56px on phones, 64px from 640px. */}
      <Avatar look={lookForCharacter(data.character.id)} size={64} className="graph-node-avatar" />
      <span className="graph-node-name">{data.character.name}</span>
      <Handle type="source" position={Position.Bottom} style={centered} isConnectable={false} />
    </div>
  )
}
