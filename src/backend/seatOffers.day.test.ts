import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat, removeSeat } from "@/backend/seats";
import { runBufferedDay } from "@/backend/advanceDay";
import { releaseHumanClub } from "@/backend/jobWorld";
import { emptyMarket, startLoan } from "@/backend/negotiationWorld";
import { loadWindowContext, seatWindowRef } from "@/backend/marketWindowWorld";
import { squadDepthBlocked } from "@/Domain/transfer/transferAcceptance";
import { addDays } from "@/Domain/dates";
import type { SeatOffer, SeatOfferParty } from "@/types/seatOfferTypes";
import type { InboxMessage } from "@/types/inboxTypes";

/**
 * Offers between seats outside the routes (`.claude/rules/game/multiplayer.md` → part 4): the day drops the expired
 * ones, a seat that leaves its club (sacking, club change) or the league closes its offers, and a seat leaving the
 * league ends its loans with another seat in both markets.
 */
describe("seat offers: day, club change, leaving", () => {
  let id = "";
  let seatA = "";
  let seatB = "";
  let seatC = "";
  let clubA = "";
  let clubB = "";
  let clubC = "";

  async function party(seatId: string, clubId: string): Promise<SeatOfferParty> {
    return { seatId, clubId, clubName: (await saveService.getSquadById(id, clubId))!.name };
  }

  /** A transfer offer of `buyer` for a player of `seller` that the world allows (never the last of his line). */
  async function offer(offerId: string, seller: SeatOfferParty, buyer: SeatOfferParty, date: string, expires: string, skip: Set<string>): Promise<SeatOffer> {
    const squad = (await saveService.getSquadById(id, seller.clubId))!;
    const player = [...squad.players].reverse().find((p) => !p.loan && !skip.has(p.id) && !squadDepthBlocked(p, squad, false))!;
    skip.add(player.id);
    const terms = { fee: 1_000_000, sellOnPct: 0, wage: 10_000, years: 2 };
    return {
      id: offerId, kind: "transfer", playerId: player.id, playerName: player.name, seller, buyer, date, expires,
      turn: "seller", counters: 0, terms, history: [{ by: "buyer", action: "offer", date, terms }],
    };
  }

  const seatOfferMessages = async (seatId: string, offerId: string): Promise<InboxMessage[]> =>
    (await saveService.getInbox(id, seatId)).filter((m) => {
      const t = m as { kind?: string; offerId?: string };
      return m.category === "transfer" && t.kind === "seat_offer" && t.offerId === offerId;
    });

  beforeAll(async () => {
    const a = devAutoLogin("h2h-day-a@test.local");
    const b = devAutoLogin("h2h-day-b@test.local");
    const c = devAutoLogin("h2h-day-c@test.local");
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
    const manager = { nationalityIso: "gb", backgroundId: "former-player" } as const;
    seatB = (await addSeat(id, { userId: b.user.id, clubId: clubB, manager: { name: "B", ...manager } })).seatId;
    seatC = (await addSeat(id, { userId: c.user.id, clubId: clubC, manager: { name: "C", ...manager } })).seatId;

    // A day every window is open (an offer whose buyer's window is closed expires).
    const start = (await saveService.getMeta(id))!.currentDate!;
    const metas = await Promise.all((await saveService.listSeats(id)).map((s) => saveService.getSeatMeta(id, s.seatId)));
    const refs = metas.map((m) => seatWindowRef(m!));
    const ctx = await loadWindowContext((await saveService.getMeta(id))!, await saveService.getSquadIndex(id), start, refs);
    let day = start;
    for (let i = 0; i < 400 && !refs.every((r) => ctx.seat(r.seatId).on(day).open && ctx.seat(r.seatId).on(addDays(day, 1)).open); i++) day = addDays(day, 1);
    if (day !== start) await saveService.updateMeta(id, { currentDate: day });
  }, 900_000);

  afterAll(async () => {
    await saveService.deleteSave(id);
  }, 120_000);

  test("the day drops the expired offer and tells both seats; the valid one stays", async () => {
    const date = (await saveService.getMeta(id))!.currentDate!;
    const used = new Set<string>();
    const A = await party(seatA, clubA);
    const B = await party(seatB, clubB);
    const old = await offer("offer-old", B, A, addDays(date, -6), addDays(date, -1), used);
    const live = await offer("offer-live", A, B, date, addDays(date, 3), used);
    await saveService.writeSeatOffers(id, [old, live]);

    const out = await runBufferedDay(id);
    expect(out.ok).toBe(true);

    expect((await saveService.getSeatOffers(id)).map((o) => o.id)).toEqual(["offer-live"]);
    for (const seatId of [seatA, seatB]) {
      const msgs = await seatOfferMessages(seatId, "offer-old");
      expect(msgs.map((m) => (m as { offerAction?: string }).offerAction)).toEqual(["expired"]);
    }
    expect(await seatOfferMessages(seatA, "offer-live")).toEqual([]);
  }, 600_000);

  test("releaseHumanClub (sacking, club change) closes the seat's offers and tells the other side through the sink", async () => {
    const date = (await saveService.getMeta(id))!.currentDate!;
    expect((await saveService.getSeatOffers(id)).map((o) => o.id)).toEqual(["offer-live"]);
    // The day advance passes a sink (the messages land after its `clearInbox`): nothing is written at once.
    const sunk: { seatId: string; action?: string; offerId?: string }[] = [];
    const nudges = new Set<string>();
    await releaseHumanClub(saveService, id, seatB, { squadId: clubB, date }, {
      sink: (seatId, args) => { sunk.push({ seatId, action: args.offerAction, offerId: args.offerId }); },
      nudges,
    });
    expect(await saveService.getSeatOffers(id)).toEqual([]);
    expect(sunk).toEqual([{ seatId: seatA, action: "closed", offerId: "offer-live" }]);
    // The socket nudge waits for the caller's flush.
    expect([...nudges]).toEqual([seatA]);
    expect(await seatOfferMessages(seatA, "offer-live")).toEqual([]);
  }, 300_000);

  test("removeSeat closes the leaving seat's offers and ends its loans with another seat in both markets", async () => {
    const date = (await saveService.getMeta(id))!.currentDate!;
    const A = await party(seatA, clubA);
    const C = await party(seatC, clubC);
    const o = await offer("offer-c", C, A, date, addDays(date, 3), new Set());
    await saveService.writeSeatOffers(id, [o]);

    // C borrows a player of A: the loan sits in both markets.
    const metaC = (await saveService.getSeatMeta(id, seatC))!;
    const parent = (await saveService.getSquadById(id, clubA))!;
    const borrower = (await saveService.getSquadById(id, clubC))!;
    const lent = [...parent.players].reverse().find((p) => !p.loan && p.id !== o.playerId && !squadDepthBlocked(p, parent, true))!;
    const market = await startLoan(saveService, id, seatC, metaC, (await saveService.getMarket(id, seatC)) ?? emptyMarket(),
      { player: lent, parent, borrower, wageShare: 0.5, until: addDays(date, 60), fee: 0 });
    await saveService.saveMarket(id, market, seatC);
    expect((await saveService.getMarket(id, seatA))!.loans?.some((l) => l.playerId === lent.id)).toBe(true);

    await removeSeat(id, seatC);

    expect(await saveService.getSeatOffers(id)).toEqual([]);
    expect((await seatOfferMessages(seatA, "offer-c")).map((m) => (m as { offerAction?: string }).offerAction)).toEqual(["closed"]);
    expect((await saveService.getMarket(id, seatA))!.loans?.some((l) => l.playerId === lent.id) ?? false).toBe(false);
    const home = (await saveService.getSquadById(id, clubA))!.players.find((p) => p.id === lent.id);
    expect(home).toBeDefined();
    expect(home?.loan).toBeUndefined();
    expect((await saveService.getSquadById(id, clubC))!.players.some((p) => p.id === lent.id)).toBe(false);
  }, 600_000);
});
