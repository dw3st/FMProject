/**
 * Face pilot (Wikidata/Commons): finds our players on Wikidata, takes their image (P18) and
 * downloads a 400px Commons thumbnail when the licence is free.
 *
 *   bun scripts/fetchWikidataPhotos.ts [--no-download]
 *
 * 1. Clubs → Wikidata items: data_process/wikidata/clubs.json (scripts/faces/wdClubs.ts, reviewed).
 * 2. Per club, one SPARQL query: every person who ever played for it (P54) born ≥ 1983, with labels,
 *    aliases, birth date and image. Our players are matched inside their own club by name (full key,
 *    initial + surname, or all label tokens inside our full name) AND birth year (from the age);
 *    a pair is kept only when it is unique on both sides.
 * 3. Commons `imageinfo` (extmetadata) → licence and author; only CC BY / CC BY-SA / CC0 / public
 *    domain are kept → data_process/wikidata/photoMeta.json (no image data, committable).
 * 4. Thumbnails (width 400) → data_process/wikidata/photos/<ourId>.jpg|png (gitignored, never committed).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { playerKey } from "@/../scripts/espn/normalize";
import { curlFile, curlJson, LEAGUES, sleep, sparql } from "@/../scripts/faces/wikidata";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIR = join(ROOT, "data_process/wikidata");
const PHOTOS = join(DIR, "photos");
/** Season the world ages refer to (ages are taken at the 2026/27 start). */
const SEASON_YEAR = 2026;
const DOWNLOAD = !process.argv.includes("--no-download");

interface WdPerson { qid: string; names: string[]; birthYear: number; image: string | null }
interface Ours { id: string; name: string; fullName?: string; age: number; league: string; club: string }

const clubs: Record<string, { qid: string }> = JSON.parse(readFileSync(join(DIR, "clubs.json"), "utf8"));
const toks = (s: string | undefined) => (s ? playerKey(s).split(" ").filter((t) => t.length > 0) : []);

function keysOf(names: (string | undefined)[]): Set<string> {
  const k = new Set<string>();
  for (const n of names) {
    const t = toks(n);
    if (t.length === 0) continue;
    k.add(t.join(" "));
    if (t.length >= 2) k.add(`${t[0]![0]} ${t[t.length - 1]}`);
  }
  return k;
}

/**
 * 2 = same full name key, 1 = our abbreviated name ("B. Saka") equals a label's initial+surname, or all
 * label tokens inside our full name; 0 = no. The initial+surname key is only built from an
 * abbreviated `name`, never from `fullName` (that matched "Matheus … Oliveira" to "Malcom … Oliveira").
 */
function nameScore(p: Ours, w: WdPerson): number {
  const ours = p.name.includes(".") ? new Set([toks(p.name).join(" ")]) : new Set<string>();
  // Empty keys never match: a label in a non-Latin script normalises to "" and so does a missing fullName.
  const fullOurs = new Set([toks(p.name).join(" "), toks(p.fullName).join(" ")].filter((k) => k.length > 0));
  for (const n of w.names) { const k = toks(n).join(" "); if (k && fullOurs.has(k)) return 2; }
  for (const k of keysOf(w.names)) if (k.includes(" ") && k.split(" ")[0]!.length === 1 && ours.has(k)) return 1;
  const ft = new Set(toks(p.fullName));
  for (const n of w.names) { const t = toks(n); if (t.length >= 2 && t.every((x) => ft.has(x))) return 1; }
  return 0;
}

