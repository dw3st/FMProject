import { clamp } from "@/Domain/math";
import type { NationalStageName, NationalTournament } from "@/types/nationalTypes";

/** FIFA SUM ranking (`.claude/rules/game/national-teams.md` → "Ranking"), pure. */

export const ELO = {
  SCALE: 600,
  /** Importance of the match. */
  I: {
    friendly: 10,
    qualifier: 25,
    continentalEarly: 35,
    continentalLate: 40,
    wcEarly: 50,
    wcLate: 60,
  },
  /** Shootout: the winner scores 0.75, the loser 0.5. */
  SHOOTOUT_WIN: 0.75,
  SHOOTOUT_LOSS: 0.5,
  /** Starting points: BASE + PER_LEVEL × (XI level − LEVEL_REF), clamped. */
  BASE: 1000,
  PER_LEVEL: 220,
  LEVEL_REF: 3,
  MIN: 700,
  MAX: 1900,
} as const;

export type EloMatchKind =
  | { kind: "friendly" }
  | { kind: "qualifier" }
  | { kind: "tournament"; tournament: NationalTournament; stage: NationalStageName };

export function importanceOf(m: EloMatchKind): number {
  if (m.kind === "friendly") return ELO.I.friendly;
  if (m.kind === "qualifier") return ELO.I.qualifier;
  const late = m.stage === "qf" || m.stage === "sf" || m.stage === "final";
  if (m.tournament === "wc") return late ? ELO.I.wcLate : ELO.I.wcEarly;
  return late ? ELO.I.continentalLate : ELO.I.continentalEarly;
}

export function expectedResult(points: number, opponent: number): number {
  return 1 / (Math.pow(10, -(points - opponent) / ELO.SCALE) + 1);
}

/**
 * New points of both sides. `result` is the score after extra time; `shootoutWinner` when a shootout decided it.
 * A knockout loss of a final tournament never takes points away.
 */
export function eloAfterMatch(args: {
  home: number;
  away: number;
  score: { home: number; away: number };
  shootoutWinner?: "home" | "away";
  match: EloMatchKind;
}): { home: number; away: number } {
  const { home, away, score, shootoutWinner, match } = args;
  const I = importanceOf(match);
  let wHome: number;
  if (shootoutWinner) wHome = shootoutWinner === "home" ? ELO.SHOOTOUT_WIN : ELO.SHOOTOUT_LOSS;
  else wHome = score.home > score.away ? 1 : score.home < score.away ? 0 : 0.5;
  let wAway: number;
  if (shootoutWinner) wAway = shootoutWinner === "away" ? ELO.SHOOTOUT_WIN : ELO.SHOOTOUT_LOSS;
  else wAway = 1 - wHome;
  let dHome = I * (wHome - expectedResult(home, away));
  let dAway = I * (wAway - expectedResult(away, home));
  const knockout = match.kind === "tournament" && match.stage !== "group";
  if (knockout) {
    dHome = Math.max(0, dHome);
    dAway = Math.max(0, dAway);
  }
  return { home: round1(home + dHome), away: round1(away + dAway) };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Starting points from the level (mean overall of the XI). */
export function initialPoints(level: number): number {
  return round1(clamp(ELO.BASE + ELO.PER_LEVEL * (level - ELO.LEVEL_REF), ELO.MIN, ELO.MAX));
}

/** Ranking order: points desc, then nation name. */
export function rankTeams<T extends { nation: string; elo: number }>(teams: T[]): T[] {
  return [...teams].sort((a, b) => b.elo - a.elo || a.nation.localeCompare(b.nation));
}
