/**
 * Academy training pace (`docs/superpowers/specs/2026-10-28-youth-training-design.md`): a 16-year-old over a year of
 * daily sessions per intensity and focus, against the old rollover block (`developYouthSeason`).
 *
 *   bun scripts/youth-training-pace.ts
 */
import { developYouthSeason } from "@/Domain/youth/youth";
import { DEFAULT_YOUTH_PLAN, trainYouthSession, YOUTH_TRAINING } from "@/Domain/youth/youthTraining";
import type { RosterPlayer } from "@/types/playerTypes";
import type { YouthTrainingPlan } from "@/types/youthTrainingTypes";

const y = {
  id: "y1", name: "Y", age: 16, squadId: "s", preferredFoot: "right", positions: ["Midfielder"], naturalPosition: "CM",
  stats: { passing: 4, vision: 4, finishing: 3, dribbling: 4, speed: 4, acceleration: 4, tackling: 3, pressing: 3, stamina: 4, heading: 3, strength: 3, reflex: 1, jump: 1 },
  profile: { summary: "", archetype: "" }, nationality: "Spain",
} as RosterPlayer;
const mean = (p: RosterPlayer) => Object.values(p.stats).reduce((s, v) => s + v, 0) / Object.values(p.stats).length;
const year = (plan: YouthTrainingPlan, n = YOUTH_TRAINING.SESSIONS_PER_YEAR) => {
  let p = y;
  for (let i = 0; i < n; i++) p = trainYouthSession(p, plan, 1, {});
  return p;
};
const old = developYouthSeason(y, 1);
console.log(`old rollover block: mean +${(mean(old) - mean(y)).toFixed(3)}`);
for (const intensity of ["light", "normal", "heavy"] as const) {
  const p = year({ ...DEFAULT_YOUTH_PLAN, intensity });
  console.log(`${intensity.padEnd(6)} mean +${(mean(p) - mean(y)).toFixed(3)}  dribbling ${y.stats.dribbling} -> ${p.stats.dribbling}`);
}
const tech = year({ ...DEFAULT_YOUTH_PLAN, focus: "technical" });
console.log(`technical focus: mean +${(mean(tech) - mean(y)).toFixed(3)}  dribbling ${y.stats.dribbling} -> ${tech.stats.dribbling}`);
