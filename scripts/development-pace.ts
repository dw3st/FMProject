/**
 * Development pace: average attribute change over 3 seasons for typical careers, by starting age and profile.
 * Used to check the 0.1-step development keeps the old pace, and the training areas of the coaching staff
 * (`.claude/rules/game/staff.md`, `development.md` → "Áreas de treino").
 *
 *   bun scripts/development-pace.ts [--areas <1..5|vaga>] [--module <PlayerDevelopment.ts copy>] [--roles <roles.json copy>]
 *
 * Cases:
 *  - "realista": like the game — progress reset to zero and age +1 at every rollover (seasonTransition);
 *  - "sem virada": progress carried over, age fixed (the first version of this script);
 *  - "base": a 16-year-old in the academy, 240 normal sessions a season, progress never reset (as
 *    developYouthSeason, which divides GROWTH_DP_SCALE back out); cumulative change after each season.
 * Each season: 38 matches (every third rated 7.2, the rest 6.4), one normal training session per match.
 * `--areas` sets every training area to that many stars (3 = neutral, the default) or vacant.
 * `--module` / `--roles` point at another copy of the development code / role weights (e.g. the version before
 * the training areas) to compare.
 * Columns: the mean of the 13 attributes ("média 13") and the overall (`Player.computeOverallAvg`).
 */
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import currentRoles from "@/Data/roles.json";
import * as CURRENT from "@/GameEngine/PlayerDevelopment";
import type { AreaMults, RoleDPWeights } from "@/GameEngine/PlayerDevelopment";
import { DP_CATEGORIES } from "@/GameEngine/PlayerDevelopment";
import { STAFF } from "@/Domain/staff/staffConfig";
import { starCurve } from "@/Domain/staff/staff";
import { Player } from "@/Domain/Player";
import { emptyDevelopmentProgress, type PlayerStatsRecord, type RosterPlayer } from "@/types/playerTypes";

type Dev = Pick<typeof CURRENT, "applyDevelopment" | "applyTrainingDevelopment"> & { GROWTH_DP_SCALE?: number };

const argOf = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const moduleArg = argOf("--module");
const dev: Dev = moduleArg ? await import(resolve(moduleArg)) : CURRENT;
const rolesArg = argOf("--roles");
const rolesData = (rolesArg ? JSON.parse(readFileSync(resolve(rolesArg), "utf8")) : currentRoles) as
  Record<string, { dpWeights?: RoleDPWeights }>;

const areasArg = argOf("--areas") ?? "3";
const areaMult = areasArg === "vaga" ? STAFF.AREA_VACANT_MULT : starCurve(Number(areasArg), STAFF.AREA_MULT);
const AREAS: AreaMults = Object.fromEntries(DP_CATEGORIES.map((c) => [c, areaMult]));

const PROFILES: { name: string; role: string; stats: PlayerStatsRecord }[] = [
  { name: "meia (tudo 5)", role: "CM", stats: { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5,
    acceleration: 5, tackling: 5, pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 1, jump: 3 } },
  { name: "atacante", role: "ST", stats: { passing: 5, vision: 5, finishing: 7, dribbling: 6, speed: 7,
    acceleration: 6, tackling: 3, pressing: 4, stamina: 5, heading: 6, strength: 6, reflex: 1, jump: 3 } },
  { name: "zagueiro", role: "CB", stats: { passing: 4, vision: 4, finishing: 3, dribbling: 3, speed: 5,
    acceleration: 5, tackling: 7, pressing: 6, stamina: 5, heading: 7, strength: 7, reflex: 1, jump: 3 } },
];
const GOALKEEPER = { name: "goleiro", role: "GK", stats: { passing: 4, vision: 3, finishing: 3, dribbling: 3, speed: 3,
  acceleration: 3, tackling: 3, pressing: 5, stamina: 3, heading: 3, strength: 3, reflex: 5, jump: 5 } as PlayerStatsRecord };
const AGES = [18, 21, 24, 27, 31, 33];
const SEASONS = 3;

