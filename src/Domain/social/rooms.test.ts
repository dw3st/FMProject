import { describe, expect, test } from "bun:test";
import {
  canUseWorld,
  canWriteDm,
  dmPartner,
  dmRoomId,
  dmRoomParam,
  parseRoomId,
  parseRoomParam,
  worldRoomId,
  worldRoomParam,
} from "@/Domain/social/rooms";

const SAVE = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("dmRoomId", () => {
  test("the same id from both sides", () => {
    expect(dmRoomId("b-user", "a-user")).toBe("dm:a-user:b-user");
    expect(dmRoomId("a-user", "b-user")).toBe("dm:a-user:b-user");
  });
  test("needs two different users", () => {
    expect(() => dmRoomId("a", "a")).toThrow();
  });
});

describe("parseRoomId", () => {
  test("round trip", () => {
    expect(parseRoomId(dmRoomId("x1", "y2"))).toEqual({ kind: "dm", a: "x1", b: "y2" });
    expect(parseRoomId(worldRoomId(SAVE))).toEqual({ kind: "world", saveId: SAVE });
  });
  test("rejects malformed ids", () => {
    for (const id of ["dm:a", "dm:b:a", "dm:a:a", "dm:a:b:c", "world:x", "chat:x", ""]) expect(parseRoomId(id)).toBeNull();
  });
});

describe("parseRoomParam", () => {
  test("dm by nickname and world by save id", () => {
    expect(parseRoomParam(dmRoomParam("Ze_Carlos"))).toEqual({ kind: "dm", nickname: "Ze_Carlos" });
    expect(parseRoomParam(worldRoomParam(SAVE))).toEqual({ kind: "world", saveId: SAVE });
  });
  test("rejects bad params", () => {
    for (const p of ["dm:ab", "dm:a b c", `dm:${"x".repeat(21)}`, "world:abc", "dm:", "x:y"]) expect(parseRoomParam(p)).toBeNull();
  });
});

test("dmPartner returns the other side, or null for an outsider", () => {
  const room = parseRoomId(dmRoomId("u1", "u2"))!;
  expect(dmPartner(room, "u1")).toBe("u2");
  expect(dmPartner(room, "u2")).toBe("u1");
  expect(dmPartner(room, "u3")).toBeNull();
});

test("a DM is written only between friends with no block", () => {
  expect(canWriteDm({ friends: true, blocked: false })).toBe(true);
  expect(canWriteDm({ friends: false, blocked: false })).toBe(false);
  expect(canWriteDm({ friends: true, blocked: true })).toBe(false);
});

test("a world room needs membership and at least two members", () => {
  expect(canUseWorld({ member: true, memberCount: 2 })).toBe(true);
  expect(canUseWorld({ member: true, memberCount: 1 })).toBe(false);
  expect(canUseWorld({ member: false, memberCount: 3 })).toBe(false);
});
