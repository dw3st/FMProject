/**
 * Calibra a fórmula de valor de mercado do jogo (`Player.valueMillions`, src/Domain/Player.ts) no valor real do
 * Transfermarkt. Lê o cache (data_process/transfermarkt/cache, só leitura) e o mundo recalibrado
 * (src/example_data/squads), casa clubes e jogadores como `buildMarketDerived.ts` e ajusta, por mínimos quadrados em
 * log, sobre todo casado com valor:
 *
 *   log(valor / 1e6) = log(K) + E × nota + log(fatorIdade[faixa])     (faixa ≤ 28 fixa em 1)
 *
 * com cada casado pesado por √valor. A forma do plano (E × log(nota), sem pesos) também roda (FIT_FORM=pow,
 * FIT_WEIGHT=none), mas fica pior: a nota do mundo vai só até ~6,8 e uma potência não sobe o bastante no topo
 * (rodada de 2026-10-07, 19 315 casados: erro mediano |log| potência 0,514, exponencial 0,479, exponencial com
 * pesos 0,427; o mais valioso do mundo saía a €15M na potência sem pesos, €155M na exponencial com pesos).
 *
 * Imprime K, E e os nove fatores, o erro mediano |log| com a fórmula antiga (0,8 × nota² × idade) e com a ajustada, e a mediana do valor do
 * jogo ÷ valor real por liga grande. Nunca grava valor de mercado em lugar nenhum.
 *
 *   bun scripts/fitValueFormula.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseClubPlayers, parseCompetitionClubs, type TmClub, type TmPlayer } from "@/../scripts/transfermarkt/api";
import { matchClubs, matchPlayers } from "@/../scripts/transfermarkt/match";
import { Player } from "@/Domain/Player";
import type { RosterPlayer } from "@/types/playerTypes";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA = join(ROOT, "src", "example_data");
const SQUADS = join(DATA, "squads");
const TM = join(ROOT, "data_process", "transfermarkt");
const CACHE = join(TM, "cache");

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf-8")) as T;
const readOverrides = (name: string): Record<string, string> => {
  const p = join(TM, name);
  return existsSync(p) ? readJson<Record<string, string>>(p) : {};
};

interface Squad { id: string; name: string; players: RosterPlayer[] }

const leagueMap = readJson<Record<string, string | null>>(join(TM, "leagueMap.json"));
const countryOf = new Map(readJson<{ slug: string; country: string }[]>(join(DATA, "leagueData.json")).map((l) => [l.slug, l.country]));
const clubOverrides = readOverrides("clubOverrides.json");
const playerOverrides = readOverrides("playerOverrides.json");

const squadsByLeague = new Map<string, Squad[]>();
for (const league of readdirSync(SQUADS).sort()) {
  const files = readdirSync(join(SQUADS, league)).filter((f) => f.endsWith(".json")).sort();
  squadsByLeague.set(league, files.map((f) => readJson<Squad>(join(SQUADS, league, f))));
}

function compClubs(compId: string): TmClub[] | null {
  for (const season of [2026, 2025]) {
    const p = join(CACHE, `comp-${compId}-${season}.json`);
    if (!existsSync(p)) return null;
    const clubs = parseCompetitionClubs(readJson(p));
    if (clubs.length) return clubs;
  }
  return null;
}
function clubPlayers(tmClubId: string): TmPlayer[] | null {
  const p = join(CACHE, `club-${tmClubId}-current.json`);
  return existsSync(p) ? parseClubPlayers(readJson(p)) : null;
}

// ── Clubes: por liga, depois as sobras do país contra todo clube do Transfermarkt do país (como buildMarketDerived) ──
const squadToTm = new Map<string, string>();
const leagueTmClubs = new Map<string, TmClub[]>();
const countryTmClubs = new Map<string, Map<string, TmClub>>();
for (const [league] of squadsByLeague) {
  const compId = leagueMap[league];
  const clubs = compId ? compClubs(compId) : null;
  if (!clubs) continue;
  leagueTmClubs.set(league, clubs);
  const country = countryOf.get(league) ?? league;
  const m = countryTmClubs.get(country) ?? new Map<string, TmClub>();
  for (const c of clubs) m.set(c.id, c);
  countryTmClubs.set(country, m);
}
const usedTm = new Set<string>();
for (const [league, clubs] of leagueTmClubs) {
  const ours = squadsByLeague.get(league)!.map((s) => ({ squadId: s.id, name: s.name }));
  for (const [s, t] of matchClubs(ours, clubs, clubOverrides)) {
    if (usedTm.has(t)) continue;
    squadToTm.set(s, t); usedTm.add(t);
  }
}
for (const [country, tmClubs] of countryTmClubs) {
  const ours = [...leagueTmClubs.keys()].filter((l) => (countryOf.get(l) ?? l) === country)
    .flatMap((l) => squadsByLeague.get(l)!).filter((s) => !squadToTm.has(s.id)).map((s) => ({ squadId: s.id, name: s.name }));
  const free = [...tmClubs.values()].filter((c) => !usedTm.has(c.id));
  for (const [s, t] of matchClubs(ours, free, clubOverrides)) { squadToTm.set(s, t); usedTm.add(t); }
}

// ── Casados com valor ──
interface Sample { league: string; overall: number; age: number; value: number }
const samples: Sample[] = [];
for (const [league, squads] of squadsByLeague) {
  for (const squad of squads) {
    const tmId = squadToTm.get(squad.id);
    const tmPlayers = tmId ? clubPlayers(tmId) : null;
    if (!tmPlayers) continue;
    const pairs = matchPlayers(
      squad.players.map((p) => ({ id: p.id, name: p.name, fullName: (p as { fullName?: string }).fullName, age: p.age })),
      tmPlayers,
      playerOverrides,
    );
    for (const p of squad.players) {
      const t = pairs.has(p.id) ? tmPlayers.find((x) => x.id === pairs.get(p.id)) : undefined;
      if (!t?.value || t.value <= 0) continue;
      samples.push({ league, overall: Player.overallAvg(p), age: p.age, value: t.value / 1e6 });
    }
  }
}

// ── Ajuste: y = a + E·log(nota) + Σ b_k·[faixa k], faixa ≤ 28 de referência ──
const BAND_MAX = [19, 21, 23, 25, 28, 30, 32, 34, Infinity];
const REF_BAND = 4; // ≤ 28
const bandOf = (age: number) => BAND_MAX.findIndex((m) => age <= m);
const freeBands = BAND_MAX.map((_, i) => i).filter((i) => i !== REF_BAND);
// Padrão: forma exponencial e cada casado pesado por √valor (menor erro mediano, ver o cabeçalho).
// Diagnóstico: FIT_FORM=pow usa log(nota) (a forma do plano); FIT_WEIGHT=none tira os pesos.
const FORM = process.env.FIT_FORM === "pow" ? "pow" : "exp";
const WEIGHTED = process.env.FIT_WEIGHT !== "none";
const features = (s: Sample) => [1, FORM === "exp" ? s.overall : Math.log(s.overall), ...freeBands.map((b) => (bandOf(s.age) === b ? 1 : 0))];

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((r, i) => r[n]! / r[i]!);
}

const k = features(samples[0]!).length;
const XtX = Array.from({ length: k }, () => new Array<number>(k).fill(0));
const Xty = new Array<number>(k).fill(0);
for (const s of samples) {
  const x = features(s);
  const y = Math.log(s.value);
  const w = WEIGHTED ? Math.sqrt(s.value) : 1;
  for (let i = 0; i < k; i++) {
    Xty[i]! += w * x[i]! * y;
    for (let j = 0; j < k; j++) XtX[i]![j]! += w * x[i]! * x[j]!;
  }
}
const beta = solve(XtX, Xty);
const K = Math.exp(beta[0]!);
const E = beta[1]!;
const factors = BAND_MAX.map((_, i) => (i === REF_BAND ? 1 : Math.exp(beta[2 + freeBands.indexOf(i)]!)));

const fitted = (s: Sample) => K * (FORM === "exp" ? Math.exp(E * s.overall) : s.overall ** E) * factors[bandOf(s.age)]!;
/** A fórmula anterior à calibração (0,8 × nota² × idade), para o "antes". */
const OLD_AGE = [2.4, 2.0, 1.6, 1.3, 1.0, 0.75, 0.5, 0.3, 0.15];
const current = (s: Sample) => 0.8 * s.overall ** 2 * OLD_AGE[bandOf(s.age)]!;
/** A fórmula do jogo hoje (`Player.valueMillions`), para conferir as constantes aplicadas. */
const game = (s: Sample) => new Player(s.overall, s.age).valueMillions;

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};
const medAbsLog = (f: (s: Sample) => number, xs: Sample[]) => median(xs.map((s) => Math.abs(Math.log(f(s) / s.value))));
const medRatio = (f: (s: Sample) => number, xs: Sample[]) => median(xs.map((s) => f(s) / s.value));

