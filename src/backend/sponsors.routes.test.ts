import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { clubOverview } from "@/backend/clubOverviewWorld";
import { matchSetupFor } from "@/backend/matchSetup";
import { masterSponsorOf, sponsorBoardsOf } from "@/backend/sponsorWorld";
import { stripHumanOnly } from "@/backend/startKits";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { callApi, createMultiWorld } from "@/backend/worlds/worldTestUtils";
import { addDays } from "@/Domain/dates";
import { describeLedgerEntry } from "@/Domain/finance/ledgerText";
import { publicSeatSquad } from "@/Domain/seats/publicSquad";
import { SPONSORS } from "@/Domain/sponsors/sponsorConfig";
import { negotiationOutcome, weeklySponsorIncome } from "@/Domain/sponsors/sponsors";
import type { Squad } from "@/types/playerTypes";
import type { SponsorOffer, SponsorsView } from "@/types/sponsorTypes";

const VIEW = "/api/saves/:saveId/sponsors";
const OFFER = "/api/saves/:saveId/sponsors/offers/:offerId";

const ledgerOf = async (saveId: string, seatId: string) =>
  (await Promise.all((await saveService.listLedgerSeasons(saveId, seatId)).map((s) => saveService.getLedger(saveId, s, seatId)))).flat();

/**
 * Sponsors (`.claude/rules/game/sponsors.md`): a new career starts with offers for every slot and no income until a
 * contract is signed; the seat answers its own offers; the Monday commercial line is the contracts' sum over 52;
 * expired offers are signed by the director; a club without the record keeps the old income.
 */
