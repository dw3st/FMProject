# Apostas do técnico — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o técnico aposta a carteira dele nos jogos da liga e das competições do clube (spec `docs/superpowers/specs/2026-11-10-manager-bets-design.md`).

**Architecture:** regras puras em `src/Domain/bets` (cotações, validação, liquidação), E/S em `src/backend/betsWorld.ts`, rotas em `src/backend/betRoutes.ts`, um arquivo por assento (`bets.json`), a liquidação num passo do avanço do dia e a aba Apostas em Conquistas.

**Tech Stack:** Bun, TypeScript, React 19, Tailwind v4, bun:test.

---

## Task 1: tipos e constantes

- [ ] Criar os arquivos abaixo.

File: src/types/betTypes.ts
```ts
export type BetSide = "home" | "draw" | "away";

export type BetPick =
  | { market: "result"; side: BetSide }
  | { market: "score"; home: number; away: number }
  | { market: "scorer"; playerId: string; playerName: string };

export interface Bet {
  id: string;
  placedOn: string;
  competition: string;
  fixtureId: string;
  date: string;
  home: string;
  away: string;
  homeName: string;
  awayName: string;
  pick: BetPick;
  stake: number;
  odds: number;
  status?: "won" | "lost" | "refunded";
  settledOn?: string;
  payout?: number;
}

export interface BetsState {
  open: Bet[];
  /** Newest first, capped (`BETS.MAX_SETTLED`). */
  settled: Bet[];
}

export interface BetMarkets {
  result: { side: BetSide; odds: number }[];
  scores: { home: number; away: number; odds: number }[];
  scorers: { playerId: string; playerName: string; side: "home" | "away"; odds: number }[];
}

export interface BetGame {
  competition: string;
  fixtureId: string;
  date: string;
  home: string;
  away: string;
  homeName: string;
  awayName: string;
  /** The side of the manager's own club in this game. */
  own: "home" | "away" | null;
  markets: BetMarkets;
}

export interface BetsView {
  wallet: number;
  openTotal: number;
  betNet: number;
  maxStake: number;
  open: Bet[];
  settled: Bet[];
  games: BetGame[];
}
```

File: src/Domain/bets/betsConfig.ts
```ts
/** The manager's bets (`docs/superpowers/specs/2026-11-10-manager-bets-design.md`). */
export const BETS = {
  MARGIN: 0.08,
  MIN_ODDS: 1.05,
  MAX_ODDS: 100,
  DAYS_AHEAD: 7,
  MIN_STAKE: 1_000,
  MAX_SHARE: 0.1,
  MAX_OPEN: 40,
  MAX_SETTLED: 200,
  REFUND_AFTER_DAYS: 30,
  MAX_GOALS: 7,
  SCORES_SHOWN: 8,
  SCORERS_SHOWN: 6,
  LONGSHOT_ODDS: 8,
} as const;
```

## Task 2: cotações

- [ ] Escrever o teste, ver falhar, implementar, ver passar, commit.

