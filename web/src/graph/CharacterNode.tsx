import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'
import Avatar from '../components/art/Avatar'
import { lookForCharacter } from './look'
import type { Character } from './types'
import { NODE_RADIUS } from './useStableLayout'

export type CharacterNodeType = Node<{ character: Character; isSelected: boolean }, 'character'>

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

export default function CharacterNode({ data }: NodeProps<CharacterNodeType>) {
  return (
    <div className={data.isSelected ? 'graph-node is-selected' : 'graph-node'} style={{ width: NODE_RADIUS * 2, height: NODE_RADIUS * 2 }}>
      <Handle type="target" position={Position.Top} style={centered} isConnectable={false} />
      <Avatar look={lookForCharacter(data.character.id)} size={NODE_RADIUS * 2 - 16} />
      <span className="graph-node-name">{data.character.name}</span>
      <Handle type="source" position={Position.Bottom} style={centered} isConnectable={false} />
    </div>
  )
}
