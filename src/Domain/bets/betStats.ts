import type { Bet, BetPick } from "@/types/betTypes";

/** The odds bands of the dashboard (tester request: "quanto ganhou ou perdeu pra cada odd"). `to` is exclusive. */
export const ODDS_BANDS = [
  { key: "1.01-1.5", from: 1, to: 1.5 },
  { key: "1.5-2", from: 1.5, to: 2 },
  { key: "2-3", from: 2, to: 3 },
  { key: "3-5", from: 3, to: 5 },
  { key: "5-10", from: 5, to: 10 },
  { key: "10+", from: 10, to: Infinity },
] as const;

export type OddsBand = (typeof ODDS_BANDS)[number]["key"];
export type BetMarket = BetPick["market"];
export const BET_MARKETS: BetMarket[] = ["result", "score", "scorer"];

export interface BetLine {
  bets: number;
  greens: number;
  reds: number;
  /** Money of the greens and reds (refunds give it back). */
  staked: number;
  returned: number;
  profit: number;
  /** profit / staked, null with nothing staked. */
  roi: number | null;
}

export interface BetTotals extends BetLine {
  refunded: number;
  /** greens / (greens + reds), null with none. */
  hitRate: number | null;
}

export interface BetStats {
  totals: BetTotals;
  /** Cumulative profit after each game date, oldest first. */
  series: { date: string; profit: number }[];
  bands: ({ band: OddsBand } & BetLine)[];
  markets: ({ market: BetMarket } & BetLine)[];
}

export function oddsBandOf(odds: number): OddsBand {
  return (ODDS_BANDS.find((b) => odds >= b.from && odds < b.to) ?? ODDS_BANDS[0]).key;
}

function emptyLine(): BetLine {
  return { bets: 0, greens: 0, reds: 0, staked: 0, returned: 0, profit: 0, roi: null };
}

function add(line: BetLine, b: Bet): void {
  if (b.status !== "won" && b.status !== "lost") return;
  line.bets++;
  line.staked += b.stake;
  const back = b.status === "won" ? (b.payout ?? 0) : 0;
  line.returned += back;
  line.profit += back - b.stake;
  if (b.status === "won") line.greens++; else line.reds++;
}

function withRoi<T extends BetLine>(line: T): T {
  return { ...line, roi: line.staked > 0 ? line.profit / line.staked : null };
}

/** The "Meu desempenho" numbers, from the settled bets. Refunded bets only count in `refunded`. */
export function betStats(settled: readonly Bet[]): BetStats {
  const totals = emptyLine();
  let refunded = 0;
  const bands = new Map<OddsBand, BetLine>(ODDS_BANDS.map((b) => [b.key, emptyLine()]));
  const markets = new Map<BetMarket, BetLine>(BET_MARKETS.map((m) => [m, emptyLine()]));
  const byDate = new Map<string, number>();
  for (const b of settled) {
    if (b.status === "refunded") { refunded++; continue; }
    if (b.status !== "won" && b.status !== "lost") continue;
    add(totals, b);
    add(bands.get(oddsBandOf(b.odds))!, b);
    add(markets.get(b.pick.market)!, b);
    const net = (b.status === "won" ? (b.payout ?? 0) : 0) - b.stake;
    byDate.set(b.date, (byDate.get(b.date) ?? 0) + net);
  }
  let running = 0;
  const series = [...byDate.keys()].sort().map((date) => ({ date, profit: (running += byDate.get(date)!) }));
  const decided = totals.greens + totals.reds;
  return {
    totals: { ...withRoi(totals), refunded, hitRate: decided > 0 ? totals.greens / decided : null },
    series,
    bands: ODDS_BANDS.map((b) => ({ band: b.key, ...withRoi(bands.get(b.key)!) })),
    markets: BET_MARKETS.map((m) => ({ market: m, ...withRoi(markets.get(m)!) })),
  };
}
