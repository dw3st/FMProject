/**
 * Current head coach of every club the world can match on Wikidata (CC0) → `data_process/wikidata/coaches.json`
 * (squadId → { name, nationality?, birthDate?, wikidataQid }). `.claude/rules/data/espn-import.md` → "Técnicos".
 *
 * 1. Club → item: `data_process/wikidata/clubs.json` (face pilot, 10 leagues, reviewed) first; the rest by country,
 *    a SPARQL of the football clubs (P31 Q476028, P17 = the country) that have a head coach (P286), matched by
 *    name (`clubKey`, then `looseClubKey`), unique on both sides (`scripts/wikidata/coachesSource.ts`).
 *    `data_process/wikidata/coachClubOverrides.json` (squadId → item, "" = no item) wins over both.
 *    The full mapping is written to `data_process/wikidata/coachClubs.json` (review aid, committed).
 * 2. Coach: P286 statement without an end date, the most recent start (`currentCoach`), rejected when the coach
 *    is at another team from a later date (his open P6087 confirmed by that team's open P286); a coach picked by two
 *    of our clubs stays only at the latest start (`dedupeCoaches`). Name = label en (else pt/es/fr/de/it); nationality =
 *    P1532 (country for sport) else P27, mapped to the world's convention; birth date P569.
 *
 * Responses are cached in `data_process/wikidata/cache/coaches/` (gitignored); polite pause between requests.
 *
 *   bun scripts/fetchWikidataCoaches.ts [--today YYYY-MM-DD]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeNationality } from "@/../scripts/espn/normalize";
import { currentCoach, dedupeCoaches, matchClubsToWikidata, type CoachElsewhere, type CoachStatement, type OurClub } from "@/../scripts/wikidata/coachesSource";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SQUADS = join(ROOT, "src/example_data/squads");
const CACHE = join(ROOT, "data_process/wikidata/cache/coaches");
const CLUBS_PILOT = join(ROOT, "data_process/wikidata/clubs.json");
/** squadId → Wikidata club item, by hand; "" blocks a wrong automatic match (e.g. a reserve side). */
const CLUB_OVERRIDES = join(ROOT, "data_process/wikidata/coachClubOverrides.json");
const OUT = join(ROOT, "data_process/wikidata/coaches.json");
const OUT_CLUBS = join(ROOT, "data_process/wikidata/coachClubs.json");
const UA = "FMProjectCoaches/0.1 (https://westlab.dev; emygdiowestphalen@gmail.com) curl";
const LANGS = ["en", "pt", "es", "fr", "de", "it"];
const NAME_LANGS = ["en", "es", "pt", "fr", "de", "it", "nl", "pl", "cs", "sk", "sl", "hr", "sr", "tr", "sv", "nb", "da", "fi", "is", "hu", "ro", "id", "sq", "mt", "uz", "kk", "ca", "eu", "gl", "et", "lv", "lt"];
/** Countries whose leagues hold clubs of a neighbour (MLS: Canada; Ligue 1: Monaco; Swiss league: Liechtenstein). */
const EXTRA_COUNTRIES: Record<string, string[]> = { US: ["CA"], FR: ["MC"], CH: ["LI"], GB: [], ES: ["AD"] };

const argToday = process.argv.indexOf("--today");
const TODAY = argToday > 0 ? process.argv[argToday + 1]! : new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
mkdirSync(CACHE, { recursive: true });

