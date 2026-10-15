import { describe, expect, test } from "bun:test";
import { SEAT_KEYS, type SeatState } from "@/types/seatTypes";
import { isSeatKey, isValidSeatId, metaForSeat, seatIdOfManager, seatManagerId, splitSeatPatch } from "@/Domain/seats/seats";

const seat: SeatState = {
  clubId: "33", clubName: "Man Utd", clubColors: ["#c00", "#fff"], leagueSlug: "premier_league", leagueName: "Premier League",
  formation: "4-3-3", board: { board: 60, fans: 60, history: [] } as unknown as SeatState["board"],
};

describe("seats: meta merge and patch split", () => {
  test("metaForSeat keeps the world fields and adds the seat and its id", () => {
    const world = { id: "s1", name: "World", currentDate: "2027-02-05", mode: "solo" as const, seats: ["a"] };
    const merged = metaForSeat(world, "a", seat);
    expect(merged.id).toBe("s1");
    expect(merged.currentDate).toBe("2027-02-05");
    expect(merged.clubId).toBe("33");
    expect(merged.seatId).toBe("a");
  });

  test("splitSeatPatch routes seat keys to the seat, the rest to the world, drops seatId", () => {
    const { world, seat: s } = splitSeatPatch({ currentDate: "2027-02-06", board: undefined, clubId: "40", seatId: "a" });
    expect(world).toEqual({ currentDate: "2027-02-06" });
    expect(Object.keys(s).sort()).toEqual(["board", "clubId"]);
    // an explicit undefined clears the field: the key must survive the split
    expect("board" in s).toBe(true);
    expect(s.clubId).toBe("40");
  });

  test("every SeatState key is a seat key", () => {
    for (const k of SEAT_KEYS) expect(isSeatKey(k)).toBe(true);
    expect(isSeatKey("currentDate")).toBe(false);
    expect(isSeatKey("activeLeagues")).toBe(false);
  });

  test("seat manager ids round-trip", () => {
    expect(seatManagerId("abc-1")).toBe("seat:abc-1");
    expect(seatIdOfManager("seat:abc-1")).toBe("abc-1");
    expect(seatIdOfManager("coach_33")).toBeNull();
  });

  test("seat ids are path-safe", () => {
    expect(isValidSeatId("3f2b1c9e-0d4a-4c1b-9e7f-1234567890ab")).toBe(true);
    expect(isValidSeatId("../x")).toBe(false);
    expect(isValidSeatId("")).toBe(false);
    expect(isValidSeatId("A")).toBe(false);
  });
});
