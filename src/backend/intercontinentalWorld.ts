/**
 * Intercontinental Cup — save I/O (`.claude/rules/game/intercontinental.md`). Pure logic in
 * src/Domain/intercontinental/. The cup lives in leagues/icc/ like a national cup (meta, rounds, date-index; no
 * standings) and is NOT part of meta.activeLeagues. One edition a year, generated the first day of December.
 */
import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { LeagueDataEntry } from "@/backend/advanceDay";
import type { Pyramids } from "@/types/pyramidTypes";
import type {
  Fixture, IccConfed, IccEntrant, IccMatch, IntercontinentalMetaData, LeagueSeasonMeta, LeagueSeasonState,
} from "@/types/calendarTypes";
import { clubLevel, topLeagueOf } from "@/backend/continentalWorld";
import { CONTINENTAL_SLUGS } from "@/Domain/continental/competitions";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import { fixtureWinner } from "@/Domain/cups/cupProgress";
import { confedOfCountry, countryBlockedDays } from "@/Domain/national/fifaCalendar";
import { addDays } from "@/Domain/dates";
import { ICC, ICC_SLUG } from "@/Domain/intercontinental/iccConfig";
import { pickIccEntrants, type IccContinentalCandidate, type IccLeagueCandidate } from "@/Domain/intercontinental/entrants";
import { iccDates } from "@/Domain/intercontinental/iccDates";
import { buildIccArchive, generateIcc } from "@/Domain/intercontinental/generateIcc";
import { stepBracket, iccFixture, type IccStep } from "@/Domain/intercontinental/bracket";

export { ICC_SLUG };

export function isIccSlug(slug: string): boolean {
  return slug === ICC_SLUG;
}

/** A continental competition's final order for the season `year`: [champion, runner-up] when known. */
async function continentalOrder(service: SaveService, saveId: string, slug: "ucl" | "lib", year: number): Promise<string[]> {
  const meta = await service.getLeagueMeta(saveId, slug);
  const cont = meta?.continental;
  if (meta && cont && meta.year === year) {
    if (!cont.championId) return [];
    const final = cont.stages.find((s) => s.name === "final");
    const round = final?.rounds[0] !== undefined ? await service.getRound(saveId, slug, final.rounds[0]) : null;
    const f = round?.fixtures.find((x) => x.home === cont.championId || x.away === cont.championId);
    const runnerUp = f ? (f.home === cont.championId ? f.away : f.home) : null;
    return runnerUp ? [cont.championId, runnerUp] : [cont.championId];
  }
  const archive = await service.readLeagueSeasonArchive(saveId, slug, year);
  const champ = archive?.titles[0]?.clubId;
  return champ ? [champ] : [];
}

/** The six entrants of the edition of `year` (December of that year). */
export async function iccEntrantsFor(args: {
  service: SaveService;
  saveId: string;
  year: number;
  index: SquadIndex;
  catalog: LeagueDataEntry[];
  pyramids: Pyramids;
  activeLeagues: Pick<LeagueSeasonState, "leagueSlug" | "year">[];
}): Promise<Record<IccConfed, IccEntrant>> {
  const { service, saveId, year, index } = args;
  // UEFA: the Champions League that ended in May of `year` (season year − 1); CONMEBOL: the Libertadores of `year`.
  const continental: IccContinentalCandidate[] = [
    { confed: "UEFA", competition: "ucl", order: await continentalOrder(service, saveId, "ucl", year - 1) },
    { confed: "CONMEBOL", competition: "lib", order: await continentalOrder(service, saveId, "lib", year) },
  ];
  const countries = [...new Set(args.catalog.map((l) => l.country).filter((c): c is string => !!c))].sort();
  const raw: Omit<IccLeagueCandidate, "coefficient">[] = [];
  for (const country of countries) {
    const confed = confedOfCountry(country);
    if (confed !== "AFC" && confed !== "CAF" && confed !== "CONCACAF" && confed !== "OFC") continue;
    const league = topLeagueOf(country, args.catalog, args.pyramids);
    if (!league) continue;
    const state = args.activeLeagues.find((l) => l.leagueSlug === league);
    const archive = state ? await service.readLeagueSeasonArchive(saveId, league, state.year - 1) : null;
    const table = archive?.standings.map((s) => s.squadId).filter((id) => !!index.byId(id)) ?? [];
    raw.push({ confed, league, table: table.length > 0 ? table : null });
  }
  // The coefficient (mean club level of the tier-1 league) only matters between leagues with a closed season.
  const leagues: IccLeagueCandidate[] = [];
  for (const r of raw) {
    const rivals = raw.filter((x) => x.confed === r.confed && x.table).length;
    let coefficient = 0;
    if (r.table && rivals > 1) {
      const levels: number[] = [];
      for (const t of index.inLeague(r.league)) {
        const sq = await service.getSquadById(saveId, t.squadId);
        if (sq) { try { levels.push(clubLevel(sq)); } catch { /* a broken squad does not stop the draw */ } }
      }
      coefficient = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
    }
    leagues.push({ ...r, coefficient });
  }
  return pickIccEntrants({ continental, leagues });
}

