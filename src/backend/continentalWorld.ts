/**
 * Continental competitions (Champions League / Europa League / Libertadores / Sul-Americana) —
 * save I/O. Pure logic lives in src/Domain/continental/. A competition lives in
 * leagues/{ucl|uel|lib|sud}/ like a league (meta, rounds, date-index; no standings) and is NOT
 * part of meta.activeLeagues. Mirrors src/backend/cupWorld.ts.
 */
import { fileURLToPath } from "node:url";
import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import { leagueBusyDates } from "@/backend/cupWorld";
import type { LeagueDataEntry } from "@/backend/advanceDay";
import type { ContinentalSlug, Fixture, LeagueCalendarResult, LeagueSeasonMeta } from "@/types/calendarTypes";
import type { Pyramids } from "@/types/pyramidTypes";
import type { LeagueZone, RosterPlayer, Squad } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";
import { LEAGUE_SCHEDULE_CONFIGS } from "@/Domain/season/leagueScheduleConfig";
import { autoLineupDefaultFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { teamLevel, teamStrength } from "@/Domain/advanceDay/quickSim";
import { CONTINENTAL, competitionsOf, isContinentalSlug } from "@/Domain/continental/competitions";
import { allocateSlots, type CountrySlotInput } from "@/Domain/continental/slots";
import { pickQualifiers } from "@/Domain/continental/qualify";
import { continentalDates } from "@/Domain/continental/continentalDates";
import { generateContinental } from "@/Domain/continental/generateContinental";
import type { DrawClub } from "@/Domain/continental/groupDraw";
import { advanceContinental, type ContinentalEvent } from "@/Domain/continental/continentalProgress";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import { logError } from "@/Logger";

const DATA_DIR = fileURLToPath(new URL("../Data", import.meta.url));
const DAY_MS = 86_400_000;

let _countriesCache: Record<string, CountryEntry> | null = null;

/** World countries catalog (continent, iso2, ...), keyed by leagueData `country` name. */
async function getCountries(): Promise<Record<string, CountryEntry>> {
  if (_countriesCache) return _countriesCache;
  const file = Bun.file(`${DATA_DIR}/countries.json`);
  _countriesCache = (await file.exists()) ? ((await file.json()) as Record<string, CountryEntry>) : {};
  return _countriesCache;
}

/** Countries of a continent (from the world countries catalog) that have a league in leagueData. */
async function countriesOfContinent(
  continent: "Europe" | "South America",
  catalog: LeagueDataEntry[],
): Promise<string[]> {
  const countries = await getCountries();
  const withLeague = new Set(catalog.filter((l) => l.country).map((l) => l.country!));
  return Object.values(countries)
    .filter((c) => c.continent === continent && withLeague.has(c.name))
    .map((c) => c.name)
    .sort();
}

/** A leagueData entry the way it actually comes off disk — `LeagueDataEntry` omits `zones`. */
type CatalogLeague = LeagueDataEntry & { zones?: LeagueZone[] };

/**
 * The country's tier-1 league: the top level of its pyramid when it has one (its single top-level
 * group), else its only league in the catalog. Null only when the country has no league at all
 * (should not happen for a country returned by `countriesOfContinent`).
 */
export function topLeagueOf(country: string, catalog: LeagueDataEntry[], pyramids: Pyramids): string | null {
  const pyramid = pyramids[country];
  if (pyramid && pyramid.levels.length > 0) {
    const topTier = Math.min(...pyramid.levels.map((l) => l.tier));
    const league = pyramid.levels.find((l) => l.tier === topTier)?.groups[0]?.leagueSlug;
    if (league) return league;
  }
  return catalog.find((l) => l.country === country)?.slug ?? null;
}

/**
 * A club's strength: quickSim `teamLevel` of its default-4-3-3 auto-filled XI, in slot order (so
 * `teamStrength`'s role-group weighting lines up with each player's actual slot role). This is the
 * one unit continental competitions use throughout: country coefficient, qualifying ranking
 * fallback, and group-draw pots.
 */
export function clubLevel(squad: Squad): number {
  const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
  const roles = slotRoles(formation);
  const byId = new Map(squad.players.map((p) => [p.id, p]));
  const xi = autoLineupDefaultFormation(squad)
    .map((id) => byId.get(id))
    .filter((p): p is RosterPlayer => p !== undefined);
  return teamLevel(teamStrength(xi, roles));
}

/** Inclusive span of a `LeagueZone` (`to`/`fromEnd` aware, but continental zones always use `to`). */
function zoneSpan(zones: LeagueZone[] | undefined, id: string): number {
  const zone = zones?.find((z) => z.id === id);
  if (!zone || zone.from === undefined) return 0;
  return (zone.to ?? zone.from) - zone.from + 1;
}

/**
 * Fixed places from the league's leagueData zones — undefined when the league has no zone for this
 * continent's primary competition (the country then competes for places by coefficient instead).
 */
function zoneSlotsOf(
  continent: "Europe" | "South America",
  zones: LeagueZone[] | undefined,
): { primary: number; secondary: number } | undefined {
  const primary = zoneSpan(zones, continent === "Europe" ? "ucl" : "lib");
  if (primary === 0) return undefined;
  const secondary =
    continent === "Europe" ? zoneSpan(zones, "uel") + zoneSpan(zones, "uecl") : zoneSpan(zones, "sud");
  return { primary, secondary };
}

/** `d` plus the day before and the day after it, as "YYYY-MM-DD" strings. */
function withNeighbours(d: string): string[] {
  const ms = Date.parse(`${d}T00:00:00Z`);
  return [
    new Date(ms - DAY_MS).toISOString().slice(0, 10),
    d,
    new Date(ms + DAY_MS).toISOString().slice(0, 10),
  ];
}

/** A continental fixture can never land the day before, the day of, or the day after any date in `dates`. */
function expandBusy(dates: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const d of dates) for (const n of withNeighbours(d)) out.add(n);
  return out;
}

