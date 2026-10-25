import { useCallback } from 'react'
import { useSearchParam, writeSearchParam } from './urlParam'

export type ViewMode = 'map' | 'list'

/** `?view=map|list`; the list unless the map is asked for. `explicit` is false with no (valid) param at all. */
export function useViewMode() {
  const raw = useSearchParam('view')
  const view: ViewMode = raw === 'map' ? 'map' : 'list'
  const setView = useCallback((next: ViewMode) => writeSearchParam('view', next, 'replace'), [])
  return { view, explicit: raw === 'map' || raw === 'list', setView }
}
