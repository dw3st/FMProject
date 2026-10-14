import { beforeEach, describe, expect, test } from "bun:test";
import { DAY_MS } from "@/Domain/social/socialConfig";
import { resetPresence, recordPresence } from "@/backend/presence";
import { resetRealtime } from "@/backend/social/realtime";
import { callSocial, type CallResult } from "@/backend/social/socialRouteTestUtils";
import { resetSocialRateLimit } from "@/backend/social/socialRoutes";
import { getSocialUser } from "@/backend/social/socialStore";
import { makeUser, uniqueNick, type TestUser } from "@/backend/social/socialTestUtils";

beforeEach(() => {
  resetRealtime();
  resetPresence();
  resetSocialRateLimit();
});

function expectNoLeak(results: CallResult[], users: TestUser[]): void {
  for (const r of results) {
    for (const u of users) {
      expect(r.text).not.toContain(u.id);
      expect(r.text).not.toContain(u.email);
    }
  }
}

describe("auth", () => {
  test("every route needs a session", async () => {
    expect((await callSocial("GET", "/api/social/me", null)).status).toBe(401);
    expect((await callSocial("GET", "/api/social/friends", null)).status).toBe(401);
    expect((await callSocial("POST", "/api/social/requests", null, { body: { nickname: "abc" } })).status).toBe(401);
  });
});

describe("me and nickname", () => {
  test("me generates the code; nickname set, taken, invalid and too soon", async () => {
    const a = makeUser();
    const me = await callSocial("GET", "/api/social/me", a.token);
    expect(me.status).toBe(200);
    expect(me.json).toEqual({ nickname: null, friendCode: expect.stringMatching(/^FM-/), nicknameChangeableOn: null });

    const nick = uniqueNick("Zz");
    const set = await callSocial("PUT", "/api/social/nickname", a.token, { body: { nickname: nick } });
    expect(set.status).toBe(200);
    expect(set.json.nickname).toBe(nick);
    expect(set.json.nicknameChangeableOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const b = makeUser();
    expect((await callSocial("PUT", "/api/social/nickname", b.token, { body: { nickname: nick.toLowerCase() } })).json)
      .toEqual({ error: "nicknameTaken" });
    expect((await callSocial("PUT", "/api/social/nickname", b.token, { body: { nickname: "no way" } })).status).toBe(400);
    const again = await callSocial("PUT", "/api/social/nickname", a.token, { body: { nickname: uniqueNick() } });
    expect(again.status).toBe(409);
    expect(again.json.error).toBe("tooSoon");
    const changedAt = getSocialUser(a.id)!.nicknameChangedAt!;
    expect(again.json.nicknameChangeableOn).toBe(new Date(changedAt + 30 * DAY_MS).toISOString().slice(0, 10));
    expectNoLeak([me, set, again], [a, b]);
  });
});

describe("search and requests", () => {
  test("search needs a nickname and 3 characters; it hides blocked users", async () => {
    const base = uniqueNick("q");
    const a = makeUser(`${base}a`);
    const b = makeUser(`${base}b`);
    const noNick = makeUser();
    expect((await callSocial("GET", "/api/social/search", noNick.token, { query: { q: base } })).status).toBe(409);
    expect((await callSocial("GET", "/api/social/search", a.token, { query: { q: "ab" } })).status).toBe(400);
    const found = await callSocial("GET", "/api/social/search", a.token, { query: { q: base } });
    expect(found.json.results).toEqual([{ nickname: b.nickname, relation: "none" }]);
    await callSocial("POST", "/api/social/blocks", b.token, { body: { nickname: a.nickname } });
    const hidden = await callSocial("GET", "/api/social/search", a.token, { query: { q: base } });
    expect(hidden.json.results).toEqual([]);
    expectNoLeak([found, hidden], [a, b]);
  });

  test("by nickname or code; crossed requests become a friendship; accept, decline, cancel", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    const sent = await callSocial("POST", "/api/social/requests", a.token, { body: { nickname: b.nickname } });
    expect(sent.json).toEqual({ status: "requested", nickname: b.nickname });

    const bMe = await callSocial("GET", "/api/social/me", b.token);
    const cross = await callSocial("POST", "/api/social/requests", b.token, {
      body: { code: (bMe.json.friendCode as string).toLowerCase() },
    });
    expect(cross.status).toBe(404); // own code

    const aCode = (await callSocial("GET", "/api/social/me", a.token)).json.friendCode as string;
    const friends = await callSocial("POST", "/api/social/requests", b.token, { body: { code: aCode } });
    expect(friends.json).toEqual({ status: "friends", nickname: a.nickname });
    expect((await callSocial("POST", "/api/social/requests", a.token, { body: { nickname: b.nickname } })).json)
      .toEqual({ error: "alreadyFriends" });

    await callSocial("POST", "/api/social/requests", c.token, { body: { nickname: a.nickname } });
    const list = await callSocial("GET", "/api/social/friends", a.token);
    expect(list.json.friends).toEqual([
      { nickname: b.nickname, status: "offline", club: null, unread: 0, since: expect.any(Number) },
    ]);
    expect(list.json.incoming).toEqual([{ nickname: c.nickname, at: expect.any(Number) }]);
    expect((await callSocial("POST", "/api/social/requests/:nickname/decline", a.token, { params: { nickname: c.nickname! } })).status)
      .toBe(200);
    await callSocial("POST", "/api/social/requests", c.token, { body: { nickname: a.nickname } });
    expect((await callSocial("DELETE", "/api/social/requests/:nickname", c.token, { params: { nickname: a.nickname! } })).status)
      .toBe(200);
    await callSocial("POST", "/api/social/requests", c.token, { body: { nickname: a.nickname } });
    expect((await callSocial("POST", "/api/social/requests/:nickname/accept", a.token, { params: { nickname: c.nickname! } })).json)
      .toEqual({ status: "friends", nickname: c.nickname });
    expect((await callSocial("POST", "/api/social/requests/:nickname/accept", a.token, { params: { nickname: c.nickname! } })).status)
      .toBe(404);
    expectNoLeak([sent, bMe, friends, list], [a, b, c]);
  });

  test("unknown targets and bad bodies", async () => {
    const a = makeUser(uniqueNick());
    expect((await callSocial("POST", "/api/social/requests", a.token, { body: { nickname: uniqueNick() } })).status).toBe(404);
    expect((await callSocial("POST", "/api/social/requests", a.token, { body: { code: "FM-2222-2222" } })).status).toBe(404);
    expect((await callSocial("POST", "/api/social/requests", a.token, { body: {} })).status).toBe(400);
    expect((await callSocial("POST", "/api/social/requests", makeUser().token, { body: { nickname: a.nickname } })).status)
      .toBe(409);
  });

  test("a blocked user's request answers 404, like an unknown nickname", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    await callSocial("POST", "/api/social/blocks", a.token, { body: { nickname: b.nickname } });
    expect((await callSocial("POST", "/api/social/requests", b.token, { body: { nickname: a.nickname } })).json)
      .toEqual({ error: "notFound" });
  });
});

