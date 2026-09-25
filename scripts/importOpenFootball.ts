/**
 * Imports the open-football seed into FMProject' native data format.
 *
 *   bun scripts/importOpenFootball.ts
 *
 * Reads data_process/openfootball/seed-real.json plus the native squads, calibrates player attributes
 * and club economy against the clubs/players present in both, then wipes squads/ and rewrites it from
 * scratch: the native leagues are copied byte-for-byte from data_process/native (only their `zones`
 * prom/rel entries are regenerated from the country pyramid), and every open-football league is
 * (re)derived on top — squads/of_*, leagueData.json, leagueSchedules.json, countries.json,
 * databases.json, pyramids.json and data_process/openfootball/calibration.json. This produces an
 * intermediate 2024/25 world; scripts/importEspn.ts then moves it to the 2026/27 season (see
 * .claude/rules/data/espn-import.md). All logic lives in scripts/openfootball/.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Seed, SeedClub, SeedLeague, SeedPlayer } from "@/../scripts/openfootball/types";
import { clubId, leagueSlug, normName, unitHash } from "@/../scripts/openfootball/ids";
import { MAX_AGE, buildNamePools, mainRole, trimAndFill, type MainRole, type NamePool } from "@/../scripts/openfootball/roster";
import {
  collectStatPoints, fitLogLine, fitPlayerCoeffs, matchClubsWithOverrides, matchPlayers, matchPlayersByTokenSubset,
} from "@/../scripts/openfootball/calibration";
import {
  ECON_FIELDS, REP_FLOOR_MARGIN, STAT_KEYS, coachName, computeTierMultipliers, deriveClubEconomy, derivePlayer,
  type ClubFits, type EconSample,
} from "@/../scripts/openfootball/derive";
import {
  CONTINENT, OVERLAP, buildCountryEntry, formatSchedules, keptLeagues, scheduleFor, seasonLabel, type Zone,
} from "@/../scripts/openfootball/leagues";
import { buildPyramid, pyramidGroupOf, zonesFromPyramid, type BoundaryOverrides, type PyramidLeague } from "@/../scripts/openfootball/pyramid";
import {
  fitLevelPredictor, predictLevel, quantileTargets, shiftToOverall, type LevelPair, type QuantileInput,
} from "@/../scripts/openfootball/recalibrate";
import type { LeagueScheduleConfig } from "@/Domain/season/leagueScheduleConfig";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";
import { Player } from "@/Domain/Player";
import { getMainRole } from "@/GameInterface/positionHelpers";
import ROLES_JSON from "@/Data/roles.json";
import { checkWorldIntegrity } from "@/../scripts/world/integrity";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OF_DIR = join(ROOT, "data_process", "openfootball");
const NATIVE = join(ROOT, "data_process", "native");
const DATA = join(ROOT, "src", "example_data");
const SQUADS = join(DATA, "squads");
const SOURCE = "open-football";

/** Include brazil_serie_b in the player/club matching (calibration only; economy fits stay top-flight). */
const MATCH_SERIE_B = true;

/** TL leagues: country code and tier (pyramid level; also used by the economy calibration). */
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
  const dir = join(NATIVE, "squads", league);
  return sortedDir(dir).filter((f) => f.endsWith(".json"))
    .map((f) => readJson<TLSquad>(join(dir, f)));
}

const econOf = (s: TLSquad): EconSample => ({
  budget: s.finances!.budget, broadcasting: s.finances!.broadcasting, commercial: s.finances!.commercial,
  followers: s.finances!.followers, capacity: s.venue!.capacity!,
});

