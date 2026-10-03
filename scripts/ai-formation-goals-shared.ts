import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import { seedFrom } from "@/Domain/cups/cupIds";
import { aiRecordFor } from "@/Domain/advanceDay/matchSimulationLineups";

export type Mode = "main" | "ai";
export interface GoalTotals { n: number; goals: number; shots: number }

/**
 * League squads with every player at matchday fitness 88 (the quickSim calibration point) and their
 * season formation record stored, as `advanceDay` keeps it after the first match.
 */
export function loadLeagueAt88(league: string): Squad[] {
  const dir = fileURLToPath(new URL(`../src/Data/squads/${league}/`, import.meta.url));
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
    const s = JSON.parse(readFileSync(dir + f, "utf8")) as Squad;
    const squad: Squad = {
      ...s,
      leagueSlug: league,
      players: s.players.map((p) => ({ ...p, injury: undefined, seasonLog: { ...(p.seasonLog ?? emptySeasonLog()), fitness: 88, load: 0 } })),
    };
    return { ...squad, aiFormation: aiRecordFor(squad, MATCH_DATE) };
  });
}

export const MATCH_DATE = "2026-10-17";

/** Deterministic pairing k (two different clubs) on a fixed matchday. */
export function pairAt(squads: Squad[], k: number): { home: Squad; away: Squad; date: string } {
  const h = seedFrom(`pair:${k}:h`) % squads.length;
  let a = seedFrom(`pair:${k}:a`) % squads.length;
  if (a === h) a = (a + 1) % squads.length;
  return { home: squads[h]!, away: squads[a]!, date: MATCH_DATE };
}
