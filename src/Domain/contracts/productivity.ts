import type { ContractBonus, RosterPlayer } from "@/types/playerTypes";
import { getMainRole, type MainRole } from "@/Domain/roles";

/**
 * Productivity contract (12.32, tester report): an older player takes a lower fixed wage plus a bonus per official
 * match played and per goal. Only the human club offers one; the AI keeps fixed wages.
 */
export const PRODUCTIVITY = {
  /** From this age on (renewal or free signing). */
  MIN_AGE: 30,
  /** The fixed wage must be at least this share of his demand. */
  FIXED_MIN_SHARE: 0.6,
  /** Share of the club's matches he is expected to play (one official match a week on average). */
  EXPECTED_PLAY: 0.8,
  /** Goals per game used when he has fewer than `MIN_APPS` games to judge by. */
  GOALS_FALLBACK: { GK: 0, Defender: 0.04, Midfielder: 0.12, Forward: 0.35 } as Record<MainRole, number>,
  MIN_APPS: 5,
  /** Highest bonus a request may carry, EUR (sanity bound). */
  MAX_BONUS: 50_000_000,
} as const;

export function productivityAllowed(player: Pick<RosterPlayer, "age">): boolean {
  return player.age >= PRODUCTIVITY.MIN_AGE;
}

/** His goals per game: this season, else his last history row with enough games, else the line's fallback. */
export function goalsPerGame(player: RosterPlayer): number {
  const log = player.seasonLog;
  if (log && log.appearances >= PRODUCTIVITY.MIN_APPS) return log.goals / log.appearances;
  const rows = player.history ?? [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.apps >= PRODUCTIVITY.MIN_APPS) return r.goals / r.apps;
  }
  return PRODUCTIVITY.GOALS_FALLBACK[getMainRole(player.positions[0] ?? "CM")];
}

/** What the bonus is worth to him per week, EUR (expected games × (appearance + goals × goal bonus)). */
export function expectedWeeklyBonus(player: RosterPlayer, bonus: ContractBonus): number {
  return Math.round(PRODUCTIVITY.EXPECTED_PLAY * (bonus.appearance + goalsPerGame(player) * bonus.goal));
}

/** The `bonus` field of a request: absent/null = none; malformed = "invalid"; both zero = none. */
export function parseContractBonus(v: unknown): ContractBonus | null | "invalid" {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object") return "invalid";
  const { appearance, goal } = v as Record<string, unknown>;
  const ok = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= PRODUCTIVITY.MAX_BONUS;
  if (!ok(appearance) || !ok(goal)) return "invalid";
  if (appearance === 0 && goal === 0) return null;
  return { appearance: appearance as number, goal: goal as number };
}

/** The bonus owed for one match: played (in the ratings) and his goals. */
export function matchBonus(bonus: ContractBonus, goals: number): number {
  return bonus.appearance + Math.max(0, goals) * bonus.goal;
}

/** The official match of the day as the payment needs it (a `MatchEvent` fits). */
export interface ProductivityMatch {
  competition: string;
  home: string;
  away: string;
  playerRatings: Record<string, number>;
  scorers?: { playerId: string; goals: number }[];
  goals?: { playerId: string }[];
}

/**
 * Ledger lines (`wages`, `ref.stage = "productivity"`) for the club's productivity contracts after today's official
 * matches: each player on a bonus who played (has a rating) gets the appearance bonus plus the goal bonus per goal.
 * Youth and national matches never reach here (they are not in the day's `events`).
 */
export function productivityEntries(
  squad: { id: string; players: RosterPlayer[] },
  matches: ProductivityMatch[],
  date: string,
): { date: string; kind: "wages"; amount: number; label: string; ref: { stage: string; playerId: string; playerName: string } }[] {
  const out: ReturnType<typeof productivityEntries> = [];
  const onBonus = squad.players.filter((p) => p.contract?.bonus && !p.loan);
  if (onBonus.length === 0) return out;
  for (const m of matches) {
    if (m.home !== squad.id && m.away !== squad.id) continue;
    for (const p of onBonus) {
      if (m.playerRatings[p.id] === undefined) continue;
      const scored = m.goals
        ? m.goals.filter((g) => g.playerId === p.id).length
        : (m.scorers ?? []).filter((s) => s.playerId === p.id).reduce((t, s) => t + s.goals, 0);
      const amount = matchBonus(p.contract!.bonus!, scored);
      if (amount <= 0) continue;
      out.push({ date, kind: "wages", amount: -amount, label: `Productivity bonus: ${p.name}`, ref: { stage: "productivity", playerId: p.id, playerName: p.name } });
    }
  }
  return out;
}
