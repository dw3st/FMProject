/**
 * Real stadiums of the main leagues (4.31): for each club, its home ground on Wikidata (P115: coordinates, capacity,
 * roof) and its shape on OpenStreetMap (the pitch's orientation, how deep the stands are beyond each side).
 * Writes `src/example_data/stadiums.json` (squadId → derived numbers only). Network; responses cached in
 * `data_process/stadiums/cache/` (gitignored). OSM data © OpenStreetMap contributors (ODbL).
 *
 *   bun scripts/fetchStadiums.ts [--leagues a,b] [--refresh]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEAGUES, curlText, sleep, sparql } from "@/../scripts/faces/wikidata";
import { heightFromCapacity, heightFromDepth, minAreaRect, standHeight, polygonArea, standDepths, toLocal, type PitchRect, type Pt } from "@/../scripts/stadiums/geometry";
import type { RealStadium } from "@/Domain/matchday/stadiumSun";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SQUADS = join(ROOT, "src/example_data/squads");
const CACHE = join(ROOT, "data_process/stadiums/cache");
const OUT = join(ROOT, "src/example_data/stadiums.json");
const CORRECTIONS = join(ROOT, "data_process/curated/stadiumCorrections.json");

const args = process.argv.slice(2);
const leagues = args.includes("--leagues") ? args[args.indexOf("--leagues") + 1]!.split(",") : LEAGUES;
const refresh = args.includes("--refresh");
mkdirSync(CACHE, { recursive: true });

/** Standard UTC offset (hours) and daylight-saving rule by country; USA/Canada by longitude. */
const TZ: Record<string, { std: number; dst: RealStadium["dst"] }> = {
  England: { std: 0, dst: "eu" }, Spain: { std: 1, dst: "eu" }, Germany: { std: 1, dst: "eu" }, Italy: { std: 1, dst: "eu" },
  France: { std: 1, dst: "eu" }, Portugal: { std: 0, dst: "eu" }, Netherlands: { std: 1, dst: "eu" },
  Brazil: { std: -3, dst: "none" }, Argentina: { std: -3, dst: "none" },
};
function tzOf(country: string, lon: number): { std: number; dst: RealStadium["dst"] } {
  if (TZ[country]) return TZ[country]!;
  if (country === "USA" || country === "United States" || country === "Canada") {
    const std = lon > -82 ? -5 : lon > -102 ? -6 : lon > -115 ? -7 : -8;
    return { std, dst: "us" };
  }
  return { std: Math.round(lon / 15), dst: "none" };
}

interface Squad { id: string; name: string; country?: string; venue?: { name?: string; city?: string; capacity?: number } }
const squads: { squad: Squad; league: string }[] = [];
for (const league of leagues) {
  const dir = join(SQUADS, league);
  if (!existsSync(dir)) { console.warn(`no league ${league}`); continue; }
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    squads.push({ squad: JSON.parse(readFileSync(join(dir, f), "utf8")), league });
  }
}

const clubQids: Record<string, { qid: string }> = JSON.parse(readFileSync(join(ROOT, "data_process/wikidata/coachClubs.json"), "utf8"));
/**
 * `data_process/curated/stadiumCorrections.json`: `{ "<squadId>": { name: "<just for reading>", venue?: "<Wikidata
 * item of the right ground>", roof?, skip? } }`. `venue` replaces the club's P115 (a move Wikidata does not have yet).
 */
const corrections: Record<string, { name?: string; venue?: string; lat?: number; lon?: number; roof?: RealStadium["roof"]; skip?: boolean }> = existsSync(CORRECTIONS)
  ? JSON.parse(readFileSync(CORRECTIONS, "utf8")) : {};