describe("friends and blocks", () => {
  test("friend status follows presence; unfriend; block lists and unblock", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    await callSocial("POST", "/api/social/requests", a.token, { body: { nickname: b.nickname } });
    await callSocial("POST", "/api/social/requests/:nickname/accept", b.token, { params: { nickname: a.nickname! } });
    recordPresence(b.id, Date.now());
    const online = await callSocial("GET", "/api/social/friends", a.token);
    expect(online.json.friends[0]).toMatchObject({ nickname: b.nickname, status: "online" });
    expect((await callSocial("DELETE", "/api/social/friends/:nickname", a.token, { params: { nickname: b.nickname! } })).status)
      .toBe(200);
    expect((await callSocial("GET", "/api/social/friends", a.token)).json.friends).toEqual([]);

    expect((await callSocial("POST", "/api/social/blocks", a.token, { body: { nickname: b.nickname } })).status).toBe(200);
    const blocked = await callSocial("GET", "/api/social/blocks", a.token);
    expect(blocked.json).toEqual({ blocked: [{ nickname: b.nickname }] });
    expect((await callSocial("POST", "/api/social/blocks", a.token, { body: { nickname: a.nickname } })).status).toBe(400);
    expect((await callSocial("DELETE", "/api/social/blocks/:nickname", a.token, { params: { nickname: b.nickname! } })).status)
      .toBe(200);
    expect((await callSocial("GET", "/api/social/friends", a.token)).json.friends).toEqual([]);
    expectNoLeak([online, blocked], [a, b]);
  });
});