/** Everything computed once per country's tier-1 league, reused across slots/ranking/pots. */
interface CountryTier1 {
  country: string;
  league: string;
  /** Whether the league's season crosses the calendar year (e.g. "2026-27"), not a single year. */
  crossYear: boolean;
  clubs: string[];
  levels: Map<string, number>;
  coefficient: number;
  zoneSlots?: { primary: number; secondary: number };
}

/**
 * `clubLevel(squad)`, cached per squad id in `cache` — every squad in a continent's tier-1 leagues
 * belongs to exactly one country, so nothing is actually re-fetched today, but this keeps it that
 * way even if a future caller (e.g. re-ranking a second time) ends up asking for the same club
 * twice within one `createContinentalSeason` call.
 */
async function clubLevelCached(
  service: SaveService,
  saveId: string,
  squadId: string,
  cache: Map<string, number>,
): Promise<number> {
  const cached = cache.get(squadId);
  if (cached !== undefined) return cached;
  const squad = await service.getSquadById(saveId, squadId);
  const level = squad ? clubLevel(squad) : 0;
  cache.set(squadId, level);
  return level;
}

async function tier1Info(
  service: SaveService,
  saveId: string,
  country: string,
  catalog: CatalogLeague[],
  pyramids: Pyramids,
  index: SquadIndex,
  continent: "Europe" | "South America",
  levelCache: Map<string, number>,
): Promise<CountryTier1 | null> {
  const league = topLeagueOf(country, catalog, pyramids);
  if (!league) return null;
  const clubs = index.inLeague(league).map((t) => t.squadId);
  if (clubs.length === 0) return null;

  const levels = new Map<string, number>();
  await Promise.all(
    clubs.map(async (id) => {
      levels.set(id, await clubLevelCached(service, saveId, id, levelCache));
    }),
  );
  const coefficient = [...levels.values()].reduce((a, b) => a + b, 0) / levels.size;
  const crossYear = LEAGUE_SCHEDULE_CONFIGS.find((c) => c.slug === league)?.crossYear ?? false;
  const zoneSlots = zoneSlotsOf(continent, catalog.find((l) => l.slug === league)?.zones);

  return { country, league, crossYear, clubs, levels, coefficient, zoneSlots };
}

