import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { PRESENCE_WINDOW_MS, recordPresence, resetPresence } from "@/backend/presence";
import {
  deliverMessage,
  handleClientEvent,
  handleSocialUpgrade,
  onSocketClose,
  onSocketOpen,
  resetRealtime,
  setClubNameResolver,
  statusOf,
  sweepStatuses,
  type SocialSocket,
} from "@/backend/social/realtime";
import { befriend, blockUser, insertMessage } from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { dmRoomId } from "@/Domain/social/rooms";
import type { ServerEvent } from "@/types/socialTypes";

type FakeSocket = SocialSocket & { events: ServerEvent[] };

function fakeSocket(userId: string): FakeSocket {
  const events: ServerEvent[] = [];
  return {
    data: { userId, saveId: null, clubName: null },
    events,
    send(message: string) {
      events.push(JSON.parse(message) as ServerEvent);
    },
  };
}

beforeEach(() => {
  resetRealtime();
  resetPresence();
});

describe("presence", () => {
  test("a friend sees online, then playing with the club of the open save", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    befriend(a.id, b.id, Date.now());
    const wb = fakeSocket(b.id);
    onSocketOpen(wb);
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    expect(wb.events).toContainEqual({ type: "presence", nickname: a.nickname!, status: "online", club: null });
    const saveId = randomUUID();
    recordSaveOwnership(saveId, a.id);
    setClubNameResolver(async () => "Manchester United");
    await handleClientEvent(wa, JSON.stringify({ type: "hello", saveId }));
    expect(wb.events).toContainEqual({
      type: "presence",
      nickname: a.nickname!,
      status: "playing",
      club: "Manchester United",
    });
    expect(wa.events.at(-1)).toMatchObject({ type: "pong" });
  });

  test("hello with somebody else's save stays online", async () => {
    const a = makeUser(uniqueNick());
    const other = makeUser(uniqueNick());
    const saveId = randomUUID();
    recordSaveOwnership(saveId, other.id);
    setClubNameResolver(async () => "Arsenal");
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    await handleClientEvent(wa, JSON.stringify({ type: "hello", saveId }));
    expect(statusOf(a.id, Date.now())).toEqual({ status: "online", club: null });
  });

  test("a stranger never gets presence", () => {
    const a = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    const wc = fakeSocket(c.id);
    onSocketOpen(wc);
    onSocketOpen(fakeSocket(a.id));
    expect(wc.events.filter((e) => e.type === "presence")).toEqual([]);
  });

  test("closing the socket keeps the presence window; the sweep then sends offline", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    befriend(a.id, b.id, Date.now());
    const wb = fakeSocket(b.id);
    onSocketOpen(wb);
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    onSocketClose(wa);
    expect(statusOf(a.id, Date.now()).status).toBe("online");
    sweepStatuses(Date.now() + PRESENCE_WINDOW_MS + 1);
    expect(wb.events.at(-1)).toEqual({ type: "presence", nickname: a.nickname!, status: "offline", club: null });
  });

  test("statusOf without any socket follows the HTTP presence", () => {
    const a = makeUser(uniqueNick());
    expect(statusOf(a.id, 10_000).status).toBe("offline");
    recordPresence(a.id, 10_000);
    expect(statusOf(a.id, 10_000)).toEqual({ status: "online", club: null });
  });
});

