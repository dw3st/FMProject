/**
 * Bingo of the games hall: 75 balls, 5 × 5 cards with a free centre, 1 to 4 cards at the stake each, 30 balls drawn.
 * Each card pays its best pattern.
 */
export type BingoPattern = "line" | "twoLines" | "corners" | "x" | "full";

export const BINGO = {
  BALLS: 75,
  DRAWN: 30,
  MAX_CARDS: 4,
  /** Multiplier of the card's price, best pattern only (tuned for ~92% by scripts/casino-rtp.ts). */
  PAYS: { line: 3.1, twoLines: 15, corners: 11, x: 400, full: 10_000 } as Record<BingoPattern, number>,
} as const;

/** Best first: the screen and the payout read the first pattern a card has. */
export const BINGO_ORDER: BingoPattern[] = ["full", "x", "twoLines", "corners", "line"];

/** 25 numbers row by row; the centre (index 12) is 0 = free. Column k holds 15k+1..15k+15. */
export type BingoCard = number[];

export function drawCard(rng: () => number): BingoCard {
  const cols: number[][] = [];
  for (let k = 0; k < 5; k++) {
    const pool = Array.from({ length: 15 }, (_, i) => 15 * k + i + 1);
    const col: number[] = [];
    for (let r = 0; r < 5; r++) col.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
    cols.push(col);
  }
  const card: number[] = [];
  for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) card.push(r === 2 && k === 2 ? 0 : cols[k]![r]!);
  return card;
}

/** The balls of a game, in drawing order. */
export function drawBalls(rng: () => number, n: number = BINGO.DRAWN): number[] {
  const pool = Array.from({ length: BINGO.BALLS }, (_, i) => i + 1);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  return out;
}

const LINES: number[][] = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((k) => r * 5 + k)),
  ...[0, 1, 2, 3, 4].map((k) => [0, 1, 2, 3, 4].map((r) => r * 5 + k)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

/** The best pattern of a card for these balls, or null. */
export function bestPattern(card: BingoCard, balls: readonly number[]): BingoPattern | null {
  const drawn = new Set(balls);
  const marked = card.map((n) => n === 0 || drawn.has(n));
  const all = (cells: number[]) => cells.every((i) => marked[i]);
  if (marked.every(Boolean)) return "full";
  if (all(LINES[10]!) && all(LINES[11]!)) return "x";
  const lines = LINES.filter(all).length;
  if (lines >= 2) return "twoLines";
  if (all([0, 4, 20, 24])) return "corners";
  return lines === 1 ? "line" : null;
}

export interface BingoCardResult {
  card: BingoCard;
  pattern: BingoPattern | null;
  multiplier: number;
}

export function playBingo(cards: number, rng: () => number): { cards: BingoCardResult[]; balls: number[] } {
  const drawn: BingoCard[] = [];
  for (let i = 0; i < cards; i++) drawn.push(drawCard(rng));
  const balls = drawBalls(rng);
  return {
    balls,
    cards: drawn.map((card) => {
      const pattern = bestPattern(card, balls);
      return { card, pattern, multiplier: pattern ? BINGO.PAYS[pattern] : 0 };
    }),
  };
}

export function parseBingoCards(v: unknown): number | null {
  const n = Number(v ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= BINGO.MAX_CARDS ? n : null;
}
