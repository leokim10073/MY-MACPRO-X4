// Slow path: rebuild people and stories from the transcript so far (Sonnet, every 20-30 s).

import type Anthropic from "@anthropic-ai/sdk";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type {
  Id,
  Member,
  OpenQuestion,
  Person,
  Reaction,
  Speculation,
  Story,
  StoryState,
  TranscriptLine,
} from "../../shared/schema";
import { callTool, SLOW_MODEL } from "./llm";
import { formatLines, formatMembers, formatState, STORY_SYSTEM } from "./prompts";
import { isOneWord, quoteInLine, seqRange, slugId, toOneWord } from "./validate";

// What the model fills in. Everything else (ids, member names, seq ranges, teller) is computed.
export interface PersonDraft {
  key: string;
  name: string;
  aliases: string[];
  memberId: string;
}
export interface StoryDraft {
  id: string;
  personKeys: string[];
  keyword: string;
  summary: string;
  sourceLineIds: string[];
  reactions: { lineId: string; quote: string }[];
  speculation: { lineId: string; text: string }[];
  openQuestion: string;
}
export interface StoryStateDraft {
  people: PersonDraft[];
  stories: StoryDraft[];
  currentTopic: string;
  openQuestions: { text: string; lineIds: string[] }[];
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const STORY_TOOL: BetaTool = {
  name: "save_story_state",
  description: "Save the updated list of people being talked about and the stories told about them.",
  input_schema: obj({
    people: { type: "array", items: obj({ key: str, name: str, aliases: strList, memberId: str }) },
    stories: {
      type: "array",
      items: obj({
        id: str,
        personKeys: strList,
        keyword: str,
        summary: str,
        sourceLineIds: strList,
        reactions: { type: "array", items: obj({ lineId: str, quote: str }) },
        speculation: { type: "array", items: obj({ lineId: str, text: str }) },
        openQuestion: str,
      }),
    },
    currentTopic: str,
    openQuestions: { type: "array", items: obj({ text: str, lineIds: strList }) },
  }) as BetaTool["input_schema"],
};

export interface StoryContext {
  roomId: Id;
  lines: TranscriptLine[];
  members: Member[];
  previous: StoryState | null;
  now?: number;
}

/**
 * Turns the model's draft into a valid StoryState. Drops or repairs anything that breaks the rules
 * and reports each problem so the caller can ask the model for one repair round.
 */
export function assembleStoryState(
  draft: StoryStateDraft,
  ctx: StoryContext,
): { state: StoryState; problems: string[] } {
  const problems: string[] = [];
  const lineById = new Map(ctx.lines.map((l) => [l.id, l]));
  const memberIds = new Set(ctx.members.map((m) => m.id));
  const prevPeople = new Map((ctx.previous?.people ?? []).map((p) => [p.id, p]));
  const prevStories = new Map((ctx.previous?.stories ?? []).map((s) => [s.id, s]));
  const takenPersonIds = new Set<Id>(prevPeople.keys());
  const takenStoryIds = new Set<Id>(prevStories.keys());
  const uptoSeq = Math.max(0, ...ctx.lines.map((l) => l.seq));

  // People: keep previous ids, mint new ones from the name.
  const personIdByKey = new Map<string, Id>();
  const people = new Map<Id, Person>();
  for (const d of draft.people) {
    let id: Id;
    if (prevPeople.has(d.key) && !people.has(d.key)) id = d.key;
    else id = slugId("p", d.name, takenPersonIds);
    personIdByKey.set(d.key, id);
    const aliases = [...new Set(d.aliases.map((a) => a.trim()).filter((a) => a && a !== d.name))];
    people.set(id, {
      id,
      roomId: ctx.roomId,
      name: d.name.trim(),
      aliases,
      ...(memberIds.has(d.memberId) ? { memberId: d.memberId } : {}),
      storyIds: [],
    });
  }

  // Stories.
  const stories: Story[] = [];
  const usedStoryIds = new Set<Id>();
  for (const d of draft.stories) {
    const label = d.id || d.keyword;
    const sourceLineIds = d.sourceLineIds.filter((id) => {
      if (lineById.has(id)) return true;
      problems.push(`story "${label}": sourceLineIds has unknown line ${id}`);
      return false;
    });
    if (sourceLineIds.length === 0) {
      problems.push(`story "${label}": needs at least one valid sourceLineId`);
      continue;
    }
    const personIds = d.personKeys
      .map((k) => personIdByKey.get(k) ?? (prevPeople.has(k) ? k : undefined))
      .filter((id): id is Id => id !== undefined);
    if (personIds.length === 0) {
      problems.push(`story "${label}": personKeys must match a key in people`);
      continue;
    }

    let keyword = d.keyword.trim();
    if (!isOneWord(keyword)) {
      problems.push(`story "${label}": keyword "${d.keyword}" must be exactly one word`);
      keyword = toOneWord(keyword);
    }

    const reactions: Reaction[] = [];
    for (const r of d.reactions) {
      const line = lineById.get(r.lineId);
      if (!line) {
        problems.push(`story "${label}": reaction on unknown line ${r.lineId}`);
      } else if (!quoteInLine(r.quote, line.text)) {
        problems.push(`story "${label}": reaction quote "${r.quote}" is not in line ${r.lineId}; copy it exactly`);
      } else {
        reactions.push({ memberId: line.speakerId, memberName: line.speakerName, quote: r.quote.trim(), lineId: line.id });
      }
    }
    const speculation: Speculation[] = [];
    for (const s of d.speculation) {
      const line = lineById.get(s.lineId);
      if (!line) problems.push(`story "${label}": speculation on unknown line ${s.lineId}`);
      else speculation.push({ memberId: line.speakerId, memberName: line.speakerName, text: s.text.trim(), lineId: line.id });
    }

    let id: Id;
    if (prevStories.has(d.id) && !usedStoryIds.has(d.id)) id = d.id;
    else id = slugId("s", keyword, takenStoryIds);
    usedStoryIds.add(id);

    const range = seqRange([...sourceLineIds, ...reactions.map((r) => r.lineId)], lineById)!;
    stories.push({
      id,
      roomId: ctx.roomId,
      personIds: [...new Set(personIds)],
      keyword,
      summary: d.summary.trim(),
      tellerId: tellerOf(sourceLineIds, lineById),
      reactions,
      speculation,
      ...(d.openQuestion.trim() ? { openQuestion: d.openQuestion.trim() } : {}),
      sourceLineIds,
      firstSeq: range.firstSeq,
      lastSeq: range.lastSeq,
    });
  }

  // Stories never disappear: carry over any previous story the model left out, with its people.
  for (const prev of prevStories.values()) {
    if (usedStoryIds.has(prev.id)) continue;
    stories.push(prev);
    for (const pid of prev.personIds) {
      const p = prevPeople.get(pid);
      if (!people.has(pid) && p) people.set(pid, { ...p, storyIds: [] });
    }
  }

  stories.sort((a, b) => a.firstSeq - b.firstSeq || a.lastSeq - b.lastSeq);
  for (const s of stories) {
    for (const pid of s.personIds) people.get(pid)?.storyIds.push(s.id);
  }

  const openQuestions: OpenQuestion[] = draft.openQuestions
    .map((q) => ({ text: q.text.trim(), lineIds: q.lineIds.filter((id) => lineById.has(id)) }))
    .filter((q) => q.text && q.lineIds.length > 0);

  return {
    state: {
      roomId: ctx.roomId,
      uptoSeq,
      people: [...people.values()].filter((p) => p.storyIds.length > 0),
      stories,
      currentTopic: draft.currentTopic.trim(),
      openQuestions,
      updatedAt: ctx.now ?? Date.now(),
    },
    problems,
  };
}

/** The member who said most of the source lines; ties go to whoever spoke first. */
function tellerOf(sourceLineIds: Id[], lineById: Map<Id, TranscriptLine>): Id {
  const counts = new Map<Id, number>();
  for (const id of sourceLineIds) {
    const speaker = lineById.get(id)!.speakerId;
    counts.set(speaker, (counts.get(speaker) ?? 0) + 1);
  }
  let best = lineById.get(sourceLineIds[0])!.speakerId;
  for (const [speaker, n] of counts) if (n > counts.get(best)!) best = speaker;
  return best;
}

export async function buildStoryState(
  ctx: StoryContext,
  options: { client?: Anthropic } = {},
): Promise<StoryState> {
  const user = [
    `Room members:\n${formatMembers(ctx.members)}`,
    `Previous snapshot:\n${ctx.previous ? formatState(ctx.previous) : "(none yet)"}`,
    formatLines(ctx.lines),
    `Call save_story_state with the full updated snapshot.`,
  ].join("\n\n");

  const { input } = await callTool({
    client: options.client,
    model: SLOW_MODEL,
    system: STORY_SYSTEM,
    user,
    tool: STORY_TOOL,
    maxTokens: 16_000,
    effort: "medium",
    check: (draft) => assembleStoryState(draft as StoryStateDraft, ctx).problems,
  });
  return assembleStoryState(input as StoryStateDraft, ctx).state;
}
