import type { ContinentalStageName, CupStageName, Fixture } from "@/types/calendarTypes";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { isCupSlug } from "@/Domain/cups/cupIds";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface MatchHeadingInput {
  fixture: Pick<Fixture, "competition" | "round" | "leg">;
  /** Display name from `competitionName`. */
  competition: string;
  /** Stage of a cup tie (from the cup meta); undefined until loaded. */
  cupStage?: CupStageName;
  /** Stage / group of a continental tie (from the continental meta); undefined until loaded. */
  continentalStage?: ContinentalStageName;
  continentalGroup?: string;
}

/**
 * One-line match heading shared by the match preview and the live match: league → "Matchday N · X",
 * cup → "<stage> · X", continental → "<group round | stage · leg> · X". Falls back to the plain
 * competition name while a cup/continental stage is still unknown.
 */
export function matchHeading(input: MatchHeadingInput, t: Translate): string {
  const { fixture, competition } = input;
  if (isCupSlug(fixture.competition)) {
    return input.cupStage ? `${t(`cups.stage.${input.cupStage}`)} • ${competition}` : competition;
  }
  if (isContinentalSlug(fixture.competition)) {
    const stage = input.continentalStage;
    if (!stage) return competition;
    const leg = fixture.leg === 1 ? t("continental.leg1") : fixture.leg === 2 ? t("continental.leg2") : undefined;
    const phase = stage === "group"
      ? t("continental.groupRound", { group: input.continentalGroup ?? "?", round: fixture.round })
      : [t(`continental.stage.${stage}`), leg].filter(Boolean).join(" · ");
    return `${phase} • ${competition}`;
  }
  return `${t("leagues.matchday", { round: fixture.round })} • ${competition}`;
}
