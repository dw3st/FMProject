import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay, getLeagueData, getPyramids } from "@/backend/advanceDay";
import { applyBroadcasting } from "@/backend/FinancialService";
import { countryByLeague, cupPrizeBase } from "@/backend/cupWorld";
import { fixtureWinner } from "@/Domain/cups/cupProgress";
import type { Fixture } from "@/types/calendarTypes";
import { aiBudgetWithPrize, continentalPrize, cupStagePrize, leaguePrize } from "@/Domain/finance/prizes";
import {
  aiTransferBudgetOf, financialTierOf, popularityFromFollowers, seasonalTransferBudgetFor,
} from "@/Domain/aiFinance/aiClubFinance";

/**
 * Integration coverage for prize money (Task 6, design spec §3): a national cup, continental
 * competition, and league rollover all reward the player's club (ledger `prize`) and AI clubs
 * (transfer budget) the same day the event happens. See `.claude/rules/AI-clubs/finance.md`.
 */
describe("finance prizes — continental (UCL group round 1)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("player's club: ledger has participation + the matching win/draw prize; an AI club in the same round gets 50% into its transfer budget (respecting the cap)", async () => {
    // Qualification is rank/level-based, not fixed per club — probe with a throwaway save first
    // to find a real Premier League UCL qualifier (see advanceUntil.continental.test.ts / the
    // finance.ledger.test.ts "continental home gate" test for the same pattern).
    const probeMeta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Probe", clubColors: ["#000000", "#ffffff"],
    });
    let qualifiedClub = "";
    let groupmateClub = "";
    let round1Date = "";
    try {
      const index = await saveService.getSquadIndex(probeMeta.id);
      const plClubs = new Set(index.inLeague("premier_league").map((t) => t.squadId));
      const ucl = await saveService.getLeagueMeta(probeMeta.id, "ucl");
      const group = ucl!.continental!.stages.find((s) => s.name === "group")!;
      const uclClubs = ucl!.continental!.groups.flatMap((g) => g.clubs);
      qualifiedClub = uclClubs.find((id) => plClubs.has(id))!;
      expect(qualifiedClub).toBeTruthy();
      round1Date = group.dates[0]!;

      const round1 = await saveService.getRound(probeMeta.id, "ucl", group.rounds[0]!);
      // Another club playing round 1, from the OTHER fixture of the same group (never the
      // qualified club's own opponent, so its budget reaction is independent of the player's match).
      const myFixture = round1!.fixtures.find((f) => f.home === qualifiedClub || f.away === qualifiedClub)!;
      groupmateClub = round1!.fixtures.find((f) => f.id !== myFixture.id)!.home;
      expect(groupmateClub).toBeTruthy();
    } finally {
      await saveService.deleteSave(probeMeta.id);
    }

    let meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: qualifiedClub, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    meta = await applyBroadcasting(saveId, meta, meta.leagueSlug, meta.clubId);

    const groupmateBefore = (await saveService.getSquadById(saveId, groupmateClub))!;
    const groupmateBudgetBefore = aiTransferBudgetOf(groupmateBefore);
    const groupmateSeasonalGrant = seasonalTransferBudgetFor(
      financialTierOf(groupmateBefore), popularityFromFollowers(groupmateBefore.finances?.followers ?? 0),
    );

    // marketFrozen: no AI-AI transfer can touch groupmateClub's budget the same day, so the only
    // thing that can move it is the prize logic under test.
    await saveService.updateMeta(saveId, { currentDate: round1Date });
    const outcome = await advanceOneDay(saveService, saveId, null, { marketFrozen: true });
    expect(outcome.ok).toBe(true);

    const leagueMeta = await saveService.getLeagueMeta(saveId, meta.leagueSlug);
    const ledger = await saveService.getLedger(saveId, leagueMeta!.year);
    const prizeEntries = ledger.filter((e) => e.date === round1Date && e.kind === "prize" && e.ref?.competition === "ucl");

    const participationPrize = continentalPrize("ucl", "participation");
    const participationEntry = prizeEntries.find((e) => e.amount === participationPrize);
    expect(participationEntry).toBeTruthy();

    const round1After = await saveService.getRound(saveId, "ucl", 1);
    const myFixtureAfter = round1After!.fixtures.find((f) => f.home === qualifiedClub || f.away === qualifiedClub)!;
    expect(myFixtureAfter.played).toBe(true);
    const myResult = myFixtureAfter.result!;
    let resultPrize = 0;
    if (myResult.home === myResult.away) {
      resultPrize = continentalPrize("ucl", "groupDraw");
    } else {
      const won = (myFixtureAfter.home === qualifiedClub && myResult.home > myResult.away)
        || (myFixtureAfter.away === qualifiedClub && myResult.away > myResult.home);
      if (won) resultPrize = continentalPrize("ucl", "groupWin");
    }
    if (resultPrize > 0) {
      expect(prizeEntries.some((e) => e.amount === resultPrize)).toBe(true);
      expect(prizeEntries).toHaveLength(2);
    } else {
      expect(prizeEntries).toHaveLength(1);
    }

    // The other club's round-1 result decides its own win/draw prize the same way.
    const otherFixture = round1After!.fixtures.find((f) => f.home === groupmateClub || f.away === groupmateClub)!;
    const otherResult = otherFixture.result!;
    let groupmateResultPrize = 0;
    if (otherResult.home === otherResult.away) {
      groupmateResultPrize = continentalPrize("ucl", "groupDraw");
    } else {
      const won = (otherFixture.home === groupmateClub && otherResult.home > otherResult.away)
        || (otherFixture.away === groupmateClub && otherResult.away > otherResult.home);
      if (won) groupmateResultPrize = continentalPrize("ucl", "groupWin");
    }

    const afterParticipation = aiBudgetWithPrize(groupmateBudgetBefore, participationPrize, groupmateSeasonalGrant);
    const expectedGroupmateBudget = groupmateResultPrize > 0
      ? aiBudgetWithPrize(afterParticipation, groupmateResultPrize, groupmateSeasonalGrant)
      : afterParticipation;

    const groupmateAfter = (await saveService.getSquadById(saveId, groupmateClub))!;
    expect(groupmateAfter.aiTransferBudget).toBe(expectedGroupmateBudget);
    // The 50% share actually moved the needle (unless the AI club was already at its cap).
    if (afterParticipation < groupmateSeasonalGrant * 1.5) {
      expect(groupmateAfter.aiTransferBudget).toBeGreaterThan(groupmateBudgetBefore);
    }
  }, 300_000);
});

