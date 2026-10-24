// Type-only: the package itself is loaded on demand below.
import type { KrispNoiseFilterProcessor } from '@livekit/krisp-noise-filter'
import { KRISP_QUALITY } from '../config'
import type { NoiseFilterKind } from './callSession'

export interface NoiseFilter {
  kind: NoiseFilterKind
  /** Null when Krisp can't run here; the raw mic (with the browser's own suppression) is used. */
  processor: KrispNoiseFilterProcessor | null
}

/**
 * Loads Krisp (about 6 MB) only when someone joins a call. Background voice cancellation is
 * requested; Krisp itself decides whether this mic is allowed to use it, and doesn't say.
 */
export async function loadNoiseFilter(opts: { debugLogs?: boolean; onBufferDrop?: () => void } = {}): Promise<NoiseFilter> {
  const krisp = await import('@livekit/krisp-noise-filter')
  if (!krisp.isKrispNoiseFilterSupported()) return { kind: 'browser', processor: null }
  return {
    kind: 'krisp',
    processor: krisp.KrispNoiseFilter({
      useBVC: true,
      quality: KRISP_QUALITY,
      debugLogs: opts.debugLogs,
      onBufferDrop: opts.onBufferDrop,
    }),
  }
}
