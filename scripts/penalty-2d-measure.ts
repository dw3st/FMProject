// Calibration of the 2D penalty (`Domain/penalty/penaltyKick.ts`): conversion over N kicks per profile.
// `bun scripts/penalty-2d-measure.ts [n] [seed]`. Target: average taker (0.5) vs average keeper (0.5/0.5) ≈ 75%.
import { aiDive, aiKick, GOAL_AREAS, resolveKick } from "@/Domain/penalty/penaltyKick";
import { mulberry32 } from "@/Domain/rng";

const n = Number(process.argv[2] ?? 20000);
const rng = mulberry32(Number(process.argv[3] ?? 7));
const keeper = (k: number) => ({ reflex: k, diving: k });

function run(label: string, acc: number, kp: number, diveOf: () => (typeof GOAL_AREAS)[number]) {
  const c = { goal: 0, saved: 0, miss: 0, post: 0 };
  for (let i = 0; i < n; i++) c[resolveKick(aiKick(rng), diveOf(), { accuracy: acc, keeper: keeper(kp) }, rng).result]++;
  const pct = (x: number) => `${((x / n) * 100).toFixed(1)}%`;
  console.log(`${label.padEnd(44)} goal ${pct(c.goal)}  saved ${pct(c.saved)}  miss ${pct(c.miss)}  post ${pct(c.post)}`);
}

run("avg taker vs avg keeper (AI dive)", 0.5, 0.5, () => aiDive(rng));
run("avg taker vs avg keeper (random human dive)", 0.5, 0.5, () => GOAL_AREAS[Math.floor(rng() * 6)]!);
run("good taker 0.85 vs avg keeper", 0.85, 0.5, () => aiDive(rng));
run("poor taker 0.2 vs avg keeper", 0.2, 0.5, () => aiDive(rng));
run("avg taker vs elite keeper 0.9", 0.5, 0.9, () => aiDive(rng));
run("avg taker vs poor keeper 0.2", 0.5, 0.2, () => aiDive(rng));
