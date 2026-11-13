import { formatEuros } from "@/Domain/money";
import { formatInt } from "@/GameInterface/formatDate";
import type { SponsorGoal, SponsorGoalProgress } from "@/types/sponsorTypes";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** Whole percent of a fraction (0.06 → 6). */
const pct = (fraction: number) => Math.round(fraction * 100);

/** The goal in the player's words ("Finish 4th or better"). */
export function sponsorGoalText(goal: SponsorGoal, t: T, lang: string): string {
  switch (goal.kind) {
    case "league_position": return t("sponsors.goal.league_position", { count: goal.max, ordinal: true });
    case "continental": return t("sponsors.goal.continental");
    case "cup_stage": return t(`sponsors.goal.cup_stage.${goal.stage}`);
    case "promotion": return t("sponsors.goal.promotion");
    case "followers_growth": return t("sponsors.goal.followers_growth", { pct: pct(goal.pct) });
    case "attendance": return t("sponsors.goal.attendance", { avg: formatInt(goal.avg, lang) });
  }
}

export type SponsorProgressTone = "met" | "missed" | "unknown";

export function sponsorProgressTone(progress: SponsorGoalProgress): SponsorProgressTone {
  return progress.met === null ? "unknown" : progress.met ? "met" : "missed";
}

/** Where the goal stands today ("6th today: inside the goal"). */
export function sponsorProgressText(goal: SponsorGoal, progress: SponsorGoalProgress, t: T, lang: string): string {
  const state = t(`sponsors.progress.${sponsorProgressTone(progress)}`);
  if (progress.current === undefined) return goal.kind === "cup_stage" && progress.met ? t("sponsors.progress.cupReached") : state;
  const now =
    goal.kind === "followers_growth" ? t("sponsors.progress.followers", { pct: pct(progress.current) })
    : goal.kind === "attendance" ? t("sponsors.progress.attendance", { avg: formatInt(progress.current, lang) })
    : t("sponsors.progress.position", { count: progress.current, ordinal: true });
  return `${now}: ${state}`;
}

/** "€5.2M per season". */
export function perSeason(value: number, t: T): string {
  return t("sponsors.perSeason", { value: formatEuros(value) });
}
