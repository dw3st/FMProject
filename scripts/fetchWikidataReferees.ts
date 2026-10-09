/**
 * Referees and assistant referees of every game country, from Wikidata (CC0) →
 * `data_process/wikidata/referees.json` (spec `docs/superpowers/specs/2026-10-09-referees-design.md` §1.2).
 *
 * One SPARQL per occupation (association football referee Q859528, assistant referee Q223291) for the facts, one
 * for the positions (P39: "FIFA referee" Q20994440 kept, any other position drops the person), one for the labels.
 * Men and women; citizenship of the United Kingdom counts as England. Only the countries of the main leagues
 * (`LEAGUES` of `scripts/faces/wikidata.ts`: England, Spain, Germany, Italy, France, Brazil, Portugal, Netherlands,
 * Argentina, USA) get real referees; every other country plays with the generated pool (decision of 2026-10-09). Responses are cached in
 * `data_process/wikidata/cache/referees/` (gitignored). The Transfermarkt rigor is added afterwards by
 * `scripts/fetchTransfermarktReferees.ts` (it keeps the `strictness` already in the output file).
 *
 *   bun scripts/fetchWikidataReferees.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEAGUES } from "@/../scripts/faces/wikidata";
import { pickReferees, type RefereeSource, type WdRefereeRow } from "@/../scripts/wikidata/refereesSource";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CACHE = join(ROOT, "data_process/wikidata/cache/referees");
const OUT = join(ROOT, "data_process/wikidata/referees.json");
const UA = "FMProjectReferees/0.1 (https://westlab.dev; emygdiowestphalen@gmail.com) curl";
const NAME_LANGS = ["en", "es", "pt", "fr", "de", "it", "nl", "pl", "cs", "sk", "sl", "hr", "sr", "tr", "sv", "nb", "da", "fi", "is", "hu", "ro", "id", "sq", "mt", "uz", "kk", "ca", "eu", "gl", "et", "lv", "lt", "el", "ru", "uk", "be", "bg", "ka", "hy", "he", "ar", "fa", "ja"];
const LATIN_FIRST = new Set(["en", "es", "pt", "fr", "de", "it", "nl", "pl", "cs", "sk", "sl", "hr", "sr", "tr", "sv", "nb", "da", "fi", "is", "hu", "ro", "id", "sq", "mt", "uz", "kk", "ca", "eu", "gl", "et", "lv", "lt"]);
const OCCUPATIONS = { referee: "Q859528", assistant: "Q223291" } as const;
const FIFA = "Q20994440";
const MALE = new Set(["Q6581097", "Q2449503"]);
const FEMALE = new Set(["Q6581072", "Q1052281"]);
const YEAR = 2027;

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
    await sleep(5000 * attempt);
  }
  throw new Error(`SPARQL failed: ${query.slice(0, 200)}`);
}
const qidOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);
const dateOf = (v?: { value: string }) => (v ? v.value.replace(/^\+/, "").slice(0, 10) : null);

const countries: Record<string, { iso2: string }> = JSON.parse(readFileSync(join(ROOT, "src/example_data/countries.json"), "utf8"));
const leagueData: { slug: string; country: string }[] = JSON.parse(readFileSync(join(ROOT, "src/example_data/leagueData.json"), "utf8"));
const REAL_COUNTRIES = new Set(leagueData.filter((l) => LEAGUES.includes(l.slug)).map((l) => l.country));
if (REAL_COUNTRIES.size !== LEAGUES.length) throw new Error(`países das ligas principais: ${[...REAL_COUNTRIES].join(", ")}`);
const nameOfIso = new Map(Object.entries(countries).filter(([name]) => REAL_COUNTRIES.has(name)).map(([name, c]) => [c.iso2, name]));
const countryOfIso = (iso: string) => nameOfIso.get(iso) ?? null;

interface Person {
  qid: string; birth: string | null; death: string | null; gender: "male" | "female" | null; sitelinks: number;
  cit: Set<string>; sport: Set<string>; tm: string | null; fifaFrom: string | null; fifaTo: string | null; hasFifa: boolean;
  other: number; labels: Record<string, string>; roles: Set<"referee" | "assistant">;
}
const people = new Map<string, Person>();
const person = (qid: string): Person => {
  let p = people.get(qid);
  if (!p) {
    p = { qid, birth: null, death: null, gender: null, sitelinks: 0, cit: new Set(), sport: new Set(), tm: null,
      fifaFrom: null, fifaTo: null, hasFifa: false, other: 0, labels: {}, roles: new Set() };
    people.set(qid, p);
  }
  return p;
};

const BIRTH = `?p wdt:P569 ?birth. FILTER(YEAR(?birth) >= ${YEAR - 51} && YEAR(?birth) <= ${YEAR - 26})`;
for (const [role, occ] of Object.entries(OCCUPATIONS) as ["referee" | "assistant", string][]) {
  const facts = await sparql(`SELECT ?p ?birth ?death ?gender ?sl ?cit ?sport ?tm WHERE {
    ?p wdt:P106 wd:${occ}; wdt:P31 wd:Q5. ${BIRTH}
    ?p wikibase:sitelinks ?sl.
    OPTIONAL { ?p wdt:P570 ?death } OPTIONAL { ?p wdt:P21 ?gender }
    OPTIONAL { ?p wdt:P27/wdt:P297 ?cit } OPTIONAL { ?p wdt:P1532/wdt:P297 ?sport } OPTIONAL { ?p wdt:P3699 ?tm } }`);
  for (const r of facts) {
    const p = person(qidOf(r.p.value));
    p.roles.add(role);
    p.birth ??= dateOf(r.birth);
    if (r.death) p.death = dateOf(r.death);
    if (r.gender) {
      const g = qidOf(r.gender.value);
      p.gender = MALE.has(g) ? "male" : FEMALE.has(g) ? "female" : p.gender;
    }
    p.sitelinks = Math.max(p.sitelinks, Number(r.sl.value));
    if (r.cit) p.cit.add(r.cit.value);
    if (r.sport) p.sport.add(r.sport.value);
    if (r.tm && !p.tm) p.tm = r.tm.value;
  }
  const positions = await sparql(`SELECT ?p ?pos ?start ?end WHERE {
    ?p wdt:P106 wd:${occ}; wdt:P31 wd:Q5. ${BIRTH}
    ?p p:P39 ?st. ?st ps:P39 ?pos. OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } }`);
  const seenOther = new Set<string>();
  for (const r of positions) {
    const p = person(qidOf(r.p.value));
    const pos = qidOf(r.pos.value);
    if (pos === FIFA) {
      p.hasFifa = true;
      const end = dateOf(r.end);
      if (!p.fifaTo || !end || (end > p.fifaTo)) { p.fifaFrom = dateOf(r.start); p.fifaTo = end; }
      if (!end) p.fifaTo = null;
    } else if (!seenOther.has(`${p.qid}|${pos}`)) {
      seenOther.add(`${p.qid}|${pos}`);
      p.other++;
    }
  }
  const labels = await sparql(`SELECT ?p ?l WHERE {
    ?p wdt:P106 wd:${occ}; wdt:P31 wd:Q5. ${BIRTH}
    ?p rdfs:label ?l. FILTER(LANG(?l) IN (${NAME_LANGS.map((l) => `"${l}"`).join(",")})) }`);
  for (const r of labels) person(qidOf(r.p.value)).labels[r.l["xml:lang"]] = r.l.value;
}

const labelOf = (p: Person): string => {
  for (const l of NAME_LANGS) if (LATIN_FIRST.has(l) && p.labels[l]) return p.labels[l]!;
  for (const l of NAME_LANGS) if (p.labels[l]) return p.labels[l]!;
  return p.qid;
};
const firstMapped = (isos: Set<string>) => [...isos].sort().find((i) => countryOfIso(i)) ?? null;

const rows: WdRefereeRow[] = [];
for (const p of people.values()) {
  for (const role of p.roles) {
    rows.push({
      qid: p.qid, label: labelOf(p), iso2: firstMapped(p.cit), sportIso2: firstMapped(p.sport), birth: p.birth,
      death: p.death, gender: p.gender, sitelinks: p.sitelinks, fifaFrom: p.fifaFrom, fifaTo: p.fifaTo,
      otherPositions: p.other, role, tmId: p.tm, hasFifa: p.hasFifa,
    });
  }
}
const picked = pickReferees(rows, { year: YEAR, countryOfIso });

// Keep the Transfermarkt rigor already computed (fetchTransfermarktReferees.ts writes it into the same file).
const previous: RefereeSource[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const prevById = new Map(previous.map((r) => [r.id, r]));
const out = picked.map((r) => {
  const prev = prevById.get(r.id);
  return prev?.strictness !== undefined ? { ...r, strictness: prev.strictness, tmMatches: prev.tmMatches } : r;
});
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);

const report = new Map<string, { ref: number; ast: number; women: number; tm: number }>();
for (const r of out) {
  const c = report.get(r.country) ?? { ref: 0, ast: 0, women: 0, tm: 0 };
  if (r.role === "referee") c.ref++; else c.ast++;
  if (r.gender === "female") c.women++;
  if (r.tmId) c.tm++;
  report.set(r.country, c);
}
for (const name of [...REAL_COUNTRIES].sort()) {
  const c = report.get(name) ?? { ref: 0, ast: 0, women: 0, tm: 0 };
  console.log(`${name.padEnd(22)} árbitros ${String(c.ref).padStart(2)}  assistentes ${String(c.ast).padStart(2)}  mulheres ${c.women}  com Transfermarkt ${c.tm}`);
}
const ref12 = [...report.values()].filter((c) => c.ref >= 12).length;
console.log(`\npessoas no Wikidata (nascidas ${YEAR - 51}–${YEAR - 26}): ${people.size}; no arquivo: ${out.length} (${out.filter((r) => r.role === "referee").length} árbitros, ${out.filter((r) => r.role === "assistant").length} assistentes, ${out.filter((r) => r.gender === "female").length} mulheres, ${out.filter((r) => r.tmId).length} com ID do Transfermarkt); países: ${report.size}`);
