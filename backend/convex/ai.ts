// Wiring between the backend and the AI. The backend side is done here: what
// goes in, when it runs, and how results are saved (dropped after a burn, never
// overwriting a newer story state).
//
// The AI calls themselves are stubs. The AI owner replaces the three functions
// marked STUB with real Claude calls (keep API keys in Convex env vars, not git).

import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { RECAP_MAX_WORDS } from "../../shared/schema";
import type { StoryState, TranscriptLine } from "../../shared/schema";
import { isRoomClosed, toLine, toStoryState } from "./lib";
import { openQuestion, person, story } from "./schema";

const newRecall = v.object({
  personId: v.string(),
  storyIds: v.array(v.string()),
  focusStoryId: v.optional(v.string()),
  matchedText: v.string(),
  confidence: v.number(),
});

/** What the slow path returns. Same as StoryState, minus the fields the backend fills in. */
const newStoryState = v.object({
  uptoSeq: v.number(),
  people: v.array(person),
  stories: v.array(story),
  currentTopic: v.string(),
  openQuestions: v.array(openQuestion),
});

type NewRecall = Infer<typeof newRecall>;
type NewStoryState = Infer<typeof newStoryState>;

// ---------------------------------------------------------------------------
// STUBS: the AI owner fills these in
// ---------------------------------------------------------------------------

/** STUB. Fast path (Claude Haiku, under 2 s): who did this line mention again? */
async function findRecalls(_line: TranscriptLine, _state: StoryState | null): Promise<NewRecall[]> {
  return [];
}

/** STUB. Slow path (Claude Sonnet): rebuild people, stories, reactions and topic from the transcript. */
async function buildStoryState(
  _lines: TranscriptLine[],
  _previous: StoryState | null,
): Promise<NewStoryState | null> {
  return null;
}

/** STUB. Recap of everything up to the latecomer's joinedAtSeq, at most RECAP_MAX_WORDS words. */
async function writeRecapText(lines: TranscriptLine[], _state: StoryState | null): Promise<string> {
  const speakers = [...new Set(lines.map((l) => l.speakerName))];
  const text = `You joined after ${lines.length} lines. ${speakers.join(", ")} have been talking.`;
  return text.split(/\s+/).slice(0, RECAP_MAX_WORDS).join(" ");
}

// ---------------------------------------------------------------------------
// Fast path: every line
// ---------------------------------------------------------------------------

export const fastPath = internalAction({
  args: { lineId: v.id("transcriptLines") },
  handler: async (ctx, { lineId }) => {
    const input = await ctx.runQuery(internal.ai.fastPathInput, { lineId });
    if (!input) return;
    const recalls = await findRecalls(input.line, input.storyState);
    if (recalls.length > 0) {
      await ctx.runMutation(internal.ai.saveRecalls, { lineId, recalls });
    }
  },
});

export const fastPathInput = internalQuery({
  args: { lineId: v.id("transcriptLines") },
  handler: async (ctx, { lineId }) => {
    const line = await ctx.db.get(lineId);
    if (!line || (await isRoomClosed(ctx, line.roomId))) return null;
    const state = await latestStoryState(ctx, line.roomId);
    return { line: toLine(line), storyState: state && toStoryState(state) };
  },
});

export const saveRecalls = internalMutation({
  args: {
    lineId: v.id("transcriptLines"),
    recalls: v.array(newRecall),
  },
  handler: async (ctx, { lineId, recalls }) => {
    const line = await ctx.db.get(lineId);
    if (!line || (await isRoomClosed(ctx, line.roomId))) return;
    for (const recall of recalls) {
      await ctx.db.insert("recalls", { ...recall, roomId: line.roomId, lineId, seq: line.seq });
    }
  },
});

// ---------------------------------------------------------------------------
// Slow path: scheduled SLOW_PATH_DELAY_MS after a line, at most one pending per room
// ---------------------------------------------------------------------------

export const slowPath = internalAction({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const input = await ctx.runMutation(internal.ai.beginSlowPath, { roomId });
    if (!input) return;
    const next = await buildStoryState(input.lines, input.storyState);
    if (next) await ctx.runMutation(internal.ai.saveStoryState, { roomId, state: next });
  },
});

/** Clears the scheduled flag first, so lines that arrive during this run schedule the next one. */
export const beginSlowPath = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "active") return null;
    await ctx.db.patch(roomId, { slowPathScheduled: false });
    const lines = await ctx.db
      .query("transcriptLines")
      .withIndex("by_room_seq", (q) => q.eq("roomId", roomId))
      .collect();
    const state = await latestStoryState(ctx, roomId);
    return { lines: lines.map(toLine), storyState: state && toStoryState(state) };
  },
});

export const saveStoryState = internalMutation({
  args: { roomId: v.id("rooms"), state: newStoryState },
  handler: async (ctx, { roomId, state }) => {
    if (await isRoomClosed(ctx, roomId)) return;
    const saved = await latestStoryState(ctx, roomId);
    // A slow AI reply must not overwrite a newer snapshot.
    if (saved && saved.uptoSeq >= state.uptoSeq) return;

    const doc = { ...state, roomId, updatedAt: Date.now() };
    if (saved) await ctx.db.replace(saved._id, doc);
    else await ctx.db.insert("storyStates", doc);
  },
});

// ---------------------------------------------------------------------------
// Recap: once per late joiner
// ---------------------------------------------------------------------------

export const writeRecap = internalAction({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const input = await ctx.runQuery(internal.ai.recapInput, { memberId });
    if (!input) return;
    const text = await writeRecapText(input.lines, input.storyState);
    // TODO(voice): turn `text` into audio with Cartesia Sonic and patch audioUrl.
    await ctx.runMutation(internal.ai.saveRecap, { memberId, uptoSeq: input.uptoSeq, text });
  },
});

export const recapInput = internalQuery({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get(memberId);
    if (!member || (await isRoomClosed(ctx, member.roomId))) return null;
    const lines = await ctx.db
      .query("transcriptLines")
      .withIndex("by_room_seq", (q) => q.eq("roomId", member.roomId).lte("seq", member.joinedAtSeq))
      .collect();
    const state = await latestStoryState(ctx, member.roomId);
    return {
      uptoSeq: member.joinedAtSeq,
      lines: lines.map(toLine),
      storyState: state && toStoryState(state),
    };
  },
});

export const saveRecap = internalMutation({
  args: { memberId: v.id("members"), uptoSeq: v.number(), text: v.string() },
  handler: async (ctx, { memberId, uptoSeq, text }) => {
    const member = await ctx.db.get(memberId);
    if (!member || (await isRoomClosed(ctx, member.roomId))) return;
    await ctx.db.insert("recaps", { roomId: member.roomId, memberId, uptoSeq, text });
  },
});

async function latestStoryState(ctx: QueryCtx, roomId: Id<"rooms">) {
  return await ctx.db
    .query("storyStates")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .unique();
}
