import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { recordSeasonGoals } from "@/backend/awardsWorld";
import type { MatchEvent, MatchGoal } from "@/types/dayLogTypes";
import type { LeagueSeasonState } from "@/types/calendarTypes";

const created: string[] = [];
afterAll(async () => { for (const id of created) await saveService.deleteSave(id); });

function event(competition: string, goals: MatchGoal[] | undefined, fixtureId = "f1"): MatchEvent {
  return {
    kind: "match", fixtureId, competition, round: 1, home: "h", away: "a", score: { home: 2, away: 1 },
    teamStats: {} as MatchEvent["teamStats"], playerStats: {}, playerRatings: {}, playerNames: { p1: "P One", p2: "P Two" },
    playerTeams: {}, scorers: [], substitutions: [], developmentChanges: [], durationMs: 0,
    ...(goals ? { goals } : {}),
  };
}
const g = (o: Partial<MatchGoal>): MatchGoal => ({ playerId: "p1", team: "home", minute: 10, header: false, distance: 10, outsideBox: false, ...o });
const state = (leagueSlug: string, year = 2026): LeagueSeasonState =>
  ({ leagueSlug, leagueName: leagueSlug, year, start: "2026-08-15", end: "2027-05-20", totalRounds: 38, currentRound: 0 });

describe("goal of the season candidates", () => {
  test("league matches only, headers / outside the box, never penalties; idempotent on a retried day", async () => {
    const id = `test-sg-${randomUUID()}`;
    created.push(id);
    const events = [
      event("premier_league", [
        g({ minute: 12, header: true }),
        g({ minute: 30, outsideBox: true, distance: 27, playerId: "p2", team: "away" }),
        g({ minute: 50 }),
        g({ minute: 70, setPiece: "penalty", outsideBox: false }),
      ]),
      event("cup_england", [g({ header: true })], "f2"),
      event("of_championship", undefined, "f3"),
    ];
    const states = [state("premier_league"), state("of_championship")];
    await recordSeasonGoals(saveService, id, "2026-09-01", events, states);
    await recordSeasonGoals(saveService, id, "2026-09-01", events, states);
    const file = (await saveService.getSeasonGoals(id, "premier_league", 2026))!;
    expect(file.goals.map((x) => x.key)).toEqual(["f1:12:p1", "f1:30:p2"]);
    expect(file.goals[1]).toMatchObject({ squadId: "a", opponentId: "h", playerName: "P Two", distance: 27, header: false });
    expect(await saveService.listSeasonGoalFiles(id)).toEqual([{ league: "premier_league", year: 2026 }]);
  });

  test("a round of the player's league (full engine) writes only its own file", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
      manager: { name: "Zé Tester", nationalityIso: "br", backgroundId: "former-player" },
    });
    created.push(meta.id);
    const idx = (await saveService.getDateIndex(meta.id, "premier_league"))!;
    const day = Object.keys(idx).filter((d) => d >= meta.currentDate!).sort()[0]!;
    await saveService.updateMeta(meta.id, { currentDate: day });
    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);
    const files = await saveService.listSeasonGoalFiles(meta.id);
    expect(files.every((f) => f.league === "premier_league")).toBe(true);
    const log = await saveService.getDayLog(meta.id, day);
    const plGoals = (log?.events ?? []).flatMap((e) => (e.kind === "match" && e.competition === "premier_league" ? e.goals ?? [] : []));
    const eligible = plGoals.filter((x) => (x.header || x.outsideBox) && x.setPiece !== "penalty");
    const file = await saveService.getSeasonGoals(meta.id, "premier_league", meta.activeLeagues!.find((l) => l.leagueSlug === "premier_league")!.year);
    expect(file?.goals.length ?? 0).toBe(eligible.length);
    for (const c of file?.goals ?? []) expect(c.header || c.distance > 0).toBe(true);
  }, 180_000);
});
