import { describe, expect, test } from "bun:test";
import { LEAGUE_SCHEDULE_CONFIGS } from "@/Domain/season/leagueScheduleConfig";

describe("LEAGUE_SCHEDULE_CONFIGS", () => {
  test("carrega do JSON com as ligas originais", () => {
    const slugs = LEAGUE_SCHEDULE_CONFIGS.map((c) => c.slug);
    for (const s of ["premier_league", "bundesliga", "la_liga", "serie_a", "ligue_1", "brazil_serie_a", "brazil_serie_b", "brazil_serie_c"]) {
      expect(slugs).toContain(s);
    }
  });
  test("slugs únicos e campos válidos", () => {
    const slugs = LEAGUE_SCHEDULE_CONFIGS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of LEAGUE_SCHEDULE_CONFIGS) {
      expect(c.seasonStartMMDD).toMatch(/^\d{2}-\d{2}$/);
      expect(c.seasonEndMMDD).toMatch(/^\d{2}-\d{2}$/);
      expect(c.matchDays.length).toBeGreaterThan(0);
    }
  });
  test("ligas de ano civil começam em 02-05 (alinhado aos startKits)", () => {
    for (const c of LEAGUE_SCHEDULE_CONFIGS.filter((c) => !c.crossYear)) expect(c.seasonStartMMDD).toBe("02-05");
  });
});
