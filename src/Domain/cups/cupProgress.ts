import type { Fixture, LeagueSeasonMeta, RoundFixtures } from "@/types/calendarTypes";
import { seedFrom } from "@/Domain/cups/cupIds";
import { drawTies } from "@/Domain/cups/cupDraw";
import { stageFixtures } from "@/Domain/cups/generateCup";
import { mulberry32 } from "@/Domain/rng";

/** Winner of a played knockout fixture (score, then penalties); null when unplayed/undecided. */
export function fixtureWinner(f: Fixture): string | null {
  if (!f.played || !f.result) return null;
  if (f.result.home !== f.result.away) return f.result.home > f.result.away ? f.home : f.away;
  const p = f.decider?.penalties;
  if (p && p.home !== p.away) return p.home > p.away ? f.home : f.away;
  return null;
}

/** Every fixture of the stage is played and has a winner. */
export function stageComplete(fixtures: Fixture[]): boolean {
  return fixtures.length > 0 && fixtures.every((f) => fixtureWinner(f) !== null);
}

/**
 * Draw the stage after `round` once `fixtures` (that round) are complete. Returns the updated meta
 * and the new round, or null when the stage isn't complete, it was the final, or the next stage is
 * already drawn.
 */
export function drawNextStage(
  meta: LeagueSeasonMeta,
  round: number,
  fixtures: Fixture[],
  seedKey: string,
): { meta: LeagueSeasonMeta; round: RoundFixtures } | null {
  const cup = meta.cup;
  if (!cup || !stageComplete(fixtures)) return null;
  const next = cup.stages.find((s) => s.round === round + 1);
  if (!next || next.drawn) return null;

  const winners = fixtures.map((f) => fixtureWinner(f)!);
  const entrantIds = round === 1 ? [...winners, ...cup.byes] : winners;
  const entrants = entrantIds.map((id) => ({ id, tier: cup.tiers[id] ?? 99 }));
  const ties = drawTies(entrants, mulberry32(seedFrom(`${seedKey}:${next.round}`)), next.name === "final");

  const drawnStage = { ...next, entrants: entrantIds, drawn: true };
  const stages = cup.stages.map((s) => (s.round === next.round ? drawnStage : s));
  return {
    meta: { ...meta, cup: { ...cup, stages } },
    round: { leagueSlug: meta.leagueSlug, round: next.round, fixtures: stageFixtures(meta.leagueSlug, meta.year, drawnStage, ties) },
  };
}

/** Champion once the final (last stage) is played; else null. */
export function cupChampion(meta: LeagueSeasonMeta, finalFixtures: Fixture[]): string | null {
  const last = meta.cup?.stages[meta.cup.stages.length - 1];
  if (!last || finalFixtures.length !== 1 || finalFixtures[0]!.round !== last.round) return null;
  return fixtureWinner(finalFixtures[0]!);
}
