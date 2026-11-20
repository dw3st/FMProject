/**
 * Stage 17 (`player-scores.md` → "Momentum"): points a side earns per event by zone of the attacking half, FM's table.
 * Columns: the 4th, 5th and final sixth of the pitch from the attacking side; each a [left, central, right] third
 * (left/right from the attacker's view). Presentation only: nothing in the engine reads momentum.
 */
type Row = readonly [number, number, number];
type Table = readonly [Row, Row, Row];

export type MomentumEvent = 'touch' | 'pass' | 'goal' | 'missed' | 'woodwork' | 'saved' | 'blocked';

export const MOMENTUM_TABLE: Readonly<Record<MomentumEvent, Table>> = {
  touch:    [[2, 2, 2], [2, 3, 2], [2, 4, 2]],
  pass:     [[2, 2, 2], [2, 4, 3], [3, 5, 3]],
  goal:     [[0, 0, 0], [10, 15, 10], [25, 50, 25]],
  missed:   [[0, 0, 0], [5, 10, 5], [5, 20, 5]],
  woodwork: [[0, 0, 0], [5, 15, 5], [10, 35, 10]],
  saved:    [[0, 0, 0], [5, 10, 5], [10, 30, 10]],
  blocked:  [[0, 0, 0], [5, 10, 5], [10, 30, 10]],
};

export const MOMENTUM = {
  /** The bar's memory (FM's decay was not found; ours): a minute's points weigh 0.5 after this many minutes. */
  HALF_LIFE_MIN: 4,
  /** Minutes of history the bar reads (older ones are negligible at this half-life). */
  WINDOW_MIN: 15,
  /** Added to the denominator of the bar so a quiet spell reads near 0 (points). */
  CALM: 30,
} as const;
