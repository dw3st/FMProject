import { addDays, daysBetween } from "@/Domain/dates";
import { addYearsIso } from "@/Domain/contracts/contracts";

/**
 * The human manager's contract (`.claude/rules/game/jobs.md` → "Contrato do técnico", Etapa 25):
 * weekly wage in the ledger, length, renewal by the board, severance and compensation. Pure.
 * AI managers have none of this (rules, not simulation).
 */
export const MANAGER_CONTRACT = {
  /** Weekly wage = revenue × (MIN_SHARE + SPAN × reputation/100) / 52: 1,5% to 4% of the annual revenue. */
  MIN_SHARE: 0.015,
  SPAN: 0.025,
  /** New career: seasons of the first contract. */
  INITIAL_SEASONS: 2,
  /** Job offers: 1..3 seasons by the club's prestige (≥ MID 2, ≥ HIGH 3). */
  OFFER_SEASONS_MID: 0.35,
  OFFER_SEASONS_HIGH: 0.7,
  /** The board decides on the renewal once the club played this share of the rounds. */
  RENEWAL_PROGRESS: 0.85,
  /** Board ≥ GOOD: 2 seasons at the new wage; ≥ OK: 1 season at the current wage; below: no renewal. */
  RENEWAL_GOOD: 60,
  RENEWAL_OK: 40,
  /** Warning this many days before a contract that will not continue ends. */
  END_NOTICE_DAYS: 7,
  /** Sacked: SEVERANCE_SHARE × wage × weeks left (max MAX_WEEKS) to the manager. */
  SEVERANCE_SHARE: 0.5,
  /** Leaving mid-contract: the new club pays the old one COMPENSATION_SHARE × wage × weeks left. */
  COMPENSATION_SHARE: 0.5,
  MAX_WEEKS: 52,
  /** No compensation in the contract's last NO_COMPENSATION_DAYS. */
  NO_COMPENSATION_DAYS: 30,
} as const;

export interface ManagerContract {
  squadId: string;
  /** Weekly wage, EUR. */
  wage: number;
  /** Last day (the season end of the club's league). */
  until: string;
  signed: string;
}

export interface ManagerRenewalOffer {
  offeredOn: string;
  /** Last day to answer (the rollover). */
  expires: string;
  wage: number;
  seasons: number;
}

/** Weekly wage from the club's revenue basis (`wageRevenueBasis`) and the manager's reputation. */
export function managerWeeklyWage(revenueBasis: number, reputation: number): number {
  const c = MANAGER_CONTRACT;
  const share = c.MIN_SHARE + c.SPAN * Math.min(1, Math.max(0, reputation / 100));
  return Math.round((Math.max(0, revenueBasis) * share) / 52);
}

/** Contract end: the club's season end moved `seasons − 1` years on. */
export function contractUntil(seasonEnd: string, seasons: number): string {
  return addYearsIso(seasonEnd, Math.max(0, seasons - 1));
}

/** Seasons a job offer proposes, by the club's prestige. */
export function offerSeasons(prestige: number): number {
  const c = MANAGER_CONTRACT;
  return prestige >= c.OFFER_SEASONS_HIGH ? 3 : prestige >= c.OFFER_SEASONS_MID ? 2 : 1;
}

/** Whole weeks from `date` to `until`, capped at MAX_WEEKS (0 once past). */
export function weeksLeft(date: string, until: string): number {
  return Math.min(MANAGER_CONTRACT.MAX_WEEKS, Math.max(0, Math.floor(daysBetween(date, until) / 7)));
}

/** What the sacked manager receives (only `managerEarnings`, D9). */
export function severancePay(contract: Pick<ManagerContract, "wage" | "until">, date: string): number {
  return Math.round(MANAGER_CONTRACT.SEVERANCE_SHARE * contract.wage * weeksLeft(date, contract.until));
}

/**
 * D3: compensation the new club pays the old one when the manager leaves mid-contract. Nothing in
 * the contract's last month or after it ended.
 */
export function compensationFee(contract: Pick<ManagerContract, "wage" | "until"> | undefined, date: string): number {
  if (!contract) return 0;
  if (date >= addDays(contract.until, -MANAGER_CONTRACT.NO_COMPENSATION_DAYS)) return 0;
  return Math.round(MANAGER_CONTRACT.COMPENSATION_SHARE * contract.wage * weeksLeft(date, contract.until));
}

/**
 * The board's decision on a contract ending this season: ≥ 60 two seasons with the wage of today's
 * reputation, 40..59 one season at the current wage, below 40 no renewal (null).
 */
export function renewalDecision(args: { board: number; currentWage: number; reputationWage: number }): { seasons: number; wage: number } | null {
  const c = MANAGER_CONTRACT;
  if (args.board >= c.RENEWAL_GOOD) return { seasons: 2, wage: Math.max(args.currentWage, args.reputationWage) };
  if (args.board >= c.RENEWAL_OK) return { seasons: 1, wage: args.currentWage };
  return null;
}

/** Is the renewal decision due: the contract ends with this season and the club played 85% of it. */
export function renewalDue(args: { until: string; seasonEnd: string; played: number; totalRounds: number }): boolean {
  if (args.until > args.seasonEnd || args.totalRounds <= 0) return false;
  return args.played >= args.totalRounds * MANAGER_CONTRACT.RENEWAL_PROGRESS;
}
