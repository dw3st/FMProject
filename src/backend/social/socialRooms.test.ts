import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { resetPresence } from "@/backend/presence";
import { resetRealtime } from "@/backend/social/realtime";
import { callSocial } from "@/backend/social/socialRouteTestUtils";
import { resetSocialRateLimit } from "@/backend/social/socialRoutes";
import { befriend } from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { SOCIAL } from "@/Domain/social/socialConfig";

beforeEach(() => {
  resetRealtime();
  resetPresence();
  resetSocialRateLimit();
});

function friends() {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  befriend(a.id, b.id, Date.now());
  return { a, b };
}

const post = (token: string, room: string, body: unknown) =>
  callSocial("POST", "/api/social/rooms/:room/messages", token, { params: { room }, body: { body } });
const history = (token: string, room: string, query?: Record<string, string>) =>
  callSocial("GET", "/api/social/rooms/:room/messages", token, { params: { room }, query });

describe("direct messages", () => {
  test("friends write and read; the other side sees it under the sender's name", async () => {
    const { a, b } = friends();
    const sent = await post(a.token, `dm:${b.nickname}`, " oi! ");
    expect(sent.status).toBe(200);
    expect(sent.json).toEqual({
      room: `dm:${b.nickname}`,
      message: { id: expect.any(Number), from: a.nickname, mine: true, body: "oi!", at: expect.any(Number) },
    });
    const seen = await history(b.token, `dm:${a.nickname}`);
    expect(seen.json.messages).toEqual([{ ...sent.json.message, mine: false }]);
    expect(seen.json.hasMore).toBe(false);
    const list = await callSocial("GET", "/api/social/friends", b.token);
    expect(list.json.friends[0].unread).toBe(1);
    const read = await callSocial("POST", "/api/social/rooms/:room/read", b.token, {
      params: { room: `dm:${a.nickname}` },
      body: { lastReadId: sent.json.message.id },
    });
    expect(read.json).toEqual({ lastReadId: sent.json.message.id });
    expect((await callSocial("GET", "/api/social/friends", b.token)).json.friends[0].unread).toBe(0);
    for (const r of [sent, seen, list, read]) {
      for (const u of [a, b]) {
        expect(r.text).not.toContain(u.id);
        expect(r.text).not.toContain(u.email);
      }
    }
  });

  test("only between friends: a stranger, an unknown nickname and after a block get 403", async () => {
    const { a, b } = friends();
    const c = makeUser(uniqueNick());
    expect((await post(c.token, `dm:${a.nickname}`, "oi")).json).toEqual({ error: "noAccess" });
    expect((await post(a.token, `dm:${uniqueNick()}`, "oi")).status).toBe(403);
    await callSocial("POST", "/api/social/blocks", b.token, { body: { nickname: a.nickname } });
    expect((await post(a.token, `dm:${b.nickname}`, "oi")).status).toBe(403);
    expect((await post(b.token, `dm:${a.nickname}`, "oi")).status).toBe(403);
  });

  test("a block either way closes the DM history and its read mark (403); unfriended without a block still reads", async () => {
    const { a, b } = friends();
    await post(b.token, `dm:${a.nickname}`, "antes");
    const mine = await post(a.token, `dm:${b.nickname}`, "minha");
    await callSocial("DELETE", "/api/social/friends/:nickname", a.token, { params: { nickname: b.nickname! } });
    expect((await history(b.token, `dm:${a.nickname}`)).json.messages.map((m: { body: string }) => m.body))
      .toEqual(["antes", "minha"]);
    await callSocial("POST", "/api/social/blocks", a.token, { body: { nickname: b.nickname } });
    const read = (token: string, room: string) => callSocial("POST", "/api/social/rooms/:room/read", token, {
      params: { room }, body: { lastReadId: mine.json.message.id },
    });
    for (const [token, room] of [[a.token, `dm:${b.nickname}`], [b.token, `dm:${a.nickname}`]] as const) {
      expect((await history(token, room)).json).toEqual({ error: "noAccess" });
      expect((await read(token, room)).status).toBe(403);
    }
  });

  test("invalid bodies and the 10-in-10 s limit", async () => {
    const { a, b } = friends();
    const room = `dm:${b.nickname}`;
    expect((await post(a.token, room, "   ")).json).toEqual({ error: "invalidBody" });
    expect((await post(a.token, room, "x".repeat(SOCIAL.MESSAGE_MAX + 1))).status).toBe(400);
    expect((await post(a.token, room, 7)).status).toBe(400);
    for (let i = 0; i < SOCIAL.RATE_MAX; i++) expect((await post(a.token, room, `m${i}`)).status).toBe(200);
    expect((await post(a.token, room, "one too many")).json).toEqual({ error: "rateLimited" });
  });

  test("history pages of 50 with before", async () => {
    const { a, b } = friends();
    const room = `dm:${b.nickname}`;
    for (let i = 0; i < 55; i++) {
      resetSocialRateLimit();
      await post(a.token, room, `m${i}`);
    }
    const first = await history(a.token, room);
    expect(first.json.messages).toHaveLength(50);
    expect(first.json.hasMore).toBe(true);
    const older = await history(a.token, room, { before: String(first.json.messages[0].id) });
    expect(older.json.messages.map((m: { body: string }) => m.body)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
    expect((await history(a.token, room, { limit: "51" })).status).toBe(400);
    expect((await history(a.token, room, { before: "-3" })).status).toBe(400);
  });

  test("read needs a valid id and access", async () => {
    const { a, b } = friends();
    expect((await callSocial("POST", "/api/social/rooms/:room/read", a.token, {
      params: { room: `dm:${b.nickname}` }, body: { lastReadId: "x" },
    })).status).toBe(400);
    expect((await callSocial("POST", "/api/social/rooms/:room/read", a.token, {
      params: { room: "world:not-a-save" }, body: { lastReadId: 1 },
    })).status).toBe(403);
  });
});

describe("world rooms", () => {
  test("only members of a world with two members; it shows in the friends response", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    const saveId = randomUUID();
    const room = `world:${saveId}`;
    addSaveMember(saveId, a.id, "seat-a", "owner");
    expect((await post(a.token, room, "sozinho")).status).toBe(403);
    addSaveMember(saveId, b.id, "seat-b", "member");
    expect((await post(a.token, room, "bem-vindo")).status).toBe(200);
    expect((await history(b.token, room)).json.messages.map((m: { body: string }) => m.body)).toEqual(["bem-vindo"]);
    expect((await history(c.token, room)).status).toBe(403);
    expect((await post(c.token, room, "oi")).status).toBe(403);
    const list = await callSocial("GET", "/api/social/friends", b.token);
    // The league is named by its owner's nickname, never by a club.
    expect(list.json.worlds).toEqual([{ room, saveId, owner: a.nickname, unread: 1 }]);
  });
});
