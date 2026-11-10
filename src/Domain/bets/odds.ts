import { BETS } from "@/Domain/bets/betsConfig";
import { QUICK_SIM_CONFIG } from "@/GameEngine/Configs/QuickSimConfig";
import type { BetMarkets } from "@/types/betTypes";

type Side = "home" | "away";
type Group = "GK" | "DEF" | "MID" | "FWD";

export interface ScorerShare {
  playerId: string;
  playerName: string;
  side: Side;
  /** His part of the side's goals (0..1). */
  share: number;
}

function poisson(k: number, lambda: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

/** P(home scores i, away scores j), i and j in 0..MAX_GOALS, normalised. */
export function scoreGrid(xgHome: number, xgAway: number): number[][] {
  const n = BETS.MAX_GOALS + 1;
  const grid = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => poisson(i, xgHome) * poisson(j, xgAway)));
  const total = grid.flat().reduce((a, b) => a + b, 0);
  return grid.map((row) => row.map((p) => p / total));
}

export function oddsFromProb(p: number): number {
  if (p <= 0) return BETS.MAX_ODDS;
  const odds = Math.round((1 / (p * (1 + BETS.MARGIN))) * 100) / 100;
  return Math.min(BETS.MAX_ODDS, Math.max(BETS.MIN_ODDS, odds));
}

/** Each player's part of his side's goals (the quickSim's goal weight × finishing). */
export function scorerShares(players: { playerId: string; playerName: string; side: Side; group: Group; finishing: number }[]): ScorerShare[] {
  const weighted = players.map((p) => ({ ...p, w: QUICK_SIM_CONFIG.ROLE_GOAL_WEIGHT[p.group] * p.finishing })).filter((p) => p.w > 0);
  const totals: Record<Side, number> = { home: 0, away: 0 };
  for (const p of weighted) totals[p.side] += p.w;
  return weighted.map(({ playerId, playerName, side, w }) => ({ playerId, playerName, side, share: w / totals[side] }));
}

export function buildMarkets(input: { xgHome: number; xgAway: number; scorers: ScorerShare[] }): BetMarkets {
  const { xgHome, xgAway, scorers } = input;
  const grid = scoreGrid(xgHome, xgAway);
  let home = 0, draw = 0, away = 0;
  const scores: { home: number; away: number; p: number }[] = [];
  grid.forEach((row, i) => row.forEach((p, j) => {
    if (i > j) home += p; else if (i === j) draw += p; else away += p;
    scores.push({ home: i, away: j, p });
  }));
  scores.sort((a, b) => b.p - a.p);
  const xgOf = { home: xgHome, away: xgAway };
  return {
    result: [
      { side: "home", odds: oddsFromProb(home) },
      { side: "draw", odds: oddsFromProb(draw) },
      { side: "away", odds: oddsFromProb(away) },
    ],
    scores: scores.map((s) => ({ home: s.home, away: s.away, odds: oddsFromProb(s.p) })),
    scorers: scorers
      .map((s) => ({ playerId: s.playerId, playerName: s.playerName, side: s.side, odds: oddsFromProb(1 - Math.exp(-xgOf[s.side] * s.share)) }))
      .sort((a, b) => a.odds - b.odds),
  };
}

/** The own club's game: only what backs him. `null` = not his game, nothing changes. */
export function onlyForOwnClub(m: BetMarkets, own: Side | null): BetMarkets {
  if (!own) return m;
  return {
    result: m.result.filter((r) => r.side === own),
    scores: m.scores.filter((s) => (own === "home" ? s.home > s.away : s.away > s.home)),
    scorers: m.scorers.filter((s) => s.side === own),
  };
}

/** What the screen offers: the likeliest scores and the likeliest scorers of each side. */
export function trimMarkets(m: BetMarkets): BetMarkets {
  const perSide = (side: Side) => m.scorers.filter((s) => s.side === side).slice(0, BETS.SCORERS_SHOWN);
  return { result: m.result, scores: m.scores.slice(0, BETS.SCORES_SHOWN), scorers: [...perSide("home"), ...perSide("away")] };
}
