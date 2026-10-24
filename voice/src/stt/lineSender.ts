import type { NewTranscriptLine } from '../../../shared/schema'
import { SEND_RETRY_DELAYS_MS } from '../config'

/** True when the text has at least one letter or digit, so noise-only and empty results are dropped. */
export function hasSpeech(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}

export interface FailedLine {
  line: NewTranscriptLine
  retry(): void
}

/**
 * Sends finished lines to the backend. The text is sent as Ink heard it (only the ends are
 * trimmed); nothing is rewritten. Each line is retried a couple of times with the same `at`,
 * then kept as failed so the speaker can tap to send it again.
 */
export class LineSender {
  private sending = 0
  private failed: FailedLine[] = []
  private cancelled = false

  constructor(
    private readonly send: (line: NewTranscriptLine) => Promise<void>,
    private readonly onChange: () => void = () => {},
  ) {}

  get pending(): number {
    return this.sending
  }

  get failedLines(): readonly FailedLine[] {
    return this.failed
  }

  /** Returns false when the line was dropped because it had no speech in it. */
  submit(line: NewTranscriptLine): boolean {
    const text = line.text.trim()
    if (!hasSpeech(text)) return false
    void this.attempt({ ...line, text })
    return true
  }

  /** Stops all retries and forgets unsent lines. Used on burn. Later submits are ignored. */
  cancel(): void {
    this.cancelled = true
    this.failed = []
    this.onChange()
  }

  private async attempt(line: NewTranscriptLine): Promise<void> {
    if (this.cancelled) return
    this.sending++
    this.onChange()
    let ok = false
    for (let i = 0; i <= SEND_RETRY_DELAYS_MS.length && !ok; i++) {
      if (i > 0) await sleep(SEND_RETRY_DELAYS_MS[i - 1])
      if (this.cancelled) break
      try {
        await this.send(line)
        ok = true
      } catch {
        // Retried below; the line text is never logged.
      }
    }
    this.sending--
    if (!ok && !this.cancelled) {
      const entry: FailedLine = {
        line,
        retry: () => {
          this.failed = this.failed.filter((f) => f !== entry)
          void this.attempt(line)
        },
      }
      this.failed = [...this.failed, entry]
    }
    this.onChange()
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
