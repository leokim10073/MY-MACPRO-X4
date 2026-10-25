import type { Caption } from '../components/RecallBoard'
import StoryGraph from './StoryGraph'
import type { GraphModel } from './types'
import type { Selection } from './useSelection'
import './graph.css'

interface Props {
  roomId: string
  model: GraphModel
  currentTopic?: string
  caption: Caption | null
  selection: Selection
  onSelect(sel: Selection): void
  onClear(): void
  onShowList(): void
}

/** The map in the board's place, keeping the board's NOW line and caption (same markup and classes). */
export default function MapPanel({ roomId, model, currentTopic, caption, selection, onSelect, onClear, onShowList }: Props) {
  return (
    <div className="recall-board graph-panel">
      <div className="recall-board-scroll">
        {currentTopic && (
          <p className="recall-board-now">
            <span className="recall-board-now-label">Now</span> {currentTopic}
          </p>
        )}
        <StoryGraph
          roomId={roomId}
          model={model}
          selection={selection}
          onSelect={onSelect}
          onClear={onClear}
          onShowList={onShowList}
        />
      </div>
      {caption && (
        <p className={caption.live ? 'recall-caption is-live' : 'recall-caption'} aria-live="off">
          <span className="recall-caption-name">{caption.name}</span> {caption.text}
        </p>
      )}
    </div>
  )
}
