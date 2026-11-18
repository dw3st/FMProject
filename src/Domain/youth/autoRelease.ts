// The academy's release rule (tester report 2026-11-18): who is below a level or a potential leaves, at the moment
// the rule is set and at every rollover of the club's country. Only the human club; reborn and created players never.
import { overallAvg } from "@/Domain/playerRating";
import { potentialBand } from "@/Domain/youth/youth";
import type { RosterPlayer } from "@/types/playerTypes";

export interface YouthAutoRelease {
  /** "level": the current rating; "potential": the top of the potential band. */
  by: "level" | "potential";
  /** 0..10 scale, one decimal (the screen shows it as is). */
  below: number;
}

export function parseAutoRelease(input: unknown): YouthAutoRelease | null | "invalid" {
  if (input === null) return null;
  const r = input as { by?: unknown; below?: unknown } | undefined;
  if (!r || (r.by !== "level" && r.by !== "potential")) return "invalid";
  if (typeof r.below !== "number" || !Number.isFinite(r.below) || r.below < 0 || r.below > 10) return "invalid";
  return { by: r.by, below: Math.round(r.below * 10) / 10 };
}

/** The value the rule looks at, rounded as the screen shows it. */
export function autoReleaseValue(p: RosterPlayer, by: YouthAutoRelease["by"]): number {
  const v = by === "level" ? overallAvg(p) : potentialBand(p)[1];
  return Math.round(v * 10) / 10;
}

/** The academy players the rule releases. */
export function autoReleased(youth: RosterPlayer[], rule: YouthAutoRelease | undefined | null): RosterPlayer[] {
  if (!rule) return [];
  return youth.filter((p) => !p.reborn && !p.id.startsWith("created_") && autoReleaseValue(p, rule.by) < rule.below);
}