async function sparql(query: string): Promise<any[]> {
  const key = createHash("sha1").update(query).digest("hex");
  const file = join(CACHE, `${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const url = "https://query.wikidata.org/sparql";
  for (let attempt = 1; attempt <= 5; attempt++) {
    const p = Bun.spawn(["curl", "-s", "-f", "-L", "--max-time", "120", "-A", UA, "-H", "Accept: application/sparql-results+json",
      "--data-urlencode", `query=${query}`, url], { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(p.stdout).text();
    if ((await p.exited) === 0 && text) {
      const rows = JSON.parse(text).results.bindings;
      writeFileSync(file, JSON.stringify(rows));
      await sleep(1500);
      return rows;
    }
    await sleep(4000 * attempt);
  }
  throw new Error(`SPARQL failed: ${query.slice(0, 200)}`);
}
const qidOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);
const dateOf = (v?: { value: string }) => (v ? v.value.replace(/^\+/, "").slice(0, 10) : undefined);

// ---- world --------------------------------------------------------------------------------------------------
const leagueData: { slug: string; country: string; iso2: string }[] = JSON.parse(readFileSync(join(ROOT, "src/example_data/leagueData.json"), "utf8"));
const isoOfLeague = new Map(leagueData.map((l) => [l.slug, l.iso2]));
interface Sq extends OurClub { league: string; iso: string }
const squads: Sq[] = [];
const worldNationalities = new Set<string>();
for (const league of readdirSync(SQUADS)) {
  for (const f of readdirSync(join(SQUADS, league))) {
    const s = JSON.parse(readFileSync(join(SQUADS, league, f), "utf8"));
    squads.push({ id: s.id, name: s.name, shortName: s.shortName, league, iso: isoOfLeague.get(league) ?? "" });
    for (const p of s.players ?? []) if (p.nationality) worldNationalities.add(p.nationality);
  }
}

// ---- step 1: clubs ------------------------------------------------------------------------------------------
const mapping = new Map<string, { qid: string; via: string }>();
const pilot: Record<string, { qid: string }> = JSON.parse(readFileSync(CLUBS_PILOT, "utf8"));
const known = new Set(squads.map((s) => s.id));
const overrides: Record<string, string> = JSON.parse(readFileSync(CLUB_OVERRIDES, "utf8"));
for (const sid of Object.keys(overrides)) if (!known.has(sid)) throw new Error(`coachClubOverrides: squad ${sid} is not in the world`);
for (const [sid, qid] of Object.entries(overrides)) if (qid) mapping.set(sid, { qid, via: "override" });
for (const [sid, v] of Object.entries(pilot)) if (v.qid && known.has(sid) && !(sid in overrides)) mapping.set(sid, { qid: v.qid, via: "pilot" });

const isos = [...new Set(squads.map((s) => s.iso))].filter(Boolean).sort();
const allIsos = [...new Set(isos.flatMap((i) => [i, ...(EXTRA_COUNTRIES[i] ?? [])]))];
const countryRows = await sparql(`SELECT ?c ?iso WHERE { VALUES ?iso { ${allIsos.map((i) => `"${i}"`).join(" ")} } ?c wdt:P297 ?iso. }`);
const countryQs = new Map<string, string[]>();
for (const r of countryRows) countryQs.set(r.iso.value, [...(countryQs.get(r.iso.value) ?? []), qidOf(r.c.value)]);

for (const iso of isos) {
  const qs = [iso, ...(EXTRA_COUNTRIES[iso] ?? [])].flatMap((i) => countryQs.get(i) ?? []);
  if (qs.length === 0) { console.warn(`país sem item: ${iso}`); continue; }
  const rows = await sparql(`SELECT ?club ?name WHERE {
    VALUES ?country { ${qs.map((q) => `wd:${q}`).join(" ")} }
    ?club wdt:P31 wd:Q476028; wdt:P17 ?country.
    FILTER EXISTS { ?club wdt:P286 [] }
    { ?club rdfs:label ?name } UNION { ?club skos:altLabel ?name }
    FILTER(LANG(?name) IN (${NAME_LANGS.map((l) => `"${l}"`).join(",")}))
  }`);
  const names = new Map<string, Set<string>>();
  for (const r of rows) {
    const q = qidOf(r.club.value);
    if (!names.has(q)) names.set(q, new Set());
    names.get(q)!.add(r.name.value);
  }
  const ours = squads.filter((s) => s.iso === iso);
  const fixed = new Set(ours.filter((s) => mapping.has(s.id) || s.id in overrides).map((s) => s.id));
  const fixedQ = new Set([...mapping.values()].map((m) => m.qid));
  const m = matchClubsToWikidata(ours, [...names].map(([qid, n]) => ({ qid, names: [...n] })), fixed, fixedQ);
  for (const [sid, qid] of m) if (!(sid in overrides)) mapping.set(sid, { qid, via: "sparql" });
  console.log(`${iso}: ${names.size} clubes com técnico no Wikidata, ${m.size} casados (+${fixed.size} do piloto) de ${ours.length}`);
}

// ---- step 2: coaches ----------------------------------------------------------------------------------------
const clubQids = [...new Set([...mapping.values()].map((m) => m.qid))].sort();
const statements = new Map<string, CoachStatement[]>();
for (let i = 0; i < clubQids.length; i += 120) {
  const batch = clubQids.slice(i, i + 120);
  const rows = await sparql(`SELECT ?club ?coach ?rank ?start ?end WHERE {
    VALUES ?club { ${batch.map((q) => `wd:${q}`).join(" ")} }
    ?club p:P286 ?st. ?st ps:P286 ?coach; wikibase:rank ?rank.
    OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end }
  }`);
  for (const r of rows) {
    const club = qidOf(r.club.value);
    const rank = r.rank.value.endsWith("PreferredRank") ? "preferred" : r.rank.value.endsWith("DeprecatedRank") ? "deprecated" : "normal";
    if (!statements.has(club)) statements.set(club, []);
    if (!r.coach.value.startsWith("http://www.wikidata.org/entity/Q")) continue; // "unknown value"
    statements.get(club)!.push({ coach: qidOf(r.coach.value), rank, start: dateOf(r.start), end: dateOf(r.end) });
  }
}
const coachQids = [...new Set([...statements.values()].flat().map((s) => s.coach))].sort();
const elsewhere: CoachElsewhere[] = [];
const coachInfo = new Map<string, { labels: Record<string, string>; birth?: string; dead?: boolean; sport: string[]; cit: string[] }>();
for (let i = 0; i < coachQids.length; i += 150) {
  const batch = coachQids.slice(i, i + 150);
  const values = batch.map((q) => `wd:${q}`).join(" ");
  const labels = await sparql(`SELECT ?coach ?l WHERE { VALUES ?coach { ${values} } ?coach rdfs:label ?l. FILTER(LANG(?l) IN (${LANGS.map((l) => `"${l}"`).join(",")})) }`);
  for (const r of labels) {
    const q = qidOf(r.coach.value);
    if (!coachInfo.has(q)) coachInfo.set(q, { labels: {}, sport: [], cit: [] });
    coachInfo.get(q)!.labels[r.l["xml:lang"]] = r.l.value;
  }
  const facts = await sparql(`SELECT ?coach ?birth ?death ?sport ?sportL ?cit ?citL WHERE { VALUES ?coach { ${values} }
    OPTIONAL { ?coach wdt:P570 ?death }
    OPTIONAL { ?coach p:P569/psv:P569 ?bv. ?bv wikibase:timeValue ?birth; wikibase:timePrecision ?prec. FILTER(?prec >= 11) }
    OPTIONAL { ?coach wdt:P1532 ?sport. ?sport rdfs:label ?sportL. FILTER(LANG(?sportL) = "en") }
    OPTIONAL { ?coach wdt:P27 ?cit. ?cit rdfs:label ?citL. FILTER(LANG(?citL) = "en") } }`);
  for (const r of facts) {
    const q = qidOf(r.coach.value);
    if (!coachInfo.has(q)) coachInfo.set(q, { labels: {}, sport: [], cit: [] });
    const c = coachInfo.get(q)!;
    if (r.birth && !c.birth) c.birth = dateOf(r.birth);
    if (r.death) c.dead = true;
    if (r.sport && !c.sport.includes(r.sportL.value)) c.sport.push(r.sportL.value);
    if (r.cit && !c.cit.includes(r.citL.value)) c.cit.push(r.citL.value);
  }
  const other = await sparql(`SELECT ?coach ?team ?start WHERE { VALUES ?coach { ${values} }
    ?coach p:P6087 ?st. ?st ps:P6087 ?team. FILTER NOT EXISTS { ?st pq:P582 [] } OPTIONAL { ?st pq:P580 ?start } }`);
  const pairs = other.map((r) => ({ coach: qidOf(r.coach.value), team: qidOf(r.team.value), start: dateOf(r.start) }));
  const teams = [...new Set(pairs.map((p) => p.team))].sort();
  const confirmed = new Set<string>();
  for (let j = 0; j < teams.length; j += 150) {
    const rows = await sparql(`SELECT ?team ?coach WHERE { VALUES ?team { ${teams.slice(j, j + 150).map((q) => `wd:${q}`).join(" ")} }
      ?team p:P286 ?st. ?st ps:P286 ?coach. FILTER NOT EXISTS { ?st pq:P582 [] } }`);
    for (const r of rows) confirmed.add(`${qidOf(r.coach.value)}|${qidOf(r.team.value)}`);
  }
  for (const p of pairs) if (confirmed.has(`${p.coach}|${p.team}`)) elsewhere.push(p);
}

/** World convention for a Wikidata country label ("United Kingdom" has no world equivalent: P1532 decides). */
const NAT_ALIAS: Record<string, string> = { "Kingdom of the Netherlands": "Netherlands", "People's Republic of China": "China", "Kingdom of Denmark": "Denmark" };
function nationalityOf(c: { sport: string[]; cit: string[] }): string | undefined {
  for (const label of [...c.sport, ...c.cit]) {
    const n = normalizeNationality(NAT_ALIAS[label] ?? label, worldNationalities);
    if (n) return n;
  }
  return undefined;
}
const nameOf = (labels: Record<string, string>) => LANGS.map((l) => labels[l]).find((v) => v && v.trim());

const out: Record<string, { name: string; nationality?: string; birthDate?: string; wikidataQid: string }> = {};
const reasons: Record<string, number> = {};
const picks = new Map<string, CoachStatement>();
for (const s of squads) {
  const m = mapping.get(s.id);
  if (!m) { reasons.noClub = (reasons.noClub ?? 0) + 1; continue; }
  const alive = (statements.get(m.qid) ?? []).filter((st) => !coachInfo.get(st.coach)?.dead);
  const pick = currentCoach(alive, TODAY, elsewhere, m.qid);
  if (!pick) { reasons.noCurrent = (reasons.noCurrent ?? 0) + 1; continue; }
  picks.set(s.id, pick);
}
const kept = dedupeCoaches(picks);
if (process.argv.includes("--verbose")) for (const [sid, p] of picks) if (!kept.has(sid)) console.log("duplicado:", sid, squads.find((s) => s.id === sid)?.name, p.coach, p.start, [...picks].filter(([o, q]) => o !== sid && q.coach === p.coach).map(([o, q]) => `${squads.find((s) => s.id === o)?.name} ${q.start}`).join("; "));
reasons.duplicate = picks.size - kept.size;
for (const s of [...squads].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
  const pick = kept.get(s.id);
  if (!pick) continue;
  const info = coachInfo.get(pick.coach);
  const name = info && nameOf(info.labels);
  if (!name || /^Q\d+$/.test(name)) { reasons.noName = (reasons.noName ?? 0) + 1; continue; }
  const nationality = nationalityOf(info!);
  out[s.id] = { name, ...(nationality ? { nationality } : {}), ...(info!.birth ? { birthDate: info!.birth } : {}), wikidataQid: pick.coach };
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const clubsOut: Record<string, { qid: string; via: string; name: string }> = {};
for (const s of squads) { const m = mapping.get(s.id); if (m) clubsOut[s.id] = { ...m, name: s.name }; }
writeFileSync(OUT_CLUBS, JSON.stringify(Object.fromEntries(Object.entries(clubsOut).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))), null, 1) + "\n");

const byLeague = new Map<string, [number, number, number]>();
for (const s of squads) {
  const v = byLeague.get(s.league) ?? [0, 0, 0];
  v[0]++; if (mapping.has(s.id)) v[1]++; if (out[s.id]) v[2]++;
  byLeague.set(s.league, v);
}
console.log("\nliga: clubes / casados / com técnico");
for (const [l, [n, c, t]] of [...byLeague].sort()) console.log(`${l.padEnd(42)} ${n} / ${c} / ${t}`);
console.log(`total: ${squads.length} clubes, ${mapping.size} casados, ${Object.keys(out).length} com técnico atual`, reasons);
