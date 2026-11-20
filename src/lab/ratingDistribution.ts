/**
 * Stage 17 (`player-scores.md` → "Stage 17"): the distribution of the starters' match ratings by line — the shape
 * target of the FM-hook ratings (today's legacy distribution; FM's own was not measured). Pure: used by
 * `scripts/rating-distribution.ts` and the /lab (`TeamRawStats.ratingLines`).
 */
import type { MainRole } from '@/Domain/roles';

export const RATING_LINES = ['GK', 'DEF', 'MID', 'FWD'] as const;
export type RatingLine = (typeof RATING_LINES)[number];

/** Histogram bins of 0.25 from 3.0 to 10.0 (the first and last catch what lies outside). */
export const RATING_BIN = 0.25;
export const RATING_BIN_MIN = 3;
export const RATING_BINS = Math.round((10 - RATING_BIN_MIN) / RATING_BIN);

/** Running totals of one line: count, sum, sum of squares, ≥ 8, ≥ 8.5, < 5.5, and the histogram. */
export interface RatingLineTotals { n: number; sum: number; sumSq: number; over8: number; over85: number; under55: number; hist: number[] }
export type RatingLinesTotals = Record<RatingLine, RatingLineTotals>;

export function emptyRatingLines(): RatingLinesTotals {
  const one = (): RatingLineTotals => ({ n: 0, sum: 0, sumSq: 0, over8: 0, over85: 0, under55: 0, hist: new Array(RATING_BINS).fill(0) });
  return { GK: one(), DEF: one(), MID: one(), FWD: one() };
}

export function lineOfRole(main: MainRole | string): RatingLine {
  if (main === 'GK') return 'GK';
  if (main === 'Defender') return 'DEF';
  if (main === 'Midfielder') return 'MID';
  return 'FWD';
}

export function addRating(t: RatingLinesTotals, line: RatingLine, r: number): void {
  const l = t[line];
  l.n++; l.sum += r; l.sumSq += r * r;
  if (r >= 8) l.over8++;
  if (r >= 8.5) l.over85++;
  if (r < 5.5) l.under55++;
  const b = Math.max(0, Math.min(RATING_BINS - 1, Math.floor((r - RATING_BIN_MIN) / RATING_BIN)));
  l.hist[b]!++;
}

export function mergeRatingLines(dst: RatingLinesTotals, src: RatingLinesTotals): void {
  for (const k of RATING_LINES) {
    const d = dst[k], s = src[k];
    d.n += s.n; d.sum += s.sum; d.sumSq += s.sumSq; d.over8 += s.over8; d.over85 += s.over85; d.under55 += s.under55;
    for (let i = 0; i < RATING_BINS; i++) d.hist[i]! += s.hist[i] ?? 0;
  }
}

export interface RatingLineSummary { n: number; mean: number; sd: number; p10: number; p50: number; p90: number; over8Pct: number; over85Pct: number; under55Pct: number }

function quantile(hist: number[], n: number, q: number): number {
  let c = 0;
  for (let i = 0; i < hist.length; i++) { c += hist[i]!; if (c >= q * n) return RATING_BIN_MIN + (i + 0.5) * RATING_BIN; }
  return 10;
}

export function summarizeRatingLine(l: RatingLineTotals): RatingLineSummary {
  if (l.n === 0) return { n: 0, mean: 0, sd: 0, p10: 0, p50: 0, p90: 0, over8Pct: 0, over85Pct: 0, under55Pct: 0 };
  const mean = l.sum / l.n;
  const sd = Math.sqrt(Math.max(0, l.sumSq / l.n - mean * mean));
  return {
    n: l.n, mean, sd,
    p10: quantile(l.hist, l.n, 0.1), p50: quantile(l.hist, l.n, 0.5), p90: quantile(l.hist, l.n, 0.9),
    over8Pct: (100 * l.over8) / l.n, over85Pct: (100 * l.over85) / l.n, under55Pct: (100 * l.under55) / l.n,
  };
}
