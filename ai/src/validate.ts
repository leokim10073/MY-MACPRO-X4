// Pure helpers that check and repair what the LLM returns. No API calls here.

import type { Id, Seq, StoryState, TranscriptLine } from "../../shared/schema";

/** Lowercase, straighten quotes, collapse whitespace. Used for "does this quote appear in that line". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `quote` is non-empty and appears verbatim (after normalize) in `lineText`. */
export function quoteInLine(quote: string, lineText: string): boolean {
  const q = normalize(quote).replace(/^["']+|["']+$/g, "");
  return q.length > 0 && normalize(lineText).includes(q);
}

const ONE_WORD = /^[\p{L}\p{N}][\p{L}\p{N}'’-]*$/u;

export function isOneWord(keyword: string): boolean {
  return ONE_WORD.test(keyword);
}

/** Fallback when the model returns a multi-word keyword: first word, letters only, capitalized. */
export function toOneWord(keyword: string): string {
  const first = keyword.trim().split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[^\p{L}\p{N}'-]/gu, "");
  if (!cleaned) return "Story";
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

/** min/max seq over the given line ids. Unknown ids are ignored; null when none are known. */
export function seqRange(
  lineIds: Id[],
  lineById: Map<Id, TranscriptLine>,
): { firstSeq: Seq; lastSeq: Seq } | null {
  const seqs = lineIds.map((id) => lineById.get(id)?.seq).filter((s): s is Seq => s !== undefined);
  if (seqs.length === 0) return null;
  return { firstSeq: Math.min(...seqs), lastSeq: Math.max(...seqs) };
}

export function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** Cut to at most `max` words, preferring to end on a full sentence. */
export function truncateToWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  const cut = words.slice(0, max).join(" ");
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastStop > 0) return cut.slice(0, lastStop + 1);
  return cut.replace(/[,;:]$/, "") + ".";
}

/** `p_kevin`, `s_cake`; adds `_2`, `_3`... when taken. Adds the result to `taken`. */
export function slugId(prefix: string, name: string, taken: Set<Id>): Id {
  const slug =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "x";
  let id = `${prefix}_${slug}`;
  for (let n = 2; taken.has(id); n++) id = `${prefix}_${slug}_${n}`;
  taken.add(id);
  return id;
}

/**
 * Checks the rules from ai/README.md that a finished StoryState must satisfy.
 * Returns human-readable violations; empty means valid. Used by eval and tests.
 */
export function storyStateViolations(state: StoryState, lines: TranscriptLine[]): string[] {
  const out: string[] = [];
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const storyIds = new Set(state.stories.map((s) => s.id));

  for (const s of state.stories) {
    if (!isOneWord(s.keyword)) out.push(`${s.id}: keyword "${s.keyword}" is not one word`);
    if (s.sourceLineIds.length === 0) out.push(`${s.id}: no sourceLineIds`);
    for (const id of s.sourceLineIds) {
      if (!lineById.has(id)) out.push(`${s.id}: unknown source line ${id}`);
    }
    for (const r of s.reactions) {
      const line = lineById.get(r.lineId);
      if (!line) out.push(`${s.id}: reaction on unknown line ${r.lineId}`);
      else {
        if (!quoteInLine(r.quote, line.text)) out.push(`${s.id}: quote "${r.quote}" not in ${r.lineId}`);
        if (line.speakerId !== r.memberId) out.push(`${s.id}: reaction on ${r.lineId} credited to wrong person`);
      }
    }
    const range = seqRange([...s.sourceLineIds, ...s.reactions.map((r) => r.lineId)], lineById);
    if (range && (range.firstSeq !== s.firstSeq || range.lastSeq !== s.lastSeq)) {
      out.push(`${s.id}: seq ${s.firstSeq}-${s.lastSeq} should be ${range.firstSeq}-${range.lastSeq}`);
    }
  }
  for (const p of state.people) {
    for (const id of p.storyIds) if (!storyIds.has(id)) out.push(`${p.id}: unknown story ${id}`);
  }
  return out;
}
