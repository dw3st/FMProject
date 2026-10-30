/**
 * Friendly termination (tester suggestion): the club ends a player's contract early by paying him a share of what is
 * left on it, by how much he matters to the squad, capped at half his market value. He leaves as a free agent. Pure.
 */
import { MIN_BY_ROLE } from "@/Domain/contracts/freeAgents";
import { getMainRole } from "@/Domain/roles";
import { suggestedStatuses } from "@/Domain/morale/morale";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { SquadStatus } from "@/types/moraleTypes";

export const TERMINATION = {
  /** Share of the wages left on the contract, by squad role. */
  SHARE: { key: 1, starter: 0.75, rotation: 0.5, backup: 0.5, youth: 0.5 } satisfies Record<SquadStatus, number>,
  /** A contract with this few days left pays it all (almost nothing anyway). */
  NEAR_END_DAYS: 183,
  /** Never more than this share of his market value. */
  VALUE_CAP: 0.5,
  /** Rounded to this (EUR). */
  ROUND: 1000,
} as const;

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

export interface TerminationQuote {
  fee: number;
  /** Weeks left on the contract and the wages they add up to. */
  weeksLeft: number;
  wagesLeft: number;
  /** The share of those wages paid, by his role (1 when the contract is near its end). */
  share: number;
  status: SquadStatus;
  /** True when the half-of-market-value cap set the fee. */
  capped: boolean;
}

/** What it costs to end `player`'s contract on `date` (null without a contract running). */
export function terminationQuote(player: RosterPlayer, squad: Pick<Squad, "players">, date: string, marketValue: number): TerminationQuote | null {
  const c = player.contract;
  if (!c || c.until <= date) return null;
  const days = daysBetween(date, c.until);
  const weeksLeft = Math.ceil(days / 7);
  const wagesLeft = weeksLeft * c.wage;
  const status = player.squadStatus ?? suggestedStatuses(squad)[player.id] ?? "backup";
  const share = days <= TERMINATION.NEAR_END_DAYS ? 1 : TERMINATION.SHARE[status];
  const raw = wagesLeft * share;
  const cap = Math.max(0, marketValue) * TERMINATION.VALUE_CAP;
  const capped = raw > cap;
  const fee = Math.round((capped ? cap : raw) / TERMINATION.ROUND) * TERMINATION.ROUND;
  return { fee, weeksLeft, wagesLeft, share, status, capped };
}

/** True when letting `playerId` go leaves his line below the squad minimum. */
export function terminationBreaksDepth(squad: Pick<Squad, "players">, playerId: string): boolean {
  const player = squad.players.find((p) => p.id === playerId);
  if (!player) return false;
  const line = getMainRole(player.positions[0] ?? "");
  const left = squad.players.filter((p) => p.id !== playerId && getMainRole(p.positions[0] ?? "") === line).length;
  return left < MIN_BY_ROLE[line];
}
