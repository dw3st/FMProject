import { describe, expect, test } from "bun:test";
import { applyMatchCards, banFromCards, isSuspended, isUnavailable, serveSuspension } from "@/Domain/discipline/discipline";
import { emptySeasonLog } from "@/types/playerTypes";

const Y = { card: "yellow" as const };
const R = { card: "red" as const };
type P = { id?: string; suspension?: { matches: number } };
const pl = (x: P): P => x;

describe("discipline", () => {
  test("isSuspended / isUnavailable", () => {
    expect(isSuspended({})).toBe(false);
    expect(isSuspended({ suspension: { matches: 1 } })).toBe(true);
    expect(isUnavailable({ suspension: { matches: 1 } }, "2027-03-01")).toBe(true);
    expect(isUnavailable({ injury: { severity: "light", returnDate: "2027-03-05" } }, "2027-03-01")).toBe(true);
    expect(isUnavailable({}, "2027-03-01")).toBe(false);
  });

  test("serveSuspension decrements and clears at 0", () => {
    expect(serveSuspension(pl({ suspension: { matches: 2 } }))).toEqual({ suspension: { matches: 1 } });
    expect(serveSuspension(pl({ id: "a", suspension: { matches: 1 } }))).toEqual({ id: "a" });
    const p = pl({ id: "b" });
    expect(serveSuspension(p)).toBe(p);
  });

  test("red = 1 match; 5th yellow = 1 match; 4th does not", () => {
    expect(banFromCards(0, [R])).toBe(1);
    expect(banFromCards(3, [Y])).toBe(0);
    expect(banFromCards(4, [Y])).toBe(1);
    expect(banFromCards(9, [Y])).toBe(1);
    expect(banFromCards(5, [Y])).toBe(0);
    // second yellow: yellow + yellow-and-red records
    expect(banFromCards(0, [Y, Y, R])).toBe(1);
  });

  test("applyMatchCards books the log and adds the ban", () => {
    const log = { ...emptySeasonLog(), yellowCards: 4 };
    const r = applyMatchCards(pl({ id: "x" }), log, [Y]);
    expect(r.log.yellowCards).toBe(5);
    expect(r.log.redCards).toBe(0);
    expect(r.banned).toBe(1);
    expect(r.player.suspension).toEqual({ matches: 1 });
    const r2 = applyMatchCards(pl({ id: "x", suspension: { matches: 1 } }), emptySeasonLog(), [R]);
    expect(r2.player.suspension).toEqual({ matches: 2 });
    expect(r2.log.redCards).toBe(1);
  });
});
