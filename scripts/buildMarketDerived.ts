/**
 * Transfermarkt cache + world → data_process/transfermarkt/derived.json (target overall, natural position,
 * birth date, height, missing nationality) and a review report. Never writes a market value.
 * Leagues whose cache isn't there yet are skipped with a warning.
 *
 *   bun scripts/buildMarketDerived.ts [--report <file>]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseClubPlayers, parseCompetitionClubs, type TmClub, type TmPlayer } from "@/../scripts/transfermarkt/api";
import { buildDerived, type LeaguePlayer, type MatchInfo } from "@/../scripts/transfermarkt/derive";
import { clubKey } from "@/../scripts/espn/normalize";
import { stableStringify } from "@/../scripts/transfermarkt/json";
import { matchClubs, matchPlayers } from "@/../scripts/transfermarkt/match";
import { worldNationality } from "@/../scripts/transfermarkt/nationality";
import { tmPosition } from "@/../scripts/transfermarkt/positions";
import { COVERAGE_MIN } from "@/../scripts/transfermarkt/reorder";
import { computeOverallAvg, fixedNaturalRole } from "@/Domain/playerRating";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { getMainRole } from "@/Domain/roles";
import type { DetailedRole, RosterPlayer } from "@/types/playerTypes";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA = join(ROOT, "src", "example_data");
const SQUADS = join(DATA, "squads");
const TM = join(ROOT, "data_process", "transfermarkt");
const CACHE = join(TM, "cache");

const args = process.argv.slice(2);
const reportArg = args.includes("--report") ? args[args.indexOf("--report") + 1] : undefined;
/** --median-effects: the old per-band medians, only to compare reports; never for the committed derived.json. */
const effectsMode = args.includes("--median-effects") ? "median" : "conditional";

{
  const runtimeRoles = join(ROOT, "src", "Data", "roles.json");
  if (!existsSync(runtimeRoles) || readFileSync(runtimeRoles, "utf-8") !== readFileSync(join(DATA, "roles.json"), "utf-8"))
    throw new Error("src/Data/roles.json is out of sync — run cp src/example_data/roles.json src/Data/roles.json first");
}

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

/** Competition clubs from the cache: season 2026, or 2025 when 2026 came back empty (calendar-year leagues). */
function compClubs(compId: string): TmClub[] | null {
  for (const season of [2026, 2025]) {
    const p = join(CACHE, `comp-${compId}-${season}.json`);
    if (!existsSync(p)) return null;
    const clubs = parseCompetitionClubs(readJson(p));
    if (clubs.length) return clubs;
  }
  return null;
}
const clubPlayerCache = new Map<string, TmPlayer[] | null>();
function clubPlayers(tmClubId: string): TmPlayer[] | null {
  if (!clubPlayerCache.has(tmClubId)) {
    const p = join(CACHE, `club-${tmClubId}-current.json`);
    clubPlayerCache.set(tmClubId, existsSync(p) ? parseClubPlayers(readJson(p)) : null);
  }
  return clubPlayerCache.get(tmClubId)!;
}

const lines: string[] = [];
const log = (s = "") => { lines.push(s); console.log(s); };