// ── 1. Load ─────────────────────────────────────────────────────────────────
const seed = readJson<Seed>(join(OF_DIR, "seed-real.json"));
const tierOverrides = readJson<Record<string, number>>(join(OF_DIR, "tierOverrides.json"));
const tierOf = (l: SeedLeague) => tierOverrides[l.slug] ?? l.tier;
/**
 * Native squad id → seed club id, for genuine same-league name-format misses that `matchClubs`'s
 * normalization can't bridge (e.g. native "Bayern München" vs seed "Bayern Munich" — normName
 * strips the umlaut to "munchen", a different string from "munich"; native "Wolves" vs seed
 * "Wolverhampton Wanderers" share no substring at all). Applied before `matchClubs` per league, for
 * the same seed league the override's target club belongs to — never a cross-league/cross-tier fix
 * (e.g. a native top-flight club whose only seed counterpart sits in a lower division is a genuine
 * season/snapshot difference between the two datasets, not a naming gap, and is left unmatched).
 */
const clubOverrides = readJson<Record<string, string>>(join(OF_DIR, "clubOverrides.json"));
/**
 * Pyramid-only level corrections keyed by leagueData slug (e.g. Russia's B groups sit one level below
 * the A groups). tierOverrides.json (seed slug) still applies first and also drives the economy tier;
 * pyramidOverrides.json only moves a league within the pyramid, so squad economies are unchanged.
 * Its top-level "boundaries" field overrides boundary counts per country ("upperTier-lowerTier"),
 * e.g. Brazil's 4 up / 4 down (see BoundaryOverrides in scripts/openfootball/pyramid.ts).
 */
const pyramidOverridesFile = readJson<Record<string, unknown>>(join(OF_DIR, "pyramidOverrides.json"));
const { boundaries, ...tierEntries } = pyramidOverridesFile;
const boundaryOverrides = (boundaries ?? {}) as BoundaryOverrides;
const pyramidOverrides = tierEntries as Record<string, { tier: number }>;
const pyramidTierOf = (slug: string, tier: number) => pyramidOverrides[slug]?.tier ?? tier;

const clubsByLeague = new Map<string, SeedClub[]>();
for (const c of seed.clubs) clubsByLeague.set(c.league, [...(clubsByLeague.get(c.league) ?? []), c]);
for (const cs of clubsByLeague.values()) cs.sort((a, b) => byStr(a.id, b.id));
const playersByClub = new Map<string, SeedPlayer[]>();
for (const p of seed.players) playersByClub.set(p.clubId, [...(playersByClub.get(p.clubId) ?? []), p]);
for (const ps of playersByClub.values()) ps.sort((a, b) => byStr(a.id, b.id));

const tlSquads = Object.fromEntries(Object.keys(TL_LEAGUES).map((l) => [l, readTLSquads(l)])) as Record<string, TLSquad[]>;

// Validate clubOverrides.json: every native id and seed id must be real, and unknown native ids
// (typos, a renamed squad file) or unknown seed ids must fail loudly rather than silently no-op.
const allNativeSquadIds = new Set(Object.values(tlSquads).flat().map((s) => s.id));
const allSeedClubIds = new Set(seed.clubs.map((c) => c.id));
for (const [nativeId, seedId] of Object.entries(clubOverrides)) {
  if (!allNativeSquadIds.has(nativeId)) throw new Error(`clubOverrides.json: unknown native squad id "${nativeId}"`);
  if (!allSeedClubIds.has(seedId)) throw new Error(`clubOverrides.json: unknown seed club id "${seedId}" (native ${nativeId})`);
}

// ── 2. Calibrate ────────────────────────────────────────────────────────────
const statPairs: Array<{ tl: { stats: Record<string, number> }; seed: SeedPlayer; leagueRep: number }> = [];
/** Native↔seed player pairs kept for the star-level recalibration (section 3.5). One entry per
 *  matched native player; `player` is a live reference into `tlSquads`, mutated in place there. */
