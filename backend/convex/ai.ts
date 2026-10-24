// Wiring between the backend and the AI in ai/: what goes in, when it runs, and
// how results are saved (dropped after a burn, never overwriting a newer story state).
//
// The AI runs only when the deployment has a key:
//   npx convex env set ANTHROPIC_API_KEY sk-ant-...
// Without one the room still works: no recalls or story state, and a placeholder recap.

import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { buildStoryState, detectRecalls, writeRecap as writeRecapWithAi } from "../../ai/index";
import { RECAP_MAX_WORDS } from "../../shared/schema";
import type { Recall, StoryState, TranscriptLine } from "../../shared/schema";
import {
  appendEvent,
  isRoomClosed,
  toLine,
  toMember,
  toRecall,
  toRecap,
  toStoryState,
} from "./lib";
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

function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Recalls from ai/ carry ids the backend assigns itself; keep only what the model decided. */
function toNewRecall({ personId, storyIds, focusStoryId, matchedText, confidence }: Recall): NewRecall {
  return { personId, storyIds, focusStoryId, matchedText, confidence };
}

/** StoryState from ai/ minus the fields the backend fills in (roomId, updatedAt). */
function toNewStoryState(state: StoryState): NewStoryState {
  return {
    uptoSeq: state.uptoSeq,
    people: state.people.map(({ roomId: _roomId, ...person }) => person),
    stories: state.stories.map(({ roomId: _roomId, ...story }) => story),
    currentTopic: state.currentTopic,
    openQuestions: state.openQuestions,
  } as NewStoryState;
}

/** Used when there is no API key or the AI call fails, so a latecomer always gets something. */
function placeholderRecap(lines: TranscriptLine[]): string {
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
    if (!aiEnabled()) return;
    const input = await ctx.runQuery(internal.ai.fastPathInput, { lineId });
    if (!input) return;
    const recalls = await detectRecalls({
      line: input.line,
      state: input.storyState,
      recentLines: input.recentLines,
    });
    if (recalls.length > 0) {
      await ctx.runMutation(internal.ai.saveRecalls, { lineId, recalls: recalls.map(toNewRecall) });
    }
  },
});

export const fastPathInput = internalQuery({
  args: { lineId: v.id("transcriptLines") },
  handler: async (ctx, { lineId }) => {
    const line = await ctx.db.get(lineId);
    if (!line || (await isRoomClosed(ctx, line.roomId))) return null;
    const state = await latestStoryState(ctx, line.roomId);
    // A few lines before this one help resolve "he" and "that guy".
    const recent = await ctx.db
      .query("transcriptLines")
      .withIndex("by_room_seq", (q) => q.eq("roomId", line.roomId).lt("seq", line.seq))
      .order("desc")
      .take(6);
    return {
      line: toLine(line),
      recentLines: recent.reverse().map(toLine),
      storyState: state && toStoryState(state),
    };
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
      const id = await ctx.db.insert("recalls", { ...recall, roomId: line.roomId, lineId, seq: line.seq });
      await appendEvent(ctx, line.roomId, { type: "recall", recall: toRecall((await ctx.db.get(id))!) });
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
    if (!input || !aiEnabled() || input.lines.length === 0) return;
    const next = await buildStoryState({
      roomId,
      lines: input.lines,
      members: input.members,
      previous: input.storyState,
    });
    await ctx.runMutation(internal.ai.saveStoryState, { roomId, state: toNewStoryState(next) });
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
    const members = await ctx.db
      .query("members")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    const state = await latestStoryState(ctx, roomId);
    return {
      lines: lines.map(toLine),
      members: members.map(toMember),
      storyState: state && toStoryState(state),
    };
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
    let id = saved?._id;
    if (id) await ctx.db.replace(id, doc);
    else id = await ctx.db.insert("storyStates", doc);
    const storyState = toStoryState((await ctx.db.get(id))!);
    await appendEvent(ctx, roomId, { type: "story_state_updated", storyState });
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
    let text = placeholderRecap(input.lines);
    if (aiEnabled()) {
      try {
        const recap = await writeRecapWithAi({
          roomId: input.roomId,
          lines: input.lines,
          state: input.storyState,
          uptoSeq: input.uptoSeq,
          joinerName: input.joinerName,
        });
        text = recap.text;
      } catch (error) {
        console.error("AI recap failed, using the placeholder", error);
      }
    }
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
      roomId: member.roomId,
      joinerName: member.name,
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
    const id = await ctx.db.insert("recaps", { roomId: member.roomId, memberId, uptoSeq, text });
    await appendEvent(ctx, member.roomId, { type: "recap_ready", recap: toRecap((await ctx.db.get(id))!) });
  },
});

async function latestStoryState(ctx: QueryCtx, roomId: Id<"rooms">) {
  return await ctx.db
    .query("storyStates")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .unique();
}