// ── 1. Clubs: per league, then the leftovers of a country against every Transfermarkt club of that country ──
const skipped: { league: string; why: string }[] = [];
const tmClubName = new Map<string, string>();
const squadToTm = new Map<string, string>();
const leagueTmClubs = new Map<string, TmClub[]>();
const countryTmClubs = new Map<string, Map<string, TmClub>>();
for (const [league] of squadsByLeague) {
  const compId = leagueMap[league];
  if (!compId) { skipped.push({ league, why: "sem competição no Transfermarkt" }); continue; }
  const clubs = compClubs(compId);
  if (!clubs) { skipped.push({ league, why: `sem cache (${compId})` }); continue; }
  leagueTmClubs.set(league, clubs);
  const country = countryOf.get(league) ?? league;
  const m = countryTmClubs.get(country) ?? new Map<string, TmClub>();
  for (const c of clubs) { m.set(c.id, c); tmClubName.set(c.id, c.name); }
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

// ── 2. Players ──
/** The player as `applyMarketRecalibration` will leave him: natural position fixed, line from it. */
const withPosition = (p: RosterPlayer, pos: DetailedRole | undefined): RosterPlayer => {
  if (!pos) return p;
  const line = getMainRole(pos);
  const positions = getMainRole(p.positions[0] ?? "CM") === line ? p.positions : [line, ...p.positions.slice(1)];
  return { ...p, positions, naturalPosition: pos };
};
const all: LeaguePlayer[] = [];
const current = new Map<string, number>();
const playerOf = new Map<string, { p: RosterPlayer; squad: Squad; league: string }>();
const tmOf = new Map<string, TmPlayer>();
const noFlag = new Map<string, number>();
const missingClubCache: Record<string, number> = {};
const unmatchedClubs: Record<string, string[]> = {};
let nationalityFilled = 0;
for (const [league, squads] of squadsByLeague) {
  const covered = leagueTmClubs.has(league);
  for (const squad of squads) {
    const tmId = covered ? squadToTm.get(squad.id) : undefined;
    if (covered && !tmId) (unmatchedClubs[league] ??= []).push(squad.name);
    const tmPlayers = tmId ? clubPlayers(tmId) : null;
    if (tmId && !tmPlayers) missingClubCache[league] = (missingClubCache[league] ?? 0) + 1;
    const pairs = tmPlayers
      ? matchPlayers(
        squad.players.map((p) => ({ id: p.id, name: p.name, fullName: (p as { fullName?: string }).fullName, age: p.age })),
        tmPlayers,
        playerOverrides,
      )
      : new Map<string, string>();
    for (const p of squad.players) {
      playerOf.set(p.id, { p, squad, league });
      const t = pairs.has(p.id) ? tmPlayers!.find((x) => x.id === pairs.get(p.id)) : undefined;
      let match: MatchInfo | undefined;
      if (t) {
        tmOf.set(p.id, t);
        let nationality: string | null = null;
        if (!p.nationality && t.nationality) {
          nationality = worldNationality(t.nationality);
          if (nationality) nationalityFilled++;
          else noFlag.set(t.nationality, (noFlag.get(t.nationality) ?? 0) + 1);
        }
        match = { tmId: t.id, value: t.value, position: tmPosition(t.position), birthDate: t.birthDate, heightCm: t.heightCm, nationality };
      }
      const line = getMainRole(match?.position ?? p.positions[0] ?? "CM");
      current.set(p.id, computeOverallAvg(p));
      // The league multiset is taken at the Transfermarkt position (a keeper filed as an outfielder has a junk score).
      const overall = computeOverallAvg(withPosition(p, match?.position ?? undefined));
      all.push({ id: p.id, squadId: squad.id, league, age: p.age, overall, line, match });
    }
  }
}

const derived = buildDerived(all, COVERAGE_MIN, effectsMode);
if (effectsMode === "conditional") writeFileSync(join(TM, "derived.json"), stableStringify({ leagues: derived.leagues, players: derived.players }));

// ── 3. Report ──
const naturalBefore = (p: RosterPlayer): DetailedRole => fixedNaturalRole(p) ?? preferredRole(p);
const after = new Map(all.map((x) => [x.id, derived.targets.get(x.id) ?? x.overall]));
const before = current;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

log(`Recalibração pelo valor de mercado — ${new Date().toISOString().slice(0, 10)}`);
log(`Mínimo de cobertura para reordenar: ${pct(COVERAGE_MIN)}`);
log(`Efeitos de idade/linha: ${effectsMode === "median" ? "medianas por faixa (antigo, só comparação)" : "condicionados à nota atual"}`);
log();
log("== Cobertura por liga (valorados ÷ jogadores) ==");
for (const [slug, s] of Object.entries(derived.leagues)) {
  if (!leagueTmClubs.has(slug)) continue;
  const extra = [
    missingClubCache[slug] ? `${missingClubCache[slug]} clube(s) sem elenco em cache` : "",
    unmatchedClubs[slug]?.length ? `sem par: ${unmatchedClubs[slug]!.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  log(`${s.reordered ? "✓" : "·"} ${slug.padEnd(42)} ${String(s.valued).padStart(4)}/${String(s.players).padStart(4)} ${pct(s.coverage).padStart(6)} (casados ${s.matched})${extra ? `  — ${extra}` : ""}`);
}
log();
log("== Clubes casados por nome aproximado ou exceção (conferir) ==");
for (const [league, squads] of squadsByLeague) for (const s of squads) {
  const t = squadToTm.get(s.id);
  if (t && clubKey(s.name) !== clubKey(tmClubName.get(t)!)) log(`  ${league}: ${s.name} → ${tmClubName.get(t)}${clubOverrides[s.id] ? " (exceção)" : ""}`);
}
log();
log("== Clubes do Transfermarkt sem par, por país (candidatos a clubOverrides.json) ==");
for (const [country, tmClubs] of [...countryTmClubs].sort(([a], [b]) => a.localeCompare(b))) {
  const free = [...tmClubs.values()].filter((c) => !usedTm.has(c.id));
  const ours = [...leagueTmClubs.keys()].filter((l) => (countryOf.get(l) ?? l) === country)
    .flatMap((l) => squadsByLeague.get(l)!).filter((s) => !squadToTm.has(s.id));
  if (!ours.length) continue;
  log(`  ${country}: nossos ${ours.map((s) => `${s.name} (${s.id})`).join(", ")}`);
  log(`  ${" ".repeat(country.length)}  livres ${free.map((c) => `${c.name} (${c.id})`).join(", ") || "—"}`);
}
log();
log("== Ligas fora ==");
for (const s of skipped) log(`  ${s.league}: ${s.why}`);
for (const [slug, s] of Object.entries(derived.leagues))
  if (leagueTmClubs.has(slug) && !s.reordered) log(`  ${slug}: cobertura ${pct(s.coverage)} (sem reordenação)`);

log();
log("== Efeitos estimados sobre log(valor) (idade relativa aos 27, linha relativa ao meio) ==");
if ("slope" in derived.effects) log(`inclinação da nota: ${(derived.effects as { slope: number }).slope.toFixed(2)} por ponto de nota`);
log(`linha: ${Object.entries(derived.effects.line).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ")}`);
log(`idade: ${[...derived.effects.age].sort((a, b) => a[0] - b[0]).map(([a, v]) => `${a} ${v.toFixed(2)}`).join(", ")}`);

function top10(title: string, ids: string[]) {
  const name = (id: string) => playerOf.get(id)!.p.name;
  const b = [...ids].sort((x, y) => before.get(y)! - before.get(x)!).slice(0, 10);
  const a = [...ids].sort((x, y) => after.get(y)! - after.get(x)!).slice(0, 10);
  log();
  log(`== Top 10 ${title}: antes | depois ==`);
  for (let i = 0; i < 10; i++) {
    const l = b[i] ? `${name(b[i]!)} ${before.get(b[i]!)!.toFixed(2)}` : "";
    const r = a[i] ? `${name(a[i]!)} ${after.get(a[i]!)!.toFixed(2)}` : "";
    log(`${String(i + 1).padStart(2)}. ${l.padEnd(36)} | ${r}`);
  }
}
for (const league of ["premier_league", "la_liga", "brazil_serie_a"])
  top10(league, all.filter((x) => x.league === league).map((x) => x.id));
const flamengo = [...squadsByLeague.values()].flat().find((s) => s.name === "Flamengo");
if (flamengo) top10("Flamengo", flamengo.players.map((p) => p.id));

log();
log("== Trocas de posição natural (antes → depois) ==");
const swaps = new Map<string, number>();
let swapTotal = 0;
for (const x of all) {
  const pos = derived.players[x.id]?.naturalPosition;
  if (!pos) continue;
  const b = naturalBefore(playerOf.get(x.id)!.p);
  if (b === pos) continue;
  swapTotal++;
  swaps.set(`${b} → ${pos}`, (swaps.get(`${b} → ${pos}`) ?? 0) + 1);
}
log(`total ${swapTotal}`);
for (const [k, v] of [...swaps].sort((a, b) => b[1] - a[1])) log(`  ${k.padEnd(12)} ${v}`);

const guarani = squadsByLeague.get("brazil_serie_c")?.find((s) => s.id === "138");
if (guarani) {
  const count = (f: (p: RosterPlayer) => string) => {
    const m = new Map<string, number>();
    for (const p of guarani.players) m.set(f(p), (m.get(f(p)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  };
  log();
  log(`== ${guarani.name}: jogadores por posição natural ==`);
  log(`antes:  ${count(naturalBefore)}`);
  log(`depois: ${count((p) => derived.players[p.id]?.naturalPosition ?? naturalBefore(p))}`);
}

log();
log("== 30 maiores saltos de nota (nosso nome / nome no Transfermarkt, idades) ==");
const jumps = [...derived.targets.keys()]
  .map((id) => ({ id, d: after.get(id)! - before.get(id)! }))
  .sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 30);
for (const j of jumps) {
  const { p, squad, league } = playerOf.get(j.id)!;
  const t = tmOf.get(j.id);
  log(`${(j.d >= 0 ? "+" : "") + j.d.toFixed(2)} ${before.get(j.id)!.toFixed(2)} → ${after.get(j.id)!.toFixed(2)}  ${p.name} (${p.age}) / ${t ? `${t.name} (${t.age ?? "?"})` : "sem par"}  ${squad.name} [${league}] ${j.id}`);
}

log();
log("== Mudanças de mais de 1 ponto por idade ==");
for (const [label, test] of [["<= 19", (a: number) => a <= 19], ["20-34", (a: number) => a >= 20 && a <= 34], [">= 35", (a: number) => a >= 35]] as const) {
  let up = 0, down = 0, n = 0;
  for (const id of derived.targets.keys()) {
    const { p } = playerOf.get(id)!;
    if (!test(p.age)) continue;
    n++;
    const d = after.get(id)! - before.get(id)!;
    if (d > 1) up++; else if (d < -1) down++;
  }
  log(`  ${label.padEnd(6)} com nota nova ${String(n).padStart(5)}: sobem > 1 ${up}, descem > 1 ${down}`);
}

log();
log("== Jogadores de referência (posição na liga, antes → depois) ==");
const rankIn = (league: string, id: string, m: Map<string, number>) =>
  1 + all.filter((x) => x.league === league && m.get(x.id)! > m.get(id)!).length;
for (const name of ["Kylian Mbappé", "Vinícius Júnior", "Lamine Yamal", "J. Bellingham", "G. de Arrascaeta", "Pedro", "Jorginho", "Vozinha", "Edoardo Borrelli", "Morten Hjulmand", "O. Vlachodimos", "Law McCabe"]) {
  for (const x of all) {
    const { p, squad } = playerOf.get(x.id)!;
    if (p.name !== name) continue;
    if (name === "Pedro" || name === "Jorginho") { if (squad.name !== "Flamengo") continue; }
    log(`  ${name} (${p.age}, ${squad.name}): ${before.get(x.id)!.toFixed(2)} (${rankIn(x.league, x.id, before)}º) → ${after.get(x.id)!.toFixed(2)} (${rankIn(x.league, x.id, after)}º) de ${derived.leagues[x.league]!.players}`);
  }
}
log();
log("== Nacionalidade ==");
log(`preenchidas: ${nationalityFilled}`);
log(`sem bandeira: ${[...noFlag].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "nenhuma"}`);
log("continuam sem nacionalidade, por liga:");
const stillMissing = new Map<string, number>();
for (const x of all) {
  const { p } = playerOf.get(x.id)!;
  if (!p.nationality && !derived.players[x.id]?.nationality) stillMissing.set(x.league, (stillMissing.get(x.league) ?? 0) + 1);
}
for (const [k, v] of [...stillMissing].sort((a, b) => b[1] - a[1])) log(`  ${k.padEnd(42)} ${v}`);

log();
log(`derived.json: ${Object.keys(derived.players).length} jogadores, ${derived.targets.size} com nota nova.`);
if (reportArg) writeFileSync(reportArg, lines.join("\n") + "\n");
