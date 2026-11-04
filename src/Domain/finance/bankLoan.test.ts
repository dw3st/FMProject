import { describe, expect, test } from "bun:test";
import { computeAdvanceDayMoney } from "@/Domain/advanceDay/financial";
import {
  BANK_LOAN, bankLoanAmounts, bankLoanLimit, bankLoanPaymentDue, bankLoanQuote, bankLoanRefusal, newBankLoan, withBankLoanPayment,
} from "@/Domain/finance/bankLoan";
import type { Squad } from "@/types/playerTypes";

const MONDAY = "2030-10-21";
const squad = (extra: Partial<Squad> = {}) => ({
  id: "c", players: [], wageRevenueBasis: 100_000_000, wageFactor: 1,
  finances: { budget: 0, broadcasting: 60_000_000, commercial: 40_000_000 },
  ...extra,
}) as unknown as Squad;

describe("bank loan", () => {
  test("limit and amounts follow the revenue", () => {
    expect(bankLoanLimit(squad())).toBe(25_000_000);
    expect(bankLoanAmounts(25_000_000)).toEqual([6_200_000, 12_500_000, 18_700_000, 25_000_000]);
    expect(bankLoanAmounts(100_000)).toEqual([100_000]);
    expect(bankLoanAmounts(0)).toEqual([]);
  });

  test("the quote adds 8% a season and the payments cover the total", () => {
    const q = bankLoanQuote(10_000_000, 2);
    expect(q.total).toBe(11_600_000);
    expect(q.interest).toBe(1_600_000);
    expect(q.weeks).toBe(104);
    expect(q.weekly * q.weeks).toBeGreaterThanOrEqual(q.total);
  });

  test("refusals", () => {
    expect(bankLoanRefusal(squad(), 60, 10_000_000, 1)).toBeNull();
    expect(bankLoanRefusal(squad(), undefined, 10_000_000, 2)).toBeNull();
    expect(bankLoanRefusal(squad(), BANK_LOAN.MIN_BOARD, 10_000_000, 1)).toBeNull();
    expect(bankLoanRefusal(squad(), BANK_LOAN.MIN_BOARD - 1, 10_000_000, 1)).toBe("boardLow");
    expect(bankLoanRefusal(squad(), 60, 25_100_000, 1)).toBe("overLimit");
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

  test("the Monday bill carries the payment, with or without money; other days do not", () => {
    const bankLoan = newBankLoan(1_000_000, 1, MONDAY);
    const lines = (date: string) => computeAdvanceDayMoney({ currentDate: date, playerSquad: squad({ bankLoan }), homeFixturesToday: [] })
      .filter((e) => e.kind === "loan_payment");
    expect(lines("2030-10-28").map((e) => e.amount)).toEqual([-bankLoan.weekly]);
    expect(lines(MONDAY)).toEqual([]);
    expect(lines("2030-10-29")).toEqual([]);
  });
});
