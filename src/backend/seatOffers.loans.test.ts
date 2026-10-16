import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { returnDueLoans, startLoan, emptyMarket } from "@/backend/negotiationWorld";
import { addDays } from "@/Domain/dates";

/** A loan between two seats' clubs (`.claude/rules/game/multiplayer.md`): both ledgers, both markets, news for both. */
describe("loan between two seats", () => {
  let id = "";
  let seatA = "";
  let seatB = "";
  let clubA = "";
  let clubB = "";

  beforeAll(async () => {
    const a = devAutoLogin("h2h-loan-a@test.local");
    const b = devAutoLogin("h2h-loan-b@test.local");
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
    });
    id = meta.id;
    clubA = meta.clubId;
    seatA = await ownSolo(id, a.user.id);
    clubB = (await saveService.getSquadIndex(id)).inLeague("premier_league").find((e) => e.squadId !== clubA)!.squadId;
    seatB = (await addSeat(id, {
      userId: b.user.id, clubId: clubB, manager: { name: "B", nationalityIso: "gb", backgroundId: "former-player" },
    })).seatId;
  }, 900_000);

  afterAll(async () => {
    await saveService.deleteSave(id);
  }, 120_000);

  test("start: fee in both ledgers, the loan in both markets; return: back home, news for both", async () => {
    const metaA = (await saveService.getSeatMeta(id, seatA))!;
    const parent = (await saveService.getSquadById(id, clubB))!;
    const borrower = (await saveService.getSquadById(id, clubA))!;
    const player = parent.players[parent.players.length - 1]!;
    const budgetB = parent.finances?.budget ?? 0;
    const until = addDays(metaA.currentDate!, 10);
    const market = await startLoan(saveService, id, seatA, metaA, (await saveService.getMarket(id, seatA)) ?? emptyMarket(),
      { player, parent, borrower, wageShare: 0.5, until, fee: 200_000 });
    await saveService.saveMarket(id, market, seatA);
    expect(market.loans?.some((l) => l.playerId === player.id)).toBe(true);
    expect((await saveService.getMarket(id, seatB))!.loans?.some((l) => l.playerId === player.id)).toBe(true);
    expect((await saveService.getSquadById(id, clubB))!.finances?.budget).toBe(budgetB + 200_000);
    // Return: seat A's loop runs first, then seat B's.
    const day = addDays(until, 1);
    const ra = await returnDueLoans(saveService, id, seatA, metaA, (await saveService.getMarket(id, seatA))!, day);
    const metaB = (await saveService.getSeatMeta(id, seatB))!;
    const rb = await returnDueLoans(saveService, id, seatB, metaB, (await saveService.getMarket(id, seatB))!, day);
    expect((await saveService.getSquadById(id, clubB))!.players.find((p) => p.id === player.id)?.loan).toBeUndefined();
    expect(ra.news.map((n) => n.kind)).toEqual(["loan_back"]);
    expect(rb.news.map((n) => n.kind)).toEqual(["loan_home"]);
    expect(ra.market.loans?.some((l) => l.playerId === player.id)).toBe(false);
    expect(rb.market.loans?.some((l) => l.playerId === player.id)).toBe(false);
  }, 300_000);
});