interface RecalPair {
  role: MainRole;
  seedOverall: number;
  leagueRep: number;
  player: RosterPlayer & { fullName?: string };
  tlLeague: string;
  squadFileId: string;
  /** The paired seed player — used after `coeffs` is fitted to compute a "shadow of_*" overall
   *  (same derivePlayer() a real of_* player of this exact seed record would get), the quantile
   *  target pool's value source (see the "ceiling" note near section 3.5). */
  seedPlayer: SeedPlayer;
}
const recalPairs: RecalPair[] = [];
/** Extra recal-only pairs found by the token-subset fallback (never fed into statPairs), per role. */
const tokenSubsetExtraByRole: Record<MainRole, number> = { GK: 0, Defender: 0, Midfielder: 0, Forward: 0 };
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
  const clubMap = matchClubsWithOverrides(tlSquads[tlLeague]!, seedClubs, clubOverrides);
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
      const tlPlayer = tlById.get(tid)!;
      const seedPlayer = spById.get(spid)!;
      statPairs.push({ tl: { stats: tlPlayer.stats as unknown as Record<string, number> }, seed: seedPlayer, leagueRep });
      recalPairs.push({
        role: getMainRole(tlPlayer.positions[0] ?? "CM"),
        seedOverall: seedPlayer.overall,
        leagueRep,
        player: tlPlayer,
        tlLeague,
        squadFileId: tl.id,
        seedPlayer,
      });
      players++;
    }
    // Recalibration-only fallback: never feeds statPairs (the of_* attribute fit stays on
    // matchPlayers' exact-key pairs). Catches e.g. native "H. Kane" / fullName "Harry Edward Kane"
    // against seed "Harry Kane" — every seed name token is present in the native's name∪fullName
    // tokens, but the normalized keys never collide so matchPlayers never pairs them.
    const extra = matchPlayersByTokenSubset(
      tl.players.map((p) => ({ id: p.id, name: p.name, fullName: p.fullName, age: p.age })),
      sps.map((p) => ({ id: p.id, name: p.name, age: p.age })),
      pm,
    );
    for (const [tid, spid] of [...extra].sort((a, b) => byStr(a[0], b[0]))) {
      const tlPlayer = tlById.get(tid)!;
      const seedPlayer = spById.get(spid)!;
      const role = getMainRole(tlPlayer.positions[0] ?? "CM");
      recalPairs.push({ role, seedOverall: seedPlayer.overall, leagueRep, player: tlPlayer, tlLeague, squadFileId: tl.id, seedPlayer });
      tokenSubsetExtraByRole[role]++;
    }
  }
  pairCounts[tlLeague] = { clubs: clubPairNames[tlLeague]!.length, players };
}
const totalClubPairs = Object.values(pairCounts).reduce((s, x) => s + x.clubs, 0);
const coeffs = fitPlayerCoeffs(collectStatPoints(statPairs));
/**
 * "Shadow of_*" overall per recal pair: the overall a REAL of_* player would get from this exact
 * seed record (same `derivePlayer` + `coeffs` every of_* player in the world is derived with).
 * Used as the quantile-target VALUE pool in section 3.5, replacing the native player's own
 * pre-existing overall — see the "ceiling" note there for why the native pool is unusable as a
 * value source (only as the z-model's fit target, for ranking).
 */
const shadowOverallOf = new Map<string, number>(
  recalPairs.map((p) => [p.player.id, Player.computeOverallAvg(derivePlayer(p.seedPlayer, "shadow", coeffs, p.leagueRep, { noise: false }))]),
);
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
// src/example_data/squads is pure output: wipe it and start from the native sources.
if (!existsSync(join(NATIVE, "squads"))) throw new Error(`native sources missing: ${join(NATIVE, "squads")}`);
for (const d of sortedDir(SQUADS)) rmSync(join(SQUADS, d), { recursive: true, force: true });
cpSync(join(NATIVE, "squads"), SQUADS, { recursive: true });

