import { describe, expect, test } from "bun:test";
import { clubTrained, nationTrained, isForeign, isFree, isFormed, type FormedCtx } from "@/Domain/registration/formed";
import { REGISTRATION_RULES as R } from "@/Domain/registration/registrationConfig";
import type { PlayerHistoryRow, RosterPlayer } from "@/types/playerTypes";

const ctx: FormedCtx = {
  seasonStartYear: 2027,
  countryOfLeague: (s) => (s.startsWith("premier") || s === "of_championship" ? "England" : "Spain"),
};
const p = (o: Partial<RosterPlayer>): RosterPlayer =>
  ({ id: "x", name: "x", age: 24, squadId: "c1", preferredFoot: "right", positions: ["CM"], stats: {} as never, profile: {} as never, ...o });
const row = (season: string, squadId: string, league: string): PlayerHistoryRow => ({
  season, squadId, clubName: "", league, apps: 1, goals: 0, assists: 0, avgRating: null, cupApps: 0, cupGoals: 0,
  contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [],
});

describe("formed", () => {
  test("academy ids and academyOf", () => {
    expect(clubTrained(p({ id: "youth_c1_2027_0" }), "c1", ctx)).toBe(true);
    expect(clubTrained(p({ id: "es_youth_c1_3" }), "c1", ctx)).toBe(true);
    expect(clubTrained(p({ id: "prospect_ab_1", academyOf: "c1" }), "c1", ctx)).toBe(true);
    expect(clubTrained(p({ id: "youth_c2_2027_0" }), "c1", ctx)).toBe(false);
  });
  test("three seasons at the club up to 21", () => {
    const h = [row("2024-25", "c1", "premier_league"), row("2025-26", "c1", "premier_league"), row("2026-27", "c1", "premier_league")];
    expect(clubTrained(p({ age: 22, history: h }), "c1", ctx)).toBe(true); // 19, 20, 21
    expect(clubTrained(p({ age: 25, history: h }), "c1", ctx)).toBe(false); // 22, 23, 24
    // partials of the same season count once
    expect(clubTrained(p({ age: 20, history: [h[0]!, h[0]!, h[1]!] }), "c1", ctx)).toBe(false);
  });
  test("nation trained falls back to nationality, or seasons in the country", () => {
    expect(nationTrained(p({ nationality: "Wales" }), "England", ctx, ["Wales"])).toBe(true);
    expect(nationTrained(p({ nationality: "France" }), "England", ctx, ["Wales"])).toBe(false);
    expect(nationTrained(p({ nationality: null }), "England", ctx, [])).toBe(true);
    const h = [row("2024-25", "a", "of_championship"), row("2025-26", "b", "premier_league"), row("2026-27", "b", "premier_league")];
    expect(nationTrained(p({ nationality: "France", age: 21, history: h }), "England", ctx, [])).toBe(true);
    expect(isFormed(p({ nationality: "France" }), R.premier_league!, "England", "c1", ctx)).toBe(false);
  });
  test("foreign by rule", () => {
    expect(isForeign(p({ nationality: "Brazil" }), R.la_liga!, "Spain")).toBe(false); // ibero
    expect(isForeign(p({ nationality: "Japan" }), R.la_liga!, "Spain")).toBe(true);
    expect(isForeign(p({ nationality: "France" }), R.la_liga!, "Spain")).toBe(false); // EU
    expect(isForeign(p({ nationality: "Senegal" }), R.ligue_1!, "France")).toBe(false); // acp
    expect(isForeign(p({ nationality: "Brazil" }), R.ligue_1!, "France")).toBe(true); // no ibero exemption
    expect(isForeign(p({ nationality: "Argentina" }), R.brazil!, "Brazil")).toBe(true);
    expect(isForeign(p({ nationality: "United States" }), R.mls!, "USA")).toBe(false);
    expect(isForeign(p({ nationality: "Canada" }), R.mls!, "USA")).toBe(false);
    expect(isForeign(p({ nationality: null }), R.brazil!, "Brazil")).toBe(false);
  });
  test("free", () => {
    expect(isFree(p({ age: 21, nationality: "Spain" }), R.uefa!, "Spain", "c1", ctx)).toBe(true);
    expect(isFree(p({ age: 21, nationality: "Japan" }), R.uefa!, "Spain", "c1", ctx)).toBe(false); // formedOnly
    expect(isFree(p({ age: 21, nationality: "Japan" }), R.premier_league!, "England", "c1", ctx)).toBe(true);
    expect(isFree(p({ age: 22 }), R.premier_league!, "England", "c1", ctx)).toBe(false);
    expect(isFree(p({ age: 18 }), R.brazil!, "Brazil", "c1", ctx)).toBe(false); // no list B
  });
});
