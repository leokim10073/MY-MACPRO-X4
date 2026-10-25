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

/** Reads one query param from the address right now (not from the last render). */
export function readSearchParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

/**
 * Sets (or, with null, removes) one query param and leaves every other param as it was.
 * `state` replaces the history entry's state; by default the current state is kept.
 */
export function writeSearchParam(name: string, value: string | null, mode: 'push' | 'replace', state: unknown = window.history.state) {
  const url = new URL(window.location.href)
  if (value === null) url.searchParams.delete(name)
  else url.searchParams.set(name, value)
  if (url.href === window.location.href && state === window.history.state) return
  if (mode === 'push') window.history.pushState(state, '', url)
  else window.history.replaceState(state, '', url)
  window.dispatchEvent(new Event(CHANGE))
}