describe("finance prizes — league merit at rollover", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("the player's club gets a `prize` ledger entry in the new season's file, matching leaguePrize(broadcasting, position, n)", async () => {
    // Iceland: a calendar-year league with no pyramid (season-rollover-smoke.ts and
    // finance.ledger.test.ts's "rollover broadcasting (L4)" test both use it to force a
    // standalone rollover without waiting out a real season or dragging in a whole pyramid).
    let meta = await saveService.createSave({
      leagueSlug: "of_icelandic_urvalsdeild", leagueName: "Úrvalsdeild",
      clubId: "of_is_breidablik", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    meta = await applyBroadcasting(saveId, meta, meta.leagueSlug, meta.clubId);

    const stateBefore = meta.activeLeagues!.find((l) => l.leagueSlug === meta.leagueSlug)!;
    const oldYear = stateBefore.year;
    const broadcastingFee = (await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId))!.finances!.broadcasting;

    await saveService.updateMeta(saveId, { currentDate: stateBefore.end });
    const outcome = await advanceOneDay(saveService, saveId, null, { marketFrozen: true });
    expect(outcome.ok).toBe(true);

    const metaAfter = await saveService.getMeta(saveId);
    const stateAfter = metaAfter!.activeLeagues!.find((l) => l.leagueSlug === meta.leagueSlug)!;
    expect(stateAfter.year).toBe(oldYear + 1);

    const archive = await saveService.readLeagueSeasonArchive(saveId, meta.leagueSlug, oldYear);
    expect(archive).toBeTruthy();
    const position = archive!.standings.findIndex((r) => r.squadId === meta.clubId) + 1;
    expect(position).toBeGreaterThan(0);
    const n = archive!.standings.length;
    const expectedPrize = leaguePrize(broadcastingFee, position, n);

    const newLedger = await saveService.getLedger(saveId, oldYear + 1);
    const prizeEntries = newLedger.filter((e) => e.kind === "prize" && e.ref?.competition === meta.leagueSlug);

    if (expectedPrize > 0) {
      expect(prizeEntries).toHaveLength(1);
      expect(prizeEntries[0]!.amount).toBe(expectedPrize);
      expect(prizeEntries[0]!.label).toContain("rvalsdeild"); // "Úrvalsdeild"/"Urvalsdeild" — accent handling is competitionName's concern, not this test's
    } else {
      expect(prizeEntries).toHaveLength(0);
    }

    // The budget reflects both the broadcasting credit and (if any) the league prize.
    const squadAfter = await saveService.getSquad(saveId, stateAfter.leagueSlug, meta.clubId);
    const oldLedger = await saveService.getLedger(saveId, oldYear);
    const sum = [...oldLedger, ...newLedger].reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(squadAfter!.finances!.budget);
  }, 60_000);
});

