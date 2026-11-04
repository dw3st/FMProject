import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import type { BankLoan } from "@/types/bankLoanTypes";
import type { Squad } from "@/types/playerTypes";

export const BANK_LOAN = {
  /** Largest loan, as a share of the club's annual revenue. */
  REVENUE_SHARE: 0.25,
  /** Simple interest per season. */
  ANNUAL_RATE: 0.08,
  WEEKS_PER_SEASON: 52,
  /** The board authorises from this level. */
  MIN_BOARD: 25,
  MIN_AMOUNT: 100_000,
  /** Amounts offered are multiples of this. */
  STEP: 100_000,
  TERMS: [1, 2],
} as const;

export type BankLoanRefusal = "loanActive" | "boardLow" | "invalidAmount" | "overLimit" | "invalidSeasons";

export function bankLoanLimit(squad: Squad): number {
  return Math.floor((wageRevenueBasisOf(squad) * BANK_LOAN.REVENUE_SHARE) / BANK_LOAN.STEP) * BANK_LOAN.STEP;
}

/** The four amounts the screen offers: a quarter of the limit up to all of it, without repeats or tiny ones. */
export function bankLoanAmounts(limit: number): number[] {
  const amounts = [0.25, 0.5, 0.75, 1].map((f) => Math.floor((limit * f) / BANK_LOAN.STEP) * BANK_LOAN.STEP);
  return [...new Set(amounts)].filter((a) => a >= BANK_LOAN.MIN_AMOUNT);
}

export function bankLoanQuote(amount: number, seasons: number): { total: number; weekly: number; weeks: number; interest: number } {
  const total = Math.round(amount * (1 + BANK_LOAN.ANNUAL_RATE * seasons));
  const weeks = BANK_LOAN.WEEKS_PER_SEASON * seasons;
  return { total, weekly: Math.ceil(total / weeks), weeks, interest: total - amount };
}

export function bankLoanRefusal(squad: Squad, board: number | undefined, amount: unknown, seasons: unknown): BankLoanRefusal | null {
  if (squad.bankLoan) return "loanActive";
  if (board !== undefined && board < BANK_LOAN.MIN_BOARD) return "boardLow";
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < BANK_LOAN.MIN_AMOUNT) return "invalidAmount";
  if (amount > bankLoanLimit(squad)) return "overLimit";
  if (!(BANK_LOAN.TERMS as readonly unknown[]).includes(seasons)) return "invalidSeasons";
  return null;
}

export function newBankLoan(amount: number, seasons: number, date: string): BankLoan {
  const { total, weekly } = bankLoanQuote(amount, seasons);
  return { principal: amount, total, weekly, remaining: total, takenOn: date, seasons };
}

/** What the club pays on this Monday: charged even with no money, never twice on a day, never above what is left. */
export function bankLoanPaymentDue(loan: BankLoan | undefined, date: string): number {
  if (!loan || date <= loan.takenOn || loan.lastPaid === date) return 0;
  return Math.min(loan.weekly, loan.remaining);
}

/** The squad after a payment: the loan is gone once it is paid off. */
export function withBankLoanPayment(squad: Squad, paid: number, date: string): Squad {
  const { bankLoan, ...rest } = squad;
  if (!bankLoan) return squad;
  const remaining = bankLoan.remaining - paid;
  return remaining > 0 ? { ...rest, bankLoan: { ...bankLoan, remaining, lastPaid: date } } : rest;
}