/** Days on which any of `clubIds` has an official match (league, national cup, continental) in [from, to]. */
async function clubBusyDates(
  service: SaveService, saveId: string, index: SquadIndex, catalog: LeagueDataEntry[], clubIds: string[], from: string, to: string,
): Promise<Set<string>> {
  const clubs = new Set(clubIds);
  const countryOf = new Map(catalog.map((l) => [l.slug, l.country]));
  const comps = new Set<string>(CONTINENTAL_SLUGS);
  for (const id of clubIds) {
    const league = index.byId(id)?.leagueSlug;
    if (!league) continue;
    comps.add(league);
    const country = countryOf.get(league);
    if (country) comps.add(cupSlugOf(country));
  }
  const out = new Set<string>();
  for (const slug of comps) {
    const di = await service.getDateIndex(saveId, slug);
    const rounds = new Set<number>();
    for (const [d, rs] of Object.entries(di ?? {})) if (d >= from && d <= to) for (const r of rs) rounds.add(r);
    for (const r of rounds) {
      for (const f of (await service.getRound(saveId, slug, r))?.fixtures ?? []) {
        if (f.date >= from && f.date <= to && (clubs.has(f.home) || clubs.has(f.away))) out.add(f.date);
      }
    }
  }
  return out;
}

export interface IccGenerated {
  meta: LeagueSeasonMeta;
  /** Matches decided by a bye at generation, and the first fixtures. */
  step: IccStep;
  /** Clubs in the cup. */
  clubs: string[];
}

/**
 * The edition of `date`'s year, when the day is in December and it does not exist yet: archives the previous one
 * (one title + its bracket), picks the entrants, the dates and writes meta, the five rounds and the date index.
 * Null when nothing was generated.
 */
export async function ensureIntercontinental(args: {
  service: SaveService;
  saveId: string;
  date: string;
  index: SquadIndex;
  catalog: LeagueDataEntry[];
  pyramids: Pyramids;
  activeLeagues: Pick<LeagueSeasonState, "leagueSlug" | "year">[];
}): Promise<IccGenerated | null> {
  const { service, saveId, date, index } = args;
  if (Number(date.slice(5, 7)) !== ICC.MONTH) return null;
  const year = Number(date.slice(0, 4));
  const old = await service.getLeagueMeta(saveId, ICC_SLUG);
  if (old?.intercontinental && old.year >= year) return null;
  let pastYears: number[] = [];
  if (old?.intercontinental) {
    const nameOf = (id: string) => ({ name: index.byId(id)?.name ?? id, coachId: null, coachName: "" });
    await service.writeLeagueSeasonArchive(saveId, buildIccArchive(old, nameOf, await service.getAllFixturesForLeague(saveId, ICC_SLUG)));
    pastYears = [...old.intercontinental.pastYears, old.year];
  }

  const entrants = await iccEntrantsFor({ ...args, year });
  const clubs = Object.values(entrants).map((e) => e.clubId).filter((c): c is string => !!c);
  const catalogCountry = new Map(args.catalog.map((l) => [l.slug, l.country]));
  const countryOf: Record<string, string> = {};
  for (const id of clubs) {
    const c = catalogCountry.get(index.byId(id)?.leagueSlug ?? "");
    if (c) countryOf[id] = c;
  }
  const to = `${year + 1}-01-31`;
  const busy = await clubBusyDates(service, saveId, index, args.catalog, clubs, addDays(date, 1), to);
  const blocked = new Set<string>();
  for (const c of new Set(Object.values(countryOf))) for (const d of countryBlockedDays(c, date, to)) blocked.add(d);
  const dates = iccDates({ after: date, busy, blocked });
  const g = generateIcc({ year, start: date, dates, entrants, countryOf, pastYears });
  await service.writeLeagueMeta(saveId, g.meta);
  for (const r of g.rounds) await service.writeRound(saveId, ICC_SLUG, r.round, r);
  await service.writeDateIndex(saveId, ICC_SLUG, g.dateIndex);
  return { meta: g.meta, step: g.step, clubs };
}

