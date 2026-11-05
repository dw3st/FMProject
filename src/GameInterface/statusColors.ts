/**
 * Fixed traffic-light colours of a player's state (tester report): green good, yellow watch, red problem. Fixed
 * like `formColors.ts` because the chart tokens follow the club's hue.
 */
import type { MoraleBand } from "@/types/moraleTypes";

/** A squad player's availability: unavailable (injured, suspended, with the national team), short of match rhythm, ready. */
export type Availability = "ready" | "rhythm" | "unavailable";

/** Below this fitness a player still needs rest or rhythm: the rotation would rest him (`TIRED_FITNESS_THRESHOLD`). */
export const RHYTHM_FITNESS = 75;

export function availabilityOf(p: { status: "fit" | "injured" | "suspended"; energy: number; nationalDutyUntil?: string }): Availability {
  if (p.status !== "fit" || p.nationalDutyUntil) return "unavailable";
  return p.energy < RHYTHM_FITNESS ? "rhythm" : "ready";
}

export const AVAILABILITY_DOT: Record<Availability, string> = {
  ready: "bg-green-500",
  rhythm: "bg-yellow-400",
  unavailable: "bg-red-500",
};

/** A call that deserves attention now (a contract to renew): the "watch" yellow, loud enough to spot in a list. */
export const ATTENTION_BUTTON = "bg-yellow-400/15 text-yellow-300 border-yellow-400/60 hover:bg-yellow-400 hover:text-black";

/** Text colour of a morale band: happy green, neutral yellow, unhappy red. */
export const MORALE_TONE: Record<MoraleBand, string> = {
  very_happy: "text-green-400",
  content: "text-green-400",
  neutral: "text-yellow-300",
  unhappy: "text-red-400",
  furious: "text-red-400",
};
