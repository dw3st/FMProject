/**
 * Applies the ESPN snapshot on top of the world produced by importOpenFootball.ts.
 *
 *   bun scripts/importOpenFootball.ts && bun scripts/importEspn.ts
 *
 * Reads data_process/espn/{snapshot,leagueMap,clubOverrides,playerOverrides}.json and src/example_data,
 * runs applyEspn (scripts/espn/apply.ts) and rewrites squads/, leagueData.json, leagueSchedules.json,
 * pyramids.json, databases.json, logoIndex.json and logos/espn/. Fails when the world is already on 2026+.
 *
 * Precondition: src/Data must already mirror src/example_data (`cp -R src/example_data/. src/Data/`) —
 * Player reads roles.json from src/Data at runtime, and this script checks the two copies match before
 * doing anything else. On failure, rerun the whole chain (importOpenFootball → importEspn).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyEspn, type World } from "@/../scripts/espn/apply";
import { ESPN_LOGO_DIR, buildLogoIndex } from "@/../scripts/espn/logos";
import type { EspnSnapshot, LeagueMapEntry } from "@/../scripts/espn/types";
import { formatSchedules } from "@/../scripts/openfootball/leagues";
import { MIN_BY_ROLE, MIN_SQUAD } from "@/../scripts/openfootball/roster";
import type { BoundaryOverrides } from "@/../scripts/openfootball/pyramid";
import { checkWorldIntegrity } from "@/../scripts/world/integrity";
import type { LeagueEntry, SquadFile } from "@/../scripts/world/types";
import ROLES from "@/example_data/roles.json";
import { Player } from "@/Domain/Player";
import type { LeagueScheduleConfig } from "@/Domain/season/leagueScheduleConfig";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { Pyramids } from "@/types/pyramidTypes";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ESPN = join(ROOT, "data_process", "espn");
const DATA = join(ROOT, "src", "example_data");
const SQUADS = join(DATA, "squads");
const LOGOS = join(DATA, "logos");

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf-8")) as T;
const writeJson = (p: string, v: unknown, indent: number) => writeFileSync(p, `${JSON.stringify(v, null, indent)}\n`);

// ── Precondition: src/Data must mirror src/example_data ─────────────────────
const runtimeRolesPath = join(ROOT, "src", "Data", "roles.json");
if (!existsSync(runtimeRolesPath) || readFileSync(runtimeRolesPath, "utf-8") !== readFileSync(join(DATA, "roles.json"), "utf-8"))
  throw new Error("src/Data is out of sync — run cp -R src/example_data/. src/Data/ first");

// ── Load ────────────────────────────────────────────────────────────────────
const snap = readJson<EspnSnapshot>(join(ESPN, "snapshot.json"));
const leagueMap = readJson<LeagueMapEntry[]>(join(ESPN, "leagueMap.json"));
const clubOverrides = readJson<Record<string, string>>(join(ESPN, "clubOverrides.json"));
const playerOverrides = readJson<Record<string, string>>(join(ESPN, "playerOverrides.json"));
const { boundaries } = readJson<{ boundaries?: BoundaryOverrides }>(join(ROOT, "data_process", "openfootball", "pyramidOverrides.json"));
for (const m of leagueMap) if (!snap.leagues.some((l) => l.slug === m.slug)) throw new Error(`snapshot has no league ${m.slug} — run fetchEspn.ts`);

const leagues = readJson<LeagueEntry[]>(join(DATA, "leagueData.json"));
const squads = new Map<string, SquadFile[]>();
for (const l of leagues) {
  const dir = join(SQUADS, l.slug);
  if (!existsSync(dir)) throw new Error(`importEspn: leagueData has ${l.slug} but squads/${l.slug} is missing`);
  squads.set(l.slug, readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => readJson<SquadFile>(join(dir, f))));
}
const world: World = {
  leagues,
  squads,
  schedules: readJson<LeagueScheduleConfig[]>(join(DATA, "leagueSchedules.json")),
  pyramids: readJson<Pyramids>(join(DATA, "pyramids.json")),
};

// ── Apply ───────────────────────────────────────────────────────────────────
const R = ROLES as Record<string, { attrWeights?: Record<string, number> }>;
const { world: out, report, espnLogoOf, nativeLeagueOf } = applyEspn(world, snap, {
  leagueMap, clubOverrides, playerOverrides, boundaries: boundaries ?? {},
  roleWeights: (p) => R[Player.bestSpecificRole(p.stats, p.positions[0] ?? "CM")]?.attrWeights ?? {},
  overall: (p) => Player.computeOverallAvg(p),
});

// ── Validate before writing anything (only needs `out`) ─────────────────────
const allSquads = [...out.squads.values()].flat();
for (const s of allSquads) {
  if (s.players.length < MIN_SQUAD) throw new Error(`integrity: ${s.id} has ${s.players.length} players`);
  for (const line of ["GK", "Defender", "Midfielder", "Forward"] as const) {
    const n = s.players.filter((p) => getMainRole(p.positions[0] ?? "") === line).length;
    if (n < MIN_BY_ROLE[line]) throw new Error(`integrity: ${s.id} has ${n} ${line}`);
  }
}

// ── Write ───────────────────────────────────────────────────────────────────
for (const d of readdirSync(SQUADS)) rmSync(join(SQUADS, d), { recursive: true, force: true });
for (const [slug, ss] of out.squads) {
  mkdirSync(join(SQUADS, slug), { recursive: true });
  for (const s of ss) writeFileSync(join(SQUADS, slug, `${s.id}.json`), JSON.stringify(s));
}
writeJson(join(DATA, "leagueData.json"), out.leagues, 2);
writeFileSync(join(DATA, "leagueSchedules.json"), formatSchedules(out.schedules));
writeJson(join(DATA, "pyramids.json"), out.pyramids, 2);

// Crests: logos/espn/{squadId}.png for clubs without a native crest, plus the index.
const nativeFiles = new Set<string>();
for (const dirent of readdirSync(LOGOS, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const d = dirent.name;
  if (d === ESPN_LOGO_DIR) continue;
  for (const f of readdirSync(join(LOGOS, d))) nativeFiles.add(`${d}/${f.replace(/\.(svg|png)$/i, "")}`);
}
const missingLogos = [...espnLogoOf.entries()].filter(([, file]) => !existsSync(join(ESPN, "logos", file)));
if (missingLogos.length > 0) {
  console.warn(`WARNING: ${missingLogos.length} club logoFile(s) set but missing on disk (data_process/espn/logos/):`);
  for (const [id, file] of missingLogos) console.warn(`  ${id} → ${file}`);
}
const index = buildLogoIndex(
  allSquads.map((s) => ({ id: s.id, slug: s.slug, nativeLeague: nativeLeagueOf.get(s.id) ?? null })),
  nativeFiles,
  new Set([...espnLogoOf.keys()].filter((id) => existsSync(join(ESPN, "logos", espnLogoOf.get(id)!)))),
);
rmSync(join(LOGOS, ESPN_LOGO_DIR), { recursive: true, force: true });
mkdirSync(join(LOGOS, ESPN_LOGO_DIR), { recursive: true });
for (const [id, path] of Object.entries(index))
  if (path.startsWith(`${ESPN_LOGO_DIR}/`)) copyFileSync(join(ESPN, "logos", espnLogoOf.get(id)!), join(LOGOS, ESPN_LOGO_DIR, `${id}.png`));
writeJson(join(DATA, "logoIndex.json"), index, 2);

// ── Integrity ───────────────────────────────────────────────────────────────
const countries = readJson<Record<string, { flag?: unknown; continent?: unknown; playable?: boolean }>>(join(DATA, "countries.json"));
const totals = checkWorldIntegrity({
  leagueData: out.leagues, schedules: out.schedules, countries, pyramids: out.pyramids, squadsDir: SQUADS,
  mayHaveHandZones: (l) => l.source !== "open-football",
});

// ── databases.json ──────────────────────────────────────────────────────────
/** "2026-09-25" → "Sep 25, 2026" — same human format the database has always used. UTC so a
 *  date-only string doesn't shift a day depending on the machine's local timezone. */
const humanDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const dbPath = join(DATA, "databases.json");
const databases = readJson<Array<Record<string, unknown>>>(dbPath);
const official = databases.find((d) => d.id === "official-2024");
if (!official) throw new Error("databases.json: official-2024 missing");
Object.assign(official, {
  name: "Official 2026/27",
  startDate: "July 1, 2026",
  lastUpdated: humanDate(snap.fetchedAt),
  leagues: out.leagues.length,
  playableLeagues: out.leagues.filter((l) => out.schedules.some((s) => s.slug === l.slug)).length,
  countries: new Set(out.leagues.map((l) => l.country)).size,
  playableCountries: Object.values(countries).filter((c) => c.playable).length,
  players: totals.players,
});
writeJson(dbPath, databases, 2);

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`── ESPN import (snapshot ${snap.fetchedAt}) ──`);
console.log(`leagues applied ${report.appliedLeagues.length}, skipped ${report.skippedLeagues.length}${report.skippedLeagues.length ? ` (${report.skippedLeagues.join(", ")})` : ""}`);
console.log(`clubs by match: ${JSON.stringify(report.clubsBy)}`);

console.log(`fuzzy club matches (${report.fuzzyClubs.length}) — worth a human glance, not necessarily wrong:`);
for (const c of report.fuzzyClubs) console.log(`  ${c.via.padEnd(6)} ${c.espnName.padEnd(28)} → ${c.worldName.padEnd(28)} (${c.squadId}, ${c.league})`);

