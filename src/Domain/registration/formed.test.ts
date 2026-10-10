import { describe, expect, test } from "bun:test";
import {
  arrivalAge, clubTrained, hasGreenCard, isGreenCardHolder, nationTrained, isForeign, isFree, isFormed, originGreenCard, type FormedCtx,
} from "@/Domain/registration/formed";
import { GREEN_CARD } from "@/Domain/registration/registrationConfig";
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

  describe("green card (MLS)", () => {
    const idWith = (has: boolean) => {
      for (let i = 0; ; i++) if (originGreenCard(`gc_${i}`) === has) return `gc_${i}`;
    };
    const noCard = idWith(false);
    const holder = { squadId: "c1", ctx };
    const mlsRow = (season: string, squadId: string) => row(season, squadId, "of_major_league_soccer");

    test("origin draw is fixed by id and near the chance", () => {
      expect(originGreenCard("abc")).toBe(originGreenCard("abc"));
      let n = 0;
      for (let i = 0; i < 4000; i++) if (originGreenCard(`p_${i}`)) n++;
      expect(Math.abs(n / 4000 - GREEN_CARD.ORIGIN)).toBeLessThan(0.03);
    });
    test("origin green card makes a foreign MLS player domestic, only under the MLS rule", () => {
      const yes = p({ id: idWith(true), nationality: "Argentina" });
      expect(isForeign(yes, R.mls!, "USA")).toBe(false);
      expect(isGreenCardHolder(yes, R.mls!, "USA")).toBe(true);
      expect(isForeign(yes, R.argentina!, "Argentina")).toBe(false); // domestic anyway
      expect(isForeign(yes, R.brazil!, "Brazil")).toBe(true); // no green card outside the MLS
      const no = p({ id: noCard, nationality: "Argentina" });
      expect(isForeign(no, R.mls!, "USA", holder)).toBe(true);
      expect(isGreenCardHolder(no, R.mls!, "USA", holder)).toBe(false);
      // a domestic player is never a "green card holder"
      expect(isGreenCardHolder(p({ id: idWith(true), nationality: "USA" }), R.mls!, "USA")).toBe(false);
    });
    test("three seasons at the club (history plus the season in progress)", () => {
      const h = [mlsRow("2025", "c1"), mlsRow("2026", "c1")];
      const two = p({ id: noCard, nationality: "Brazil", age: 30, history: h });
      expect(hasGreenCard(two, holder)).toBe(false);
      const playing = { ...two, seasonLog: { appearances: 3 } as never };
      expect(hasGreenCard(playing, holder)).toBe(true);
      expect(hasGreenCard(playing, { squadId: "c2", ctx })).toBe(false);
      expect(hasGreenCard(playing)).toBe(false); // no club given: only the origin draw
    });
    test("arrived at the club aged 21 or less", () => {
      // at c1 since 2026 (age 21 then), now 22
      const young = p({ id: noCard, nationality: "Ghana", age: 22, history: [mlsRow("2025", "x"), mlsRow("2026", "c1")] });
      expect(arrivalAge(young, "c1", ctx)).toBe(21);
      expect(hasGreenCard(young, holder)).toBe(true);
      // arrived this season (last row elsewhere): his current age
      const now = p({ id: noCard, nationality: "Ghana", age: 23, history: [mlsRow("2026", "x")] });
      expect(arrivalAge(now, "c1", ctx)).toBe(23);
      expect(hasGreenCard(now, holder)).toBe(false);
      // unknown (no history): ignored
      expect(arrivalAge(p({ id: noCard, age: 19 }), "c1", ctx)).toBeNull();
      expect(hasGreenCard(p({ id: noCard, nationality: "Ghana", age: 19 }), holder)).toBe(false);
      // a loan row does not count as arriving
      const loanRow = { ...mlsRow("2026", "c1"), loan: true as const };
      expect(arrivalAge(p({ id: noCard, age: 22, history: [mlsRow("2025", "x"), loanRow] }), "c1", ctx)).toBe(22);
    });
  });
});