// ── 3.5. Recalibrate native stars from the seed ─────────────────────────────
// The native attribute calibration above (statPairs) uses the ORIGINAL native attributes and is
// unaffected by this step. This step only rewrites the level (overall) of native players paired
// with a seed player, keeping their native attribute PROFILE. See
// docs/superpowers/specs/2026-09-25-native-star-recalibration-design.md.
//
// Ceiling note (2026-09-25 second follow-up): the quantile step (below) redistributes an existing
// overall MULTISET by z-rank — it never invents a value the multiset doesn't already contain. The
// z-model (fit against the native players' own pre-existing overall) correctly ranks them: verified
// the top-5 by z per role are the actually-elite seed players (Mbappé/Saka/Haaland/Kane at Forward,
// Van Dijk/Saliba at Defender, Salah/Rice/Rodri at Midfielder, Courtois/Donnarumma/Oblak at GK). But
// the VALUES being redistributed — if sourced from the natives' own pre-recal overall — are capped
// at whatever the single highest pre-existing native overall in that role happens to be, and that
// ceiling is an artifact of the OLD (pre-recalibration, seed-blind) attribute generation: e.g. it
// used to be held by "Yan Diomande" (seedOverall 85) among Forwards purely because his native
// attribute profile scored well under the weighted quadratic mean, nothing to do with real quality
// (he's the same player the original bug report flagged as wrongly ranked #1 in the world). Using
// that pool as the VALUE source would silently re-import the exact bias this feature exists to
// remove, and — since different roles' old ceilings differ for equally arbitrary reasons — would
// also distort cross-role world-ranking comparisons (a correctly-#1-by-z defender capped lower than
// a correctly-#4-by-z forward, for no footballing reason). Fixed below: the quantile VALUE pool is
// `shadowOverallOf` — a "shadow of_*" overall computed via the exact same `derivePlayer` + `coeffs`
// every real of_* player in the world already gets from their seed record — so the ceiling reflects
// this dataset's own seed-calibrated scale instead of the old scheme's noise. The z-model's fit
// still regresses against the native players' own pre-existing overall (kept as-is): even though
// each INDIVIDUAL native overall is an unreliable point estimate, the fitted trend across ~700-1000
// pairs per role still correctly separates elite from average seed players (verified above), so it
// remains a sound RANKING signal — only the old pool's use as a VALUE source was the bug.
const ROLE_ATTR_WEIGHTS = ROLES_JSON as Record<string, { attrWeights?: Record<string, number> }>;
const recalByRole = new Map<MainRole, RecalPair[]>();
for (const p of recalPairs) recalByRole.set(p.role, [...(recalByRole.get(p.role) ?? []), p]);

const nativeOverallBefore = new Map(recalPairs.map((p) => [p.player.id, Player.computeOverallAvg(p.player)]));
const levelPairs: LevelPair[] = recalPairs.map((p) => ({
  role: p.role, seedOverall: p.seedOverall, leagueRep: p.leagueRep, nativeOverall: nativeOverallBefore.get(p.player.id)!,
}));
const levelFits = fitLevelPredictor(levelPairs);

interface RecalRoleReport { role: MainRole; n: number; fit?: { a: number; b: number; c: number; sd: number } }
const recalReport: RecalRoleReport[] = [];
const changedSquads = new Set<string>(); // `${tlLeague}::${squadFileId}`
let recalibratedCount = 0;

for (const [role, group] of recalByRole) {
  const fit = levelFits[role];
  recalReport.push({ role, n: group.length, fit: fit ? { a: fit.a, b: fit.b, c: fit.c, sd: fit.sd } : undefined });
  if (!fit) continue; // fewer than 3 pairs for this role — leave these native players untouched
  const quantileInput: QuantileInput[] = group.map((p) => ({
    id: p.player.id, z: predictLevel(fit, p.seedOverall, p.leagueRep), currentOverall: shadowOverallOf.get(p.player.id)!,
  }));
  const targets = quantileTargets(quantileInput);
  for (const p of group) {
    const target = targets.get(p.player.id)!;
    const specificRole = Player.bestSpecificRole(p.player.stats, p.player.positions[0] ?? "CM");
    const weights = ROLE_ATTR_WEIGHTS[specificRole]?.attrWeights ?? ROLE_ATTR_WEIGHTS.CM!.attrWeights!;
    const overallOf = (s: PlayerStatsRecord) => Player.computeOverallAvg({ ...p.player, stats: s });
    const hashKey = `${p.tlLeague}:${p.squadFileId}:${p.player.id}`;
    p.player.stats = shiftToOverall(hashKey, p.player.stats, weights, target, overallOf);
    delete p.player.overallAvg;
    changedSquads.add(`${p.tlLeague}::${p.squadFileId}`);
    recalibratedCount++;
  }
}