const CACHE = join(DIR, "cache");
mkdirSync(CACHE, { recursive: true });
/** Disk cache of raw API answers (gitignored) so a re-run does not hit Wikidata again. */
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const file = join(CACHE, `${key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120)}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const v = await fn();
  writeFileSync(file, JSON.stringify(v));
  return v;
}

const PERSON_FIELDS = `?p ?dob ?img (GROUP_CONCAT(DISTINCT ?n; SEPARATOR="|") AS ?names)`;
const PERSON_TAIL = `?p wdt:P569 ?dob .
    OPTIONAL { ?p wdt:P18 ?img }
    { ?p rdfs:label ?n } UNION { ?p skos:altLabel ?n }
    FILTER(LANG(?n) IN ("en","pt","es","fr","mul"))
  } GROUP BY ?p ?dob ?img`;

function toPeople(rows: any[]): WdPerson[] {
  const byQid = new Map<string, WdPerson>();
  for (const r of rows) {
    const q = r.p.value.split("/").pop()!;
    const img = r.img ? decodeURIComponent(r.img.value.split("Special:FilePath/").pop()!) : null;
    const prev = byQid.get(q);
    if (prev) { if (!prev.image && img) prev.image = img; continue; }
    byQid.set(q, { qid: q, names: r.names.value.split("|"), birthYear: Number(r.dob.value.slice(0, 4)), image: img });
  }
  return [...byQid.values()];
}

/** Candidates → one person per player, unique on both sides (best name score). */
function pickUnique(cands: Map<string, { w: WdPerson; s: number }[]>, taken: Set<string>): Map<string, WdPerson> {
  const claims = new Map<string, number>();
  for (const list of cands.values()) { const top = Math.max(...list.map((c) => c.s)); for (const c of list) if (c.s === top) claims.set(c.w.qid, (claims.get(c.w.qid) ?? 0) + 1); }
  const out = new Map<string, WdPerson>();
  for (const [pid, list] of cands) {
    const top = Math.max(...list.map((c) => c.s));
    const best = list.filter((c) => c.s === top);
    if (best.length !== 1 || claims.get(best[0]!.w.qid) !== 1 || taken.has(best[0]!.w.qid)) continue;
    out.set(pid, best[0]!.w);
  }
  return out;
}

function candidates(p: Ours, people: WdPerson[]): { w: WdPerson; s: number }[] {
  const expected = SEASON_YEAR - p.age;
  return people
    .filter((w) => w.birthYear >= expected - 2 && w.birthYear <= expected + 1)
    .map((w) => ({ w, s: nameScore(p, w) }))
    .filter((c) => c.s > 0);
}

async function clubPeople(qid: string): Promise<WdPerson[]> {
  return toPeople(await cached(`club_${qid}`, async () => { await sleep(1500); return sparql(`SELECT ?p ?dob ?img (GROUP_CONCAT(DISTINCT ?n; SEPARATOR="|") AS ?names) WHERE {
    ?p p:P54/ps:P54 wd:${qid} ; wdt:P569 ?dob .
    FILTER(YEAR(?dob) >= 1983)
    OPTIONAL { ?p wdt:P18 ?img }
    { ?p rdfs:label ?n } UNION { ?p skos:altLabel ?n }
    FILTER(LANG(?n) IN ("en","pt","es","fr","mul"))
  } GROUP BY ?p ?dob ?img`); }));
}

// 1–2. Matching.
const matches: Record<string, { qid: string; image: string | null }> = {};
const stats: Record<string, { players: number; item: number; image: number; free: number }> = {};
const unmatched: Ours[] = [];
for (const league of LEAGUES) {
  stats[league] = { players: 0, item: 0, image: 0, free: 0 };
  const dir = join(ROOT, "src/example_data/squads", league);
  for (const f of readdirSync(dir).sort()) {
    const sq = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const ours: Ours[] = sq.players.map((p: any) => ({ id: p.id, name: p.name, fullName: p.fullName, age: p.age, league, club: sq.name }));
    stats[league]!.players += ours.length;
    const qid = clubs[sq.id]?.qid;
    if (!qid) continue;
    const people = await clubPeople(qid);
    const cands = new Map<string, { w: WdPerson; s: number }[]>();
    for (const p of ours) { const c = candidates(p, people); if (c.length) cands.set(p.id, c); }
    const picked = pickUnique(cands, new Set());
    for (const [pid, w] of picked) matches[pid] = { qid: w.qid, image: w.image };
    const n = picked.size;
    unmatched.push(...ours.filter((p) => !picked.has(p.id)));
    console.log(`${league} ${sq.name}: ${n}/${ours.length} matched (${people.length} Wikidata people)`);
  }
}

// 2b. Players not found through their club (world transfers, missing P54): Wikidata full-text search
// among footballers (P106 = Q937857) by name, then the same name + birth-year check, unique.
const queryOf = (p: Ours) => {
  const t = (p.name.includes(".") && p.fullName ? `${p.fullName.split(" ")[0]} ${p.name.split(" ").pop()}` : p.name).replace(/\./g, "");
  return `${t} haswbstatement:P106=Q937857`;
};
const found = new Map<string, string[]>();
for (const p of unmatched) {
  const r = await cached(`search_${p.id}`, async () => { await sleep(300); return curlJson(`https://www.wikidata.org/w/api.php?action=query&format=json&list=search&srlimit=8&srsearch=${encodeURIComponent(queryOf(p))}`); });
  found.set(p.id, (r.query?.search ?? []).map((x: any) => x.title));
}
const qids = [...new Set([...found.values()].flat())];
const pool: WdPerson[] = [];
for (let i = 0; i < qids.length; i += 150) {
  const batch = qids.slice(i, i + 150);
  pool.push(...toPeople(await cached(`batch_${batch[0]}_${batch.length}_${i}`, async () => { await sleep(1500); return sparql(`SELECT ${PERSON_FIELDS} WHERE { VALUES ?p { ${batch.map((q) => `wd:${q}`).join(" ")} } ${PERSON_TAIL}`); })));
}
const poolById = new Map(pool.map((w) => [w.qid, w]));
const cands2 = new Map<string, { w: WdPerson; s: number }[]>();
for (const p of unmatched) {
  const people = (found.get(p.id) ?? []).map((q) => poolById.get(q)).filter((w): w is WdPerson => !!w);
  const c = candidates(p, people);
  if (c.length) cands2.set(p.id, c);
}
const second = pickUnique(cands2, new Set(Object.values(matches).map((m) => m.qid)));
for (const [pid, w] of second) matches[pid] = { qid: w.qid, image: w.image };
console.log(`search pass: ${second.size}/${unmatched.length} more matched`);
// One Wikidata person per player: a person matched by two clubs' passes (same name and age in both
// squads) is ambiguous, so both players lose the match.
const owners = new Map<string, string[]>();
for (const [pid, m] of Object.entries(matches)) owners.set(m.qid, [...(owners.get(m.qid) ?? []), pid]);
for (const pids of owners.values()) if (pids.length > 1) for (const pid of pids) delete matches[pid];

