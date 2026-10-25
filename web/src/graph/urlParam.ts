import { useSyncExternalStore } from 'react'

// pushState/replaceState fire no event, so writes here announce themselves; Back and Forward come as popstate.
const CHANGE = 'gw-urlchange'

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  window.addEventListener(CHANGE, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(CHANGE, onChange)
  }
}

const readSearch = () => window.location.search

/** One query param, kept in step with the address bar. */
export function useSearchParam(name: string): string | null {
  const search = useSyncExternalStore(subscribe, readSearch, () => '')
  return new URLSearchParams(search).get(name)
}

/** Sets (or, with null, removes) one query param and leaves every other param as it was. */
export function writeSearchParam(name: string, value: string | null, mode: 'push' | 'replace') {
  const url = new URL(window.location.href)
  if (value === null) url.searchParams.delete(name)
  else url.searchParams.set(name, value)
  if (url.href === window.location.href) return
  if (mode === 'push') window.history.pushState(window.history.state, '', url)
  else window.history.replaceState(window.history.state, '', url)
  window.dispatchEvent(new Event(CHANGE))
}
