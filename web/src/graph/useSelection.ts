import { useCallback, useMemo } from 'react'
import type { Id } from '../../../shared/schema'
import { PAIR_SEP } from './types'
import { readSearchParam, useSearchParam, writeSearchParam } from './urlParam'

export type Selection = { kind: 'none' } | { kind: 'node'; id: Id } | { kind: 'edge'; a: Id; b: Id }

const NONE: Selection = { kind: 'none' }
const PARAM = 'sel'

/** `node:<id>` or `edge:<a>~<b>`, each id URI-encoded. Anything else is no selection. */
export function parseSelection(raw: string | null): Selection {
  if (!raw) return NONE
  try {
    if (raw.startsWith('node:')) {
      const id = decodeURIComponent(raw.slice('node:'.length))
      return id ? { kind: 'node', id } : NONE
    }
    if (raw.startsWith('edge:')) {
      const parts = raw.slice('edge:'.length).split(PAIR_SEP)
      if (parts.length !== 2) return NONE
      const [a, b] = parts.map(decodeURIComponent)
      if (!a || !b || a === b) return NONE
      return a < b ? { kind: 'edge', a, b } : { kind: 'edge', a: b, b: a }
    }
  } catch {
    // A malformed %-escape: treat it as nothing selected.
  }
  return NONE
}

export function formatSelection(sel: Selection): string | null {
  if (sel.kind === 'node') return `node:${encodeURIComponent(sel.id)}`
  if (sel.kind === 'edge') return `edge:${encodeURIComponent(sel.a)}${PAIR_SEP}${encodeURIComponent(sel.b)}`
  return null
}

// Marks a history entry this app pushed by opening the sheet, so closing can step back over it.
const PUSHED = 'gwSheetPushed'

const wasPushedHere = () => {
  const state: unknown = window.history.state
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[PUSHED] === true
}

export function sameSelection(x: Selection, y: Selection): boolean {
  return formatSelection(x) === formatSelection(y)
}

/**
 * What's open in the details sheet. `?sel=` is the only copy: the canvas highlight and the sheet both read it here,
 * and nothing else writes it.
 * - Opening from closed pushes one history entry; changing what's open replaces it.
 * - Closing an entry opened here steps Back (so Back after closing doesn't reopen it); closing a deep link just
 *   drops the param.
 */
export function useSelection() {
  const raw = useSearchParam(PARAM)
  const selection = useMemo(() => parseSelection(raw), [raw])
  const select = useCallback((sel: Selection) => {
    const value = formatSelection(sel)
    if (value === null) return
    if (parseSelection(readSearchParam(PARAM)).kind === 'none') {
      const state: unknown = window.history.state
      writeSearchParam(PARAM, value, 'push', { ...(typeof state === 'object' ? state : null), [PUSHED]: true })
    } else {
      writeSearchParam(PARAM, value, 'replace')
    }
  }, [])
  const close = useCallback(() => {
    if (readSearchParam(PARAM) === null) return
    if (wasPushedHere()) window.history.back()
    else writeSearchParam(PARAM, null, 'replace')
  }, [])
  return { selection, select, close }
}