// 3. Licences (50 files per request).
const FREE = /^(cc[ -]by(-sa)?([ -]\d|$)|cc0|public domain|pd\b|pd-)/i;
const files = [...new Set(Object.values(matches).map((m) => m.image).filter((x): x is string => !!x))];
const info = new Map<string, { license: string; artist: string; thumb: string; page: string }>();
const strip = (s: string | undefined) => (s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
for (let i = 0; i < files.length; i += 50) {
  const titles = files.slice(i, i + 50).map((f) => `File:${f}`).join("|");
  const r = await curlJson(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&iiurlwidth=400&titles=${encodeURIComponent(titles)}`);
  const norm = new Map<string, string>((r.query?.normalized ?? []).map((n: any) => [n.to, n.from]));
  for (const page of Object.values<any>(r.query?.pages ?? {})) {
    const ii = page.imageinfo?.[0];
    if (!ii) continue;
    const title: string = norm.get(page.title) ?? page.title;
    const md = ii.extmetadata ?? {};
    info.set(title.replace(/^File:/, ""), {
      license: strip(md.LicenseShortName?.value) || "?",
      artist: strip(md.Artist?.value) || "?",
      thumb: ii.thumburl ?? ii.url,
      page: ii.descriptionurl,
    });
  }
  await sleep(1000);
}

const meta: Record<string, { qid: string; file: string; license: string; artist: string; thumb: string; page: string }> = {};
const licenses: Record<string, number> = {};
const leagueOf = new Map<string, string>();
for (const league of LEAGUES) for (const f of readdirSync(join(ROOT, "src/example_data/squads", league))) {
  for (const p of JSON.parse(readFileSync(join(ROOT, "src/example_data/squads", league, f), "utf8")).players) leagueOf.set(p.id, league);
}
for (const [pid, m] of Object.entries(matches)) {
  const st = stats[leagueOf.get(pid)!]!;
  st.item++;
  if (!m.image) continue;
  st.image++;
  const i = info.get(m.image) ?? info.get(m.image.replace(/_/g, " "));
  if (!i) continue;
  licenses[i.license] = (licenses[i.license] ?? 0) + 1;
  if (!FREE.test(i.license)) continue;
  st.free++;
  meta[pid] = { qid: m.qid, file: m.image, ...i };
}
writeFileSync(join(DIR, "matches.json"), JSON.stringify(Object.fromEntries(Object.entries(matches).sort()), null, 1) + "\n");
writeFileSync(join(DIR, "photoMeta.json"), JSON.stringify(Object.fromEntries(Object.entries(meta).sort()), null, 1) + "\n");
console.log("\nCoverage (players / Wikidata item / with image / free licence):");
for (const [l, s] of Object.entries(stats)) console.log(`  ${l}: ${s.players} / ${s.item} / ${s.image} / ${s.free}`);
console.log("Licences:", JSON.stringify(Object.entries(licenses).sort((a, b) => b[1] - a[1])));

// 4. Thumbnails, 2 at a time.
if (DOWNLOAD) {
  mkdirSync(PHOTOS, { recursive: true });
  const jobs = Object.entries(meta);
  let i = 0, ok = 0, fail = 0;
  await Promise.all([0, 1].map(async () => {
    while (i < jobs.length) {
      const [pid, m] = jobs[i++]!;
      const ext = /\.png($|\?)/i.test(m.thumb) ? "png" : "jpg";
      const file = join(PHOTOS, `${pid}.${ext}`);
      if (existsSync(file)) { ok++; continue; }
      if (await curlFile(m.thumb, file)) ok++; else fail++;
      await sleep(400);
    }
  }));
  console.log(`photos: ${ok} present, ${fail} failed → data_process/wikidata/photos/`);
}
