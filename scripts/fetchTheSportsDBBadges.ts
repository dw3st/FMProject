/**
 * Crests from TheSportsDB for the clubs with no native or ESPN crest (no entry in logoIndex.json).
 *
 *   bun scripts/fetchTheSportsDBBadges.ts [--limit N] [--no-download]
 *
 * For each such club: `searchteams.php?t=<q>` with the squad name, its shortName, the full seed name in an
 * of_* id, then the name without club-type tokens (free key "123", sequential, ~6.5 s pause: faster calls get
 * 429s; curl). The free key returns one "best" team per search, so a team is kept only when it is a soccer
 * men's first team of the club's league country and one of its names has exactly the significant tokens of
 * one of ours (pickBadgeTeam, scripts/thesportsdb/badgeMatch.ts); otherwise the club is skipped and listed.
 * Crests of clubs no longer matched are deleted from logos/tsdb/.
 *
 * Downloads the 200 px badge ("/small") to src/example_data/logos/tsdb/<squadId>.png and writes the
 * reviewable report data_process/thesportsdb/badgeMatches.json (ids and names, no images). API answers
 * are cached in data_process/thesportsdb/cache/ (gitignored). Then run scripts/applyTsdbBadges.ts.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clubKey } from "@/../scripts/espn/normalize";
import { badgeQueries, pickBadgeTeam, type TsdbTeam } from "@/../scripts/thesportsdb/badgeMatch";
import { curlFile, sleep } from "@/../scripts/faces/wikidata";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA = join(ROOT, "src/example_data");
const DIR = join(ROOT, "data_process/thesportsdb");
const CACHE = join(DIR, "cache");
const OUT = join(DATA, "logos/tsdb");
const API = "https://www.thesportsdb.com/api/v1/json/123";
const PAUSE_MS = 6500;
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
mkdirSync(CACHE, { recursive: true });

/** GET with a pause before every call; a 429 (the free key allows ~30 calls a minute) waits a minute and retries. */
async function getJson(url: string): Promise<{ teams?: TsdbTeam[] | null }> {
  for (let attempt = 1; attempt <= 8; attempt++) {
    await sleep(PAUSE_MS);
    const p = Bun.spawn(["curl", "-s", "-L", "--max-time", "60", "-w", "\n%{http_code}", url], { stdout: "pipe", stderr: "ignore" });
    const out = await new Response(p.stdout).text();
    await p.exited;
    const cut = out.lastIndexOf("\n");
    const code = out.slice(cut + 1).trim(), body = out.slice(0, cut);
    if (code === "200" && body) return JSON.parse(body);
    console.warn(`  HTTP ${code || "?"} (attempt ${attempt}), waiting`);
    await sleep(code === "429" ? 65_000 : 5_000 * attempt);
  }
  throw new Error(`request failed: ${url}`);
}

