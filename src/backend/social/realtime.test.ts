import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { PRESENCE_WINDOW_MS, recordPresence, resetPresence } from "@/backend/presence";
import { authRoutes } from "@/backend/auth/routes";
import {
  closeSessionSockets,
  deliverMessage,
  handleClientEvent,
  handleSocialUpgrade,
  onSocketClose,
  onSocketOpen,
  resetRealtime,
  setClubNameResolver,
  setCloseGraceMs,
  statusOf,
  sweepStatuses,
  type SocialSocket,
} from "@/backend/social/realtime";
import { befriend, blockUser, insertMessage } from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { dmRoomId } from "@/Domain/social/rooms";
import type { ServerEvent } from "@/types/socialTypes";

type FakeSocket = SocialSocket & { events: ServerEvent[]; closed: boolean };

function fakeSocket(userId: string, session = "s"): FakeSocket {
  const events: ServerEvent[] = [];
  const ws: FakeSocket = {
    data: { userId, session, saveId: null, clubName: null },
    events,
    closed: false,
    send(message: string) {
      events.push(JSON.parse(message) as ServerEvent);
    },
    close() {
      ws.closed = true;
    },
  };
  return ws;
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
    await handleClientEvent(wa, JSON.stringify({ type: "ping" }));
    expect(wb.events).toContainEqual({ type: "presence", nickname: a.nickname!, status: "online", club: null });
    const saveId = randomUUID();
    addSaveMember(saveId, a.id, "seat-a", "owner");
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
    addSaveMember(saveId, other.id, "seat-other", "owner");
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

  test("closing the socket keeps the presence window; the sweep then sends offline", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    befriend(a.id, b.id, Date.now());
    const wb = fakeSocket(b.id);
    onSocketOpen(wb);
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    await handleClientEvent(wa, JSON.stringify({ type: "ping" }));
    onSocketClose(wa);
    expect(statusOf(a.id, Date.now()).status).toBe("online");
    sweepStatuses(Date.now() + PRESENCE_WINDOW_MS + 1);
    expect(wb.events.at(-1)).toEqual({ type: "presence", nickname: a.nickname!, status: "offline", club: null });
  });

  test("opening a socket or a hidden hello marks no presence; a ping does", async () => {
    const a = makeUser(uniqueNick());
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    expect(statusOf(a.id, Date.now()).status).toBe("offline");
    await handleClientEvent(wa, JSON.stringify({ type: "hello", saveId: null, hidden: true }));
    expect(statusOf(a.id, Date.now()).status).toBe("offline");
    await handleClientEvent(wa, JSON.stringify({ type: "hello", saveId: null }));
    expect(statusOf(a.id, Date.now()).status).toBe("online");
  });

  test("a reload within the grace period publishes nothing; after it, the change goes out", async () => {
    setCloseGraceMs(60);
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    befriend(a.id, b.id, Date.now());
    const saveId = randomUUID();
    addSaveMember(saveId, a.id, "seat-a", "owner");
    setClubNameResolver(async () => "Bahia");
    const wb = fakeSocket(b.id);
    onSocketOpen(wb);
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    await handleClientEvent(wa, JSON.stringify({ type: "hello", saveId }));
    expect(statusOf(a.id, Date.now())).toEqual({ status: "playing", club: "Bahia" });
    wb.events.length = 0;

    onSocketClose(wa);
    expect(statusOf(a.id, Date.now())).toEqual({ status: "playing", club: "Bahia" });
    const again = fakeSocket(a.id);
    onSocketOpen(again);
    await handleClientEvent(again, JSON.stringify({ type: "hello", saveId }));
    await Bun.sleep(100);
    expect(wb.events.filter((e) => e.type === "presence")).toEqual([]);

    onSocketClose(again);
    await Bun.sleep(100);
    expect(wb.events.filter((e) => e.type === "presence")).toEqual([
      { type: "presence", nickname: a.nickname!, status: "online", club: null },
    ]);
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

describe("logout", () => {
  test("closes the sockets of that session only", async () => {
    const a = makeUser(uniqueNick());
    const mine = fakeSocket(a.id, a.token);
    const otherSession = fakeSocket(a.id, "another-session");
    onSocketOpen(mine);
    onSocketOpen(otherSession);
    const res = await authRoutes["/api/auth/logout"](new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { cookie: `fs_session=${a.token}` },
    }));
    expect(res.status).toBe(200);
    expect(mine.closed).toBe(true);
    expect(otherSession.closed).toBe(false);
  });

  test("closeSessionSockets ignores unknown sessions", () => {
    const a = makeUser(uniqueNick());
    const w = fakeSocket(a.id, "t1");
    onSocketOpen(w);
    closeSessionSockets("t2");
    expect(w.closed).toBe(false);
    closeSessionSockets("t1");
    expect(w.closed).toBe(true);
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
    expect(upgrades.at(-1)).toEqual({ userId: a.id, session: a.token, saveId: null, clubName: null });
  });
});