/**
 * After the day's games: the winners of the played matches settle them, the next fixtures are written and the
 * champion is set. Null when no Intercontinental Cup match was played today.
 */
export async function advanceIntercontinental(
  service: SaveService, saveId: string, playedRounds: number[] | undefined,
): Promise<{ step: IccStep; meta: LeagueSeasonMeta } | null> {
  if (!playedRounds || playedRounds.length === 0) return null;
  const meta = await service.getLeagueMeta(saveId, ICC_SLUG);
  const icc = meta?.intercontinental;
  if (!meta || !icc) return null;
  const winners: Partial<Record<number, string>> = {};
  for (const f of await service.getAllFixturesForLeague(saveId, ICC_SLUG)) {
    const w = fixtureWinner(f);
    if (w) winners[f.round] = w;
  }
  const step = stepBracket(icc.matches, icc.entrants, winners);
  for (const m of step.created) {
    await service.writeRound(saveId, ICC_SLUG, m.round, { leagueSlug: ICC_SLUG, round: m.round, fixtures: [iccFixture(icc.year, m)] });
  }
  const next: LeagueSeasonMeta = { ...meta, intercontinental: { ...icc, matches: step.matches, championId: step.championId } };
  await service.writeLeagueMeta(saveId, next);
  return { step, meta: next };
}

/** "icc" when the club is in the current edition, else null (mirrors `playerContinentalSlug`). */
export async function playerIntercontinentalSlug(service: SaveService, saveId: string, clubId: string | null | undefined): Promise<string | null> {
  if (!clubId) return null;
  const meta = await service.getLeagueMeta(saveId, ICC_SLUG);
  const e = meta?.intercontinental?.entrants;
  return e && Object.values(e).some((x) => x.clubId === clubId) ? ICC_SLUG : null;
}

/** `GET /api/saves/:saveId/intercontinental` (`.claude/rules/game/intercontinental.md`). */
export interface IntercontinentalView {
  /** Every edition on disk, oldest first (the current one last). */
  years:     number[];
  year:      number;
  meta:      IntercontinentalMetaData;
  /** The edition's fixtures (played or not), by match number (`round`). */
  fixtures:  Fixture[];
  /** squadId → club name, for every entrant. */
  names:     Record<string, string>;
  /** The six slots by confederation, with the club's name (null = bye). */
  entrants:  Record<IccConfed, IccEntrant & { name: string | null }>;
  /** The edition being played (true) or an archived one. */
  current:   boolean;
}

/** The view of one edition (`year` absent = the current one). Null when there is none (or no such year). */
export async function intercontinentalView(
  service: SaveService, saveId: string, index: SquadIndex, year?: number,
): Promise<IntercontinentalView | null> {
  const meta = await service.getLeagueMeta(saveId, ICC_SLUG);
  const cur = meta?.intercontinental;
  if (!meta || !cur) return null;
  const years = [...cur.pastYears, cur.year];
  let data: IntercontinentalMetaData;
  let fixtures: Fixture[];
  if (year === undefined || year === cur.year) {
    data = cur;
    fixtures = await service.getAllFixturesForLeague(saveId, ICC_SLUG);
  } else {
    if (!cur.pastYears.includes(year)) return null;
    const archive = await service.readLeagueSeasonArchive(saveId, ICC_SLUG, year);
    if (!archive?.intercontinental) return null;
    data = archive.intercontinental;
    fixtures = archive.calendar ?? [];
  }
  const names: Record<string, string> = {};
  const nameOf = (id: string | null): string | null => {
    if (!id) return null;
    names[id] ??= index.byId(id)?.name ?? id;
    return names[id]!;
  };
  for (const f of fixtures) { nameOf(f.home); nameOf(f.away); }
  const entrants = Object.fromEntries(
    (Object.entries(data.entrants) as [IccConfed, IccEntrant][]).map(([k, e]) => [k, { ...e, name: nameOf(e.clubId) }]),
  ) as IntercontinentalView["entrants"];
  return { years, year: data.year, meta: data, fixtures: fixtures.sort((a, b) => a.round - b.round), names, entrants, current: data.year === cur.year };
}

/** The match a club lost or won in `step` (helpers for the day's prizes and messages). */
export function iccMatchOf(meta: IntercontinentalMetaData, n: number): IccMatch | undefined {
  return meta.matches.find((m) => m.n === n);
}
