/**
 * Best tactic for one club against its real league: every candidate (formation × style) plays each other club home
 * and away in the full engine, the opponents in their AI formation (balanced, familiarity 75). Common random
 * numbers: match k uses the same seeded Math.random for every candidate, so the comparison is paired.
 * bun scripts/_bestTactic.ts <squads dir> <clubId> <date> <reps> <formation:style,...|auto> [--out f]
 */
import { readdir } from "node:fs/promises";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { autoLineupForFormationWithFitness, aiRecordFor } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { aiFormationScores } from "@/Domain/formation/aiFormation";
import { mulberry32 } from "@/Domain/rng";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import type { TacticalStyle } from "@/types/tacticsTypes";

const [dir, clubId, date, repsArg, candArg] = process.argv.slice(2);
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;
const reps = Number(repsArg);
const files = (await readdir(dir!)).filter((f) => f.endsWith(".json"));
const squads: Squad[] = await Promise.all(files.map(async (f) => {
  const s = (await Bun.file(`${dir}/${f}`).json()) as Squad;
  // Everyone fresh: compare shapes, not this week's fatigue. Injuries and suspensions stay (date).
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...(p.seasonLog ?? emptySeasonLog()), fitness: 88, load: 0 } })) };
}));
const me = squads.find((s) => s.id === clubId)!;
const opps = squads.filter((s) => s.id !== clubId);
const fam = me.styleFamiliarity ?? {};

let cands: { f: string; s: TacticalStyle }[];
if (candArg === "auto") {
  const fits = aiFormationScores(me, "2027").filter((x) => x.eligible).sort((a, b) => b.fit - a.fit).slice(0, 6);
  console.log("fit:", fits.map((x) => `${x.id} ${x.fit.toFixed(3)}`).join(" | "));
  cands = fits.flatMap((x) => (["possession", "balanced"] as TacticalStyle[]).map((s) => ({ f: x.id, s })));
} else {
  cands = candArg!.split(",").map((c) => { const [f, s] = c.split(":"); return { f: f!, s: s as TacticalStyle }; });
}

const realRandom = Math.random;
const res: Record<string, { n: number; pts: number; gf: number; ga: number; w: number; d: number; l: number }> = {};
const t0 = performance.now();
for (const c of cands) {
  const key = `${c.f}:${c.s}`;
  const r = (res[key] = { n: 0, pts: 0, gf: 0, ga: 0, w: 0, d: 0, l: 0 });
  const form = formationForSimId(c.f);
  const myXi = autoLineupForFormationWithFitness(me, form, date);
  let k = 0;
  for (let rep = 0; rep < reps; rep++) {
    for (const o of opps) {
      const of = formationForSimId(aiRecordFor(o, date!).id);
      const oXi = autoLineupForFormationWithFitness(o, of, date);
      for (const home of [true, false]) {
        Math.random = mulberry32(1000 + k++);
        const tacMe = { style: c.s, familiarity: fam };
        const tacO = { style: "balanced" as TacticalStyle, familiarity: { balanced: 75 } };
        const m = home
          ? simulateMatch(me, o, form, of, myXi, oXi, { tactics: { A: tacMe, B: tacO } })
          : simulateMatch(o, me, of, form, oXi, myXi, { tactics: { A: tacO, B: tacMe } });
        Math.random = realRandom;
        const [gf, ga] = home ? [m.score.A, m.score.B] : [m.score.B, m.score.A];
        r.n++; r.gf += gf; r.ga += ga;
        if (gf > ga) { r.w++; r.pts += 3; } else if (gf === ga) { r.d++; r.pts += 1; } else r.l++;
      }
    }
  }
  console.log(`${key.padEnd(22)} n ${r.n} ppg ${(r.pts / r.n).toFixed(2)} W/D/L ${r.w}/${r.d}/${r.l} gf ${(r.gf / r.n).toFixed(2)} ga ${(r.ga / r.n).toFixed(2)} [${((performance.now() - t0) / 1000).toFixed(0)}s]`);
}
if (OUT) await Bun.write(OUT, JSON.stringify(res));
process.exit(0);
