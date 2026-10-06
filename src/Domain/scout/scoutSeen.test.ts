import { describe, expect, test } from "bun:test";
import { toDisplayPlayer } from "@/Domain/scout/displayPlayer";
import { filterScoutPlayers, mapSquadsToScoutPlayers, sortScoutPlayers } from "@/Domain/scout/scoutQuery";
import { createDefaultScoutFilters } from "@/Domain/scout/scoutFilterState";
import { obscureForViewer } from "@/Domain/staff/staff";
import { computeOverallAvg } from "@/Domain/playerRating";
import { rangeMid, seenOverallRange, seenWageRange } from "@/Domain/scouting/seen";
import type { PlayerStatsRecord, RosterPlayer, Squad } from "@/types/playerTypes";

/**
 * The scout search and the screens use only what the user sees (`.claude/rules/game/scouting.md`):
 * sorting, filters and the salary of a little-known player never follow the real numbers.
 */

const STATS = (v: number): PlayerStatsRecord => ({
  passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
  pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
});

const real = (id: string, v: number, wage = 50_000): RosterPlayer => ({
  id, name: id, age: 26, positions: ["CM"], preferredFoot: "right", stats: STATS(v),
  contract: { until: "2029-06-30", wage },
} as RosterPlayer);

const NOISE = 2; // knowledge 0, chief rating 5
const seenAs = (p: RosterPlayer, saveId: string) =>
  obscureForViewer(p, { knowledge: 0, noise: NOISE }, saveId, 1);

describe("scout search — sorted and filtered by the view, never by the real rating", () => {
  test("a better real player can sort below a worse one when the view says so", () => {
    const good = real("good", 6.2);
    const poor = real("poor", 6.0);
    expect(computeOverallAvg(good)).toBeGreaterThan(computeOverallAvg(poor));
    let found = false;
    for (let i = 0; i < 2000 && !found; i++) {
      const rows = [toDisplayPlayer(seenAs(good, `s${i}`), "A"), toDisplayPlayer(seenAs(poor, `s${i}`), "B")];
      if (rows[1]!.avg <= rows[0]!.avg) continue;
      found = true;
      // The order follows the middle of the shown ranges: the poor player first.
      expect(sortScoutPlayers(rows, "avg", "desc").map((r) => r.id)).toEqual(["poor", "good"]);
      for (const r of rows) expect(r.avg).toBe(rangeMid(r.avgRange!));
    }
    expect(found).toBe(true);
  });

  test("two players with different real ratings but the same view tie (input order kept)", () => {
    const a = real("a", 6.4);
    const b = real("b", 5.9);
    let found = false;
    for (let i = 0; i < 4000 && !found; i++) {
      const ra = toDisplayPlayer(seenAs(a, `t${i}`), "A");
      const rb = toDisplayPlayer(seenAs(b, `t${i}`), "B");
      if (ra.avgRange![0] !== rb.avgRange![0] || ra.avgRange![1] !== rb.avgRange![1]) continue;
      found = true;
      expect(ra.avg).toBe(rb.avg);
      expect(ra.valueMillions).toBe(rb.valueMillions);
      expect(ra.wage).toBe(rb.wage);
      // A tie keeps the input order in both directions: no hidden tie-break on the real rating.
      expect(sortScoutPlayers([ra, rb], "avg", "desc").map((r) => r.id)).toEqual(["a", "b"]);
      expect(sortScoutPlayers([rb, ra], "avg", "desc").map((r) => r.id)).toEqual(["b", "a"]);
      expect(sortScoutPlayers([rb, ra], "valueMillions", "asc").map((r) => r.id)).toEqual(["b", "a"]);
      expect(sortScoutPlayers([rb, ra], "salary", "desc").map((r) => r.id)).toEqual(["b", "a"]);
      // Filters see the same number for both.
      const f = { ...createDefaultScoutFilters(), minAvg: ra.avg, maxAvg: ra.avg };
      expect(filterScoutPlayers([ra, rb], f, new Set()).map((r) => r.id)).toEqual(["a", "b"]);
    }
    expect(found).toBe(true);
  });

  test("attribute filters: hidden attributes never pass, ranges filter by their middle", () => {
    const hidden = toDisplayPlayer(seenAs(real("h", 9), "x"), "C");
    expect(hidden.hiddenAttrs).toBe(true);
    const ranged = { ...hidden, id: "r", hiddenAttrs: undefined, statNoise: 1.2, stats: STATS(7.4) };
    // 7.4 ± 1.2 is shown as 6–9: middle 7.5.
    const f = (min: number, max: number) => ({
      ...createDefaultScoutFilters(),
      attributeRanges: { ...createDefaultScoutFilters().attributeRanges, finishing: { min, max } },
    });
    expect(filterScoutPlayers([hidden, ranged], f(7.5, 10), new Set()).map((r) => r.id)).toEqual(["r"]);
    expect(filterScoutPlayers([hidden, ranged], f(7.6, 10), new Set()).map((r) => r.id)).toEqual([]);
  });
});

describe("salary of a little-known player", () => {
  test("shown as a range from the view; the exact wage never leaves the server", () => {
    const p = real("w", 6.5, 123_457);
    const seen = seenAs(p, "save");
    expect(JSON.stringify(seen)).not.toContain("123457");
    const d = toDisplayPlayer(seen, "Club", { wageFactor: 1 });
    expect(d.wageRange).toBeDefined();
    expect(d.salary).toContain("–");
    expect(d.wage).toBe(Math.round(rangeMid(d.wageRange!)));
    // The contract carries the same middle the row shows (screens built from the squad agree).
    expect(seen.contract!.wage).toBe(d.wage);
    expect(d.wageRange).toEqual(seenWageRange(seenOverallRange(computeOverallAvg(seen), NOISE)!, 1));
  });

  test("own squad and well-known players stay exact", () => {
    const p = real("e", 6.5, 123_457);
    const own = toDisplayPlayer(p, "Club", { wageFactor: 1 });
    expect(own.wage).toBe(123_457);
    expect(own.wageRange).toBeUndefined();
    const known = obscureForViewer(p, { knowledge: 85, noise: 0.2 }, "save", 1);
    expect(known.contract!.wage).toBe(123_457);
    expect(toDisplayPlayer(known, "Club").wage).toBe(123_457);
  });

  test("the scout rows of a blurred squad use the club's wage curve", () => {
    const squad = { id: "sq", name: "Sq", slug: "sq", leagueSlug: "l", players: [], wageFactor: 2, wageRevenueBasis: 1 } as unknown as Squad;
    const seen = obscureForViewer(real("z", 6, 99_999), { knowledge: 0, noise: NOISE }, "save", 2);
    const [row] = mapSquadsToScoutPlayers([{ ...squad, players: [seen] }]);
    expect(row!.wage).toBe(seen.contract!.wage);
  });
});
