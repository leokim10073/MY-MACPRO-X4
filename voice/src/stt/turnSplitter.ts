import { SPLIT_MIN_GAP_MS } from '../config'

const norm = (word: string) => word.toLowerCase().replace(/\p{P}/gu, '')
const words = (text: string) => text.split(/\s+/).filter(Boolean)

/**
 * The part of `text` after what was already sent (`sentText`), with Ink's words unchanged.
 * Words are compared ignoring case and punctuation. If what was sent is found at the start
 * (or up to two words in, when Ink added words in front), the cut goes right after it;
 * otherwise Ink revised early words and the cut goes after the same number of words.
 */
export function remainderAfter(sentText: string, text: string): string {
  const sent = words(sentText).map(norm).filter(Boolean)
  const tokens = words(text)
  const normed = tokens.map(norm)
  const n = sent.length
  let cut = n
  for (let offset = 0; offset <= 2; offset++) {
    if (sent.every((w, i) => normed[offset + i] === w)) {
      cut = offset + n
      break
    }
  }
  return tokens.slice(cut).join(' ')
}

/**
 * Splits my open turn when someone cuts in (design 6.5), so the transcript follows the real
 * order: what I'd said so far becomes a line at once, and the rest follows as its own line.
 */
export class TurnSplitter {
  private isOpen = false
  private partAt = 0
  private sent = ''
  private latest = ''
  private lastSplit = -Infinity

  constructor(private readonly now: () => number) {}

  get open(): boolean {
    return this.isOpen
  }

  start(at: number): void {
    this.isOpen = true
    this.partAt = at
    this.sent = this.latest = ''
    this.lastSplit = -Infinity
  }

  update(text: string): void {
    if (this.isOpen) this.latest = text
  }

  /** What of `text` hasn't been sent by a split yet. */
  unsent(text: string): string {
    return this.sent ? remainderAfter(this.sent, text) : text.trim()
  }

  split(): { text: string; at: number } | null {
    if (!this.isOpen) return null
    const now = this.now()
    if (now - this.lastSplit < SPLIT_MIN_GAP_MS) return null
    const text = this.unsent(this.latest)
    if (!text) return null
    const part = { text, at: this.partAt }
    this.sent = this.latest
    this.partAt = now
    this.lastSplit = now
    return part
  }

  end(finalText: string): { text: string; at: number } | null {
    if (!this.isOpen) return null
    const text = this.unsent(finalText)
    const part = { text, at: this.partAt }
    this.isOpen = false
    this.sent = this.latest = ''
    return text ? part : null
  }
}