File: src/Domain/bets/odds.test.ts
```ts
import { describe, expect, test } from "bun:test";
import { BETS } from "@/Domain/bets/betsConfig";
import { buildMarkets, oddsFromProb, onlyForOwnClub, scoreGrid, scorerShares } from "@/Domain/bets/odds";

const scorers = [
  { playerId: "h9", playerName: "H", side: "home" as const, share: 0.5 },
  { playerId: "a9", playerName: "A", side: "away" as const, share: 0.5 },
];

describe("bet odds", () => {
  test("the score grid sums to one", () => {
    const sum = scoreGrid(1.6, 1.1).flat().reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  test("the house margin is in every result price", () => {
    const m = buildMarkets({ xgHome: 1.5, xgAway: 1.2, scorers });
    const implied = m.result.reduce((a, r) => a + 1 / r.odds, 0);
    expect(implied).toBeCloseTo(1 + BETS.MARGIN, 1);
  });

  test("the favourite pays less, and odds stay in range", () => {
    const m = buildMarkets({ xgHome: 2.4, xgAway: 0.6, scorers });
    expect(m.result[0]!.odds).toBeLessThan(m.result[2]!.odds);
    expect(oddsFromProb(0)).toBe(BETS.MAX_ODDS);
    expect(oddsFromProb(1)).toBe(BETS.MIN_ODDS);
  });

  test("the own club keeps only what backs it", () => {
    const m = buildMarkets({ xgHome: 1.5, xgAway: 1.2, scorers });
    const own = onlyForOwnClub(m, "away");
    expect(own.result.map((r) => r.side)).toEqual(["away"]);
    expect(own.scores.length).toBeGreaterThan(0);
    expect(own.scores.every((s) => s.away > s.home)).toBe(true);
    expect(own.scorers.every((s) => s.side === "away")).toBe(true);
    expect(onlyForOwnClub(m, null)).toEqual(m);
  });

  test("shares follow the goal weight and sum to one per side", () => {
    const s = scorerShares([
      { playerId: "st", playerName: "ST", side: "home", group: "FWD", finishing: 8 },
      { playerId: "cm", playerName: "CM", side: "home", group: "MID", finishing: 6 },
      { playerId: "cb", playerName: "CB", side: "home", group: "DEF", finishing: 3 },
    ]);
    expect(s.map((x) => x.playerId)).toEqual(["st", "cm"]);
    expect(s.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 6);
  });
});
```

File: src/Domain/bets/odds.ts
```ts
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
```

## Task 3: validação, carteira e liquidação

- [ ] Escrever o teste, ver falhar, implementar, ver passar, commit.

