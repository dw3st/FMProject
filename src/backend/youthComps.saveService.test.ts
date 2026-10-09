import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";

describe("youth fixtures stay out of the first-team day reads", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("getActiveRoundsForDate / getFixturesForDate skip youth slugs; getYouthFixturesForDate reads them", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const d = meta.currentDate!;
    const slug = "u21_test_country";
    await saveService.writeLeagueMeta(saveId, {
      leagueSlug: slug, year: 2026, start: d, end: d, totalRounds: 1, kind: "youth",
      youth: { country: "Test Country", age: "u21", clubs: ["a", "b"], teams: {}, leaders: {}, championId: null },
    });
    const fixture = { id: `${slug}_2026_r1_0`, date: d, competition: slug, round: 1, home: "a", away: "b", played: false, result: null };
    await saveService.writeRound(saveId, slug, 1, { leagueSlug: slug, round: 1, fixtures: [fixture] });
    await saveService.writeDateIndex(saveId, slug, { [d]: [1] });

    expect((await saveService.getActiveRoundsForDate(saveId, d)).has(slug)).toBe(false);
    expect((await saveService.getActiveRoundsForDate(saveId, d, { includeYouth: true })).get(slug)).toEqual([1]);
    expect((await saveService.getFixturesForDate(saveId, d)).some((f) => f.competition === slug)).toBe(false);
    expect(await saveService.getYouthFixturesForDate(saveId, d)).toEqual([fixture]);
    expect(await saveService.listCompetitionSlugs(saveId)).toContain(slug);
  }, 120_000);
});
