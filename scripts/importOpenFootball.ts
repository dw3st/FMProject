/**
 * Imports the open-football seed into TouchLines' native data format.
 *
 *   bun scripts/importOpenFootball.ts
 *
 * Reads data_process/openfootball/seed-real.json plus the TL squads, calibrates player attributes and
 * club economy against the clubs/players present in both, then (idempotently) rewrites every
 * open-football league: squads/of_*, leagueData.json, leagueSchedules.json, countries.json,
 * databases.json and data_process/openfootball/calibration.json. All logic lives in scripts/openfootball/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Seed, SeedClub, SeedLeague, SeedPlayer } from "@/../scripts/openfootball/types";
import { clubId, leagueSlug, unitHash } from "@/../scripts/openfootball/ids";
import { MAX_AGE, buildNamePools, mainRole, trimAndFill, type MainRole, type NamePool } from "@/../scripts/openfootball/roster";
import { collectStatPoints, fitLogLine, fitPlayerCoeffs, matchClubs, matchPlayers } from "@/../scripts/openfootball/calibration";
import {
  ECON_FIELDS, REP_FLOOR_MARGIN, STAT_KEYS, coachName, computeTierMultipliers, deriveClubEconomy, derivePlayer,
  type ClubFits, type EconSample,
} from "@/../scripts/openfootball/derive";
import {
  CONTINENT, OVERLAP, buildCountryEntry, formatSchedules, keptLeagues, levelFlags, scheduleFor, seasonLabel, zonesFor,
} from "@/../scripts/openfootball/leagues";
import type { LeagueScheduleConfig } from "@/Domain/season/leagueScheduleConfig";
import type { RosterPlayer } from "@/types/playerTypes";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OF_DIR = join(ROOT, "data_process", "openfootball");
const DATA = join(ROOT, "src", "example_data");
const SQUADS = join(DATA, "squads");
const SOURCE = "open-football";

/** Include brazil_serie_b in the player/club matching (calibration only; economy fits stay top-flight). */
const MATCH_SERIE_B = true;

/** TL leagues: country code and tier, for the zones of new leagues in the same country. */
const TL_LEAGUES: Record<string, { code: string; tier: number }> = {
  premier_league: { code: "gb", tier: 1 }, bundesliga: { code: "de", tier: 1 }, la_liga: { code: "es", tier: 1 },
  serie_a: { code: "it", tier: 1 }, ligue_1: { code: "fr", tier: 1 }, brazil_serie_a: { code: "br", tier: 1 },
  brazil_serie_b: { code: "br", tier: 2 }, brazil_serie_c: { code: "br", tier: 3 },
};

interface TLSquad {
  id: string; name: string; source?: string;
  venue?: { capacity?: number };
  finances?: { budget: number; broadcasting: number; commercial: number; followers: number };
  players: Array<RosterPlayer & { fullName?: string }>;
}

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf-8")) as T;
const writeJson = (p: string, v: unknown, indent: number) => writeFileSync(p, `${JSON.stringify(v, null, indent)}\n`);
const sortedDir = (p: string) => readdirSync(p).sort();
const byStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const median = (xs: number[]) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

function readTLSquads(league: string): TLSquad[] {
  const dir = join(SQUADS, league);
  return sortedDir(dir).filter((f) => f.endsWith(".json"))
    .map((f) => readJson<TLSquad>(join(dir, f)))
    .filter((s) => s.source !== SOURCE);
}

const econOf = (s: TLSquad): EconSample => ({
  budget: s.finances!.budget, broadcasting: s.finances!.broadcasting, commercial: s.finances!.commercial,
  followers: s.finances!.followers, capacity: s.venue!.capacity!,
});

// ── 1. Load ─────────────────────────────────────────────────────────────────
const seed = readJson<Seed>(join(OF_DIR, "seed-real.json"));
const tierOverrides = readJson<Record<string, number>>(join(OF_DIR, "tierOverrides.json"));
const tierOf = (l: SeedLeague) => tierOverrides[l.slug] ?? l.tier;

