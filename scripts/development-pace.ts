/**
 * Development pace: average attribute change over 3 seasons for typical careers, by starting age and profile.
 * Used to check the 0.1-step development keeps the old pace.
 *
 *   bun scripts/development-pace.ts [--module <path to a PlayerDevelopment.ts copy>]
 *
 * Two cases:
 *  - "realista": like the game — progress reset to zero and age +1 at every rollover (seasonTransition);
 *  - "sem virada": progress carried over, age fixed (the first version of this script).
 * Each season: 38 matches (every third rated 7.2, the rest 6.4), one normal training session per match.
 * `--module` points at another copy of the development code (e.g. the pre-0.1-step version) to compare.
 */
import { resolve } from "node:path";
import rolesData from "@/Data/roles.json";
import * as CURRENT from "@/GameEngine/PlayerDevelopment";
import type { RoleDPWeights } from "@/GameEngine/PlayerDevelopment";
import { emptyDevelopmentProgress, type PlayerStatsRecord, type RosterPlayer } from "@/types/playerTypes";

type Dev = Pick<typeof CURRENT, "applyDevelopment" | "applyTrainingDevelopment">;

const moduleArg = process.argv.indexOf("--module");
const dev: Dev = moduleArg >= 0
  ? await import(resolve(process.argv[moduleArg + 1]!))
  : CURRENT;

const PROFILES: { name: string; role: string; stats: PlayerStatsRecord }[] = [
  { name: "meia (tudo 5)", role: "CM", stats: { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5,
    acceleration: 5, tackling: 5, pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 1, jump: 3 } },
  { name: "atacante", role: "ST", stats: { passing: 5, vision: 5, finishing: 7, dribbling: 6, speed: 7,
    acceleration: 6, tackling: 3, pressing: 4, stamina: 5, heading: 6, strength: 6, reflex: 1, jump: 3 } },
  { name: "zagueiro", role: "CB", stats: { passing: 4, vision: 4, finishing: 3, dribbling: 3, speed: 5,
    acceleration: 5, tackling: 7, pressing: 6, stamina: 5, heading: 7, strength: 7, reflex: 1, jump: 3 } },
];
const AGES = [18, 21, 24, 27, 31, 33];
const SEASONS = 3;

const mean = (p: RosterPlayer) => Object.values(p.stats).reduce((a, b) => a + b, 0) / 13;
const weightsOf = (role: string) => (rolesData as Record<string, { dpWeights?: RoleDPWeights }>)[role]!.dpWeights!;

function run(stats: PlayerStatsRecord, weights: RoleDPWeights, age0: number, realistic: boolean): number {
  let p = { id: "pace", name: "x", age: age0, positions: ["CM"], stats: { ...stats } } as unknown as RosterPlayer;
  const start = mean(p);
  for (let season = 0; season < SEASONS; season++) {
    if (realistic) p = { ...p, age: age0 + season, progress: emptyDevelopmentProgress() };
    for (let m = 0; m < 38; m++) {
      p = dev.applyDevelopment(p, m % 3 === 0 ? 7.2 : 6.4, weights).updatedPlayer;
      p = dev.applyTrainingDevelopment(p, "normal", weights).updatedPlayer;
    }
  }
  return mean(p) - start;
}

for (const realistic of [true, false]) {
  console.log(realistic ? "\nrealista (virada zera o progresso, idade +1)" : "\nsem virada (idade fixa)");
  console.log(["perfil".padEnd(16), ...AGES.map((a) => `${a}`.padStart(7))].join(""));
  for (const prof of PROFILES) {
    const row = AGES.map((a) => run(prof.stats, weightsOf(prof.role), a, realistic).toFixed(3).padStart(7));
    console.log([prof.name.padEnd(16), ...row].join(""));
  }
  const avg = AGES.map((a) => PROFILES.reduce((t, prof) => t + run(prof.stats, weightsOf(prof.role), a, realistic), 0)
    / PROFILES.length);
  console.log(["média".padEnd(16), ...avg.map((v) => v.toFixed(3).padStart(7))].join(""));
}
