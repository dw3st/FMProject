import { gateFromAttendance, gateRevenue, type GateKind } from "@/Domain/finance/gate";
import { weeklyUpkeep } from "@/Domain/facilities/facilities";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import { squadWeeklyWages, wageFactorOf, wageRevenueBasisOf } from "@/Domain/finance/wages";
import { squadStaffWages } from "@/Domain/staff/staff";
import type { Squad } from "@/types/playerTypes";

/** Operational cost, as a share of annual revenue, charged weekly (`OPERATIONAL_COST_SHARE × wageRevenueBasisOf(squad) / 52`). */
export const OPERATIONAL_COST_SHARE = 0.25;

/**
 * The weekly operational cost charged every Monday in `computeAdvanceDayMoney` — pulled out so
 * the FinancesScreen can project it with the exact same formula the server uses, instead of
 * re-deriving it.
 */
export function weeklyOperationalCost(squad: Squad): number {
  return Math.round((OPERATIONAL_COST_SHARE * wageRevenueBasisOf(squad)) / 52);
}

/** One home fixture of the player's club today, already resolved to a competition kind + label. */
export interface PlayerHomeFixtureToday {
  /** Competition slug: the league slug, a cup slug (`cup_<país>`), or a continental slug. */
  competition: string;
  kind: GateKind;
  /** Competition display name for the ledger entry, e.g. "Champions League". */
  label: string;
  /** Neutral-venue fixture (a cup/continental final) — always 0 gate revenue. */
  neutral?: boolean;
  /**
   * Human club with facilities (`.claude/rules/game/facilities.md`): the attendance of this game
   * (min(capacity, demand)) and the comfort price multiplier. Absent = the old capacity × fill gate.
   */
  attendance?: number;
  priceMult?: number;
}

/**
 * Ledger entries for the player's club on this advance-day tick: on a Monday, separate
 * commercial/wages/operational lines; for every home fixture today (any competition — league,
 * cup, continental), a `gate` line. Pure — the caller (`recordMoney`, sequentially, one entry at a
 * time) applies each to the squad's budget and persists it.
 */
export function computeAdvanceDayMoney(args: {
  currentDate: string;
  playerSquad: Squad | null;
  homeFixturesToday: PlayerHomeFixtureToday[];
  /** Stadium fill from the club's fans (`stadiumFillRate`); absent = the default `GATE.FILL_RATE`. */
  fillRate?: number;
  /**
   * Wages the club still pays for its players out on loan (`parentLoanWages`,
   * `.claude/rules/game/negotiation.md`), added to the weekly wages line.
   */
  loanedOutWages?: number;
  /** The human manager's weekly wage (`.claude/rules/game/jobs.md` → "Contrato do técnico"), charged on Mondays. */
  managerWage?: number;
}): LedgerEntry[] {
  const { currentDate, playerSquad, homeFixturesToday, fillRate } = args;
  if (!playerSquad) return [];

  const entries: LedgerEntry[] = [];

  const dayOfWeek = new Date(currentDate + "T12:00:00").getDay();
  if (dayOfWeek === 1) {
    const weeklyCommercial = Math.round((playerSquad.finances?.commercial ?? 0) / 52);
    const weeklyWages = squadWeeklyWages(playerSquad.players, wageFactorOf(playerSquad)) + Math.max(0, args.loanedOutWages ?? 0);
    const weeklyOperational = weeklyOperationalCost(playerSquad);
    entries.push({ date: currentDate, kind: "commercial", amount: weeklyCommercial, label: "Weekly commercial revenue" });
    entries.push({ date: currentDate, kind: "wages", amount: -weeklyWages, label: "Weekly wages" });
    entries.push({ date: currentDate, kind: "operational", amount: -weeklyOperational, label: "Operational costs" });
    const weeklyStaff = squadStaffWages(playerSquad.staff, currentDate);
    if (weeklyStaff > 0) {
      entries.push({ date: currentDate, kind: "staff", amount: -weeklyStaff, label: "Technical staff" });
    }
    if ((args.managerWage ?? 0) > 0) {
      entries.push({ date: currentDate, kind: "manager", amount: -Math.round(args.managerWage!), label: "Manager wage" });
    }
    // Training ground and academy above the club's implied level (`.claude/rules/game/facilities.md`).
    const upkeep = weeklyUpkeep(playerSquad, wageRevenueBasisOf(playerSquad));
    if (upkeep > 0) {
      entries.push({ date: currentDate, kind: "facilities_upkeep", amount: -upkeep, label: "Facilities upkeep" });
    }
  }

  const capacity = playerSquad.venue?.capacity ?? 0;
  for (const f of homeFixturesToday) {
    const amount = f.attendance !== undefined
      ? gateFromAttendance(f.attendance, f.kind, f.neutral, f.priceMult ?? 1)
      : gateRevenue(capacity, f.kind, f.neutral, fillRate);
    if (amount <= 0) continue;
    entries.push({
      date: currentDate,
      kind: "gate",
      amount,
      label: f.label,
      ref: { competition: f.competition },
    });
  }

  return entries;
}