async function searchTeams(q: string): Promise<TsdbTeam[]> {
  const file = join(CACHE, `t_${(clubKey(q) || q).replace(/[^a-z0-9]+/gi, "_").slice(0, 100)}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const r = await getJson(`${API}/searchteams.php?t=${encodeURIComponent(q)}`);
  const list: TsdbTeam[] = r.teams ?? [];
  writeFileSync(file, JSON.stringify(list));
  return list;
}

const index: Record<string, string> = JSON.parse(readFileSync(join(DATA, "logoIndex.json"), "utf8"));
const leagues: { slug: string; country: string }[] = JSON.parse(readFileSync(join(DATA, "leagueData.json"), "utf8"));
const countryOf = new Map(leagues.map((l) => [l.slug, l.country]));

interface Club { id: string; name: string; shortName?: string; league: string; country: string }
const clubs: Club[] = [];
for (const lg of readdirSync(join(DATA, "squads")).sort()) {
  for (const f of readdirSync(join(DATA, "squads", lg)).sort()) {
    const s = JSON.parse(readFileSync(join(DATA, "squads", lg, f), "utf8"));
    if (index[s.id]) continue;
    const country = countryOf.get(lg);
    if (!country) continue;
    clubs.push({ id: s.id, name: s.name, shortName: s.shortName, league: lg, country });
  }
}
const queue = clubs.slice(0, LIMIT);
console.log(`${queue.length} clubs without a crest`);

interface Match { squadId: string; name: string; league: string; country: string; idTeam: string; tsdbName: string; tsdbCountry: string; badge: string; query: string }
const matched: Match[] = [];
const skipped: { squadId: string; name: string; league: string; reason: string; candidates: string[] }[] = [];
let n = 0;
for (const c of queue) {
  let found: Match | null = null;
  let lastSkip: { reason: string; candidates: string[] } = { reason: "none", candidates: [] };
  const seen = new Set<string>();
  for (const q of badgeQueries(c)) {
    const pick = pickBadgeTeam(c, await searchTeams(q));
    if ("team" in pick) {
      const t = pick.team;
      found = { squadId: c.id, name: c.name, league: c.league, country: c.country, idTeam: t.idTeam, tsdbName: t.strTeam, tsdbCountry: t.strCountry ?? "", badge: t.strBadge!, query: q };
      break;
    }
    if (pick.skip === "ambiguous") { lastSkip = { reason: "ambiguous", candidates: pick.candidates }; break; }
    for (const x of pick.candidates) seen.add(x);
    lastSkip = { reason: "none", candidates: [...seen] };
  }
  if (found) matched.push(found);
  else skipped.push({ squadId: c.id, name: c.name, league: c.league, ...lastSkip });
  if (++n % 50 === 0) console.log(`${n}/${queue.length}, ${matched.length} matched`);
}

// A TheSportsDB team matched to two of our clubs is ambiguous: both lose it.
const owners = new Map<string, Match[]>();
for (const m of matched) owners.set(m.idTeam, [...(owners.get(m.idTeam) ?? []), m]);
const dup = new Set([...owners.values()].filter((ms) => ms.length > 1).flat().map((m) => m.squadId));
const kept = matched.filter((m) => !dup.has(m.squadId));
for (const m of matched.filter((m) => dup.has(m.squadId)))
  skipped.push({ squadId: m.squadId, name: m.name, league: m.league, reason: "shared", candidates: [`${m.idTeam}:${m.tsdbName}`] });

const byId = (a: { squadId: string }, b: { squadId: string }) => a.squadId.localeCompare(b.squadId, "en", { numeric: true });
writeFileSync(join(DIR, "badgeMatches.json"), JSON.stringify({
  note: "Crests of clubs with no native/ESPN crest, from TheSportsDB (thesportsdb.com). Images in src/example_data/logos/tsdb/.",
  matched: kept.sort(byId).map(({ badge: _b, query: _q, ...m }) => m),
  skipped: skipped.sort(byId),
}, null, 1) + "\n");
console.log(`matched ${kept.length}, skipped ${skipped.length} (${skipped.filter((s) => s.reason === "ambiguous").length} ambiguous, ${skipped.filter((s) => s.reason === "shared").length} shared)`);

if (!process.argv.includes("--no-download")) {
  mkdirSync(OUT, { recursive: true });
  // A crest whose club is no longer matched (stricter rules, club left the world) goes away.
  const keep = new Set(kept.map((m) => `${m.squadId}.png`));
  for (const f of readdirSync(OUT)) if (!keep.has(f)) rmSync(join(OUT, f));
  let ok = 0, fail = 0;
  for (const m of kept) {
    const file = join(OUT, `${m.squadId}.png`);
    if (existsSync(file)) { ok++; continue; }
    if (await curlFile(`${m.badge}/small`, file) || await curlFile(m.badge, file)) ok++;
    else { fail++; console.warn(`  badge failed: ${m.squadId} ${m.badge}`); }
    await sleep(400);
  }
  console.log(`badges: ${ok} present, ${fail} failed → src/example_data/logos/tsdb/`);
}
