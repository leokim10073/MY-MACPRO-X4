// Fast path: does this new line point back to someone already talked about? (Haiku, every line, under 2 s)

import type Anthropic from "@anthropic-ai/sdk";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Recall, StoryState, TranscriptLine } from "../../shared/schema";
import { callTool, FAST_MODEL } from "./llm";
import { formatLines, formatState, RECALL_SYSTEM } from "./prompts";
import { normalize } from "./validate";

export interface RecallDraft {
  personId: string;
  matchedText: string;
  focusStoryId: string;
  confidence: number;
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
              confidence: { type: "number" },
            },
            required: ["personId", "matchedText", "focusStoryId", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["recalls"],
      additionalProperties: false,
    },
  };
}

/** Fills in ids, storyIds and seq; drops recalls whose person or matched text don't check out. */
export function assembleRecalls(drafts: RecallDraft[], line: TranscriptLine, state: StoryState): Recall[] {
  const people = new Map(state.people.map((p) => [p.id, p]));
  const firstSeq = new Map(state.stories.map((s) => [s.id, s.firstSeq]));
  const byPerson = new Map<string, Recall>();

  for (const d of drafts) {
    const person = people.get(d.personId);
    if (!person) continue;
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
      confidence: Math.min(1, Math.max(0, d.confidence)),
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
