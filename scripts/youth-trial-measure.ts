/**
 * Youth trials (`.claude/rules/game/youth.md` → "Peneira de jovens"): youngsters, gems and mean level per trial, by
 * size and youth coach stars, on real clubs. `bun scripts/youth-trial-measure.ts [trials=300] [league=premier_league]`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { overallAvg } from "@/Domain/playerRating";
import { generateTrialPlayers, TRIAL_SIZES } from "@/Domain/youth/trials";
import type { Squad } from "@/types/playerTypes";

const trials = Number(process.argv[2] ?? 300);
const league = process.argv[3] ?? "premier_league";
const dir = join("src/Data/squads", league);
const squads: Squad[] = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
console.log(`${league}: ${squads.length} clubs, ${trials} trials per cell`);
console.log("size     coach  youngsters  gems/trial  mean OVR  best OVR (p95)");
for (const size of TRIAL_SIZES) {
  for (const stars of [1, 3, 5]) {
    let n = 0, gems = 0, sum = 0;
    const best: number[] = [];
    for (let i = 0; i < trials; i++) {
      const squad = squads[i % squads.length]!;
      const date = `2027-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 27)).padStart(2, "0")}`;
      const ps = generateTrialPlayers({ saveId: `m${i}`, seatId: "s1", trial: { date, age: 16, size }, squad, coachStars: stars, fame: 1 });
      n += ps.length;
      gems += ps.filter((p) => p.profile?.archetype === "Wonderkid").length;
      const ovr = ps.map((p) => overallAvg(p));
      sum += ovr.reduce((a, b) => a + b, 0);
      best.push(Math.max(...ovr));
    }
    best.sort((a, b) => a - b);
    console.log(`${size.padEnd(8)} ${stars}★     ${(n / trials).toFixed(1).padStart(10)}  ${(gems / trials).toFixed(3).padStart(10)}  ${(sum / n * 10).toFixed(1).padStart(8)}  ${(best[Math.floor(best.length * 0.95)]! * 10).toFixed(1)}`);
  }
}
