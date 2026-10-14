import { describe, expect, test } from "bun:test";
import {
  applyPresence,
  groupFriends,
  mergeMessages,
  onlineFriendCount,
  parseServerEvent,
  totalUnread,
  unreadFromLists,
} from "@/GameInterface/Social/socialState";
import type { FriendView } from "@/types/socialTypes";

const f = (nickname: string, status: FriendView["status"], club: string | null = null): FriendView =>
  ({ nickname, status, club, unread: 0, since: 0 });

test("groups by status, sorted by nickname ignoring case", () => {
  const g = groupFriends([f("bia", "online"), f("Ana", "online"), f("Caio", "playing", "Flu"), f("Davi", "offline")]);
  expect(g.playing.map((x) => x.nickname)).toEqual(["Caio"]);
  expect(g.online.map((x) => x.nickname)).toEqual(["Ana", "bia"]);
  expect(g.offline.map((x) => x.nickname)).toEqual(["Davi"]);
  expect(onlineFriendCount([f("a", "online"), f("b", "playing"), f("c", "offline")])).toBe(2);
});

test("mergeMessages dedupes by id and sorts ascending", () => {
  const m = (id: number) => ({ id, from: "x", mine: false, body: String(id), at: id });
  expect(mergeMessages([m(3), m(1)], [m(2), m(3)]).map((x) => x.id)).toEqual([1, 2, 3]);
});

test("unread from the lists and the total", () => {
  const unread = unreadFromLists({
    friends: [{ ...f("Ana", "online"), unread: 2 }, f("Bia", "offline")],
    incoming: [],
    outgoing: [],
    worlds: [{ room: "world:x", saveId: "x", name: "Mundo", unread: 1 }],
  });
  expect(unread).toEqual({ "dm:Ana": 2, "world:x": 1 });
  expect(totalUnread(unread)).toBe(3);
});

test("applyPresence updates only the matching friend", () => {
  const next = applyPresence([f("Ana", "offline"), f("Bia", "online")], { nickname: "Ana", status: "playing", club: "Bahia" });
  expect(next).toEqual([f("Ana", "playing", "Bahia"), f("Bia", "online")]);
});

describe("parseServerEvent", () => {
  test("accepts known events", () => {
    expect(parseServerEvent(JSON.stringify({ type: "pong", online: 3 }))).toEqual({ type: "pong", online: 3 });
    expect(parseServerEvent(JSON.stringify({ type: "friend_update" }))).toEqual({ type: "friend_update" });
  });
  test("rejects garbage", () => {
    expect(parseServerEvent("nope")).toBeNull();
    expect(parseServerEvent(JSON.stringify({ type: "message", room: 1 }))).toBeNull();
    expect(parseServerEvent(JSON.stringify({ type: "other" }))).toBeNull();
  });
});
