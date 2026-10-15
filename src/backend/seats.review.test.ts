import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService, type SeatMeta } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { paySellOnReceiver } from "@/backend/FinancialService";
import { resolveRivalDeadlines } from "@/backend/rivalWorld";
import { loadWindowContext, seatWindowRef } from "@/backend/marketWindowWorld";
import { emptyMarket } from "@/backend/negotiationWorld";
import type { SeatContext } from "@/types/seatTypes";
import type { JobOffer } from "@/types/jobTypes";
import type { RetiredPlayer } from "@/types/playerTypes";

type Login = ReturnType<typeof devAutoLogin>;

const call = (key: string, path: string, method: string, token: string, params: Record<string, string>, body?: unknown) => {
  const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
  return handler(Object.assign(
    new Request(`http://localhost${path}`, {
      method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params },
  ));
};

const offerFor = (squadId: string, date: string, id: string): JobOffer => ({
  id, squadId, clubName: squadId, leagueSlug: "premier_league", leagueName: "Premier League", window: "season_end",
  date, expires: date, objective: null, budget: 1_000_000, expectedPosition: 10, leagueSize: 20, prestige: 0.5,
});

/**
 * Review fixes of the seats (`.claude/rules/game/multiplayer.md`): seat A on club 33 (createSave, owner) and seat D
 * on another Premier League club (member). Nothing of one seat's club is decided by the AI rule for the other.
 */
describe("seats: review fixes", () => {
  let meta: SeatMeta;
  let seatD: SeatContext;
  let a: Login;
  let d: Login;
  let clubD: string;
  let aiClub: string;

  beforeAll(async () => {
    a = devAutoLogin("seat-review-a@test.local");
    d = devAutoLogin("seat-review-d@test.local");
    meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
    });
    await ownSolo(meta.id, a.user.id);
    const premier = (await saveService.getSquadIndex(meta.id)).inLeague("premier_league").filter((e) => e.squadId !== meta.clubId);
    clubD = premier[0]!.squadId;
    aiClub = premier[1]!.squadId;
    // A stale AI profile of the club that is about to get a seat.
    const world = (await saveService.getWorldMarket(meta.id)) ?? { shuffledTeamIds: [], rotationIndex: 0, profiles: {} };
    await saveService.saveWorldMarket(meta.id, {
      ...world, profiles: { ...world.profiles, [clubD]: { squadId: clubD, needs: [], sellList: [], lastUpdateDay: meta.currentDate! } },
    });
    seatD = await addSeat(meta.id, {
      userId: d.user.id, clubId: clubD,
      manager: { name: "Técnico D", nationalityIso: "gb", backgroundId: "former-player" },
    });
  }, 900_000);

  afterAll(async () => { await saveService.deleteSave(meta.id); }, 120_000);

  test("1. buying, borrowing or pre-signing a player of another seat's club is refused (404)", async () => {
    const id = meta.id;
    const p = { saveId: id };
    const player = (await saveService.getSquadById(id, clubD))!.players[0]!;
    const buy = await call("/api/saves/:saveId/transfers", `/api/saves/${id}/transfers`, "POST", a.session.token, p,
      { playerId: player.id, fromSquadId: clubD, fee: 1_000_000 });
    expect(buy.status).toBe(404);
    const loan = await call("/api/saves/:saveId/loans", `/api/saves/${id}/loans`, "POST", a.session.token, p,
      { playerId: player.id, fromSquadId: clubD, wageShare: 100, fee: 0 });
    expect(loan.status).toBe(404);
    const pre = await call("/api/saves/:saveId/pre-contracts", `/api/saves/${id}/pre-contracts`, "POST", a.session.token, p,
      { playerId: player.id, fromSquadId: clubD, wage: 50_000, years: 2 });
    expect(pre.status).toBe(404);
    expect((await saveService.getSquadById(id, clubD))!.players.some((q) => q.id === player.id)).toBe(true);
  });








});
