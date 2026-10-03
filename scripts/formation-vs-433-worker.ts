/**
 * Worker for `formation-vs-433.ts`: plays `matches` full-engine matches of ONE formation against
 * 4-3-3 with the SAME real squad on both sides (each match picks the next club of the league,
 * sides alternate so the tested formation is home half the time). Both sides auto-fill their XI
 * for their own formation (`autoLineupForFormation`, the game's selector) and play balanced.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import type { Squad } from "@/types/playerTypes";

interface Input { formation: string; vs: string; league: string; matches: number; offset: number }

export interface Totals {
  formation: string; matches: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; shotsFor: number; shotsAgainst: number;
}

function loadLeague(league: string): Squad[] {
  const dir = fileURLToPath(new URL(`../src/Data/squads/${league}/`, import.meta.url));
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as Squad);
}

function prefixed(squad: Squad, side: "A" | "B"): Squad {
  return { ...squad, players: squad.players.map((p) => ({ ...p, id: `${side}-${p.id}` })) };
}

self.onmessage = (e: MessageEvent<Input>) => {
  const { formation, vs, league, matches, offset } = e.data;
  const squads = loadLeague(league);
  const fX = formationForSimId(formation);
  const fV = formationForSimId(vs);
  const t: Totals = { formation, matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, shotsFor: 0, shotsAgainst: 0 };
  for (let m = 0; m < matches; m++) {
    const k = offset + m;
    const squad = squads[k % squads.length]!;
    const xHome = k % 2 === 0;
    const a = prefixed(squad, "A");
    const b = prefixed(squad, "B");
    const fA = xHome ? fX : fV;
    const fB = xHome ? fV : fX;
    const r = simulateMatch(a, b, fA, fB, autoLineupForFormation(a, fA), autoLineupForFormation(b, fB), {
      tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    });
    const gx = xHome ? r.score.A : r.score.B;
    const gv = xHome ? r.score.B : r.score.A;
    const sx = xHome ? r.teamStats.A.shots : r.teamStats.B.shots;
    const sv = xHome ? r.teamStats.B.shots : r.teamStats.A.shots;
    t.matches++; t.goalsFor += gx; t.goalsAgainst += gv; t.shotsFor += sx; t.shotsAgainst += sv;
    if (gx > gv) t.wins++; else if (gx < gv) t.losses++; else t.draws++;
  }
  postMessage(t);
};
