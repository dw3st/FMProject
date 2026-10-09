/**
 * Referees I/O (`.claude/rules/game/referees.md`): the world pool (`saves/{id}/referees/pool.json`), the day's
 * appointments and the season stats (`state.json`), the season archives. All logic is pure in `src/Domain/referees`.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import countriesRaw from "@/Data/countries.json";
import { addDays, addOneDay } from "@/Domain/dates";
import { assignDay, fixtureKey, matchImportance, type DayMatch, type ImportanceInput } from "@/Domain/referees/assign";
import { ageOn, buildCountryPool, countrySlug, renewCountryPool, type RealReferee } from "@/Domain/referees/pool";
import { closeCountrySeason, emptyRefereeState, pruneRefereeState, recordMatches } from "@/Domain/referees/stats";
import { strictnessBand } from "@/Domain/referees/strictness";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
import { tierOfLeague } from "@/Domain/season/countryRollover";
import type { SaveService } from "@/backend/SaveService";
import type { StaffNameBook } from "@/Domain/staff/staffOrigin";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { EngineReferee, MatchReferee, Referee, RefereeAssignment, RefereeBand, RefereePool, RefereeState } from "@/types/refereeTypes";

const COUNTRIES = countriesRaw as Record<string, { continent?: string }>;
const continentOf = (country: string) => COUNTRIES[country]?.continent;
const REAL_FILE = fileURLToPath(new URL("../Data/referees.json", import.meta.url));

let realCache: RealReferee[] | null = null;
/** Real referees of the main-league countries (`src/Data/referees.json`); missing file = none. */
export function loadRealReferees(): RealReferee[] {
  if (realCache) return realCache;
  try {
    realCache = existsSync(REAL_FILE) ? (JSON.parse(readFileSync(REAL_FILE, "utf8")) as RealReferee[]) : [];
  } catch {
    realCache = [];
  }
  return realCache;
}

async function catalogAndPyramids() {
  const { getLeagueData, getPyramids } = await import("@/backend/advanceDay");
  return { catalog: await getLeagueData(), pyramids: await getPyramids() };
}

/** Matches per round of every country (sum of ⌊clubs / 2⌋ of its leagues, by the save's squad index). */
export async function matchesPerRoundByCountry(service: SaveService, saveId: string): Promise<Map<string, number>> {
  const { catalog } = await catalogAndPyramids();
  const index = await service.getSquadIndex(saveId);
  const out = new Map<string, number>();
  for (const l of catalog) {
    const clubs = index.inLeague(l.slug).length;
    if (clubs < 2 || !l.country) continue;
    out.set(l.country, (out.get(l.country) ?? 0) + Math.floor(clubs / 2));
  }
  return out;
}

async function nameBook(): Promise<StaffNameBook | undefined> {
  try {
    const { getStaffNameBook } = await import("@/backend/staffNameBook");
    return await getStaffNameBook();
  } catch {
    return undefined;
  }
}

/** The world pool of a new career (every country with a league), written with an empty state. */
export async function createRefereePool(service: SaveService, saveId: string, date: string): Promise<RefereePool> {
  const perRound = await matchesPerRoundByCountry(service, saveId);
  const real = loadRealReferees();
  const book = await nameBook();
  const referees: Referee[] = [];
  const renewed: Record<string, string> = {};
  for (const country of [...perRound.keys()].sort()) {
    referees.push(...buildCountryPool({ country, real, matchesPerRound: perRound.get(country)!, book, saveId, date }));
    renewed[country] = date;
  }
  const pool = { referees, renewed };
  await service.writeRefereePool(saveId, pool);
  await service.writeRefereeState(saveId, emptyRefereeState());
  return pool;
}

const rankOf = (rows: { squadId: string; pts: number; gd: number; gf: number }[] | null) => {
  const sorted = [...(rows ?? [])].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.squadId.localeCompare(b.squadId));
  return new Map(sorted.map((r, i) => [r.squadId, { pos: i + 1, n: sorted.length }]));
};