for (const key of changedSquads) {
  const [tlLeague, squadFileId] = key.split("::") as [string, string];
  const squad = tlSquads[tlLeague]!.find((s) => s.id === squadFileId)!;
  writeJson(join(SQUADS, tlLeague, `${squadFileId}.json`), squad, 2);
}

type LeagueEntry = { slug: string; country: string; source?: string; zones?: Zone[]; standings: Array<{ squadId: string }> } & Record<string, unknown>;
type CountryEntry = { slug: string; name: string; iso2: string; source?: string; headline: string } & Record<string, unknown>;
const leagueData = readJson<LeagueEntry[]>(join(NATIVE, "leagueData.json"));
const schedules = readJson<Array<LeagueScheduleConfig & { source?: string }>>(join(NATIVE, "leagueSchedules.json"));
const countriesIn = readJson<Record<string, CountryEntry>>(join(NATIVE, "countries.json"));

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
const pyramidInput: PyramidLeague[] = leagueData.map((l) => {
  const tl = TL_LEAGUES[l.slug];
  if (!tl) throw new Error(`TL league ${l.slug} missing from TL_LEAGUES`);
  return { slug: l.slug, country: l.country, clubs: l.standings.length, tier: pyramidTierOf(l.slug, tl.tier) };
});

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
  pyramidInput.push({ slug, country: countryName, clubs: clubs.length, tier: pyramidTierOf(slug, tier) });
  leagueData.push({
    slug, name: league.name, country: countryName, iso2: code.toUpperCase(), season: seasonLabel(code),
    zones: [], standings, source: SOURCE,
  });
  const idx = indexInCountry.get(code) ?? 0;
  indexInCountry.set(code, idx + 1);
  schedules.push(scheduleFor(slug, code, clubs.length, idx));
}

