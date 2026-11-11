/**
 * Real football legends from Wikidata (CC0) → `src/example_data/realLegends.json` (8.9.26, user request: the
 * achievements shop offers real stars, not the game's own retirees).
 *
 * Who: men's footballers (P106 Q937857) born 1920–1990 with a playing position (P413), and any of: Ballon d'Or
 * winner (P166 Q166177 / Q2291862), FIFA World Cup winner (in the edition, P1344, and in the winning national team,
 * P54 = the edition's P1346), or a Wikipedia article in `MIN_SITELINKS`+ languages (well known, club heroes included).
 * Anyone who still plays in our world (same name key and birth year ±1) is left out. Only derived fields are written:
 * Wikidata id, name, birth year, nationality, line and position, honours, fame. Responses are cached in
 * `data_process/wikidata/cache/legends/` (gitignored).
 *
 *   bun scripts/fetchWikidataLegends.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeNationality, playerKey } from "@/../scripts/espn/normalize";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CACHE = join(ROOT, "data_process/wikidata/cache/legends");
const OUT = join(ROOT, "src/example_data/realLegends.json");
const UA = "FMProjectLegends/0.1 (https://westlab.dev) curl";
const MIN_SITELINKS = 40;
const BALLON_DOR = ["Q166177", "Q2291862"];
const DECADES = [1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
mkdirSync(CACHE, { recursive: true });

async function sparql(query: string): Promise<any[]> {
  const key = createHash("sha1").update(query).digest("hex");
  const file = join(CACHE, `${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  for (let attempt = 1; attempt <= 5; attempt++) {
    const p = Bun.spawn(["curl", "-s", "-f", "-L", "--max-time", "180", "-A", UA, "-H", "Accept: application/sparql-results+json",
      "--data-urlencode", `query=${query}`, "https://query.wikidata.org/sparql"], { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(p.stdout).text();
    if ((await p.exited) === 0 && text) {
      const rows = JSON.parse(text).results.bindings;
      writeFileSync(file, JSON.stringify(rows));
      await sleep(1500);
      return rows;
    }
    console.warn(`  retry ${attempt}`);
    await sleep(8000 * attempt);
  }
  throw new Error(`SPARQL failed: ${query.slice(0, 200)}`);
}
const qidOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);
const yearOf = (v?: { value: string }) => (v ? parseInt(v.value.replace(/^\+/, "").slice(0, 4), 10) : null);

interface Person {
  qid: string; name: string | null; birthYear: number | null; sitelinks: number;
  positions: Set<string>; citizenship: Set<string>; ballonDor: number; worldCups: Set<number>; wcTeam: string | null;
}
const people = new Map<string, Person>();
const person = (qid: string): Person => {
  let p = people.get(qid);
  if (!p) {
    p = { qid, name: null, birthYear: null, sitelinks: 0, positions: new Set(), citizenship: new Set(), ballonDor: 0, worldCups: new Set(), wcTeam: null };
    people.set(qid, p);
  }
  return p;
};

const BASE = (filter: string) => `
SELECT ?p ?l ?b ?sl ?posl WHERE {
  ${filter}
  ?p wdt:P106 wd:Q937857; wdt:P413 ?pos; wdt:P569 ?b; wikibase:sitelinks ?sl .
  ?pos rdfs:label ?posl FILTER(LANG(?posl) = "en")
  OPTIONAL { ?p rdfs:label ?l FILTER(LANG(?l) = "en") }
}`;

function addRows(rows: any[]): void {
  for (const r of rows) {
    const p = person(qidOf(r.p.value));
    if (r.l?.value) p.name = r.l.value;
    p.birthYear = yearOf(r.b);
    p.sitelinks = Math.max(p.sitelinks, parseInt(r.sl.value, 10));
    if (r.posl?.value) p.positions.add(r.posl.value.toLowerCase());
  }
}

console.log("famous footballers by birth decade…");
for (const d of DECADES) {
  const rows = await sparql(BASE(`?p wikibase:sitelinks ?sl0 . FILTER(?sl0 >= ${MIN_SITELINKS}) ?p wdt:P569 ?b0 . FILTER(YEAR(?b0) >= ${d} && YEAR(?b0) < ${d + 10})`));
  console.log(`  ${d}s: ${rows.length} rows`);
  addRows(rows);
}

console.log("Ballon d'Or winners…");
for (const aw of BALLON_DOR) {
  const rows = await sparql(BASE(`?p p:P166 ?st . ?st ps:P166 wd:${aw} .`));
  addRows(rows);
  const counts = await sparql(`SELECT ?p (COUNT(?st) AS ?n) WHERE { ?p p:P166 ?st . ?st ps:P166 wd:${aw} . } GROUP BY ?p`);
  for (const r of counts) person(qidOf(r.p.value)).ballonDor += parseInt(r.n.value, 10);
}

console.log("World Cup winners…");
const wcRows = await sparql(`
SELECT ?p ?y ?teaml WHERE {
  ?wc wdt:P3450 wd:Q19317; wdt:P1346 ?team; wdt:P585|wdt:P580 ?d .
  ?p wdt:P1344 ?wc; wdt:P54 ?team; wdt:P106 wd:Q937857 .
  ?team rdfs:label ?teaml FILTER(LANG(?teaml) = "en")
  BIND(YEAR(?d) AS ?y)
}`);
const winners = new Set<string>();
for (const r of wcRows) {
  const p = person(qidOf(r.p.value));
  p.worldCups.add(parseInt(r.y.value, 10));
  p.wcTeam = r.teaml.value;
  winners.add(p.qid);
}
const missing = [...winners].filter((q) => !people.get(q)!.birthYear || people.get(q)!.positions.size === 0);
for (let i = 0; i < missing.length; i += 150) {
  addRows(await sparql(BASE(`VALUES ?p { ${missing.slice(i, i + 150).map((q) => `wd:${q}`).join(" ")} }`)));
}

console.log("national teams…");
// Fame alone also brings people famous for something else who played in their youth (an actor, a head of
// government, managers): only a footballer capped by a senior national team gets in on fame.
const capped = new Set<string>();
{
  const all = [...people.keys()];
  for (let i = 0; i < all.length; i += 200) {
    const rows = await sparql(`SELECT DISTINCT ?p WHERE { VALUES ?p { ${all.slice(i, i + 200).map((q) => `wd:${q}`).join(" ")} }
      ?p wdt:P54 ?t . ?t wdt:P31 wd:Q6979593 . }`);
    for (const r of rows) capped.add(qidOf(r.p.value));
  }
}

console.log("citizenship…");
const ids = [...people.keys()];
for (let i = 0; i < ids.length; i += 200) {
  const rows = await sparql(`SELECT ?p ?cl WHERE { VALUES ?p { ${ids.slice(i, i + 200).map((q) => `wd:${q}`).join(" ")} }
    ?p wdt:P1532|wdt:P27 ?c . ?c rdfs:label ?cl FILTER(LANG(?cl) = "en") }`);
  for (const r of rows) person(qidOf(r.p.value)).citizenship.add(r.cl.value);
}

// ── Who still plays in our world: left out ──
/** The full name key and "first initial + surname" (the world often abbreviates: "K. Benzema"). */
function nameKeys(name: string): string[] {
  const full = playerKey(name);
  const tokens = full.split(" ").filter(Boolean);
  const out = [full];
  if (tokens.length >= 2) out.push(`${tokens[0]![0]}~${tokens.at(-1)}`);
  return out;
}
const worldNames = new Set<string>();
const active = new Set<string>();
const squadsDir = join(ROOT, "src/example_data/squads");
for (const league of readdirSync(squadsDir)) {
  for (const f of readdirSync(join(squadsDir, league))) {
    const squad = JSON.parse(readFileSync(join(squadsDir, league, f), "utf8"));
    for (const pl of squad.players ?? []) {
      if (pl.nationality) worldNames.add(pl.nationality);
      const year = pl.birthDate ? parseInt(pl.birthDate.slice(0, 4), 10) : 2027 - (pl.age ?? 0);
      for (const n of [pl.name, pl.fullName]) if (n) for (const k of nameKeys(n)) for (const dy of [-1, 0, 1]) active.add(`${k}|${year + dy}`);
    }
  }
}

