import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { emptyMarket } from "@/backend/negotiationWorld";
import { loadWindowContext, seatWindowRef } from "@/backend/marketWindowWorld";
import { callApi, createMultiWorld } from "@/backend/worlds/worldTestUtils";
import { contractDemand, evaluateContractOffer } from "@/Domain/contracts/contracts";
import { squadDepthBlocked } from "@/Domain/transfer/transferAcceptance";
import { addDays } from "@/Domain/dates";
import { HUMAN_MAX_SQUAD, MIN_BY_ROLE, roleOf } from "@/Domain/contracts/freeAgents";
import { parentLoanWages } from "@/Domain/negotiation/loans";
import { clubWage, wageFactorOf } from "@/Domain/finance/wages";
import { SEAT_OFFERS } from "@/Domain/seatOffers/seatOfferConfig";
import type { RosterPlayer } from "@/types/playerTypes";
import type { SeatOffer } from "@/types/seatOfferTypes";

type Login = ReturnType<typeof devAutoLogin>;

const LIST = "/api/saves/:saveId/seat-offers";
const ONE = "/api/saves/:saveId/seat-offers/:offerId";

/**
 * Offers between two human managers (`.claude/rules/game/multiplayer.md` → part 4): seat A (club 33, owner),
 * seat B (another Premier League club) and seat C (a third one), all through the routes.
 */
