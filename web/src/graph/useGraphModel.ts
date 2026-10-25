import { useMemo } from 'react'
import type { Member, StoryState } from '../../../shared/schema'
import { adaptStoryState } from './adapt'
import { deriveGraph } from './deriveGraph'
import type { GraphModel } from './types'

export function useGraphModel(storyState: StoryState | null, members: Member[]): GraphModel {
  return useMemo(() => {
    const { characters, stories } = adaptStoryState(storyState, members)
    return deriveGraph(characters, stories)
  }, [storyState, members])
}
