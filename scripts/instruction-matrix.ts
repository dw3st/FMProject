/**
 * Instruction matrix (Etapa 27, `.claude/rules/game/player-instructions.md`) — balance and
 * signature of the role variants, individual pressing, the random package and man-marking.
 *
 *   bun scripts/instruction-matrix.ts [--parts variants,press,random,marking,base] [--variants a,b]
 *        [--matches 400] [--mirror 200] [--base 400] [--league premier_league] [--workers 3]
 *        [--json out.json] [--sum a.json,b.json]
 *
 * Same club on both sides, the variant on the symmetric slots of its role in its natural formation
 * (4-3-3; CDM 4-2-3-1; wing-backs 3-5-2; wide midfielders 4-4-2), the default on the other side;
 * mirror = both sides with it; base = the default mirror of the formation. Full engine, balanced,
 * auto XI, fitness 88. The engine isn't seeded: `--json` writes the raw pairs, `--sum` merges.
 */
import { buildInstrTasks, runInstrPool, type InstrPlanPart } from "@/lab/instructionMatrixPool";
import { mergeInstrPairs, rel, summarizeInstr, type InstrPairRaw, type InstrSummary, type SlotView } from "@/lab/instructionMatrixSummary";
import type { RoleVariantId } from "@/types/tacticsTypes";

const args = process.argv.slice(2);
const arg = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const parts = arg("--parts", "variants,press,random,marking,base").split(",") as InstrPlanPart[];
const variantsArg = arg("--variants", "");
const matches = Number(arg("--matches", "400"));
const mirrorMatches = Number(arg("--mirror", "200"));
const baseMatches = Number(arg("--base", "400"));
const league = arg("--league", "premier_league");
const workers = Math.min(3, Number(arg("--workers", "3")));
const jsonOut = arg("--json", "");
const sumArg = arg("--sum", "");