const mean = (p: RosterPlayer) => Object.values(p.stats).reduce((a, b) => a + b, 0) / 13;
const overall = (p: RosterPlayer) => Player.computeOverallAvg({ ...p, overallAvg: undefined });
const weightsOf = (role: string) => rolesData[role]!.dpWeights!;

/** [Δ mean of the 13, Δ overall, Δ reflex, Δ jump] after 3 seasons. */
function run(role: string, stats: PlayerStatsRecord, age0: number, realistic: boolean): [number, number, number, number] {
  const weights = weightsOf(role);
  let p = { id: "pace", name: "x", age: age0, preferredFoot: "right", positions: [role], stats: { ...stats } } as unknown as RosterPlayer;
  const start = p;
  for (let season = 0; season < SEASONS; season++) {
    if (realistic) p = { ...p, age: age0 + season, progress: emptyDevelopmentProgress() };
    for (let m = 0; m < 38; m++) {
      p = dev.applyDevelopment(p, m % 3 === 0 ? 7.2 : 6.4, weights, 1, 1, AREAS).updatedPlayer;
      p = dev.applyTrainingDevelopment(p, "normal", weights, 1, AREAS).updatedPlayer;
    }
  }
  return [mean(p) - mean(start), overall(p) - overall(start), p.stats.reflex - start.stats.reflex, p.stats.jump - start.stats.jump];
}

const f = (v: number) => v.toFixed(3).padStart(7);
console.log(`áreas: ${areasArg === "vaga" ? "vagas" : `${areasArg} estrelas`} (×${areaMult.toFixed(3)})${moduleArg ? ` · módulo ${moduleArg}` : ""}${rolesArg ? ` · pesos ${rolesArg}` : ""}`);
for (const realistic of [true, false]) {
  console.log(realistic ? "\nrealista (virada zera o progresso, idade +1)" : "\nsem virada (idade fixa)");
  console.log(["perfil".padEnd(22), ...AGES.map((a) => `${a}`.padStart(7))].join(""));
  for (const metric of [0, 1] as const) {
    const label = metric === 0 ? "média 13" : "overall";
    for (const prof of PROFILES) {
      console.log([`${prof.name} · ${label}`.padEnd(22), ...AGES.map((a) => f(run(prof.role, prof.stats, a, realistic)[metric]))].join(""));
    }
    const avg = AGES.map((a) => PROFILES.reduce((t, prof) => t + run(prof.role, prof.stats, a, realistic)[metric], 0) / PROFILES.length);
    console.log([`linha · ${label}`.padEnd(22), ...avg.map(f)].join(""));
    console.log([`goleiro · ${label}`.padEnd(22), ...AGES.map((a) => f(run(GOALKEEPER.role, GOALKEEPER.stats, a, realistic)[metric]))].join(""));
  }
  console.log(["goleiro · reflex".padEnd(22), ...AGES.map((a) => f(run(GOALKEEPER.role, GOALKEEPER.stats, a, realistic)[2]))].join(""));
  console.log(["goleiro · jump".padEnd(22), ...AGES.map((a) => f(run(GOALKEEPER.role, GOALKEEPER.stats, a, realistic)[3]))].join(""));
}

// Academy: mirrors developYouthSeason (CM weights, the growth scale divided back out, progress kept).
const youthStats: PlayerStatsRecord = { passing: 4, vision: 4, finishing: 4, dribbling: 4, speed: 5, acceleration: 5,
  tackling: 4, pressing: 4, stamina: 5, heading: 4, strength: 4, reflex: 1, jump: 3 };
let y = { id: "pace-youth", name: "x", age: 16, preferredFoot: "right", positions: ["CM"], stats: { ...youthStats } } as unknown as RosterPlayer;
const y0 = mean(y);
const cumulative: string[] = [];
for (let season = 0; season < SEASONS; season++) {
  for (let i = 0; i < 240; i++) {
    y = dev.applyTrainingDevelopment(y, "normal", weightsOf("CM"), 1 / (dev.GROWTH_DP_SCALE ?? 1), AREAS).updatedPlayer;
  }
  y = { ...y, age: y.age + 1 };
  cumulative.push((mean(y) - y0).toFixed(3));
}
console.log(`
base (16 anos, acumulado por temporada): ${cumulative.join(" / ")}`);
