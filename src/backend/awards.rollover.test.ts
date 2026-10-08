import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { recordLeagueAwards } from "@/backend/awardsWorld";
import { emptySeasonLog } from "@/types/playerTypes";
import type { GoalOfSeasonCandidate } from "@/types/awardTypes";

/**
 * League awards at the rollover (`.claude/rules/game/awards.md`): England is forced to end today,
 * the Premier League players get a full season log, one player of the human club is the standout.
 */
describe("season awards at the rollover", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("awards file, history rows, value boost, morale, manager, inbox; idempotent", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
      manager: { name: "Zé Tester", nationalityIso: "br", backgroundId: "former-player" },
    });
    saveId = meta.id;
    const today = meta.currentDate!;
    const pl = meta.activeLeagues!.find((l) => l.leagueSlug === "premier_league")!;

    // A full season in every Premier League log; the human club's first player is the standout.
    const plSquads = await saveService.getSquadsInLeague(saveId, "premier_league");
    let star = "";
    for (const sq of plSquads) {
      const players = sq.players.map((p, i) => {
        const isStar = sq.id === "33" && i === sq.players.findIndex((x) => x.positions[0] !== "GK");
        if (isStar) star = p.id;
        return {
          ...p,
          seasonLog: {
            ...(p.seasonLog ?? emptySeasonLog()), appearances: 30,
            goals: isStar ? 40 : i % 6, assists: i % 4, avgRating: isStar ? 9.5 : 6 + (i % 15) / 10,
          },
        };
      });
      await saveService.saveSquadById(saveId, { ...sq, players });
    }
    const moraleBefore = plSquads.find((s) => s.id === "33")!.players.find((p) => p.id === star)!.morale ?? 65;

    // One goal-of-the-season candidate, and round 1 played by everyone (the human club wins big).
    const goal: GoalOfSeasonCandidate = {
      key: "fx:30:" + star, fixtureId: "fx", date: today, playerId: star, playerName: "Star", squadId: "33",
      opponentId: "34", minute: 30, header: false, distance: 28,
    };
    await saveService.writeSeasonGoals(saveId, { league: "premier_league", year: pl.year, goals: [goal] });
    const r1 = (await saveService.getRound(saveId, "premier_league", 1))!;
    await saveService.writeRound(saveId, "premier_league", 1, {
      ...r1,
      fixtures: r1.fixtures.map((f) => ({
        ...f, played: true,
        result: f.home === "33" ? { home: 9, away: 0 } : f.away === "33" ? { home: 0, away: 9 } : { home: 1, away: 0 },
      })),
    });
    const active = (meta.activeLeagues ?? []).map((l) =>
      l.leagueSlug === "premier_league" || l.leagueSlug === "of_championship" ? { ...l, end: today } : l);
    await saveService.updateMeta(saveId, { activeLeagues: active });

    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);

    const year = Number(today.slice(0, 4));
    const file = (await saveService.getAwardsYear(saveId, year))!;
    expect(file).not.toBeNull();
    const entry = file.leagues.find((l) => l.league === "premier_league")!;
    expect(entry.teamOfSeason).toHaveLength(11);
    expect(new Set(entry.teamOfSeason.map((p) => p.playerId)).size).toBe(11);
    expect(entry.bestPlayer?.playerId).toBe(star);
    expect(entry.topScorer?.playerId).toBe(star);
    expect(entry.bestManager).toBeDefined();
    expect(entry.goalOfSeason?.key).toBe(goal.key);
    expect(entry.shortlist.players.length).toBeGreaterThan(0);
    // The quick-sim league has its entry, never a goal of the season.
    const champ = file.leagues.find((l) => l.league === "of_championship");
    expect(champ).toBeDefined();
    expect(champ!.goalOfSeason).toBeUndefined();

    const me = (await saveService.getSquadById(saveId, "33"))!;
    const p = me.players.find((x) => x.id === star)!;
    const row = p.history!.find((r) => r.league === "premier_league" && r.season === entry.season)!;
    expect(row.awards?.map((a) => a.kind)).toEqual(expect.arrayContaining(["best_player", "top_scorer", "team_of_season", "goal_of_season"]));
    expect(row.awards?.every((a) => a.league === "premier_league")).toBe(true);
    expect(p.awardBoost).toMatchObject({ league: "premier_league", season: entry.season, mult: 1.15 });
    expect(p.morale!).toBeGreaterThan(moraleBefore);

    const managers = await saveService.getManagers(saveId);
    const bm = managers.find((m) => m.id === entry.bestManager!.managerId)!;
    expect(bm.awards?.some((a) => a.kind === "best_manager" && a.competition === "premier_league" && a.season === entry.season)).toBe(true);

    const inbox = await saveService.getInbox(saveId);
    expect(inbox.some((m) => m.category === "awards" && "kind" in m && m.kind === "league")).toBe(true);

    // Rerun on the same state (a retried day): no duplicate entry, no duplicate award on the row.
    const after = await saveService.getSquadsInLeague(saveId, "premier_league");
    const inLeague = after.filter((s) => plSquads.some((x) => x.id === s.id));
    await recordLeagueAwards(saveService, saveId, {
      league: "premier_league", season: entry.season, closedOn: today, country: "England", tier: 1, weight: entry.weight,
      state: { ...pl, end: today }, squads: inLeague, table: [], managers, targets: new Map(), tierChanges: {},
      playerClubId: null, leagueName: "Premier League",
    });
    const again = (await saveService.getAwardsYear(saveId, year))!;
    expect(again.leagues.filter((l) => l.league === "premier_league" && l.season === entry.season)).toHaveLength(1);
    const res = await recordLeagueAwards(saveService, saveId, {
      league: "premier_league", season: entry.season, closedOn: today, country: "England", tier: 1, weight: entry.weight,
      state: { ...pl, end: today }, squads: inLeague, table: [], managers, targets: new Map(), tierChanges: {},
      playerClubId: null, leagueName: "Premier League",
    });
    const p2 = res.squads.flatMap((s) => s.players).find((x) => x.id === star)!;
    const row2 = p2.history!.find((r) => r.league === "premier_league" && r.season === entry.season)!;
    expect(row2.awards!.filter((a) => a.kind === "best_player")).toHaveLength(1);
  }, 240_000);
});