const clubsByLeague = new Map<string, SeedClub[]>();
for (const c of seed.clubs) clubsByLeague.set(c.league, [...(clubsByLeague.get(c.league) ?? []), c]);
for (const cs of clubsByLeague.values()) cs.sort((a, b) => byStr(a.id, b.id));
const playersByClub = new Map<string, SeedPlayer[]>();
for (const p of seed.players) playersByClub.set(p.clubId, [...(playersByClub.get(p.clubId) ?? []), p]);
for (const ps of playersByClub.values()) ps.sort((a, b) => byStr(a.id, b.id));

const tlSquads = Object.fromEntries(Object.keys(TL_LEAGUES).map((l) => [l, readTLSquads(l)])) as Record<string, TLSquad[]>;

// ── 2. Calibrate ────────────────────────────────────────────────────────────
const statPairs: Array<{ tl: { stats: Record<string, number> }; seed: SeedPlayer; leagueRep: number }> = [];
const seedLeagueBySlug = new Map(seed.leagues.map((l) => [l.slug, l]));
/** Seed league reputation on the /1000 scale used as the second calibration covariate. */
const leagueRepOf = (seedSlug: string) => seedLeagueBySlug.get(seedSlug)!.reputation / 1000;
const econPairs: Array<{ rep: number; econ: EconSample }> = [];
const pairCounts: Record<string, { clubs: number; players: number }> = {};
const clubPairNames: Record<string, string[]> = {};
for (const seedSlug of Object.keys(OVERLAP).sort()) {
  const tlLeague = OVERLAP[seedSlug]!;
  const topFlight = TL_LEAGUES[tlLeague]!.tier === 1;
  if (!topFlight && !MATCH_SERIE_B) continue;
  const seedClubs = clubsByLeague.get(seedSlug) ?? [];
  const leagueRep = leagueRepOf(seedSlug);
  const seedById = new Map(seedClubs.map((c) => [c.id, c]));
  const clubMap = matchClubs(tlSquads[tlLeague]!, seedClubs);
  let players = 0;
  clubPairNames[tlLeague] = [];
  for (const tl of tlSquads[tlLeague]!) {
    const sid = clubMap.get(tl.id);
    if (!sid) continue;
    const sc = seedById.get(sid)!;
    clubPairNames[tlLeague]!.push(`${tl.name} ↔ ${sc.name}`);
    if (topFlight) econPairs.push({ rep: sc.reputation, econ: econOf(tl) });
    const sps = playersByClub.get(sid) ?? [];
    const spById = new Map(sps.map((p) => [p.id, p]));
    const pm = matchPlayers(
      tl.players.map((p) => ({ id: p.id, name: p.name, fullName: p.fullName, age: p.age })),
      sps.map((p) => ({ id: p.id, name: p.name, age: p.age })),
    );
    const tlById = new Map(tl.players.map((p) => [p.id, p]));
    for (const [tid, spid] of [...pm].sort((a, b) => byStr(a[0], b[0]))) {
      statPairs.push({ tl: { stats: tlById.get(tid)!.stats as unknown as Record<string, number> }, seed: spById.get(spid)!, leagueRep });
      players++;
    }
  }
  pairCounts[tlLeague] = { clubs: clubPairNames[tlLeague]!.length, players };
}
const totalClubPairs = Object.values(pairCounts).reduce((s, x) => s + x.clubs, 0);
const coeffs = fitPlayerCoeffs(collectStatPoints(statPairs));
const clubFits: ClubFits = {
  ...(Object.fromEntries(ECON_FIELDS.map((k) => [k, fitLogLine(econPairs.map((p) => [p.rep, p.econ[k]]))])) as Omit<ClubFits, "repMax">),
  repMax: Math.max(...econPairs.map((p) => p.rep)),
};
const tierMult = computeTierMultipliers({
  fits: clubFits,
  seedSerieBReputations: (clubsByLeague.get("brazilian-serie-b") ?? []).map((c) => c.reputation),
  tlSerieB: tlSquads.brazil_serie_b!.map(econOf),
  tlSerieC: tlSquads.brazil_serie_c!.map(econOf),
});
writeJson(join(OF_DIR, "calibration.json"), {
  pairs: { players: statPairs.length, clubs: totalClubPairs, economyClubs: econPairs.length, byLeague: pairCounts, matchSerieB: MATCH_SERIE_B },
  playerCoeffs: coeffs,
  leagueRepFloor: coeffs.repMin - REP_FLOOR_MARGIN,
  clubFits,
  tierMultipliers: tierMult,
  tierOverrides,
}, 2);

