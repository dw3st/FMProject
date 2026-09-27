import { gateRevenue, type GateKind } from "@/Domain/finance/gate";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import { squadWeeklyWages } from "@/Domain/finance/wages";
import type { Squad } from "@/types/playerTypes";

/** One home fixture of the player's club today, already resolved to a competition kind + label. */
export interface PlayerHomeFixtureToday {
  /** Competition slug: the league slug, a cup slug (`cup_<país>`), or a continental slug. */
  competition: string;
  kind: GateKind;
  /** Competition display name for the ledger entry, e.g. "Champions League". */
  label: string;
  /** Neutral-venue fixture (a cup/continental final) — always 0 gate revenue. */
  neutral?: boolean;
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
}): LedgerEntry[] {
  const { currentDate, playerSquad, homeFixturesToday } = args;
  if (!playerSquad) return [];

  const entries: LedgerEntry[] = [];

  const dayOfWeek = new Date(currentDate + "T12:00:00").getDay();
  if (dayOfWeek === 1) {
    const weeklyCommercial = Math.round((playerSquad.finances?.commercial ?? 0) / 52);
    const weeklyWages = squadWeeklyWages(playerSquad.players);
    const weeklyOperational = Math.round(weeklyWages * 0.1);
    entries.push({ date: currentDate, kind: "commercial", amount: weeklyCommercial, label: "Weekly commercial revenue" });
    entries.push({ date: currentDate, kind: "wages", amount: -weeklyWages, label: "Weekly wages" });
    entries.push({ date: currentDate, kind: "operational", amount: -weeklyOperational, label: "Operational costs" });
  }

  const capacity = playerSquad.venue?.capacity ?? 0;
  for (const f of homeFixturesToday) {
    const amount = gateRevenue(capacity, f.kind, f.neutral);
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