File: src/Domain/bets/bets.test.ts
```ts
import { describe, expect, test } from "bun:test";
import { checkBet, maxStake, parsePick, resultOfEvent, settleBets, stepStake } from "@/Domain/bets/bets";
import { BETS } from "@/Domain/bets/betsConfig";
import type { Bet, BetMarkets, BetPick, BetsState } from "@/types/betTypes";

const markets: BetMarkets = {
  result: [{ side: "home", odds: 2 }, { side: "draw", odds: 3.2 }, { side: "away", odds: 3.5 }],
  scores: [{ home: 1, away: 0, odds: 6 }, { home: 0, away: 1, odds: 9 }],
  scorers: [{ playerId: "p9", playerName: "Nove", side: "home", odds: 2.5 }],
};
const bet = (pick: BetPick, over: Partial<Bet> = {}): Bet => ({
  id: "b1", placedOn: "2027-02-10", competition: "liga", fixtureId: "f1", date: "2027-02-13", home: "h", away: "a",
  homeName: "H", awayName: "A", pick, stake: 1000, odds: 2, ...over,
});
const empty: BetsState = { open: [], settled: [] };
const base = { state: empty, game: { competition: "liga", fixtureId: "f1" }, stake: 10_000, clientOdds: 2, wallet: 1_000_000, full: markets, offered: markets };
const homeWin: BetPick = { market: "result", side: "home" };

describe("checkBet", () => {
  test("a good bet gets the price", () => expect(checkBet({ ...base, pick: homeWin })).toEqual({ odds: 2 }));
  test("against the own club", () => {
    const offered = { ...markets, result: [markets.result[0]!] };
    expect(checkBet({ ...base, offered, pick: { market: "result", side: "away" }, clientOdds: 3.5 })).toMatchObject({ status: 403, error: "ownClubAgainst" });
  });
  test("a score nobody offers", () => expect(checkBet({ ...base, pick: { market: "score", home: 7, away: 7 } })).toMatchObject({ status: 400, error: "invalidPick" }));
  test("stake limits", () => {
    expect(checkBet({ ...base, pick: homeWin, stake: 10 })).toMatchObject({ error: "invalidStake" });
    expect(checkBet({ ...base, pick: homeWin, stake: 100_001 })).toMatchObject({ status: 409, error: "noMoney" });
  });
  test("one bet per market in a game", () => {
    expect(checkBet({ ...base, pick: { market: "result", side: "draw" }, clientOdds: 3.2, state: { open: [bet(homeWin)], settled: [] } })).toMatchObject({ error: "alreadyBet" });
    expect(checkBet({ ...base, pick: { market: "score", home: 1, away: 0 }, clientOdds: 6, state: { open: [bet(homeWin)], settled: [] } })).toEqual({ odds: 6 });
  });
  test("too many open", () => {
    const open = Array.from({ length: BETS.MAX_OPEN }, (_, i) => bet(homeWin, { fixtureId: `x${i}` }));
    expect(checkBet({ ...base, pick: homeWin, state: { open, settled: [] } })).toMatchObject({ error: "tooManyBets" });
  });
  test("the price moved", () => expect(checkBet({ ...base, pick: homeWin, clientOdds: 1.9 })).toMatchObject({ status: 409, error: "oddsChanged", odds: 2 }));
});

test("parsePick refuses junk", () => {
  expect(parsePick({ market: "result", side: "home" })).toEqual({ market: "result", side: "home" });
  expect(parsePick({ market: "result", side: "x" })).toBeNull();
  expect(parsePick({ market: "score", home: 1.5, away: 0 })).toBeNull();
  expect(parsePick({ market: "scorer", playerId: "p9" })).toEqual({ market: "scorer", playerId: "p9", playerName: "" });
  expect(parsePick(null)).toBeNull();
});

test("maxStake is 10% of the wallet", () => expect(maxStake(1_234_567)).toBe(123_456));

test("stepStake moves and stays in range", () => {
  expect(stepStake(50_000, 1, 1_000_000)).toBe(60_000);
  expect(stepStake(BETS.MIN_STAKE, -1, 1_000_000)).toBe(BETS.MIN_STAKE);
  expect(stepStake(990_000, 1, 1_000_000)).toBe(1_000_000);
});

describe("settlement", () => {
  const r = { competition: "liga", fixtureId: "f1", home: 1, away: 0, scorers: new Set(["p9"]) };
  test("win, loss, net, exact score", () => {
    const state: BetsState = { open: [
      bet(homeWin, { id: "w", stake: 1000, odds: 2 }),
      bet({ market: "result", side: "draw" }, { id: "l", stake: 500, odds: 3 }),
      bet({ market: "score", home: 1, away: 0 }, { id: "e", stake: 100, odds: 9 }),
      bet({ market: "scorer", playerId: "p9", playerName: "Nove" }, { id: "s", stake: 100, odds: 2.5 }),
    ], settled: [] };
    const out = settleBets(state, [r], "2027-02-13");
    expect(out.state.open).toEqual([]);
    expect(out.settled.map((b) => b.status)).toEqual(["won", "lost", "won", "won"]);
    expect(out.net).toBe(1000 - 500 + 800 + 150);
    expect(out.exact).toBe(1);
    expect(out.longshot).toBe(true);
  });
  test("a bet on another game stays open and running twice changes nothing", () => {
    const state: BetsState = { open: [bet(homeWin, { fixtureId: "other" })], settled: [] };
    const out = settleBets(state, [r], "2027-02-13");
    expect(out.state.open).toHaveLength(1);
    expect(out.net).toBe(0);
    const again = settleBets(settleBets({ open: [bet(homeWin)], settled: [] }, [r], "2027-02-13").state, [r], "2027-02-13");
    expect(again.settled).toEqual([]);
  });
  test("a game that never happens is refunded after 30 days", () => {
    const out = settleBets({ open: [bet(homeWin, { date: "2027-02-13" })], settled: [] }, [], "2027-03-16");
    expect(out.settled[0]!.status).toBe("refunded");
    expect(out.net).toBe(0);
  });
  test("90 minutes: extra-time goals do not count for the score", () => {
    const res = resultOfEvent({ competition: "c", fixtureId: "f", score: { home: 2, away: 1 }, decider: { extraTime: { home: 1, away: 0 } }, scorers: [{ playerId: "p", playerName: "P", team: "home", goals: 1 }] });
    expect([res.home, res.away]).toEqual([1, 1]);
    expect(res.scorers.has("p")).toBe(true);
  });
});
```