/**
 * A country's qualifying order: the previous season's final table (clubs no longer in the league
 * dropped, clubs newly in it — e.g. promoted — appended by level, since they have no prior
 * position here) when an archive exists; otherwise (first career season) squad strength (`level`)
 * descending.
 */
async function rankingOf(
  service: SaveService,
  saveId: string,
  t: CountryTier1,
  prevYear: number,
): Promise<string[]> {
  const byLevelDesc = (a: string, b: string) =>
    (t.levels.get(b) ?? 0) - (t.levels.get(a) ?? 0) || a.localeCompare(b, undefined, { numeric: true });

  const archive = await service.readLeagueSeasonArchive(saveId, t.league, prevYear);
  if (!archive || archive.standings.length === 0) return [...t.clubs].sort(byLevelDesc);

  const known = new Set(t.clubs);
  const fromArchive = archive.standings.map((s) => s.squadId).filter((id) => known.has(id));
  const seen = new Set(fromArchive);
  const rest = t.clubs.filter((id) => !seen.has(id)).sort(byLevelDesc);
  return [...fromArchive, ...rest];
}

/**
 * The season year a continent's competitions should use, from the world's already-generated
 * league states: the earliest year among the continent's "season-defining" tier-1 leagues (Europe:
 * only the ones whose season crosses the calendar year; South America: all of them, since every
 * top-flight league there is calendar-year). Null when none of the continent's countries has a
 * season-defining league yet (should not happen once `activeLeagues` covers the world).
 */
export async function seasonDefiningYear(
  continent: "Europe" | "South America",
  activeLeagues: { leagueSlug: string; year: number }[],
  catalog: LeagueDataEntry[],
): Promise<number | null> {
  const countryOf = new Map(catalog.filter((l) => l.country).map((l) => [l.slug, l.country!]));
  const countries = await getCountries();
  const relevant = activeLeagues.filter((l) => {
    const country = countryOf.get(l.leagueSlug);
    if (!country || countries[country]?.continent !== continent) return false;
    if (continent === "Europe") return LEAGUE_SCHEDULE_CONFIGS.find((c) => c.slug === l.leagueSlug)?.crossYear ?? false;
    return true;
  });
  return relevant.length > 0 ? Math.min(...relevant.map((l) => l.year)) : null;
}

/** Write a generated continental season (meta, every round file, date index) — same shape as a cup. */
async function writeContinental(service: SaveService, saveId: string, r: LeagueCalendarResult): Promise<void> {
  await service.writeLeagueMeta(saveId, r.meta);
  for (const round of r.rounds) await service.writeRound(saveId, r.meta.leagueSlug, round.round, round);
  await service.writeDateIndex(saveId, r.meta.leagueSlug, r.dateIndex);
}

export interface ContinentalCompetitionResult {
  slug: ContinentalSlug;
  meta: LeagueSeasonMeta;
  /** Club → group name, for the Plan 3 inbox draw message. */
  groupOf: Record<string, string>;
}

/**
 * Generates and writes one continent's two competitions (primary + secondary — e.g. UCL + UEL) for
 * a season: coefficients from `clubLevel`, places from `allocateSlots`, qualifiers from
 * `pickQualifiers`, a shared busy-dates set for `continentalDates`, then `generateContinental` for
 * each competition. Throws (caller's try/catch per continent) when either competition doesn't come
 * out to exactly 32 clubs, or when the continent has no country with a tier-1 league to work with.
 */
