import { describe, expect, test } from "bun:test";
import { DAY_MS } from "@/Domain/social/socialConfig";
import {
  ensureFriendCode,
  findUserByFriendCode,
  findUserByNickname,
  getSocialUser,
  searchUsers,
  setNickname,
} from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";

describe("nickname", () => {
  test("is unique ignoring case", () => {
    const nick = uniqueNick("Ab");
    makeUser(nick);
    const b = makeUser();
    expect(setNickname(b.id, nick.toLowerCase(), Date.now())).toEqual({ ok: false, error: "nicknameTaken" });
  });

  test("rejects invalid names", () => {
    const u = makeUser();
    expect(setNickname(u.id, "ab", Date.now())).toEqual({ ok: false, error: "invalidNickname" });
    expect(setNickname(u.id, "theAdmin", Date.now())).toEqual({ ok: false, error: "invalidNickname" });
  });

  test("the nickname is set once and then locked; the same name is a no-op", () => {
    const u = makeUser();
    const t0 = 1_800_000_000_000;
    const first = uniqueNick();
    expect(setNickname(u.id, first, t0)).toEqual({ ok: true, nickname: first });
    expect(getSocialUser(u.id)?.nicknameChangedAt).toBe(t0);
    expect(setNickname(u.id, ` ${first} `, t0 + DAY_MS)).toEqual({ ok: true, nickname: first });
    expect(setNickname(u.id, uniqueNick(), t0 + 400 * DAY_MS)).toEqual({ ok: false, error: "nicknameLocked" });
    expect(getSocialUser(u.id)?.nickname).toBe(first);
    expect(getSocialUser(u.id)?.nicknameChangedAt).toBe(t0);
  });

  test("findUserByNickname ignores case and spaces", () => {
    const nick = uniqueNick("Cd");
    const u = makeUser(nick);
    expect(findUserByNickname(`  ${nick.toUpperCase()} `)).toEqual({ id: u.id, nickname: nick });
  });
});

describe("friend code", () => {
  test("is generated once and found from what people type", () => {
    const u = makeUser(uniqueNick());
    const code = ensureFriendCode(u.id);
    expect(code).toMatch(/^FM-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(ensureFriendCode(u.id)).toBe(code);
    expect(findUserByFriendCode(code.toLowerCase().replace(/-/g, " "))?.id).toBe(u.id);
    expect(findUserByFriendCode("FM-0000-0000")).toBeNull();
  });
});

describe("searchUsers", () => {
  test("prefix match, never the searcher, relation none, wildcards escaped", () => {
    const base = uniqueNick("s");
    const me = makeUser(`${base}me`);
    makeUser(`${base}_x`);
    makeUser(`${base}ax`);
    expect(searchUsers(me.id, base).map((r) => r.nickname).sort()).toEqual([`${base}_x`, `${base}ax`].sort());
    expect(searchUsers(me.id, `${base}_`)).toEqual([{ nickname: `${base}_x`, relation: "none" }]);
    expect(searchUsers(me.id, `${base}%`)).toEqual([]);
  });
});