const TEAM_SUFFIX = /\s+(men's\s+)?national\s+(association\s+)?football\s+team$/i;
const NATION_ALIASES: Record<string, string> = { "West Germany": "Germany", "Soviet Union": "Russia", "Kingdom of Italy": "Italy", "Kingdom of the Netherlands": "Netherlands", "United Kingdom": "England" };
function nationality(p: Person): string | null {
  const fromTeam = p.wcTeam ? p.wcTeam.replace(TEAM_SUFFIX, "") : null;
  for (const raw of [fromTeam, ...p.citizenship]) {
    if (!raw) continue;
    const n = normalizeNationality(NATION_ALIASES[raw] ?? raw, worldNames);
    if (n) return n;
  }
  return null;
}

type Line = "GK" | "DEF" | "MID" | "FWD";
/** The detailed position of the legend and its line, from the Wikidata position labels. */
function positionOf(p: Person): { line: Line; position: string } | null {
  const all = [...p.positions].join(" | ");
  if (/goalkeeper/.test(all)) return { line: "GK", position: "GK" };
  if (/(forward|striker|winger|centre-forward)/.test(all)) return { line: "FWD", position: /winger/.test(all) ? "RW" : "ST" };
  if (/(attacking midfielder|playmaker)/.test(all)) return { line: "MID", position: "CAM" };
  if (/(defensive midfielder)/.test(all)) return { line: "MID", position: "CDM" };
  if (/(full-back|full back|wing-back|wing half)/.test(all)) return { line: "DEF", position: "RB" };
  if (/(defender|centre-back|sweeper|libero)/.test(all)) return { line: "DEF", position: "CB" };
  if (/midfielder/.test(all)) return { line: "MID", position: "CM" };
  return null;
}

const out: unknown[] = [];
let skippedActive = 0;
for (const p of people.values()) {
  if (!p.name || !p.birthYear || p.birthYear < 1920 || p.birthYear > 1990) continue;
  const honoured = p.ballonDor > 0 || p.worldCups.size > 0;
  if (!honoured && (p.sitelinks < MIN_SITELINKS || !capped.has(p.qid))) continue;
  if (nameKeys(p.name).some((k) => active.has(`${k}|${p.birthYear}`))) { skippedActive++; continue; }
  const pos = positionOf(p);
  if (!pos) continue;
  out.push({
    id: `rl_${p.qid}`, wikidata: p.qid, name: p.name, birthYear: p.birthYear, nationality: nationality(p),
    line: pos.line, position: pos.position, ballonDor: p.ballonDor, worldCups: [...p.worldCups].sort(), fame: p.sitelinks,
  });
}
out.sort((a: any, b: any) => b.fame - a.fame || a.id.localeCompare(b.id));
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${out.length} legends written (${skippedActive} still playing in the world left out) → ${OUT}`);