describe("sponsors routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("offers at the start, answers, weekly income, expiry, legacy, noClub", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("sponsors-route@test.local");
    const other = devAutoLogin("sponsors-other@test.local");
    await ownSolo(saveId, user.id);
    const get = () => callApi("GET", VIEW, session.token, { params: { saveId } });
    const answer = (offerId: string, action: unknown, token = session.token) =>
      callApi("POST", OFFER, token, { params: { saveId, offerId }, body: { action } });

    // Career start: the record exists, with offers for every slot and nothing signed.
    const squad0 = (await saveService.getSquadById(saveId, "33"))!;
    expect(squad0.sponsors!.contracts).toEqual([]);
    expect(squad0.sponsors!.offers.filter((o) => o.slot === "master")).toHaveLength(SPONSORS.SLOTS.master.offers);
    expect(squad0.sponsors!.offers.filter((o) => o.slot === "kit")).toHaveLength(SPONSORS.SLOTS.kit.offers);
    expect(squad0.sponsors!.offers.filter((o) => o.slot === "board")).toHaveLength(SPONSORS.SLOTS.board.offers);
    // No AI club stores sponsors.
    const all = await saveService.getAllSquads(saveId);
    expect(all.filter((s) => s.sponsors).map((s) => String(s.id))).toEqual(["33"]);

    // Not a member: indistinguishable from a missing save.
    expect((await callApi("GET", VIEW, other.session.token, { params: { saveId } })).status).toBe(404);
    expect((await answer(squad0.sponsors!.offers[0]!.id, "accept", other.session.token)).status).toBe(404);

    const start = (await get()).json as SponsorsView;
    expect(start.active).toBe(true);
    expect(start.date).toBe(meta.currentDate!);
    expect(start.base).toBe(squad0.finances!.commercial);
    expect(start.weekly).toBe(0);
    expect(start.appeal).toBeGreaterThanOrEqual(SPONSORS.APPEAL.MIN);
    expect(start.appeal).toBeLessThanOrEqual(SPONSORS.APPEAL.MAX);
    expect(start.slots).toEqual([
      { slot: "master", count: 1, share: 0.5, filled: 0 }, { slot: "kit", count: 1, share: 0.25, filled: 0 },
      { slot: "board", count: 4, share: 0.0625, filled: 0 },
    ]);
    expect(start.offers).toHaveLength(11);
    for (const o of start.offers) {
      expect(o.company.name.length).toBeGreaterThan(0);
      expect(o.company.colors).toHaveLength(2);
      expect(o.annual).toBeGreaterThan(0);
      expect(o.expires).toBe(addDays(meta.currentDate!, SPONSORS.OFFER_DAYS));
      expect(o.progress).toBeDefined();
    }

    // Validation.
    expect((await answer(start.offers[0]!.id, "steal")).status).toBe(400);
    const missing = await answer("nope", "accept");
    expect(missing.status).toBe(404);
    expect(missing.json.error).toBe("notFound");

    // Negotiate once (an offer the company does not walk away from).
    const kit = start.offers.filter((o) => o.slot === "kit");
    const talk = kit.find((o) => negotiationOutcome(o.id, o.company.id) !== "withdrawn") ?? start.offers.find((o) => o.slot === "board" && negotiationOutcome(o.id, o.company.id) !== "withdrawn")!;
    const talked = await answer(talk.id, "negotiate");
    expect(talked.status).toBe(200);
    expect(talked.json.negotiation).toBe(negotiationOutcome(talk.id, talk.company.id));
    const after = (talked.json.view as SponsorsView).offers.find((o) => o.id === talk.id)!;
    expect(after.negotiated).toBe(true);
    expect(after.annual).toBe(talked.json.negotiation === "raised" ? Math.round((talk.annual * 1.08) / 1000) * 1000 : talk.annual);
    const again = await answer(talk.id, "negotiate");
    expect(again.status).toBe(409);
    expect(again.json.error).toBe("alreadyNegotiated");

    // Accept the master: a contract; the other master offers leave the table.
    const master = start.offers.filter((o) => o.slot === "master");
    const signed = await answer(master[0]!.id, "accept");
    expect(signed.status).toBe(200);
    expect(signed.json.contract).toMatchObject({ slot: "master", annual: master[0]!.annual, seasonsLeft: master[0]!.years, signedOn: meta.currentDate });
    const v1 = signed.json.view as SponsorsView;
    expect(v1.offers.filter((o) => o.slot === "master")).toHaveLength(0);
    expect(v1.contracts).toHaveLength(1);
    expect(v1.slots[0]!.filled).toBe(1);
    expect(v1.weekly).toBe(Math.round(master[0]!.annual / 52));
    expect((await answer(master[1]!.id, "accept")).status).toBe(404);

    // A slot taken while an offer for it is still on the table: 409 slotTaken.
    const sq1 = (await saveService.getSquadById(saveId, "33"))!;
    const stray: SponsorOffer = { ...master[1]!, id: "stray" };
    await saveService.saveSquadById(saveId, { ...sq1, sponsors: { ...sq1.sponsors!, offers: [...sq1.sponsors!.offers, stray] } });
    const taken = await answer("stray", "accept");
    expect(taken.status).toBe(409);
    expect(taken.json.error).toBe("slotTaken");
    expect((await answer("stray", "decline")).status).toBe(200);

    // Two boards and a declined one.
    const boards = v1.offers.filter((o) => o.slot === "board" && o.id !== talk.id);
    expect((await answer(boards[0]!.id, "accept")).status).toBe(200);
    expect((await answer(boards[1]!.id, "accept")).status).toBe(200);
    const declined = await answer(boards[2]!.id, "decline");
    expect(declined.status).toBe(200);
    expect((declined.json.view as SponsorsView).offers.some((o) => o.id === boards[2]!.id)).toBe(false);
    expect((declined.json.view as SponsorsView).slots[2]!.filled).toBe(2);

    // match-setup on a match day: the master sponsor of both sides and the home club's pitch boards.
    {
      const seat0 = (await saveService.getSeatMeta(saveId, meta.seatId))!;
      const mySquad = (await saveService.getSquadById(saveId, "33"))!;
      const game = (await saveService.getFixturesForDate(saveId, seat0.currentDate!)).find((f) => f.home === "33" || f.away === "33");
      if (game) {
        const setup = await matchSetupFor(seat0, { live: false });
        expect(setup.ok).toBe(true);
        const body = setup.body as unknown as {
          sponsors: { mine: { name: string } | null; opponent: { name: string } | null };
          crowd: { sponsors?: { name: string; weight: number }[] };
        };
        expect(body.sponsors.mine!.name).toBe(master[0]!.company.name);
        expect(body.sponsors.opponent!.name.length).toBeGreaterThan(0);
        if (game.home === "33") {
          expect(body.crowd.sponsors!.map((b) => b.weight)).toEqual([3, 1, 1]);
          expect(body.crowd.sponsors![0]!.name).toBe(master[0]!.company.name);
        } else {
          expect(body.crowd.sponsors!.map((b) => b.weight)).toEqual([3, 2, 1, 1, 1, 1]);
          expect(body.crowd.sponsors![0]!.name).toBe(body.sponsors.opponent!.name);
        }
        expect(mySquad.sponsors!.contracts).toHaveLength(3);
      }
    }

    // The first Monday: one commercial line = the contracts' sum over 52, and the ledger still sums to the balance.
    const contracts = (await saveService.getSquadById(saveId, "33"))!.sponsors!;
    const weekly = weeklySponsorIncome(contracts);
    expect(weekly).toBe(Math.round((master[0]!.annual + boards[0]!.annual + boards[1]!.annual) / 52));
    let monday = "";
    for (let i = 0; i < 8 && !monday; i++) {
      const date = (await saveService.getMeta(saveId))!.currentDate!;
      expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
      if (new Date(`${date}T12:00:00`).getDay() === 1) monday = date;
    }
    expect(monday).not.toBe("");
    const ledger = await ledgerOf(saveId, meta.seatId);
    const lines = ledger.filter((e) => e.kind === "commercial");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ date: monday, amount: weekly, ref: { stage: "sponsors" } });
    expect(describeLedgerEntry(lines[0]!)).toEqual({ key: "sponsors" });
    // The contracts' books (12.1): that Monday counted on each contract.
    expect((await saveService.getSquadById(saveId, "33"))!.sponsors!.contracts.map((c) => c.paid))
      .toEqual(contracts.contracts.map((c) => ({ fixed: Math.round(c.annual / 52), bonus: 0, met: 0, missed: 0 })));
    const balance = (await saveService.getSquadById(saveId, "33"))!.finances!.budget;
    expect(Math.abs(ledger.reduce((s, e) => s + e.amount, 0) - balance)).toBeLessThan(1);

    // Offers past their last day: the director signs the best fixed value of every slot still empty.
    const sq2 = (await saveService.getSquadById(saveId, "33"))!;
    const today = (await saveService.getMeta(saveId))!.currentDate!;
    const kitOffers = sq2.sponsors!.offers.filter((o) => o.slot === "kit");
    const boardOffers = sq2.sponsors!.offers.filter((o) => o.slot === "board");
    expect(kitOffers.length).toBeGreaterThan(0);
    await saveService.saveSquadById(saveId, {
      ...sq2, sponsors: { ...sq2.sponsors!, offers: sq2.sponsors!.offers.map((o) => ({ ...o, expires: addDays(today, -1) })) },
    });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const sq3 = (await saveService.getSquadById(saveId, "33"))!;
    expect(sq3.sponsors!.offers).toEqual([]);
    const kitSigned = sq3.sponsors!.contracts.find((c) => c.slot === "kit")!;
    expect(kitSigned.auto).toBe(true);
    expect(kitSigned.annual).toBe(Math.max(...kitOffers.map((o) => o.annual)));
    expect(sq3.sponsors!.contracts.filter((c) => c.slot === "board")).toHaveLength(Math.min(4, 2 + boardOffers.length));
    const inbox = await saveService.getInbox(saveId, meta.seatId);
    const auto = inbox.find((m) => m.category === "sponsor" && m.kind === "auto_signed");
    expect(auto).toBeDefined();
    if (auto?.category === "sponsor") expect(auto.signed!.some((s) => s.slot === "kit" && s.annual === kitSigned.annual)).toBe(true);

    // The club page and the pitch boards: the human club's contracts, an AI club's derived names (stable).
    const seat = (await saveService.getSeatMeta(saveId, meta.seatId))!;
    const mine = await clubOverview(saveService, saveId, seat, sq3);
    expect(mine.masterSponsor).toEqual({ id: master[0]!.company.id, name: master[0]!.company.name, sector: master[0]!.company.sector, colors: master[0]!.company.colors });
    const rival = (await saveService.getSquadById(saveId, "50"))!;
    const theirs = await clubOverview(saveService, saveId, seat, rival);
    expect(theirs.masterSponsor!.name.length).toBeGreaterThan(0);
    expect(await masterSponsorOf(saveService, saveId, rival, seat.activeLeagues, seat.currentDate!)).toEqual(theirs.masterSponsor);
    const aiBoards = await sponsorBoardsOf(saveService, saveId, rival, seat.activeLeagues, seat.currentDate!);
    expect(aiBoards.map((b) => b.weight)).toEqual([3, 2, 1, 1, 1, 1]);
    expect(new Set(aiBoards.map((b) => b.name)).size).toBe(6);
    const myBoards = await sponsorBoardsOf(saveService, saveId, sq3, seat.activeLeagues, seat.currentDate!);
    expect(myBoards[0]).toEqual({ id: master[0]!.company.id, name: master[0]!.company.name, colors: master[0]!.company.colors, weight: 3 });
    expect(myBoards).toHaveLength(sq3.sponsors!.contracts.length);

    // Private to the seat, and never in a start kit.
    expect("sponsors" in publicSeatSquad(sq3)).toBe(false);
    expect(stripHumanOnly(sq3).sponsors).toBeUndefined();

    // A club without the record (a save from before 12.0): the view says so, the old weekly income stays.
    const { sponsors: _gone, ...legacy } = sq3;
    await saveService.saveSquadById(saveId, legacy as Squad);
    const old = (await get()).json as SponsorsView;
    expect(old.active).toBe(false);
    expect(old.offers).toEqual([]);
    expect(old.weekly).toBe(Math.round(sq3.finances!.commercial / 52));
    expect((await answer("anything", "accept")).status).toBe(404);
    let monday2 = "";
    for (let i = 0; i < 8 && !monday2; i++) {
      const date = (await saveService.getMeta(saveId))!.currentDate!;
      expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
      if (new Date(`${date}T12:00:00`).getDay() === 1) monday2 = date;
    }
    const line = (await ledgerOf(saveId, meta.seatId)).find((e) => e.kind === "commercial" && e.date === monday2)!;
    expect(line.amount).toBe(Math.round(sq3.finances!.commercial / 52));
    expect(line.ref).toBeUndefined();
    expect(describeLedgerEntry(line)).toEqual({ key: "commercial" });
    expect((await saveService.getSquadById(saveId, "33"))!.sponsors).toBeUndefined();

    // Sacked: the club turns AI, the routes answer 409 noClub.
    const m2 = (await saveService.getSeatMeta(saveId, meta.seatId))!;
    await saveService.saveSquadById(saveId, { ...(await saveService.getSquadById(saveId, "33"))!, sponsors: sq3.sponsors! });
    await saveService.updateSeat(saveId, meta.seatId, { board: { ...m2.board!, board: 5 } });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    expect((await saveService.getSeatMeta(saveId, meta.seatId))!.unemployed).toBeDefined();
    expect((await saveService.getSquadById(saveId, "33"))!.sponsors).toBeUndefined();
    const noClub = await get();
    expect(noClub.status).toBe(409);
    expect(noClub.json.error).toBe("noClub");
    expect((await answer("x", "accept")).status).toBe(409);
  }, 600_000);
});

describe("sponsors: lobby", () => {
  test("a lobby world refuses the answer with 409 lobby; the view still reads", async () => {
    const owner = devAutoLogin("sponsors-lobby@test.local");
    const created = await createMultiWorld(owner.session.token);
    expect([200, 201]).toContain(created.status);
    const saveId = created.json.id as string;
    try {
      const view = await callApi("GET", VIEW, owner.session.token, { params: { saveId } });
      expect(view.status).toBe(200);
      const offer = (view.json as SponsorsView).offers[0]!;
      const r = await callApi("POST", OFFER, owner.session.token, { params: { saveId, offerId: offer.id }, body: { action: "accept" } });
      expect(r.status).toBe(409);
      expect(r.json.error).toBe("lobby");
    } finally {
      await saveService.deleteSave(saveId);
    }
  }, 600_000);
});