/** The day's first-team matches with their importance (youth competitions never get a referee). */
async function dayMatches(service: SaveService, saveId: string, date: string): Promise<DayMatch[]> {
  const fixtures = (await service.getFixturesForDate(saveId, date)).filter((f) => !isYouthCompSlug(f.competition));
  if (fixtures.length === 0) return [];
  const { catalog, pyramids } = await catalogAndPyramids();
  const meta = await service.getMeta(saveId);
  const states = new Map((meta?.activeLeagues ?? []).map((l) => [l.leagueSlug, l]));
  const countryOfLeague = new Map(catalog.map((l) => [l.slug, l.country]));
  const comps = [...new Set(fixtures.map((f) => f.competition))];
  const metas = new Map<string, LeagueSeasonMeta | null>();
  const ranks = new Map<string, ReturnType<typeof rankOf>>();
  await Promise.all(comps.map(async (c) => {
    if (isCupSlug(c) || isContinentalSlug(c)) metas.set(c, await service.getLeagueMeta(saveId, c));
    else ranks.set(c, rankOf(await service.getLeagueStandings(saveId, c)));
  }));
  const out: DayMatch[] = [];
  for (const f of fixtures) {
    const key = fixtureKey(f.competition, f.id);
    const base = { key, competition: f.competition, home: f.home, away: f.away };
    if (isContinentalSlug(f.competition)) {
      const cm = metas.get(f.competition)?.continental;
      const stageIndex = Math.max(0, cm?.stages.findIndex((s) => s.rounds.includes(f.round)) ?? 0);
      out.push({ ...base, importance: matchImportance({ kind: "continental", stageIndex }), country: null,
        continent: cm?.continent, clubCountries: [cm?.countryOf[f.home] ?? null, cm?.countryOf[f.away] ?? null] });
      continue;
    }
    if (isCupSlug(f.competition)) {
      const cup = metas.get(f.competition)?.cup;
      if (!cup) continue;
      const stageIndex = Math.max(0, cup.stages.findIndex((s) => s.round === f.round));
      const topTier = Math.min(cup.tiers[f.home] ?? 3, cup.tiers[f.away] ?? 3);
      out.push({ ...base, importance: matchImportance({ kind: "cup", stageIndex, stageCount: cup.stages.length, topTier }), country: cup.country });
      continue;
    }
    const country = countryOfLeague.get(f.competition);
    if (!country) continue;
    const pyramid = pyramids[country];
    const tier = (pyramid && tierOfLeague(pyramid, f.competition)) ?? 1;
    const rank = ranks.get(f.competition);
    const half = (id: string) => { const r = rank?.get(id); return !!r && r.n > 0 && r.pos <= r.n / 2; };
    const st = states.get(f.competition);
    const lateSeason = !!st && date >= addDays(st.end, -Math.round((Date.parse(st.end) - Date.parse(st.start)) / 86_400_000 / 5));
    const imp: ImportanceInput = { kind: "league", tier, bothTopHalf: half(f.home) && half(f.away), derby: false, lateSeason };
    out.push({ ...base, importance: matchImportance(imp), country });
  }
  return out;
}

/**
 * Appointments of `date`, computed once and kept in `state.json` (the advance and the live match read the same).
 * No pool (older save) = none.
 */
export async function ensureAssignments(service: SaveService, saveId: string, date: string): Promise<Record<string, RefereeAssignment>> {
  const pool = await service.getRefereePool(saveId);
  if (!pool) return {};
  const state = (await service.getRefereeState(saveId)) ?? emptyRefereeState();
  const have = state.assignments[date];
  if (have) return have;
  const matches = await dayMatches(service, saveId, date);
  const assigned = assignDay({ saveId, date, matches, referees: pool.referees, state, continentOf });
  const next = pruneRefereeState({ ...state, assignments: { ...state.assignments, [date]: assigned } }, date);
  await service.writeRefereeState(saveId, next);
  return assigned;
}

export interface FixtureOfficials { referee: Referee; assistants: Referee[] }

