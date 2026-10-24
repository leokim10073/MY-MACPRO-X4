/// <reference types="vite/client" />

// Leave (not burn): the member drops out of the room for everyone.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function room() {
  const t = convexTest(schema, modules);
  const host = await t.mutation(api.rooms.create, { name: "Alex" });
  const sam = await t.mutation(api.rooms.join, { inviteToken: host.room.inviteToken, name: "Sam" });
  const roomId = host.room.id as Id<"rooms">;
  const log = async () =>
    (await t.query(api.events.listAfter, { roomId, sessionToken: host.sessionToken, afterEventSeq: 0 })).events.map(
      (e) => e.event,
    );
  return { t, host, sam, roomId, log };
}

describe("rooms.leave", () => {
  test("tells every phone, and the leaver drops out of the member list", async () => {
    const { t, host, sam, log } = await room();
    await t.mutation(api.rooms.leave, { sessionToken: sam.sessionToken });

    expect((await log()).at(-1)).toEqual({ type: "member_left", memberId: sam.member.id });
    const view = await t.query(api.rooms.get, { sessionToken: host.sessionToken });
    expect(view?.members.map((m) => m.name)).toEqual(["Alex"]);
  });

  test("the leaver's token stops working", async () => {
    const { t, sam } = await room();
    await t.mutation(api.rooms.leave, { sessionToken: sam.sessionToken });
    await expect(t.mutation(api.lines.add, { sessionToken: sam.sessionToken, text: "hi", at: 1 })).rejects.toThrow(
      "Not a member",
    );
    expect(await t.query(api.rooms.get, { sessionToken: sam.sessionToken })).toBeNull();
  });

  test("their lines stay in the transcript", async () => {
    const { t, host, sam } = await room();
    await t.mutation(api.lines.add, { sessionToken: sam.sessionToken, text: "Kevin ate my cake", at: 1 });
    await t.mutation(api.rooms.leave, { sessionToken: sam.sessionToken });
    const lines = await t.query(api.lines.list, { sessionToken: host.sessionToken });
    expect(lines.map((l) => [l.speakerName, l.text])).toEqual([["Sam", "Kevin ate my cake"]]);
  });

  test("leaving twice, or after a burn, does nothing", async () => {
    const { t, host, sam, log } = await room();
    await t.mutation(api.rooms.leave, { sessionToken: sam.sessionToken });
    const before = (await log()).length;
    await t.mutation(api.rooms.leave, { sessionToken: sam.sessionToken });
    expect((await log()).length).toBe(before);

    await t.mutation(api.rooms.burn, { sessionToken: host.sessionToken });
    await expect(t.mutation(api.rooms.leave, { sessionToken: host.sessionToken })).resolves.toBeNull();
  });

  test("a replay speaker is never confused with someone who left under the same name", async () => {
    const { t, host } = await room();
    const alex2 = await t.mutation(api.rooms.join, { inviteToken: host.room.inviteToken, name: "Alex" });
    await t.mutation(api.rooms.leave, { sessionToken: alex2.sessionToken });
    await t.mutation(api.replay.start, { sessionToken: host.sessionToken });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const lines = await t.query(api.lines.list, { sessionToken: host.sessionToken });
    const alexLines = lines.filter((l) => l.speakerName === "Alex");
    expect(alexLines.length).toBeGreaterThan(0);
    expect(alexLines.every((l) => l.speakerId !== alex2.member.id)).toBe(true);
  });
});
