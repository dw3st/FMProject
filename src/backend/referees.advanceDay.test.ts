/**
 * Referees in the save and the day pipeline (`.claude/rules/game/referees.md`): the world pool on a new career,
 * the day's appointments (stable, no referee twice), the referee in the day log, the season stats, the renewal.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { ensureAssignments, matchesPerRoundByCountry, rolloverReferees, refereeSeasonKey } from "@/backend/refereeWorld";
import { poolSizeFor } from "@/Domain/referees/pool";
import { fixtureKey } from "@/Domain/referees/assign";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
import type { MatchEvent } from "@/types/dayLogTypes";

const HUMAN = "33";

describe("referees in the save", () => {
  let saveId = "";
  let day = "";
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const idx = (await saveService.getDateIndex(saveId, "premier_league"))!;
    day = Object.keys(idx).filter((d) => d >= (meta.currentDate ?? "")).sort()[0]!;
  }, 240_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("the new career has a pool for every country with leagues, sized by its matches per round", async () => {
    const pool = (await saveService.getRefereePool(saveId))!;
    expect(pool).not.toBeNull();
    const perRound = await matchesPerRoundByCountry(saveService, saveId);
    for (const [country, n] of perRound) {
      const size = poolSizeFor(n);
      expect(pool.referees.filter((r) => r.country === country && r.role === "referee")).toHaveLength(size.referees);
      expect(pool.referees.filter((r) => r.country === country && r.role === "assistant")).toHaveLength(size.assistants);
    }
    expect(new Set(pool.referees.map((r) => r.id)).size).toBe(pool.referees.length);
    expect(pool.referees.some((r) => r.country === "England" && !r.generated)).toBe(true);
    expect(pool.referees.some((r) => r.country === "Kenya" && !r.generated)).toBe(false);
    const mean = pool.referees.reduce((a, r) => a + r.strictness, 0) / pool.referees.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
  });

  test("appointments are stable, one per first-team match, nobody twice a day", async () => {
    const a = await ensureAssignments(saveService, saveId, day);
    const b = await ensureAssignments(saveService, saveId, day);
    expect(b).toEqual(a);
    const fixtures = (await saveService.getFixturesForDate(saveId, day)).filter((f) => !isYouthCompSlug(f.competition));
    const pl = fixtures.filter((f) => f.competition === "premier_league");
    expect(pl.length).toBeGreaterThan(0);
    for (const f of pl) expect(a[fixtureKey(f.competition, f.id)]).toBeDefined();
    const ids = Object.values(a).flatMap((x) => [x.refereeId, ...x.assistantIds]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the day log carries the appointed referee; stats add up", async () => {
    const assigned = await ensureAssignments(saveService, saveId, day);
    await saveService.updateMeta(saveId, { currentDate: day });
    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);
    const log = (await saveService.getDayLog(saveId, day))!;
    const matches = log.events.filter((e): e is MatchEvent => e.kind === "match");
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      const a = assigned[fixtureKey(m.competition, m.fixtureId)];
      if (a) expect(m.referee?.id).toBe(a.refereeId);
    }
    expect(matches.filter((m) => m.competition === "premier_league").every((m) => m.referee)).toBe(true);
    const state = (await saveService.getRefereeState(saveId))!;
    const counted = Object.values(state.stats).reduce((s, x) => s + x.matches, 0);
    expect(counted).toBe(matches.filter((m) => m.referee).length);
    const yellows = Object.values(state.stats).reduce((s, x) => s + x.yellows, 0);
    expect(yellows).toBe(matches.filter((m) => m.referee).flatMap((m) => m.cards ?? []).filter((c) => c.card === "yellow").length);
    // A replayed day never counts twice; tomorrow is already appointed.
    expect(Object.keys(state.assignments)).toContain(day);
  }, 240_000);

  test("a country's rollover archives its stats and renews only its pool", async () => {
    const before = (await saveService.getRefereePool(saveId))!;
    await rolloverReferees(saveService, saveId, "England", "2027-06-01", "2026-27");
    const after = (await saveService.getRefereePool(saveId))!;
    expect(after.renewed.England).toBe("2027-06-01");
    expect(after.referees.filter((r) => r.country === "Spain")).toEqual(before.referees.filter((r) => r.country === "Spain"));
    const archive = await saveService.getRefereeSeason(saveId, refereeSeasonKey("England", "2026-27"));
    expect(archive?.country).toBe("England");
    const state = (await saveService.getRefereeState(saveId))!;
    const englishIds = new Set(before.referees.filter((r) => r.country === "England").map((r) => r.id));
    expect(Object.keys(state.stats).some((id) => englishIds.has(id))).toBe(false);
    await rolloverReferees(saveService, saveId, "England", "2027-06-01", "2026-27");
    expect(await saveService.getRefereePool(saveId)).toEqual(after);
  });
});
