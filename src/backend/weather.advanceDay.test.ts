/**
 * Weather in the day pipeline (`.claude/rules/game/weather.md`): every league match of the day logs the weather
 * `matchWeatherOf` gives for its fixture, and `weatherCovered` when a closed roof kept it out.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { matchWeatherOf } from "@/backend/stadiumData";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { Fixture } from "@/types/calendarTypes";

describe("weather in the day log", () => {
  let saveId = "";
  let day = "";
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const idx = (await saveService.getDateIndex(saveId, "premier_league"))!;
    day = Object.keys(idx).filter((d) => d >= (meta.currentDate ?? "")).sort()[0]!;
  }, 240_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("every league match of the day logs the weather matchWeatherOf gives", async () => {
    const fixtures = new Map<string, Fixture>();
    for (const f of await saveService.getFixturesForDate(saveId, day)) {
      if (f.competition === "premier_league") fixtures.set(f.id, f);
    }
    expect(fixtures.size).toBeGreaterThan(0);
    await saveService.updateMeta(saveId, { currentDate: day });
    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);
    const log = (await saveService.getDayLog(saveId, day))!;
    const matches = log.events.filter((e): e is MatchEvent => e.kind === "match" && e.competition === "premier_league");
    expect(matches.length).toBe(fixtures.size);
    for (const ev of matches) {
      const fixture = fixtures.get(ev.fixtureId)!;
      expect(fixture).toBeDefined();
      const home = (await saveService.getSquadById(saveId, fixture.home))!;
      const w = matchWeatherOf(fixture, home);
      expect(ev.weather).toBe(w.weather);
      expect(ev.weatherCovered === true).toBe(w.covered && w.weather !== w.effective);
    }
  }, 240_000);
});