describe("finance prizes — national cup (FA Cup stage 1)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("the winner of the player's tie gets a `prize` ledger entry worth the stage's share of the country's tier-1 mean broadcasting", async () => {
    let meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    meta = await applyBroadcasting(saveId, meta, meta.leagueSlug, meta.clubId);

    // The player's club may have a bye through the preliminary stage (`.claude/rules/game/cups.md`
    // → "byes") — walk stages forward until it actually has a fixture.
    let stage = (await saveService.getLeagueMeta(saveId, "cup_england"))!.cup!.stages[0]!;
    let myFixture: Fixture | undefined;
    for (let i = 0; i < 8 && !myFixture; i++) {
      await saveService.updateMeta(saveId, { currentDate: stage.date });
      const outcome = await advanceOneDay(saveService, saveId, null, { marketFrozen: true });
      expect(outcome.ok).toBe(true);
      const round = await saveService.getRound(saveId, "cup_england", stage.round);
      myFixture = round!.fixtures.find((f) => f.home === meta.clubId || f.away === meta.clubId);
      if (myFixture) break;
      const cupNow = (await saveService.getLeagueMeta(saveId, "cup_england"))!.cup!;
      const nextStage = cupNow.stages.find((s) => s.round === stage.round + 1);
      if (!nextStage) break;
      stage = nextStage;
    }
    expect(myFixture).toBeTruthy();
    const stage0 = stage;
    const fixture = myFixture!;
    expect(fixture.played).toBe(true);
    const winnerId = fixtureWinner(fixture)!;
    expect(winnerId).toBeTruthy();

    const index = await saveService.getSquadIndex(saveId);
    const catalog = await getLeagueData();
    const countryOf = countryByLeague(catalog);
    const pyramids = await getPyramids();
    const base = await cupPrizeBase(saveService, saveId, "England", index, countryOf, pyramids);
    const expectedPrize = cupStagePrize(base, stage0.name);
    expect(expectedPrize).toBeGreaterThan(0);

    const leagueMeta = await saveService.getLeagueMeta(saveId, meta.leagueSlug);
    const ledger = await saveService.getLedger(saveId, leagueMeta!.year);
    const cupPrizeEntry = ledger.find((e) => e.date === stage0.date && e.kind === "prize" && e.ref?.competition === "cup_england");

    if (winnerId === meta.clubId) {
      expect(cupPrizeEntry?.amount).toBe(expectedPrize);
    } else {
      // The player's club lost — no cup prize entry for it (the AI winner got its transfer
      // budget bumped instead, covered by the continental test above using the same mechanism).
      expect(cupPrizeEntry).toBeUndefined();
    }
  }, 120_000);
});