File: src/Domain/bets/bets.ts
```ts
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
```

## Task 4: gravação (`bets.json` por assento)

- [ ] `ISaveDAL`: `readSeatBets(saveId, seatId): Promise<BetsState | null>`, `writeSeatBets(saveId, seatId, state): Promise<void>`.
- [ ] `FileSystemDAL`: `${seatDir(saveId, seatId)}/bets.json`, com `readJsonFile` e `writeJsonFile`, como `scouting.json` (sem `bumpSaveDataVersion`).
- [ ] `BufferingSaveDAL`: chave `seatBets:${saveId}:${seatId}`, com `readThrough` e `buffer`, como `seatScouting`.
- [ ] `SaveService`: `getBets(saveId, seatId)` (ausente = `emptyBets()`) e `writeBets(saveId, state, seatId)`.
- [ ] `SeatState` + `SEAT_KEYS`: `betNet?: number`, `betExact?: number`, `betLongshot?: boolean`.
- [ ] `managerWallet(earned, spent, betNet = 0, open = 0)`, com teste em `assets.test.ts`; `managerAssetRoutes` usa a carteira com apostas.

## Task 5: mundo e rotas

File: src/backend/betsWorld.ts
```ts
import { playerContinentalSlug } from "@/backend/continentalWorld";
import { playerCupSlug } from "@/backend/cupWorld";
import type { SaveService } from "@/backend/SaveService";
import { autoLineupForFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { expectedGoals, teamStrength } from "@/Domain/advanceDay/quickSim";
import { BETS } from "@/Domain/bets/betsConfig";
import { maxStake, openTotal, resultOfEvent, settleBets } from "@/Domain/bets/bets";
import { buildMarkets, onlyForOwnClub, scorerShares, trimMarkets } from "@/Domain/bets/odds";
import { addDays } from "@/Domain/dates";
import { managerWallet } from "@/Domain/managers/assets";
import { formationForSimId } from "@/Domain/matchFormations";
import { ROLE_GROUP } from "@/GameEngine/Configs/QuickSimConfig";
import type { BetGame, BetMarkets, BetsState, BetsView } from "@/types/betTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { Squad } from "@/types/playerTypes";

export interface BetSeat {
  currentDate?: string;
  leagueSlug?: string;
  clubId?: string;
  managerEarnings?: number;
  managerSpent?: number;
  betNet?: number;
}

export function walletOf(seat: BetSeat, state: BetsState): number {
  return managerWallet(seat.managerEarnings, seat.managerSpent, seat.betNet, openTotal(state));
}

/** Prices of one game, from the same expected goals the simulated matches use (automatic 4-3-3). */
function marketsOf(fixture: Fixture, home: Squad, away: Squad): BetMarkets {
  const formation = formationForSimId("4-3-3");
  const roles = slotRoles(formation);
  const xiOf = (s: Squad) => autoLineupForFormation(s, formation, fixture.date).map((id, i) => ({ p: s.players.find((x) => x.id === id), role: roles[i]! }));
  const xiH = xiOf(home).filter((x) => x.p);
  const xiA = xiOf(away).filter((x) => x.p);
  const strengthOf = (xi: typeof xiH) => teamStrength(xi.map((x) => x.p!), xi.map((x) => x.role));
  const sH = strengthOf(xiH);
  const sA = strengthOf(xiA);
  const candidates = (xi: typeof xiH, side: "home" | "away") => xi.map((x) => ({
    playerId: x.p!.id, playerName: x.p!.name, side, group: ROLE_GROUP[x.role] ?? ("MID" as const), finishing: x.p!.stats.finishing ?? 0,
  }));
  return buildMarkets({
    xgHome: expectedGoals(sH, sA, !fixture.neutral),
    xgAway: expectedGoals(sA, sH, false),
    scorers: scorerShares([...candidates(xiH, "home"), ...candidates(xiA, "away")]),
  });
}

interface GameQuote {
  game: BetGame;
  /** Every price, before the own-club filter. */
  full: BetMarkets;
}

/** The games he can still bet on: after today, within `DAYS_AHEAD`, in his league and his club's competitions. */
export async function betQuotes(service: SaveService, saveId: string, seat: BetSeat): Promise<GameQuote[]> {
  const today = seat.currentDate;
  if (!today || !seat.leagueSlug) return [];
  const slugs = [seat.leagueSlug, await playerCupSlug(seat.leagueSlug), seat.clubId ? await playerContinentalSlug(service, saveId, seat.clubId) : null]
    .filter((s): s is NonNullable<typeof s> => !!s);
  const last = addDays(today, BETS.DAYS_AHEAD);
  const squads = new Map<string, Squad | null>();
  const squadOf = async (id: string) => {
    if (!squads.has(id)) squads.set(id, await service.getSquadById(saveId, id));
    return squads.get(id)!;
  };
  const out: GameQuote[] = [];
  for (const slug of slugs) {
    const index = (await service.getDateIndex(saveId, slug)) ?? {};
    const rounds = new Set(Object.entries(index).filter(([d]) => d > today && d <= last).flatMap(([, r]) => r));
    for (const r of rounds) {
      const round = await service.getRound(saveId, slug, r);
      for (const f of round?.fixtures ?? []) {
        if (f.played || !f.home || !f.away || f.date <= today || f.date > last) continue;
        const [home, away] = [await squadOf(f.home), await squadOf(f.away)];
        if (!home || !away) continue;
        const own = f.home === seat.clubId ? "home" : f.away === seat.clubId ? "away" : null;
        const full = marketsOf(f, home, away);
        out.push({
          full,
          game: { competition: slug, fixtureId: f.id, date: f.date, home: f.home, away: f.away, homeName: home.name, awayName: away.name, own, markets: trimMarkets(onlyForOwnClub(full, own)) },
        });
      }
    }
  }
  return out.sort((a, b) => a.game.date.localeCompare(b.game.date));
}

export async function betsView(service: SaveService, saveId: string, seatId: string, seat: BetSeat, summary: boolean): Promise<BetsView> {
  const state = await service.getBets(saveId, seatId);
  const wallet = walletOf(seat, state);
  return {
    wallet,
    openTotal: openTotal(state),
    betNet: seat.betNet ?? 0,
    maxStake: maxStake(wallet),
    open: state.open,
    settled: state.settled,
    games: summary ? [] : (await betQuotes(service, saveId, seat)).map((q) => q.game),
  };
}

/** The day's step: resolves the seat's bets on today's games. */
export async function settleSeatBets(service: SaveService, saveId: string, seatId: string, date: string, events: MatchEvent[]) {
  const state = await service.getBets(saveId, seatId);
  if (state.open.length === 0) return null;
  const outcome = settleBets(state, events.map(resultOfEvent), date);
  if (outcome.settled.length === 0) return null;
  await service.writeBets(saveId, outcome.state, seatId);
  return outcome;
}
```

