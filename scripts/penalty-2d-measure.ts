// Calibration of the 2D penalty (`Domain/penalty/penaltyKick.ts`): conversion over N kicks per profile.
// `bun scripts/penalty-2d-measure.ts [n] [seed]`. Targets (4.39.5): average taker (finishing 0.5, strength 0.5) vs average
// keeper ≈ 75%, a good finisher ≈ 85%, a poor one ≈ 65%; the AI's area weights for the taker.
import { aiDive, aiKick, GOAL_AREAS, resolveKick, type GoalArea } from "@/Domain/penalty/penaltyKick";
import { mulberry32 } from "@/Domain/rng";

const n = Number(process.argv[2] ?? 20000);
const rng = mulberry32(Number(process.argv[3] ?? 7));
const keeper = (k: number) => ({ reflex: k, diving: k });

function run(label: string, acc: number, str: number, kp: number, kickOf: () => GoalArea, diveOf: () => GoalArea) {
  const c = { goal: 0, saved: 0, miss: 0, post: 0 };
  for (let i = 0; i < n; i++) c[resolveKick({ area: kickOf() }, diveOf(), { accuracy: acc, strength: str, keeper: keeper(kp) }, rng).result]++;
  const pct = (x: number) => `${((x / n) * 100).toFixed(1)}%`;
  console.log(`${label.padEnd(46)} goal ${pct(c.goal)}  saved ${pct(c.saved)}  miss ${pct(c.miss)}  post ${pct(c.post)}`);
}

const ai = () => aiKick(rng).area;
const random = () => GOAL_AREAS[Math.floor(rng() * 6)]!;
run("avg taker vs avg keeper (AI dive)", 0.5, 0.5, 0.5, ai, () => aiDive(rng));
run("avg taker vs avg keeper (random human dive)", 0.5, 0.5, 0.5, ai, random);
run("avg taker, random human kick, AI dive", 0.5, 0.5, 0.5, random, () => aiDive(rng));
run("good finisher 0.85 vs avg keeper", 0.85, 0.5, 0.5, ai, () => aiDive(rng));
run("poor finisher 0.2 vs avg keeper", 0.2, 0.5, 0.5, ai, () => aiDive(rng));
run("avg finisher, strong 0.9", 0.5, 0.9, 0.5, ai, () => aiDive(rng));
run("avg finisher, weak 0.1", 0.5, 0.1, 0.5, ai, () => aiDive(rng));
run("avg taker vs elite keeper 0.9", 0.5, 0.5, 0.9, ai, () => aiDive(rng));
run("avg taker vs poor keeper 0.2", 0.5, 0.5, 0.2, ai, () => aiDive(rng));
for (const a of GOAL_AREAS) run(`  always ${a}`, 0.5, 0.5, 0.5, () => a, () => aiDive(rng));
