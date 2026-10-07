// Propõe data_process/transfermarkt/leagueMap.json (slug → id da competição no Transfermarkt).
// Só preenche ligas que ainda não têm entrada; a revisão final é manual.
// Uso: bun scripts/transfermarkt/proposeLeagueMap.ts [--port 8765] [--candidates]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAP_PATH = fileURLToPath(new URL("../../data_process/transfermarkt/leagueMap.json", import.meta.url));
const LEAGUES_PATH = fileURLToPath(new URL("../../src/example_data/leagueData.json", import.meta.url));

const args = process.argv.slice(2);
const argValue = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const PORT = argValue("--port", "8765");
const SHOW_CANDIDATES = args.includes("--candidates");
const PAUSE_MS = 1500;

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Nome do país do jogo → nome usado pelo Transfermarkt, quando diferem.
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "united states",
  "czech republic": "czech republic",
  turkey: "turkiye",
  "south korea": "korea south",
  "united arab emirates": "united arab emirates",
};

interface Hit { id: string; name: string; country: string; clubs?: number }
interface League { slug: string; name: string; country: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(path: string): Promise<any> {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (res.status === 404) return { results: [], lastPageNumber: 1 };
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function search(name: string): Promise<Hit[]> {
  const out: Hit[] = [];
  let page = 1;
  let last = 1;
  do {
    const body = await get(`/competitions/search/${encodeURIComponent(name.replace(/[/]/g, " "))}?page_number=${page}`);
    last = Number(body.lastPageNumber ?? 1);
    for (const r of body.results ?? []) out.push({ id: String(r.id), name: r.name, country: r.country, clubs: r.clubs });
    page++;
    await sleep(PAUSE_MS);
  } while (page <= last && page <= 3);
  return out;
}

const leagues: League[] = JSON.parse(readFileSync(LEAGUES_PATH, "utf8"));
const map: Record<string, string | null> = existsSync(MAP_PATH) ? JSON.parse(readFileSync(MAP_PATH, "utf8")) : {};

for (const league of leagues) {
  if (league.slug in map) continue;
  const want = norm(COUNTRY_ALIASES[norm(league.country)] ?? league.country);
  let hits = (await search(league.name)).filter((h) => norm(h.country) === want);
  if (hits.length === 0) hits = (await search(league.country)).filter((h) => norm(h.country) === want);
  map[league.slug] = hits[0]?.id ?? null;
  console.log(`${league.slug} → ${hits[0] ? `${hits[0].id} (${hits[0].name}, ${hits[0].clubs} clubes)` : "null"}`);
  if (SHOW_CANDIDATES) for (const h of hits.slice(0, 6)) console.log(`    ${h.id} ${h.name} [${h.clubs}]`);
}

const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(MAP_PATH, JSON.stringify(sorted, null, 2) + "\n");
console.log(`ok: ${Object.keys(sorted).length} ligas`);
