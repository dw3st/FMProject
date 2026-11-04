import { describe, expect, test } from "bun:test";
import { computeAdvanceDayMoney } from "@/Domain/advanceDay/financial";
import {
  BANK_LOAN, bankLoanAmounts, bankLoanLimit, bankLoanPaymentDue, bankLoanQuote, bankLoanRefusal, newBankLoan, recordUnpaidDebt,
  unpaidDebtOf, unpaidDebtPenalty, withBankLoanPayment,
} from "@/Domain/finance/bankLoan";
import { managerReputation, moveHumanManager, sackHumanManager } from "@/Domain/jobs/jobs";
import type { ManagerRecord } from "@/types/managerTypes";
import type { Squad } from "@/types/playerTypes";

const MONDAY = "2030-10-21";
const squad = (extra: Partial<Squad> = {}) => ({
  id: "c", players: [], wageRevenueBasis: 100_000_000, wageFactor: 1,
  finances: { budget: 0, broadcasting: 60_000_000, commercial: 40_000_000 },
  ...extra,
}) as unknown as Squad;

describe("bank loan", () => {
  test("limit and amounts follow the revenue", () => {
    expect(bankLoanLimit(squad())).toBe(15_000_000);
    expect(bankLoanAmounts(15_000_000)).toEqual([3_700_000, 7_500_000, 11_200_000, 15_000_000]);
    expect(bankLoanAmounts(100_000)).toEqual([100_000]);
    expect(bankLoanAmounts(0)).toEqual([]);
  });

  test("the quote adds 15% a season and the payments cover the total", () => {
    const q = bankLoanQuote(10_000_000, 2);
    expect(q.total).toBe(13_000_000);
    expect(q.interest).toBe(3_000_000);
    expect(q.weeks).toBe(104);
    expect(q.weekly * q.weeks).toBeGreaterThanOrEqual(q.total);
  });

  test("refusals", () => {
    expect(bankLoanRefusal(squad(), 60, 10_000_000, 1)).toBeNull();
    expect(bankLoanRefusal(squad(), undefined, 10_000_000, 2)).toBeNull();
    expect(bankLoanRefusal(squad(), BANK_LOAN.MIN_BOARD, 10_000_000, 1)).toBeNull();
    expect(bankLoanRefusal(squad(), BANK_LOAN.MIN_BOARD - 1, 10_000_000, 1)).toBe("boardLow");
    expect(bankLoanRefusal(squad(), 60, 15_100_000, 1)).toBe("overLimit");
    expect(bankLoanRefusal(squad(), 60, 50_000, 1)).toBe("invalidAmount");
    expect(bankLoanRefusal(squad(), 60, "5", 1)).toBe("invalidAmount");
    expect(bankLoanRefusal(squad(), 60, 10_000_000, 3)).toBe("invalidSeasons");
    expect(bankLoanRefusal(squad({ bankLoan: newBankLoan(1_000_000, 1, MONDAY) }), 60, 1_000_000, 1)).toBe("loanActive");
  });

  test("a payment is due on a later Monday, once, and the last one pays what is left", () => {
    const loan = newBankLoan(1_000_000, 1, MONDAY);
    expect(bankLoanPaymentDue(loan, MONDAY)).toBe(0);
    expect(bankLoanPaymentDue(loan, "2030-10-28")).toBe(loan.weekly);
    expect(bankLoanPaymentDue({ ...loan, lastPaid: "2030-10-28" }, "2030-10-28")).toBe(0);
    expect(bankLoanPaymentDue({ ...loan, remaining: 5 }, "2030-10-28")).toBe(5);
    expect(bankLoanPaymentDue(undefined, "2030-10-28")).toBe(0);
  });

  test("paying reduces the debt and the last payment removes the loan", () => {
    const loan = newBankLoan(1_000_000, 1, MONDAY);
    const after = withBankLoanPayment(squad({ bankLoan: loan }), loan.weekly, "2030-10-28");
    expect(after.bankLoan?.remaining).toBe(loan.total - loan.weekly);
    expect(after.bankLoan?.lastPaid).toBe("2030-10-28");
    expect(withBankLoanPayment(squad({ bankLoan: { ...loan, remaining: loan.weekly } }), loan.weekly, "2030-10-28").bankLoan).toBeUndefined();
  });

  test("a debt left behind marks the career and lowers the reputation, once", () => {
    const me: ManagerRecord = { id: "seat:s", name: "M", squadId: "c", seatId: "s", points: 0, seasons: 0, titles: [], clubs: [{ squadId: "c", from: "2030-01-01" }] };
    const loan = newBankLoan(10_000_000, 2, MONDAY);
    expect(unpaidDebtOf(squad(), MONDAY)).toBeNull();
    const debt = unpaidDebtOf(squad({ name: "Club", bankLoan: loan }), "2030-11-01")!;
    expect(debt.amount).toBe(13_000_000);
    expect(debt.penalty).toBe(12); // 5 + 50 × 13%
    expect(recordUnpaidDebt(recordUnpaidDebt(me, debt), debt).unpaidDebts).toHaveLength(1);
    const before = managerReputation([me], 60, 2030, "s");
    const moved = moveHumanManager([me], { seatId: "s", toSquadId: "d", fromSquadId: "c", fromClubName: "Club", date: debt.date, unpaidDebt: debt });
    const sacked = sackHumanManager([me], { seatId: "s", date: debt.date, clubName: "Club", unpaidDebt: debt });
    for (const list of [moved, sacked]) {
      expect(list.find((m) => m.seatId === "s")!.unpaidDebts).toEqual([debt]);
      expect(managerReputation(list, 60, 2030, "s")).toBeCloseTo(before - 12, 5);
    }
    expect(managerReputation(moveHumanManager([me], { seatId: "s", toSquadId: "d", fromSquadId: "c", date: debt.date }), 60, 2030, "s")).toBeCloseTo(before, 5);
    const many = { ...me, unpaidDebts: [debt, { ...debt, date: "a" }, { ...debt, date: "b" }, { ...debt, date: "c" }] };
    expect(unpaidDebtPenalty(many)).toBe(BANK_LOAN.DEBT_PENALTY_TOTAL_MAX);
  });

  test("the Monday bill carries the payment, with or without money; other days do not", () => {
    const bankLoan = newBankLoan(1_000_000, 1, MONDAY);
    const lines = (date: string) => computeAdvanceDayMoney({ currentDate: date, playerSquad: squad({ bankLoan }), homeFixturesToday: [] })
      .filter((e) => e.kind === "loan_payment");
    expect(lines("2030-10-28").map((e) => e.amount)).toEqual([-bankLoan.weekly]);
    expect(lines(MONDAY)).toEqual([]);
    expect(lines("2030-10-29")).toEqual([]);
  });
});