/** The officials of a fixture on `date` (after `ensureAssignments`), or null. */
export async function officialsFor(service: SaveService, saveId: string, date: string, fixture: Pick<Fixture, "competition" | "id">): Promise<FixtureOfficials | null> {
  const [pool, state] = await Promise.all([service.getRefereePool(saveId), service.getRefereeState(saveId)]);
  const a = state?.assignments[date]?.[fixtureKey(fixture.competition, fixture.id)];
  if (!pool || !a) return null;
  const byId = new Map(pool.referees.map((r) => [r.id, r]));
  const referee = byId.get(a.refereeId);
  if (!referee) return null;
  return { referee, assistants: a.assistantIds.map((id) => byId.get(id)).filter((r): r is Referee => !!r) };
}

export const engineReferee = (r: Referee): EngineReferee => ({ id: r.id, name: r.name, country: r.country, strictness: r.strictness });
export const matchReferee = (r: Referee): MatchReferee => ({ id: r.id, name: r.name, country: r.country });

/** Adds the day's logged matches to the season stats (idempotent per fixture). */
export async function recordRefereeDay(service: SaveService, saveId: string, date: string, events: readonly MatchEvent[]): Promise<void> {
  if (!events.some((e) => e.referee)) return;
  const state = (await service.getRefereeState(saveId)) ?? emptyRefereeState();
  await service.writeRefereeState(saveId, recordMatches(state, date, events));
}

export const refereeSeasonKey = (country: string, season: string) => `${countrySlug(country)}-${season}`;

/**
 * Season rollover of a country: its referees' stats go to the archive, the pool is renewed (retirements, quality,
 * refill). Idempotent: a country already renewed on `date` is skipped.
 */
export async function rolloverReferees(service: SaveService, saveId: string, country: string, date: string, season: string): Promise<void> {
  const pool = await service.getRefereePool(saveId);
  if (!pool || pool.renewed[country] === date) return;
  const state = (await service.getRefereeState(saveId)) ?? emptyRefereeState();
  const ofCountry = pool.referees.filter((r) => r.country === country);
  const { state: rest, archived } = closeCountrySeason(state, new Set(ofCountry.map((r) => r.id)));
  if (Object.keys(archived).length > 0) {
    const referees = Object.fromEntries(ofCountry.filter((r) => archived[r.id]).map((r) => [r.id, {
      name: r.name, country: r.country, strictness: r.strictness, fifa: r.fifa, gender: r.gender, birthDate: r.birthDate,
    }]));
    await service.writeRefereeSeason(saveId, refereeSeasonKey(country, season), { country, season, stats: archived, referees });
  }
  const perRound = (await matchesPerRoundByCountry(service, saveId)).get(country) ?? 0;
  const { pool: next } = renewCountryPool(pool, { country, date, saveId, matchesPerRound: perRound, book: await nameBook() });
  await service.writeRefereePool(saveId, next);
  await service.writeRefereeState(saveId, rest);
}

/** What the screens show of a referee (never the raw rigor). */
export interface RefereeView {
  id: string; name: string; country: string; gender: "male" | "female"; age: number; band: RefereeBand; fifa: boolean;
  season?: { matches: number; yellowsPerMatch: number; foulsPerMatch: number };
}

export function refereeView(r: Referee, date: string, state?: RefereeState | null): RefereeView {
  const s = state?.stats[r.id];
  return {
    id: r.id, name: r.name, country: r.country, gender: r.gender, age: ageOn(r.birthDate, date), band: strictnessBand(r.strictness), fifa: r.fifa,
    ...(s && s.matches > 0 ? { season: { matches: s.matches, yellowsPerMatch: Math.round((s.yellows / s.matches) * 100) / 100, foulsPerMatch: Math.round((s.fouls / s.matches) * 100) / 100 } } : {}),
  };
}

/** Tomorrow's appointments too, so the match preview opened on the eve reads the same. */
export async function ensureTomorrow(service: SaveService, saveId: string, date: string): Promise<void> {
  await ensureAssignments(service, saveId, addOneDay(date));
}
