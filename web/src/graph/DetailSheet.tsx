import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { Id, Member, Person } from '../../../shared/schema'
import Avatar from '../components/art/Avatar'
import StoryCard from '../components/StoryCard'
import { lookForCharacter } from './look'
import { pairKey, type Character, type GraphModel, type RelationshipEdgeData, type Story } from './types'
import type { Selection } from './useSelection'
import './graph.css'

interface Props {
  model: GraphModel
  selection: Selection
  onSelect(sel: Selection): void
  onClose(): void
  /** For the StoryCard, which names everyone in a story. */
  people: Person[]
  self: Member
}

const count = (n: number) => (n === 1 ? '1 story' : `${n} stories`)

/** A bottom sheet on phones, a drawer on the right on wider screens. Nothing when the selection matches nothing. */
export default function DetailSheet({ model, selection, ...rest }: Props) {
  if (selection.kind === 'node') {
    const character = model.characters.find((c) => c.id === selection.id)
    if (character) return <Sheet {...rest} model={model} character={character} />
  }
  if (selection.kind === 'edge') {
    const edge = model.edges.find((e) => e.id === pairKey(selection.a, selection.b))
    if (edge) return <Sheet {...rest} model={model} edge={edge} />
  }
  return null
}

type SheetProps = Omit<Props, 'selection'> & { character?: Character; edge?: RelationshipEdgeData }

function Sheet({ model, character, edge, onSelect, onClose, people, self }: SheetProps) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const shownKey = character ? `node:${character.id}` : `edge:${edge!.id}`
  // On close, focus goes to what was last shown on the map (its node, or its count badge), else back where it came from.
  const lastShown = useRef(shownKey)
  useLayoutEffect(() => {
    const opener = document.activeElement
    return () => {
      const target = mapElementFor(lastShown.current) ?? opener
      if (target instanceof HTMLElement && target.isConnected) target.focus()
    }
  }, [])
  useEffect(() => {
    lastShown.current = shownKey
    headingRef.current?.focus()
  }, [shownKey])

  const nameOf = (id: Id) => model.characters.find((c) => c.id === id)?.name ?? '?'

  return (
    <div
      className="gw-scrim graph-sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section
        className="graph-sheet"
        role="dialog"
        aria-labelledby={headingId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <button type="button" className="graph-sheet-close gw-btn gw-btn--quiet" aria-label="Close details" onClick={onClose}>
          ×
        </button>
        {character ? (
          <>
            <header className="graph-sheet-head">
              <Avatar look={lookForCharacter(character.id)} size={56} />
              <h2 ref={headingRef} tabIndex={-1} id={headingId}>
                {character.name}
              </h2>
            </header>
            <Connections model={model} character={character} nameOf={nameOf} onSelect={onSelect} />
            {(() => {
              const solo = model.soloStories.filter((s) => s.participantIds[0] === character.id)
              return (
                solo.length > 0 && (
                  <section aria-label={`Just about ${character.name}`}>
                    <h3>Just about {character.name}</h3>
                    <StoryList key={`${shownKey}-solo`} stories={solo} people={people} self={self} />
                  </section>
                )
              )
            })()}
            <section aria-label="All stories">
              <h3>All stories</h3>
              <StoryList key={shownKey} stories={model.storiesByCharacter.get(character.id) ?? []} people={people} self={self} />
            </section>
          </>
        ) : (
          <>
            <header className="graph-sheet-head">
              <span className="graph-sheet-pair" aria-hidden="true">
                <Avatar look={lookForCharacter(edge!.source)} size={44} />
                <Avatar look={lookForCharacter(edge!.target)} size={44} />
              </span>
              <h2 ref={headingRef} tabIndex={-1} id={headingId}>
                {nameOf(edge!.source)} &amp; {nameOf(edge!.target)}
              </h2>
              {edge!.isGroup && <span className="gw-chip graph-sheet-group">Group stories</span>}
            </header>
            <section aria-label="Their stories">
              <h3>{count(edge!.weight)}, newest first</h3>
              <StoryList
                key={shownKey}
                stories={edge!.storyIds.map((id) => model.storiesById.get(id)!)}
                people={people}
                self={self}
              />
            </section>
          </>
        )}
      </section>
    </div>
  )
}

function mapElementFor(key: string): Element | null {
  const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
  const selector = kind === 'node' ? `.react-flow__node[data-id="${CSS.escape(id)}"]` : `.graph-badge[data-pair="${CSS.escape(id)}"]`
  return document.querySelector(selector)
}

function Connections({
  model,
  character,
  nameOf,
  onSelect,
}: {
  model: GraphModel
  character: Character
  nameOf(id: Id): string
  onSelect(sel: Selection): void
}) {
  const mine = model.edges
    .filter((e) => e.source === character.id || e.target === character.id)
    .sort((x, y) => y.weight - x.weight)
  if (mine.length === 0) return null
  return (
    <section aria-label="Connections">
      <h3>Connections</h3>
      <ul className="graph-sheet-list">
        {mine.map((e) => {
          const other = e.source === character.id ? e.target : e.source
          return (
            <li key={e.id}>
              <button type="button" className="recall-story" onClick={() => onSelect({ kind: 'edge', a: e.source, b: e.target })}>
                <span className="recall-story-body">
                  <span className="recall-story-keyword">{nameOf(other)}</span>
                  <span className="recall-story-summary">{count(e.weight)}</span>
                </span>
                <span className="recall-story-more" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Story rows; one opens in place as the room's usual StoryCard. */
function StoryList({ stories, people, self }: { stories: Story[]; people: Person[]; self: Member }) {
  const [openId, setOpenId] = useState<Id | null>(null)
  const rowRefs = useRef(new Map<Id, HTMLButtonElement>())
  return (
    <ul className="graph-sheet-list">
      {stories.map((s) => (
        <li key={s.id}>
          {openId === s.id ? (
            // The card closes itself on Escape; the sheet stays open.
            <div
              onKeyDown={(e) => {
                if (e.key === 'Escape') e.stopPropagation()
              }}
            >
              <StoryCard
                story={s.raw}
                people={people}
                self={self}
                onClose={() => {
                  setOpenId(null)
                  requestAnimationFrame(() => rowRefs.current.get(s.id)?.focus())
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              className="recall-story"
              ref={(el) => {
                if (el) rowRefs.current.set(s.id, el)
                else rowRefs.current.delete(s.id)
              }}
              onClick={() => setOpenId(s.id)}
            >
              <span className="recall-story-body">
                <span className="recall-story-keyword">{s.title}</span>
                <span className="recall-story-summary">{s.summary}</span>
                {s.reportedBy && <span className="graph-sheet-teller">Told by {s.reportedBy}</span>}
              </span>
              <span className="recall-story-more" aria-hidden="true">
                Details ›
              </span>
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
