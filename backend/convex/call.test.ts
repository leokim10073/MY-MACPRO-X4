/// <reference types="vite/client" />

// The always-on call, with voice/'s LiveKit helpers replaced by fakes.

import { convexTest } from "convex-test";
import { withComponents } from "../testComponents";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const livekit = vi.hoisted(() => ({
  mintCallToken: vi.fn(),
  endCall: vi.fn(),
}));
vi.mock("../../voice/src/server/livekit", () => livekit);

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("LIVEKIT_URL", "wss://test.livekit.cloud");
  vi.stubEnv("LIVEKIT_API_KEY", "key");
  vi.stubEnv("LIVEKIT_API_SECRET", "secret");
  livekit.mintCallToken.mockReset().mockResolvedValue({ url: "wss://test.livekit.cloud", token: "call-token" });
  livekit.endCall.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function room() {
  const t = withComponents(convexTest(schema, modules));
  const host = await t.mutation(api.rooms.create, { name: "Alex" });
  return { t, host };
}

describe("call.callToken", () => {
  test("members get a token for their own room's call, under their own name", async () => {
    const { t, host } = await room();
    expect(await t.action(api.call.callToken, { sessionToken: host.sessionToken })).toEqual({
      url: "wss://test.livekit.cloud",
      token: "call-token",
    });
    expect(livekit.mintCallToken).toHaveBeenCalledWith(
      { url: "wss://test.livekit.cloud", apiKey: "key", apiSecret: "secret" },
      { roomId: host.room.id, memberId: host.member.id, name: "Alex" },
    );
  });

  test("outsiders, people who left and burned rooms get nothing", async () => {
    const { t, host } = await room();
    const sam = await t.mutation(api.rooms.join, { inviteToken: host.room.inviteToken, name: "Sam" });
    await expect(t.action(api.call.callToken, { sessionToken: "nope" })).rejects.toThrow("Not a member");
    await t.mutation(api.rooms.leave, { sessionToken: sam.sessionToken });
    await expect(t.action(api.call.callToken, { sessionToken: sam.sessionToken })).rejects.toThrow();
    await t.mutation(api.rooms.burn, { sessionToken: host.sessionToken });
    await expect(t.action(api.call.callToken, { sessionToken: host.sessionToken })).rejects.toThrow();
    expect(livekit.mintCallToken).not.toHaveBeenCalled();
  });

  test("without LiveKit keys the call is refused clearly", async () => {
    vi.stubEnv("LIVEKIT_URL", "");
    const { t, host } = await room();
    await expect(t.action(api.call.callToken, { sessionToken: host.sessionToken })).rejects.toThrow(
      "The call isn't set up",
    );
  });
});

describe("burn ends the call", () => {
  test("the host's burn schedules hanging up this room's call", async () => {
    const { t, host } = await room();
    await t.mutation(api.rooms.burn, { sessionToken: host.sessionToken });
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.some((j) => j.name.includes("endRoomCall") && (j.args[0] as { roomId: string }).roomId === host.room.id)).toBe(
      true,
    );
  });

  test("endRoomCall hangs up through LiveKit, and does nothing without keys", async () => {
    const t = withComponents(convexTest(schema, modules));
    await t.action(internal.call.endRoomCall, { roomId: "room1" });
    expect(livekit.endCall).toHaveBeenCalledWith(
      { url: "wss://test.livekit.cloud", apiKey: "key", apiSecret: "secret" },
      "room1",
    );
    livekit.endCall.mockClear();
    vi.stubEnv("LIVEKIT_API_SECRET", "");
    await t.action(internal.call.endRoomCall, { roomId: "room1" });
    expect(livekit.endCall).not.toHaveBeenCalled();
  });
});