// ── 3. Clean previous runs ──────────────────────────────────────────────────
for (const d of sortedDir(SQUADS)) if (d.startsWith("of_")) rmSync(join(SQUADS, d), { recursive: true, force: true });
const isOF = (x: { slug: string; source?: string }) => x.slug.startsWith("of_") || x.source === SOURCE;
type LeagueEntry = { slug: string; country: string; source?: string; standings: Array<{ squadId: string }> } & Record<string, unknown>;
type CountryEntry = { slug: string; name: string; iso2: string; source?: string; headline: string } & Record<string, unknown>;
const leagueData = readJson<LeagueEntry[]>(join(DATA, "leagueData.json")).filter((l) => !isOF(l));
const schedules = readJson<Array<LeagueScheduleConfig & { source?: string }>>(join(DATA, "leagueSchedules.json")).filter((s) => !isOF(s));
const countriesIn = readJson<Record<string, CountryEntry>>(join(DATA, "countries.json"));

// ── 4. Generate leagues ─────────────────────────────────────────────────────
const clubCounts = new Map([...clubsByLeague].map(([k, v]) => [k, v.length]));
const kept = keptLeagues(seed.leagues, clubCounts)
  .sort((a, b) => byStr(a.country, b.country) || tierOf(a) - tierOf(b) || byStr(a.slug, b.slug));
const pools = buildNamePools(seed.players);
const EMPTY_POOL: NamePool = { first: [], last: [] };
const countryNames = new Map<string, string>();
const newSummary: Array<{ tier: number; budget: number; capacity: number }> = [];
const newPlayers: Array<{ role: MainRole; overall: number; league: string; stats: Record<string, number> }> = [];
let youthCount = 0;
let missingPools = 0;
const indexInCountry = new Map<string, number>();
for (const { code } of Object.values(TL_LEAGUES)) indexInCountry.set(code, (indexInCountry.get(code) ?? 0) + 1);

for (const league of kept) {
  const slug = leagueSlug(league.slug);
  const tier = tierOf(league);
  const code = league.country;
  const countryName = league.countryName;
  countryNames.set(code, countryName);
  const pool = pools.get(code) ?? (missingPools++, EMPTY_POOL);
  const clubs = clubsByLeague.get(league.slug)!;
  mkdirSync(join(SQUADS, slug), { recursive: true });
  const standings = [];
  for (const club of clubs) {
    const id = clubId(club.id);
    const roster = trimAndFill(playersByClub.get(club.id) ?? [], club.id, pool, code);
    youthCount += roster.filter((p) => p.id.startsWith(`${club.id}-youth-`)).length;
    const players = roster.map((p) => derivePlayer(p, id, coeffs, league.reputation / 1000));
    roster.forEach((p, i) => newPlayers.push({ role: mainRole(p.position), overall: p.overall, league: slug, stats: players[i]!.stats as unknown as Record<string, number> }));
    const econ = deriveClubEconomy(club.reputation, tier, clubFits, tierMult);
    newSummary.push({ tier, budget: econ.finances.budget, capacity: econ.capacity });
    const colors: [string, string] = club.colorBg && club.colorFg ? [club.colorBg, club.colorFg] : ["#555555", "#FFFFFF"];
    const squad = {
      id, slug: id, name: club.name, colors, country: countryName,
      venue: { name: `${club.name} Stadium`, city: null, capacity: econ.capacity, surface: "grass" },
      coach: { id: Math.floor(unitHash(club.id) * 1e9), name: coachName(club.id, pool), firstname: null, lastname: null, age: null, nationality: null, points: 0 },
      finances: econ.finances,
      source: SOURCE,
      players,
    };
    writeFileSync(join(SQUADS, slug, `${id}.json`), JSON.stringify(squad));
    standings.push({ squadId: id, slug: id, name: club.name, colors, country: countryName });
  }
  const countryTiers = [
    ...kept.filter((l) => l.country === code).map(tierOf),
    ...Object.values(TL_LEAGUES).filter((t) => t.code === code).map((t) => t.tier),
  ];
  leagueData.push({
    slug, name: league.name, country: countryName, iso2: code.toUpperCase(), season: seasonLabel(code),
    zones: zonesFor({ clubs: clubs.length, ...levelFlags(tier, countryTiers) }), standings, source: SOURCE,
  });
  const idx = indexInCountry.get(code) ?? 0;
  indexInCountry.set(code, idx + 1);
  schedules.push(scheduleFor(slug, code, clubs.length, idx));
}

