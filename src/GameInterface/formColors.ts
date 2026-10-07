/**
 * Colours of a match result (form pills, week calendar): win green, draw yellow, loss red.
 * Fixed colours on purpose — the chart tokens follow the club's hue, so a "win" could turn any colour.
 */
export type MatchResultLetter = "W" | "D" | "L";

/** Solid pill (league table and dashboard form). */
export const RESULT_PILL: Record<MatchResultLetter, string> = {
  W: "bg-green-600 text-white",
  D: "bg-yellow-400 text-zinc-900",
  L: "bg-red-600 text-white",
};

/** Soft chip with border (week calendar). */
export const RESULT_CHIP: Record<MatchResultLetter, string> = {
  W: "bg-green-500/15 text-green-400 border-green-500/40",
  D: "bg-yellow-400/15 text-yellow-300 border-yellow-400/40",
  L: "bg-red-500/15 text-red-400 border-red-500/40",
};