// ── 5. Pyramids + display zones ─────────────────────────────────────────────
const unknownOverrides = Object.keys(pyramidOverrides).filter((s) => !pyramidInput.some((l) => l.slug === s));
if (unknownOverrides.length) throw new Error(`pyramidOverrides.json: unknown league slugs ${unknownOverrides.join(", ")}`);
const pyramids = buildPyramid(pyramidInput, { boundaries: boundaryOverrides });
// Only prom/rel change; continental zones (ucl/uel/uecl/lib/sud) of TL leagues are kept as they are.
for (const l of leagueData) {
  const g = pyramidGroupOf(pyramids, l.slug);
  if (g) l.zones = zonesFromPyramid(g, l.zones ?? []);
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
writeJson(join(DATA, "pyramids.json"), pyramids, 2);

const totals = checkWorldIntegrity({
  leagueData, schedules, countries,
  pyramids, squadsDir: SQUADS,
  mayHaveHandZones: (l) => l.source !== SOURCE,
});
const worldPlayers = totals.players;

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
console.log("pyramids (league promote/relegate per level; ✓ = boundary sums match):");
for (const p of Object.values(pyramids)) {
  console.log(`  ${p.country}`);
  p.levels.forEach((lv, i) => {
    const next = p.levels[i + 1];
    const down = lv.groups.reduce((s, g) => s + g.relegate, 0);
    const mark = next ? (down === next.groups.reduce((s, g) => s + g.promote, 0) ? " ✓" : " ✗") : "";
    console.log(`    tier ${lv.tier}: ${lv.groups.map((g) => `${g.leagueSlug} ↑${g.promote} ↓${g.relegate}`).join(", ")}${mark}`);
  });
}
console.log(`world: ${leagueData.length} leagues, ${totals.squads} squads, ${worldPlayers} players, ${Object.keys(countries).length} countries`);
console.log("integrity checks passed");

// ── 9. Native star recalibration report ──────────────────────────────────────
console.log("── native star recalibration ──");
console.log("pairs per role (level predictor z = a + b·seedOverall + c·leagueRep, fit vs. native game overall):");
for (const r of recalReport) {
  const fitStr = r.fit ? `a=${r.fit.a.toFixed(4)} b=${r.fit.b.toFixed(4)} c=${r.fit.c.toFixed(4)} sd=${r.fit.sd.toFixed(3)}` : "(no predictor — fewer than 3 pairs)";
  console.log(`  ${r.role.padEnd(11)} pairs ${String(r.n).padStart(4)}  ${fitStr}`);
}
console.log(`native players recalibrated: ${recalibratedCount}  (squad files rewritten: ${changedSquads.size})`);
console.log("extra pairs from the recal-only token-subset fallback (matchPlayersByTokenSubset), per role:");
for (const role of ["GK", "Defender", "Midfielder", "Forward"] as MainRole[]) console.log(`  ${role.padEnd(11)} +${tokenSubsetExtraByRole[role]}`);
const pairedCheck = (needle: string) => {
  // Token-containment, not substring — a native fullName carries extra middle names
  // ("Jude Victor William Bellingham"), so a plain .includes("jude bellingham") never matches.
  const needleTokens = normName(needle).split(" ").filter(Boolean);
  const hit = recalPairs.find((p) => {
    const tokens = new Set(normName(`${p.player.name} ${p.player.fullName ?? ""}`).split(" ").filter(Boolean));
    return needleTokens.every((t) => tokens.has(t));
  });
  return hit ? `paired (seedOverall ${hit.seedOverall}, ${hit.player.name} / ${hit.player.fullName ?? ""})` : "NOT paired";
};
console.log(`  Harry Kane: ${pairedCheck("Harry Kane")}`);
console.log(`  Jude Bellingham: ${pairedCheck("Jude Bellingham")}`);

type WorldRankedPlayer = { id: string; name: string; club: string; league: string; overall: number };
const worldRanked: WorldRankedPlayer[] = [];
for (const leagueSlugDir of sortedDir(SQUADS)) {
  const dirPath = join(SQUADS, leagueSlugDir);
  for (const f of sortedDir(dirPath).filter((x) => x.endsWith(".json"))) {
    const squad = readJson<{ id: string; name: string; players: Array<RosterPlayer & { fullName?: string }> }>(join(dirPath, f));
    for (const p of squad.players) {
      worldRanked.push({ id: p.id, name: p.fullName ?? p.name, club: squad.name, league: leagueSlugDir, overall: Player.computeOverallAvg(p) });
    }
  }
}
worldRanked.sort((a, b) => b.overall - a.overall || byStr(a.id, b.id));
console.log(`top 20 of the world (after recalibration, ${worldRanked.length} players):`);
worldRanked.slice(0, 20).forEach((p, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${p.name.padEnd(28)} ${p.club.padEnd(24)} ${p.overall.toFixed(2)}  (${p.league})`);
});

const findRank = (needle: string): string => {
  const target = normName(needle);
  const idx = worldRanked.findIndex((p) => normName(p.name).includes(target));
  if (idx === -1) return "not found";
  const p = worldRanked[idx]!;
  return `#${idx + 1} (${p.name}, ${p.club}, ${p.overall.toFixed(2)})`;
};
console.log("named stars:");
for (const name of ["Mbappé", "Kane", "Haaland", "Salah", "Vini", "Bellingham", "Yamal", "Wirtz", "Doku", "Diomande"]) {
  console.log(`  ${name.padEnd(12)} ${findRank(name)}`);
}
