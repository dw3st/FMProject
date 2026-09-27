import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import type { Fixture } from "@/types/calendarTypes";

/**
 * Regression test for a club with two fixtures on the same day (should never happen given the
 * calendar's own date-avoidance rules, but nothing enforces it structurally across every
 * competition folder). Before the fix, `advanceOneDay` read each fixture's squads straight from
 * disk (stale for the second fixture) and queued both matches' writes in a plain array, so the
 * two parallel `saveSquad` calls raced and only one match's energy/seasonLog/development survived.
 */
describe("advanceOneDay chains a club's squad across two same-day fixtures", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("both matches are counted, not clobbered — and the double-booking is logged", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league",
      leagueName: "Premier League",
      clubId: "33",
      clubName: "Test",
      clubColors: ["#000000", "#ffffff"],
      budget: 1,
    });
    saveId = meta.id;
    const currentDate = meta.currentDate!;

    const index = await saveService.getSquadIndex(saveId);
    const alreadyPlaying = new Set(
      (await saveService.getFixturesForDate(saveId, currentDate)).flatMap((f) => [f.home, f.away]),
    );

    // Three Championship clubs (never the player's Premier League club, and not scheduled to
    // play their real fixture today) — the only matches they play today are the synthetic
    // double-booking below.
    const freeClubs = index
      .inLeague("of_championship")
      .map((t) => t.squadId)
      .filter((id) => !alreadyPlaying.has(id));
    const [clubX, clubY1, clubY2] = freeClubs;
    if (!clubX || !clubY1 || !clubY2) {
      throw new Error("not enough free of_championship clubs for the test setup");
    }

    const fixtureA: Fixture = {
      id: "test_db_a", date: currentDate, competition: "cup_test_double_a", round: 1,
      home: clubX, away: clubY1, played: false, result: null,
    };
    const fixtureB: Fixture = {
      id: "test_db_b", date: currentDate, competition: "cup_test_double_b", round: 1,
      home: clubY2, away: clubX, played: false, result: null,
    };
    // "cup_" prefix so advanceOneDay treats these as knockout competitions (no standings table,
    // and advanceCupStages/getLeagueMeta gracefully no-op with no meta.json written for them).
    await saveService.writeRound(saveId, "cup_test_double_a", 1, {
      leagueSlug: "cup_test_double_a", round: 1, fixtures: [fixtureA],
    });
    await saveService.writeDateIndex(saveId, "cup_test_double_a", { [currentDate]: [1] });
    await saveService.writeRound(saveId, "cup_test_double_b", 1, {
      leagueSlug: "cup_test_double_b", round: 1, fixtures: [fixtureB],
    });
    await saveService.writeDateIndex(saveId, "cup_test_double_b", { [currentDate]: [1] });

    const err = spyOn(console, "error").mockImplementation(() => {});
    let outcome: Awaited<ReturnType<typeof advanceOneDay>>;
    let calendarErrors: unknown[][];
    try {
      outcome = await advanceOneDay(saveService, saveId);
      // Read the call log before mockRestore() — bun:test's mockRestore() also clears mock.calls.
      calendarErrors = err.mock.calls.filter((c) => c[0] === "[calendar]");
    } finally {
      err.mockRestore();
    }
    expect(outcome.ok).toBe(true);

    // Logged: a club is not supposed to have two fixtures on the same day.
    expect(calendarErrors.length).toBeGreaterThan(0);

    const [roundA, roundB] = await Promise.all([
      saveService.getRound(saveId, "cup_test_double_a", 1),
      saveService.getRound(saveId, "cup_test_double_b", 1),
    ]);
    expect(roundA!.fixtures[0]!.played).toBe(true);
    expect(roundB!.fixtures[0]!.played).toBe(true);

    // quickSim never substitutes, so each match records exactly 11 appearances for club X
    // (whichever 11 players start). Two matches must sum to 22 — a clobbered write would leave 11.
    const entryX = index.byId(clubX)!;
    const finalX = await saveService.getSquad(saveId, entryX.leagueSlug, entryX.stem);
    const totalAppearances = finalX!.players.reduce((sum, p) => sum + (p.seasonLog?.appearances ?? 0), 0);
    expect(totalAppearances).toBe(22);

    // Lineup selection is deterministic (rating-based, not fitness-based), so the same starters
    // are picked for both matches — at least some players must show 2 appearances (not just 22
    // different players logging 1 each), and their energy must reflect two drains, not one.
    const twice = finalX!.players.filter((p) => (p.seasonLog?.appearances ?? 0) === 2);
    expect(twice.length).toBeGreaterThan(0);
    for (const p of twice) {
      expect(p.seasonLog!.fitness).toBeLessThan(75); // emptySeasonLog() default baseline
    }
  }, 300_000);
});
