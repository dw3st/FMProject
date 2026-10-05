import type { Squad } from "@/types/playerTypes";

/**
 * Every kind of money movement the player's club ledger tracks. See
 * `.claude/rules/game/finances.md` and the Prizes and Finances design spec §2.
 */
export type LedgerKind =
  | "broadcasting"
  | "commercial"
  | "wages"
  | "operational"
  | "staff"
  | "gate"
  | "prize"
  | "transfer_in"
  | "transfer_out"
  /**
   * The manager changed club (`.claude/rules/game/jobs.md`): `ref.stage` "leave" takes the old
   * club's balance out of the ledger, "arrive" brings the new club's starting balance in, so the
   * ledger keeps summing to the current club's budget.
   */
  | "club_change"
  /** Club facilities (`.claude/rules/game/facilities.md`): monthly instalments of a project. */
  | "facilities"
  /** Weekly upkeep of the training ground and academy above the club's implied level. */
  | "facilities_upkeep"
  /** The board's share of a project's instalment (board ≥ 85). */
  | "board_funding"
  /**
   * The human manager's weekly wage (`.claude/rules/game/jobs.md` → "Contrato do técnico"); `ref.stage`
   * "severance" is the payoff when he is sacked.
   */
  | "manager";

/** One line of the club's cash extract. `amount` is signed (income positive, expense negative). */
export interface LedgerEntry {
  /** "YYYY-MM-DD" */
  date: string;
  kind: LedgerKind;
  amount: number;
  /** Origin shown in the UI/inbox, e.g. "Champions League · Quartas", "Premier League · 3º lugar". */
  label: string;
  ref?: {
    competition?: string;
    stage?: string;
    opponentId?: string;
    playerId?: string;
    /** League prize: final table position (1-based). */
    position?: number;
    /** Transfers: the other club's name. */
    clubName?: string;
    playerName?: string;
    /** Facilities lines: the project kind ("stand", "comfort", "training", "academy"). */
    facility?: string;
    /** Stand projects: which stand. */
    stand?: string;
  };
}

const LEDGER_KINDS: LedgerKind[] = [
  "broadcasting",
  "commercial",
  "wages",
  "operational",
  "staff",
  "gate",
  "prize",
  "transfer_in",
  "transfer_out",
  "club_change",
  "facilities",
  "facilities_upkeep",
  "board_funding",
  "manager",
];

/**
 * Pure: a new squad with its budget moved by `entry.amount`. No clamp — the balance may go
 * negative (see design spec §2, "Extrato": the human club's cash can go negative, unlike AI
 * transfer budgets). A squad without `finances` (should never happen for the player's club) is
 * returned unchanged, since there is nowhere to record a balance.
 */
export function applyMoney(squad: Squad, entry: LedgerEntry): Squad {
  if (!squad.finances) return squad;
  return {
    ...squad,
    finances: {
      ...squad.finances,
      budget: squad.finances.budget + entry.amount,
    },
  };
}

/** Sum of `amount` per kind. Every `LedgerKind` is present, 0 when the entry list has none of it. */
export function totalsByKind(entries: LedgerEntry[]): Record<LedgerKind, number> {
  const totals = Object.fromEntries(LEDGER_KINDS.map((k) => [k, 0])) as Record<LedgerKind, number>;
  for (const e of entries) totals[e.kind] += e.amount;
  return totals;
}

/** The Monday ("YYYY-MM-DD") of the ISO week containing `date` ("YYYY-MM-DD"). */
export function isoWeekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = utc.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysSinceMonday);
  return utc.toISOString().slice(0, 10);
}

/** Net amount per ISO week (Monday-start), oldest → newest. */
export function weeklyNet(entries: LedgerEntry[]): { weekStart: string; net: number }[] {
  const byWeek = new Map<string, number>();
  for (const e of entries) {
    const week = isoWeekStart(e.date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + e.amount);
  }
  return [...byWeek.entries()]
    .map(([weekStart, net]) => ({ weekStart, net }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0));
}
