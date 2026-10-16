// src/Domain/multiplayer/standingsEvents.ts
// Events of the day that add an extra to a seat's passage (friends' league standings, multiplayer part 5a).
import { STANDINGS } from "@/Domain/multiplayer/standingsConfig";
import { continentalPoints } from "@/Domain/multiplayer/standings";
import type { ContinentalEvent } from "@/Domain/continental/continentalProgress";
import type { StandingItem } from "@/types/standingsTypes";

const detailOf = (competition?: string) => (competition ? { detail: competition } : {});

/** A cup tie decided today: only the final scores (winner champion, loser finalist). */
export function cupTieItems(stage: string, competition?: string): { winner: StandingItem; loser: StandingItem } | null {
  if (stage !== "final") return null;
  return {
    winner: { key: "cup", points: STANDINGS.CUP.champion, ...detailOf(competition) },
    loser: { key: "cup", points: STANDINGS.CUP.finalist, ...detailOf(competition) },
  };
}

/** A continental event: the stage it reached (group passed, semi-final, final, title); null otherwise. */
export function continentalEventItem(ev: ContinentalEvent, competition?: string): StandingItem | null {
  let reached: Parameters<typeof continentalPoints>[0] | null = null;
  if (ev.kind === "champion") reached = "champion";
  else if (ev.kind === "advanced") {
    if (ev.stage === "group") reached = "groups";
    else if (ev.stage === "qf") reached = "semifinal";
    else if (ev.stage === "sf") reached = "finalist";
  }
  if (!reached) return null;
  return { key: "continental", points: continentalPoints(reached), ...detailOf(competition) };
}

/** A national-team news of the seat's manager: objective met +2, a tournament title +6 more. */
export function nationalNewsItems(n: { kind: string; met?: boolean; title?: boolean }): StandingItem[] {
  if (n.kind !== "result" || !n.met) return [];
  const out: StandingItem[] = [{ key: "national_objective", points: STANDINGS.NATIONAL_OBJECTIVE }];
  if (n.title) out.push({ key: "national_title", points: STANDINGS.NATIONAL_TITLE });
  return out;
}