describe("delivery", () => {
  test("each side gets the message under its own room name", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const wa = fakeSocket(a.id);
    const wb = fakeSocket(b.id);
    onSocketOpen(wa);
    onSocketOpen(wb);
    const row = insertMessage(dmRoomId(a.id, b.id), a.id, "oi", 5);
    deliverMessage(row);
    expect(wb.events.at(-1)).toEqual({
      type: "message",
      room: `dm:${a.nickname}`,
      message: { id: row.id, from: a.nickname!, mine: false, body: "oi", at: 5 },
    });
    expect(wa.events.at(-1)).toEqual({
      type: "message",
      room: `dm:${b.nickname}`,
      message: { id: row.id, from: a.nickname!, mine: true, body: "oi", at: 5 },
    });
  });

  test("whoever blocked the sender gets nothing", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    blockUser(a.id, b.id, Date.now());
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    wa.events.length = 0;
    deliverMessage(insertMessage(dmRoomId(a.id, b.id), b.id, "spam", 1));
    expect(wa.events).toEqual([]);
  });

  test("typing reaches the friend, not a stranger", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    befriend(a.id, b.id, Date.now());
    const wa = fakeSocket(a.id);
    const wb = fakeSocket(b.id);
    onSocketOpen(wa);
    onSocketOpen(wb);
    await handleClientEvent(wa, JSON.stringify({ type: "typing", room: `dm:${b.nickname}` }));
    expect(wb.events.at(-1)).toEqual({ type: "typing", room: `dm:${a.nickname}`, from: a.nickname! });
    const wc = fakeSocket(c.id);
    onSocketOpen(wc);
    await handleClientEvent(wc, JSON.stringify({ type: "typing", room: `dm:${a.nickname}` }));
    expect(wa.events.filter((e) => e.type === "typing")).toEqual([]);
  });

  test("garbage frames are ignored", async () => {
    const a = makeUser(uniqueNick());
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    wa.events.length = 0;
    await handleClientEvent(wa, "{not json");
    await handleClientEvent(wa, JSON.stringify({ type: "nope" }));
    await handleClientEvent(wa, "x".repeat(5000));
    expect(wa.events).toEqual([]);
  });
});

describe("socket limits", () => {
  test("hello at most 5 and ping at most 10 per minute per socket; the excess is ignored", async () => {
    const a = makeUser(uniqueNick());
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    for (let i = 0; i < 7; i++) await handleClientEvent(wa, JSON.stringify({ type: "hello", saveId: null }));
    expect(wa.events.filter((e) => e.type === "pong")).toHaveLength(5);
    wa.events.length = 0;
    for (let i = 0; i < 12; i++) await handleClientEvent(wa, JSON.stringify({ type: "ping" }));
    expect(wa.events.filter((e) => e.type === "pong")).toHaveLength(10);
  });

  test("typing at most once per 2 s per room", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    befriend(a.id, b.id, Date.now());
    befriend(a.id, c.id, Date.now());
    const wa = fakeSocket(a.id);
    const wb = fakeSocket(b.id);
    const wc = fakeSocket(c.id);
    for (const w of [wa, wb, wc]) onSocketOpen(w);
    for (let i = 0; i < 3; i++) await handleClientEvent(wa, JSON.stringify({ type: "typing", room: `dm:${b.nickname}` }));
    await handleClientEvent(wa, JSON.stringify({ type: "typing", room: `dm:${c.nickname}` }));
    expect(wb.events.filter((e) => e.type === "typing")).toHaveLength(1);
    expect(wc.events.filter((e) => e.type === "typing")).toHaveLength(1);
  });
});

describe("handleSocialUpgrade", () => {
  const upgrades: unknown[] = [];
  const server = {
    upgrade(_req: Request, options: { data: unknown }) {
      upgrades.push(options.data);
      return true;
    },
  };

  test("401 without a session", () => {
    const res = handleSocialUpgrade(new Request("http://localhost:3000/api/ws"), server);
    expect(res?.status).toBe(401);
  });

  test("403 from another site", () => {
    const a = makeUser();
    const req = new Request("http://localhost:3000/api/ws", {
      headers: { cookie: `fs_session=${a.token}`, origin: "https://evil.example" },
    });
    expect(handleSocialUpgrade(req, server)?.status).toBe(403);
  });

  test("upgrades with the user id kept on the server", () => {
    const a = makeUser();
    const req = new Request("http://localhost:3000/api/ws", {
      headers: { cookie: `fs_session=${a.token}`, origin: "http://localhost:3000" },
    });
    expect(handleSocialUpgrade(req, server)).toBeUndefined();
    expect(upgrades.at(-1)).toEqual({ userId: a.id, saveId: null, clubName: null });
  });
});
