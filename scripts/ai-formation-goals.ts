/**
 * World sanity check for the AI formation choice (Etapa 18, #59): goals and shots per match with
 * every AI club on 4-3-3 ("main", the behaviour before) vs each club on its own formation ("ai"),
 * same pairings, fitness 88, balanced style.
 *
 *   bun scripts/ai-formation-goals.ts [--leagues premier_league,of_championship]
 *                                     [--engine 400] [--chunks 8] [--quick 20000]
 *
 * quickSim: paired (same seed per match for both modes). Engine: unseeded, `--engine` matches per
 * mode per league split over `--chunks` workers.
 */
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { aiMatchFormation, autoLineupForFormationWithFitness, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { mulberry32 } from "@/Domain/rng";
import { loadLeagueAt88, pairAt, type GoalTotals, type Mode } from "./ai-formation-goals-shared";

const args = process.argv.slice(2);
const arg = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const leagues = arg("--leagues", "premier_league,of_championship").split(",");
const engineN = Number(arg("--engine", "400"));
const chunks = Number(arg("--chunks", "8"));
const quickN = Number(arg("--quick", "20000"));

function quick(league: string, mode: Mode): GoalTotals {
  const squads = loadLeagueAt88(league);
  const t: GoalTotals = { n: 0, goals: 0, shots: 0 };
  for (let k = 0; k < quickN; k++) {
    const { home, away, date } = pairAt(squads, k);
    const fH = mode === "main" ? formationForSimId("4-3-3") : aiMatchFormation(home, away, date).formation;
    const fA = mode === "main" ? formationForSimId("4-3-3") : aiMatchFormation(away, home, date).formation;
    const q = quickSimMatch({
      fixtureId: `w${k}`, home, away,
      homeLineup: autoLineupForFormationWithFitness(home, fH, date), awayLineup: autoLineupForFormationWithFitness(away, fA, date),
      homeRoles: slotRoles(fH), awayRoles: slotRoles(fA),
    }, mulberry32(1000 + k));
    t.n++;
    t.goals += q.recording.score.home + q.recording.score.away;
    for (const s of Object.values(q.recording.playerStats)) t.shots += s.shots;
  }
  return t;
}

const WORKER = new URL("./ai-formation-goals-worker.ts", import.meta.url).href;
function engine(league: string, mode: Mode): Promise<GoalTotals>[] {
  const per = Math.ceil(engineN / chunks);
  return Array.from({ length: chunks }, (_, c) => new Promise<GoalTotals>((resolve, reject) => {
    const w = new Worker(WORKER, { type: "module" });
    w.onmessage = (e: MessageEvent<GoalTotals>) => { w.terminate(); resolve(e.data); };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
    w.postMessage({ league, mode, matches: Math.min(per, engineN - c * per), offset: c * per });
  }));
}
const sum = (xs: GoalTotals[]) => xs.reduce((a, b) => ({ n: a.n + b.n, goals: a.goals + b.goals, shots: a.shots + b.shots }), { n: 0, goals: 0, shots: 0 });

const engineJobs = leagues.flatMap((l) => (["main", "ai"] as Mode[]).map((m) => ({ l, m, p: engineN > 0 ? Promise.all(engine(l, m)) : Promise.resolve([]) })));
const pct = (a: number, b: number) => `${a >= b ? "+" : ""}${((100 * (a - b)) / b).toFixed(1)}%`;
console.log(`| Liga | modo | jogos | gols/jogo main | gols/jogo IA | Δ gols | chutes/jogo main | chutes/jogo IA | Δ chutes |`);
console.log(`|---|---|---|---|---|---|---|---|---|`);
for (const l of leagues) {
  const qm = quick(l, "main"); const qa = quick(l, "ai");
  console.log(`| ${l} | quickSim | ${qm.n} | ${(qm.goals / qm.n).toFixed(3)} | ${(qa.goals / qa.n).toFixed(3)} | ${pct(qa.goals / qa.n, qm.goals / qm.n)} | ${(qm.shots / qm.n).toFixed(2)} | ${(qa.shots / qa.n).toFixed(2)} | ${pct(qa.shots / qa.n, qm.shots / qm.n)} |`);
}
if (engineN > 0) {
  const done = await Promise.all(engineJobs.map(async (j) => ({ ...j, t: sum(await j.p) })));
  for (const l of leagues) {
    const em = done.find((d) => d.l === l && d.m === "main")!.t;
    const ea = done.find((d) => d.l === l && d.m === "ai")!.t;
    console.log(`| ${l} | motor | ${em.n} | ${(em.goals / em.n).toFixed(3)} | ${(ea.goals / ea.n).toFixed(3)} | ${pct(ea.goals / ea.n, em.goals / em.n)} | ${(em.shots / em.n).toFixed(2)} | ${(ea.shots / ea.n).toFixed(2)} | ${pct(ea.shots / ea.n, em.shots / em.n)} |`);
  }
}
