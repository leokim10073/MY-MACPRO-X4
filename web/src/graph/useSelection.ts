import { useCallback, useMemo } from 'react'
import type { Id } from '../../../shared/schema'
import { PAIR_SEP } from './types'
import { useSearchParam, writeSearchParam } from './urlParam'

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

/** What's open in the details sheet, kept in `?sel=` so Back closes it and a link reopens it. */
export function useSelection() {
  const raw = useSearchParam(PARAM)
  const selection = useMemo(() => parseSelection(raw), [raw])
  // Opening is a step Back can undo; closing just drops the param.
  const open = useCallback((sel: Selection) => writeSearchParam(PARAM, formatSelection(sel), 'push'), [])
  const clear = useCallback(() => writeSearchParam(PARAM, null, 'replace'), [])
  return { selection, open, clear }
}
