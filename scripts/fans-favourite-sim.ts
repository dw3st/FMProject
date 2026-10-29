/**
 * Fans of a favourite over a season (tester-report save analysis, 4.39): win / draw / loss rates and the
 * average expectation in, average and end of the fans meter out. Pure: `applyMatchResult` + `applyWeekly`.
 *
 *   bun scripts/fans-favourite-sim.ts [seasons=300]
 */
import { applyMatchResult, applyWeekly, initialBoardState } from "@/Domain/boardFans/boardFans";
import { mulberry32 } from "@/Domain/rng";

const SEASONS = Number(process.argv[2] ?? 300);
const CASES = [
  { name: "favourite, wins the league (75/15/10)", e: 0.7, w: 0.75, d: 0.15 },
  { name: "favourite, 3rd place (62/15/23)", e: 0.7, w: 0.62, d: 0.15 },
  { name: "favourite, mid table (45/25/30)", e: 0.7, w: 0.45, d: 0.25 },
  { name: "big favourite, 3rd place (62/15/23)", e: 1, w: 0.62, d: 0.15 },
  { name: "big favourite, wins (78/14/8)", e: 1, w: 0.78, d: 0.14 },
  { name: "mid club, mid table (40/28/32)", e: 0, w: 0.4, d: 0.28 },
  { name: "underdog, survives (28/30/42)", e: -0.5, w: 0.28, d: 0.3 },
];

for (const c of CASES) {
  let sumAvg = 0, sumEnd = 0, sumPeak = 0;
  for (let s = 0; s < SEASONS; s++) {
    const rng = mulberry32(1000 + s);
    let st = initialBoardState("2027-08-01", null);
    let total = 0, peak = 0;
    const games = 50; // league + cups
    for (let g = 0; g < games; g++) {
      const r = rng();
      const res = r < c.w ? [2, 0] : r < c.w + c.d ? [1, 1] : [0, 1];
      st = applyMatchResult(st, { goalsFor: res[0]!, goalsAgainst: res[1]!, home: g % 2 === 0, derby: g % 19 === 0, expectation: c.e + (rng() - 0.5) * 0.6 });
      if (g % 2 === 1) st = applyWeekly(st, { balance: 1, weeklyRevenue: 1 });
      total += st.fans; peak = Math.max(peak, st.fans);
    }
    sumAvg += total / games; sumEnd += st.fans; sumPeak += peak;
  }
  console.log(`${c.name.padEnd(42)} avg ${(sumAvg / SEASONS).toFixed(1)}  end ${(sumEnd / SEASONS).toFixed(1)}  peak ${(sumPeak / SEASONS).toFixed(1)}`);
}