describe("seat offers: routes", () => {
  let id = "";
  let a: Login;
  let b: Login;
  let c: Login;
  let seatA = "";
  let seatB = "";
  let clubA = "";
  let clubB = "";
  let clubC = "";
  let aiClub = "";
  let startDate = "";
  const used = new Set<string>();

  const post = (token: string, pattern: string, body: unknown, offerId?: string) =>
    callApi("POST", pattern, token, { params: { saveId: id, ...(offerId ? { offerId } : {}) }, body });

  /** A player of `clubId` the deal can take: not on loan, not the last of his line, who signs for club A at his demand. */
  async function pick(clubId: string): Promise<{ player: RosterPlayer; demand: number }> {
    const squad = (await saveService.getSquadById(id, clubId))!;
    const buyer = (await saveService.getSquadById(id, clubA))!;
    const date = (await saveService.getMeta(id))!.currentDate!;
    const negotiation = (await saveService.getAchievements(id, seatA)).attributes.negotiation;
    for (const p of [...squad.players].reverse()) {
      if (used.has(p.id) || p.loan || p.age > 30 || squadDepthBlocked(p, squad, false)) continue;
      const ctx = { fromSquad: squad, negotiation };
      const demand = contractDemand(p, buyer, date, ctx);
      if (!evaluateContractOffer({ wage: demand, years: 2 }, p, buyer, date, ctx).accepted) continue;
      used.add(p.id);
      return { player: p, demand };
    }
    throw new Error(`no player to pick at ${clubId}`);
  }

  async function ledgerSum(seatId: string): Promise<number> {
    let sum = 0;
    for (const season of await saveService.listLedgerSeasons(id, seatId)) {
      for (const e of await saveService.getLedger(id, season, seatId)) sum += e.amount;
    }
    return sum;
  }
  const balanceOf = async (clubId: string) => (await saveService.getSquadById(id, clubId))!.finances?.budget ?? 0;

  beforeAll(async () => {
    a = devAutoLogin("h2h-routes-a@test.local");
    b = devAutoLogin("h2h-routes-b@test.local");
    c = devAutoLogin("h2h-routes-c@test.local");
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
    });
    id = meta.id;
    clubA = meta.clubId;
    seatA = await ownSolo(id, a.user.id);
    const premier = (await saveService.getSquadIndex(id)).inLeague("premier_league").filter((e) => e.squadId !== clubA);
    clubB = premier[0]!.squadId;
    clubC = premier[1]!.squadId;
    aiClub = premier[2]!.squadId;
    seatB = (await addSeat(id, { userId: b.user.id, clubId: clubB, manager: { name: "Técnico B", nationalityIso: "gb", backgroundId: "former-player" } })).seatId;
    await addSeat(id, { userId: c.user.id, clubId: clubC, manager: { name: "Técnico C", nationalityIso: "gb", backgroundId: "former-player" } });

    // A day the windows of A, B and C are all open.
    startDate = (await saveService.getMeta(id))!.currentDate!;
    const metas = await Promise.all((await saveService.listSeats(id)).map((s) => saveService.getSeatMeta(id, s.seatId)));
    const refs = metas.map((m) => seatWindowRef(m!));
    const ctx = await loadWindowContext((await saveService.getMeta(id))!, await saveService.getSquadIndex(id), startDate, refs);
    let day = startDate;
    for (let i = 0; i < 400 && !refs.every((r) => ctx.seat(r.seatId).on(day).open); i++) day = addDays(day, 1);
    if (day !== startDate) await saveService.updateMeta(id, { currentDate: day });
  }, 900_000);

  afterAll(async () => {
    if (startDate) await saveService.updateMeta(id, { currentDate: startDate });
    await saveService.deleteSave(id);
  }, 120_000);

  test("transfer: offer, counter, accept — the player moves, both ledgers sum to the balance, the clause is held", async () => {
    const { player, demand } = await pick(clubB);
    const r1 = await post(a.session.token, LIST, { kind: "transfer", playerId: player.id, fromSquadId: clubB, fee: 3_000_000, sellOnPct: 0, wage: demand, years: 2 });
    expect(r1.status).toBe(200);
    const offerId = r1.json.offer.id as string;
    expect(r1.json.offer.side).toBe("buyer");
    expect(r1.json.offer.otherManager).toBe("Técnico B");

    // B sees it, with its turn; A's view says it is not A's turn.
    const listB = await callApi("GET", LIST, b.session.token, { params: { saveId: id } });
    expect(listB.json.offers.map((o: { id: string; myTurn: boolean }) => [o.id, o.myTurn])).toEqual([[offerId, true]]);
    expect(listB.json.seatClubs.map((s: { clubId: string }) => s.clubId).sort()).toEqual([clubA, clubC].sort());

    expect((await post(a.session.token, ONE, { action: "accept" }, offerId)).status).toBe(403);
    const counter = await post(b.session.token, ONE, { action: "counter", fee: 4_000_000, sellOnPct: 10 }, offerId);
    expect(counter.status).toBe(200);
    expect(counter.json.status).toBe("countered");
    const acc = await post(a.session.token, ONE, { action: "accept" }, offerId);
    expect(acc.status).toBe(200);
    expect(acc.json.status).toBe("accepted");

    const moved = (await saveService.getSquadById(id, clubA))!.players.find((x) => x.id === player.id);
    expect(moved?.contract?.wage).toBe(demand);
    expect((await saveService.getSquadById(id, clubB))!.players.some((x) => x.id === player.id)).toBe(false);
    expect((await saveService.getMarket(id, seatB))!.sellOnHeld?.some((h) => h.playerId === player.id && h.pct === 10)).toBe(true);
    expect(await ledgerSum(seatA)).toBe(await balanceOf(clubA));
    expect(await ledgerSum(seatB)).toBe(await balanceOf(clubB));
    expect(await saveService.getSeatOffers(id)).toEqual([]);
  }, 300_000);

  test("loan: offer and accept — in both markets", async () => {
    const { player } = await pick(clubB);
    const r1 = await post(a.session.token, LIST, { kind: "loan", playerId: player.id, fromSquadId: clubB, wageShare: 50, fee: 0 });
    expect(r1.status).toBe(200);
    expect(r1.json.offer.terms.wageShare).toBe(0.5);
    const acc = await post(b.session.token, ONE, { action: "accept" }, r1.json.offer.id);
    expect(acc.status).toBe(200);
    expect((await saveService.getSquadById(id, clubA))!.players.find((x) => x.id === player.id)?.loan?.fromClubId).toBe(clubB);
    expect((await saveService.getMarket(id, seatA))!.loans?.some((l) => l.playerId === player.id)).toBe(true);
    expect((await saveService.getMarket(id, seatB))!.loans?.some((l) => l.playerId === player.id)).toBe(true);
    expect(await ledgerSum(seatA)).toBe(await balanceOf(clubA));
    expect(await ledgerSum(seatB)).toBe(await balanceOf(clubB));

    // The Monday `wages` line (`computeAdvanceDayMoney`): the borrower pays the agreed half, the lender only the
    // part that was not agreed (`parentLoanWages`, read from the lender's market) — together, the whole wage.
    const loan = (await saveService.getMarket(id, seatB))!.loans!.find((l) => l.playerId === player.id)!;
    const borrowed = (await saveService.getSquadById(id, clubA))!;
    const there = borrowed.players.find((x) => x.id === player.id)!;
    const borrowerPart = clubWage(there, wageFactorOf(borrowed));
    const lenderPart = parentLoanWages((await saveService.getMarket(id, seatB))!.loans, clubB);
    expect(borrowerPart).toBe(Math.round(loan.wage * 0.5));
    expect(lenderPart).toBe(Math.round(loan.wage * 0.5));
    expect(parentLoanWages((await saveService.getMarket(id, seatA))!.loans, clubA)).toBe(0);
  }, 300_000);

  test("refusals: alreadyOffered, the player's contract, an AI club or own club (404), a third seat (404)", async () => {
    const { player, demand } = await pick(clubB);
    const body = { kind: "transfer", playerId: player.id, fromSquadId: clubB, fee: 1_000_000, wage: demand, years: 2 };
    const ok = await post(a.session.token, LIST, body);
    expect(ok.status).toBe(200);
    const again = await post(a.session.token, LIST, body);
    expect(again.status).toBe(409);
    expect(again.json.error).toBe("alreadyOffered");

    const other = await pick(clubB);
    const low = await post(a.session.token, LIST, { ...body, playerId: other.player.id, wage: 1 });
    expect(low.status).toBe(400);
    expect(low.json.error).toBe("lowWage");
    expect(low.json.demand).toBe(other.demand);

    const aiPlayer = (await saveService.getSquadById(id, aiClub))!.players[0]!;
    expect((await post(a.session.token, LIST, { ...body, playerId: aiPlayer.id, fromSquadId: aiClub })).status).toBe(404);
    const own = (await saveService.getSquadById(id, clubA))!.players[0]!;
    expect((await post(a.session.token, LIST, { ...body, playerId: own.id, fromSquadId: clubA })).status).toBe(404);
    expect((await post(a.session.token, LIST, { ...body, playerId: "nobody" })).status).toBe(404);

    // C is not a party: it neither sees nor answers the offer.
    const listC = await callApi("GET", LIST, c.session.token, { params: { saveId: id } });
    expect(listC.json.offers).toEqual([]);
    expect((await post(c.session.token, ONE, { action: "reject" }, ok.json.offer.id)).status).toBe(404);
    expect((await post(a.session.token, ONE, { action: "withdraw" }, ok.json.offer.id)).status).toBe(200);
  }, 300_000);

  test("withdraw by the buyer only; 3 counters then noRounds; reject closes", async () => {
    const { player, demand } = await pick(clubB);
    const body = { kind: "transfer", playerId: player.id, fromSquadId: clubB, fee: 1_000_000, wage: demand, years: 2 };
    const o1 = (await post(a.session.token, LIST, body)).json.offer.id as string;
    const byB = await post(b.session.token, ONE, { action: "withdraw" }, o1);
    expect(byB.status).toBe(403);
    expect(byB.json.error).toBe("notYourTurn");
    const w = await post(a.session.token, ONE, { action: "withdraw" }, o1);
    expect(w.json.status).toBe("withdrawn");
    expect(await saveService.getSeatOffers(id)).toEqual([]);

    const o2 = (await post(a.session.token, LIST, body)).json.offer.id as string;
    expect((await post(b.session.token, ONE, { action: "counter", fee: 3_000_000 }, o2)).status).toBe(200);
    expect((await post(a.session.token, ONE, { action: "counter", fee: 2_000_000 }, o2)).status).toBe(200);
    expect((await post(b.session.token, ONE, { action: "counter", fee: 2_500_000 }, o2)).status).toBe(200);
    const fourth = await post(a.session.token, ONE, { action: "counter", fee: 2_200_000 }, o2);
    expect(fourth.status).toBe(409);
    expect(fourth.json.error).toBe("noRounds");
    const bad = await post(b.session.token, ONE, { action: "nope" }, o2);
    expect(bad.status).toBe(400);
    const rej = await post(a.session.token, ONE, { action: "reject" }, o2);
    expect(rej.json.status).toBe("rejected");
    expect(await saveService.getSeatOffers(id)).toEqual([]);
  }, 300_000);

  test("accept closes the other seat's offer and the AI bid for the same player", async () => {
    const { player, demand } = await pick(clubB);
    const date = (await saveService.getMeta(id))!.currentDate!;
    const market = (await saveService.getMarket(id, seatB)) ?? emptyMarket();
    await saveService.saveMarket(id, {
      ...market,
      pendingBids: [...(market.pendingBids ?? []), {
        id: "ai-bid-same-player", kind: "transfer", playerId: player.id, playerName: player.name,
        clubId: aiClub, clubName: "AI", date, expires: addDays(date, 3), fee: 1_000_000, maxFee: 1_000_000,
      }],
    }, seatB);
    const body = { kind: "transfer", playerId: player.id, fromSquadId: clubB, fee: 1_000_000, wage: demand * 3, years: 2 };
    const fromA = (await post(a.session.token, LIST, body)).json.offer.id as string;
    const fromC = await post(c.session.token, LIST, body);
    expect(fromC.status).toBe(200);
    expect((await post(b.session.token, ONE, { action: "accept" }, fromA)).status).toBe(200);
    expect(await saveService.getSeatOffers(id)).toEqual([]);
    expect((await saveService.getMarket(id, seatB))!.pendingBids?.some((x) => x.playerId === player.id)).toBe(false);
    expect((await post(c.session.token, ONE, { action: "withdraw" }, fromC.json.offer.id)).status).toBe(404);
  }, 300_000);

  test("tooManyOffers: the buyer already has 10 open offers", async () => {
    const { player, demand } = await pick(clubB);
    const date = (await saveService.getMeta(id))!.currentDate!;
    const terms = { fee: 1_000_000, sellOnPct: 0, wage: 10_000, years: 2 };
    const clubName = (cid: string) => saveService.getSquadById(id, cid).then((s) => s!.name);
    const seller = { seatId: seatB, clubId: clubB, clubName: await clubName(clubB) };
    const buyer = { seatId: seatA, clubId: clubA, clubName: await clubName(clubA) };
    const open: SeatOffer[] = Array.from({ length: SEAT_OFFERS.MAX_OPEN_SENT }, (_, i) => ({
      id: `full-${i}`, kind: "transfer", playerId: `fake-${i}`, playerName: `Fake ${i}`, seller, buyer, date,
      expires: addDays(date, 3), turn: "seller", counters: 0, terms, history: [{ by: "buyer", action: "offer", date, terms }],
    }));
    await saveService.writeSeatOffers(id, open);
    try {
      const r = await post(a.session.token, LIST, { kind: "transfer", playerId: player.id, fromSquadId: clubB, fee: 1_000_000, wage: demand, years: 2 });
      expect(r.status).toBe(409);
      expect(r.json.error).toBe("tooManyOffers");
    } finally {
      await saveService.writeSeatOffers(id, []);
    }
  }, 300_000);

  test("windowClosed: the buyer's window is closed", async () => {
    const { player, demand } = await pick(clubB);
    const open = (await saveService.getMeta(id))!.currentDate!;
    const metaA = (await saveService.getSeatMeta(id, seatA))!;
    const ctx = await loadWindowContext((await saveService.getMeta(id))!, await saveService.getSquadIndex(id), open, [seatWindowRef(metaA)]);
    let day = open;
    for (let i = 0; i < 400 && ctx.seat(seatA).on(day).open; i++) day = addDays(day, 1);
    expect(ctx.seat(seatA).on(day).open).toBe(false);
    await saveService.updateMeta(id, { currentDate: day });
    try {
      const r = await post(a.session.token, LIST, { kind: "transfer", playerId: player.id, fromSquadId: clubB, fee: 1_000_000, wage: demand, years: 2 });
      expect(r.status).toBe(409);
      expect(r.json.error).toBe("windowClosed");
      expect(await saveService.getSeatOffers(id)).toEqual([]);
    } finally {
      await saveService.updateMeta(id, { currentDate: open });
    }
  }, 300_000);

  test("squadDepth: the sale would leave the seller below a line's minimum", async () => {
    const original = (await saveService.getSquadById(id, clubB))!;
    const keepers = original.players.filter((p) => roleOf(p) === "GK" && !p.loan);
    const kept = new Set(keepers.slice(0, MIN_BY_ROLE.GK).map((p) => p.id));
    const trimmed = { ...original, players: original.players.filter((p) => roleOf(p) !== "GK" || kept.has(p.id)) };
    const target = trimmed.players.find((p) => kept.has(p.id))!;
    expect(squadDepthBlocked(target, trimmed, false)).toBe(true);
    await saveService.saveSquadById(id, trimmed);
    try {
      const r = await post(a.session.token, LIST, { kind: "transfer", playerId: target.id, fromSquadId: clubB, fee: 1_000_000, wage: 100_000, years: 2 });
      expect(r.status).toBe(409);
      expect(r.json.error).toBe("squadDepth");
      expect(await saveService.getSeatOffers(id)).toEqual([]);
    } finally {
      await saveService.saveSquadById(id, original);
    }
  }, 300_000);

  test("squadFull: refused when made; on accept the offer stays (409) and goes through once there is room", async () => {
    const { player, demand } = await pick(clubB);
    const body = { kind: "transfer", playerId: player.id, fromSquadId: clubB, fee: 1_000_000, wage: demand, years: 2 };
    const original = (await saveService.getSquadById(id, clubA))!;
    const market = await saveService.getMarket(id, seatA);
    const out = (market?.loans ?? []).filter((l) => l.fromClubId === clubA).length;
    const filler = original.players.find((p) => !p.loan)!;
    const extra = Array.from({ length: Math.max(0, HUMAN_MAX_SQUAD - original.players.length - out) }, (_, i) => ({ ...filler, id: `filler-${i}` }));
    const full = { ...original, players: [...original.players, ...extra] };

    await saveService.saveSquadById(id, full);
    try {
      const made = await post(a.session.token, LIST, body);
      expect(made.status).toBe(409);
      expect(made.json.error).toBe("squadFull");
      expect(await saveService.getSeatOffers(id)).toEqual([]);
    } finally {
      await saveService.saveSquadById(id, original);
    }

    const offerId = (await post(a.session.token, LIST, body)).json.offer.id as string;
    await saveService.saveSquadById(id, full);
    try {
      const acc = await post(b.session.token, ONE, { action: "accept" }, offerId);
      expect(acc.status).toBe(409);
      expect(acc.json.error).toBe("squadFull");
      expect((await saveService.getSeatOffers(id)).map((o) => o.id)).toEqual([offerId]);
    } finally {
      await saveService.saveSquadById(id, original);
    }
    expect((await post(b.session.token, ONE, { action: "accept" }, offerId)).status).toBe(200);
    expect((await saveService.getSquadById(id, clubA))!.players.some((x) => x.id === player.id)).toBe(true);
  }, 300_000);

  test("contractRefused: terms the player no longer takes close the offer on accept", async () => {
    const { player, demand } = await pick(clubB);
    const offerId = (await post(a.session.token, LIST, {
      kind: "transfer", playerId: player.id, fromSquadId: clubB, fee: 1_000_000, wage: demand, years: 2,
    })).json.offer.id as string;
    // The file now carries a wage far below his demand (as if his demand had risen since the offer).
    const offers = await saveService.getSeatOffers(id);
    await saveService.writeSeatOffers(id, offers.map((o) => (o.id === offerId ? { ...o, terms: { ...o.terms, wage: 1 } } : o)));
    const acc = await post(b.session.token, ONE, { action: "accept" }, offerId);
    expect(acc.status).toBe(409);
    expect(acc.json.error).toBe("contractRefused");
    expect(acc.json.reason).toBe("lowWage");
    expect(await saveService.getSeatOffers(id)).toEqual([]);
    expect((await saveService.getSquadById(id, clubB))!.players.some((x) => x.id === player.id)).toBe(true);
  }, 300_000);

  test("413 over 8 KB", async () => {
    const big = await post(a.session.token, LIST, { kind: "transfer", pad: "x".repeat(9000) });
    expect(big.status).toBe(413);
  });
});

describe("seat offers: lobby", () => {
  test("a lobby world refuses with 409 lobby", async () => {
    const owner = devAutoLogin("h2h-routes-lobby@test.local");
    const created = await createMultiWorld(owner.session.token);
    expect([200, 201]).toContain(created.status);
    const saveId = created.json.id as string;
    try {
      const r = await callApi("POST", LIST, owner.session.token, { params: { saveId }, body: { kind: "transfer" } });
      expect(r.status).toBe(409);
      expect(r.json.error).toBe("lobby");
      const r2 = await callApi("POST", ONE, owner.session.token, { params: { saveId, offerId: "x" }, body: { action: "accept" } });
      expect(r2.status).toBe(409);
    } finally {
      await saveService.deleteSave(saveId);
    }
  }, 900_000);
});
