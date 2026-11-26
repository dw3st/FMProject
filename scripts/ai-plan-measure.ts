/**
 * What the AI's varied plan (12.47, `aiPlanVariation`) costs a human manager, and how often the knowledge card still
 * guesses the AI's plan. Full engine, pairs of clubs of the league (sides alternating), seeded matches, the same seed in
 * both arms. Human side: balanced 4-3-3 at familiarity 100, auto XI. AI side: its own formation and auto XI.
 *   arm S = the season plan (before 12.47)
 *   arm V = the varied plan; a match whose draw keeps the season plan is copied, not simulated
 * Card: per AI club, 38 fixtures in a row; the card's guess = the most played formation and style of the last 5.
 *
 *   bun scripts/ai-plan-measure.ts [league=premier_league] [matches=300] [--part 0/3] [--out f.json]
 *   bun scripts/ai-plan-measure.ts --sum a.json,b.json
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulateMatch, type TeamTactics } from "@/GameEngine/Domain/SimulateMatch";
import {
  aiMatchFormation, aiPlanFor, aiStyleTactics, autoLineupForFormation,
} from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { seedFrom } from "@/Domain/rng";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";

interface Cell { matches: number; wins: number; draws: number; losses: number; gf: number; ga: number }
interface Out {
  league: string;
  arms: { S: Cell; V: Cell };
  /** Only the matches whose plan varied. */
  varied: { S: Cell; V: Cell };
  kinds: Record<string, number>;
  byTier: Record<string, { n: number; varied: number }>;
  card: { guesses: number; right: number; formationRight: number; styleRight: number };
}

const args = process.argv.slice(2);
const flag = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const cell = (): Cell => ({ matches: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 });
const edge = (c: Cell) => (c.matches ? ((c.wins - c.losses) / c.matches) * 100 : 0);
const add = (c: Cell, gf: number, ga: number) => {
  c.matches++; c.gf += gf; c.ga += ga;
  if (gf > ga) c.wins++; else if (gf < ga) c.losses++; else c.draws++;
};

