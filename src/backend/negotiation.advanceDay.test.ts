import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { emptyMarket, startLoan } from "@/backend/negotiationWorld";
import { squadWeeklyWages, wageFactorOf } from "@/Domain/finance/wages";

/**
 * Negotiation in the day pipeline (`.claude/rules/game/negotiation.md`): a loan due today goes back
 * before the market runs (with the inbox notice), and the human's listed players get bids — never
 * an automatic sale.
 */
describe("negotiation in advanceOneDay", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("a loan due today returns; listed players are not sold on their own", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const date = meta.currentDate!;
    const human = (await saveService.getSquadById(saveId, meta.clubId))!;
    const others = (await saveService.getSquadsInLeague(saveId, meta.leagueSlug)).filter((s) => s.id !== meta.clubId);
    const parent = others[0]!;
    const loanee = parent.players.find((p) => p.positions[0] !== "GK")!;

    const market = await startLoan(saveService, saveId, meta, emptyMarket(), {
      player: loanee, parent, borrower: human, wageShare: 0.5, until: date, fee: 0,
    });
    const listed = human.players.filter((p) => p.positions[0] !== "GK").slice(-2).map((p) => p.id);
    await saveService.saveMarket(saveId, { ...market, playerSellList: listed.map((playerId) => ({ playerId, priority: 1 })) });

    const withLoan = (await saveService.getSquadById(saveId, meta.clubId))!;
    const borrowed = withLoan.players.find((p) => p.id === loanee.id)!;
    expect(borrowed.loan).toMatchObject({ fromClubId: parent.id, wageShare: 0.5 });
    const fullBill = squadWeeklyWages(withLoan.players.map((p) => (p.id === loanee.id ? { ...p, loan: undefined } : p)), wageFactorOf(withLoan));
    expect(squadWeeklyWages(withLoan.players, wageFactorOf(withLoan))).toBeLessThan(fullBill);

    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);

    const after = (await saveService.getSquadById(saveId, meta.clubId))!;
    expect(after.players.some((p) => p.id === loanee.id)).toBe(false);
    const home = (await saveService.getSquadById(saveId, parent.id))!.players.find((p) => p.id === loanee.id)!;
    expect(home.loan).toBeUndefined();
    expect((await saveService.getMarket(saveId))!.loans ?? []).toEqual([]);
    const inbox = await saveService.getInbox(saveId);
    expect(inbox.some((m) => m.category === "transfer" && m.kind === "loan_back")).toBe(true);
    // Listed players stay until the human answers a bid.
    for (const id of listed) expect(after.players.some((p) => p.id === id)).toBe(true);
    const bids = (await saveService.getMarket(saveId))!.pendingBids ?? [];
    for (const b of bids) {
      expect(listed).toContain(b.playerId);
      expect(inbox.some((m) => m.category === "transfer" && m.kind === "bid" && m.bidId === b.id)).toBe(true);
    }
  }, 120_000);
});
