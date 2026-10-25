import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from 'd3-force'
import { useCallback, useLayoutEffect, useState } from 'react'
import type { Id } from '../../../shared/schema'
import { PAIR_SEP, pairKey } from './types'

/** A node's drawn radius; positions are node centers. */
export const NODE_RADIUS = 40

export interface Point {
  x: number
  y: number
}
export interface Link {
  source: Id
  target: Id
}
type Positions = Record<Id, Point>

const TICKS = 300
const storageKey = (roomId: string) => `graph-layout:v1:${roomId}`

// Positions only, keyed by person id: never names or story text. Storage may be missing or full, so every access
// is allowed to fail and the map just lays itself out again.
function loadPositions(roomId: string): Positions {
  try {
    // eslint-disable-next-line no-restricted-globals -- node positions only, no conversation text
    const raw = localStorage.getItem(storageKey(roomId))
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    const out: Positions = {}
    if (parsed && typeof parsed === 'object') {
      for (const [id, p] of Object.entries(parsed as Record<string, unknown>)) {
        const { x, y } = (p ?? {}) as Partial<Point>
        if (Number.isFinite(x) && Number.isFinite(y)) out[id] = { x: x!, y: y! }
      }
    }
    return out
  } catch {
    return {}
  }
}

function savePositions(roomId: string, positions: Positions) {
  try {
    // eslint-disable-next-line no-restricted-globals -- node positions only, no conversation text
    localStorage.setItem(storageKey(roomId), JSON.stringify(positions))
  } catch {
    // Not saved; the next visit lays out again.
  }
}

// FNV-1a: a new node's nudge depends only on its id, so the same room always lays out the same way.
function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h
}

function jitter(id: Id, radius: number): Point {
  const h = hash(id)
  const angle = ((h & 0xffff) / 0x10000) * 2 * Math.PI
  const r = radius * (0.5 + (h >>> 16) / 0x20000)
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
}

/** Sorted ids and pairs: the layout only changes when this does. */
export function structureKey(nodeIds: Id[], links: Link[]): string {
  return JSON.stringify([[...new Set(nodeIds)].sort(), [...new Set(links.map((l) => pairKey(l.source, l.target)))].sort()])
}

function parseStructureKey(key: string): { nodeIds: Id[]; links: Link[] } {
  const [nodeIds, pairs] = JSON.parse(key) as [Id[], string[]]
  return { nodeIds, links: pairs.map((p) => {
    const [source, target] = p.split(PAIR_SEP)
    return { source, target }
  }) }
}

type SimNode = SimulationNodeDatum & { id: Id }

/**
 * Keeps saved nodes where they were (pinned) and only lets new ones settle in, starting next to their
 * neighbours. Pure apart from d3's own deterministic randomness.
 */
export function computeLayout(nodeIds: Id[], links: Link[], saved: Positions): Positions {
  const fresh = nodeIds.filter((id) => !saved[id])
  const kept = nodeIds.filter((id) => saved[id])
  const out: Positions = {}
  for (const id of kept) out[id] = saved[id]
  if (fresh.length === 0) return out

  const pinned = kept.map((id) => saved[id])
  const centroid = pinned.length
    ? { x: pinned.reduce((s, p) => s + p.x, 0) / pinned.length, y: pinned.reduce((s, p) => s + p.y, 0) / pinned.length }
    : { x: 0, y: 0 }
  const nodes: SimNode[] = nodeIds.map((id) => {
    const p = saved[id]
    if (p) return { id, x: p.x, y: p.y, fx: p.x, fy: p.y }
    const near = links
      .filter((l) => l.source === id || l.target === id)
      .map((l) => saved[l.source === id ? l.target : l.source])
      .filter((q): q is Point => Boolean(q))
    const base = near.length
      ? { x: near.reduce((s, q) => s + q.x, 0) / near.length, y: near.reduce((s, q) => s + q.y, 0) / near.length }
      : centroid
    const j = jitter(id, near.length ? NODE_RADIUS : NODE_RADIUS * 3)
    return { id, x: base.x + j.x, y: base.y + j.y }
  })

  const sim = forceSimulation(nodes)
    .stop()
    .force(
      'link',
      // d3 swaps ids for node objects on the links it gets, so it gets copies.
      forceLink<SimNode, { source: Id; target: Id }>(links.map((l) => ({ ...l })))
        .id((d) => d.id)
        .distance(160),
    )
    .force('charge', forceManyBody().strength(-500))
    .force('collide', forceCollide(NODE_RADIUS + 16))
  if (kept.length === 0) sim.force('center', forceCenter(0, 0))
  sim.tick(TICKS)

  for (const n of nodes) out[n.id] = { x: n.x!, y: n.y! }
  return out
}

/** Node centers for the map, kept per room on this device so the map doesn't reshuffle between visits. */
export function useStableLayout(roomId: string, nodeIds: Id[], links: Link[]) {
  const key = structureKey(nodeIds, links)
  const [positions, setPositions] = useState<Positions>({})
  useLayoutEffect(() => {
    const { nodeIds: ids, links: pairs } = parseStructureKey(key)
    const saved = loadPositions(roomId)
    const next = computeLayout(ids, pairs, saved)
    savePositions(roomId, { ...saved, ...next })
    // Laid out before paint, so the map never shows a frame of nodes at the origin.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads storage, so it can't run during render
    setPositions(next)
  }, [roomId, key])

  const setNodePosition = useCallback(
    (id: Id, p: Point) => {
      setPositions((prev) => ({ ...prev, [id]: p }))
      savePositions(roomId, { ...loadPositions(roomId), [id]: p })
    },
    [roomId],
  )

  return { positions, setNodePosition }
}