function print(o: Out) {
  const txt = (c: Cell) => `${edge(c).toFixed(1)} (${(c.gf / Math.max(1, c.matches)).toFixed(2)}-${(c.ga / Math.max(1, c.matches)).toFixed(2)}, n ${c.matches})`;
  console.log(`\n${o.league}: human win% - loss% (goals for-against)`);
  console.log(`all matches   season ${txt(o.arms.S)}   varied ${txt(o.arms.V)}   V-S ${(edge(o.arms.V) - edge(o.arms.S)).toFixed(1)} (victory points = half)`);
  console.log(`varied only   season ${txt(o.varied.S)}   varied ${txt(o.varied.V)}   V-S ${(edge(o.varied.V) - edge(o.varied.S)).toFixed(1)}`);
  console.log(`plans: ${Object.entries(o.kinds).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`by tier: ${Object.entries(o.byTier).map(([t, v]) => `${t} ${(100 * v.varied / Math.max(1, v.n)).toFixed(0)}% of ${v.n}`).join(", ")}`);
  const c = o.card;
  const pct = (x: number) => (100 * x / Math.max(1, c.guesses)).toFixed(1);
  console.log(`card guesses the AI plan: ${pct(c.right)}% (formation ${pct(c.formationRight)}%, style ${pct(c.styleRight)}%; before 12.47: 100%)`);
}

const sum = flag("--sum");
if (sum) {
  let m: Out | null = null;
  for (const f of sum.split(",")) {
    const o = JSON.parse(readFileSync(f, "utf8")) as Out;
    if (!m) { m = o; continue; }
    for (const g of ["arms", "varied"] as const) for (const a of ["S", "V"] as const)
      for (const k of Object.keys(m[g][a]) as (keyof Cell)[]) m[g][a][k] += o[g][a][k];
    for (const [k, n] of Object.entries(o.kinds)) m.kinds[k] = (m.kinds[k] ?? 0) + n;
    for (const [t, v] of Object.entries(o.byTier)) {
      const b = m.byTier[t] ?? (m.byTier[t] = { n: 0, varied: 0 });
      b.n += v.n; b.varied += v.varied;
    }
    for (const k of Object.keys(m.card) as (keyof Out["card"])[]) m.card[k] += o.card[k];
  }
  if (m) print(m);
  process.exit(0);
}

const pos = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const league = pos[0] ?? "premier_league";
const total = Number(pos[1] ?? 300);
const [part, parts] = (flag("--part") ?? "0/1").split("/").map(Number) as [number, number];
const out = flag("--out");

const dir = fileURLToPath(new URL(`../src/Data/squads/${league}/`, import.meta.url));
const squads = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
  const s = JSON.parse(readFileSync(dir + f, "utf8")) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
});
const f433 = formationForSimId("4-3-3");
const DATE = "2026-09-01";
const result: Out = {
  league, arms: { S: cell(), V: cell() }, varied: { S: cell(), V: cell() }, kinds: {}, byTier: {},
  card: { guesses: 0, right: 0, formationRight: 0, styleRight: 0 },
};
const fixture = (id: string, home: Squad, away: Squad): Fixture =>
  ({ id, home: home.id, away: away.id, date: DATE, competition: league } as unknown as Fixture);
const mode = (xs: string[]) => {
  const n = new Map<string, number>();
  let best = xs[xs.length - 1]!;
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  for (const [x, k] of n) if (k > (n.get(best) ?? 0)) best = x;
  return best;
};

// Card: pure, no engine (part 0 only, so a --sum counts it once). 38 fixtures per AI club against the next club.
if (part === 0) {
  squads.forEach((ai, i) => {
    const human = squads[(i + 1) % squads.length]!;
    const { formation, record } = aiMatchFormation(ai, human, DATE);
    const plans = Array.from({ length: 38 }, (_, k) => {
      const v = aiPlanFor(fixture(`card:${ai.id}:${k}`, ai, human), ai, human, DATE, record, formation.id);
      return { f: v.formation, s: v.style as string };
    });
    for (let k = 5; k < plans.length; k++) {
      const last = plans.slice(k - 5, k);
      const f = mode(last.map((p) => p.f)) === plans[k]!.f;
      const s = mode(last.map((p) => p.s)) === plans[k]!.s;
      result.card.guesses++;
      if (f) result.card.formationRight++;
      if (s) result.card.styleRight++;
      if (f && s) result.card.right++;
    }
  });
}

for (let m = 0; m < total; m++) {
  if (m % parts !== part) continue;
  const n = squads.length;
  const human = squads[m % n]!;
  const ai = squads[(m + 1 + (Math.floor(m / n) % (n - 1))) % n]!;
  const humanHome = m % 2 === 0;
  const fx = humanHome ? fixture(`m${m}`, human, ai) : fixture(`m${m}`, ai, human);
  const { formation: season, record } = aiMatchFormation(ai, human, DATE);
  const v = aiPlanFor(fx, ai, human, DATE, record, season.id);
  result.kinds[v.kind] = (result.kinds[v.kind] ?? 0) + 1;
  const tier = financialTierOf(ai);
  const b = result.byTier[tier] ?? (result.byTier[tier] = { n: 0, varied: 0 });
  b.n++;
  if (v.kind !== "season") b.varied++;
  const humanLineup = autoLineupForFormation(human, f433);
  const humanTactics: TeamTactics = { style: "balanced", familiarity: { balanced: 100 } };
  const play = (formationId: string, aiTactics: TeamTactics) => {
    const fAi = formationForSimId(formationId);
    const aiLineup = autoLineupForFormation(ai, fAi);
    const seed = seedFrom(`aiplan:${league}:${m}`);
    const r = humanHome
      ? simulateMatch(human, ai, f433, fAi, humanLineup, aiLineup, { tactics: { A: humanTactics, B: aiTactics }, seed })
      : simulateMatch(ai, human, fAi, f433, aiLineup, humanLineup, { tactics: { A: aiTactics, B: humanTactics }, seed });
    const h = humanHome ? "A" : "B";
    const o = humanHome ? "B" : "A";
    return { gf: r.score[h], ga: r.score[o] };
  };
  const s = play(season.id, aiStyleTactics());
  const vr = v.kind === "season" ? s : play(v.formation, aiStyleTactics(v.style));
  add(result.arms.S, s.gf, s.ga);
  add(result.arms.V, vr.gf, vr.ga);
  if (v.kind !== "season") { add(result.varied.S, s.gf, s.ga); add(result.varied.V, vr.gf, vr.ga); }
}

if (out) writeFileSync(out, JSON.stringify(result));
else print(result);
