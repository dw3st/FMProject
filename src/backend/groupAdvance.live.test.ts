import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { runningWorld } from "@/backend/testing/worldFixtures";
import { callApi } from "@/backend/worlds/worldTestUtils";
import { addSeat } from "@/backend/seats";
import { kickWorld, setKickScheduler, waitWorld } from "@/backend/groupAdvance";
import { addDays } from "@/Domain/dates";
import type { Fixture } from "@/types/calendarTypes";

/**
 * Two seats in the Premier League, the world one day before a round where both play the AI. Real days (about 3 s each):
 * the eve, the match day (A live, B simulated) and the day after.
 */
describe("group advance with real days", () => {
  let saveId = "";
  let seatA = "";
  let seatB = "";
  let matchA: Fixture;
  let matchB: Fixture;
  let a: ReturnType<typeof devAutoLogin>;
  let b: ReturnType<typeof devAutoLogin>;

  const post = (route: string, token: string, body: unknown) =>
    callApi("POST", `/api/worlds/:saveId/${route}`, token, { params: { saveId }, body });

  beforeAll(async () => {
    setKickScheduler(() => {});
    a = devAutoLogin("ga-live-a@test.local");
    b = devAutoLogin("ga-live-b@test.local");
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
    });
    saveId = meta.id;
    seatA = await ownSolo(saveId, a.user.id);
    const all = await saveService.getAllFixturesForLeague(saveId, "premier_league");
    matchA = all
      .filter((f) => !f.played && (f.home === "33" || f.away === "33") && f.date > addDays(meta.currentDate!, 3))
      .sort((x, y) => x.date.localeCompare(y.date))[0]!;
    const oppA = matchA.home === "33" ? matchA.away : matchA.home;
    const foundB = all.find((f) => f.date === matchA.date && ![f.home, f.away].some((c) => c === "33" || c === oppA));
    if (!foundB) throw new Error(`calendar has no second Premier League game on ${matchA.date} for seat B`);
    matchB = foundB;
    seatB = (await addSeat(saveId, {
      userId: b.user.id, clubId: matchB.home,
      manager: { name: "Técnico B", nationalityIso: "br", backgroundId: "former-player" },
    })).seatId;
    await saveService.updateMeta(saveId, { currentDate: addDays(matchA.date, -1), world: runningWorld(a.user.id) });
    await saveService.updateSeat(saveId, seatA, { readyUntil: addDays(matchA.date, 2) });
    await saveService.updateSeat(saveId, seatB, { readyUntil: addDays(matchA.date, 2) });
  }, 300_000);

  afterAll(async () => {
    setKickScheduler(null);
    await waitWorld(saveId);
    deleteSaveMembers(saveId);
    await saveService.deleteSave(saveId);
  }, 120_000);

  test("stops on the match day, plays the live recording there and goes on", async () => {
    const first = await kickWorld(saveId);
    expect(first.error).toBeUndefined();
    expect(first.days).toBe(1);
    expect(first.date).toBe(matchA.date);
    expect([...first.waitingFor].sort()).toEqual([seatA, seatB].sort());

    const recording = {
      fixtureId: matchA.id, score: { home: 2, away: 1 },
      teamStats: { home: {}, away: {} }, playerStats: {}, playerRatings: {}, playerEnergy: {},
      substitutions: [], durationMs: 1,
    };
    const live = await post("live-recording", a.session.token, { date: matchA.date, fixtureId: matchA.id, recording });
    expect(live.status).toBe(200);
    const sim = await post("match-decision", b.session.token, { date: matchA.date, fixtureId: matchB.id, mode: "simulate" });
    expect(sim.status).toBe(200);

    const second = await kickWorld(saveId);
    expect(second.error).toBeUndefined();
    expect(second.date).toBe(addDays(matchA.date, 2));

    const played = (await saveService.getAllFixturesForLeague(saveId, "premier_league")).find((f) => f.id === matchA.id)!;
    expect(played.played).toBe(true);
    expect(played.result).toEqual({ home: 2, away: 1 });
    const playedB = (await saveService.getAllFixturesForLeague(saveId, "premier_league")).find((f) => f.id === matchB.id)!;
    expect(playedB.played).toBe(true);
    expect((await saveService.getSeat(saveId, seatB))!.matchDecision).toBeUndefined();
    expect(await saveService.getLiveRecording(saveId, seatA)).toBeNull();
    expect((await saveService.getSeat(saveId, seatA))!.matchDecision).toBeUndefined();
    expect((await saveService.getPendingSummary(saveId, seatA)).map((d) => d.date))
      .toEqual([addDays(matchA.date, -1), matchA.date, addDays(matchA.date, 1)]);
  }, 300_000);
});
