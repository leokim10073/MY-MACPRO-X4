// Fast path: does this new line point back to someone already talked about? (Haiku, every line, under 2 s)

import type Anthropic from "@anthropic-ai/sdk";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Person, Recall, StoryState, TranscriptLine } from "../../shared/schema";
import { callTool, FAST_MODEL } from "./llm";
import { formatLines, formatState, RECALL_SYSTEM } from "./prompts";
import { normalize } from "./validate";

/** How the line refers to the person. */
export type RecallReference = "name" | "alias" | "pronoun" | "story_reference";

/** What the model reports. It answers plain questions; scoreRecall turns them into a confidence. */
export interface RecallDraft {
  personId: string;
  matchedText: string;
  focusStoryId: string;
  reference: RecallReference;
  /** Only one known person could be meant, given the recent lines. */
  onlyOneFits: boolean;
  /** The line just continues the story being told right now, so it isn't a recall. */
  continuesCurrentStory: boolean;
}

const REFERENCE_CONFIDENCE: Record<RecallReference, number> = {
  name: 0.95,
  alias: 0.95,
  story_reference: 0.9,
  pronoun: 0.8,
};

/** Below RECALL_MIN_CONFIDENCE: kept for logs and evals, never shown on a phone. */
const AMBIGUOUS_CONFIDENCE = 0.5;

/**
 * Confidence from fixed rules, so the same answer always gets the same score.
 * Returns null when the line isn't a recall: it continues the current story, or the person
 * is in the room (recalls are for people the latecomer has never met).
 */
export function scoreRecall(draft: RecallDraft, person: Person): number | null {
  if (draft.continuesCurrentStory || person.memberId) return null;
  if (!draft.onlyOneFits) return AMBIGUOUS_CONFIDENCE;
  return REFERENCE_CONFIDENCE[draft.reference] ?? AMBIGUOUS_CONFIDENCE;
}

function recallTool(state: StoryState): BetaTool {
  return {
    name: "report_recalls",
    description: "Report the recalls in the new line. Use an empty list when there are none.",
    input_schema: {
      type: "object",
      properties: {
        recalls: {
          type: "array",
          items: {
            type: "object",
            properties: {
              personId: { type: "string", enum: state.people.map((p) => p.id) },
              matchedText: { type: "string" },
              focusStoryId: { type: "string", enum: ["", ...state.stories.map((s) => s.id)] },
              reference: { type: "string", enum: ["name", "alias", "pronoun", "story_reference"] },
              onlyOneFits: { type: "boolean" },
              continuesCurrentStory: { type: "boolean" },
            },
            required: ["personId", "matchedText", "focusStoryId", "reference", "onlyOneFits", "continuesCurrentStory"],
            additionalProperties: false,
          },
        },
      },
      required: ["recalls"],
      additionalProperties: false,
    },
  };
}

/** Fills in ids, storyIds, seq and confidence; drops recalls whose person or matched text don't check out, or that aren't recalls. */
export function assembleRecalls(drafts: RecallDraft[], line: TranscriptLine, state: StoryState): Recall[] {
  const people = new Map(state.people.map((p) => [p.id, p]));
  const firstSeq = new Map(state.stories.map((s) => [s.id, s.firstSeq]));
  const byPerson = new Map<string, Recall>();

  for (const d of drafts) {
    const person = people.get(d.personId);
    if (!person) continue;
    const confidence = scoreRecall(d, person);
    if (confidence === null) continue;
    const matchedText = d.matchedText.trim();
    if (!matchedText || !normalize(line.text).includes(normalize(matchedText))) continue;
    const storyIds = person.storyIds
      .filter((id) => firstSeq.has(id))
      .sort((a, b) => firstSeq.get(a)! - firstSeq.get(b)!);
    if (storyIds.length === 0) continue;

    const recall: Recall = {
      id: `rc_${line.id}_${person.id}`,
      roomId: line.roomId,
      lineId: line.id,
      seq: line.seq,
      personId: person.id,
      storyIds,
      ...(storyIds.includes(d.focusStoryId) ? { focusStoryId: d.focusStoryId } : {}),
      matchedText,
      confidence,
    };
    const existing = byPerson.get(person.id);
    if (!existing || recall.confidence > existing.confidence) byPerson.set(person.id, recall);
  }
  return [...byPerson.values()];
}

export async function detectRecalls(
  input: { line: TranscriptLine; state: StoryState | null; recentLines?: TranscriptLine[] },
  options: { client?: Anthropic } = {},
): Promise<Recall[]> {
  const { line, state } = input;
  if (!state || state.people.length === 0) return [];

  const recent = (input.recentLines ?? []).filter((l) => l.seq < line.seq).slice(-6);
  const user = [
    `Known people and their stories:\n${formatState(state)}`,
    `Recent lines:\n${recent.length ? formatLines(recent) : "(none)"}`,
    `New line:\n${formatLines([line])}`,
  ].join("\n\n");

  const { input: raw } = await callTool({
    client: options.client,
    model: FAST_MODEL,
    system: RECALL_SYSTEM,
    user,
    tool: recallTool(state),
    maxTokens: 1024,
    fast: true,
    timeoutMs: 10_000,
  });
  return assembleRecalls((raw as { recalls: RecallDraft[] }).recalls ?? [], line, state);
}
