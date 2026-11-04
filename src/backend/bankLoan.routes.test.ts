import { afterAll, describe, expect, test } from "bun:test";
import { advanceOneDay } from "@/backend/advanceDay";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { releaseHumanClub } from "@/backend/jobWorld";
import { apiRoutes } from "@/backend/routes";
import { saveService } from "@/backend/SaveService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { BANK_LOAN, bankLoanLimit, bankLoanQuote } from "@/Domain/finance/bankLoan";
import { addDays } from "@/Domain/dates";

describe("paying a bank loan off", () => {
  test("pays what is left at once, needs the money, leaves no debt", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    try {
      const { user, session } = devAutoLogin("bank-loan-payoff@test.local");
      await ownSolo(meta.id, user.id);
      const call = () => {
        const handler = apiRoutes["/api/saves/:saveId/bank-loan/payoff" as keyof typeof apiRoutes] as unknown as (r: Request) => Promise<Response>;
        return handler(Object.assign(
          new Request(`http://localhost/api/saves/${meta.id}/bank-loan/payoff`, { method: "POST", headers: { cookie: `fs_session=${session.token}` } }),
          { params: { saveId: meta.id } },
        ));
      };
      expect(((await (await call()).json()) as { error: string }).error).toBe("noLoan");
      const squad = (await saveService.getSquadById(meta.id, "33"))!;
      const bankLoan = { principal: 1_000_000, total: 1_150_000, weekly: 22_116, remaining: 900_000, takenOn: "2026-08-01", seasons: 1 };
      await saveService.saveSquadById(meta.id, { ...squad, bankLoan, finances: { ...squad.finances!, budget: 100_000 } });
      expect(((await (await call()).json()) as { error: string }).error).toBe("noMoney");
      const rich = (await saveService.getSquadById(meta.id, "33"))!;
      await saveService.saveSquadById(meta.id, { ...rich, finances: { ...rich.finances!, budget: 1_000_000 } });
      expect((await call()).status).toBe(200);
      const after = (await saveService.getSquadById(meta.id, "33"))!;
      expect(after.bankLoan).toBeUndefined();
      expect(after.finances!.budget).toBe(100_000);
    } finally {
      await saveService.deleteSave(meta.id);
    }
  }, 120_000);
});

/** Bank loan: the route, the ledger, the Monday payment, and the debt staying behind when the manager leaves. */
describe("bank loan route", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("take, refuse a second one, pay on Monday", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("bank-loan@test.local");
    const other = devAutoLogin("bank-loan-other@test.local");
    await ownSolo(saveId, user.id);
    const seatId = (await saveService.listSeats(saveId))[0]!.seatId;

    const call = (token: string, body: unknown, method = "POST") => {
      const handler = apiRoutes["/api/saves/:saveId/bank-loan" as keyof typeof apiRoutes] as unknown as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/bank-loan`, {
          method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId } },
      ));
    };

    const before = (await saveService.getSquadById(saveId, "33"))!;
    const limit = bankLoanLimit(before);
    const amount = BANK_LOAN.STEP * 10;
    expect(limit).toBeGreaterThanOrEqual(amount);

    expect((await call(other.session.token, { amount, seasons: 1 })).status).toBe(404);
    expect((await call(session.token, {}, "GET")).status).toBe(405);
    expect(((await (await call(session.token, { amount: limit + BANK_LOAN.STEP, seasons: 1 })).json()) as { error: string }).error).toBe("overLimit");
    expect((await call(session.token, { amount, seasons: 3 })).status).toBe(400);

    // A low board does not authorise.
    await saveService.updateSeat(saveId, seatId, { board: { ...(await saveService.getSeat(saveId, seatId))!.board!, board: BANK_LOAN.MIN_BOARD - 1 } });
    expect(((await (await call(session.token, { amount, seasons: 1 })).json()) as { error: string }).error).toBe("boardLow");
    await saveService.updateSeat(saveId, seatId, { board: { ...(await saveService.getSeat(saveId, seatId))!.board!, board: 60 } });

    const res = await call(session.token, { amount, seasons: 1 });
    expect(res.status).toBe(200);
    const quote = bankLoanQuote(amount, 1);
    const taken = (await saveService.getSquadById(saveId, "33"))!;
    expect(taken.bankLoan?.remaining).toBe(quote.total);
    expect(taken.finances!.budget).toBe(before.finances!.budget + amount);
    expect((await saveService.getSeat(saveId, seatId))!.board!.board).toBe(57);
    expect((await call(session.token, { amount, seasons: 1 })).status).toBe(409);

    // Advance to the first Monday after the loan: one payment, in the ledger, and the debt goes down.
    let date = (await saveService.getMeta(saveId))!.currentDate!;
    const takenOn = date;
    let paid = false;
    for (let i = 0; i < 9 && !paid; i++) {
      const out = await advanceOneDay(saveService, saveId);
      expect(out.ok).toBe(true);
      if (new Date(date + "T12:00:00").getDay() === 1 && date > takenOn) paid = true;
      date = addDays(date, 1);
    }
    expect(paid).toBe(true);
    const seasons = await saveService.listLedgerSeasons(saveId, seatId);
    const entries = (await Promise.all(seasons.map((s) => saveService.getLedger(saveId, s, seatId)))).flat();
    expect(entries.filter((e) => e.kind === "loan_in").map((e) => e.amount)).toEqual([amount]);
    const payments = entries.filter((e) => e.kind === "loan_payment");
    expect(payments.length).toBeGreaterThanOrEqual(1);
    expect(payments[0]!.amount).toBe(-quote.weekly);
    const after = (await saveService.getSquadById(saveId, "33"))!;
    expect(after.bankLoan?.remaining).toBe(quote.total + payments.reduce((t, e) => t + e.amount, 0));
    // The ledger still sums to the balance.
    expect(entries.reduce((t, e) => t + e.amount, 0)).toBe(after.finances!.budget);

    // Leaving the club: an AI club has no cash, so the loan ends and comes back as the mark for the manager's career.
    const ref = (await saveService.resolveSquadId(saveId, "33"))!;
    const debt = await releaseHumanClub(saveService, saveId, seatId, { squadId: "33", date });
    expect(debt?.amount).toBe(after.bankLoan!.remaining);
    const { bankLoan } = (await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug))!;
    expect(bankLoan).toBeUndefined();
  }, 120_000);
});
