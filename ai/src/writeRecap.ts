// Late join: the spoken catch-up covering everything up to joinedAtSeq (Sonnet).

import type Anthropic from "@anthropic-ai/sdk";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { RECAP_MAX_WORDS, type Id, type Recap, type Seq, type StoryState, type TranscriptLine } from "../../shared/schema";
import { callTool, SLOW_MODEL } from "./llm";
import { formatLines, formatState, RECAP_SYSTEM } from "./prompts";
import { countWords, truncateToWords } from "./validate";

export const RECAP_TOOL: BetaTool = {
  name: "save_recap",
  description: `Save the spoken catch-up text (at most ${RECAP_MAX_WORDS} words).`,
  input_schema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  },
};

export function recapProblems(text: string): string[] {
  const n = countWords(text);
  return n > RECAP_MAX_WORDS ? [`text has ${n} words; it must be at most ${RECAP_MAX_WORDS}`] : [];
}

export function assembleRecap(text: string, roomId: Id, uptoSeq: Seq, now = Date.now()): Recap {
  return {
    id: `recap_${uptoSeq}`,
    roomId,
    uptoSeq,
    text: truncateToWords(text.replace(/\s+/g, " "), RECAP_MAX_WORDS),
    createdAt: now,
  };
}

export async function writeRecap(
  input: { roomId: Id; lines: TranscriptLine[]; state: StoryState | null; uptoSeq: Seq; joinerName?: string },
  options: { client?: Anthropic; now?: number } = {},
): Promise<Recap> {
  const lines = input.lines.filter((l) => l.seq <= input.uptoSeq);
  // Only stories that had started by the join point; the snapshot may be newer than uptoSeq.
  const state = input.state && {
    ...input.state,
    stories: input.state.stories.filter((s) => s.firstSeq <= input.uptoSeq),
  };
  const user = [
    input.joinerName ? `${input.joinerName} is joining now.` : "",
    state ? `Story notes so far:\n${formatState(state)}` : "",
    formatLines(lines),
    `Call save_recap with the catch-up.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { input: raw } = await callTool({
    client: options.client,
    model: SLOW_MODEL,
    system: RECAP_SYSTEM,
    user,
    tool: RECAP_TOOL,
    maxTokens: 4_000,
    effort: "low",
    check: (d) => recapProblems((d as { text: string }).text),
  });
  return assembleRecap((raw as { text: string }).text, input.roomId, input.uptoSeq, options.now);
}
