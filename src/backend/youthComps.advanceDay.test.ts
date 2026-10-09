/**
 * Youth competitions in the day pipeline (`.claude/rules/game/youth-competitions.md`): today's youth
 * games are played (quickSim), kept out of the day's first-team events, postponed or cancelled when a
 * club plays for the first team, and the human club's call-ups are used and cleared.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { playYouthDay, youthCompFixtures } from "@/backend/youthCompWorld";
import { computeStandings } from "@/Domain/season/computeStandings";
import { youthStandingsBase } from "@/Domain/youthComps/generateYouthComp";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

const HUMAN = "33";

describe("youth competitions in advanceOneDay", () => {
  let saveId = "";
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  const fixturesOf = async (slug: string): Promise<Fixture[]> =>
    youthCompFixtures(saveService, saveId, (await saveService.getLeagueMeta(saveId, slug))!);

  test("a youth day is played off the first-team flows", async () => {
    const fixtures = await fixturesOf("u19_england");
    const day = fixtures.filter((f) => f.round === 1).map((f) => f.date).sort()[0]!;
    const onDay = fixtures.filter((f) => f.date === day);
    const clubs = new Set(onDay.flatMap((f) => [f.home, f.away]));
    const before = new Map<string, Squad>();
    for (const c of clubs) before.set(c, (await saveService.getSquadById(saveId, c))!);
    const metaBefore = (await saveService.getMeta(saveId))!;
    await saveService.updateMeta(saveId, { currentDate: day });

    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);

    const after = await fixturesOf("u19_england");
    for (const f of onDay) {
      const now = after.find((x) => x.id === f.id)!;
      expect(now.played || now.date > day).toBe(true);
    }
    const table = (await saveService.getLeagueStandings(saveId, "u19_england"))!;
    const meta = (await saveService.getLeagueMeta(saveId, "u19_england"))!;
    expect(table).toEqual(computeStandings(youthStandingsBase(meta), after, "u19_england"));
    expect(Object.keys(meta.youth!.leaders).length).toBeGreaterThan(0);

    const log = (await saveService.getDayLog(saveId, day))!;
    const youthLogs = (log.youthMatches ?? []).filter((m) => m.competition === "u19_england");
    expect(youthLogs.length).toBe(after.filter((f) => onDay.some((o) => o.id === f.id) && f.played).length);
    expect(log.events.some((e) => "competition" in e && isYouthCompSlug(String((e as { competition?: string }).competition)))).toBe(false);

    // Players who played only a youth game: no first-team totals, no training, one youth appearance.
    const firstTeam = new Set(log.events.flatMap((e) => (e.kind === "match" ? [e.home, e.away] : [])));
    let checked = 0;
    for (const m of youthLogs) {
      for (const [club, ids] of [[m.home, m.players.home], [m.away, m.players.away]] as const) {
        if (firstTeam.has(club)) continue;
        const sq = (await saveService.getSquadById(saveId, club))!;
        const old = before.get(club)!;
        for (const id of ids) {
          const p = [...sq.players, ...(sq.youth ?? [])].find((x) => x.id === id)!;
          const o = [...old.players, ...(old.youth ?? [])].find((x) => x.id === id)!;
          expect(p.seasonLog!.youthCup!.appearances).toBe(1);
          expect(p.seasonLog!.appearances).toBe(o.seasonLog?.appearances ?? 0);
          expect(p.seasonLog!.trainingSessions).toBe(o.seasonLog?.trainingSessions ?? 0);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);

    // The human club in a youth round only: board and fans untouched by the youth game.
    const humanPlayedYouth = youthLogs.some((m) => m.home === HUMAN || m.away === HUMAN);
    const metaAfter = (await saveService.getMeta(saveId))!;
    if (humanPlayedYouth && !firstTeam.has(HUMAN) && new Date(`${day}T12:00:00Z`).getUTCDay() !== 1) {
      expect(metaAfter.board!.board).toBe(metaBefore.board!.board);
      expect(metaAfter.board!.fans).toBe(metaBefore.board!.fans);
    }
  }, 180_000);

  test("a club playing for the first team gets its youth game postponed, or cancelled with no free day", async () => {
    const fixtures = (await fixturesOf("u21_england")).filter((f) => !f.played);
    const target = fixtures.sort((a, b) => (a.date < b.date ? -1 : 1))[5]!;
    const index = await saveService.getSquadIndex(saveId);
    const base = {
      service: saveService, saveId, date: target.date, index, humanClubId: HUMAN, tactics: null,
      squadOf: (id: string) => saveService.getSquadById(saveId, id),
    };
    const res = await playYouthDay({ ...base, teamsPlayingToday: new Set([target.home]) });
    expect(res.postponed).toBeGreaterThan(0);
    const moved = (await fixturesOf("u21_england")).find((f) => f.id === target.id)!;
    expect(moved.played).toBe(false);
    expect(moved.date > target.date).toBe(true);
    expect(moved.postponedFrom).toBe(target.date);
    const idx = (await saveService.getDateIndex(saveId, "u21_england"))!;
    expect(idx[moved.date]).toContain(moved.round);

    // No free day: the competition ends on the new date → cancelled.
    const meta = (await saveService.getLeagueMeta(saveId, "u21_england"))!;
    await saveService.writeLeagueMeta(saveId, { ...meta, end: moved.date });
    const res2 = await playYouthDay({ ...base, date: moved.date, teamsPlayingToday: new Set([moved.away]) });
    expect(res2.cancelled).toBeGreaterThan(0);
    const gone = (await fixturesOf("u21_england")).find((f) => f.id === target.id)!;
    expect(gone).toMatchObject({ played: true, result: null, cancelled: true });
    await saveService.writeLeagueMeta(saveId, meta);
  }, 120_000);

  test("a call-up plays the club's next youth game and is cleared after", async () => {
    const meta = (await saveService.getMeta(saveId))!;
    const next = (await fixturesOf("u21_england"))
      .filter((f) => !f.played && f.date >= meta.currentDate! && (f.home === HUMAN || f.away === HUMAN))
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0]!;
    const squad = (await saveService.getSquadById(saveId, HUMAN))!;
    const star = [...squad.players].sort((a, b) => (b.seasonLog?.appearances ?? 0) - (a.seasonLog?.appearances ?? 0) || a.id.localeCompare(b.id))
      .find((p) => !p.injury)!;
    await saveService.updateMeta(saveId, { currentDate: next.date, youthCallUps: { u21: [star.id] } });
    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);
    const log = (await saveService.getDayLog(saveId, next.date))!;
    const game = (log.youthMatches ?? []).find((m) => m.fixtureId === next.id);
    expect(game?.score).toBeTruthy();
    const mine = game!.home === HUMAN ? game!.players.home : game!.players.away;
    expect(mine).toContain(star.id);
    expect((await saveService.getMeta(saveId))!.youthCallUps).toBeUndefined();
  }, 180_000);
});