console.log(`new clubs (${report.newClubs.length}) — check each one against the world and add clubOverrides when it already exists:`);
for (const c of report.newClubs) console.log(`  ${c.id.padEnd(12)} ${c.name.padEnd(32)} → ${c.league}`);

console.log(`suspect new clubs (${report.suspectNewClubs.length}) — mostly built from one displaced/removed club; likely needs a clubOverrides entry "<espnTeamId>": "<fromSquadId>":`);
for (const c of report.suspectNewClubs) {
  const espnId = c.newId.startsWith("es_") ? c.newId.slice(3) : c.newId;
  console.log(`  ${espnId.padEnd(10)} ${c.espnName.padEnd(28)} (${c.league.padEnd(24)}) ← ${c.fromName.padEnd(28)} (${c.fromSquadId})  ${(c.share * 100).toFixed(0)}%`);
}

console.log(`moved clubs (${report.movedClubs.length}):`);
for (const m of report.movedClubs) console.log(`  ${m.squadId.padEnd(28)} ${m.from} → ${m.to}`);
console.log(`removed clubs (${report.removedClubs.length}): ${report.removedClubs.join(", ")}`);

console.log(`duplicate ESPN athletes (${report.duplicateAthletes.length}) — listed at more than one team, kept at the first:`);
for (const d of report.duplicateAthletes.slice(0, 10)) console.log(`  ${d.athleteId.padEnd(10)} kept ${d.keptTeam.padEnd(24)} dropped ${d.droppedTeam}`);
if (report.duplicateAthletes.length > 10) console.log(`  … and ${report.duplicateAthletes.length - 10} more`);

console.log("players matched / created per league (low match rate = check playerOverrides):");
for (const p of report.playersByLeague) {
  const rate = p.matched / Math.max(1, p.matched + p.created);
  console.log(`  ${p.league.padEnd(34)} ${String(p.matched).padStart(4)} / ${String(p.created).padStart(4)}  ${(rate * 100).toFixed(0)}%${rate < 0.5 ? "  ⚠" : ""}`);
}
console.log(`youth added: ${report.youthAdded}`);
console.log(`players removed: ${report.playersRemoved.unmatchedInCoveredClubs} unmatched in covered clubs, ${report.playersRemoved.inRemovedClubs} in removed clubs, ${report.playersRemoved.trimmed} trimmed over squad max`);

console.log(`typical ESPN−world age gap: ${report.typicalGap} (used to age a null-age match / non-covered clubs)`);
console.log("age gap histogram (gap: count):");
const gaps = Object.keys(report.ageGapHistogram).map(Number).sort((a, b) => a - b);
console.log(`  ${gaps.map((g) => `${g >= 0 ? "+" : ""}${g}: ${report.ageGapHistogram[g]}`).join(", ")}`);

console.log("mean overall by age, all players (before → after):");
for (const b of report.overallByAge) console.log(`  ${b.band.padEnd(6)} ${b.before.toFixed(2)} → ${b.after.toFixed(2)}`);
console.log("mean overall by age, matched players only (before → after):");
for (const b of report.overallByAgeMatched) console.log(`  ${b.band.padEnd(6)} ${b.before.toFixed(2)} → ${b.after.toFixed(2)}`);

console.log(`world: ${out.leagues.length} leagues, ${totals.squads} squads, ${totals.players} players, ${Object.keys(index).length} crests`);
console.log("integrity checks passed");
