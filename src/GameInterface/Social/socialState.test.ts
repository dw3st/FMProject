import { describe, expect, test } from "bun:test";
import {
  createEventHub,
  applyPresence,
  groupFriends,
  mergeMessages,
  onlineFriendCount,
  parseServerEvent,
  reconnectAction,
  reconnectDelay,
  totalUnread,
  unreadAfterRead,
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
  test("world events", () => {
    expect(parseServerEvent(JSON.stringify({ type: "world_invite", saveId: "s", name: "Liga", from: "ana", code: "23456789AB" })))
      .toEqual({ type: "world_invite", saveId: "s", name: "Liga", from: "ana", code: "23456789AB" });
    for (const type of ["world_started", "world_removed", "world_deleted", "world_members"] as const) {
      expect(parseServerEvent(JSON.stringify({ type, saveId: "s" }))).toEqual({ type, saveId: "s" });
      expect(parseServerEvent(JSON.stringify({ type }))).toBeNull();
    }
    expect(parseServerEvent(JSON.stringify({ type: "world_invite", saveId: "s" }))).toBeNull();
  });
  test("seat_offer", () => {
    expect(parseServerEvent(JSON.stringify({ type: "seat_offer", saveId: "s" }))).toEqual({ type: "seat_offer", saveId: "s" });
    expect(parseServerEvent(JSON.stringify({ type: "seat_offer" }))).toBeNull();
  });
  test("world_progress", () => {
    const ev = { type: "world_progress", saveId: "s1", date: "2027-03-11", target: "2027-03-14", running: true, waitingFor: ["ana"] };
    expect(parseServerEvent(JSON.stringify(ev))).toEqual(ev as never);
    expect(parseServerEvent(JSON.stringify({ ...ev, error: "boom" }))).toEqual({ ...ev, error: "boom" } as never);
    expect(parseServerEvent(JSON.stringify({ ...ev, target: null }))).toEqual({ ...ev, target: null } as never);
    expect(parseServerEvent(JSON.stringify({ ...ev, waitingFor: [1] }))).toBeNull();
    expect(parseServerEvent(JSON.stringify({ ...ev, target: 3 }))).toBeNull();
  });
  test("rejects garbage", () => {
    expect(parseServerEvent("nope")).toBeNull();
    expect(parseServerEvent(JSON.stringify({ type: "message", room: 1 }))).toBeNull();
    expect(parseServerEvent(JSON.stringify({ type: "other" }))).toBeNull();
  });
});

describe("unreadAfterRead", () => {
  const msg = (id: number, mine = false) => ({ id, from: mine ? "me" : "Ana", mine, body: "x", at: id });
  test("only messages after the read mark still count", () => {
    expect(unreadAfterRead([msg(1), msg(2), msg(3, true), msg(4), msg(5)], 3)).toBe(2);
    expect(unreadAfterRead([msg(1), msg(2)], 2)).toBe(0);
  });
  test("unknown without the room's messages loaded", () => {
    expect(unreadAfterRead(undefined, 9)).toBeNull();
  });
});

describe("reconnectAction", () => {
  test("stops on a closed session or a server without the social routes", () => {
    expect(reconnectAction({ meStatus: 401, failedInARow: 1, everOpened: true })).toBe("stop");
    expect(reconnectAction({ meStatus: 404, failedInARow: 1, everOpened: false })).toBe("stop");
  });
  test("stops after 5 failures in a row when it never opened; keeps trying otherwise", () => {
    expect(reconnectAction({ meStatus: 200, failedInARow: 4, everOpened: false })).toBe("retry");
    expect(reconnectAction({ meStatus: 200, failedInARow: 5, everOpened: false })).toBe("stop");
    expect(reconnectAction({ meStatus: 0, failedInARow: 9, everOpened: true })).toBe("retry");
  });
  test("backoff grows and has a ceiling", () => {
    expect(reconnectDelay(0)).toBe(1_000);
    expect(reconnectDelay(3)).toBe(10_000);
    expect(reconnectDelay(50)).toBe(30_000);
  });
});

describe("createEventHub", () => {
  test("subscribe, receive, unsubscribe; a throwing listener does not stop the next", () => {
    const hub = createEventHub<number>();
    const got: number[] = [];
    const off = hub.subscribe(() => { throw new Error("boom"); });
    const off2 = hub.subscribe((n) => got.push(n));
    const orig = console.error;
    console.error = () => {};
    hub.emit(1);
    off();
    off2();
    hub.emit(2);
    console.error = orig;
    expect(got).toEqual([1]);
  });
});