File: src/backend/betRoutes.ts
```ts
import { requireSeat } from "@/backend/auth/middleware";
import { betQuotes, betsView, walletOf } from "@/backend/betsWorld";
import { withSaveLock } from "@/backend/saveLock";
import { saveService } from "@/backend/SaveService";
import { checkBet, parsePick } from "@/Domain/bets/bets";
import type { Bet } from "@/types/betTypes";

type Req = Request & { params: Record<string, string> };

export const betRoutes = {
  "/api/saves/:saveId/bets": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    const seat = await saveService.getSeatMeta(saveId, auth.seatId);
    if (!seat) return Response.json({ error: "save not found" }, { status: 404 });
    if (req.method === "GET") {
      const summary = new URL(req.url).searchParams.get("summary") === "1";
      return Response.json(await betsView(saveService, saveId, auth.seatId, seat, summary));
    }
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const pick = parsePick(body?.pick);
    if (!pick || typeof body?.competition !== "string" || typeof body?.fixtureId !== "string") return Response.json({ error: "invalidPick" }, { status: 400 });
    const stake = Number(body.stake);
    const clientOdds = Number(body.odds);
    const { competition, fixtureId } = body as { competition: string; fixtureId: string };
    return withSaveLock(saveId, async () => {
      const fresh = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!fresh) return Response.json({ error: "save not found" }, { status: 404 });
      const quote = (await betQuotes(saveService, saveId, fresh)).find((q) => q.game.competition === competition && q.game.fixtureId === fixtureId);
      if (!quote) return Response.json({ error: "closed" }, { status: 409 });
      const state = await saveService.getBets(saveId, auth.seatId);
      const checked = checkBet({ state, game: { competition, fixtureId }, pick, stake, clientOdds, wallet: walletOf(fresh, state), full: quote.full, offered: quote.game.markets });
      if ("error" in checked) return Response.json({ error: checked.error, ...(checked.odds ? { odds: checked.odds } : {}) }, { status: checked.status });
      const g = quote.game;
      const named = pick.market === "scorer" ? { ...pick, playerName: g.markets.scorers.find((s) => s.playerId === pick.playerId)!.playerName } : pick;
      const bet: Bet = {
        id: crypto.randomUUID(), placedOn: fresh.currentDate!, competition, fixtureId, date: g.date,
        home: g.home, away: g.away, homeName: g.homeName, awayName: g.awayName, pick: named, stake, odds: checked.odds,
      };
      await saveService.writeBets(saveId, { ...state, open: [...state.open, bet] }, auth.seatId);
      return Response.json({ bet });
    });
  },
};
```

