/**
 * Two managers coaching both national teams of a game (9.6): the game counts as seat against seat, the preview
 * offers the live match (409 without `h2h`, 200 with it), and "Simular" decides it for both.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addSeat } from "@/backend/seats";
import { ensureNationalWorld } from "@/backend/nationalWorld";
import { fixtureSeats, seatVsSeat } from "@/backend/groupAdvance";
import { matchSetupFor } from "@/backend/matchSetup";
import { simulateSeatGame } from "@/backend/h2h/h2hRooms";
import type { Fixture } from "@/types/calendarTypes";

describe("live national game between two managers", () => {
  let saveId = "";
  let seatA = "";
  let seatB = "";
  let fixture: Fixture;

  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    seatA = meta.seatId;
    const clubB = (await saveService.getSquadsInLeague(saveId, "premier_league")).find((s) => s.id !== "33")!.id;
    const b = await addSeat(saveId, {
      userId: devAutoLogin("nat-h2h-b@test.local").user.id, clubId: clubB,
      manager: { name: "Friend", nationalityIso: "es", backgroundId: "former-player" },
    });
    seatB = b.seatId;
    await ensureNationalWorld({ service: saveService, saveId, today: meta.currentDate!, index: await saveService.getSquadIndex(saveId) });
    const state = (await saveService.getNationalState(saveId))!;
    let found: Fixture | undefined;
    for (const slug of state.competitions) {
      const c = await saveService.getNationalComp(saveId, slug);
      found = c?.fixtures.filter((f) => !f.played && f.date >= meta.currentDate!).sort((x, y) => x.date.localeCompare(y.date))[0];
      if (found) break;
    }
    fixture = found!;
    const coach = (teamId: string) => ({ teamId, since: meta.currentDate!, wage: 20_000 });
    // A call-up of 23 for each side, players of two clubs of the league.
    const clubs = (await saveService.getSquadsInLeague(saveId, "premier_league")).slice(2, 6);
    const pool = clubs.flatMap((c) => c.players.map((p) => ({ id: p.id, squadId: c.id, name: p.name })));
    const callUp = (teamId: string, k: number) => ({
      nation: state.teams[teamId]!.nation, from: meta.currentDate!, until: fixture.date, players: pool.slice(k * 23, k * 23 + 23),
    });
    await saveService.writeNationalState(saveId, {
      ...state,
      human: { [seatA]: coach(fixture.home), [seatB]: coach(fixture.away) },
      callUps: { ...state.callUps, [fixture.home]: callUp(fixture.home, 0), [fixture.away]: callUp(fixture.away, 1) },
    });
    await saveService.updateMeta(saveId, { currentDate: fixture.date });
  }, 300_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("the seats of each side, the preview and Simular", async () => {
    expect(fixture).toBeDefined();
    expect(await fixtureSeats(saveService, saveId, fixture)).toEqual({ home: seatA, away: seatB });
    expect(await seatVsSeat(saveService, saveId, fixture)).toBe(true);

    const metaA = (await saveService.getSeatMeta(saveId, seatA))!;
    // Only when no club game of his falls on the same day.
    const clubToday = (await saveService.getFixturesForDate(saveId, fixture.date)).some((f) => !f.played && (f.home === "33" || f.away === "33"));
    if (!clubToday) {
      const preview = await matchSetupFor(metaA, { live: false });
      expect(preview.ok).toBe(true);
      expect((preview.body as { seatOpponent?: boolean }).seatOpponent).toBe(true);
      const live = await matchSetupFor(metaA, { live: true });
      expect(live.ok ? 200 : live.status).toBe(409);
      expect((live.body as { error?: string }).error).toBe("seatOpponent");
      const h2h = await matchSetupFor(metaA, { live: true, h2h: true });
      expect(h2h.ok).toBe(true);
      expect((h2h.body as { h2h?: boolean }).h2h).toBe(true);
    }

    await simulateSeatGame(saveService, saveId, fixture.date, fixture);
    expect((await saveService.getSeat(saveId, seatA))?.matchDecision).toEqual({ date: fixture.date, fixtureId: fixture.id, mode: "simulate" });
    expect((await saveService.getSeat(saveId, seatB))?.matchDecision).toEqual({ date: fixture.date, fixtureId: fixture.id, mode: "simulate" });
  }, 240_000);
});
