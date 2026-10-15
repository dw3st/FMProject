import { describe, expect, test } from "bun:test";
import { managerOfSeat, placeSeatManager } from "@/Domain/managers/seatManagers";
import { buildInitialManagers, rankingPage } from "@/Domain/managers/managers";
import type { ManagerRecord } from "@/types/managerTypes";

const ai = (id: string, squadId: string, extra: Partial<ManagerRecord> = {}): ManagerRecord =>
  ({ id, name: id, squadId, points: 0, seasons: 0, titles: [], ...extra });

describe("seat managers", () => {
  test("createSave's first seat replaces its club's coach with seat:<id>", () => {
    const ms = buildInitialManagers(
      [{ id: "33", name: "Utd", coach: { id: 7, name: "Old" } }, { id: "40", name: "City", coach: { id: 8, name: "Pep" } }] as never,
      { squadId: "33", name: "Me", seatId: "s1", from: "2026-08-15" },
    );
    expect(ms.find((m) => m.squadId === "33")).toMatchObject({ id: "seat:s1", seatId: "s1", name: "Me" });
    expect(ms.find((m) => m.squadId === "40")?.seatId).toBeUndefined();
    expect(managerOfSeat(ms, "s1")?.id).toBe("seat:s1");
  });

  test("a new seat takes a club: the AI coach goes free, an empty interim disappears", () => {
    const ms = [ai("coach_8", "40", { points: 30 }), ai("interim_41", "41", { interim: true }), ai("seat:s1", "33", { seatId: "s1" })];
    const a = placeSeatManager(ms, { seatId: "s2", name: "Friend", squadId: "40", date: "2027-01-10" });
    expect(a.find((m) => m.squadId === "40")).toMatchObject({ id: "seat:s2", seatId: "s2" });
    const freed = a.find((m) => m.id === "coach_8")!;
    expect(freed.squadId).toBe("");
    expect(freed.freeSince).toBe("2027-01-10");
    const b = placeSeatManager(ms, { seatId: "s3", name: "Other", squadId: "41", date: "2027-01-10" });
    expect(b.some((m) => m.id === "interim_41")).toBe(false);
    expect(() => placeSeatManager(ms, { seatId: "s1", name: "Again", squadId: "40", date: "2027-01-10" })).toThrow();
  });

  test("the ranking's own rank is the asking seat's", () => {
    const ms = [ai("a", "1", { points: 50 }), ai("seat:s1", "2", { seatId: "s1", points: 40 }), ai("seat:s2", "3", { seatId: "s2", points: 60 })];
    expect(rankingPage([...ms].sort((x, y) => y.points - x.points), () => true, 0, 10, "s1").playerRank).toBe(3);
    expect(rankingPage([...ms].sort((x, y) => y.points - x.points), () => true, 0, 10, "s2").playerRank).toBe(1);
  });
});