- [ ] `routes.ts`: `...betRoutes`. `worldLobbyGuard.ts`: `"/api/saves/:saveId/bets"` em `LOBBY_GUARDED_PATHS`.

## Task 6: avanço do dia, caixa e conquistas

- [ ] `inboxTypes.ts`: categoria `bets`, `BetsInboxMessage { category: "bets"; kind: "settled"; bets: Bet[]; net: number }`.
- [ ] `inboxTopics.ts`: tópico `bets`, ligado. `inboxThemes.ts`: tema `club`.
- [ ] `src/Domain/inbox/betsMessage.ts`: `buildBetsMessage(date, bets, net)`.
- [ ] `daySeats.ts`: `deferred.bets: BetsInboxMessage[]`.
- [ ] `advanceDay.ts`, antes do passo das conquistas: para cada assento, `settleSeatBets`; `ds.patch.betNet/betExact/betLongshot`; mensagem no `deferred.bets`, emitida com as outras adiadas.
- [ ] Conquistas: `TRACK_IDS` + `bets_profit`, `bets_exact`; `SECRET_IDS` + `bet_longshot`; `TRACKS`, `SECRETS`; `AchievementSnapshot.bets`; `trackValues`; `AchievementDayInput.betLongshot` desbloqueia a secreta.
- [ ] Testes: `src/backend/bets.routes.test.ts` e `src/backend/bets.advanceDay.test.ts`.

## Task 7: tela

- [ ] `Achievements/BetsTab.tsx`, aba `bets` depois de `assets`; `AssetsTab` lê a carteira de `GET /bets?summary=1`; corpo da caixa em `Achievements/BetsInboxBody.tsx`; `bets/bets-hero.webp` em `GAME_ART_FILES`; i18n `bets.*`, `inbox.categories.bets`, `inbox.prefs.topics.bets`, trilhas e secreta.
- [ ] `bun run ui:audit` limpo.

## Task 8: entrega

- [ ] `.claude/rules/game/bets.md`, `achievements.md` (108), `docs/ROADMAP.md`, changelog 8.9, `package.json`.
- [ ] Testes relacionados, `bun run typecheck`, conferir a tela, publicar.