// ── 6. Countries ────────────────────────────────────────────────────────────
const countries: Record<string, CountryEntry> = {};
for (const [key, c] of Object.entries(countriesIn)) {
  if (c.source === SOURCE) continue;
  const { headline, playable: _p, continent: _c, ...rest } = c;
  countries[key] = { ...rest, playable: true, continent: CONTINENT[c.iso2.toLowerCase()] ?? "Other", headline } as CountryEntry;
}
for (const [code, name] of [...countryNames].sort((a, b) => byStr(a[0], b[0]))) {
  if (countries[name]) continue;
  countries[name] = { ...buildCountryEntry(code, name), source: SOURCE };
}

// ── 7. Write + databases.json ───────────────────────────────────────────────
writeJson(join(DATA, "leagueData.json"), leagueData, 2);
writeFileSync(join(DATA, "leagueSchedules.json"), formatSchedules(schedules.map(({ source: _s, ...e }) => e)));
writeJson(join(DATA, "countries.json"), countries, 4);

// Integrity checks (also collect world totals).
const squadIds = new Set<string>();
const playerIds = new Set<string>();
let worldPlayers = 0;
for (const l of leagueData) {
  for (const st of l.standings) {
    const f = join(SQUADS, l.slug, `${st.squadId}.json`);
    if (!existsSync(f)) throw new Error(`integrity: ${l.slug} standings squadId ${st.squadId} has no file`);
  }
  for (const f of sortedDir(join(SQUADS, l.slug))) {
    const s = readJson<TLSquad>(join(SQUADS, l.slug, f));
    if (squadIds.has(s.id)) throw new Error(`integrity: duplicate squad id ${s.id}`);
    squadIds.add(s.id);
    for (const p of s.players) {
      if (playerIds.has(p.id)) throw new Error(`integrity: duplicate player id ${p.id} (${l.slug}/${s.id})`);
      playerIds.add(p.id);
    }
    worldPlayers += s.players.length;
  }
  if (!countries[l.country]) throw new Error(`integrity: league ${l.slug} country ${l.country} missing from countries.json`);
  if (!schedules.some((s) => s.slug === l.slug)) throw new Error(`integrity: league ${l.slug} has no schedule in leagueSchedules.json`);

  // Zones must fit the league: top ranges inside 1..clubs, bottom ranges inside the
  // table, and no position in both a top zone and a bottom zone.
  const clubs = l.standings.length;
  const zones = (l.zones ?? []) as Array<{ id: string; from?: number; to?: number; fromEnd?: number }>;
  let lastTop = 0;
  let firstBottom = clubs + 1;
  for (const z of zones) {
    if (z.fromEnd !== undefined) {
      if (!Number.isInteger(z.fromEnd) || z.fromEnd < 1 || z.fromEnd > clubs)
        throw new Error(`integrity: ${l.slug} zone ${z.id} fromEnd ${z.fromEnd} outside 1..${clubs}`);
      firstBottom = Math.min(firstBottom, clubs - z.fromEnd + 1);
    } else {
      const { from, to } = z;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from! < 1 || to! < from! || to! > clubs)
        throw new Error(`integrity: ${l.slug} zone ${z.id} range ${from}..${to} outside 1..${clubs}`);
      lastTop = Math.max(lastTop, to!);
    }
  }
  if (lastTop >= firstBottom)
    throw new Error(`integrity: ${l.slug} top zones reach ${lastTop} but bottom zones start at ${firstBottom} (${clubs} clubs)`);
}
for (const [name, c] of Object.entries(countries)) {
  if (typeof c.flag !== "string" || c.flag === "") throw new Error(`integrity: country ${name} has no flag`);
  if (typeof c.continent !== "string" || c.continent === "") throw new Error(`integrity: country ${name} has no continent`);
}