// 1) Home grounds on Wikidata (current P115 statements: no end date; preferred rank first).
const withQid = squads.filter(({ squad }) => clubQids[squad.id]?.qid);
const venueOf = new Map<string, { venue: string; label: string; lat: number; lon: number; cap?: number; roof: RealStadium["roof"] }>();
const values = [...new Set(withQid.map(({ squad }) => clubQids[squad.id]!.qid))];
const rowsByClub = new Map<string, any[]>();
for (let i = 0; i < values.length; i += 80) {
  const rows = await sparql(`SELECT ?club ?venue ?venueLabel ?coord ?cap ?rank ?start ?end ?type ?typeLabel WHERE {
    VALUES ?club { ${values.slice(i, i + 80).map((q) => `wd:${q}`).join(" ")} }
    ?club p:P115 ?st. ?st ps:P115 ?venue; wikibase:rank ?rank.
    OPTIONAL { ?st pq:P582 ?end. }
    OPTIONAL { ?st pq:P580 ?start. }
    ?venue wdt:P625 ?coord.
    OPTIONAL { ?venue wdt:P1083 ?cap. }
    OPTIONAL { ?venue wdt:P31|wdt:P527 ?type. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,pt,es,de,it,fr,nl". }
  }`);
  for (const r of rows) {
    const club = r.club.value.split("/").pop();
    if (!rowsByClub.has(club)) rowsByClub.set(club, []);
    rowsByClub.get(club)!.push(r);
  }
  await sleep(1500);
}
// Corrected grounds: their own coordinates, capacity and type, keyed by the club's item like the rest.
// (A club without its own Wikidata item is keyed by its squad id.)
const clubKey = (id: string) => clubQids[id]?.qid ?? `squad:${id}`;
const fixed = squads.filter(({ squad }) => corrections[squad.id]?.venue);
if (fixed.length) {
  const vids = [...new Set(fixed.map(({ squad }) => corrections[squad.id]!.venue!))];
  const rows = await sparql(`SELECT ?venue ?venueLabel ?coord ?cap ?type ?typeLabel WHERE {
    VALUES ?venue { ${vids.map((q) => `wd:${q}`).join(" ")} }
    ?venue wdt:P625 ?coord. OPTIONAL { ?venue wdt:P1083 ?cap. } OPTIONAL { ?venue wdt:P31|wdt:P527 ?type. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`);
  for (const { squad } of fixed) {
    const v = corrections[squad.id]!.venue!;
    const mine = rows.filter((r: any) => r.venue.value.endsWith(`/${v}`)).map((r: any) => ({ ...r, rank: { value: "PreferredRank" } }));
    if (mine.length) rowsByClub.set(clubKey(squad.id), mine);
    else console.warn(`  correction ${squad.id}: ${v} has no coordinates`);
  }
}
// Roof by the labels of the item's classes and parts (P31 / P527): "retractable roof", "domed stadium", "indoor arena".
const RETRACTABLE = /retractable/i;
const DOME = /dome|indoor/i;
for (const [club, rows] of rowsByClub) {
  const current = rows.filter((r) => !r.end);
  const pool = current.length ? current : rows;
  // Preferred rank first, then the most recent start (a club that moved keeps its old ground without an end date).
  const startOf = (r: any) => (r.start ? Date.parse(r.start.value) : 0);
  pool.sort((a, b) => ((a.rank.value.endsWith("PreferredRank") ? 0 : 1) - (b.rank.value.endsWith("PreferredRank") ? 0 : 1))
    || startOf(b) - startOf(a));
  const top = pool[0]!;
  const venue = top.venue.value.split("/").pop();
  const types: string[] = rows.filter((r) => r.venue.value === top.venue.value && r.typeLabel).map((r) => r.typeLabel.value);
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(top.coord.value);
  if (!m) continue;
  venueOf.set(club, {
    venue, label: top.venueLabel.value, lon: Number(m[1]), lat: Number(m[2]),
    cap: top.cap ? Number(top.cap.value) : undefined,
    roof: types.some((t) => RETRACTABLE.test(t)) ? "retractable" : types.some((t) => DOME.test(t)) ? "closed" : "open",
  });
}

// 2) Shapes on OpenStreetMap (Overpass, main server then mirrors), cached by stadium item.
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
async function overpass(qid: string, lat: number, lon: number): Promise<any> {
  const file = join(CACHE, `${qid}.json`);
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const q = `[out:json][timeout:90];(way["leisure"="pitch"](around:400,${lat},${lon});way["leisure"="stadium"](around:500,${lat},${lon});relation["leisure"="stadium"](around:500,${lat},${lon}););out tags geom;`;
  let text = "";
  for (let round = 0; round < 3 && !text; round++) {
    for (const url of OVERPASS) {
      try { text = await curlText(url, ["--data-urlencode", `data=${q}`]); break; } catch { /* next mirror */ }
    }
    if (!text) await sleep(30000);
  }
  if (!text) throw new Error(`overpass failed for ${qid}`);
  writeFileSync(file, text);
  await sleep(2500);
  return JSON.parse(text);
}

