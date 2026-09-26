import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import type { PlayedMatchRecording } from "@/Domain/advanceDay";

describe("createSave generates national cups", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("England cup exists with a drawn first stage", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], budget: 1,
    });
    saveId = meta.id;
    const cup = await saveService.getLeagueMeta(saveId, "cup_england");
    expect(cup?.kind).toBe("cup");
    expect(cup!.cup!.stages[0]!.drawn).toBe(true);
    const r1 = await saveService.getRound(saveId, "cup_england", 1);
    expect(r1!.fixtures.length).toBeGreaterThan(0);
    // cups are not league states
    expect((meta.activeLeagues ?? []).some((l) => l.leagueSlug.startsWith("cup_"))).toBe(false);
  }, 120_000);
});

describe("advanceOneDay plays and draws a cup stage", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("stage 1 is played and stage 2 is drawn", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], budget: 1,
    });
    saveId = meta.id;

    const cupBefore = await saveService.getLeagueMeta(saveId, "cup_england");
    expect(cupBefore?.cup).toBeTruthy();
    const stage0 = cupBefore!.cup!.stages[0]!;

    await saveService.updateMeta(saveId, { currentDate: stage0.date });
    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);

    const round1 = await saveService.getRound(saveId, "cup_england", stage0.round);
    expect(round1!.fixtures.length).toBeGreaterThan(0);
    for (const f of round1!.fixtures) {
      expect(f.played).toBe(true);
      const level = f.result != null && f.result.home === f.result.away;
      if (level) {
        const pens = f.decider?.penalties;
        expect(pens && pens.home !== pens.away).toBe(true);
      }
    }

    const cupAfter = await saveService.getLeagueMeta(saveId, "cup_england");
    const stage1 = cupAfter!.cup!.stages[1]!;
    expect(stage1.drawn).toBe(true);
    expect(stage1.entrants.length).toBeGreaterThan(0);

    const round2 = await saveService.getRound(saveId, "cup_england", stage1.round);
    expect(round2!.fixtures.length).toBe(stage1.entrants.length / 2);
  }, 300_000);
});

describe("advanceOneDay rejects an undecided knockout recording", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("level score with no penalty winner returns 400 and writes nothing", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], budget: 1,
    });
    saveId = meta.id;

    const cup = await saveService.getLeagueMeta(saveId, "cup_england");
    const stage0 = cup!.cup!.stages[0]!;
    const round1 = await saveService.getRound(saveId, "cup_england", stage0.round);
    const fixture = round1!.fixtures[0]!;
    expect(fixture.knockout).toBe(true);

    // Make the fixture's home club the "player" club so advanceOneDay treats the override as
    // theirs, then force the current date to the cup's stage-1 date.
    await saveService.updateMeta(saveId, { clubId: fixture.home, currentDate: stage0.date });

    const recording: PlayedMatchRecording = {
      fixtureId: fixture.id,
      score: { home: 1, away: 1 },
      teamStats: {
        home: { shots: 0, passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0 },
        away: { shots: 0, passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0 },
      },
      playerStats: {},
      playerRatings: {},
      playerEnergy: {},
      substitutions: [],
      durationMs: 0,
      // No decider — a level score with no penalty shootout is not a valid knockout result.
    };

    const outcome = await advanceOneDay(saveService, saveId, recording);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(400);
      expect(outcome.error).toBe("knockout recording without a winner");
    }

    // Nothing should have been written: the fixture is still unplayed.
    const round1After = await saveService.getRound(saveId, "cup_england", stage0.round);
    const fixtureAfter = round1After!.fixtures.find((f) => f.id === fixture.id)!;
    expect(fixtureAfter.played).toBe(false);
  }, 120_000);
});
