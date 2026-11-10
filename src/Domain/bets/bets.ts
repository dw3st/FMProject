import { BETS } from "@/Domain/bets/betsConfig";
import { addDays } from "@/Domain/dates";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { Bet, BetMarkets, BetPick, BetsState } from "@/types/betTypes";

export function emptyBets(): BetsState {
  return { open: [], settled: [] };
}

export function openTotal(state: BetsState): number {
  return state.open.reduce((sum, b) => sum + b.stake, 0);
}

export function maxStake(wallet: number): number {
  return Math.floor(wallet * BETS.MAX_SHARE);
}

function stepOf(stake: number): number {
  if (stake < 10_000) return 1_000;
  if (stake < 100_000) return 10_000;
  if (stake < 1_000_000) return 50_000;
  return 250_000;
}

/** The − and + of the value field. */
export function stepStake(stake: number, dir: 1 | -1, max: number): number {
  const next = dir === 1 ? stake + stepOf(stake) : stake - stepOf(stake - 1);
  return Math.max(BETS.MIN_STAKE, Math.min(max, next));
}

export function parsePick(raw: unknown): BetPick | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.market === "result" && (p.side === "home" || p.side === "draw" || p.side === "away")) return { market: "result", side: p.side };
  if (p.market === "score") {
    const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= BETS.MAX_GOALS;
    return ok(p.home) && ok(p.away) ? { market: "score", home: p.home as number, away: p.away as number } : null;
  }
  if (p.market === "scorer" && typeof p.playerId === "string" && p.playerId.length > 0 && p.playerId.length <= 64) {
    return { market: "scorer", playerId: p.playerId, playerName: "" };
  }
  return null;
}

export function quoteOf(m: BetMarkets, pick: BetPick): number | null {
  if (pick.market === "result") return m.result.find((r) => r.side === pick.side)?.odds ?? null;
  if (pick.market === "score") return m.scores.find((s) => s.home === pick.home && s.away === pick.away)?.odds ?? null;
  return m.scorers.find((s) => s.playerId === pick.playerId)?.odds ?? null;
}

export interface BetRefusal {
  status: 400 | 403 | 409;
  error: string;
  odds?: number;
}

export function checkBet(a: {
  state: BetsState;
  game: { competition: string; fixtureId: string };
  pick: BetPick;
  stake: number;
  clientOdds: number;
  wallet: number;
  /** Every price of the game. */
  full: BetMarkets;
  /** What this manager is offered (his own club's game: only in favour). */
  offered: BetMarkets;
}): BetRefusal | { odds: number } {
  const odds = quoteOf(a.offered, a.pick);
  if (odds === null) {
    return quoteOf(a.full, a.pick) !== null ? { status: 403, error: "ownClubAgainst" } : { status: 400, error: "invalidPick" };
  }
  if (!Number.isInteger(a.stake) || a.stake < BETS.MIN_STAKE) return { status: 400, error: "invalidStake" };
  if (a.stake > maxStake(a.wallet)) return { status: 409, error: "noMoney" };
  if (a.state.open.length >= BETS.MAX_OPEN) return { status: 409, error: "tooManyBets" };
  const same = a.state.open.some((b) => b.competition === a.game.competition && b.fixtureId === a.game.fixtureId && b.pick.market === a.pick.market);
  if (same) return { status: 409, error: "alreadyBet" };
  if (Math.abs(odds - a.clientOdds) > 0.001) return { status: 409, error: "oddsChanged", odds };
  return { odds };
}

export interface BetMatchResult {
  competition: string;
  fixtureId: string;
  /** Goals in 90 minutes. */
  home: number;
  away: number;
  scorers: ReadonlySet<string>;
}

export function resultOfEvent(e: Pick<MatchEvent, "competition" | "fixtureId" | "score" | "decider" | "scorers">): BetMatchResult {
  const et = e.decider?.extraTime;
  return {
    competition: e.competition,
    fixtureId: e.fixtureId,
    home: e.score.home - (et?.home ?? 0),
    away: e.score.away - (et?.away ?? 0),
    scorers: new Set(e.scorers.filter((s) => s.goals > 0).map((s) => s.playerId)),
  };
}

function wins(pick: BetPick, r: BetMatchResult): boolean {
  if (pick.market === "score") return pick.home === r.home && pick.away === r.away;
  if (pick.market === "scorer") return r.scorers.has(pick.playerId);
  const side = r.home > r.away ? "home" : r.home < r.away ? "away" : "draw";
  return pick.side === side;
}

export interface SettleOutcome {
  state: BetsState;
  settled: Bet[];
  /** Payout − stake of today's resolved bets. */
  net: number;
  exact: number;
  longshot: boolean;
}

export function settleBets(state: BetsState, results: BetMatchResult[], date: string): SettleOutcome {
  const byKey = new Map(results.map((r) => [`${r.competition}:${r.fixtureId}`, r]));
  const open: Bet[] = [];
  const settled: Bet[] = [];
  let net = 0, exact = 0, longshot = false;
  for (const b of state.open) {
    const r = byKey.get(`${b.competition}:${b.fixtureId}`);
    if (!r) {
      if (addDays(b.date, BETS.REFUND_AFTER_DAYS) < date) settled.push({ ...b, status: "refunded", settledOn: date, payout: b.stake });
      else open.push(b);
      continue;
    }
    if (wins(b.pick, r)) {
      const payout = Math.round(b.stake * b.odds);
      net += payout - b.stake;
      if (b.pick.market === "score") exact++;
      if (b.odds >= BETS.LONGSHOT_ODDS) longshot = true;
      settled.push({ ...b, status: "won", settledOn: date, payout });
    } else {
      net -= b.stake;
      settled.push({ ...b, status: "lost", settledOn: date, payout: 0 });
    }
  }
  return { state: { open, settled: [...settled, ...state.settled].slice(0, BETS.MAX_SETTLED) }, settled, net, exact, longshot };
}