const f2 = (n: number) => n.toFixed(2);
const sg = (n: number, d = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(d)}`;
const pc = (n: number) => `${n >= 0 ? "+" : ""}${(100 * n).toFixed(0)}%`;

/** Signature of each set: the metric (X slots vs the same Y slots) and its minimum (spec §3). */
type Sig = { label: string; value: (x: SlotView, y: SlotView) => number; min: number; fmt: (n: number) => string };
const dX = (min: number): Sig => ({ label: "x médio c/ bola", value: (x, y) => x.posX - y.posX, min, fmt: n => sg(n) });
const dW = (min: number): Sig => ({ label: "|y−37| c/ bola", value: (x, y) => x.width - y.width, min, fmt: n => sg(n) });
const rp = (label: string, k: keyof SlotView, min: number): Sig => ({ label, value: (x, y) => rel(x[k], y[k]), min, fmt: pc });
const SIGNATURES: Record<string, Sig[]> = {
  fb_overlap: [dX(6), rp("cruzamentos", "crosses", 0.3)],
  fb_hold: [dX(-5)],
  fb_inverted: [dW(-8), rp("passes", "passes", 0.4)],
  wb_attack: [dX(5), rp("cruzamentos", "crosses", 0.25)],
  wb_defend: [dX(-6)],
  cb_stopper: [rp("desarmes", "tackles", 0.2)],
  cb_cover: [{ label: "dist. à linha", value: (x, y) => x.lineDelta - y.lineDelta, min: -2, fmt: n => sg(n) }],
  cb_ball: [rp("conduções", "carryTicks", 0.5)],
  dm_anchor: [dX(-5)],
  dm_box: [rp("chutes", "shots", 0.5)],
  cm_link: [rp("passes", "passes", 0.2)],
  cm_box: [rp("chutes", "shots", 0.4)],
  am_link: [rp("passes", "passes", 0.2)],
  am_shadow: [rp("chutes", "shots", 0.4)],
  wm_inside: [dW(-6)],
  w_inside: [rp("chutes", "shots", 0.3)],
  st_poacher: [rp("chutes na área", "shotsInBox", 0.15), rp("passes", "passes", -0.3)],
  st_false9: [dX(-8), rp("passes", "passes", 0.6)],
  st_target: [rp("passes recebidos", "passesReceived", 0.3), rp("disputas aéreas", "aerialDuels", 0.2)],
  press_more: [rp("pressões", "pressTicks", 0.3)],
  press_less: [rp("pressões", "pressTicks", -0.3)],
};

function passes(sig: Sig, v: number): boolean {
  return sig.min >= 0 ? v >= sig.min : v <= sig.min;
}

function report(raw: InstrPairRaw[]): void {
  const all = mergeInstrPairs(raw).map(summarizeInstr);
  const base = new Map(all.filter(s => s.kind === "base" && s.key === "default").map(s => [s.formation, s]));
  if (base.size > 0) {
    console.log(`\n## Espelho padrão (base)\n\n| Formação | jogos | gols/jogo | chutes/jogo |\n|---|---|---|---|`);
    for (const s of base.values()) console.log(`| ${s.formation} | ${s.matches} | ${f2(s.goals)} | ${f2(s.shots)} |`);
  }
  const edges = all.filter(s => s.kind === "edge" && !s.key.startsWith("mark_")).sort((a, b) => a.key.localeCompare(b.key));
  const mirrors = new Map(all.filter(s => s.kind === "mirror").map(s => [s.key, s]));
  if (edges.length > 0) {
    console.log(`\n## Variantes e pressão: vantagem (V% − D%, contra o padrão) e assinatura\n`);
    console.log(`| Variante | formação | jogos | vantagem | gols X/Y | chutes X/Y | assinatura | espelho jogos | gols espelho (× base) | chutes espelho (× base) | ok |`);
    console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
    for (const s of edges) {
      const sigs = SIGNATURES[s.key] ?? [];
      const sigText = sigs.map(sig => {
        const v = sig.value(s.slotX, s.slotY);
        return `${sig.label} ${sig.fmt(v)} (mín. ${sig.fmt(sig.min)})${passes(sig, v) ? "" : " ✗"}`;
      }).join("; ");
      const m = mirrors.get(s.key);
      const b = base.get(s.formation);
      const gm = m && b ? `${f2(m.goals)} (${pc(rel(m.goals, b.goals))})` : "—";
      const sm = m && b ? `${f2(m.shots)} (${pc(rel(m.shots, b.shots))})` : "—";
      const okEdge = Math.abs(s.edge) <= 5;
      const okVol = !m || !b || (Math.abs(rel(m.goals, b.goals)) <= 0.05 && Math.abs(rel(m.shots, b.shots)) <= 0.05);
      const okSig = sigs.every(sig => passes(sig, sig.value(s.slotX, s.slotY)));
      console.log(`| ${s.key} | ${s.formation} | ${s.matches} | **${sg(s.edge)}** | ${f2(s.goalsX)}/${f2(s.goalsY)} | ${f2(s.shotsX)}/${f2(s.shotsY)} | ${sigText} | ${m?.matches ?? 0} | ${gm} | ${sm} | ${okEdge && okVol && okSig ? "✓" : `${okEdge ? "" : "vant "}${okVol ? "" : "vol "}${okSig ? "" : "assin"}`} |`);
    }
    const press = edges.filter(s => s.key.startsWith("press_"));
    if (press.length > 0) {
      console.log(`\n### Pressão: fôlego final e pressões das 10 vagas de linha\n\n| Pressão | pressões X/Y (ticks) | fôlego final X/Y |\n|---|---|---|`);
      for (const s of press) console.log(`| ${s.key} | ${f2(s.slotX.pressTicks)}/${f2(s.slotY.pressTicks)} | ${f2(s.slotX.endEnergy)}/${f2(s.slotY.endEnergy)} |`);
    }
    console.log(`\n### Métricas por vaga (X instruída / Y padrão, mesmas vagas, por jogo)\n`);
    console.log(`| Variante | passes | recebidos | chutes | na área | cruz. | desarmes | disputas | pressões | conduções | x c/ bola | |y−37| | linha | fôlego |`);
    console.log(`|---|${"---|".repeat(13)}`);
    const pair = (x: number, y: number, d = 2) => `${x.toFixed(d)}/${y.toFixed(d)}`;
    for (const s of edges) {
      const x = s.slotX, y = s.slotY;
      console.log(`| ${s.key} | ${pair(x.passes, y.passes)} | ${pair(x.passesReceived, y.passesReceived)} | ${pair(x.shots, y.shots)} | ${pair(x.shotsInBox, y.shotsInBox)} | ${pair(x.crosses, y.crosses)} | ${pair(x.tackles, y.tackles)} | ${pair(x.aerialDuels, y.aerialDuels)} | ${pair(x.pressTicks, y.pressTicks, 1)} | ${pair(x.carryTicks, y.carryTicks, 1)} | ${pair(x.posX, y.posX, 1)} | ${pair(x.width, y.width, 1)} | ${pair(x.lineDelta, y.lineDelta, 1)} | ${pair(x.endEnergy, y.endEnergy, 1)} |`);
    }
  }
  const random = mirrors.get("random");
  const randomBase = all.find(s => s.kind === "base" && s.key === "random");
  if (random && randomBase) {
    console.log(`\n## Pacote aleatório (4-3-3 / 4-2-3-1 / 3-5-2 / 4-4-2, os dois lados)\n`);
    console.log(`| | jogos | gols/jogo | chutes/jogo |\n|---|---|---|---|`);
    console.log(`| padrão | ${randomBase.matches} | ${f2(randomBase.goals)} | ${f2(randomBase.shots)} |`);
    console.log(`| aleatório | ${random.matches} | ${f2(random.goals)} (${pc(rel(random.goals, randomBase.goals))}) | ${f2(random.shots)} (${pc(rel(random.shots, randomBase.shots))}) |`);
  }
  const marks = all.filter(s => s.kind === "edge" && s.key.startsWith("mark_")).sort((a, b) => a.key.localeCompare(b.key));
  if (marks.length > 0) {
    console.log(`\n## Marcação individual (X marca os melhores atacantes de Y; controle = os mesmos jogadores de X, sem marcação)\n`);
    console.log(`| Marcação | jogos | vantagem de X | chutes do alvo marcado / controle | gols do alvo / controle | gols contra X fora do alvo / controle | min. marcado |`);
    console.log(`|---|---|---|---|---|---|---|`);
    for (const s of marks) {
      const targetShots = s.slotY.shots;
      const controlShots = s.slotX.shots;
      const otherAgainst = s.goalsY - s.slotY.goals;
      const otherControl = s.goalsX - s.slotX.goals;
      console.log(`| ${s.key} | ${s.matches} | **${sg(s.edge)}** | ${f2(targetShots)} / ${f2(controlShots)} (${pc(rel(targetShots, controlShots))}) | ${f2(s.slotY.goals)} / ${f2(s.slotX.goals)} | ${f2(otherAgainst)} / ${f2(otherControl)} (${pc(rel(otherAgainst, otherControl))}) | ${f2(s.slotY.markedMinutes)} |`);
    }
  }
}

if (sumArg) {
  const all: InstrPairRaw[] = [];
  for (const file of sumArg.split(",")) all.push(...((await Bun.file(file).json()) as InstrPairRaw[]));
  report(all);
  process.exit(0);
}

const tasks = buildInstrTasks({
  league, parts, matches, mirrorMatches, baseMatches,
  ...(variantsArg ? { variants: variantsArg.split(",") as RoleVariantId[] } : {}),
}, Math.floor(Math.random() * 1000) * 2);
console.error(`${tasks.length} tasks of up to 25 matches (${league}) on ${workers} workers`);
const start = performance.now();
const pairs = await runInstrPool(tasks, workers, (done, total) => {
  if (done % 10 === 0) console.error(`  ${done}/${total} tasks, ${((performance.now() - start) / 1000).toFixed(0)} s`);
});
console.error(`done in ${((performance.now() - start) / 1000).toFixed(0)} s`);
if (jsonOut) await Bun.write(jsonOut, JSON.stringify(pairs));
report(pairs);

export type { InstrSummary };
