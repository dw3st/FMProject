/**
 * Worker for the instruction matrix (`instructionMatrixPool.ts`): receives tasks one at a time and
 * answers each with the collected `InstrPairRaw` — same club on both sides, the next club of the
 * league per match, sides alternating. Stays alive until the pool terminates it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { emptyInstrPair, playInstructionMatch, RANDOM_FORMATIONS, type InstrTask } from "@/lab/instructionMatrix";
import type { Squad } from "@/types/playerTypes";

const cache = new Map<string, Squad[]>();
function loadLeague(league: string): Squad[] {
  const hit = cache.get(league);
  if (hit) return hit;
  const dir = fileURLToPath(new URL(`../Data/squads/${league}/`, import.meta.url));
  const squads = readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as Squad);
  cache.set(league, squads);
  return squads;
}

self.onmessage = (e: MessageEvent<InstrTask>) => {
  const t = e.data;
  const squads = loadLeague(t.league);
  const pair = emptyInstrPair(t.key, t.formation, t.kind);
  for (let m = 0; m < t.matches; m++) {
    const k = t.offset + m;
    // The random package (and its baseline) rotates formations so every role gets variants.
    const fid = t.formation === "random" ? RANDOM_FORMATIONS[k % RANDOM_FORMATIONS.length]! : t.formation;
    playInstructionMatch(
      squads[k % squads.length]!, formationForSimId(fid), autoLineupForFormation, t.spec, t.kind,
      k % 2 === 0, `${t.key}:${t.kind}:${k}`, pair,
    );
  }
  postMessage(pair);
};
