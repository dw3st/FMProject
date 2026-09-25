/**
 * Downloads the ESPN snapshot used by importEspn.ts (the only step that touches the network).
 *
 *   bun scripts/fetchEspn.ts
 *
 * For every league in data_process/espn/leagueMap.json: clubs (site API /teams), squads (/teams/{id}/roster)
 * and crests (128 px through the ESPN image resizer, dark variant first). Writes
 * data_process/espn/snapshot.json and data_process/espn/logos/{teamId}.png. Uses curl: Bun's fetch fails
 * against ESPN on Windows.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EspnAthlete, EspnLeague, EspnPos, EspnSnapshot, EspnTeam, LeagueMapEntry } from "@/../scripts/espn/types";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIR = join(ROOT, "data_process", "espn");
const LOGOS = join(DIR, "logos");
const API = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const CONCURRENCY = 8;

async function curlJson(url: string): Promise<any> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const p = Bun.spawn(["curl", "-s", "-f", "--max-time", "30", url], { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(p.stdout).text();
    if ((await p.exited) === 0 && text) return JSON.parse(text);
  }
  throw new Error(`curl failed: ${url}`);
}

async function curlFile(url: string, out: string): Promise<boolean> {
  const p = Bun.spawn(["curl", "-s", "-f", "--max-time", "30", "-o", out, url], { stdout: "ignore", stderr: "ignore" });
  return (await p.exited) === 0 && existsSync(out);
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); }
  }));
  return out;
}

const POS = new Set(["G", "D", "M", "F"]);
function athlete(a: any): EspnAthlete {
  const pos = a.position?.abbreviation;
  return {
    id: String(a.id),
    displayName: String(a.displayName ?? a.fullName ?? ""),
    fullName: String(a.fullName ?? a.displayName ?? ""),
    age: typeof a.age === "number" ? a.age : null,
    position: POS.has(pos) ? (pos as EspnPos) : null,
    citizenship: typeof a.citizenship === "string" ? a.citizenship : null,
  };
}

function logoUrl(t: any): string | null {
  const logos: Array<{ href: string; rel: string[] }> = t.logos ?? [];
  const pick = logos.find((l) => l.rel.includes("dark")) ?? logos.find((l) => l.rel.includes("default")) ?? logos[0];
  if (!pick) return null;
  return `https://a.espncdn.com/combiner/i?img=${new URL(pick.href).pathname}&w=128&h=128`;
}

async function fetchTeam(code: string, t: any): Promise<EspnTeam> {
  const roster = await curlJson(`${API}/${code}/teams/${t.id}/roster`);
  const coach = roster.coach?.[0];
  const url = logoUrl(t);
  const file = `${t.id}.png`;
  const ok = url ? await curlFile(url, join(LOGOS, file)) : false;
  return {
    id: String(t.id),
    name: String(t.displayName),
    shortName: String(t.shortDisplayName ?? t.displayName),
    location: String(t.location ?? ""),
    color: t.color ?? null,
    altColor: t.alternateColor ?? null,
    logoFile: ok ? file : null,
    coach: coach ? `${coach.firstName ?? ""} ${coach.lastName ?? ""}`.trim() || null : null,
    athletes: (roster.athletes ?? []).map(athlete).sort((a: EspnAthlete, b: EspnAthlete) => a.id.localeCompare(b.id, "en", { numeric: true })),
  };
}

const map = JSON.parse(readFileSync(join(DIR, "leagueMap.json"), "utf-8")) as LeagueMapEntry[];
rmSync(LOGOS, { recursive: true, force: true });
mkdirSync(LOGOS, { recursive: true });

const leagues: EspnLeague[] = [];
for (const m of map) {
  const j = await curlJson(`${API}/${m.code}/teams`);
  const lg = j.sports?.[0]?.leagues?.[0];
  const raw = (lg?.teams ?? []).map((x: any) => x.team);
  const teams = await pool(raw, CONCURRENCY, (t) => fetchTeam(m.code, t));
  teams.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  const season = String(lg?.season?.displayName ?? lg?.season?.year ?? "");
  leagues.push({ slug: m.slug, code: m.code, name: String(lg?.name ?? m.code), season, teams });
  const players = teams.reduce((s, t) => s + t.athletes.length, 0);
  const logos = teams.filter((t) => t.logoFile).length;
  console.log(`${m.slug.padEnd(34)} ${m.code.padEnd(6)} clubs ${String(teams.length).padStart(3)}  players ${String(players).padStart(4)}  crests ${logos}`);
}

const snap: EspnSnapshot = { fetchedAt: new Date().toISOString().slice(0, 10), leagues };
writeFileSync(join(DIR, "snapshot.json"), `${JSON.stringify(snap, null, 1)}\n`);
console.log(`snapshot ${snap.fetchedAt}: ${leagues.length} leagues`);
