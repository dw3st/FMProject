import { describe, expect, test } from "bun:test";
import { advanceCallUps, isCallUpDuration, mergeCallUps, newCallUp, pruneCallUps } from "@/Domain/youthComps/callUps";

const all = new Set(["a", "b", "c", "d", "e"]);
const played = (entries: [string, number][]) => new Map(entries);

describe("youth call-ups", () => {
  test("new call-ups start their counters", () => {
    expect(newCallUp("a", "next")).toEqual({ id: "a", duration: "next", left: 1 });
    expect(newCallUp("a", "games3")).toEqual({ id: "a", duration: "games3", left: 3 });
    expect(newCallUp("a", "games5")).toEqual({ id: "a", duration: "games5", left: 5 });
    expect(newCallUp("a", "rhythm")).toEqual({ id: "a", duration: "rhythm", streak: 0 });
    expect(newCallUp("a", "indefinite")).toEqual({ id: "a", duration: "indefinite" });
    expect(isCallUpDuration("games3")).toBe(true);
    expect(isCallUpDuration("games4")).toBe(false);
  });

  test("merge keeps the progress of an unchanged duration and restarts a changed one", () => {
    const cur = [{ id: "a", duration: "games3" as const, left: 1 }, { id: "b", duration: "rhythm" as const, streak: 2 }];
    expect(mergeCallUps(cur, [{ id: "a", duration: "games3" }, { id: "b", duration: "games5" }, { id: "c", duration: "next" }])).toEqual([
      { id: "a", duration: "games3", left: 1 },
      { id: "b", duration: "games5", left: 5 },
      { id: "c", duration: "next", left: 1 },
    ]);
  });

  test("N games count only the games he played; next is used up by the game", () => {
    const list = [newCallUp("a", "games3"), newCallUp("b", "games3"), newCallUp("c", "next"), newCallUp("d", "next")];
    const after = advanceCallUps(list, played([["a", 6.2], ["c", 7]]), all);
    expect(after).toEqual([{ id: "a", duration: "games3", left: 2 }, { id: "b", duration: "games3", left: 3 }]);
    const last = advanceCallUps([{ id: "a", duration: "games3", left: 1 }], played([["a", 6]]), all);
    expect(last).toEqual([]);
  });

  test("a cancelled game counts only for next", () => {
    const list = [newCallUp("a", "games5"), newCallUp("b", "next"), { id: "c", duration: "rhythm" as const, streak: 2 }];
    expect(advanceCallUps(list, null, all)).toEqual([{ id: "a", duration: "games5", left: 5 }, { id: "c", duration: "rhythm", streak: 2 }]);
  });

  test("rhythm: three good games in a row, a bad one resets, a missed one keeps the streak", () => {
    let list = [newCallUp("a", "rhythm")];
    list = advanceCallUps(list, played([["a", 7]]), all);
    expect(list[0]!.streak).toBe(1);
    list = advanceCallUps(list, played([["a", 6.4]]), all);
    expect(list[0]!.streak).toBe(0);
    list = advanceCallUps(list, played([["a", 6.5]]), all);
    list = advanceCallUps(list, played([]), all);
    expect(list[0]!.streak).toBe(1);
    list = advanceCallUps(list, played([["a", 6.8]]), all);
    expect(list[0]!.streak).toBe(2);
    expect(advanceCallUps(list, played([["a", 8]]), all)).toEqual([]);
  });

  test("indefinite stays; a player no longer eligible leaves", () => {
    const list = [newCallUp("a", "indefinite"), newCallUp("b", "indefinite"), newCallUp("e", "games5")];
    const eligible = new Set(["a"]);
    expect(advanceCallUps(list, played([["a", 5], ["b", 7]]), eligible)).toEqual([{ id: "a", duration: "indefinite" }]);
    expect(pruneCallUps(list, eligible).map((c) => c.id)).toEqual(["a"]);
  });
});