const dbPath = join(DATA, "databases.json");
const databases = readJson<Array<Record<string, unknown>>>(dbPath);
const official = databases.find((d) => d.id === "official-2024");
if (!official) throw new Error("databases.json: official-2024 missing");
const scheduled = new Set(schedules.map((s) => s.slug));
Object.assign(official, {
  countries: Object.keys(countries).length,
  playableCountries: Object.values(countries).filter((c) => c.playable).length,
  leagues: leagueData.length,
  playableLeagues: leagueData.filter((l) => scheduled.has(l.slug)).length,
  players: worldPlayers,
});
writeJson(dbPath, databases, 2);

// ── 8. Summary ──────────────────────────────────────────────────────────────
const f2 = (x: number) => x.toFixed(2);
const roleMeans = (ps: Array<{ role: string; stats: Record<string, number> }>) => {
  const out: Record<string, string> = {};
  for (const role of ["GK", "Defender", "Midfielder", "Forward"]) {
    const rs = ps.filter((p) => p.role === role);
    const mean = rs.reduce((s, p) => s + STAT_KEYS.reduce((t, k) => t + p.stats[k]!, 0) / STAT_KEYS.length, 0) / rs.length;
    out[role] = `${f2(mean)} (n=${rs.length})`;
  }
  return out;
};
const tlPlayers = Object.values(tlSquads).flat().flatMap((s) => s.players.map((p) => ({ role: p.positions[0]!, stats: p.stats as unknown as Record<string, number> })));
const overalls = newPlayers.map((p) => p.overall);
const outfieldMean = (ps: Array<{ role: string; stats: Record<string, number> }>) => {
  const rs = ps.filter((p) => p.role !== "GK");
  return rs.reduce((s, p) => s + STAT_KEYS.reduce((t, k) => t + p.stats[k]!, 0) / STAT_KEYS.length, 0) / rs.length;
};
// Calibration fit check: re-derive every seed player of each TL-overlap league with the fitted coeffs.
const tlSeedSlug = Object.fromEntries(Object.entries(OVERLAP).map(([s, t]) => [t, s]));
const rederived = (tlLeague: string) => {
  const s = tlSeedSlug[tlLeague];
  if (!s) return NaN;
  const ps = (clubsByLeague.get(s) ?? []).flatMap((c) => (playersByClub.get(c.id) ?? []).filter((p) => p.age <= MAX_AGE))
    .map((p) => ({ role: mainRole(p.position), stats: derivePlayer(p, "check", coeffs, leagueRepOf(s)).stats as unknown as Record<string, number> }));
  return ps.length ? outfieldMean(ps) : NaN;
};
const repFloor = coeffs.repMin - REP_FLOOR_MARGIN;
const SAMPLE_NEW = ["of_championship", "of_eredivisie", "of_portuguese_primeira_liga", "of_spanish_second_division", "of_uruguayan_second_division", "of_italian_serie_c_a", "of_albanian_superleague", "of_fijian_premier_league"];

