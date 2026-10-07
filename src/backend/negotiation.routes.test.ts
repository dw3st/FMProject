import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { Player } from "@/Domain/Player";
import { playerOverallRating, teamAvgRating } from "@/Domain/transfer/transferNeeds";
import { returnDueLoans, emptyMarket } from "@/backend/negotiationWorld";
import { aiTransferBudgetOf } from "@/Domain/aiFinance/aiClubFinance";
import { addDays } from "@/Domain/dates";
import { roundFeeUp } from "@/Domain/negotiation/negotiation";
import { squadDepthBlocked } from "@/Domain/transfer/transferAcceptance";
import type { SaveMeta } from "@/backend/SaveService";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { MarketBid, MarketState } from "@/types/transferMarketTypes";

type Params = Record<string, string>;

describe("negotiation routes", () => {
  let meta: SaveMeta;
  let saveId = "";
  let token = "";

  const req = (path: string, method: string, params: Params, body?: unknown) => Object.assign(
    new Request(`http://localhost${path}`, {
      method,
      headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    { params },
  ) as Request & { params: Params };

  const route = (key: string) => (apiRoutes as unknown as Record<string, (r: Request & { params: Params }) => Promise<Response>>)[key]!;
  const valueOf = (p: RosterPlayer) => new Player(playerOverallRating(p), p.age).price;
  const human = async () => (await saveService.getSquadById(saveId, meta.clubId))!;

  /** An AI club of the league and one of its ordinary midfielders (not a starter-level star) it can sell. */
  async function aiTarget(skip: string[] = []): Promise<{ club: Squad; player: RosterPlayer }> {
    const clubs = (await saveService.getSquadsInLeague(saveId, meta.leagueSlug)).filter((s) => s.id !== meta.clubId && !skip.includes(s.id));
    for (const club of clubs) {
      const avg = teamAvgRating(club);
      const p = club.players.find((q) => q.positions[0] && ["CM", "CDM", "Midfielder"].includes(q.positions[0]) && Math.abs(playerOverallRating(q) - avg) < 0.3 && !q.loan
        // He can leave: selling him keeps his club above the depth minimums.
        && !squadDepthBlocked(q, club, false));
      if (p && club.players.length >= 20) return { club, player: p };
    }
    throw new Error("no AI target");
  }

  beforeAll(async () => {
    // Exact counters: no random rival for the same target (Etapa 25).
    process.env.FM_NO_RIVALS = "1";
    meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("negotiation-route@test.local");
    token = session.token;
    recordSaveOwnership(saveId, user.id);
    const sq = await human();
    await saveService.saveSquadById(saveId, { ...sq, players: sq.players.slice(0, 26), finances: { ...sq.finances!, budget: 2_000_000_000 } });
  }, 120_000);

  afterAll(async () => {
    delete process.env.FM_NO_RIVALS;
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("a middling offer is countered, the counter buys him, a sell-on clause stays with the seller", async () => {
    const { club, player } = await aiTarget();
    const value = valueOf(player);
    const offer = (fee: number, sellOnPct = 0) => route("/api/saves/:saveId/transfers")(
      req(`/api/saves/${saveId}/transfers`, "POST", { saveId }, { playerId: player.id, fromSquadId: club.id, fee, sellOnPct }),
    );
    const first = await offer(Math.round(value * 0.85 / 100_000) * 100_000, 10);
    expect(first.status).toBe(200);
    const a = (await first.json()) as { response: { kind: string; counterFee?: number } };
    expect(a.response.kind).toBe("counter");
    const counterFee = a.response.counterFee!;
    const second = await offer(counterFee, 10);
    const b = (await second.json()) as { response: { kind: string }; record: { status: string } };
    expect(b.response.kind).toBe("accept");
    expect(b.record.status).toBe("accepted");
    const bought = (await human()).players.find((p) => p.id === player.id)!;
    expect(bought.sellOn).toEqual({ clubId: club.id, clubName: club.name, pct: 10 });
  }, 60_000);

  test("three rounds a day, a lowball closes the talks; loaned players cannot be bought", async () => {
    const { club, player } = await aiTarget();
    const value = valueOf(player);
    const offer = (fee: number) => route("/api/saves/:saveId/transfers")(
      req(`/api/saves/${saveId}/transfers`, "POST", { saveId }, { playerId: player.id, fromSquadId: club.id, fee }),
    );
    for (let i = 0; i < 3; i++) expect((await offer(Math.round(value * 0.8))).status).toBe(200);
    const fourth = await offer(Math.round(value * 0.8));
    expect(fourth.status).toBe(409);
    expect(await fourth.json()).toMatchObject({ error: "noRounds" });

    const other = await aiTarget([club.id]);
    const low = await route("/api/saves/:saveId/transfers")(
      req(`/api/saves/${saveId}/transfers`, "POST", { saveId }, { playerId: other.player.id, fromSquadId: other.club.id, fee: Math.round(valueOf(other.player) * 0.3) }),
    );
    expect(((await low.json()) as { response: { reason: string } }).response.reason).toBe("insulted");
    const again = await route("/api/saves/:saveId/transfers")(
      req(`/api/saves/${saveId}/transfers`, "POST", { saveId }, { playerId: other.player.id, fromSquadId: other.club.id, fee: valueOf(other.player) * 3 }),
    );
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "talksClosed" });
  }, 60_000);

  test("an AI bid: counter above the max gets the max, then accept sells with the asked clause and pays the old clause", async () => {
    const sq = await human();
    const seller = sq.players.find((p) => p.sellOn)!; // the midfielder bought above (10% to his old club)
    const { club: buyer } = await aiTarget([seller.sellOn!.clubId]);
    const oldClub = (await saveService.getSquadById(saveId, seller.sellOn!.clubId))!;
    const oldBudget = aiTransferBudgetOf(oldClub);
    const fee = 20_000_000;
    const bid: MarketBid = {
      id: "bid-test-1", kind: "transfer", playerId: seller.id, playerName: seller.name, clubId: buyer.id, clubName: buyer.name,
      date: meta.currentDate!, expires: addDays(meta.currentDate!, 5), fee, maxFee: 30_000_000, sellOnPct: 0,
    };
    const market: MarketState = (await saveService.getMarket(saveId)) ?? emptyMarket();
    await saveService.saveMarket(saveId, { ...market, pendingBids: [bid] });
    await saveService.saveSquadById(saveId, { ...buyer, aiTransferBudget: 100_000_000 });

    const answer = (body: unknown) => route("/api/saves/:saveId/bids/:bidId")(
      req(`/api/saves/${saveId}/bids/bid-test-1`, "POST", { saveId, bidId: "bid-test-1" }, body),
    );
    const c = await answer({ action: "counter", fee: 40_000_000, sellOnPct: 20 });
    const cBody = (await c.json()) as { status: string; bid: MarketBid };
    expect(cBody.status).toBe("countered");
    expect(cBody.bid.fee).toBeLessThan(30_000_000);
    const ok = await answer({ action: "accept" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { status: string }).status).toBe("sold");

    const sold = (await saveService.getSquadById(saveId, buyer.id))!.players.find((p) => p.id === seller.id)!;
    expect(sold.sellOn).toMatchObject({ clubId: meta.clubId, pct: 20 });
    expect(aiTransferBudgetOf((await saveService.getSquadById(saveId, oldClub.id))!)).toBeGreaterThan(oldBudget);
    expect((await saveService.getMarket(saveId))!.sellOnHeld?.some((h) => h.playerId === seller.id)).toBe(true);
    const gone = await answer({ action: "accept" });
    expect(gone.status).toBe(409);
    expect(await gone.json()).toMatchObject({ error: "offerClosed" });
  }, 60_000);

  test("loan in: a counter on the wage share, accepted, then he goes back on the date", async () => {
    const { club, player } = await aiTarget();
    const ask = (wageShare: number, fee = 0) => route("/api/saves/:saveId/loans")(
      req(`/api/saves/${saveId}/loans`, "POST", { saveId }, { playerId: player.id, fromSquadId: club.id, wageShare, fee }),
    );
    // Make him available: listed by his club.
    const market: MarketState = (await saveService.getMarket(saveId)) ?? emptyMarket();
    await saveService.saveMarket(saveId, {
      ...market,
      profiles: { ...market.profiles, [club.id]: { squadId: club.id, needs: [], sellList: [{ playerId: player.id, priority: 1 }], lastUpdateDay: meta.currentDate! } },
    });
    const first = await ask(0);
    const a = (await first.json()) as { response: { kind: string; wageShare?: number; fee?: number; reason?: string } };
    expect(a.response.kind).toBe("counter");
    const second = await ask(Math.round((a.response.wageShare ?? 1) * 100), a.response.fee ?? 0);
    const b = (await second.json()) as { response: { kind: string }; until: string };
    expect(b.response.kind).toBe("accept");
    const loaned = (await human()).players.find((p) => p.id === player.id)!;
    expect(loaned.loan?.fromClubId).toBe(club.id);

    const mk = (await saveService.getMarket(saveId))!;
    expect(mk.loans?.some((l) => l.playerId === player.id)).toBe(true);
    const back = await returnDueLoans(saveService, saveId, (await saveService.getMeta(saveId))!, mk, loaned.loan!.until);
    await saveService.saveMarket(saveId, back.market);
    expect(back.news.map((n) => n.kind)).toContain("loan_back");
    expect((await human()).players.some((p) => p.id === player.id)).toBe(false);
    const home = (await saveService.getSquadById(saveId, club.id))!.players.find((p) => p.id === player.id)!;
    expect(home.loan).toBeUndefined();
  }, 60_000);

  test("loan out: a loan bid accepted moves the player away with the agreed share", async () => {
    const sq = await human();
    const p = sq.players.find((q) => !q.loan && q.positions[0] !== "GK")!;
    // A borrower with room in the squad (a full one closes the offer).
    const borrower = (await saveService.getSquadsInLeague(saveId, meta.leagueSlug))
      .find((s) => s.id !== meta.clubId && s.players.length < 30)!;
    const bid: MarketBid = {
      id: "bid-loan-1", kind: "loan", playerId: p.id, playerName: p.name, clubId: borrower.id, clubName: borrower.name,
      date: meta.currentDate!, expires: addDays(meta.currentDate!, 5), fee: 0, wageShare: 0.6, until: addDays(meta.currentDate!, 90),
    };
    const market: MarketState = (await saveService.getMarket(saveId)) ?? emptyMarket();
    await saveService.saveMarket(saveId, { ...market, pendingBids: [bid], playerLoanList: [p.id] });
    const res = await route("/api/saves/:saveId/bids/:bidId")(
      req(`/api/saves/${saveId}/bids/bid-loan-1`, "POST", { saveId, bidId: "bid-loan-1" }, { action: "accept" }),
    );
    expect(res.status).toBe(200);
    const there = (await saveService.getSquadById(saveId, borrower.id))!.players.find((q) => q.id === p.id)!;
    expect(there.loan).toMatchObject({ fromClubId: meta.clubId, wageShare: 0.6 });
    const after = (await saveService.getMarket(saveId))!;
    expect(after.playerLoanList).toEqual([]);
    const nego = await route("/api/saves/:saveId/negotiation")(req(`/api/saves/${saveId}/negotiation`, "GET", { saveId }));
    const body = (await nego.json()) as { loans: { playerId: string }[] };
    expect(body.loans.some((l) => l.playerId === p.id)).toBe(true);
    // The contract is still ours: renewing him writes into the borrower's squad.
    const until0 = there.contract!.until;
    const renew = await route("/api/saves/:saveId/players/:playerId/renew")(
      req(`/api/saves/${saveId}/players/${p.id}/renew`, "POST", { saveId, playerId: p.id }, { wage: (there.contract?.wage ?? 0) * 3, years: 1 }),
    );
    expect(renew.status).toBe(200);
    const renewed = (await saveService.getSquadById(saveId, borrower.id))!.players.find((q) => q.id === p.id)!;
    expect(renewed.contract!.until > until0).toBe(true);
  }, 60_000);

  test("an expired bid is closed; validation errors", async () => {
    const sq = await human();
    const p = sq.players.find((q) => !q.loan)!;
    const bid: MarketBid = {
      id: "bid-old", kind: "transfer", playerId: p.id, playerName: p.name, clubId: "x", clubName: "X",
      date: "2000-01-01", expires: "2000-01-05", fee: 1_000_000, maxFee: 1_000_000,
    };
    const market: MarketState = (await saveService.getMarket(saveId)) ?? emptyMarket();
    await saveService.saveMarket(saveId, { ...market, pendingBids: [bid] });
    const res = await route("/api/saves/:saveId/bids/:bidId")(
      req(`/api/saves/${saveId}/bids/bid-old`, "POST", { saveId, bidId: "bid-old" }, { action: "accept" }),
    );
    expect(res.status).toBe(409);
    const bad = await route("/api/saves/:saveId/bids/:bidId")(
      req(`/api/saves/${saveId}/bids/bid-old`, "POST", { saveId, bidId: "bid-old" }, { action: "nope" }),
    );
    expect(bad.status).toBe(400);
    const badPct = await route("/api/saves/:saveId/transfers")(
      req(`/api/saves/${saveId}/transfers`, "POST", { saveId }, { playerId: "x", fromSquadId: "y", fee: 1, sellOnPct: 15 }),
    );
    expect(badPct.status).toBe(400);
  }, 60_000);

  test("sell list with an asking price: list at a price, update it, clear it, validation (#88)", async () => {
    const sq = await human();
    const p = sq.players.find((q) => !q.loan && !q.moraleLog?.transferRequest && valueOf(q) >= 10_000_000)!;
    const value = valueOf(p);
    const sell = (body: unknown) => route("/api/saves/:saveId/sell-list")(req(`/api/saves/${saveId}/sell-list`, "POST", { saveId }, body));
    type Entry = { playerId: string; askingPrice?: number; requested?: true };
    const entry = async (res: Response) =>
      ((await res.json()) as { playerSellList: Entry[] }).playerSellList.find((c) => c.playerId === p.id);

    const listed = await sell({ playerId: p.id, askingPrice: value * 0.8 + 400_000 });
    expect(listed.status).toBe(200);
    expect((await entry(listed))?.askingPrice).toBe(roundFeeUp(value * 0.8 + 400_000));
    // Setting a price again updates it and never unlists him.
    const updated = await sell({ playerId: p.id, askingPrice: value * 1.2 });
    expect((await entry(updated))?.askingPrice).toBe(roundFeeUp(value * 1.2));
    // His value (or null) is stored as "at value": no frozen price.
    const atValue = await entry(await sell({ playerId: p.id, askingPrice: value }));
    expect(atValue).toBeDefined();
    expect(atValue!.askingPrice).toBeUndefined();
    const cleared = await sell({ playerId: p.id, askingPrice: null });
    const c = await entry(cleared);
    expect(c).toBeDefined();
    expect(c!.askingPrice).toBeUndefined();
    // Floor: 0.3 × value.
    expect((await sell({ playerId: p.id, askingPrice: value * 0.25 })).status).toBe(400);
    expect((await sell({ playerId: p.id, askingPrice: value * 0.3 })).status).toBe(200);
    for (const bad of [0, -5, "1000", 1e12]) {
      const res = await sell({ playerId: p.id, askingPrice: bad });
      expect(res.status).toBe(400);
    }
    expect((await sell({ playerId: "not-mine", askingPrice: 1_000_000 })).status).toBe(400);
    // Plain toggle still unlists.
    expect(await entry(await sell({ playerId: p.id }))).toBeUndefined();
    // Pricing a player listed only by his transfer request makes it a manual listing.
    const m0 = (await saveService.getMarket(saveId)) ?? emptyMarket();
    await saveService.saveMarket(saveId, { ...m0, playerSellList: [...(m0.playerSellList ?? []), { playerId: p.id, priority: 1, requested: true }] });
    const manual = await entry(await sell({ playerId: p.id, askingPrice: value * 0.9 }));
    expect(manual?.requested).toBeUndefined();
    expect(await entry(await sell({ playerId: p.id }))).toBeUndefined();
    // A borrowed player cannot be priced either.
    const base = await human();
    const borrowed: RosterPlayer = { ...p, id: `${p.id}-loan`, loan: { fromClubId: "x", fromClubName: "X", until: "2099-01-01", wageShare: 1 } };
    await saveService.saveSquadById(saveId, { ...base, players: [...base.players, borrowed] });
    const onLoan = await sell({ playerId: borrowed.id, askingPrice: 1_000_000 });
    expect(onLoan.status).toBe(400);
    expect(((await onLoan.json()) as { error: string }).error).toBe("onLoan");
    await saveService.saveSquadById(saveId, base);
  }, 60_000);

  test("a bid that would leave the squad too thin is refused (409 squadDepth)", async () => {
    const sq = await human();
    const thin = { ...sq, players: sq.players.filter((p) => !p.loan).slice(0, 14) };
    await saveService.saveSquadById(saveId, thin);
    const p = thin.players[5]!;
    const { club: buyer } = await aiTarget();
    const bid: MarketBid = {
      id: "bid-thin", kind: "transfer", playerId: p.id, playerName: p.name, clubId: buyer.id, clubName: buyer.name,
      date: meta.currentDate!, expires: addDays(meta.currentDate!, 5), fee: 1_000_000, maxFee: 1_000_000,
    };
    const market: MarketState = (await saveService.getMarket(saveId)) ?? emptyMarket();
    await saveService.saveMarket(saveId, { ...market, pendingBids: [bid] });
    const res = await route("/api/saves/:saveId/bids/:bidId")(
      req(`/api/saves/${saveId}/bids/bid-thin`, "POST", { saveId, bidId: "bid-thin" }, { action: "accept" }),
    );
    expect(res.status).toBe(409);
    const errBody = await res.json();
    expect(JSON.stringify(errBody)).toBe(JSON.stringify({ error: "squadDepth" }));
  }, 60_000);
});
