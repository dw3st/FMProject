import { describe, expect, test } from "bun:test";
import { badgeCount, badgeIds, badgeReasons, navBadges, type NavBadgeInput } from "@/Domain/navBadges/navBadges";
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
const none = new Set<string>();
const kinds = (b: ReturnType<typeof navBadges>, tab: keyof ReturnType<typeof navBadges>) => (b[tab]?.items ?? []).map((i) => i.kind);

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
    expect(kinds(navBadges(input(s)), "/squad")).toEqual(["injured", "suspended", "contract"]);
  });

  test("formation: an unavailable starter, one not registered today and empty slots", () => {
    const s = squad([player("a", { injury: { severity: "light", returnDate: "2038-03-10" } }), player("b"), player("c")]);
    const b = navBadges(input(s, { lineup: ["a", "b", ""], slots: 4, registeredToday: new Set(["a", "c"]) }));
    expect(kinds(b, "/formation")).toEqual(["starterOut", "unregistered", "emptySlot", "emptySlot"]);
  });

  test("club: facility items below 50% or condemned", () => {
    const s = squad([player("a")], {
      facilities: { items: { seats: { level: 5, wear: 0.1 }, gym: { level: 5, wear: 0.8 }, pool: { level: 5, wear: 0, condemned: true } } },
    } as never);
    expect(kinds(navBadges(input(s)), "/club")).toEqual(["condemned", "facility"]);
  });

  test("finances: negative balance and sponsor offers waiting", () => {
    const s = squad([player("a")], {
      finances: { budget: -5 },
      sponsors: { contracts: [], offers: [{ id: "o1", expires: "2038-03-05" }, { id: "o2", expires: "2038-01-01" }] },
    } as never);
    expect(kinds(navBadges(input(s)), "/finances")).toEqual(["negative", "sponsor"]);
  });

  test("market and scouting: old scouting news drop off", () => {
    const b = navBadges(input(squad([player("a")]), {
      window: { open: true, until: "2038-03-03" },
      offers: ["bid1"],
      scoutNews: [{ id: "m1", date: "2038-02-27" }, { id: "m0", date: "2038-01-01" }],
      prospects: ["p1"],
    }));
    expect(kinds(b, "/transfers")).toEqual(["windowClosing", "offer"]);
    expect(kinds(b, "/scout")).toEqual(["scoutNews", "prospect"]);
  });

  test("once seen, a problem stops counting; a new one counts again", () => {
    const hurt = (returnDate: string) => player("muniz", { name: "B. Muniz", injury: { severity: "severe", returnDate } } as never);
    const first = navBadges(input(squad([hurt("2038-04-30")])));
    expect(badgeCount(first["/squad"], none)).toBe(1);
    expect(badgeReasons(first["/squad"], none)).toEqual([{ kind: "injured", count: 1, names: ["B. Muniz"] }]);
    const seen = badgeIds(first);
    expect(badgeCount(first["/squad"], seen)).toBe(0);
    expect(badgeReasons(first["/squad"], seen)).toEqual([]);
    // The same player hurt again later: another injury, another id.
    const again = navBadges(input(squad([hurt("2038-06-10")])));
    expect(badgeCount(again["/squad"], seen)).toBe(1);
  });
});