console.log("── open-football import ──");
console.log(`calibration pairs: players ${statPairs.length}, clubs ${totalClubPairs} (economy fit: ${econPairs.length} top-flight clubs, repMax ${clubFits.repMax})`);
for (const [l, c] of Object.entries(pairCounts)) console.log(`  ${l.padEnd(16)} clubs ${String(c.clubs).padStart(3)}  players ${String(c.players).padStart(4)}`);
console.log(`  brazil_serie_b club pairs: ${clubPairNames.brazil_serie_b?.join("; ") ?? "(not matched)"}`);
console.log(`leagues: ${kept.length}   clubs: ${newSummary.length}   players: ${newPlayers.length}   youth generated: ${youthCount}${missingPools ? `   leagues without name pool: ${missingPools}` : ""}`);
console.log(`OVR range (new): ${Math.min(...overalls)}–${Math.max(...overalls)}`);
console.log("mean of 13 attributes by role — new leagues:", roleMeans(newPlayers));
console.log("mean of 13 attributes by role — TL leagues: ", roleMeans(tlPlayers));
console.log(`league-rep covariate: calibration range ${coeffs.repMin}–${coeffs.repMax}, floor ${repFloor.toFixed(1)} (repMin − ${REP_FLOOR_MARGIN}); ${kept.filter((l) => l.reputation / 1000 < repFloor).length} new leagues clamped up to the floor`);
console.log("outfield mean 13-stat average per league (TL actual | TL re-derived from seed):");
for (const l of Object.keys(TL_LEAGUES)) {
  const actual = outfieldMean(tlSquads[l]!.flatMap((s) => s.players.map((p) => ({ role: p.positions[0]!, stats: p.stats as unknown as Record<string, number> }))));
  const re = rederived(l);
  const rs = tlSeedSlug[l] ? ` rep ${leagueRepOf(tlSeedSlug[l]!).toFixed(2)}` : "";
  console.log(`  ${l.padEnd(34)} ${f2(actual)} | ${Number.isNaN(re) ? "  — " : f2(re)}${rs}`);
}
console.log("outfield mean 13-stat average per league (new, sample):");
for (const l of SAMPLE_NEW) {
  const sl = kept.find((k) => leagueSlug(k.slug) === l);
  if (!sl) { console.log(`  ${l.padEnd(34)} (not generated)`); continue; }
  console.log(`  ${l.padEnd(34)} ${f2(outfieldMean(newPlayers.filter((p) => p.league === l)))}  rep ${(sl.reputation / 1000).toFixed(2)} tier ${tierOf(sl)}`);
}
console.log("tier multipliers:");
for (const k of ECON_FIELDS) console.log(`  ${k.padEnd(13)} t2 ${tierMult[k][2]!.toFixed(3)}  t3 ${tierMult[k][3]!.toFixed(3)}`);
console.log("economy medians (budget / capacity):");
const fmtM = (x: number) => `${(x / 1e6).toFixed(1)}M`;
for (const t of [...new Set(newSummary.map((x) => x.tier))].sort()) {
  const rs = newSummary.filter((x) => x.tier === t);
  console.log(`  new tier ${t} (${String(rs.length).padStart(3)} clubs)  ${fmtM(median(rs.map((x) => x.budget))).padStart(7)} / ${Math.round(median(rs.map((x) => x.capacity)))}`);
}
for (const l of ["brazil_serie_a", "brazil_serie_b", "brazil_serie_c"]) {
  const es = tlSquads[l]!.map(econOf);
  console.log(`  TL ${l.padEnd(15)}(${String(es.length).padStart(3)} clubs)  ${fmtM(median(es.map((x) => x.budget))).padStart(7)} / ${Math.round(median(es.map((x) => x.capacity)))}`);
}
console.log(`world: ${leagueData.length} leagues, ${squadIds.size} squads, ${worldPlayers} players, ${Object.keys(countries).length} countries`);
console.log("integrity checks passed");
