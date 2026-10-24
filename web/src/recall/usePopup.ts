import { useCallback, useEffect, useRef, useState } from 'react'
import type { Id, Member } from '../../../shared/schema'
import type { RoomState } from '../room/state'
import {
  initialPopupState,
  popupReducer,
  type PopupContext,
  type PopupInput,
  type PopupState,
  type VisiblePopup,
} from './popup'

const TICK_MS = 250

interface Options {
  focusedBypassesCooldown?: boolean
}

export function usePopup(state: RoomState, self: Member, opts: Options = {}) {
  const ctx: PopupContext = {
    self,
    stories: state.storyState?.stories ?? [],
    people: state.storyState?.people ?? [],
    focusedBypassesCooldown: opts.focusedBypassesCooldown ?? false,
  }
  const ctxRef = useRef(ctx)
  // Declared before the effects below so they always see the latest ctx.
  useEffect(() => {
    ctxRef.current = ctx
  })

  const [popupState, setPopupState] = useState<PopupState>(initialPopupState)
  const dispatch = useCallback((input: PopupInput | { type: 'reset' }) => {
    setPopupState((s) =>
      input.type === 'reset' ? initialPopupState : popupReducer(s, input, ctxRef.current),
    )
  }, [])
  const [openStoryId, setOpenStoryId] = useState<Id | null>(null)
  const fed = useRef(new Set<Id>())
  const hadRecalls = useRef(false)

  useEffect(() => {
    const burned = state.status === 'burned'
    if (burned || (state.recalls.length === 0 && hadRecalls.current)) {
      fed.current.clear()
      hadRecalls.current = false
      dispatch({ type: 'reset' })
      setOpenStoryId(null)
      return
    }
    for (const recall of state.recalls) {
      if (fed.current.has(recall.id)) continue
      fed.current.add(recall.id)
      hadRecalls.current = true
      const now = Date.now()
      dispatch({ type: 'tick', now })
      dispatch({ type: 'recall', recall, now })
    }
  }, [state.recalls, state.status, dispatch])

  useEffect(() => {
    const t = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), TICK_MS)
    return () => clearInterval(t)
  }, [dispatch])

  const dismiss = useCallback(() => dispatch({ type: 'dismiss', now: Date.now() }), [dispatch])
  const tapChip = useCallback((storyId: Id) => {
    dispatch({ type: 'chip_tapped', now: Date.now() })
    setOpenStoryId(storyId)
  }, [dispatch])
  const closeStory = useCallback(() => setOpenStoryId(null), [])

  const popup: VisiblePopup | null = popupState.visible
  return { popup, dismiss, tapChip, openStoryId, closeStory }
}
