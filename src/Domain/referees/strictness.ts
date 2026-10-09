import { REFEREE } from "@/Domain/referees/refereeConfig";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { RefereeBand } from "@/types/refereeTypes";

/** Drawn rigor of an id: triangular on [−1, 1], mean 0, sd 0.41; same id, same rigor in every career. */
export function strictnessOf(id: string): number {
  const rng = mulberry32(seedFrom(`referee-strict:${id}`));
  return Math.round((rng() + rng() - 1) * 100) / 100;
}

const mult = (w: number, s: number | undefined) => (s ? 1 + w * s : 1);

/** Foul chance multiplier (s absent / 0 → exactly 1). */
export const refereeFoulMult = (s: number | undefined) => mult(REFEREE.FOUL_WEIGHT, s);
/** Yellow per foul multiplier, card normaliser included. */
export const refereeYellowMult = (s: number | undefined) => (s ? (1 + REFEREE.YELLOW_WEIGHT * s) / REFEREE.CARD_NORM : 1);
/** Direct red per foul multiplier, card normaliser included. */
export const refereeRedMult = (s: number | undefined) => (s ? (1 + REFEREE.RED_WEIGHT * s) / REFEREE.CARD_NORM : 1);

export function strictnessBand(s: number): RefereeBand {
  if (s <= -REFEREE.BAND) return "lenient";
  if (s >= REFEREE.BAND) return "strict";
  return "balanced";
}
