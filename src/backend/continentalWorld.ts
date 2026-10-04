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
import { CONTINENTAL, CONTINENTAL_SLUGS, competitionsOf, isContinentalSlug } from "@/Domain/continental/competitions";
import { allocateSlots, type CountrySlotInput } from "@/Domain/continental/slots";
import { pickQualifiers } from "@/Domain/continental/qualify";
import { continentalDates, type ParticipantDates } from "@/Domain/continental/continentalDates";
import { generateContinental } from "@/Domain/continental/generateContinental";
import type { DrawClub } from "@/Domain/continental/groupDraw";
import { advanceContinental, type ContinentalEvent, type ContinentalTier1LeagueState } from "@/Domain/continental/continentalProgress";
import { continentalClubStatusOf, type ContinentalClubStatus } from "@/Domain/continental/clubStatus";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import { logError } from "@/Logger";

const DATA_DIR = fileURLToPath(new URL("../Data", import.meta.url));

let _countriesCache: Record<string, CountryEntry> | null = null;

/** World countries catalog (continent, iso2, ...), keyed by leagueData `country` name. */
export async function getCountries(): Promise<Record<string, CountryEntry>> {
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
  // Never drop a missing id: `xi[i]` must line up with `roles[i]` (both slot-ordered), and
  // filtering out a hole would shift every later slot's role onto the wrong player.
  const xi: RosterPlayer[] = autoLineupDefaultFormation(squad).map((id) => {
    const p = byId.get(id);
    if (!p) throw new Error(`clubLevel: squad ${squad.id} — player ${id} from autoLineupDefaultFormation not found`);
    return p;
  });
  if (xi.length !== 11) {
    throw new Error(`clubLevel: squad ${squad.id} — expected an 11-player XI, got ${xi.length}`);
  }
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
 * Reads each competition's own `zoneIds` (`CONTINENTAL`) instead of hard-coding zone id strings
 * here, so a competition that ever needs an extra zone (or a renamed one) only changes the catalog.
 */
function zoneSlotsOf(
  continent: "Europe" | "South America",
  zones: LeagueZone[] | undefined,
): { primary: number; secondary: number } | undefined {
  const [primaryComp, secondaryComp] = competitionsOf(continent);
  const spanOf = (comp: typeof primaryComp) => comp!.zoneIds.reduce((sum, id) => sum + zoneSpan(zones, id), 0);
  const primary = spanOf(primaryComp);
  if (primary === 0) return undefined;
  return { primary, secondary: spanOf(secondaryComp) };
}

/** Everything computed once per country's tier-1 league, reused across slots/ranking/pots. */
export interface CountryTier1 {
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
 * twice within one `createContinentalSeason` call. `squadCache` (the squads `createSave` already
 * read into memory to copy into the save) is checked before falling back to `getSquadById`'s disk
 * read, so a fresh career never re-reads a squad file it just wrote.
 */
async function clubLevelCached(
  service: SaveService,
  saveId: string,
  squadId: string,
  cache: Map<string, number>,
  squadCache?: Map<string, Squad>,
): Promise<number> {
  const cached = cache.get(squadId);
  if (cached !== undefined) return cached;
  const squad = squadCache?.get(squadId) ?? (await service.getSquadById(saveId, squadId));
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
  squadCache: Map<string, Squad> | undefined,
): Promise<CountryTier1 | null> {
  const league = topLeagueOf(country, catalog, pyramids);
  if (!league) return null;
  const clubs = index.inLeague(league).map((t) => t.squadId);
  if (clubs.length === 0) return null;

  const levels = new Map<string, number>();
  await Promise.all(
    clubs.map(async (id) => {
      levels.set(id, await clubLevelCached(service, saveId, id, levelCache, squadCache));
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
export async function rankingOf(
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

export interface ContinentalQualification {
  slug: ContinentalSlug;
  group: string;
  /** The other 3 clubs in the group. */
  opponentIds: string[];
}

/**
 * Which of a continent's two freshly generated competitions (if either) a club is in this season,
 * and its group + group-mates — feeds the Plan 3 "qualified"/"group" inbox messages emitted right
 * after `createContinentalSeason` (career start, self-heal, and continent rollover). A club is
 * never in both the primary and secondary competition of the same continent (see qualify.ts), so
 * at most one of the two results matches.
 */
export function continentalQualificationOf(
  clubId: string,
  results: { primary: ContinentalCompetitionResult; secondary: ContinentalCompetitionResult },
): ContinentalQualification | null {
  for (const r of [results.primary, results.secondary]) {
    const group = r.groupOf[clubId];
    if (group === undefined) continue;
    const clubs = r.meta.continental?.groups.find((g) => g.name === group)?.clubs ?? [];
    return { slug: r.slug, group, opponentIds: clubs.filter((id) => id !== clubId) };
  }
  return null;
}

/**
 * Generates and writes one continent's two competitions (primary + secondary — e.g. UCL + UEL) for
 * a season: coefficients from `clubLevel`, places from `allocateSlots`, qualifiers from
 * `pickQualifiers`, per-competition participant fixture dates for `continentalDates`'s scheduler,
 * then `generateContinental` for each competition. Throws (caller's try/catch per continent) when
 * either competition doesn't come out to exactly 32 clubs, or when the continent has no country
 * with a tier-1 league to work with.
 */
export async function createContinentalSeason(args: {
  service: SaveService;
  saveId: string;
  continent: "Europe" | "South America";
  year: number;
  index: SquadIndex;
  catalog: LeagueDataEntry[];
  pyramids: Pyramids;
  /** Squads `createSave` already read into memory — avoids re-reading them via `getSquadById`. */
  squadCache?: Map<string, Squad>;
}): Promise<{ primary: ContinentalCompetitionResult; secondary: ContinentalCompetitionResult }> {
  const { service, saveId, continent, year, index, catalog, pyramids, squadCache } = args;
  const catalogList = catalog as CatalogLeague[];
  const levelCache = new Map<string, number>();

  const countries = await countriesOfContinent(continent, catalog);
  const infos = (
    await Promise.all(
      countries.map((c) =>
        tier1Info(service, saveId, c, catalogList, pyramids, index, continent, levelCache, squadCache),
      ),
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

  // Per-participant exact fixture dates (league + national cup, including every cup stage not yet
  // drawn — `leagueBusyDates` on the cup slug reads its date-index, which `generateCup` populates
  // for every stage up front) feed `continentalDates`' own dynamic-programming scheduler, which
  // derives same-day ("hard") and adjacent-day ("soft") clash counts from them directly. Each
  // competition gets ONLY ITS OWN 32 qualifiers here — not the continent's other competition, and
  // not every country in the continent — so a country with no club in, say, the Europa League
  // never influences the Champions League's schedule. Clubs of the same country share one
  // `leagueBusyDates` lookup (memoised in `countryDates`) rather than paying for it once per club.
  const byCountry = new Map(infos.map((t) => [t.country, t]));
  const countryDates = new Map<string, Set<string>>();
  const datesOfCountry = async (country: string): Promise<Set<string>> => {
    const cached = countryDates.get(country);
    if (cached) return cached;
    const t = byCountry.get(country)!;
    const dates = await leagueBusyDates(service, saveId, [t.league, cupSlugOf(country)]);
    countryDates.set(country, dates);
    return dates;
  };
  const participantsFor = async (ids: string[]): Promise<ParticipantDates[]> =>
    Promise.all(ids.map(async (id) => ({ id, dates: await datesOfCountry(countryOfClub.get(id)!) })));

  const primaryParticipants = await participantsFor(primary);
  const secondaryParticipants = await participantsFor(secondary);

  const primaryDates = continentalDates(continent, year, end, CONTINENTAL[primarySlug].weekday, primaryParticipants);
  const secondaryDates = continentalDates(
    continent,
    year,
    end,
    CONTINENTAL[secondarySlug].weekday,
    secondaryParticipants,
  );

  // Should never happen — `continentalDates`' HUGE same-day weight means it only ever lands on a
  // hard-busy date once no combination of hard-free days satisfies the competition's own minimum
  // gap. Surface it loudly rather than let a same-day double-booking pass silently.
  for (const [slug, dates, participants] of [
    [primarySlug, primaryDates, primaryParticipants],
    [secondarySlug, secondaryDates, secondaryParticipants],
  ] as const) {
    const hardDates = new Set(participants.flatMap((p) => [...p.dates]));
    const violations = dates.filter((d) => hardDates.has(d));
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
 * Logs (never reschedules) a same-day clash between a club's brand-new domestic round date and one
 * of its own European continental (UCL/UEL) fixture dates.
 *
 * Calendar-year European leagues (Belarus, Finland, Georgia, Iceland, Norway, Sweden — see
 * `.claude/rules/game/continental.md`) roll over on their own schedule (around December),
 * independently of the Europe-wide continental rollover (`continentsToRegenerate` only tracks
 * cross-year leagues). By the time one of these leagues writes its Y+1 calendar, UCL/UEL dates
 * for the European season already in progress were fixed with no knowledge of it — a brand-new
 * domestic round date can land on the same day as one of a participating club's own continental
 * fixtures. Rescheduling is deliberately not attempted: a league round date is shared by every
 * club in that league, while a continental clash concerns only the 1-2 clubs of the country that
 * actually play in Europe — moving the whole round to dodge one club's fixture would misalign
 * every other match in that round for no benefit. `leagueFixtures` is every league's brand-new
 * next-season fixtures from this same rollover (any league, any continent — a league with no
 * European continental participant simply never matches). Returns the number of clashes logged
 * (0 when none), so a caller can assert on it.
 */
export async function logEuropeanCalendarClashes(
  service: SaveService,
  saveId: string,
  leagueFixtures: Map<string, Fixture[]>,
): Promise<number> {
  const clubDates = new Map<string, { slug: ContinentalSlug; dates: Set<string> }[]>();
  for (const slug of CONTINENTAL_SLUGS) {
    if (CONTINENTAL[slug].continent !== "Europe") continue;
    const meta = await service.getLeagueMeta(saveId, slug);
    const cont = meta?.continental;
    if (!cont) continue;
    const dates = new Set(cont.stages.flatMap((s) => s.dates));
    for (const club of cont.groups.flatMap((g) => g.clubs)) {
      const list = clubDates.get(club) ?? [];
      list.push({ slug, dates });
      clubDates.set(club, list);
    }
  }
  if (clubDates.size === 0) return 0;

  let clashes = 0;
  for (const [leagueSlug, fixtures] of leagueFixtures) {
    for (const f of fixtures) {
      for (const club of [f.home, f.away]) {
        for (const { slug: contSlug, dates } of clubDates.get(club) ?? []) {
          if (!dates.has(f.date)) continue;
          clashes++;
          logError(
            "continental",
            `save ${saveId}: ${leagueSlug} round ${f.round} (${f.date}) for club ${club} clashes with a ${contSlug} fixture date`,
            { leagueSlug, continentalSlug: contSlug, squadId: club, date: f.date, fixtureId: f.id },
          );
        }
      }
    }
  }
  return clashes;
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

/**
 * One tier-1 league state (year + whether its season crosses the calendar year) per country of
 * both continents, from the world's already-generated league states — the input
 * `continentsToRegenerate` (`src/Domain/continental/continentalProgress.ts`) needs to decide when
 * a continent's UCL/UEL or Lib/Sud must roll over. A country whose tier-1 league has no matching
 * entry in `activeLeagues` (should not happen once the world is fully generated) is skipped rather
 * than guessed at.
 */
export async function continentalTier1LeagueStates(
  activeLeagues: { leagueSlug: string; year: number }[],
  catalog: LeagueDataEntry[],
  pyramids: Pyramids,
): Promise<ContinentalTier1LeagueState[]> {
  const out: ContinentalTier1LeagueState[] = [];
  const yearByLeague = new Map(activeLeagues.map((l) => [l.leagueSlug, l.year]));
  for (const continent of ["Europe", "South America"] as const) {
    for (const country of await countriesOfContinent(continent, catalog)) {
      const league = topLeagueOf(country, catalog as CatalogLeague[], pyramids);
      const year = league ? yearByLeague.get(league) : undefined;
      if (!league || year === undefined) continue;
      const crossYear = LEAGUE_SCHEDULE_CONFIGS.find((c) => c.slug === league)?.crossYear ?? false;
      out.push({ continent, year, crossYear });
    }
  }
  return out;
}

/**
 * The continental competition (ucl/uel/lib/sud) whose group stage this club belongs to this
 * season, or null when the club did not qualify for any of the 4. Group membership is fixed for
 * the season (`meta.continental.groups`) — a knockout-stage club is always a subset of some
 * group's clubs, so checking the groups alone is enough. Mirrors `playerCupSlug` (cupWorld.ts).
 */
export async function playerContinentalSlug(
  service: SaveService,
  saveId: string,
  clubId: string,
): Promise<ContinentalSlug | null> {
  for (const slug of CONTINENTAL_SLUGS) {
    const meta = await service.getLeagueMeta(saveId, slug);
    if (meta?.continental?.groups.some((g) => g.clubs.includes(clubId))) return slug;
  }
  return null;
}

/**
 * I/O wrapper around `continentalClubStatusOf` (pure, `src/Domain/continental/clubStatus.ts`):
 * finds the club's competition (if any), reads the r16 first-leg round when it's drawn, and
 * returns where the club actually stands right now. Used right after the season-start start-kit
 * decision (`applyRandomStartKit`), so the "qualified"/"group"/"draw"/"eliminated" inbox message
 * reflects what's really on disk instead of what `createSave` originally handed out.
 */
export async function continentalClubStatus(
  service: SaveService,
  saveId: string,
  clubId: string,
): Promise<{ slug: ContinentalSlug; status: ContinentalClubStatus } | null> {
  for (const slug of CONTINENTAL_SLUGS) {
    const meta = await service.getLeagueMeta(saveId, slug);
    const cont = meta?.continental;
    if (!cont) continue;
    if (!cont.groups.some((g) => g.clubs.includes(clubId))) continue;

    const r16 = cont.stages.find((s) => s.name === "r16");
    const r16FirstLegFixtures = r16?.drawn
      ? ((await service.getRound(saveId, slug, r16.rounds[0]!))?.fixtures ?? [])
      : [];
    const status = continentalClubStatusOf(cont, clubId, r16FirstLegFixtures);
    if (status) return { slug, status };
  }
  return null;
}

/**
 * Every club that reached a continental final (`good`) or won it (`title`, always a subset of
 * `good`) THIS SEASON, across all 4 competitions still on disk — read right before a country's
 * league season rolls over (`.claude/rules/AI-clubs/finance.md`, design spec §3 "IA"), so
 * `clubSeasonOutcome`'s `continental` param can feed `ClubSeasonOutcome.continentalGood` (both
 * finalists — followers/tier-step) and `continentalTitle` (champion only — ELITE-entry gate,
 * `nextFinancialTier`) separately. A competition's final only has entrants once its final stage is
 * drawn (`stages.find(final).drawn`); `championId` is only set once the final is actually played.
 *
 * KNOWN TIMING GAP: only sees finals already drawn AT THE MOMENT a country's league rolls over —
 * see the longer note on `clubSeasonOutcome` (seasonReaction.ts) for which leagues this actually
 * reaches in practice and why (Task 9 docs pass).
 */
export async function continentalGoodClubsThisSeason(
  service: SaveService,
  saveId: string,
): Promise<{ good: Set<string>; title: Set<string> }> {
  const good = new Set<string>();
  const title = new Set<string>();
  for (const slug of CONTINENTAL_SLUGS) {
    const meta = await service.getLeagueMeta(saveId, slug);
    const cont = meta?.continental;
    if (!cont) continue;
    const final = cont.stages.find((s) => s.name === "final");
    if (!final?.drawn) continue;
    const round = await service.getRound(saveId, slug, final.rounds[0]!);
    for (const f of round?.fixtures ?? []) {
      good.add(f.home);
      good.add(f.away);
    }
    if (cont.championId) {
      good.add(cont.championId);
      title.add(cont.championId);
    }
  }
  return { good, title };
}
