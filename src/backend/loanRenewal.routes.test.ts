import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { emptyMarket, startLoan } from "@/backend/negotiationWorld";
import { offerLoanRenewals } from "@/backend/loanRenewalWorld";
import { addDays } from "@/Domain/dates";
import { addYearsIso } from "@/Domain/contracts/contracts";
import { roleOf } from "@/Domain/contracts/freeAgents";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { emptySeasonLog } from "@/types/playerTypes";
import type { SeatMeta } from "@/backend/SaveService";
import type { MarketState } from "@/types/transferMarketTypes";

type Params = Record<string, string>;

describe("loan renewal (12.29)", () => {
  let meta: SeatMeta;
  let saveId = "";
  let token = "";
  const req = (path: string, body: unknown, params: Params) => Object.assign(
    new Request(`http://localhost${path}`, {
      method: "POST", headers: { cookie: `fs_session=${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
    }),
    { params },
  ) as Request & { params: Params };
  const answer = (offerId: string, action: string) => apiRoutes["/api/saves/:saveId/loan-renewals/:offerId"](
    req(`/api/saves/${saveId}/loan-renewals/${offerId}`, { action }, { saveId, offerId }),
  );

  beforeAll(async () => {
    meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League", clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("loan-renewal@test.local");
    token = session.token;
    await ownSolo(saveId, user.id);
  }, 120_000);

  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("a loan in: the parent offers one more season; accepting extends it, an unknown offer is closed", async () => {
    const date = meta.currentDate!;
    const human = (await saveService.getSquadById(saveId, meta.clubId))!;
    const clubs = (await saveService.getSquadsInLeague(saveId, meta.leagueSlug)).filter((s) => s.id !== meta.clubId);
    let parent = clubs[0]!;
    const starters = new Set(autoLineupDefaultFormation(parent));
    // A young bench player: any club lends him.
    let player = parent.players.find((p) => !starters.has(p.id) && p.age <= 23 && !p.loan)!;
    expect(player).toBeDefined();
    player = { ...player, contract: { ...player.contract!, until: addYearsIso(date, 3) } };
    parent = { ...parent, players: parent.players.map((p) => (p.id === player.id ? player : p)) };
    await saveService.saveSquadById(saveId, parent);
    const until = addDays(date, 10);
    let market: MarketState = (await saveService.getMarket(saveId, meta.seatId)) ?? emptyMarket();
    market = await startLoan(saveService, saveId, meta.seatId, meta, market, { player, parent, borrower: human, wageShare: 1, until, fee: 0 });
    await saveService.saveMarket(saveId, market, meta.seatId);

    const res = await offerLoanRenewals(saveService, saveId, meta, market, date, { humanClubs: new Set([meta.clubId]) });
    expect(res.news).toHaveLength(1);
    expect(res.news[0]!.kind).toBe("loan_renewal_in");
    const offer = res.market.loanRenewals![0]!;
    expect(offer.direction).toBe("in");
    expect(offer.until).toBe(addYearsIso(until, 1));
    expect(offer.expires).toBe(addDays(until, -1));
    // Once per loan: the next day offers nothing new.
    expect((await offerLoanRenewals(saveService, saveId, meta, res.market, addDays(date, 1), { humanClubs: new Set([meta.clubId]) })).news).toHaveLength(0);
    await saveService.saveMarket(saveId, res.market, meta.seatId);

    expect((await answer("nope", "accept")).status).toBe(409);
    // The parent may ask a loan fee for the new season (its minimum, `respondToLoanRequest`): paid from the balance.
    const club = (await saveService.getSquadById(saveId, meta.clubId))!;
    await saveService.saveSquadById(saveId, { ...club, finances: { ...club.finances!, budget: offer.fee > 0 ? offer.fee - 1 : 0 } });
    if (offer.fee > 0) expect((await answer(offer.id, "accept")).status).toBe(409);
    await saveService.saveSquadById(saveId, { ...club, finances: { ...club.finances!, budget: offer.fee + 1_000 } });
    const ok = await answer(offer.id, "accept");
    expect(ok.status).toBe(200);
    const after = (await saveService.getMarket(saveId, meta.seatId))!;
    expect(after.loans!.find((l) => l.playerId === player.id)!.until).toBe(offer.until);
    expect(after.loanRenewals ?? []).toHaveLength(0);
    const held = (await saveService.getSquadById(saveId, meta.clubId))!.players.find((p) => p.id === player.id)!;
    expect(held.loan!.until).toBe(offer.until);
    expect((await saveService.getSquadById(saveId, meta.clubId))!.finances!.budget).toBe(1_000);
  }, 60_000);

  test("a loan out: the borrower asks to keep a player who played; rejecting leaves the loan as it was", async () => {
    const date = meta.currentDate!;
    const human = (await saveService.getSquadById(saveId, meta.clubId))!;
    const starters = new Set(autoLineupDefaultFormation(human));
    let player = human.players.find((p) => !starters.has(p.id) && !p.loan && p.positions[0] !== "GK")!;
    player = { ...player, contract: { ...player.contract!, until: addYearsIso(date, 3) } };
    const parent = { ...human, players: human.players.map((p) => (p.id === player.id ? player : p)) };
    const borrower = (await saveService.getSquadsInLeague(saveId, meta.leagueSlug)).filter((s) => s.id !== meta.clubId)[1]!;
    const until = addDays(date, 7);
    let market: MarketState = (await saveService.getMarket(saveId, meta.seatId)) ?? emptyMarket();
    market = await startLoan(saveService, saveId, meta.seatId, meta, market, { player, parent, borrower, wageShare: 0.8, until, fee: 0 });
    // He played every match there, and the borrower still needs his line.
    const at = (await saveService.getSquadById(saveId, borrower.id))!;
    await saveService.saveSquadById(saveId, {
      ...at, players: at.players.map((p) => (p.id === player.id ? { ...p, seasonLog: { ...emptySeasonLog(), appearances: 60 } } : p)),
    });
    market = {
      ...market,
      profiles: { ...market.profiles, [borrower.id]: {
        squadId: borrower.id, lastUpdateDay: date, sellList: [],
        needs: [{ position: roleOf(player), targetMin: 0, targetMax: 10, urgency: 1, budgetTier: "high", intentType: "cover_need" }],
      } },
    };
    const res = await offerLoanRenewals(saveService, saveId, meta, market, date, { humanClubs: new Set([meta.clubId]) });
    const offer = res.market.loanRenewals!.find((o) => o.playerId === player.id)!;
    expect(offer.direction).toBe("out");
    expect(offer.wageShare).toBe(0.8);
    expect(offer.fee).toBe(0);
    // No need in his line: no offer.
    const noNeed = await offerLoanRenewals(saveService, saveId, meta, { ...market, profiles: {} }, date, { humanClubs: new Set([meta.clubId]) });
    expect(noNeed.market.loanRenewals?.some((o) => o.playerId === player.id) ?? false).toBe(false);
    await saveService.saveMarket(saveId, res.market, meta.seatId);
    const no = await answer(offer.id, "reject");
    expect(no.status).toBe(200);
    const after = (await saveService.getMarket(saveId, meta.seatId))!;
    expect(after.loans!.find((l) => l.playerId === player.id)!.until).toBe(until);
    expect(after.loanRenewals?.some((o) => o.id === offer.id) ?? false).toBe(false);
  }, 60_000);
});
