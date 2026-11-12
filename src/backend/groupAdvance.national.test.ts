/**
 * The provisional result of the manager's national game in a group world (10.6.4, tester report): the result screen
 * asks for it before the day runs, and it used to fail because no club squad is called `nat_…`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { runningWorld } from "@/backend/testing/worldFixtures";
import { callApi } from "@/backend/worlds/worldTestUtils";
import { addSeat } from "@/backend/seats";
import { ensureNationalWorld } from "@/backend/nationalWorld";
import { setKickScheduler, waitWorld } from "@/backend/groupAdvance";
import type { Fixture } from "@/types/calendarTypes";

describe("provisional result of a national game", () => {
  let saveId = "";
  let fixture: Fixture;
  let a: ReturnType<typeof devAutoLogin>;

  beforeAll(async () => {
    setKickScheduler(() => {});
    a = devAutoLogin("ga-nat-a@test.local");
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const seatA = await ownSolo(saveId, a.user.id);
    const clubB = (await saveService.getSquadsInLeague(saveId, "premier_league")).find((s) => s.id !== "33")!.id;
    await addSeat(saveId, {
      userId: devAutoLogin("ga-nat-b@test.local").user.id, clubId: clubB,
      manager: { name: "Friend", nationalityIso: "es", backgroundId: "former-player" },
    });
    await ensureNationalWorld({ service: saveService, saveId, today: meta.currentDate!, index: await saveService.getSquadIndex(saveId) });
    const state = (await saveService.getNationalState(saveId))!;
    // A national game on a day the club does not play.
    const clubDays = new Set((await saveService.getAllFixturesForLeague(saveId, "premier_league"))
      .filter((f) => f.home === "33" || f.away === "33").map((f) => f.date));
    let found: Fixture | undefined;
    for (const slug of state.competitions) {
      const c = await saveService.getNationalComp(saveId, slug);
      found = c?.fixtures.filter((f) => !f.played && f.date >= meta.currentDate! && !clubDays.has(f.date))
        .sort((x, y) => x.date.localeCompare(y.date))[0];
      if (found) break;
    }
    fixture = found!;
    const clubs = (await saveService.getSquadsInLeague(saveId, "premier_league")).slice(2, 6);
    const pool = clubs.flatMap((c) => c.players.map((p) => ({ id: p.id, squadId: c.id, name: p.name })));
    const callUp = (teamId: string, k: number) => ({
      nation: state.teams[teamId]!.nation, from: meta.currentDate!, until: fixture.date, players: pool.slice(k * 23, k * 23 + 23),
    });
    await saveService.writeNationalState(saveId, {
      ...state,
      human: { [seatA]: { teamId: fixture.home, since: meta.currentDate!, wage: 20_000 } },
      callUps: { ...state.callUps, [fixture.home]: callUp(fixture.home, 0), [fixture.away]: callUp(fixture.away, 1) },
    });
    await saveService.updateMeta(saveId, { currentDate: fixture.date, world: runningWorld(a.user.id) });
  }, 300_000);

  afterAll(async () => {
    setKickScheduler(null);
    if (!saveId) return;
    await waitWorld(saveId);
    deleteSaveMembers(saveId);
    await saveService.deleteSave(saveId);
  }, 120_000);

  test("the recording is stored and read back as the match event", async () => {
    expect(fixture).toBeDefined();
    const recording = {
      fixtureId: fixture.id, score: { home: 2, away: 1 },
      teamStats: { home: {}, away: {} }, playerStats: {}, playerRatings: {}, playerEnergy: {},
      substitutions: [], durationMs: 1,
    };
    const sent = await callApi("POST", "/api/worlds/:saveId/live-recording", a.session.token, {
      params: { saveId }, body: { date: fixture.date, fixtureId: fixture.id, recording },
    });
    expect(sent.status).toBe(200);
    const got = await callApi("GET", "/api/worlds/:saveId/live-recording", a.session.token, { params: { saveId } });
    expect(got.status).toBe(200);
    expect(got.json.event.fixtureId).toBe(fixture.id);
    expect(got.json.event.score).toEqual({ home: 2, away: 1 });
    expect(got.json.event.home).toBe(fixture.home);
  }, 120_000);
});
