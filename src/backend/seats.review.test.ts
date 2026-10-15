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

  test("2. the seat's club leaves the AI market; a bid or a rival in its name closes", async () => {
    const id = meta.id;
    expect((await saveService.getWorldMarket(id))?.profiles[clubD]).toBeUndefined();
    const date = (await saveService.getMeta(id))!.currentDate!;
    const mine = (await saveService.getSquadById(id, meta.clubId))!;
    const player = mine.players[mine.players.length - 1]!;
    const market = (await saveService.getMarket(id, meta.seatId)) ?? emptyMarket();
    await saveService.saveMarket(id, {
      ...market,
      pendingBids: [{ id: "bid-from-d", kind: "transfer", playerId: player.id, playerName: player.name, clubId: clubD, clubName: "D", date, expires: date, fee: 1_000_000, maxFee: 1_000_000 }],
    }, meta.seatId);
    const res = await call("/api/saves/:saveId/bids/:bidId", `/api/saves/${id}/bids/bid-from-d`, "POST", a.session.token,
      { saveId: id, bidId: "bid-from-d" }, { action: "accept" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("offerClosed");
    expect((await saveService.getSquadById(id, meta.clubId))!.players.some((q) => q.id === player.id)).toBe(true);

    // A rival in D's name for an AI player A is after: discarded on its deadline, nobody moves.
    const target = (await saveService.getSquadById(id, aiClub))!.players[0]!;
    // Room in D's squad, so only the human rule can stop the move.
    const squadD = (await saveService.getSquadById(id, clubD))!;
    const lastFwd = [...squadD.players].reverse().filter((q) => q.positions[0] !== "GK").slice(0, 3).map((q) => q.id);
    await saveService.saveSquadById(id, { ...squadD, players: squadD.players.filter((q) => !lastFwd.includes(q.id)) });
    const seatMeta = (await saveService.getSeatMeta(id, meta.seatId))!;
    const windows = await loadWindowContext(seatMeta, await saveService.getSquadIndex(id), undefined, [seatWindowRef(seatMeta)]);
    const out = await resolveRivalDeadlines(saveService, id, meta.seatId, seatMeta, {
      market: { ...emptyMarket(), rivalBids: [{ playerId: target.id, playerName: target.name, fromClubId: aiClub, clubId: clubD, clubName: "D", fee: 1, wage: 1, date, deadline: date, sellerAccepts: true }] },
      date, windows,
    });
    expect(out.moves).toEqual([]);
    expect((await saveService.getSquadById(id, aiClub))!.players.some((q) => q.id === target.id)).toBe(true);
  });

  test("3. an offer from a club that already has a seat closes (409)", async () => {
    const id = meta.id;
    const date = (await saveService.getMeta(id))!.currentDate!;
    await saveService.updateSeat(id, meta.seatId, { jobOffers: [offerFor(clubD, date, "offer-d")] });
    const res = await call("/api/saves/:saveId/jobs/:offerId", `/api/saves/${id}/jobs/offer-d`, "POST", a.session.token,
      { saveId: id, offerId: "offer-d" }, { accept: true });
    expect(res.status).toBe(409);
    expect((await saveService.getSeat(id, meta.seatId))?.clubId).toBe(meta.clubId);
    expect((await saveService.getSeat(id, meta.seatId))?.jobOffers ?? []).toEqual([]);
  });

  test("4. a sell-on clause held by another seat is paid into that seat's ledger", async () => {
    const id = meta.id;
    const squadBefore = (await saveService.getSquadById(id, clubD))!;
    const marketD = (await saveService.getMarket(id, seatD.seatId)) ?? emptyMarket();
    await saveService.saveMarket(id, {
      ...marketD, sellOnHeld: [{ playerId: "sold-by-d", playerName: "Sold", pct: 20, toClubName: "X", date: meta.currentDate! }],
    }, seatD.seatId);
    const seatMeta = (await saveService.getSeatMeta(id, meta.seatId))!;
    await paySellOnReceiver(saveService, id, seatMeta, clubD, 750_000, { playerName: "Sold", playerId: "sold-by-d", fromClubName: "A" });
    const squadAfter = (await saveService.getSquadById(id, clubD))!;
    expect((squadAfter.finances?.budget ?? 0) - (squadBefore.finances?.budget ?? 0)).toBe(750_000);
    expect(squadAfter.aiTransferBudget).toBeUndefined();
    let found = false;
    for (const season of await saveService.listLedgerSeasons(id, seatD.seatId)) {
      for (const e of await saveService.getLedger(id, season, seatD.seatId)) {
        if (e.kind === "transfer_in" && e.ref?.stage === "sell_on" && e.amount === 750_000) found = true;
      }
    }
    expect(found).toBe(true);
    expect((await saveService.getMarket(id, seatD.seatId))?.sellOnHeld ?? []).toEqual([]);
  });

  test("6. a legend brought back by one seat is gone for the others (and its reborn offer closes)", async () => {
    const id = meta.id;
    const date = (await saveService.getMeta(id))!.currentDate!;
    const source = (await saveService.getSquadById(id, aiClub))!.players[1]!;
    const legend: RetiredPlayer = {
      id: "legend-test", name: "Legend", nationality: source.nationality ?? null, positions: source.positions,
      preferredFoot: source.preferredFoot, profile: source.profile, retiredOn: date, squadId: clubD, age: 36,
      wasWorldClass: true, statsAtRetirement: source.stats, appearances: 10, goals: 1,
      rebornOffer: "pending", rebornSeatId: seatD.seatId,
    };
    await saveService.writeRetired(id, [...(await saveService.getRetired(id)), legend]);
    for (const seatId of [meta.seatId, seatD.seatId]) {
      const state = await saveService.getAchievements(id, seatId);
      await saveService.writeAchievements(id, { ...state, spent: -10_000, legendOptions: { date, ids: [legend.id] } }, seatId);
    }
    const buy = (who: Login) => call("/api/saves/:saveId/achievements/shop/legend", `/api/saves/${id}/achievements/shop/legend`, "POST",
      who.session.token, { saveId: id }, { retiredId: legend.id });
    expect((await buy(a)).status).toBe(200);
    const after = (await saveService.getRetired(id)).find((r) => r.id === legend.id)!;
    expect(after.legendBy).toBe(meta.seatId);
    expect(after.rebornOffer).toBe("expired");
    expect((await buy(d)).status).toBe(400);
  });

  test("7. only the owner presimulates, once per world", async () => {
    const id = meta.id;
    const pre = (who: Login) => call("/api/saves/:saveId/presimulate", `/api/saves/${id}/presimulate`, "POST", who.session.token, { saveId: id });
    expect((await pre(d)).status).toBe(403);
    expect((await pre(a)).status).toBe(200);
    expect((await saveService.getMeta(id))?.presimulated).toBe(true);
    const inboxBefore = (await saveService.getInbox(id, meta.seatId)).length;
    const again = await pre(a);
    expect(again.status).toBe(200);
    expect((await again.json()).applied).toBe(false);
    expect((await saveService.getInbox(id, meta.seatId)).length).toBe(inboxBefore);
  }, 300_000);



  test("3. a club taken by a seat leaves the other seats' offers", async () => {
    const id = meta.id;
    const date = (await saveService.getMeta(id))!.currentDate!;
    await saveService.updateSeat(id, meta.seatId, { jobOffers: [offerFor(aiClub, date, "offer-x")] });
    await addSeat(id, {
      userId: devAutoLogin("seat-review-e@test.local").user.id, clubId: aiClub,
      manager: { name: "Técnico E", nationalityIso: "br", backgroundId: "former-player" },
    });
    expect((await saveService.getSeat(id, meta.seatId))?.jobOffers ?? []).toEqual([]);
  }, 300_000);
});