const out: Record<string, RealStadium> = {};
let noShape = 0;
for (const { squad, league } of squads) {
  const fix = corrections[squad.id];
  if (fix?.skip) continue;
  const found = venueOf.get(clubKey(squad.id));
  if (!found) { console.warn(`  ${league} ${squad.name}: no home ground on Wikidata`); continue; }
  const v = fix?.lat !== undefined && fix.lon !== undefined ? { ...found, lat: fix.lat, lon: fix.lon } : found;
  const data = await overpass(fix?.lat !== undefined ? `${v.venue}_fix` : v.venue, v.lat, v.lon);
  const toL = toLocal(v.lat, v.lon);
  const polys = (e: any): Pt[][] => e.type === "way"
    ? [e.geometry.map((g: any) => toL(g.lat, g.lon))]
    : (e.members ?? []).filter((m: any) => m.role === "outer" && m.geometry).map((m: any) => m.geometry.map((g: any) => toL(g.lat, g.lon)));
  const outlines = data.elements.filter((e: any) => e.tags?.leisure === "stadium");
  // The stadium outline nearest the coordinates; the football-sized pitch nearest its centre.
  const outline = outlines.map(polys).sort((a: Pt[][], b: Pt[][]) => dist0(a) - dist0(b))[0] ?? [];
  const pitches = data.elements
    .filter((e: any) => e.type === "way" && e.tags?.leisure === "pitch" && /soccer|football/.test(e.tags?.sport ?? "soccer"))
    .map((e: any) => polys(e)[0]!)
    .filter((p: Pt[]) => { const a = polygonArea(p); return a > 4800 && a < 12500; });
  const ref = outline.length ? centroid(outline.flat()) : { x: 0, y: 0 };
  pitches.sort((a: Pt[], b: Pt[]) => d2(centroid(a), ref) - d2(centroid(b), ref));
  // No football-sized pitch mapped (a gridiron, or none): a 105 × 68 m pitch at the outline's centre, along it.
  let pitch: PitchRect;
  if (pitches.length) pitch = minAreaRect(pitches[0]!);
  else if (outline.length) {
    const r = minAreaRect(outline.flat());
    pitch = { center: r.center, axis: r.axis, length: 105, width: 68 };
    console.warn(`  ${league} ${squad.name} (${v.label}): no pitch on OSM, along the stadium outline`);
  } else { noShape++; console.warn(`  ${league} ${squad.name} (${v.label}): no pitch nor outline on OSM`); continue; }
  const depths = standDepths(pitch, outline);
  const capacity = v.cap ?? squad.venue?.capacity ?? 20000;
  // No outline, or one drawn tight around the pitch (no stand reaching 10 m): every side gets the stand a stadium of
  // that capacity would have. Otherwise each side from its depth (`standHeight`).
  const tight = Math.max(...(["top", "bottom", "low", "high"] as const).map((k) => heightFromDepth(depths[k]))) < 10;
  const h = (side: keyof typeof depths) => outline.length && !tight ? standHeight(depths[side], capacity) : heightFromCapacity(capacity);
  const tz = tzOf(squad.country ?? "", v.lon);
  out[squad.id] = {
    id: `std_${v.venue}`, qid: v.venue, name: v.label, lat: round(v.lat, 5), lon: round(v.lon, 5), axis: round(pitch.axis, 1),
    heights: { top: h("top"), bottom: h("bottom"), low: h("low"), high: h("high") },
    roof: fix?.roof ?? v.roof, tzStd: tz.std, dst: tz.dst,
  };
}

function centroid(p: Pt[]): Pt { return { x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length }; }
function d2(a: Pt, b: Pt) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }
function dist0(p: Pt[][]) { return d2(centroid(p.flat()), { x: 0, y: 0 }); }
function round(v: number, n: number) { const k = 10 ** n; return Math.round(v * k) / k; }

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })));
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
const roofs = Object.values(out).reduce<Record<string, number>>((m, s) => ({ ...m, [s.roof]: (m[s.roof] ?? 0) + 1 }), {});
console.log(`clubs ${squads.length}, with a home ground ${withQid.length}, written ${Object.keys(out).length}, no pitch on OSM ${noShape}`);
console.log(`roofs ${JSON.stringify(roofs)}; stadiums ${new Set(Object.values(out).map((s) => s.id)).size}`);
