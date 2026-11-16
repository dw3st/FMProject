import { describe, expect, test } from "bun:test";
import { badgeCount, navBadges, type NavBadgeInput } from "@/Domain/navBadges/navBadges";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const DATE = "2038-02-28";
const player = (id: string, extra: Partial<RosterPlayer> = {}): RosterPlayer => ({
  id, name: id, positions: ["Midfielder"], stats: {}, contract: { until: "2040-06-30", wage: 1000 }, ...extra,
} as unknown as RosterPlayer);
const squad = (players: RosterPlayer[], extra: Partial<Squad> = {}): Squad =>
  ({ id: "c", name: "Club", colors: ["#000", "#fff"], players, finances: { budget: 1_000_000 }, ...extra } as unknown as Squad);
const input = (s: Squad, extra: Partial<NavBadgeInput> = {}): NavBadgeInput => ({
  date: DATE, squad: s, seasonEnd: "2038-05-20", lineup: s.players.map((p) => p.id), slots: s.players.length,
  registeredToday: null, window: null, offers: [], scoutNews: [], prospects: [], ...extra,
});

describe("navBadges", () => {
  test("a healthy club lights nothing", () => {
    expect(navBadges(input(squad([player("a"), player("b")])))).toEqual({});
  });

  test("squad problems: injured, suspended, contract ending", () => {
    const s = squad([
      player("a", { injury: { severity: "light", returnDate: "2038-03-10" } }),
      player("b", { suspension: { matches: 1 } }),
      player("c", { contract: { until: "2038-05-20", wage: 1 } }),
    ]);
    expect(navBadges(input(s))["/squad"]).toEqual({ alerts: 3, news: [] });
  });

  test("formation: an unavailable starter, one not registered today and an empty slot", () => {
    const s = squad([player("a", { injury: { severity: "light", returnDate: "2038-03-10" } }), player("b"), player("c")]);
    const b = navBadges(input(s, { lineup: ["a", "b", ""], slots: 4, registeredToday: new Set(["a", "c"]) }));
    // a injured, b not registered, slot 3 empty, slot 4 missing.
    expect(b["/formation"]!.alerts).toBe(4);
  });

  test("club: facility items below 50% or condemned", () => {
    const s = squad([player("a")], {
      facilities: { items: { seats: { level: 5, wear: 0.1 }, gym: { level: 5, wear: 0.8 }, pool: { level: 5, wear: 0, condemned: true } } },
    } as never);
    expect(navBadges(input(s))["/club"]!.alerts).toBe(2);
  });

  test("market and scouting news are ids, hidden once seen; old scouting news drop off", () => {
    const b = navBadges(input(squad([player("a")]), {
      window: { open: true, until: "2038-03-03" },
      offers: ["bid1"],
      scoutNews: [{ id: "m1", date: "2038-02-27" }, { id: "m0", date: "2038-01-01" }],
      prospects: ["p1"],
    }));
    expect(b["/transfers"]).toEqual({ alerts: 1, news: ["offer:bid1"] });
    expect(b["/scout"]).toEqual({ alerts: 0, news: ["msg:m1", "prospect:p1"] });
    expect(badgeCount(b["/scout"], new Set(["msg:m1"]))).toBe(1);
    expect(badgeCount(b["/transfers"], new Set(["offer:bid1"]))).toBe(1);
    expect(badgeCount(undefined, new Set())).toBe(0);
  });

  test("finances: negative balance and sponsor offers waiting", () => {
    const s = squad([player("a")], { finances: { budget: -5 }, sponsors: { contracts: [], offers: [{ expires: "2038-03-05" }, { expires: "2038-01-01" }] } } as never);
    expect(navBadges(input(s))["/finances"]!.alerts).toBe(2);
  });
});
