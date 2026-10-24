// Helpers shared by the Convex functions: membership checks and conversion
// from Convex documents to the shapes in shared/schema.ts.

import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type {
  Member,
  Recall,
  Recap,
  Room,
  RoomEvent,
  StoryState,
  TranscriptLine,
} from "../../shared/schema";

/** Rooms that nobody burns are burned automatically after this long. */
export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

/** How long to wait after a new line before running the AI slow path. */
export const SLOW_PATH_DELAY_MS = 25_000;

export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Looks up the caller by their member token and checks the room is still active.
 * Every public read and write goes through this.
 */
export async function requireMember(ctx: QueryCtx, token: string) {
  const member = await ctx.db
    .query("members")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!member) throw new ConvexError("Not a member of this room");
  const room = await ctx.db.get(member.roomId);
  if (!room || room.status !== "active") throw new ConvexError("This room has ended");
  return { member, room };
}

export async function requireHost(ctx: QueryCtx, token: string) {
  const { member, room } = await requireMember(ctx, token);
  if (room.hostMemberId !== member._id) throw new ConvexError("Only the host can do that");
  return { member, room };
}

/** Adds a RoomEvent to the room's log with the next eventSeq. Call it in the mutation that made the change. */
export async function appendEvent(ctx: MutationCtx, roomId: Id<"rooms">, event: RoomEvent) {
  const room = (await ctx.db.get(roomId))!;
  const eventSeq = room.lastEventSeq + 1;
  await ctx.db.patch(roomId, { lastEventSeq: eventSeq });
  await ctx.db.insert("events", { roomId, eventSeq, event });
}

/** True if the room is gone or burned. AI results that land after a burn are dropped. */
export async function isRoomClosed(ctx: QueryCtx, roomId: Id<"rooms">) {
  const room = await ctx.db.get(roomId);
  return !room || room.status !== "active";
}

export function toRoom(room: Doc<"rooms">): Room {
  return {
    id: room._id,
    hostMemberId: room.hostMemberId ?? "",
    status: room.status,
    inviteToken: room.inviteToken,
    createdAt: room._creationTime,
    expiresAt: room.expiresAt,
  };
}

export function toMember(member: Doc<"members">): Member {
  return {
    id: member._id,
    roomId: member.roomId,
    name: member.name,
    joinedAtSeq: member.joinedAtSeq,
    joinedAt: member._creationTime,
  };
}

export function toLine(line: Doc<"transcriptLines">): TranscriptLine {
  return {
    id: line._id,
    roomId: line.roomId,
    speakerId: line.speakerId,
    speakerName: line.speakerName,
    text: line.text,
    seq: line.seq,
    at: line.at,
  };
}

export function toStoryState(state: Doc<"storyStates">): StoryState {
  const { _id, _creationTime, ...rest } = state;
  return {
    ...rest,
    people: rest.people.map((p) => ({ ...p, roomId: state.roomId })),
    stories: rest.stories.map((s) => ({ ...s, roomId: state.roomId })),
  };
}

export function toRecall(recall: Doc<"recalls">): Recall {
  const { _id, _creationTime, ...rest } = recall;
  return { id: _id, ...rest };
}

export function toRecap(recap: Doc<"recaps">): Recap {
  return {
    id: recap._id,
    roomId: recap.roomId,
    uptoSeq: recap.uptoSeq,
    text: recap.text,
    audioUrl: recap.audioUrl,
    createdAt: recap._creationTime,
  };
}
