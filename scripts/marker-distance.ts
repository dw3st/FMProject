// Man-marker distance to his target, settled defending only, over many seeded matches.
//   bun scripts/marker-distance.ts [partidas=60] [liga=premier_league]
// A single seed says little: the mean of one match goes from 2 to 12 yards.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mulberry32 } from "@/Domain/rng";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import formation433Json from "@/Data/formations/4-3-3.json";
import type { Formation } from "@/GameEngine/types";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

const N = Number(process.argv[2] ?? 60);
const LEAGUE = process.argv[3] ?? "premier_league";
const F433 = formation433Json as unknown as Formation;
const dir = fileURLToPath(new URL(`../src/example_data/squads/${LEAGUE}/`, import.meta.url));
const squads = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
  const s = JSON.parse(readFileSync(dir + f, "utf8")) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
});
const CM_SLOT = F433.attacking.findIndex((s) => s.role === "CM");
const ST_SLOT = F433.attacking.findIndex((s) => s.role === "ST");

const realRandom = Math.random;
const perMatch: number[] = [];
const byDecision = new Map<string, { n: number; sum: number }>();
const buckets = [0, 0, 0, 0]; // <3, 3-6, 6-10, 10+
const far = { n: 0, boundX: 0, firstHalf: 0, dx: 0, dy: 0, recovering: 0, stale: 0, sum: 0, speed: 0 };
let ticks = 0, sum = 0, shots = 0, goals = 0, minutes = 0;

for (let i = 0; i < N; i++) {
  Math.random = mulberry32(1000 + i);
  let mSum = 0, mN = 0;
  const home = squads[i % squads.length]!;
  const away = squads[(i + 1 + (i % (squads.length - 1))) % squads.length]!;
  const r = simulateMatch(home, away === home ? squads[(i + 1) % squads.length]! : away, F433, F433, undefined, undefined, {
    tactics: { A: { style: "balanced", manMarks: [{ slot: CM_SLOT, targetSlot: ST_SLOT }] }, B: { style: "balanced" } },
    onTick: (st) => {
      if (st.matchPhase !== "firstHalf" && st.matchPhase !== "secondHalf") return;
      const holder = st.players.find((p) => p.id === st.ballHolderId);
      if (!holder || holder.team !== "B" || st.possessionTime < 3 || st.setPiece || st.setPiecePhase) return;
      const pair = st.manMarks?.A?.[0];
      if (!pair) return;
      const m = st.players.find((p) => p.id === pair.markerId);
      const t = st.players.find((p) => p.id === pair.targetId);
      if (!m || !t) return;
      const d = Math.hypot(m.x - t.x, m.y - t.y);
      mSum += d; mN++; sum += d; ticks++;
      buckets[d < 3 ? 0 : d < 6 ? 1 : d < 10 ? 2 : 3]!++;
      if (d >= 10) {
        far.n++;
        const b = m.bounds;
        if (b && (m.x <= b.minX + 0.5 || m.x >= b.maxX - 0.5)) far.boundX++;
        if (st.matchPhase === "firstHalf") far.firstHalf++;
        far.dx += Math.abs(m.x - t.x); far.dy += Math.abs(m.y - t.y);
        if ((m.recoveryTime ?? 0) > 0) far.recovering++;
      }
      const dec = st.decisions?.[m.id]?.type ?? "none";
      const e = byDecision.get(dec) ?? { n: 0, sum: 0 };
      e.n++; e.sum += d; byDecision.set(dec, e);
    },
  });
  if (mN) perMatch.push(mSum / mN);
  shots += r.teamStats.B.markedTargetShots ?? 0;
  goals += r.teamStats.B.markedTargetGoals ?? 0;
  minutes += r.teamStats.B.manMarked ?? 0;
}
Math.random = realRandom;

perMatch.sort((a, b) => a - b);
const q = (p: number) => perMatch[Math.floor((perMatch.length - 1) * p)]!;
const mean = perMatch.reduce((a, b) => a + b, 0) / perMatch.length;
const sd = Math.sqrt(perMatch.reduce((a, b) => a + (b - mean) ** 2, 0) / perMatch.length);
console.log(`matches ${perMatch.length} ticks/match ${(ticks / perMatch.length).toFixed(0)} tick-mean ${(sum / ticks).toFixed(2)} yd`);
console.log(`per match: mean ${mean.toFixed(2)} (se ${(sd / Math.sqrt(perMatch.length)).toFixed(2)}) min ${q(0).toFixed(1)} p25 ${q(0.25).toFixed(1)} median ${q(0.5).toFixed(1)} p75 ${q(0.75).toFixed(1)} max ${q(1).toFixed(1)}`);
console.log(`ticks by distance: <3 ${(100 * buckets[0]! / ticks).toFixed(1)}%  3-6 ${(100 * buckets[1]! / ticks).toFixed(1)}%  6-10 ${(100 * buckets[2]! / ticks).toFixed(1)}%  10+ ${(100 * buckets[3]! / ticks).toFixed(1)}%`);
console.log(`target per match: shots ${(shots / N).toFixed(2)} goals ${(goals / N).toFixed(2)} minutes marked ${(minutes / N).toFixed(1)}`);
for (const [k, v] of [...byDecision].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${k.padEnd(22)} ${(100 * v.n / ticks).toFixed(1).padStart(5)}% of ticks, mean ${(v.sum / v.n).toFixed(2)} yd`);
}
console.log(`far (10+): at X bound ${(100*far.boundX/far.n).toFixed(1)}%  first half ${(100*far.firstHalf/far.n).toFixed(1)}%  mean |dx| ${(far.dx/far.n).toFixed(1)} |dy| ${(far.dy/far.n).toFixed(1)}  recovering ${(100*far.recovering/far.n).toFixed(1)}%`);
