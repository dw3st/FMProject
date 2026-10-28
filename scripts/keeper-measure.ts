// Active keeper (`Keeper.ts`): goals, shots and keeper stats per match with the behaviours switched on/off.
// `bun scripts/keeper-measure.ts [matches=300] [variant=all] [league=premier_league] [seed=1000]`
// variants: off, all, sweep, rush, attack, far, high (one behaviour on), or KEEPER_OVERRIDES='{"RUSH_MAX":10}'.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { mulberry32 } from "@/Domain/rng";
import type { Squad } from "@/types/playerTypes";

const n = Number(process.argv[2] ?? 300);
const variant = process.argv[3] ?? "all";
const league = process.argv[4] ?? "premier_league";
const seedBase = Number(process.argv[5] ?? 1000);
// Absent on a checkout without the active keeper (baseline runs): nothing to switch.
const K = ((await import("@/GameEngine/Configs/KeeperConfig").catch(() => null))?.KEEPER_CONFIG ?? {}) as Record<string, number | boolean>;
const OFF = { sweep: { SWEEP_RANGE: 0 }, rush: { RUSH_RANGE: 0 }, attack: { ATTACK_ENABLED: false }, far: { FAR_COME_OUT: 0.5 }, high: { HIGH_REACH: 0 } };
const parts = Object.keys(OFF) as (keyof typeof OFF)[];
const offs = variant === "all" ? [] : variant === "off" ? parts : parts.filter(p => p !== variant);
for (const p of offs) Object.assign(K, OFF[p]);
if (process.env.KEEPER_OVERRIDES) Object.assign(K, JSON.parse(process.env.KEEPER_OVERRIDES));

const dir = fileURLToPath(new URL(`../src/Data/squads/${league}/`, import.meta.url));
const squads: Squad[] = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(dir + f, "utf8")));
const f = formationForSimId("4-3-3");
const lineups = squads.map(s => autoLineupForFormation(s, f, "2026-08-15"));
let goals = 0, sq = 0, shots = 0, sorties = 0, sweeps = 0, smothers = 0, pens = 0;
const realRandom = Math.random;
for (let i = 0; i < n; i++) {
  const a = i % squads.length, b = (i * 7 + 3) % squads.length === a ? (a + 1) % squads.length : (i * 7 + 3) % squads.length;
  Math.random = mulberry32(seedBase + i);
  const r = simulateMatch(squads[a]!, squads[b]!, f, f, lineups[a]!, lineups[b]!, {});
  Math.random = realRandom;
  const g = r.score.A + r.score.B;
  goals += g; sq += g * g;
  for (const t of [r.teamStats.A, r.teamStats.B]) {
    shots += t.shots ?? 0; sorties += t.keeperSorties ?? 0; sweeps += t.keeperSweeps ?? 0;
    smothers += t.keeperSmothers ?? 0; pens += t.penaltiesAwarded ?? 0;
  }
}
const m = goals / n, se = Math.sqrt((sq / n - m * m) / n);
console.log(`${league} ${variant}${process.env.KEEPER_OVERRIDES ? " " + process.env.KEEPER_OVERRIDES : ""}: n ${n}  goals ${m.toFixed(3)} ± ${se.toFixed(3)}  shots ${(shots / n).toFixed(2)}  sorties ${(sorties / n).toFixed(2)}  sweeps ${(sweeps / n).toFixed(2)}  smothers ${(smothers / n).toFixed(2)}  pens ${(pens / n).toFixed(3)}`);