const bandLabel = (i: number) => (BAND_MAX[i] === Infinity ? ">34" : `≤${BAND_MAX[i]}`);
console.log(`Casados com valor: ${samples.length}`);
console.log(`forma ${FORM}${WEIGHTED ? ", pesos √valor" : ""}: K = ${K.toFixed(6)}  E = ${E.toFixed(3)}`);
console.log(`fatores de idade: ${BAND_MAX.map((_, i) => `${bandLabel(i)} ${factors[i]!.toFixed(2)}`).join(", ")}`);
console.log(`contagem por faixa: ${BAND_MAX.map((_, i) => `${bandLabel(i)} ${samples.filter((s) => bandOf(s.age) === i).length}`).join(", ")}`);
console.log(`erro mediano |log(jogo/real)|: fórmula antiga ${medAbsLog(current, samples).toFixed(3)} → ajustado ${medAbsLog(fitted, samples).toFixed(3)}`);
console.log(`mediana jogo ÷ real (mundo): antiga ${medRatio(current, samples).toFixed(2)} → ajustado ${medRatio(fitted, samples).toFixed(2)}`);
console.log(`Player.valueMillions hoje: erro mediano ${medAbsLog(game, samples).toFixed(3)}, mediana jogo ÷ real ${medRatio(game, samples).toFixed(2)}`);
console.log();
console.log("Liga                                         n  antiga  ajustada  (mediana jogo ÷ real)");
const BIG = ["premier_league", "la_liga", "serie_a", "bundesliga", "ligue_1", "brazil_serie_a", "of_championship",
  "of_portuguese_primeira_liga", "of_eredivisie", "of_argentine_premier_division", "of_major_league_soccer", "brazil_serie_c"];
for (const league of BIG) {
  const xs = samples.filter((s) => s.league === league);
  if (!xs.length) continue;
  console.log(`${league.padEnd(42)} ${String(xs.length).padStart(5)}  ${medRatio(current, xs).toFixed(2).padStart(5)}  ${medRatio(fitted, xs).toFixed(2).padStart(7)}`);
}
console.log();
console.log("Nota → valor (27 anos), antiga × ajustada (M€):");
for (const o of [4, 5, 5.5, 6, 6.5, 7, 7.5]) {
  const s = { league: "", overall: o, age: 27, value: 1 };
  console.log(`  ${o.toFixed(1)}  ${current(s).toFixed(1).padStart(6)}  ${fitted(s).toFixed(2).padStart(7)}`);
}
console.log();
console.log("Os 15 mais valiosos (real), jogo antiga × ajustada × real (M€):");
for (const s of [...samples].sort((a, b) => b.value - a.value).slice(0, 15))
  console.log(`  ${s.league.padEnd(20)} nota ${s.overall.toFixed(2)} idade ${s.age}  ${current(s).toFixed(0).padStart(5)} ${fitted(s).toFixed(0).padStart(5)} ${s.value.toFixed(0).padStart(5)}`);