export async function createContinentalSeason(args: {
  service: SaveService;
  saveId: string;
  continent: "Europe" | "South America";
  year: number;
  index: SquadIndex;
  catalog: LeagueDataEntry[];
  pyramids: Pyramids;
}): Promise<{ primary: ContinentalCompetitionResult; secondary: ContinentalCompetitionResult }> {
  const { service, saveId, continent, year, index, catalog, pyramids } = args;
  const catalogList = catalog as CatalogLeague[];
  const levelCache = new Map<string, number>();

  const countries = await countriesOfContinent(continent, catalog);
  const infos = (
    await Promise.all(
      countries.map((c) => tier1Info(service, saveId, c, catalogList, pyramids, index, continent, levelCache)),
    )
  ).filter((t): t is CountryTier1 => t !== null);
  if (infos.length === 0) {
    throw new Error(`createContinentalSeason: no country with a tier-1 league for ${continent}`);
  }

  const slotInputs: CountrySlotInput[] = infos.map((t) => ({
    country: t.country,
    coefficient: t.coefficient,
    clubs: t.clubs.length,
    zoneSlots: t.zoneSlots,
  }));
  const slots = allocateSlots(continent, slotInputs);

  const rankingByCountry: Record<string, string[]> = {};
  for (const t of infos) rankingByCountry[t.country] = await rankingOf(service, saveId, t, year - 1);

  const { primary, secondary } = pickQualifiers(slots, rankingByCountry);
  if (primary.length !== 32 || secondary.length !== 32) {
    throw new Error(
      `createContinentalSeason: ${continent} needs exactly 32+32 qualifiers, got ${primary.length}+${secondary.length}`,
    );
  }

  const countryOfClub = new Map<string, string>();
  const levelOfClub = new Map<string, number>();
  for (const t of infos) {
    for (const id of t.clubs) {
      countryOfClub.set(id, t.country);
      levelOfClub.set(id, t.levels.get(id)!);
    }
  }

  const [primaryComp, secondaryComp] = competitionsOf(continent);
  const primarySlug = primaryComp!.slug;
  const secondarySlug = secondaryComp!.slug;

  // Season-defining tier-1 leagues decide the window's `end` (continentalDates.ts).
  const seasonDefining = continent === "Europe" ? infos.filter((t) => t.crossYear) : infos;
  const endDates = (
    await Promise.all(seasonDefining.map((t) => service.getLeagueMeta(saveId, t.league)))
  )
    .filter((m): m is LeagueSeasonMeta => m !== null)
    .map((m) => m.end);
  if (endDates.length === 0) {
    throw new Error(`createContinentalSeason: no season-defining league found for ${continent}`);
  }
  const end = [...endDates].sort().at(-1)!;

  // Two-tier busy dates, the same set feeding both competitions' `continentalDates` call (a club is
  // never in both, but they can share a country's domestic calendar):
  //
  // - `hardBusy`: the EXACT dates of every involved country's league and national cup fixtures
  //   (including every cup stage not yet drawn — `leagueBusyDates` reads the cup's date-index, which
  //   `generateCup` populates for every stage up front, drawn or not). A continental pick may never
  //   land on one of these — same-day double-booking a participant club must be impossible, not just
  //   unlikely. Libertadores plays Tuesday specifically so this never structurally collides with
  //   every country's cup, which always plays a fixed Wednesday (`cupDates.ts`'s `WEDNESDAY`) — see
  //   `competitions.ts`'s comment on `CONTINENTAL.lib`.
  // - `busy` (soft): `hardBusy` expanded ±1 day. Only ever avoided when possible — `continentalDates`
  //   accepts a soft clash once the whole window has been searched and no fully clash-free day
  //   exists, which real-world data does force sometimes (a handful of countries' domestic calendars
  //   already rotate through 2-3 weekdays; see `continentalDates.ts`'s option comment).
  const involvedCountries = new Set([...primary, ...secondary].map((id) => countryOfClub.get(id)!));
  const byCountry = new Map(infos.map((t) => [t.country, t]));
  const busyLeagues = [...involvedCountries].flatMap((c) => {
    const t = byCountry.get(c)!;
    return [t.league, cupSlugOf(c)];
  });
  const hardBusy = await leagueBusyDates(service, saveId, busyLeagues);
  const busy = expandBusy(hardBusy);

  const primaryDates = continentalDates(continent, year, end, CONTINENTAL[primarySlug].weekday, busy, hardBusy);
  const secondaryDates = continentalDates(continent, year, end, CONTINENTAL[secondarySlug].weekday, busy, hardBusy);

  // Should never happen (see the comment above) — `continentalDates` only ever lands on a hardBusy
  // date as its own last resort once every avoidance search has failed. Surface it loudly rather
  // than let a same-day double-booking pass silently.
  for (const [slug, dates] of [[primarySlug, primaryDates], [secondarySlug, secondaryDates]] as const) {
    const violations = dates.filter((d) => hardBusy.has(d));
    if (violations.length > 0) {
      logError(
        "continental",
        `save ${saveId}: ${slug} (${continent}, ${year}) has ${violations.length} date(s) with an ` +
          `unavoidable same-day domestic-fixture clash: ${violations.join(", ")}`,
      );
    }
  }

  const drawClubsFor = (ids: string[]): DrawClub[] =>
    ids.map((id) => ({ id, country: countryOfClub.get(id)!, level: levelOfClub.get(id)! }));

  const primaryResult = generateContinental({
    slug: primarySlug,
    year,
    clubs: drawClubsFor(primary),
    dates: primaryDates,
    seedKey: `${saveId}:${year}:${primarySlug}`,
  });
  const secondaryResult = generateContinental({
    slug: secondarySlug,
    year,
    clubs: drawClubsFor(secondary),
    dates: secondaryDates,
    seedKey: `${saveId}:${year}:${secondarySlug}`,
  });

  await writeContinental(service, saveId, primaryResult);
  await writeContinental(service, saveId, secondaryResult);

  const groupOfFrom = (r: LeagueCalendarResult): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const g of r.meta.continental!.groups) for (const club of g.clubs) out[club] = g.name;
    return out;
  };

  return {
    primary: { slug: primarySlug, meta: primaryResult.meta, groupOf: groupOfFrom(primaryResult) },
    secondary: { slug: secondarySlug, meta: secondaryResult.meta, groupOf: groupOfFrom(secondaryResult) },
  };
}

