import type { ViewMode } from './useViewMode'
import './graph.css'

const OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'map', label: 'Map' },
  { value: 'list', label: 'List' },
]

/** Map | List, as two pressed/unpressed buttons. */
export default function ViewToggle({ view, onChange }: { view: ViewMode; onChange(view: ViewMode): void }) {
  return (
    <div className="graph-view-toggle" role="group" aria-label="Show stories as">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" aria-pressed={view === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
