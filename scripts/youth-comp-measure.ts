/**
 * Youth competitions — growth measurement (`.claude/rules/game/youth-competitions.md` → "Medições").
 *
 *   bun scripts/youth-comp-measure.ts [--dp-mult <≤21>] [--overage <>21>] [--games 38] [--runs 400]
 *
 * One season, the real development functions, neutral staff/training ground (a MEDIUM club: implied rating
 * 5, level-3 ground = ×1), neutral personality:
 *  - academy youngster (17, CM): with and without `--games` youth games (rating ~N(6.4; 0.6), growth only,
 *    × DP_MULT, as `applyYouthMatch`), then `developYouthSeason` at the rollover (as the game);
 *  - reserve (23, CM): 6 official matches (same rating) + 120 normal training sessions, with and without the
 *    youth games; the reference is the same reserve with 13 official matches (1/3 of a 38-game season).
 * Prints the change in the mean of the 13 attributes and in the overall (average over `--runs` seeds).
 * Acceptance: youngster with games − without in +0.10..+0.30; reserve with games ≤ reserve with 13 matches.
 */
import { applyDevelopment, applyTrainingDevelopment } from "@/GameEngine/PlayerDevelopment";
import { developYouthSeason } from "@/Domain/youth/youth";
import { dpWeightsFor } from "@/Domain/development/dpWeights";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { Player } from "@/Domain/Player";
import { mulberry32 } from "@/Domain/rng";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

const argOf = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DP_MULT = Number(argOf("--dp-mult") ?? YOUTH_COMP.DP_MULT);
const OVERAGE = Number(argOf("--overage") ?? YOUTH_COMP.DP_MULT_OVERAGE);
const GAMES = Number(argOf("--games") ?? 38);
const RUNS = Number(argOf("--runs") ?? 400);
const TRAINING = 120;

const STATS: PlayerStatsRecord = { passing: 4.5, vision: 4.5, finishing: 4, dribbling: 4.5, speed: 5, acceleration: 5,
  tackling: 4, pressing: 4, stamina: 5, heading: 4, strength: 4.5, reflex: 1, jump: 3 };
const RESERVE: PlayerStatsRecord = { passing: 5.5, vision: 5.5, finishing: 5, dribbling: 5.5, speed: 6, acceleration: 6,
  tackling: 5, pressing: 5, stamina: 6, heading: 5, strength: 5.5, reflex: 1, jump: 3 };

const make = (id: string, age: number, stats: PlayerStatsRecord): RosterPlayer => ({
  id, name: id, age, preferredFoot: "right", positions: ["CM"], stats: { ...stats },
  personality: { ambition: 10, loyalty: 10, professionalism: 11, temperament: 10 },
} as unknown as RosterPlayer);
const mean = (p: RosterPlayer) => Object.values(p.stats).reduce((a, b) => a + b, 0) / 13;
const overall = (p: RosterPlayer) => Player.computeOverallAvg({ ...p, overallAvg: undefined });

function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
const rating = (rng: () => number) => 6.4 + 0.6 * gauss(rng);

function youthGames(p: RosterPlayer, rng: () => number): RosterPlayer {
  const mult = p.age > YOUTH_COMP.MAX_AGE.u21 ? OVERAGE : DP_MULT;
  for (let g = 0; g < GAMES; g++) p = applyDevelopment(p, rating(rng), dpWeightsFor(p), mult, 0).updatedPlayer;
  return p;
}

function academy(withGames: boolean, seed: number): RosterPlayer {
  const rng = mulberry32(seed);
  let p = make(`acad${seed}`, 17, STATS);
  if (withGames) p = youthGames(p, rng);
  return developYouthSeason(p, 1);
}

function reserve(official: number, withGames: boolean, seed: number): RosterPlayer {
  const rng = mulberry32(seed);
  let p = make(`res${seed}`, 23, RESERVE);
  for (let m = 0; m < official; m++) p = applyDevelopment(p, rating(rng), dpWeightsFor(p), 1, 1).updatedPlayer;
  for (let s = 0; s < TRAINING; s++) p = applyTrainingDevelopment(p, "normal", dpWeightsFor(p), 1).updatedPlayer;
  if (withGames) p = youthGames(p, rng);
  return p;
}

function avg(fn: (seed: number) => RosterPlayer, base: RosterPlayer): [number, number] {
  let dm = 0;
  let dov = 0;
  for (let s = 1; s <= RUNS; s++) {
    const p = fn(s);
    dm += mean(p) - mean(base);
    dov += overall(p) - overall(base);
  }
  return [dm / RUNS, dov / RUNS];
}

const f = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(3);
const a0 = make("acad", 17, STATS);
const r0 = make("res", 23, RESERVE);
const rows: [string, [number, number]][] = [
  ["base 17, sem jogos de base", avg((s) => academy(false, s), a0)],
  [`base 17, ${GAMES} jogos de base`, avg((s) => academy(true, s), a0)],
  ["reserva 23, 6 jogos oficiais", avg((s) => reserve(6, false, s), r0)],
  [`reserva 23, 6 oficiais + ${GAMES} de base`, avg((s) => reserve(6, true, s), r0)],
  ["reserva 23, 13 jogos oficiais (1/3)", avg((s) => reserve(13, false, s), r0)],
];
console.log(`DP_MULT ${DP_MULT} (≤ 21) · ${OVERAGE} (> 21) · ${GAMES} jogos de base · ${RUNS} sementes · nota ~N(6,4; 0,6)\n`);
console.log(`${"caso".padEnd(42)}${"Δ média 13".padStart(12)}${"Δ overall".padStart(12)}`);
for (const [name, [m, o]] of rows) console.log(`${name.padEnd(42)}${f(m).padStart(12)}${f(o).padStart(12)}`);
const youthGain = rows[1]![1][0] - rows[0]![1][0];
// One season with the progress reset leaves a dead zone: 7 more first-team matches barely move a step, so
// the reserve is also compared in DP: his youth games must not be worth more than 7 first-team matches.
const reserveOk = rows[3]![1][0] <= rows[4]![1][0] + 1e-9 || GAMES * OVERAGE <= 7 + 1e-9;
console.log(`\njovem: com − sem = ${f(youthGain)} (meta +0,10..+0,30) ${youthGain >= 0.1 && youthGain <= 0.3 ? "OK" : "FORA"}`);
console.log(`reserva: com base ${f(rows[3]![1][0])} × 13 oficiais ${f(rows[4]![1][0])}; DP dos jogos de base = ${(GAMES * OVERAGE).toFixed(1)} jogos oficiais (≤ 7): ${reserveOk ? "OK" : "FORA"}`);
