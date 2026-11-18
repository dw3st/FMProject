import { describe, expect, test } from "bun:test";
import { DEV_HISTORY, ovrChange, recordDevChanges, snapshotDevHistory } from "@/Domain/development/devHistory";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const stats = {
  passing: 4, vision: 4, finishing: 6, dribbling: 5, speed: 5, acceleration: 5, tackling: 2, pressing: 3,
  stamina: 5, heading: 5, strength: 5, reflex: 1, jump: 3,
};
const pl = (id: string, over: Partial<RosterPlayer> = {}): RosterPlayer =>
  ({ id, name: id, age: 22, squadId: "s", preferredFoot: "right", positions: ["Forward"], stats: { ...stats },
    profile: {} as RosterPlayer["profile"], ...over }) as RosterPlayer;
const squadOf = (...players: RosterPlayer[]) => ({ id: "s", name: "S", players }) as unknown as Squad;

describe("devHistory", () => {
  test("records the day's changes with their source; a drop is the age decline", () => {
    const sq = recordDevChanges(squadOf(pl("a"), pl("b")), "2027-03-12", [
      { playerId: "a", source: "training", changes: [{ stat: "reflex", delta: 0.1, newValue: 1.1 }] },
      { playerId: "a", source: "match", changes: [{ stat: "speed", delta: -0.1, newValue: 4.9 }, { stat: "pace", delta: 0, newValue: 1 }] },
    ]);
    expect(sq.players[0]!.devLog).toEqual([
      { date: "2027-03-12", stat: "reflex", delta: 0.1, source: "training" },
      { date: "2027-03-12", stat: "speed", delta: -0.1, source: "age" },
    ]);
    expect(sq.players[1]!.devLog).toBeUndefined();
  });

  test("keeps the last 30 log entries", () => {
    const old = Array.from({ length: 30 }, (_, i) => ({ date: "2027-01-01", stat: `s${i}`, delta: 0.1, source: "match" as const }));
    const sq = recordDevChanges(squadOf(pl("a", { devLog: old })), "2027-03-12", [
      { playerId: "a", source: "match", changes: [{ stat: "finishing", delta: 0.2, newValue: 6.2 }] },
    ]);
    expect(sq.players[0]!.devLog!.length).toBe(DEV_HISTORY.LOG);
    expect(sq.players[0]!.devLog!.at(-1)!.stat).toBe("finishing");
    expect(sq.players[0]!.devLog![0]!.stat).toBe("s1");
  });

  test("no change keeps the same squad object", () => {
    const sq = squadOf(pl("a"));
    expect(recordDevChanges(sq, "2027-03-12", [])).toBe(sq);
  });

  test("weekly snapshot: once per date, last 26 weeks", () => {
    let sq = snapshotDevHistory(squadOf(pl("a")), "2027-03-08");
    sq = snapshotDevHistory(sq, "2027-03-08");
    expect(sq.players[0]!.devHistory!.length).toBe(1);
    const long = Array.from({ length: 26 }, (_, i) => ({ date: `2026-0${1 + (i % 9)}-01`, ovr: 5 }));
    const full = snapshotDevHistory(squadOf(pl("a", { devHistory: long })), "2027-03-08");
    expect(full.players[0]!.devHistory!.length).toBe(DEV_HISTORY.WEEKS);
    expect(full.players[0]!.devHistory!.at(-1)!.date).toBe("2027-03-08");
  });

  test("OVR change over 4 weeks against the oldest snapshot inside the window", () => {
    const p = pl("a", { overallAvg: 5.4 });
    const h = [{ date: "2027-01-01", ovr: 4 }, { date: "2027-02-15", ovr: 5.1 }, { date: "2027-03-01", ovr: 5.3 }];
    expect(ovrChange(h, p, "2027-03-12")).toBe(0.3);
    expect(ovrChange([{ date: "2027-01-01", ovr: 4 }], p, "2027-03-12")).toBeNull();
    expect(ovrChange(undefined, p, "2027-03-12")).toBeNull();
  });
});
