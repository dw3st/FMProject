/**
 * Face pilot: downloads ESPN headshots of the players of a few leagues, for `extractFaceTraits.ts`.
 *
 *   bun scripts/fetchHeadshots.ts [--leagues brazil_serie_a,premier_league,la_liga,ligue_1] [--probe]
 *
 * 1. Maps our players to ESPN athlete ids (`scripts/faces/athleteMap.ts`) → data_process/espn/faceAthletes.json
 *    (ids only, committable).
 * 2. Reads each team's roster from the ESPN site API: the roster says which athletes have a headshot
 *    (`athlete.headshot.href`). `--probe` also tries the standard headshot URL for athletes without one.
 * 3. Downloads them to data_process/espn/headshots/<athleteId>.png (gitignored — photos are never
 *    committed nor published). Skips files already there; 3 at a time with a small pause.
 *
 * Uses curl: Bun's fetch fails against ESPN on Windows.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EspnSnapshot } from "@/../scripts/espn/types";
import { mapAthletes, type MapClub } from "@/../scripts/faces/athleteMap";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIR = join(ROOT, "data_process", "espn");
const OUT = join(DIR, "headshots");
const API = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const HEADSHOT = (id: string) => `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png`;
const CONCURRENCY = 3;
const PAUSE_MS = 150;

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const LEAGUES = (arg("--leagues") ?? "brazil_serie_a,premier_league,la_liga,ligue_1").split(",");
const PROBE = process.argv.includes("--probe");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function curlJson(url: string): Promise<any> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const p = Bun.spawn(["curl", "-s", "-f", "--max-time", "30", url], { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(p.stdout).text();
    if ((await p.exited) === 0 && text) return JSON.parse(text);
    await sleep(500 * attempt);
  }
  throw new Error(`curl failed: ${url}`);
}

async function curlFile(url: string, out: string): Promise<boolean> {
  const p = Bun.spawn(["curl", "-s", "-f", "--max-time", "30", "-o", out, url], { stdout: "ignore", stderr: "ignore" });
  return (await p.exited) === 0 && existsSync(out);
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k]!); await sleep(PAUSE_MS); }
  }));
}

function loadClubs(): MapClub[] {
  const clubs: MapClub[] = [];
  for (const league of LEAGUES) {
    const dir = join(ROOT, "src", "example_data", "squads", league);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const sq = JSON.parse(readFileSync(join(dir, f), "utf8"));
      clubs.push({ id: String(sq.id), league, players: sq.players.map((p: any) => ({ id: p.id, name: p.name, fullName: p.fullName })) });
    }
  }
  return clubs;
}

const snap: EspnSnapshot = JSON.parse(readFileSync(join(DIR, "snapshot.json"), "utf8"));
const overrides = JSON.parse(readFileSync(join(DIR, "playerOverrides.json"), "utf8"));
const clubs = loadClubs();
const { map, clubTeam } = mapAthletes(clubs, snap, overrides);

console.log("Mapping (our player → ESPN athlete):");
for (const league of LEAGUES) {
  const ps = clubs.filter((c) => c.league === league).flatMap((c) => c.players);
  const mapped = ps.filter((p) => map.has(p.id)).length;
  const cl = clubs.filter((c) => c.league === league);
  console.log(`  ${league}: ${mapped}/${ps.length} players (${((mapped / ps.length) * 100).toFixed(0)}%), clubs ${cl.filter((c) => clubTeam.has(c.id)).length}/${cl.length}`);
}
const leagueOf = new Map(clubs.flatMap((c) => c.players.map((p) => [p.id, c.league] as const)));
writeFileSync(join(DIR, "faceAthletes.json"), JSON.stringify(Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b))), null, 1) + "\n");

// Rosters → headshot hrefs.
const wanted = new Set(map.values());
const headshotOf = new Map<string, string>();
const leagueOfAthlete = new Map<string, string>();
for (const [pid, aid] of map) leagueOfAthlete.set(aid, leagueOf.get(pid)!);
for (const l of snap.leagues.filter((l) => LEAGUES.includes(l.slug))) {
  for (const t of l.teams) {
    const roster = await curlJson(`${API}/${l.code}/teams/${t.id}/roster`);
    for (const a of roster.athletes ?? []) {
      const id = String(a.id);
      if (wanted.has(id) && a.headshot?.href) headshotOf.set(id, a.headshot.href);
    }
    await sleep(PAUSE_MS);
  }
}
console.log("\nHeadshots listed in the rosters:");
for (const league of LEAGUES) {
  const ids = [...wanted].filter((a) => leagueOfAthlete.get(a) === league);
  console.log(`  ${league}: ${ids.filter((a) => headshotOf.has(a)).length}/${ids.length}`);
}

mkdirSync(OUT, { recursive: true });
const misses: string[] = [];
const jobs = [...wanted].filter((a) => headshotOf.has(a) || PROBE);
let got = 0;
await pool(jobs, CONCURRENCY, async (aid) => {
  const file = join(OUT, `${aid}.png`);
  if (existsSync(file)) { got++; return; }
  const ok = await curlFile(headshotOf.get(aid) ?? HEADSHOT(aid), file);
  if (ok) got++; else misses.push(aid);
});
writeFileSync(join(OUT, "misses.json"), JSON.stringify(misses.sort(), null, 1));
console.log(`\nDownloaded/present: ${got}, misses: ${misses.length} (data_process/espn/headshots/misses.json)`);
