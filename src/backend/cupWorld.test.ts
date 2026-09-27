import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay, getLeagueData, getPyramids } from "@/backend/advanceDay";
import { continentalSlugsOf, countryByLeague, createCountryCup } from "@/backend/cupWorld";
import type { PlayedMatchRecording } from "@/Domain/advanceDay";
import type { CupInboxMessage } from "@/types/inboxTypes";

describe("createSave generates national cups", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("England cup exists with a drawn first stage", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
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
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
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

describe("advanceOneDay emits cup inbox news", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("stage 1 for the player's club produces a cup inbox message", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const cupBefore = await saveService.getLeagueMeta(saveId, "cup_england");
    const stage0 = cupBefore!.cup!.stages[0]!;
    const round1 = await saveService.getRound(saveId, "cup_england", stage0.round);
    // Pick a club that actually plays stage 1 (a top-tier club may have a bye straight to stage 2).
    const fixture = round1!.fixtures[0]!;

    await saveService.updateMeta(saveId, { clubId: fixture.home, currentDate: stage0.date });
    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);

    const inbox = await saveService.getInbox(saveId);
    const cupMessages = inbox.filter((m) => m.category === "cup") as CupInboxMessage[];
    expect(cupMessages.length).toBe(1);

    const msg = cupMessages[0]!;
    expect(msg.cupSlug).toBe("cup_england");
    expect(["draw", "eliminated"]).toContain(msg.kind);
    expect(msg.opponentName).toBeTruthy();
    if (msg.kind === "draw") {
      expect(msg.tieDate).toBeTruthy();
      expect(msg.venue).toBeTruthy();
      expect(["home", "away", "neutral"]).toContain(msg.venue!);
    } else {
      expect(msg.tieDate).toBeUndefined();
    }
  }, 300_000);
});

describe("advanceOneDay rejects an undecided knockout recording", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("level score with no penalty winner returns 400 and writes nothing", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
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

  test("second leg: 90' score alone would be level, but aggregate decides it — no decider needed, 400", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const cup = await saveService.getLeagueMeta(saveId, "cup_england");
    const stage0 = cup!.cup!.stages[0]!;
    const round1 = await saveService.getRound(saveId, "cup_england", stage0.round);
    const fixture = round1!.fixtures[0]!;
    expect(fixture.knockout).toBe(true);

    // First leg: away won 1-0 (home:0, away:1) from THIS fixture's home/away point of view.
    // Aggregate is level when this leg's result.home - result.away === 1.
    const roundWithAggregate = {
      ...round1!,
      fixtures: round1!.fixtures.map((f) =>
        f.id === fixture.id ? { ...f, aggregate: { home: 0, away: 1 } } : f,
      ),
    };
    await saveService.writeRound(saveId, "cup_england", stage0.round, roundWithAggregate);

    await saveService.updateMeta(saveId, { clubId: fixture.home, currentDate: stage0.date });

    const recording: PlayedMatchRecording = {
      fixtureId: fixture.id,
      // 1-0 this leg → level on aggregate (0+1 === 1+0) — needs a decider, but none is given.
      score: { home: 1, away: 0 },
      teamStats: {
        home: { shots: 0, passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0 },
        away: { shots: 0, passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0 },
      },
      playerStats: {},
      playerRatings: {},
      playerEnergy: {},
      substitutions: [],
      durationMs: 0,
    };

    const outcome = await advanceOneDay(saveService, saveId, recording);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(400);
      expect(outcome.error).toBe("knockout recording without a winner");
    }

    const round1After = await saveService.getRound(saveId, "cup_england", stage0.round);
    const fixtureAfter = round1After!.fixtures.find((f) => f.id === fixture.id)!;
    expect(fixtureAfter.played).toBe(false);
  }, 120_000);

  test("second leg: 90' score alone would be level, aggregate breaks the tie — recorded with no decider", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const cup = await saveService.getLeagueMeta(saveId, "cup_england");
    const stage0 = cup!.cup!.stages[0]!;
    const round1 = await saveService.getRound(saveId, "cup_england", stage0.round);
    const fixture = round1!.fixtures[0]!;
    expect(fixture.knockout).toBe(true);

    // First leg: home won 1-0 (home:1, away:0) from THIS fixture's home/away point of view.
    // Aggregate is not level at 1-1 this leg (1+1 !== 1+0) — home wins the tie on aggregate.
    const roundWithAggregate = {
      ...round1!,
      fixtures: round1!.fixtures.map((f) =>
        f.id === fixture.id ? { ...f, aggregate: { home: 1, away: 0 } } : f,
      ),
    };
    await saveService.writeRound(saveId, "cup_england", stage0.round, roundWithAggregate);

    await saveService.updateMeta(saveId, { clubId: fixture.home, currentDate: stage0.date });

    const recording: PlayedMatchRecording = {
      fixtureId: fixture.id,
      // 1-1 this leg → not level on aggregate (1+1 !== 1+0), decided without a decider.
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
    };

    const outcome = await advanceOneDay(saveService, saveId, recording);
    expect(outcome.ok).toBe(true);

    const round1After = await saveService.getRound(saveId, "cup_england", stage0.round);
    const fixtureAfter = round1After!.fixtures.find((f) => f.id === fixture.id)!;
    expect(fixtureAfter.played).toBe(true);
    expect(fixtureAfter.result).toEqual({ home: 1, away: 1 });
    expect(fixtureAfter.decider).toBeUndefined();
  }, 120_000);
});

describe("createCountryCup avoids continental competition dates", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("England finds its own continentals; a country with none gets none; a regenerated cup never lands on one of those dates", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const englandSlugs = await continentalSlugsOf(saveService, saveId, "England");
    expect(englandSlugs).toContain("ucl");
    expect(englandSlugs).not.toContain("lib");
    expect(englandSlugs).not.toContain("sud");

    // A country with no continental participants (or not in the world at all) gets none — the
    // mitigation must be a strict no-op for it, same behaviour as before this existed.
    expect(await continentalSlugsOf(saveService, saveId, "Nowhereland")).toEqual([]);

    const cupBefore = await saveService.getLeagueMeta(saveId, "cup_england");
    const index = await saveService.getSquadIndex(saveId);
    const countryOf = countryByLeague(await getLeagueData());
    const pyramids = await getPyramids();

    // Regenerate England's cup over the same window as before — the exact code path
    // advanceDay.ts's country-rollover block calls createCountryCup with.
    const newMeta = await createCountryCup({
      service: saveService, saveId, country: "England", year: cupBefore!.year + 1,
      window: { start: cupBefore!.start, end: cupBefore!.end }, index, countryOf, pyramids,
    });
    expect(newMeta).toBeTruthy();

    const continentalDates = new Set<string>();
    for (const slug of englandSlugs) {
      const idx = await saveService.getDateIndex(saveId, slug);
      for (const d of Object.keys(idx ?? {})) continentalDates.add(d);
    }
    expect(continentalDates.size).toBeGreaterThan(0);

    const cupDates: string[] = [];
    for (const stage of newMeta!.cup!.stages) {
      const round = await saveService.getRound(saveId, "cup_england", stage.round);
      for (const f of round?.fixtures ?? []) cupDates.push(f.date);
    }
    expect(cupDates.length).toBeGreaterThan(0);
    for (const d of cupDates) expect(continentalDates.has(d)).toBe(false);
  }, 300_000);
});
