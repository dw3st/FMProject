/**
 * Youth balance (11.1, tester reports: academy players near the top of the scale and worth over a billion at 18).
 * A career from 16 to 24 under the best conditions a human club can build (heavy academy training, the best staff and
 * training ground, youth games, then a first-team place) and under the conditions of a common AI club, with and
 * without the elite brake, from several starting levels.
 *
 *   bun scripts/youth-balance-measure.ts [seeds=40]
 *   ELITE_BRAKE='{"FROM":6.5,"TO":8,"MIN":0.15}' bun scripts/youth-balance-measure.ts
 */
import { applyDevelopment, applyTrainingDevelopment, ELITE_BRAKE } from "@/GameEngine/PlayerDevelopment";
import { dpWeightsFor } from "@/Domain/development/dpWeights";
import { statsFor } from "@/Domain/youth/youth";
import { academyAreas, academyClubMult, DEFAULT_YOUTH_PLAN, trainYouthSession, YOUTH_TRAINING } from "@/Domain/youth/youthTraining";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { computeOverallAvg } from "@/Domain/playerRating";
import { Player } from "@/Domain/Player";
import { mulberry32 } from "@/Domain/rng";
import type { RosterPlayer } from "@/types/playerTypes";

const seeds = Number(process.argv[2] ?? 40);
const override = process.env.ELITE_BRAKE ? JSON.parse(process.env.ELITE_BRAKE) as Partial<typeof ELITE_BRAKE> : null;

const AREAS_BEST = { goalkeeping: 1.25, defending: 1.25, shooting: 1.25, technical: 1.25, passing: 1.25, physical: 1.25, setPieces: 1.25 };

interface Setup {
  label: string;
  /** DP multiplier of staff, training ground and the manager. */
  dpMult: number;
  areas: Record<string, number>;
  academyIntensity: "normal" | "heavy";
  /** Age he joins the first team. */
  promoteAt: number;
  youthGames: number;
  matches: number;
  sessions: number;
  training: "normal" | "heavy";
  matchRating: number;
}

const HUMAN_BEST: Setup = {
  label: "human club, everything maxed", dpMult: 1.15 * 1.2, areas: AREAS_BEST, academyIntensity: "heavy",
  promoteAt: 18, youthGames: 60, matches: 45, sessions: 200, training: "heavy", matchRating: 6.9,
};
const AI_COMMON: Setup = {
  label: "common AI club", dpMult: 1, areas: {}, academyIntensity: "normal",
  promoteAt: 17, youthGames: 30, matches: 25, sessions: 200, training: "normal", matchRating: 6.5,
};

function gaussian(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng());
}

function career(setup: Setup, role: string, level: number, startAge: number, seed: number): number[] {
  const rng = mulberry32(seed);
  let p = {
    id: `y${seed}`, name: "Y", age: startAge, squadId: "s", preferredFoot: "right",
    positions: [role === "CB" ? "Defender" : role === "CM" ? "Midfielder" : "Forward"], naturalPosition: role,
    stats: statsFor(`y${seed}:${role}`, role, level), profile: { summary: "", archetype: "" }, nationality: "England",
  } as RosterPlayer;
  const out: number[] = [];
  for (let age = startAge; age <= 24; age++) {
    p = { ...p, age, overallAvg: undefined };
    out.push(computeOverallAvg(p));
    const weights = dpWeightsFor(p);
    const rating = () => setup.matchRating + 0.6 * gaussian(rng);
    if (age < setup.promoteAt) {
      // Academy: its progress is never reset; daily sessions and the youth games.
      for (let i = 0; i < YOUTH_TRAINING.SESSIONS_PER_YEAR; i++) {
        p = trainYouthSession(p, { ...DEFAULT_YOUTH_PLAN, intensity: setup.academyIntensity }, academyClubMult(setup.dpMult), academyAreas(setup.areas));
      }
      for (let i = 0; i < setup.youthGames; i++) p = applyDevelopment(p, rating(), weights, academyClubMult(setup.dpMult) * YOUTH_COMP.DP_MULT, 0, academyAreas(setup.areas)).updatedPlayer;
    } else {
      // First team: the rollover resets the progress.
      p = { ...p, progress: undefined };
      for (let i = 0; i < setup.matches; i++) p = applyDevelopment(p, rating(), weights, setup.dpMult, 1, setup.areas).updatedPlayer;
      for (let i = 0; i < setup.sessions; i++) p = applyTrainingDevelopment(p, setup.training, weights, setup.dpMult, setup.areas).updatedPlayer;
      if (age <= 21) for (let i = 0; i < Math.round(setup.youthGames / 2); i++) p = applyDevelopment(p, rating(), weights, setup.dpMult * YOUTH_COMP.DP_MULT, 0, setup.areas).updatedPlayer;
    }
  }
  return out;
}

function run(tag: string) {
  console.log(`\n=== ${tag}: brake ${JSON.stringify(ELITE_BRAKE)} ===`);
  for (const setup of [HUMAN_BEST, AI_COMMON]) {
    console.log(`\n${setup.label}`);
    console.log("start  " + Array.from({ length: 9 }, (_, i) => String(16 + i).padStart(6)).join("") + "   value at 19 / 22 (€M)");
    for (const level of [4.5, 5.5, 6.2, 7.0]) {
      const sum = new Array(9).fill(0);
      for (let s = 0; s < seeds; s++) {
        for (const role of ["ST", "CM", "CB"]) career(setup, role, level, 16, 1000 + s).forEach((v, i) => { sum[i] += v / (seeds * 3); });
      }
      const value = (age: number) => Math.round(new Player(sum[age - 16], age).valueMillions);
      console.log(`${level.toFixed(1).padStart(5)}  ` + sum.map((v: number) => (v * 10).toFixed(1).padStart(6)).join("") + `   ${value(19)} / ${value(22)}`);
    }
  }
}

const saved = { ...ELITE_BRAKE };
Object.assign(ELITE_BRAKE, { FROM: 99, TO: 100, MIN: 1 });
run("before (no brake)");
Object.assign(ELITE_BRAKE, saved, override ?? {});
run("after");
