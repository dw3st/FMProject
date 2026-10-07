/**
 * Development pace: average attribute change over 3 seasons for typical careers (young, peak, veteran).
 * Used to check the 0.1-step development keeps the old pace.
 *
 *   bun scripts/development-pace.ts
 */
import { applyDevelopment, applyTrainingDevelopment, DEFAULT_DP_WEIGHTS } from "@/GameEngine/PlayerDevelopment";
import type { RosterPlayer } from "@/types/playerTypes";

const base = { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
  pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 1, jump: 3 };
const mean = (p: RosterPlayer) => Object.values(p.stats).reduce((a, b) => a + b, 0) / 13;

for (const age of [18, 24, 31]) {
  let p = { id: `pace${age}`, name: "x", age, positions: ["CM"], stats: { ...base } } as unknown as RosterPlayer;
  const start = mean(p);
  for (let season = 0; season < 3; season++) {
    for (let m = 0; m < 38; m++) {
      p = applyDevelopment(p, m % 3 === 0 ? 7.2 : 6.4, DEFAULT_DP_WEIGHTS).updatedPlayer;
      p = applyTrainingDevelopment(p, "normal", DEFAULT_DP_WEIGHTS).updatedPlayer;
    }
  }
  console.log(`idade ${age}: média ${start.toFixed(2)} → ${mean(p).toFixed(2)} (Δ ${(mean(p) - start).toFixed(2)})`);
}
