/**
 * Worker for `formation-matrix.ts`: receives tasks `{ x, y, matches, offset }` one at a time and
 * answers each with the collected `PairRaw` (same club on both sides, the next club of the league
 * per match, sides alternating). Stays alive until the parent terminates it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { emptyPair, playMatrixMatch } from "@/lab/formationMatrix";
import type { Squad } from "@/types/playerTypes";

export interface MatrixTask { league: string; x: string; y: string; matches: number; offset: number }

const cache = new Map<string, Squad[]>();
function loadLeague(league: string): Squad[] {
  if (cache.has(league)) return cache.get(league)!;
  const dir = fileURLToPath(new URL(`../src/Data/squads/${league}/`, import.meta.url));
  const squads = readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as Squad);
  cache.set(league, squads);
  return squads;
}

self.onmessage = (e: MessageEvent<MatrixTask>) => {
  const { league, x, y, matches, offset } = e.data;
  const squads = loadLeague(league);
  const fX = formationForSimId(x);
  const fY = formationForSimId(y);
  const pair = emptyPair(x, y);
  for (let m = 0; m < matches; m++) {
    const k = offset + m;
    playMatrixMatch(squads[k % squads.length]!, fX, fY, autoLineupForFormation, k % 2 === 0, pair);
  }
  postMessage(pair);
};