/**
 * After a day's continental fixtures are written: advances every continental competition with
 * rounds played today (group tables → r16 draw, leg1 → aggregate, leg2 → next draw/champion — see
 * `advanceContinental`). Returns what changed, for the Plan 3 inbox. An `undecidedTie` event (a
 * two-legged tie or the final level with no penalty winner recorded) is logged as an error, mirroring
 * `advanceCupStages`'s handling of the same situation for national cups.
 */
export async function advanceContinentalStages(
  service: SaveService,
  saveId: string,
  playedRounds: Map<string, number[]>,
): Promise<Array<{ slug: string; events: ContinentalEvent[] }>> {
  const changes: Array<{ slug: string; events: ContinentalEvent[] }> = [];
  for (const [slug, roundsUnsorted] of playedRounds) {
    if (!isContinentalSlug(slug)) continue;
    let meta = await service.getLeagueMeta(saveId, slug);
    if (!meta?.continental) continue;

    const rounds = [...roundsUnsorted].sort((a, b) => a - b);
    for (const round of rounds) {
      // advanceContinental may read any round of the competition depending on which stage just
      // completed; loading every stage's rounds up front keeps this branch-agnostic and is cheap
      // (13 small files).
      const roundsById = new Map<number, Fixture[]>();
      for (const stage of meta.continental!.stages) {
        for (const r of stage.rounds) {
          if (roundsById.has(r)) continue;
          const rf = await service.getRound(saveId, slug, r);
          roundsById.set(r, rf?.fixtures ?? []);
        }
      }

      const seedKey = `${saveId}:${meta.year}:${slug}`;
      const result = advanceContinental(meta, roundsById, round, seedKey);
      if (!result) continue;

      meta = result.meta;
      for (const w of result.writes) await service.writeRound(saveId, slug, w.round, w);
      await service.writeLeagueMeta(saveId, meta);

      for (const ev of result.events) {
        if (ev.kind === "undecidedTie") {
          logError("continental", `save ${saveId}: ${slug} tie ${ev.tieId} finished level with no penalty winner`);
        }
      }
      changes.push({ slug, events: result.events });
    }
  }
  return changes;
}
