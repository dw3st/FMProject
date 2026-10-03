/**
 * Formation matrix (Etapa 19, #63) — diagnosis and balance check of the 17 formations.
 *
 *   bun scripts/formation-matrix.ts [--matches 100] [--league premier_league] [--workers 4]
 *        [--rows all|a,b] [--refs 4-3-3,4-4-2,4-2-3-1,3-5-2] [--mirror] [--mirror-only]
 *        [--json out.json] [--sum a.json,b.json] [--detail]
 *
 * Every row formation plays every reference formation (and, with `--mirror`, itself) `--matches`
 * times with the SAME real club on both sides (full engine, balanced style, auto XI, data
 * fitness). The engine isn't seeded: `--json` writes the raw pairs, `--sum` merges files and
 * prints without simulating. Edge = win% − loss% against the mean of the other formations
 * (`summarizeMatrix`, every pair counts for both of its formations).
 */
import { FORMATION_IDS } from "@/Domain/matchFormations";
import { mirrorGoals, summarizeMatrix, type PairRaw, type SideRaw } from "@/lab/formationMatrixSummary";
import { buildMatrixTasks, runMatrixPool } from "@/lab/formationMatrixPool";

const args = process.argv.slice(2);
const arg = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const matches = Number(arg("--matches", "100"));
const league = arg("--league", "premier_league");
const workers = Number(arg("--workers", "4"));
const rowsArg = arg("--rows", "all");
const refs = arg("--refs", "4-3-3,4-4-2,4-2-3-1,3-5-2").split(",");
const mirror = args.includes("--mirror");
const mirrorOnly = args.includes("--mirror-only");
const jsonOut = arg("--json", "");
const sumArg = arg("--sum", "");
const detail = args.includes("--detail");

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const sg = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;

function report(pairs: PairRaw[]): void {
  const sum = summarizeMatrix(pairs);
  if (sum.length > 0) {
    const mean = sum.reduce((a, r) => a + r.edge, 0) / sum.length;
    const cols = [...new Set(sum.flatMap((r) => Object.keys(r.edges)))].filter((c) => refs.includes(c));
    console.log(`\n## Vantagem contra a média das outras (V% − D%, p.p.)\n`);
    console.log(`| Formação | jogos | vantagem | ${cols.map((c) => `vs ${c}`).join(" | ")} | gols pró | gols contra | chutes pró | chutes contra |`);
    console.log(`|---|---|---|${cols.map(() => "---").join("|")}|---|---|---|---|`);
    for (const r of sum) {
      console.log(`| ${r.formation} | ${r.matches} | **${sg(r.edge)}** | ${cols.map((c) => (r.edges[c] === undefined ? "—" : sg(r.edges[c]!))).join(" | ")} | ${f2(r.goalsFor)} | ${f2(r.goalsAgainst)} | ${f2(r.shotsFor)} | ${f2(r.shotsAgainst)} |`);
    }
    const spread = Math.max(...sum.map((r) => r.edge)) - Math.min(...sum.map((r) => r.edge));
    const out = sum.filter((r) => Math.abs(r.edge) > 8).map((r) => r.formation);
    console.log(`\nmédia ${sg(mean)} · amplitude ${f1(spread)} p.p. · fora de ±8: ${out.length ? out.join(", ") : "nenhuma"}`);
  }
  const mg = mirrorGoals(pairs);
  if (mg.length > 0) {
    const mean = mg.reduce((a, r) => a + r.goals, 0) / mg.length;
    console.log(`\n## Jogo espelho\n\n| Formação | jogos | gols/jogo | × média | chutes/jogo |\n|---|---|---|---|---|`);
    for (const r of mg) console.log(`| ${r.formation} | ${r.matches} | ${f2(r.goals)} | ${f2(r.goals / mean)} | ${f2(r.shots)} |`);
    console.log(`\nmédia ${f2(mean)} gols/jogo`);
  }
  if (detail) printDetail(pairs);
}

