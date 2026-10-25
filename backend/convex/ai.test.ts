/// <reference types="vite/client" />

// Wiring between the backend and ai/, with the AI functions replaced by fakes:
// what goes in, and whether what comes out is saved and logged.

import { convexTest } from "convex-test";
import { withComponents } from "../testComponents";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Recall, StoryState } from "../../shared/schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const ai = vi.hoisted(() => ({
  detectRecalls: vi.fn(),
  buildStoryState: vi.fn(),
  writeRecap: vi.fn(),
}));
vi.mock("../../ai/index", () => ai);

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  ai.detectRecalls.mockReset().mockResolvedValue([]);
  ai.buildStoryState.mockReset();
  ai.writeRecap.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function setup() {
  return withComponents(convexTest(schema, modules));
}
type T = ReturnType<typeof setup>;

async function newRoom(t: T) {
  const r = await t.mutation(api.rooms.create, { name: "Alex" });
  return { token: r.sessionToken, roomId: r.room.id as Id<"rooms">, memberId: r.member.id, invite: r.room.inviteToken };
}
const addLine = (t: T, token: string, text: string) =>
  t.mutation(api.lines.add, { sessionToken: token, text, at: Date.now() });
const runScheduled = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);
const eventTypes = async (t: T, room: { roomId: Id<"rooms">; token: string }) =>
  (await t.query(api.events.listAfter, { roomId: room.roomId, sessionToken: room.token, afterEventSeq: 0 })).events.map(
    (e) => e.event.type,
  );

/** What ai/buildStoryState returns: a full StoryState, including roomId on people and stories. */
function aiStoryState(roomId: string, tellerId: string, lineId: string, uptoSeq: number): StoryState {
  return {
    roomId,
    uptoSeq,
    people: [{ id: "p_kevin", roomId, name: "Kevin", aliases: ["Roommate Kevin"], storyIds: ["s_cake"] }],
    stories: [
      {
        id: "s_cake",
        roomId,
        personIds: ["p_kevin"],
        keyword: "Cake",
        summary: "Alex says Kevin ate the whole cake.",
        tellerId,
        reactions: [],
        speculation: [],
        sourceLineIds: [lineId],
        firstSeq: 1,
        lastSeq: 1,
      },
    ],
    currentTopic: "Kevin",
    openQuestions: [],
    updatedAt: 123,
  };
}

describe("AI wiring with a key set", () => {
  test("slow path sends lines and members to ai/ and saves the result", async () => {
    const t = setup();
    const host = await newRoom(t);
    const line = (await addLine(t, host.token, "Kevin ate my whole cake"))!;
    ai.buildStoryState.mockResolvedValue(aiStoryState(host.roomId, host.memberId, line.lineId, 1));
    await runScheduled(t);

    expect(ai.buildStoryState).toHaveBeenCalledTimes(1);
    const ctx = ai.buildStoryState.mock.calls[0][0];
    expect(ctx.roomId).toBe(host.roomId);
    expect(ctx.lines.map((l: { text: string }) => l.text)).toEqual(["Kevin ate my whole cake"]);
    expect(ctx.members.map((m: { name: string }) => m.name)).toEqual(["Alex"]);
    expect(ctx.previous).toBeNull();

    const state = await t.query(api.story.state, { sessionToken: host.token });
    expect(state?.stories.map((s) => s.keyword)).toEqual(["Cake"]);
    expect(await eventTypes(t, host)).toContain("story_state_updated");
  });

  test("fast path sends the line, recent lines and story state, and saves recalls", async () => {
    const t = setup();
    const host = await newRoom(t);
    const first = (await addLine(t, host.token, "Kevin ate my whole cake"))!;
    ai.buildStoryState.mockResolvedValue(aiStoryState(host.roomId, host.memberId, first.lineId, 1));
    await runScheduled(t);

    ai.detectRecalls.mockImplementation(async ({ line }) => [
      {
        id: "rc_ai",
        roomId: line.roomId,
        lineId: line.id,
        seq: line.seq,
        personId: "p_kevin",
        storyIds: ["s_cake"],
        focusStoryId: "s_cake",
        matchedText: "the cake thing",
        confidence: 0.9,
      } satisfies Recall,
    ]);
    await addLine(t, host.token, "after the cake thing he's lucky");
    await runScheduled(t);

    const input = ai.detectRecalls.mock.calls.at(-1)![0];
    expect(input.line.text).toBe("after the cake thing he's lucky");
    expect(input.recentLines.map((l: { seq: number }) => l.seq)).toEqual([1]);
    expect(input.state.stories[0].id).toBe("s_cake");

    const recalls = await t.query(api.story.recalls, { sessionToken: host.token, afterSeq: 0 });
    expect(recalls).toHaveLength(1);
    expect(recalls[0]).toMatchObject({ seq: 2, personId: "p_kevin", focusStoryId: "s_cake", confidence: 0.9 });
    expect(recalls[0].id).not.toBe("rc_ai");
    expect(await eventTypes(t, host)).toContain("recall");
  });

  test("a late joiner's recap comes from ai/, with their name and join point", async () => {
    const t = setup();
    const host = await newRoom(t);
    await addLine(t, host.token, "one");
    await addLine(t, host.token, "two");
    ai.buildStoryState.mockRejectedValue(new Error("not under test"));
    ai.writeRecap.mockResolvedValue({ id: "x", roomId: host.roomId, uptoSeq: 2, text: "Alex is talking about Kevin.", createdAt: 0 });
    const taylor = await t.mutation(api.rooms.join, { inviteToken: host.invite, name: "Taylor" });
    await t.finishAllScheduledFunctions(vi.runAllTimers).catch(() => {});

    expect(ai.writeRecap).toHaveBeenCalledWith(expect.objectContaining({ joinerName: "Taylor", uptoSeq: 2, roomId: host.roomId }));
    const recap = await t.query(api.story.myRecap, { sessionToken: taylor.sessionToken });
    expect(recap?.text).toBe("Alex is talking about Kevin.");
  });

  test("if the AI recap fails, the latecomer still gets the placeholder", async () => {
    const t = setup();
    const host = await newRoom(t);
    await addLine(t, host.token, "one");
    ai.buildStoryState.mockRejectedValue(new Error("not under test"));
    ai.writeRecap.mockRejectedValue(new Error("API down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const taylor = await t.mutation(api.rooms.join, { inviteToken: host.invite, name: "Taylor" });
    await t.finishAllScheduledFunctions(vi.runAllTimers).catch(() => {});

    const recap = await t.query(api.story.myRecap, { sessionToken: taylor.sessionToken });
    expect(recap?.text).toContain("You joined after 1 lines");
  });
});

describe("without a key", () => {
  test("the room works and ai/ is never called", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const t = setup();
    const host = await newRoom(t);
    await addLine(t, host.token, "one");
    const taylor = await t.mutation(api.rooms.join, { inviteToken: host.invite, name: "Taylor" });
    await runScheduled(t);

    expect(ai.detectRecalls).not.toHaveBeenCalled();
    expect(ai.buildStoryState).not.toHaveBeenCalled();
    expect(ai.writeRecap).not.toHaveBeenCalled();
    expect((await t.query(api.story.myRecap, { sessionToken: taylor.sessionToken }))?.text).toContain("You joined");
  });
});