/** Per-formation diagnostic means (over every pair the formation played, both sides of it). */
function printDetail(pairs: PairRaw[]): void {
  const acc = new Map<string, { n: number; own: SideRaw[]; opp: SideRaw[] }>();
  const push = (f: string, n: number, own: SideRaw, opp: SideRaw) => {
    const a = acc.get(f) ?? { n: 0, own: [], opp: [] };
    a.n += n; a.own.push(own); a.opp.push(opp); acc.set(f, a);
  };
  for (const p of pairs) {
    push(p.x, p.matches, p.sideX, p.sideY);
    if (p.x !== p.y) push(p.y, p.matches, p.sideY, p.sideX);
  }
  const tot = (xs: SideRaw[], k: keyof SideRaw) => xs.reduce((a, s) => a + (s[k] as number), 0);
  const by = (xs: SideRaw[], k: "shotsBy" | "goalsBy", d: string) => xs.reduce((a, s) => a + s[k][d as "pass"], 0);
  console.log(`\n## Diagnóstico por formação (por jogo; "contra" = o adversário quando enfrenta a formação)\n`);
  console.log(`| Formação | jogos | posse % | entradas centro/ponta | cruz. | TB | passes | chutes área C/área L/fora | gols área C/L/fora | gols por TB/cruz./passe/solo | chutes contra área C/L/fora | gols contra por TB/cruz./passe/solo | roubadas def/meio/ataque/GK | atrás da bola (C) | tela central no terço | atrás no chute adv. | dist. marcador |`);
  console.log(`|---|${"---|".repeat(16)}`);
  for (const [f, a] of [...acc.entries()].sort()) {
    const n = a.n;
    const pt = tot(a.own, "possTicks"), po = tot(a.opp, "possTicks");
    const ds = tot(a.own, "defSamples");
    const dts = tot(a.own, "defThirdSamples");
    const oppShots = tot(a.opp, "shots");
    const kinds = ["through", "cross", "pass", "solo"];
    console.log(`| ${f} | ${n} | ${f1((100 * pt) / (pt + po))} | ${f1(tot(a.own, "entriesC") / n)}/${f1(tot(a.own, "entriesW") / n)} | ${f1(tot(a.own, "crosses") / n)} | ${f1(tot(a.own, "throughBalls") / n)} | ${f1(tot(a.own, "passes") / n)} | ${f2(tot(a.own, "shotsBoxC") / n)}/${f2(tot(a.own, "shotsBoxW") / n)}/${f2(tot(a.own, "shotsOut") / n)} | ${f2(tot(a.own, "goalsBoxC") / n)}/${f2(tot(a.own, "goalsBoxW") / n)}/${f2(tot(a.own, "goalsOut") / n)} | ${kinds.map((d) => f2(by(a.own, "goalsBy", d) / n)).join("/")} | ${f2(tot(a.opp, "shotsBoxC") / n)}/${f2(tot(a.opp, "shotsBoxW") / n)}/${f2(tot(a.opp, "shotsOut") / n)} | ${kinds.map((d) => f2(by(a.opp, "goalsBy", d) / n)).join("/")} | ${f1(tot(a.own, "recovDef") / n)}/${f1(tot(a.own, "recovMid") / n)}/${f1(tot(a.own, "recovAtt") / n)}/${f1(tot(a.own, "recovGK") / n)} | ${f2(tot(a.own, "defGoalSide") / ds)} (${f2(tot(a.own, "defGoalSideC") / ds)}) | ${f2(tot(a.own, "defThirdScreenC") / Math.max(1, dts))} | ${f2(tot(a.own, "oppShotGoalSide") / Math.max(1, oppShots))} | ${f2(tot(a.own, "oppShotNearest") / Math.max(1, oppShots))} |`);
  }
}

if (sumArg) {
  const all: PairRaw[] = [];
  for (const file of sumArg.split(",")) all.push(...((await Bun.file(file).json()) as PairRaw[]));
  report(all);
  process.exit(0);
}

const rows = rowsArg === "all" ? [...FORMATION_IDS] : rowsArg.split(",");
const tasks = buildMatrixTasks({ league, rows, refs, matches, mirror, mirrorOnly }, Math.floor(Math.random() * 1000) * 2);
console.error(`${tasks.length} tasks of up to 25 matches (${league}) on ${workers} workers`);
const start = performance.now();
const pairs = await runMatrixPool(tasks, workers, (done, total) => {
  if (done % 10 === 0) console.error(`  ${done}/${total} tasks, ${((performance.now() - start) / 1000).toFixed(0)} s`);
});
console.error(`done in ${((performance.now() - start) / 1000).toFixed(0)} s`);
if (jsonOut) await Bun.write(jsonOut, JSON.stringify(pairs));
report(pairs);
